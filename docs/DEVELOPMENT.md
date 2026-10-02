# 开发、测试和打包

主线：`vscode/` + `ink-engine/`。插件版本位于 `vscode/package.json`；根目录版本用于独立桌面程序，二者分别管理。

## Windows x64 环境

Node.js、npm、MinGW GCC/G++、Python、Ninja，以及 Microsoft VS Code。原生构建的来源与步骤见 `native/UPSTREAM.md` 和 `scripts/build-native.cjs`。

```powershell
npm ci
npm run build:native
npm run build
npm run build:engine
npm run start:engine:vscode
```

开发启动器使用隔离的配置目录。正常安装插件后直接打开笔记即可，无需开发启动器。

## 验证

```powershell
npm test
npm run test:engine
```

`test:engine` 验证校准及持久化，并在真实 Microsoft VS Code 内验证自动启动、300 个小数坐标采样、60 次快速打点、连续缩放、未缓存笔迹即时预览、统一位图替换、页面设置自动落盘及目录内新建笔记。结果位于 `artifacts/engine-vscode-test/result.json`。真实触控笔手感仍需实测。

保留原 VSCodium 路线时可运行 `npm run test:vscode`，需要已有原生宿主构建。

## 构建分发文件

已有原生模块和前端构建后：

```powershell
npm run dist:vscode
npm run dist:vscode:bundle
```

前者生成 Windows x64 VSIX，后者生成含插件、对应源码、安装说明和校验和的跨电脑分发包。打包不会发布 Marketplace。

生成输出不提交 Git：`node_modules/`、`dist/`、`artifacts/`、`vscode/media/`、`vscode/engine-runtime/`、原生二进制与构建缓存。用户 `.inkspace.json` 文件保持原位且被 Git 忽略。
