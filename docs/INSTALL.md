# 在其他电脑安装 Inkspace 0.3.2

适用于 Windows x64 桌面版 Microsoft VS Code。建议使用当前稳定版；本机测试版本为 1.140.0。暂不提供 macOS、Linux、Windows ARM64 或浏览器版运行时。

## 推荐：安装 VSIX

1. 将 `Inkspace-VSCode-0.3.2-Windows-x64-Bundle.zip` 复制到目标电脑并解压。
2. 安装或打开 Microsoft VS Code。
3. 按 Ctrl+Shift+P，运行 `Extensions: Install from VSIX…`（从 VSIX 安装），选择 `Inkspace-VSCode-0.3.2-win32-x64.vsix`。
4. 若提示，重新加载 VS Code 窗口。
5. 打开存放笔记的文件夹，在文件栏右键选择“墨境：新建笔记”；已有笔记直接打开 `.inkspace.json`。
6. 首次点击“校准触控笔”，依次点击三个圆圈。以后同一设备与显示配置自动恢复。换电脑需要在新电脑校准一次。

也可以在已提供 `code` 命令的终端中安装：

```powershell
code --install-extension .\Inkspace-VSCode-0.3.2-win32-x64.vsix --force
```

安装包内含 Raw Input 程序、Cairo 原生模块和引擎依赖。使用时不需要安装 Node.js、编译工具或本项目源码目录；引擎由 VS Code 自带的运行时启动。

## 文件和保存

- 笔记为 `.inkspace.json`，可直接复制到其他电脑，其中保存笔迹、页面和嵌入资源。
- 校准保存在本机 VS Code 插件存储，不需要随笔记复制。
- 页面背景、颜色、间距和字号自动写入笔记；书写后仍可 Ctrl+S 手动保存。
- 引擎连接信息和日志位于 `%USERPROFILE%\.inkspace-engine`。不要分享其中的 `connection.json`，它包含本机连接令牌。

每台设备能否提供后台坐标和压力取决于触控笔及驱动。引擎已连接但校准圆圈无响应时，可更新设备驱动并提供 `service.log` 及探针计数供排查；注册成功不等于实际收到笔数据。

## 分发包内容

- `Inkspace-VSCode-0.3.2-win32-x64.vsix`：直接安装的插件。
- `Inkspace-VSCode-0.3.2-Source.zip`：对应源码、原生依赖源码和构建脚本。
- `INSTALL.md`：本说明。
- `SHA256SUMS.txt`：文件校验和。

源码包供查阅和重建，不需要解压到 VS Code 插件目录。
