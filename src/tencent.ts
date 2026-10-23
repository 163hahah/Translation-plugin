import { createHash, createHmac } from 'crypto';
import { fromProviderLang, toProviderLang, TranslateError, TranslateResult } from './providers';

/** 腾讯云机器翻译 TextTranslate 接口文档：https://cloud.tencent.com/document/api/551/15619 */
const HOST = 'tmt.tencentcloudapi.com';
const SERVICE = 'tmt';
const ACTION = 'TextTranslate';
const VERSION = '2018-03-21';

const LANG_MAP: Record<string, string> = {
    'zh-CHS': 'zh',
    'zh-CHT': 'zh-TW',
};

const ERROR_MESSAGES: Record<string, string> = {
    'AuthFailure.SecretIdNotFound': 'SecretId 不存在，请检查 SecretId',
    'AuthFailure.SignatureFailure': '签名校验失败，请检查 SecretKey',
    'AuthFailure.SignatureExpire': '签名已过期，请检查本机时间',
    'AuthFailure.UnauthorizedOperation': '该密钥没有机器翻译权限，子账号需授予 QcloudTMTFullAccess',
    'FailedOperation.NoFreeAmount': '本月免费额度已用完',
    'FailedOperation.ServiceIsolate': '账号欠费停服，请充值',
    'FailedOperation.UserNotRegistered': '尚未开通机器翻译服务，请在腾讯云控制台开通',
    'InvalidParameterValue.Region': '地域无效，请检查地域设置',
    RequestLimitExceeded: '请求频率超限，请稍后再试',
    'UnsupportedOperation.TextTooLong': '翻译文本过长',
    'UnsupportedOperation.UnsupportedLanguage': '不支持的语言',
    'UnsupportedOperation.UnsupportedSourceLanguage': '不支持的源语言',
};

interface TencentResponse {
    Response: {
        TargetText?: string;
        Source?: string;
        Target?: string;
        Error?: { Code: string; Message: string };
    };
}

function sha256(data: string): string {
    return createHash('sha256').update(data).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
    return createHmac('sha256', key).update(data).digest();
}

export async function tencentTranslate(
    q: string,
    from: string,
    to: string,
    secretId: string,
    secretKey: string,
    region: string,
): Promise<TranslateResult> {
    const payload = JSON.stringify({
        SourceText: q,
        Source: toProviderLang(LANG_MAP, from),
        Target: toProviderLang(LANG_MAP, to),
        ProjectId: 0,
    });

    // TC3-HMAC-SHA256 签名：https://cloud.tencent.com/document/api/551/30636
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const contentType = 'application/json; charset=utf-8';
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalRequest = [
        'POST',
        '/',
        '',
        `content-type:${contentType}\nhost:${HOST}\nx-tc-action:${ACTION.toLowerCase()}\n`,
        signedHeaders,
        sha256(payload),
    ].join('\n');
    const credentialScope = `${date}/${SERVICE}/tc3_request`;
    const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, sha256(canonicalRequest)].join('\n');
    const secretSigning = hmac(hmac(hmac('TC3' + secretKey, date), SERVICE), 'tc3_request');
    const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex');

    const resp = await fetch(`https://${HOST}`, {
        method: 'POST',
        headers: {
            Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
            'Content-Type': contentType,
            'X-TC-Action': ACTION,
            'X-TC-Timestamp': String(timestamp),
            'X-TC-Version': VERSION,
            'X-TC-Region': region,
        },
        body: payload,
        signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
        throw new TranslateError(String(resp.status), `腾讯翻译接口 HTTP 错误：${resp.status}`);
    }

    const data = ((await resp.json()) as TencentResponse).Response;
    if (data.Error) {
        const msg = ERROR_MESSAGES[data.Error.Code] ?? data.Error.Message;
        throw new TranslateError(data.Error.Code, `腾讯翻译失败（${data.Error.Code}）：${msg}`);
    }

    return {
        provider: 'tencent',
        query: q,
        translation: (data.TargetText ?? '').split('\n'),
        from: data.Source ? fromProviderLang(LANG_MAP, data.Source) : from,
        to: data.Target ? fromProviderLang(LANG_MAP, data.Target) : to,
    };
}
