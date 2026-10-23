import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { PROVIDER_NAMES, ProviderId, TranslateResult } from './providers';

const HISTORY_KEY = 'lingoLens.history';
const HISTORY_LIMIT = 30;

interface HistoryItem {
    text: string;
    translation: string;
}

export interface TranslatorDeps {
    translate(text: string, from: string, to: string | undefined, provider: ProviderId): Promise<TranslateResult>;
    selectedText(): string;
    openSettings(): Promise<void>;
    currentProvider(): ProviderId;
    setProvider(provider: ProviderId): Thenable<void>;
    hasKeys(provider: ProviderId): boolean;
}

/** 活动栏中的翻译面板（Webview），界面参考 WebStorm 翻译弹框 */
export class TranslatorViewProvider implements vscode.WebviewViewProvider {
    static readonly viewId = 'lingoLens.translator';

    private view?: vscode.WebviewView;
    private ready = false;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly deps: TranslatorDeps,
    ) {}

    resolveWebviewView(view: vscode.WebviewView) {
        this.view = view;
        this.ready = false;
        const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
        view.webview.options = { enableScripts: true, localResourceRoots: [mediaRoot] };
        view.webview.html = this.getHtml(view.webview, mediaRoot);
        view.webview.onDidReceiveMessage(msg => this.onMessage(msg));
        view.onDidChangeVisibility(() => {
            if (view.visible) {
                this.fillFromSelection();
            }
        });
        view.onDidDispose(() => {
            this.view = undefined;
            this.ready = false;
        });
    }

    /** 打开面板；面板已可见时直接带入当前选中文本 */
    async show() {
        if (this.view?.visible) {
            this.view.show(false);
            this.fillFromSelection();
            return;
        }
        await vscode.commands.executeCommand(`${TranslatorViewProvider.viewId}.focus`);
    }

    /** 设置页切换渠道后同步到面板 */
    syncProvider() {
        if (this.ready) {
            this.post({ type: 'provider', value: this.deps.currentProvider() });
        }
    }

    private fillFromSelection() {
        const text = this.deps.selectedText();
        if (text && this.ready) {
            this.post({ type: 'fill', text });
        }
    }

    private post(message: unknown) {
        this.view?.webview.postMessage(message);
    }

    private postHistory() {
        this.post({ type: 'history', items: this.context.globalState.get<HistoryItem[]>(HISTORY_KEY, []) });
    }

    private async record(text: string, translation: string) {
        const items = this.context.globalState.get<HistoryItem[]>(HISTORY_KEY, []).filter(item => item.text !== text);
        items.unshift({ text, translation });
        await this.context.globalState.update(HISTORY_KEY, items.slice(0, HISTORY_LIMIT));
        this.postHistory();
    }

    private async onMessage(msg: any) {
        switch (msg.type) {
            case 'ready':
                this.ready = true;
                this.post({
                    type: 'providers',
                    items: Object.entries(PROVIDER_NAMES).map(([id, name]) => ({ id, name })),
                    value: this.deps.currentProvider(),
                });
                this.postHistory();
                this.fillFromSelection();
                break;
            case 'translate':
                try {
                    const result = await this.deps.translate(
                        msg.text,
                        msg.from,
                        msg.to === 'auto' ? undefined : msg.to,
                        msg.provider,
                    );
                    this.post({ type: 'result', id: msg.id, result });
                    if (msg.record) {
                        await this.record(msg.text, result.translation.join('\n'));
                    }
                } catch (e) {
                    this.post({
                        type: 'error',
                        id: msg.id,
                        message: e instanceof Error ? e.message : String(e),
                        needsConfig: !this.deps.hasKeys(msg.provider),
                    });
                }
                break;
            case 'setProvider':
                await this.deps.setProvider(msg.provider);
                break;
            case 'record':
                await this.record(msg.text, msg.translation);
                break;
            case 'copy':
                await vscode.env.clipboard.writeText(msg.text);
                vscode.window.setStatusBarMessage('已复制翻译结果', 2000);
                break;
            case 'clearHistory':
                await this.context.globalState.update(HISTORY_KEY, []);
                this.postHistory();
                break;
            case 'openSettings':
                await this.deps.openSettings();
                break;
        }
    }

    private getHtml(webview: vscode.Webview, mediaRoot: vscode.Uri): string {
        const nonce = randomBytes(16).toString('base64');
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'translator.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'translator.js'));
        const svg = (body: string) =>
            `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${styleUri}" rel="stylesheet">
</head>
<body>
<div class="toolbar">
    <span class="hint">渠道</span>
    <select id="provider" title="翻译渠道"></select>
</div>
<div class="toolbar">
    <select id="from" title="源语言"></select>
    <button id="swap" class="icon" title="交换语言">${svg('<path d="M2.5 5.5h10l-3-3"/><path d="M13.5 10.5h-10l3 3"/>')}</button>
    <select id="to" title="目标语言"></select>
</div>
<div id="detected" class="hint"></div>

<div class="pane">
    <textarea id="input" placeholder="输入文本，或在编辑器中选中后打开面板&#10;Ctrl+Enter 立即翻译"></textarea>
    <div class="pane-footer">
        <span id="count" class="hint">0</span>
        <span class="spacer"></span>
        <button id="clear" class="icon" title="清空">${svg('<path d="M2.5 4h11"/><path d="M6 4V2.5h4V4"/><path d="M4 4l.7 9.5h6.6L12 4"/>')}</button>
        <button id="toggleHistory" class="icon" title="历史记录">${svg('<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>')}</button>
    </div>
</div>

<div id="history" class="history" hidden>
    <div class="history-head">
        <span>历史记录</span>
        <button id="clearHistory" class="link">清空</button>
    </div>
    <ul id="historyList"></ul>
</div>

<div class="pane">
    <div id="output" class="output"></div>
    <div class="pane-footer">
        <span id="status" class="hint"></span>
        <span class="spacer"></span>
        <button id="copy" class="icon" title="复制译文">${svg('<rect x="5" y="5" width="8.5" height="9" rx="1"/><path d="M3 11V3a1 1 0 0 1 1-1h6.5"/>')}</button>
    </div>
</div>

<div id="details" class="details"></div>

<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
