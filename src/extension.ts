import * as vscode from 'vscode';
import { baiduTranslate } from './baidu';
import { LANGUAGE_NAMES, PROVIDER_NAMES, ProviderId, TranslateResult } from './providers';
import { tencentTranslate } from './tencent';
import { TranslatorViewProvider } from './translatorView';
import { youdaoTranslate } from './youdao';

const CACHE_LIMIT = 200;

type Caller = (q: string, from: string, to: string) => Promise<TranslateResult>;

let output: vscode.OutputChannel;
const cache = new Map<string, TranslateResult>();

function config() {
    return vscode.workspace.getConfiguration('youdaoTranslate');
}

function currentProvider(): ProviderId {
    const provider = config().get<string>('provider', 'youdao');
    return provider in PROVIDER_NAMES ? (provider as ProviderId) : 'youdao';
}

/** 含中文时翻成英文，否则翻成中文；用户指定了目标语言则直接使用 */
function resolveTarget(text: string): string {
    const target = config().get<string>('targetLanguage', 'auto');
    if (target !== 'auto') {
        return target;
    }
    return /[一-龥]/.test(text) ? 'en' : 'zh-CHS';
}

/** 悬停 / 查看翻译前的文本整理：拆分标识符、去掉行首注释符号、合并换行 */
function normalize(text: string): string {
    let s = text.trim();
    if (config().get<boolean>('splitIdentifier', true) && /^[A-Za-z_$][\w$]*$/.test(s)) {
        s = s
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .replace(/[_$]+/g, ' ')
            .trim()
            .toLowerCase();
    }
    return s
        .split(/\r?\n/)
        .map(line => line.replace(/^\s*(--\[\[|\]\]|\/\/+|\/\*+|\*+\/|\*+|#+|--+|;+)\s?/, '').trim())
        .filter(line => line.length > 0)
        .join(' ');
}

/** 读取渠道密钥并返回对应的接口调用函数；密钥不全时返回 undefined */
function getCaller(provider: ProviderId): Caller | undefined {
    const get = (key: string) => config().get<string>(key, '').trim();
    switch (provider) {
        case 'tencent': {
            const secretId = get('tencentSecretId');
            const secretKey = get('tencentSecretKey');
            const region = get('tencentRegion') || 'ap-guangzhou';
            return secretId && secretKey
                ? (q, from, to) => tencentTranslate(q, from, to, secretId, secretKey, region)
                : undefined;
        }
        case 'baidu': {
            const appId = get('baiduAppId');
            const secretKey = get('baiduSecretKey');
            return appId && secretKey ? (q, from, to) => baiduTranslate(q, from, to, appId, secretKey) : undefined;
        }
        default: {
            const appKey = get('appKey');
            const appSecret = get('appSecret');
            return appKey && appSecret ? (q, from, to) => youdaoTranslate(q, from, to, appKey, appSecret) : undefined;
        }
    }
}

function missingKeysMessage(provider: ProviderId): string {
    return `尚未配置${PROVIDER_NAMES[provider]}的密钥`;
}

/** 当前编辑器选中的文本（已整理），没有选区时返回空字符串 */
function selectedText(): string {
    const editor = vscode.window.activeTextEditor;
    return editor && !editor.selection.isEmpty ? normalize(editor.document.getText(editor.selection)) : '';
}

async function translate(
    text: string,
    from = 'auto',
    to = resolveTarget(text),
    provider = currentProvider(),
): Promise<TranslateResult> {
    const maxLength = config().get<number>('maxLength', 5000);
    if (text.length > maxLength) {
        throw new Error(`选中内容超过 ${maxLength} 个字符，请缩小范围`);
    }
    const caller = getCaller(provider);
    if (!caller) {
        throw new Error(missingKeysMessage(provider));
    }

    const cacheKey = `${provider}\n${from}\n${to}\n${text}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        return cached;
    }

    const result = await caller(text, from, to);
    if (cache.size >= CACHE_LIMIT) {
        cache.delete(cache.keys().next().value!);
    }
    cache.set(cacheKey, result);
    return result;
}

function langName(code: string): string {
    return LANGUAGE_NAMES[code] ?? code;
}

function toMarkdown(result: TranslateResult): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = { enabledCommands: ['youdaoTranslate.copy'] };
    md.supportThemeIcons = true;

    md.appendMarkdown(`**${PROVIDER_NAMES[result.provider]}** · `);
    md.appendText(`${langName(result.from)} → ${langName(result.to)}`);
    md.appendMarkdown('\n\n');

    const { uk, us, general } = result.phonetic ?? {};
    if (uk || us) {
        md.appendText(`${uk ? `英 [${uk}]  ` : ''}${us ? `美 [${us}]` : ''}`);
        md.appendMarkdown('\n\n');
    } else if (general) {
        md.appendText(`[${general}]`);
        md.appendMarkdown('\n\n');
    }

    const translation = result.translation.join('\n');
    md.appendText(translation);
    const copyArgs = encodeURIComponent(JSON.stringify([translation]));
    md.appendMarkdown(`  [$(copy) 复制](command:youdaoTranslate.copy?${copyArgs})\n\n`);

    if (result.explains?.length) {
        md.appendMarkdown('---\n\n');
        for (const explain of result.explains) {
            md.appendMarkdown('- ');
            md.appendText(explain);
            md.appendMarkdown('\n');
        }
        md.appendMarkdown('\n');
    }

    if (result.web?.length) {
        md.appendMarkdown('**网络释义**\n\n');
        for (const item of result.web.slice(0, 3)) {
            md.appendMarkdown('- ');
            md.appendText(`${item.key}：${item.value.join('；')}`);
            md.appendMarkdown('\n');
        }
    }
    return md;
}

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

/** 未配置密钥时给出引导，返回 true 表示需要中断当前操作 */
async function ensureKeys(): Promise<boolean> {
    const provider = currentProvider();
    if (getCaller(provider)) {
        return false;
    }
    const pick = await vscode.window.showWarningMessage(missingKeysMessage(provider), '去配置');
    if (pick === '去配置') {
        await vscode.commands.executeCommand('youdaoTranslate.setKeys');
    }
    return true;
}

async function openSettings() {
    await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:liangliang-ai.youdao-translate');
}

async function translateSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || (await ensureKeys())) {
        return;
    }
    const text = normalize(editor.document.getText(editor.selection));
    if (!text) {
        return;
    }

    try {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: '翻译中…' },
            () => translate(text),
        );
        const translation = result.translation.join('\n');

        output.appendLine(`[${PROVIDER_NAMES[result.provider]} ${result.from} → ${result.to}] ${result.query}`);
        output.appendLine(`  → ${translation}`);
        result.explains?.forEach(explain => output.appendLine(`    ${explain}`));
        output.appendLine('');

        const pick = await vscode.window.showInformationMessage(translation, '复制', '替换', '详情');
        if (pick === '复制') {
            await vscode.env.clipboard.writeText(translation);
        } else if (pick === '替换') {
            await editor.edit(edit => edit.replace(editor.selection, translation));
        } else if (pick === '详情') {
            output.show(true);
        }
    } catch (e) {
        vscode.window.showErrorMessage(errorMessage(e));
    }
}

async function replaceSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor || (await ensureKeys())) {
        return;
    }
    const selections = editor.selections.filter(sel => !sel.isEmpty);
    if (!selections.length) {
        return;
    }

    try {
        // 替换时保留原文格式，只去掉首尾空白，不做标识符拆分和注释符号清理
        const translations = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: '翻译中…' },
            () => Promise.all(selections.map(sel => translate(editor.document.getText(sel).trim()))),
        );
        await editor.edit(edit => {
            selections.forEach((sel, i) => edit.replace(sel, translations[i].translation.join('\n')));
        });
    } catch (e) {
        vscode.window.showErrorMessage(errorMessage(e));
    }
}

const hoverProvider: vscode.HoverProvider = {
    async provideHover(document, position) {
        if (!config().get<boolean>('enableHover', true)) {
            return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return;
        }
        const selection = editor.selections.find(sel => !sel.isEmpty && sel.contains(position));
        if (!selection) {
            return;
        }
        const text = normalize(document.getText(selection));
        if (!text) {
            return;
        }

        const provider = currentProvider();
        if (!getCaller(provider)) {
            const md = new vscode.MarkdownString(
                `**翻译[好用]**：${missingKeysMessage(provider)}，[点击配置](command:youdaoTranslate.setKeys)`,
            );
            md.isTrusted = { enabledCommands: ['youdaoTranslate.setKeys'] };
            return new vscode.Hover(md, selection);
        }

        try {
            return new vscode.Hover(toMarkdown(await translate(text)), selection);
        } catch (e) {
            return new vscode.Hover(new vscode.MarkdownString().appendText(errorMessage(e)), selection);
        }
    },
};

export function activate(context: vscode.ExtensionContext) {
    output = vscode.window.createOutputChannel('翻译[好用]');
    const translator = new TranslatorViewProvider(context, {
        translate,
        selectedText,
        openSettings,
        currentProvider,
        setProvider: provider => config().update('provider', provider, vscode.ConfigurationTarget.Global),
        hasKeys: provider => !!getCaller(provider),
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TranslatorViewProvider.viewId, translator, {
            webviewOptions: { retainContextWhenHidden: true },
        }),
        vscode.commands.registerCommand('youdaoTranslate.openPanel', () => translator.show()),
        output,
        vscode.commands.registerCommand('youdaoTranslate.translate', translateSelection),
        vscode.commands.registerCommand('youdaoTranslate.replace', replaceSelection),
        vscode.commands.registerCommand('youdaoTranslate.setKeys', openSettings),
        vscode.commands.registerCommand('youdaoTranslate.copy', async (text: string) => {
            await vscode.env.clipboard.writeText(text);
            vscode.window.setStatusBarMessage('已复制翻译结果', 2000);
        }),
        vscode.languages.registerHoverProvider({ scheme: '*' }, hoverProvider),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('youdaoTranslate')) {
                cache.clear();
            }
            if (e.affectsConfiguration('youdaoTranslate.provider')) {
                translator.syncProvider();
            }
        }),
    );
}

export function deactivate() {}
