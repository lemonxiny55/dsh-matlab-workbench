# DSH-MATLAB-Workbench

[English](README.en.md) · [安装 / Installation](#安装) · [真实 PID Demo](#真实-pid-实验-demo)

面向 **DSH Desktop** 的 MATLAB 工程实验工作台（社区插件，`v0.1.0-beta.3`）。Agent 通过 **MathWorks 官方 MATLAB MCP Server** 执行 MATLAB；本插件在同一 DSH 会话中准备实验、核验 MATLAB 产出的 PNG/CSV/数值指标、显示实验曲线和 PID 参数扫描对比。它不内置 MATLAB、不代替官方 MCP，也不会把图片中的像素当成精确指标。

**与通用 MATLAB MCP 桥接的区别：** 每次实验使用独立且不可覆盖的 ID；对图像做 PNG/CRC/SHA-256 校验，核对 CSV 和 MATLAB 指标来源；通过 `read_image` 让 Agent 真正获取图片附件；Desktop 有参数输入、运行/核验/加载/失败状态、单组曲线和叠加对比。Agent 仍需明确执行和检查每一步。

**Beta 状态（v0.1.0-beta.3）：** 真实 DSH Desktop（0.2.1-rc.2）→ 官方 MATLAB MCP（v0.15.0）→ MATLAB R2025b → 3 组 PID / 4 张 PNG / CSV / 指标 → Desktop 展示及 Agent 分析，已于 2026-10-25 在一台开发机完成。**下面面向新用户的独立安装流程尚未在全新环境验收**，不能据此保证所有 DSH/MATLAB 组合可用。历史 M1 正式验收为 **FAIL**；[已知限制](docs/known-limitations.md)。

## 前置条件

- Windows x64、DSH Desktop；已验证版本为 DSH Desktop 0.2.1-rc.2（`package.json` 声明兼容 0.2.1-rc.2/rc.3，但 rc.3 尚未实机验证）。
- 有效的 MATLAB 授权与可执行的 MATLAB；实测为 **R2025b**。官方 MCP Server 支持的 MATLAB 版本范围请以 [MathWorks 文档](https://github.com/matlab/matlab-mcp-server) 为准。此仓库的示例只验证 R2025b；不需要 Control System Toolbox。
- 单独安装 [官方 MATLAB MCP Server](https://github.com/matlab/matlab-mcp-server/releases)（实测 **v0.15.0**）。它和 MATLAB 本体及许可证均**不随插件分发**。
- Agent 必须能调用 `evaluate_matlab_code` / `run_matlab_file`，并支持 DSH 的 `read_image` 图片附件。

## 安装

1. 在已安装 DSH CLI 且已初始化目标 profile 的环境运行 `npx @deepseek-ai/dsh plugin --profile desktop add dsh-matlab-workbench@beta`。此命令从 npm 安装 Beta dist-tag 指向的包；如你的 DSH Desktop 使用其他 profile 名称，请把 `desktop` 替换为该名称。源码目录安装仍可用于开发，不是本次发布的安装验收证据。
2. 在 Windows 安装官方 MATLAB MCP Server v0.15.0 的 `matlab-mcp-server-windows-x64.exe`。将其所在目录与 MATLAB 的 `bin` 目录加入当前 Desktop 可见的 `PATH`。可先从同一 Windows 环境检查 `matlab-mcp-server-windows-x64.exe --version` 和 `matlab -batch "disp(version)"`。PATH 改动可能要重新启动 Desktop 才能生效；**保存当前会话后**再正常重启。
3. **只有 Desktop 尚未连接 MATLAB MCP 时**，在 Desktop **设置 → 插件**的本地目录安装入口选取 `integration/matlab-mcp-gate`。这是开源的可编辑**连接示例**，使用 PATH 上的官方 MCP，可查看 [连接配置](integration/matlab-mcp-gate/cordis.patch.yml)，默认 `new/nodesktop`；它不含私有文件路径。已有一个 `matlab` server 的用户**跳过此步**，避免重复注册。需要定制参数时，先复制该示例到自己的配置目录后修改（例如绝对程序路径），不要改 DSH 核心。
4. 安装后按 DSH Desktop 的 profile/插件管理流程激活该 bundle。Bundle 安装或更新可能需要正常重启 Desktop；先保存会话，且不要重复添加 `matlab` MCP 连接。此 Beta 尚未完成全新 Desktop 环境验收。
5. 确认当前 Agent 的可用工具中出现 `evaluate_matlab_code`、`run_matlab_file`、`dsh_matlab_prepare_sweep`、`dsh_matlab_collect_sweep`，以及 Workbench 的「PID 参数准备」「MATLAB 图像」「PID 实验对比」页签。在有写入权限的本地工作区开启会话。若有 MCP 启动错误，检查二进制和 MATLAB 的 PATH、Windows 进程环境及是否重复注册；不要盲目重复安装或重试有写入的 MATLAB 调用。

**注意：** 本机测试曾使用独立的私有 Gate 接线与本地 `link:`；这不是新用户的安装依赖。上面的可移植连接示例是按相同 DSH MCP Client 配置格式提供，**尚未在一台全新 Desktop 做独立安装验收**。本项目不自动修改 Desktop profile、MATLAB `startup.m` 或其他插件。

## 真实 PID 实验 Demo

打开「PID 参数准备」，每行输入一组 `Kp,Ki,Kd`，然后单击「检查并生成 Agent 指令」，把生成的消息发到**同一会话**：

```text
1,0.5,0.2
3,1,0.5
2,0.8,0.9
```

Agent 调 `dsh_matlab_prepare_sweep` 得到 `setupCode`、`executeCode`、`sweepId`；经**官方** `evaluate_matlab_code` 执行代码，检查完成标记；再调 `dsh_matlab_collect_sweep` 验证 3 组 CSV/指标/PNG 和叠加图；最后对返回的**每张** PNG 调 `read_image`。Desktop 页面随后按会话展示曲线与对比指标。准备阶段不会执行 MATLAB；未核验完整产物不能视为成功。

以下是 2026-10-25 **真实 MATLAB R2025b 运行**产生的 12 秒窗口示例指标（不是 AI 看图估算）：

| Kp, Ki, Kd | IAE ↓ | ISE | 2% 调节时间 | 超调 |
| --- | ---: | ---: | ---: | ---: |
| 1, 0.5, 0.2 | 1.9249665 | 0.6647999 | 窗口内未确定 | 0% |
| 3, 1, 0.5 | **0.9647213** | 0.2703758 | 9.10 s | 0% |
| 2, 0.8, 0.9 | 1.2256675 | 0.4373808 | 8.71 s | 0% |

组 2 在本次窗口内 IAE 最低，组 3 调节更快。示例使用 MATLAB `ode45`，对象 `y''+2ζωy'+ω²y=ω²u`（ζ=0.48，ω=3 rad/s），并非通用 PID 自动整定；结果不代表真实硬件性能。结果文件位于会话工作区的 `.dsh-matlab/`，请勿上传包含个人会话数据的整个工作区。

## 开发、反馈与限制

`npm run check` 执行源码语法检查，`npm test` 执行不依赖私有验收图的 Node 测试；`npm run test:matlab:m2` 是可选的独立 MATLAB 测试（本机 MATLAB 需在 PATH，可设 `MATLAB_EXE`），**无法替代 Desktop MCP 端到端验收**。Node 24 是开发测试基线，插件运行本身没有第三方 npm 依赖。

问题反馈请使用本项目 GitHub 仓库的 **Issues**，注明 DSH Desktop / MATLAB / MCP 版本、所见步骤及脱敏错误，不上传会话、令牌或私有日志。仓库建议 Topics：`dsh-plugin`、`deepseek-harness`、`matlab`、`pid`、`simulation`。社区项目，**非 DeepSeek/DSH 或 MathWorks 官方产品，不获其背书**。MATLAB® 属于 MathWorks；使用者须自行遵守 MATLAB 授权条款。本项目源码采用 [MIT](LICENSE)。

**已知限制：** M1 历史生命周期/停用页签残留未明确根因，部分目录链接卸载后可能遗留 junction；取消或超时并不证明 MATLAB 已停止，不能自动重跑同一有写入任务。见 [限制与验收事实](docs/known-limitations.md)。测试中仅验证一套本机组合；`nodesktop` 不保证所有 MATLAB 图形操作都无窗口。

