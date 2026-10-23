export type ProviderId = 'youdao' | 'tencent' | 'baidu';

export const PROVIDER_NAMES: Record<ProviderId, string> = {
    youdao: '有道翻译',
    tencent: '腾讯翻译君',
    baidu: '百度翻译',
};

/** 插件内部统一使用有道的语言代码，各渠道在请求前后自行映射 */
export const LANGUAGE_NAMES: Record<string, string> = {
    'zh-CHS': '中文（简体）',
    'zh-CHT': '中文（繁体）',
    en: '英语',
    ja: '日语',
    ko: '韩语',
    fr: '法语',
    de: '德语',
    ru: '俄语',
    es: '西班牙语',
};

/** 各渠道统一的翻译结果 */
export interface TranslateResult {
    provider: ProviderId;
    /** 原文 */
    query: string;
    /** 译文（多行时每行一项） */
    translation: string[];
    /** 实际的源语言 / 目标语言（内部语言代码） */
    from: string;
    to: string;
    /** 以下为词典信息，目前只有有道在查单词时返回 */
    phonetic?: { uk?: string; us?: string; general?: string };
    explains?: string[];
    web?: { key: string; value: string[] }[];
}

export class TranslateError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

/** 内部语言代码 → 渠道语言代码，未列出的原样使用 */
export function toProviderLang(map: Record<string, string>, code: string): string {
    return map[code] ?? code;
}

/** 渠道语言代码 → 内部语言代码 */
export function fromProviderLang(map: Record<string, string>, code: string): string {
    return Object.keys(map).find(key => map[key] === code) ?? code;
}
