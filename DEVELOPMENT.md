# 开发说明

## 环境

- Node.js 18+
- VSCode 1.80+

```bash
npm install
npm run compile   # 编译 TypeScript 到 out/
npm run watch     # 监听修改自动编译
npm run package   # 打包成 .vsix
```

在 VSCode 中打开本目录按 `F5`，会启动一个加载了本插件的新窗口用于调试。

## 项目结构

```text
├── src/
│   ├── extension.ts       # 入口：命令、悬停、渠道选择、缓存
│   ├── translatorView.ts  # 活动栏翻译面板（Webview）的后台逻辑
│   ├── providers.ts       # 各渠道统一的结果类型、语言代码映射
│   ├── youdao.ts          # 有道智云文本翻译（v3 签名）
│   ├── tencent.ts         # 腾讯云机器翻译（TC3-HMAC-SHA256 签名）
│   └── baidu.ts           # 百度翻译通用文本翻译（MD5 签名）
├── media/
│   ├── translator.js      # 翻译面板前端脚本
│   ├── translator.css     # 翻译面板样式（跟随 VSCode 主题）
│   ├── icon.svg           # 活动栏图标
│   └── logo-128.png       # 插件图标
└── package.json           # 插件清单：命令、菜单、快捷键、设置项
```

## 新增翻译渠道

1. 在 `src/` 下新建渠道文件，导出返回 `TranslateResult` 的翻译函数，语言代码通过 `toProviderLang` / `fromProviderLang` 与内部代码互转
2. 在 `providers.ts` 的 `ProviderId`、`PROVIDER_NAMES` 中注册
3. 在 `extension.ts` 的 `getCaller` 中读取密钥并调用
4. 在 `package.json` 的 `youdaoTranslate.provider` 枚举中添加选项，并新增一个设置分组放密钥

## 发布更新

1. 修改 `package.json` 中的 `version`
2. 执行 `npm run package`
3. 打开 [Marketplace 管理页](https://marketplace.visualstudio.com/manage)，在插件行点「⋮」→「Update」，上传新的 `.vsix`

`package.json` 中的 `publisher`（`liangliang-ai`）和 `name`（`youdao-translate`）组成插件 ID，发布后不要修改。
