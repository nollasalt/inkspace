# 鼠标图形编辑

点击“绘图”或按 D，使用“＋ 图形”添加矩形、圆角矩形、椭圆、菱形、箭头和直线。鼠标点击图形会进入绘图模式；拖动移动，拖动边角手柄缩放，双击在图形内输入文字。再次按 D 返回之前的工具。

文字支持 Markdown 和 LaTeX，例如 `**标题**`、`$x^2$`、`$\frac{a}{b}$`。公式使用项目已有的离线 KaTeX 渲染。触控笔仍由独立 Ink Engine/Cairo 处理，可直接在图形上书写。

从图形边缘的连接点拖到另一个图形，或按住 Ctrl 选中两个图形后点击“连接箭头”。连接线会随端点图形移动、缩放。选中的图形支持 Ctrl+C / Ctrl+V；复制到新页面后，连接箭头指向复制的新图形。Delete 删除，Ctrl+Z 撤销，Ctrl+Y 重做，自动保存。

“导入 draw.io”读取 `.drawio` / `.xml` 的第一个页面，支持标准压缩和未压缩模型。“导出 draw.io”输出未压缩 mxfile，可在 draw.io 中继续编辑。当前支持标准 mxCell/mxGeometry 模型；自定义插件对象和 draw.io 专有模板不在此版本的导入范围内。

## 实现与上游

直接复用 [mxGraph 4.2.2](https://github.com/jgraph/mxgraph)，这是 draw.io 使用的图形编辑基础。没有复制完整 draw.io Web 应用；Inkspace 的工具栏、笔迹层、文件管理和保存仍由本项目提供。mxGraph 上游已归档，本项目固定版本，禁止 XML 代码求值，仅允许标准模型节点，并限制导入大小。依赖、图片及许可均本地打包。

本次 Apache-2.0 依赖与原 GPL-2.0-or-later 代码的组合以 GPL-3.0-or-later 发布。旧许可证和上游 Apache 许可证保留在 `docs/licenses`。对应源码包包含完整 mxGraph 模块源代码。
