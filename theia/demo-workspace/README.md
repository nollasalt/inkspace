# Inkspace · Theia 验证工作区

左侧文件树、标签、文本编辑、查找替换、文件重命名、终端和 Markdown 预览由 Eclipse Theia 提供。

在“查看”菜单选择 **Inkspace 手写验证**，或按 **Ctrl+Alt+I**，切回手写页面。打开 `.inkspace.json` 文件会进入手写页面。

请用真实触控笔验证：

- 在同一区域快速打点，确认没有点丢失。
- 连续书写、频繁抬笔，观察是否有停顿。
- 缩放和平移后继续书写，检查笔尖和笔迹是否重合。

验证版与独立 Inkspace 使用不同配置目录。手写内容需要显式保存。

## Markdown 示例

| 功能 | 提供方 |
| --- | --- |
| 文件编辑 | Theia 工作区 |
| 原生笔输入 | Inkspace |
| 压力轮廓 | Xournal++ |
| 笔迹栅格 | Cairo |

```javascript
const message = '编辑体验由 Theia 提供';
console.log(message);
```

![本地图片验证](sample.svg)
