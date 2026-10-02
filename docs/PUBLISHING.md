# 发布到 VS Code Marketplace

当前插件使用标准 VS Code Custom Editor/API，可作为普通扩展发布。包含 Windows Raw Input 和原生 Cairo，所以发布包指定 `win32-x64`，而不是通用平台。

官方说明：[Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。当前只生成安装包，没有自动发布。

## 发布前准备

1. 在 [Marketplace 发布者管理页面](https://marketplace.visualstudio.com/manage) 创建或取得 Publisher 权限。`vscode/package.json` 当前 Publisher 为 `nollasalt`；GitHub 同名账号不会自动获得该 Marketplace 身份。
2. 使用 `npm run dist:vscode:bundle` 构建并测试，检查版本、描述及 Windows x64 平台标记。
3. 为公开用户提供对应源码和第三方许可。GitHub 仓库当前是私有的，私有仓库链接不能作为公众可访问的源码下载入口；可另行提供公开源码包，不必直接变更整个仓库可见性。
4. 上传 `Inkspace-VSCode-<版本>-win32-x64.vsix` 到发布者管理页面，或使用已授权的 vsce 发布流程。

未确认 Publisher 权限前，不把 GitHub 登录当作 Marketplace 发布授权。

## 认证

手工上传 VSIX 可通过 Marketplace 管理页面完成。自动发布遵循微软当前文档，优先使用 Microsoft Entra ID 身份认证。官方文档说明 Azure DevOps 全局 PAT 将于 2026-12-01 停用，因此不要把长期流程仅建立在旧全局 PAT 上。不要将发布令牌提交进仓库。

## 平台与设备范围

当前只构建 Windows x64 桌面扩展，`extensionKind: ui` 让引擎随本地 UI 扩展运行。没有 Linux/macOS、ARM64 或浏览器版原生模块。新触控笔需要验证其后台 Raw Input 报告；平台标记不代表设备兼容性已全面验证。
