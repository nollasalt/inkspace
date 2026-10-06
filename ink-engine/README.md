# 独立 Ink Engine + 普通 VS Code

0.6.0 已提供普通 VS Code 安装包 `dist/Inkspace-VSCode-0.6.0-win32-x64.vsix`，包含引擎运行时、Raw Input 探针、Cairo 模块及所需依赖；无需项目源码目录。构建：`node scripts/build-vscode.cjs` 后运行 `node scripts/package-vscode-engine.cjs`。安装后直接打开 `.ink` 或旧 `.inkspace.json` 文件即可自动启动引擎。

当前验证版使用未修改的 Microsoft VS Code 和标准 Custom Editor 插件。无需修改 Electron 主进程或注入 IDE 窗口钩子。

数据路线：Windows HID Raw Input 探针 → 独立 Node 服务 → 本机 WebSocket → 插件 Webview；独立 Cairo 子进程负责压力轮廓栅格化。保存、撤销和页面列表仍通过标准 VS Code 插件 API 处理。

## 启动

已有 Node、MinGW、Cairo 原生模块和 Microsoft VS Code 的本项目环境：

```powershell
npm run build:engine
npm run start:engine:vscode
```

启动器复用正常运行的服务，否则在后台启动服务。验证窗口使用单独的用户目录和测试笔记，不覆盖日常 VS Code 设置。直接在插件中打开笔记时，也会自动检查连接并启动或复用引擎，无需先运行启动器。服务连接信息和日志保存在 `%USERPROFILE%\.inkspace-engine`，服务仅监听 `127.0.0.1`，HTTP/WebSocket 使用随机令牌鉴权。

点击画布顶部「校准触控笔」，依次用笔点击三个圆圈。校准通过浏览器点击位置与 HID 原始坐标建立仿射映射；书写轨迹随后使用原始 HID 坐标和压力，而非浏览器的书写事件。校准点不会保存为笔迹。写字后按 Ctrl+S 保存。

验证笔记：`artifacts/engine-vscode-demo/workspace/触控笔验证.inkspace.json`。校准保存在 VS Code 插件的全局存储中，按设备路径的稳定标识与显示配置匹配；重开画布或重启引擎后，在收到该设备报告时自动恢复。首次使用需校准一次，更换设备或显示配置后需重新校准。当前只验证本机笔设备，不保证所有触控笔提供相同的 Raw Input 报告，也尚未映射笔尾橡皮擦。

VS Code 文件栏右键可选择「墨境：新建笔记」，直接在所选文件夹创建；右键文件则使用其所在文件夹。重名时自动编号。命令面板调用时优先使用当前笔记或文本文件所在目录，否则使用工作区目录。保留原 `.inkspace.json` 格式以兼容现有笔记。页面背景、颜色、间距和字号修改后自动写入笔记文件。

缩放时保留并变换已有 Cairo 位图，异步生成清晰的新位图后替换；已完成笔迹的绘制任务最多同时运行 4 个，过时视图任务跳过。连续五次缩放的延迟渲染测试验证每次缩放都保留可见笔迹，最终像素与完整重绘一致。

常见笔迹完整位图最多覆盖 2048×2048、约 100 万像素，因此相同缩放下移动可复用笔迹，移出视口后再移回不会仅因位置变化重绘；较大笔迹仍按视口裁剪，控制单次内存和绘制成本。实际安装包测试覆盖移动时零栅格化请求、设置自动落盘和目录内创建笔记。

服务可在终端前台运行：`npm run start:engine`，用 Ctrl+C 结束。后台启动的服务持续运行，以便复用。

## 验证结果

`npm run test:engine` 自动在独立测试目录启动测试引擎，并在完成后关闭；不需要手动启动服务。测试模式开放合成采样诊断，常规启动不开放。测试同时覆盖校准持久化、设备句柄改变和 DPI 变化。

2026-10-02，Microsoft VS Code 1.140.0 自动验证通过：无宿主钩子；300 个连续小数坐标完整保留；60 次快速打点在乱序绘制任务完成后像素完全一致；Cairo 返回像素与原生直接渲染一致；笔记保存成功。结果位于 `artifacts/engine-vscode-test/result.json`，其中 `physicalPenTested:false` 明确表示该自动测试没有替代真实触控笔验证。原 VSCodium 路线回归测试也通过。

此前本机独立探针真实测试收到 5022 个后台坐标/压力报告、30 对落笔/抬笔事件和 0 个解码错误。这证明后台采集可行；接入 VS Code 后的真实坐标和手感仍需上述校准书写测试确认。


新笔记默认 `.ink`，采用校验、压缩的二进制增量记录。普通 VS Code 的自定义二进制编辑器直接追加变化，保存不经过 JSON 文本文档；精确笔迹和原生输入路径保持不变。
