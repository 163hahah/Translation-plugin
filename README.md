# 翻译[好用]

一个 VSCode 翻译插件：**选中单词或段落即可翻译**，支持 **有道翻译**、**腾讯翻译君**、**百度翻译** 三个渠道，随时切换。

- 选中后鼠标悬停直接看译文，不打断写代码
- 仿照 WebStorm（JetBrains IDE）翻译弹框风格的翻译面板：语言检测、⇄ 交换语言、边输入边翻译、历史记录，用过 JetBrains 的同学上手零成本
- 驼峰 / 下划线命名自动拆词，代码注释自动去掉注释符号
- 密钥只保存在本机，不会被同步或上传

## 安装

**方式一：扩展市场（推荐）**

在 VSCode 扩展面板（`Ctrl+Shift+X`）搜索 `翻译[好用]` 或 `liangliang-ai.youdao-translate`，点击安装。

**方式二：VSIX 文件**

从 [Releases](https://github.com/163hahah/Translation-plugin/releases) 下载 `.vsix`，在扩展面板右上角 `···` → **从 VSIX 安装**；或在命令行执行：

```bash
code --install-extension youdao-translate-x.y.z.vsix
```

## 快速开始

1. 至少申请一个渠道的密钥（见下方 [申请密钥](#申请密钥)）
2. 打开设置（`Ctrl+,`），搜索 `@ext:liangliang-ai.youdao-translate`
3. 在 **翻译渠道** 中选择渠道，并在对应分组填写密钥
4. 在编辑器中选中一段文字，鼠标悬停在选区上即可看到翻译

> 也可以点击翻译面板右上角的 ⚙ 按钮直接打开设置页。

## 使用方式

| 方式 | 操作 | 说明 |
| --- | --- | --- |
| 悬停翻译 | 选中文本后，鼠标悬停在选区上 | 显示译文和复制按钮；有道渠道查单词时附带音标、词典释义、网络释义 |
| 翻译面板 | 点击左侧活动栏的翻译图标，或 `Ctrl+Alt+Y` | 打开时自动带入选中文本；可直接输入内容，停顿后自动翻译 |
| 弹窗翻译 | 右键 → **翻译选中内容**，或 `Ctrl+Alt+T` | 弹窗显示译文，可 **复制** / **替换** / **详情** |
| 翻译并替换 | 右键 → **翻译并替换选中内容**，或 `Ctrl+Alt+R` | 直接用译文替换选中内容，支持多光标 |

macOS 下快捷键中的 `Ctrl` 换成 `Cmd`。快捷键冲突时可在「键盘快捷方式」中搜索 `翻译[好用]` 修改。

### 翻译面板

界面仿照 WebStorm 的翻译弹框设计：顶部「检测语言 ⇄ 目标语言」，上方输入原文、下方显示译文，配色跟随 VSCode 当前主题。由于 VSCode 不支持悬浮弹窗，面板放在左侧活动栏中。

- **渠道**：顶部下拉框切换有道 / 腾讯 / 百度，与设置页同步
- **语言**：源语言默认「检测语言」，目标语言默认「自动」（含中文翻成英文，否则翻成中文）
- **⇄ 交换**：把译文放回输入框并对调语言
- **快捷键**：`Ctrl+Enter` 立即翻译
- **历史记录**：🕒 按钮查看最近 30 条，点击即可重新翻译

### 文本自动整理

悬停、弹窗和面板带入选中内容时，会先做整理再翻译（「翻译并替换」不做整理，保留原文格式）：

- `getUserName` / `get_user_name` → `get user name`（可在设置中关闭）
- 去掉每行开头的注释符号：`//`、`/* */`、`*`、`#`、`--`、`--[[ ]]`、`;`
- 多行注释合并成一段，翻译更通顺

## 申请密钥

只需配置你要使用的渠道。

### 有道翻译

1. 登录 [有道智云](https://ai.youdao.com)，在控制台 **创建应用**
2. 应用的接入服务中勾选 **文本翻译**
3. 在 **应用总览** 中复制 **应用 ID** 和 **应用密钥**，分别填入设置中的 `App Key` 和 `App Secret`

### 腾讯翻译君

1. 登录腾讯云，打开 [机器翻译控制台](https://console.cloud.tencent.com/tmt)，点击 **开通服务**
2. 打开 [API 密钥管理](https://console.cloud.tencent.com/cam/capi)，新建密钥，复制 **SecretId** 和 **SecretKey**
3. 填入设置中的 `Tencent Secret Id` 和 `Tencent Secret Key`；地域保持默认「广州」即可

> 使用子账号密钥时，需要给子账号授予 `QcloudTMTFullAccess` 权限。腾讯每月提供 500 万字符免费额度，以官网为准。

### 百度翻译

1. 登录 [百度翻译开放平台](https://fanyi-api.baidu.com)，开通 **通用文本翻译**
2. 在 [管理控制台](https://fanyi-api.baidu.com/manage/developer) 复制 **APP ID** 和 **密钥**
3. 填入设置中的 `Baidu App Id` 和 `Baidu Secret Key`

> 标准版每秒只允许 1 次请求，悬停过快时可能提示「访问频率受限」，稍等即可。

## 设置项

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `youdaoTranslate.provider` | `youdao` | 翻译渠道：`youdao` / `tencent` / `baidu` |
| `youdaoTranslate.appKey` | 空 | 有道智云应用 ID |
| `youdaoTranslate.appSecret` | 空 | 有道智云应用密钥 |
| `youdaoTranslate.tencentSecretId` | 空 | 腾讯云 SecretId |
| `youdaoTranslate.tencentSecretKey` | 空 | 腾讯云 SecretKey |
| `youdaoTranslate.tencentRegion` | `ap-guangzhou` | 腾讯云接入地域 |
| `youdaoTranslate.baiduAppId` | 空 | 百度翻译 APP ID |
| `youdaoTranslate.baiduSecretKey` | 空 | 百度翻译密钥 |
| `youdaoTranslate.enableHover` | `true` | 是否启用悬停翻译 |
| `youdaoTranslate.targetLanguage` | `auto` | 目标语言，`auto` 表示中英互译 |
| `youdaoTranslate.splitIdentifier` | `true` | 是否拆分驼峰 / 下划线命名 |
| `youdaoTranslate.maxLength` | `5000` | 单次翻译最大字符数 |

## 密钥安全

- 密钥保存在 VSCode 用户设置（`settings.json`）中，**仅本机有效**
- 所有密钥项只能在「用户」级别设置，不会写入工作区配置，避免被提交到项目仓库
- 所有密钥项不参与 VSCode 设置同步，不会上传到云端；换电脑需要重新填写
- 插件只把待翻译的文本发送给你选择的翻译渠道，不会发送到其他地方

## 常见问题

**选中的词翻译结果和原文一样？**
专有名词、库名、缩写（例如 `libengine`）翻译引擎通常会原样保留，这不是插件故障。可以选中完整的句子翻译。

**提示「尚未配置 xx 的密钥」？**
当前选择的渠道没有填写密钥。到设置页检查 **翻译渠道** 和对应分组的密钥是否填写。

**提示签名错误 / 应用 ID 无效？**
检查密钥是否复制完整、前后是否有多余空格；有道需要确认应用已绑定「文本翻译」服务，腾讯需要确认已开通机器翻译服务。

**悬停时一直弹出翻译，想关掉？**
设置中关闭 `youdaoTranslate.enableHover`，之后用快捷键或翻译面板翻译。

## 开发

见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 许可证

[MIT](LICENSE)

> WebStorm 是 JetBrains 的商标，本插件仅在界面风格上参考其翻译弹框，与 JetBrains 无任何关联。
