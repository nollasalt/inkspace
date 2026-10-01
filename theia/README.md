# Inkspace · Theia 验证版 0.1

这是可运行的 Windows x64 验证工作区。文件树、标签、Monaco 文本编辑、查找替换、文件创建/重命名、Markdown 预览和终端来自真实 Eclipse Theia。手写页沿用独立 Inkspace 的 Windows 原生输入、Xournal++ 压力轮廓和 Cairo 栅格化。

## 启动和使用

当前机器已完成依赖安装和构建，双击本目录的 **Start-Theia.vbs** 即可启动。默认打开 `demo-workspace`，也可以把一个文件夹拖到启动脚本上。

- `File → Open…` 打开自己的文件夹；文件树右键可新建文件、文件夹和重命名。
- `File → 新建手写笔记` 创建画布。双击 `.inkspace.json` 笔记进入手写页；当前同时保留一个手写笔记，换笔记前会检查未保存的内容。
- `View → Inkspace 手写验证` 或 **Ctrl+Alt+I** 返回手写页。
- **Ctrl+Alt+N** 新建真实终端，在手写页内也可使用。
- 文本文件使用 Theia 编辑器，**Ctrl+S** 保存。Markdown 的右键菜单或编辑器右上角 **Open Preview** 打开预览，支持相对路径图片。
- 手写页沿用画布工具、页面切换、粘贴、PDF 导入和笔记保存；鼠标双击创建文本框，触控笔书写。

第一次打开文件夹可能出现 Theia 的工作区信任对话框；是否信任由使用者选择。验证版使用 `%APPDATA%/Inkspace-Theia-Validation`，与原独立版配置分开。

**手写内容需要 Ctrl+S 显式保存。此验证版尚未提供手写崩溃恢复。** 关闭窗口、打开其他笔记、切换文件夹均检查未保存内容。它用于判断宿主是否适合继续开发，尚未制作发布安装包，也尚未接入 VS Code 插件市场、语言服务器或 WSL。

## 验证重点

请用真实触控笔比较独立版和本版：同一区域快速打点、连续书写与频繁抬笔、缩放和平移后书写、在文本框上书写。观察点是否消失、抬笔是否停顿、笔尖与笔迹是否重合。同时试用文件树、文本编辑和 Markdown 预览。

自动验证 `npm run test:theia` 会启动真实 Electron/Theia：检查原生 HWND 钩子和 Cairo，注入 150 次连续落笔/抬笔，验证缩放、撤销重做、笔记重新打开、Monaco 编辑及保存、Markdown 首次打开时的本地图片、终端实际执行命令和画布标签切换。测试工作区在 `artifacts`，不会操作个人笔记。

结果写入 `artifacts/theia-smoke.json`，窗口截图在 `artifacts/theia-preview.png`。自动输入是合成数据，不能证明真实硬件输入无延迟；报告中的事件循环间隔也不是笔尖到屏幕延迟。

## 从源码构建

在项目根目录执行：

```powershell
npm ci
npm ci --prefix theia --ignore-scripts
npm run build:theia
npm run start:theia
```

指定工作区：

```powershell
npm run start:theia -- --workspace="D:\Notes"
```

需要 Windows x64、Node.js、项目原生构建工具（MinGW GCC/G++、gendef、dlltool、Ninja、Python）。当前验证环境使用 Node 26.7.0、Electron 44.5.1。`prepare-native.cjs` 安装 keytar 的官方 N-API 预编译模块，并在 drivelist 的预编译包不可用时编译 npm 中未经修改的上游源代码。没有运行整个依赖树的安装脚本，也不需要安装 Visual Studio。

## 集成方式与后续边界

Theia 工作区在只监听本机回环地址的后台服务中运行。Electron 外壳提供原生笔 API；手写页是同源 iframe，直接接收外壳输入，不经过 Theia 后台或插件消息通道。嵌入坐标换算保留小数并处理屏幕像素比例。后台服务与终端由独立监督进程在关闭时清理。

浏览器目标的 Theia 在 Electron 中使用自己的菜单和工作区服务。Markdown 资源使用 Theia 隔离的预览域名；本机域名解析适配保留该隔离。没有修改第三方依赖源代码。

预览链接通过 Theia 的服务替换点修正中文、空格路径被重复编码的问题，保留查询参数和片段，并补充 WebP/AVIF 的二进制图片响应。自动验证包含首次打开时的 SVG、中文及空格路径 PNG 和 WebP 图片。

构建在 `artifacts/theia-build` 中完成，再仅复制内容发生变化的产物，避免覆盖运行中的原生模块。构建无需关闭当前窗口；保存工作后重新启动，才能加载更新。

本版锁定 Theia **1.72.3**，以使用对应的 `@theia/preview`。该预览包在较新的 Theia 版本中已移除；正式路线应升级 Theia，并用其 VS Code 插件宿主加载成熟 Markdown 扩展。验证阶段没有把旧版独立编辑器界面搬进 Theia。常用语言高亮和缩进规则直接引用 Microsoft Monaco 0.57.0 的定义，构建时共享 Theia 的 Monaco 引擎。

Inkspace 代码遵循项目根目录 GPL 许可；Theia 及其依赖保留各自许可。版本和来源记录在本目录 `package-lock.json`，Xournal++/Cairo 来源在 `native/UPSTREAM.md`。
