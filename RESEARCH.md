# 笔迹与桌面实现记录

前半部分为 0.3.x 历史记录；当前 0.4.0 原生路线见文末。

研究的 [Xournal++ 官方源码](https://github.com/xournalpp/xournalpp) 版本为 `9882ffaaf2c012a1de4c33161eb4284468d84b9d`。本地只读研究副本在 `research/xournalpp`，不打包进产品。

阅读了 `src/core/view/StrokeViewHelper.cpp`、`src/core/model/StrokeContour.cpp` 和 `src/core/view/overlays/StrokeToolView.cpp`。无压力路径直接描边；压力路径在屏幕上使用轮廓填充，在 PDF 中可分段描边；实时视图缓存已写内容，只追加新点并标记局部脏区域。轮廓连接处理宽度变化、外圆弧和内侧连接。

本项目没有移植这些 C++ 源文件。独立实现压力折线轮廓与圆形连接，保留原始点及压力，使用 Path2D 栅格器与显示器原生像素密度的覆盖抗锯齿。边缘不再受上一版固定 0.08 世界单位的直线步长限制。局部重新合成避免半透明高亮反复叠加。

桌面选择 Electron，以复用公式、Markdown 和 PDF 文字层。当前运行时支持 pointerrawupdate 和合并采样。输入仍由 Chromium/Windows 链路提供；并未实现 OneNote 专有预测算法或系统级手掌拒绝。

连续缩放通过合成图层预览，停止输入 120ms 后重绘一次。极小文字保留半倍布局后整体缩小，避免极小字号导致换行变化；常用倍率使用原生字号排版。

PDF 使用 [Mozilla PDF.js](https://mozilla.github.io/pdf.js/examples/) 页面和文字层，JSON 保留原始 PDF。[pdf-lib](https://pdf-lib.js.org/) 导出保留原文文字、矢量笔迹和透明高亮；公式/代码文本框输出高清图片。旋转及裁剪框参与坐标转换。批注属于页面内容，尚非标准可编辑 Annotation 对象。

桌面使用隔离上下文、沙箱、受限 IPC 和本地自定义协议，依据 [Electron 官方安全文档](https://www.electronjs.org/docs/latest/tutorial/security)。产品不加载远程脚本。

自动测试能验证几何、布局、PDF 文字和渲染行为，不能证明真实触控笔延迟与手感达到 Xournal++ 或 OneNote。

0.3.1 修正：在实际 Electron 离屏合成中，同一笔迹直接按屏幕密度绘制有 821 个边缘过渡像素；3 倍画布经 CSS 缩小只剩 212 个。固定超采样后 CSS 缩小使覆盖抗锯齿退化，因此撤掉该处理。对照在 artifacts/raster-density.png（左：修正，右：旧方式）。这不是触控笔延迟测试。深度缩放下路径保留 15 位有效数字，移除了固定世界坐标小数位量化；没有人为缩放范围上限。

0.3.2：另读用户克隆仓库的 StrokeHandler、StrokeStabilizer，确认屏幕坐标先采样后除以倍率。移除逐坐标夹紧的曲线插值，避免把量化坐标变成水平平台和弯曲连接。低于 50% 绘制时，使用最多 1.25 输入屏幕像素的方向走廊重建；真实转折及压力变化结束当前段，原始坐标保留。实际 WRONG 文件有 342 个点、24.53253 世界单位量化间距，由 step 推得采样倍率 4.07622%；全部压力为 1。旧文件无需改写即可按新轮廓显示。


## 0.3.3 笔迹引擎修复

重新核对用户本地 `xournalpp/src/core/control/tools/StrokeHandler.cpp`、`StrokeStabilizer.cpp`、`src/core/model/StrokeContour.cpp`、`src/core/view/overlays/StrokeToolView.cpp`。Xournal++ 默认可以不启用稳定器；采样与可选稳定处理独立，轮廓/遮罩局部更新负责显示。此次按这些原则独立实现 JavaScript 修复，没有移植 GPL C++ 源文件。

- 新笔迹标记为 `brush: "raw-contour"`。取消固定世界距离丢点和按低倍率自动进行的方向走廊拟合，保留输入小数坐标、转折、微小位移及原地压力变化。旧 `detail` / `contour` / 无 brush 文件保留旧几何，WRONG 原始数据不改写。
- 压力段采用两个圆盘的外公切线和圆弧形成闭合轮廓；大圆包含小圆时仅需大圆，避免宽度快速变化时的肩部突起。保留既有笔宽映射。
- raw 和 move 共用采样入口，过期合并样本和相同坐标/压力去重。不再仅因浏览器声明支持 raw 就丢弃全部 move。保留合法零压力落笔，忽略脱离接触后的零压力悬停及抬笔坐标，避免释放事件的整数坐标产生尾钩。
- 局部 128 设备像素图块保存路径并重绘并集，避免逐段 source-over 反复叠加抗锯齿覆盖。实时和静态显示共用图块划分，网格随画布平移，避免平移时路径分组变化。缩放和显示密度变化重建缓存。
- Chromium 的 GPU 与 CPU 栅格路径在细线覆盖率上不同：排查时实时/最终图层出现最大 72/255 的 alpha 差异。墨迹及场景缓冲 Canvas 显式使用 `willReadFrequently: true` 请求软件栅格化，保证覆盖一致；平移/连续缩放仍使用合成图层预览。该选择可能增加大场景精细重绘的 CPU 成本。

本轮 Electron 回归在 4%、36%、100%、400% 各输入 500 个含压力变化的样本，实时/抬笔后 alpha 差异均为 0。软件栅格化无法恢复硬件未提供的小数坐标；旧文件中已经量化的细节也无法恢复。真实笔输入手感仍需设备验收。


## 0.4.0：改用原生输入和 Xournal++ / Cairo

0.3.3 的“实时/提交图像一致”不能证明输入精度足够。用户实际笔输入仍有阶梯，因此本轮不再通过 JavaScript 平滑或分块栅格调参解决。

- 实际移植本地 Xournal++ `StrokeContour.cpp` 的实线压力轮廓（相同 commit），保留圆弧、内外侧连接与笔端逻辑；位置/压力数据结构改为独立适配。SVG 导出使用相同操作的 JS 适配器。来源、修改范围、GPL 条款见 `native/UPSTREAM.md`。
- 静态编译 Cairo 1.18.4 + Pixman 0.43.4 到 Node-API 模块。新桌面笔迹由 Cairo 生成覆盖像素，Canvas 只合成这些像素，不执行新笔迹的几何栅格化。局部重画最后接头和新增部分，提交时使用同一原生引擎。
- 在 Electron 主进程的窗口及子 HWND 上接收 Windows `WM_POINTER`，在消息仍有效时读取 `GetPointerPenInfoHistory`，按时间顺序处理历史。依据 `GetPointerDeviceRects` 将 HIMETRIC 映射到物理屏幕坐标，然后换算窗口/CSS/世界坐标，全程保留 double 精度。公式核对 GTK 3 WinPointer 后端及 Microsoft 文档。
- 浏览器 pen 事件不与原生流混用。驱动没有发出原生笔事件时明确显示回退状态；新 JSON 的 `inputSource` 记录 `windows-himetric` / `windows-pixel` / `browser`。
- Electron 继续提供已有 Markdown/PDF/无限画布界面。这是原生笔迹子系统集成，并非完整 GTK 应用重写。未实现旧 Wintab 驱动 API。

参考：[Microsoft POINTER_INFO](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-pointer_info)、[历史采样](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getpointerpeninfohistory)、[设备标定矩形](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getpointerdevicerects)、[GTK WinPointer](https://github.com/GNOME/gtk/blob/gtk-3-24/gdk/win32/gdkdevicemanager-win32.c)。

自动测试没有收到真实硬件笔包（native status 的 samples/preciseSamples 为 0），不能据合成采样宣称实际触控笔已达到 Xournal++ 手感。实际使用后界面的原生输入状态可以确认是否真正启用了该路线。
