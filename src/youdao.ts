import { createHash, randomUUID } from 'crypto';
import { TranslateError, TranslateResult } from './providers';

/** 有道智云文本翻译接口文档：https://ai.youdao.com/DOCSIRMA/html/trans/api/wbfy/index.html */
const API_URL = 'https://openapi.youdao.com/api';

interface YoudaoResponse {
    errorCode: string;
    query: string;
    translation: string[];
    /** 语言方向，例如 en2zh-CHS */
    l: string;
    /** 单词查询时才有：音标与词典释义 */
    basic?: {
        phonetic?: string;
        'us-phonetic'?: string;
        'uk-phonetic'?: string;
        explains?: string[];
    };
    /** 网络释义 */
    web?: { key: string; value: string[] }[];
}

const ERROR_MESSAGES: Record<string, string> = {
    '101': '缺少必填参数',
    '102': '不支持的语言类型',
    '103': '翻译文本过长',
    '108': '应用 ID 无效，请检查应用 ID',
    '110': '该应用没有绑定「文本翻译」服务，请在有道智云控制台绑定',
    '111': '开发者账号无效',
    '113': '翻译文本不能为空',
    '202': '签名校验失败，请检查应用密钥',
    '206': '时间戳无效，请检查本机时间',
    '401': '账户已欠费，请充值',
    '411': '访问频率受限，请稍后再试',
    '412': '长请求过于频繁，请稍后再试',
};

/** 有道 v3 签名中的 input：长度 ≤ 20 用原文，否则取前 10 个字符 + 长度 + 后 10 个字符 */
function truncate(q: string): string {
    const len = q.length;
    return len <= 20 ? q : q.substring(0, 10) + len + q.substring(len - 10);
}

export async function youdaoTranslate(
    q: string,
    from: string,
    to: string,
    appKey: string,
    appSecret: string,
): Promise<TranslateResult> {
    const salt = randomUUID();
    const curtime = Math.floor(Date.now() / 1000).toString();
    const sign = createHash('sha256')
        .update(appKey + truncate(q) + salt + curtime + appSecret)
        .digest('hex');

    const body = new URLSearchParams({
        q,
        from,
        to,
        appKey,
        salt,
        sign,
        signType: 'v3',
        curtime,
    });

    const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
        throw new TranslateError(String(resp.status), `有道接口 HTTP 错误：${resp.status}`);
    }

    const data = (await resp.json()) as YoudaoResponse;
    if (data.errorCode !== '0') {
        const msg = ERROR_MESSAGES[data.errorCode] ?? '未知错误';
        throw new TranslateError(data.errorCode, `有道翻译失败（${data.errorCode}）：${msg}`);
    }

    const [lFrom, lTo] = (data.l ?? '').split('2');
    const basic = data.basic;
    return {
        provider: 'youdao',
        query: data.query,
        translation: data.translation,
        from: lFrom || from,
        to: lTo || to,
        phonetic: basic && {
            uk: basic['uk-phonetic'],
            us: basic['us-phonetic'],
            general: basic.phonetic,
        },
        explains: basic?.explains,
        web: data.web,
    };
}
