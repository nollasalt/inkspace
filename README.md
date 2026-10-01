# 墨境 · 无限笔记 0.5.3

Windows x64 桌面书写应用。双击 `dist/Inkspace-0.5.3-Windows.exe` 启动便携版，无需 Node 或联网。开发：`npm ci`、`npm run build:native`、`npm run build`、`npm start`（原生构建需要 Windows x64、MinGW GCC/G++、Ninja、Python）。打包：`npm run dist`。

旧浏览器笔记请先保存 JSON，再在桌面版打开；自动保存位置不同。浏览器版 `index.html` 仍可书写，PDF 和大文件建议使用桌面版。

## 使用

- P 画笔；E 整条笔迹橡皮；H / 空格拖动；滚轮 / 双指缩放，无固定范围限制。支持压力、原始输入和合并采样。
- V 框选笔迹、图形和文本框并拖动。Delete 删除；Ctrl+Z 撤销；Ctrl+Y / Ctrl+Shift+Z 重做。
- S 创建矩形、椭圆、直线和箭头。
- 文本框按固定的世界坐标宽度与字号排版；缩放保持换行、段落、公式和代码布局不变。调整文本框宽度或页面字号才会重新排版。
- T 添加 Markdown。双击编辑，顶部拖动，右下角调整宽度；编辑框中可输入 160–4000px 宽度。新框默认 560px，旧框保留 320px。
- 公式：`$…$`、`\(…\)`、`$$…$$`、`\[…\]`。代码围栏支持 python、javascript、typescript、cpp、csharp、java、json、bash、css、html、sql、rust 等语言。
- 背景：纯色、点阵、横线、网格；颜色、字号、间距可调。自动行距为字号 × 1.75，例如 16px 字号对应 28px 横线。
- 导入 PDF 后直接书写、添加文本框。切换“PDF 文字”选取、复制；选中文字后点击“高亮文字”。高亮可移动和撤销。“导出 PDF”保留原文字、矢量笔迹和图形，Markdown/公式文本框嵌入为高清图片。旋转页会规范化页面方向。
- Ctrl+V 直接粘贴文字或图片；文字成为可编辑的 Markdown 文本框，图片嵌入文件，支持 PNG、JPEG、WebP 和 GIF（单张不超过 30 MB）。拖动顶部移动，拖动右下角调整宽度，或框选后移动、删除；粘贴可撤销。编辑框中的粘贴保持普通文本编辑行为。
- 左侧 ＋ 添加页面，点击切换，双击重命名；每页都是无限画布，分别保留视图和本次会话的撤销记录。侧栏可以折叠。删除页面会先确认，至少保留一页。
- 只用触控笔书写；鼠标拖动用于框选，空格或中键用于平移，鼠标不产生或擦除手写墨迹。鼠标双击空白画布创建文本框，双击已有文本框编辑。
- 触控笔可以直接在文本框和图片上绘制或擦除墨迹，墨迹显示及导出均位于内容上方。鼠标拖动顶部移动文本框、右下角调整宽度，双击编辑；笔双击不进入文本编辑。
- 圆点按所选笔粗固定显示，直径 = 笔粗 × 倍率；悬空和落笔大小一致，不随压感缩小。鼠标使用普通指针。
- 文件菜单：新建、打开、保存、另存为，PDF 导入及当前页导出。Ctrl+N 新建，Ctrl+O 打开，Ctrl+S 保存整本笔记，Ctrl+Shift+S 另存。新建或打开会新增标签页，切换保留未保存内容；关闭有修改的标签时提示保存。关闭程序前保存所有标签的恢复副本。
- 顶部第二行按工具显示笔参数、图形类型或 PDF 高亮；背景、字号、行距集中在“页面设置”。

## 开放存储

UTF-8 JSON：笔记顶层 `format: "inkspace"`、`version: 2`、`title`、`activePage`、`pages`。每个页面保存 `id`、`title`、`view` 和 `document`。页面 document 沿用 v1：`strokes` 保存颜色、宽度、原始世界坐标与压力 `points: [{x,y,p}]`；`notes` 保存位置、可选宽度和 Markdown 原文，图片对象附加 `kind: "image"`、内嵌 data URL `src` 和宽高比 `aspect`；`shapes` 保存图形；`background` 保存页面背景；`pdfs` 保存原始 PDF 字节和页面位置。v1 文件打开后自动成为一本笔记的第一页。旧版程序不能读取 v2 多页文件。

任意语言可读取 JSON、提取 Markdown 和原始 PDF。这是开放结构，尚不是其他笔记软件采用的互换标准。SVG 保留矢量墨迹及 Markdown 原文，metadata 内嵌 JSON；PDF 页视觉请用 PDF 导出。

桌面恢复文件通常在 `%APPDATA%/inkspace/recovery.json`，与手动保存的文件分开。恢复后首次保存会询问文件名。浏览器使用 localStorage，大 PDF 容易超出容量。

## 验证与边界

`npm test` 验证输入、几何、历史、布局、缓存与 native Canvas 栅格结果。`npm run test:desktop` 在真实 Electron/Chromium 中验证公式、代码高亮、极小倍率、缩放合并、PDF 原文选取、高亮、旋转页导出及原文字保留。结果：`artifacts/desktop-smoke.json`。

0.4.0 已改为 Windows 原生笔输入 + Xournal++ 压力轮廓 + 原生 Cairo 渲染。新桌面笔迹标记为 `xournal`；界面、Markdown 与 PDF 仍使用 Electron。高精度 HIMETRIC 坐标经设备/显示器标定后保留小数，不经过浏览器整数像素坐标。

下方状态在真实笔输入后显示“原生高精度笔迹”。若显示“笔输入回退”或“设备仅提供像素坐标”，当前设备/驱动没有提供所需的原生高精度数据；程序不会将回退伪称为原生高精度。旧文件可以打开，但旧文件中已经丢失的精度无法恢复。

连续缩放使用图层预览，停止后精细重绘；压力轮廓按显示器实际像素密度绘制。平移补画新露出条带。参考说明见 `RESEARCH.md`。

真实触控笔延迟、压力、细笔观感仍需实测，不能据自动测试宣称达到 OneNote。防误触依据接触面积及笔状态，不是系统级识别。Markdown 为安全基础子集，不支持原始 HTML、图片、表格。扫描 PDF 无文字层时需要 OCR，当前未实现。导出批注属于 PDF 页面内容，不能在其他阅读器按标准 Annotation 对象单独编辑；文本框导出为图片，JSON 原文保持可编辑。大文档精细重绘仍占用 CPU 和显存。

本版实际移植了 Xournal++ 的压力轮廓实现，许可证与来源见 `LICENSE`、`native/UPSTREAM.md` 及 `desktop/native/licenses/`。对应源码包为 `dist/Inkspace-0.4.0-Source.zip`（包含 Cairo/Pixman 原始源码及构建脚本）。运行不需要另行安装 Xournal++。

## 0.6.0 文件夹工作区

文件 → 打开文件夹：左侧按目录浏览 Inkspace 笔记与 `.md` / `.markdown`，顶部多文件标签，底部显示当前路径。目录可展开、刷新，重启记住上次文件夹。每本笔记保留独立页面、缩放位置和撤销记录。Markdown 左侧编辑原文、右侧实时预览，Ctrl+S 写回原文件并保留 UTF-8 BOM 与换行格式；外部修改冲突会阻止覆盖。未保存的标签会标记圆点，关闭标签时可保存、放弃或取消。恢复文件中的标签首次保存需选择文件位置。

### 0.6.1 紧凑布局

左侧活动栏分别打开文件资源管理器和页面侧栏，重复点击可收起；记住上次视图。工具与笔参数合并为顶部一行，文件行、标签和状态栏缩小。Markdown 文件的页面侧栏显示空状态，不会自动切换文件。

## VSCodium 原生输入版 0.2.1

解压 `dist/Inkspace-VSCodium-Native-0.2.1-Windows.zip`，运行包内 `启动墨境 VSCodium.cmd`。专用宿主接入 Windows HIMETRIC 历史采样、Xournal++ 压力轮廓及原生 Cairo，保留 VSCodium 文件树、标签、Markdown 和页面侧栏。普通 VSCodium 单独安装 VSIX 无法提供原生书写。构建、使用及实测边界见 [插件说明](vscode/README.md)。原 VSCodium 安装不改动。
