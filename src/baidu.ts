import { createHash, randomUUID } from 'crypto';
import { fromProviderLang, toProviderLang, TranslateError, TranslateResult } from './providers';

/** 百度翻译通用文本翻译接口文档：https://fanyi-api.baidu.com/doc/21 */
const API_URL = 'https://fanyi-api.baidu.com/api/trans/vip/translate';

const LANG_MAP: Record<string, string> = {
    'zh-CHS': 'zh',
    'zh-CHT': 'cht',
    ja: 'jp',
    ko: 'kor',
    fr: 'fra',
    es: 'spa',
};

const ERROR_MESSAGES: Record<string, string> = {
    '52001': '请求超时，请重试',
    '52002': '百度翻译系统错误，请重试',
    '52003': 'APP ID 无效，请检查 APP ID',
    '54000': '缺少必填参数',
    '54001': '签名错误，请检查密钥',
    '54003': '访问频率受限（标准版 QPS 为 1），请稍后再试',
    '54004': '账户余额不足',
    '54005': '长文本请求过于频繁，请稍后再试',
    '58000': '客户端 IP 不在白名单内，请在百度翻译控制台检查 IP 限制',
    '58001': '不支持的语言方向',
    '58002': '服务已关闭，请在百度翻译控制台开通「通用文本翻译」',
    '90107': '认证未通过或未生效',
};

interface BaiduResponse {
    from?: string;
    to?: string;
    trans_result?: { src: string; dst: string }[];
    error_code?: string;
    error_msg?: string;
}

export async function baiduTranslate(
    q: string,
    from: string,
    to: string,
    appId: string,
    secretKey: string,
): Promise<TranslateResult> {
    const salt = randomUUID();
    const sign = createHash('md5')
        .update(appId + q + salt + secretKey)
        .digest('hex');

    const body = new URLSearchParams({
        q,
        from: toProviderLang(LANG_MAP, from),
        to: toProviderLang(LANG_MAP, to),
        appid: appId,
        salt,
        sign,
    });

    const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
        throw new TranslateError(String(resp.status), `百度翻译接口 HTTP 错误：${resp.status}`);
    }

    const data = (await resp.json()) as BaiduResponse;
    if (data.error_code && data.error_code !== '52000') {
        const msg = ERROR_MESSAGES[data.error_code] ?? data.error_msg ?? '未知错误';
        throw new TranslateError(data.error_code, `百度翻译失败（${data.error_code}）：${msg}`);
    }

    return {
        provider: 'baidu',
        query: q,
        translation: (data.trans_result ?? []).map(item => item.dst),
        from: data.from ? fromProviderLang(LANG_MAP, data.from) : from,
        to: data.to ? fromProviderLang(LANG_MAP, data.to) : to,
    };
}
