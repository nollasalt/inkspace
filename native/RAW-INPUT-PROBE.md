# Raw Input 后台触控笔验证

这是独立 Windows x64 程序，使用 `RIDEV_INPUTSINK` 注册标准外置笔、内置笔及带笔压字段的厂商自定义集合。只记录触控笔坐标、压力、接触和悬空状态，不注册键盘/鼠标，不使用全局钩子，不修改 IDE 或写入设备。

构建：`node scripts/build-raw-input-probe.cjs`，需要已有 MinGW G++。

程序：`dist/RawInputProbe/RawInputProbe.exe`。双击后默认后台运行 300 秒，结果写入程序旁的 `report` 文件夹。使用 `--show` 可显示计数窗口，`--out=绝对目录` 指定记录目录，`--duration=秒数` 指定时长，0 表示持续运行。

`RawInputProbe.exe --stop` 结束探针并写入最后的状态。2026-10-02 本机真实设备验证已收到后台坐标、压力、悬空及成对的接触事件；结果只证明这台设备的后台采集可行，不代表所有设备或 IDE 接入后的效果。

切到其他程序，用真实触控笔悬空移动、轻重交替书写、连续快速打点。`status.json` 的 `backgroundXYPressureReports` 增长，才说明后台实际收到同时包含坐标和压力的报告。`contactDowns` / `contactUps` 应与操作相符；`samples.jsonl` 保存前 10000 个笔报告，计数不受记录上限限制。

注册成功和设备描述中的字段不等于真实样本接收成功。没有收到报告时，需要区分未操作设备、测试超时、当前设备不暴露该路径等情况。该探针尚不做屏幕映射、数据传输和笔迹绘制，不能证明接入 IDE 后的书写延迟。

参考：[Raw Input 概览](https://learn.microsoft.com/en-us/windows/win32/inputdev/about-raw-input)、[注册选项](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-rawinputdevice)、[HID 描述数据](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getrawinputdeviceinfow)。
