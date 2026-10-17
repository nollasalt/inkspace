# Inkspace 0.13.1 — 首个公开预览版

Inkspace 将手写笔迹、Markdown、公式、代码、图片、PDF 和图形放在 VS Code 的无限画布里。这个版本邀请 Windows x64 用户试用并反馈设备兼容性与日常笔记体验。

## 下载与安装

推荐下载 [Windows x64 完整分发包](https://github.com/nollasalt/inkspace/releases/download/v0.13.1/Inkspace-VSCode-0.13.1-Windows-x64-Bundle.zip)，其中包含插件、对应源码、安装说明、AI 使用说明和 SHA-256 校验和。

在 VS Code 命令面板运行 **Extensions: Install from VSIX…**，选择包内的 `Inkspace-VSCode-0.13.1-win32-x64.vsix`。打开笔记文件夹，右键新建笔记，首次使用触控笔时完成三点校准。引擎自动启动，后续恢复校准结果。

也可单独下载 [VSIX 安装包](https://github.com/nollasalt/inkspace/releases/download/v0.13.1/Inkspace-VSCode-0.13.1-win32-x64.vsix)、[对应源码（含原生依赖源码）](https://github.com/nollasalt/inkspace/releases/download/v0.13.1/Inkspace-VSCode-0.13.1-Source.zip) 和 [SHA-256 校验文件](https://github.com/nollasalt/inkspace/releases/download/v0.13.1/Inkspace-VSCode-0.13.1-SHA256SUMS.txt)。

## 包含的能力

- 触控笔压力书写、橡皮、鼠标编排和无限画布导航。
- Markdown / 静态 HTML 文本、公式、Shiki 代码高亮、图片、独立 PDF 页面、图形与附着连线。
- 复制粘贴、组合、锁定、对齐、层级、区域书签和多个独立画布。
- `.ink` 本地二进制增量保存、合并自动保存、撤销重做与恢复副本；旧 JSON 笔记兼容。
- 可选 AI 助手：默认直接生成，按需附加内容或画面；具体编辑先预览，再一次应用及撤销。AI 需要已安装并登录的 Codex CLI，模型权限取决于账户。

## 已知限制

- 仅 Windows x64 桌面版 Microsoft VS Code；尚未覆盖所有触控笔和驱动，笔尾橡皮擦未映射。
- 改变设备或显示配置可能需要重新校准。自动化输入测试不能替代实体触控笔验证。
- 文本为基本源码编辑，HTML 不执行脚本，图形编辑不等同于完整 draw.io。
- AI 结果需要用户审阅；不使用 AI 时，日常笔记不依赖它的服务。

## 反馈

请使用仓库的 Issue 模板，提供插件版本、Windows / VS Code 版本、触控笔型号与复现步骤。性能与保存问题可附 **墨境：查看性能与保存诊断** 的输出。不要上传包含连接令牌的 `connection.json` 或未经清理的私人笔记。

项目采用 GPL-3.0-or-later；分发包内提供对应源码及第三方许可。
