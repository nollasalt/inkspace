# 墨境 · VSCodium 原型 0.1.0

用 VSCodium 自带的文件资源管理器、标签、Markdown 编辑器、保存和恢复机制管理笔记。`.inkspace.json` 默认使用墨境画布打开；旧版普通 JSON 可右键“用墨境打开笔记”。命令面板中“墨境: 新建笔记”创建文件。

左侧墨境图标打开独立页面列表，画布底部“页面”按钮也可打开；侧栏顶部加号新增页面，页面条目可重命名，右键删除。每页是无限画布；鼠标框选、双击添加文本，触控笔书写；支持粘贴图片/文字、Markdown 文本框、公式和 PDF 导入/导出。Ctrl+S 保存到笔记原文件，标准标签显示未保存状态。原文编辑器的修改及宿主撤销同步到画布；未发送成功的草稿保留在 Webview 状态中，冲突时可用画布文件菜单“另存为”导出草稿。

## 安装

VSCodium 扩展面板 → 更多操作 → “从 VSIX 安装”，选择 `Inkspace-VSCodium-0.1.0.vsix`。也可执行 `codium --install-extension Inkspace-VSCodium-0.1.0.vsix`。不需要微软 Marketplace 或 WSL 扩展。

## 输入边界

**这是可运行的迁移原型，尚不等同于桌面版笔迹引擎。** 保留原始压力采样和 Xournal++ 压力轮廓，在 Webview 中用浏览器绘制；没有接入原生 HIMETRIC 采样或 Cairo 栅格化。界面明确标注“浏览器笔输入”。真实笔迹、精度与延迟需要设备实测；实时轮廓每次更新整条活动笔迹，长笔迹可能比独立桌面版慢。不要据合成事件测试宣称原生精度。

VSCodium 的公开扩展接口不直接提供主进程 BrowserWindow/原生 HWND，现有 `native.attach(win.getNativeWindowHandle())` 不能原样搬进扩展宿主。后续可以比较 Webview 输入实测与原生宿主补丁；需要 Cairo 时也必须适配绘制通信及延迟。

## 构建和测试

在仓库根目录执行 `npm run build:vscode`。在 `vscode` 目录执行 `npx @vscode/vsce package --no-dependencies --out ../dist/Inkspace-VSCodium-0.1.0.vsix`。`npm run test:vscode` 使用本机 VSCodium 的独立测试配置（可通过 `INKSPACE_CODIUM` 指定程序），不改动正常工作区。验证 Webview 笔/鼠标输入、公式字体、图片、PDF Worker、原生页面树、文件保存和宿主撤销。

GPL-2.0-or-later，完整源码及共享画布代码见 https://github.com/nollasalt/inkspace ，Xournal++ 来源见仓库 `native/UPSTREAM.md`。原桌面版保留。
