# DSH-MATLAB-Workbench

[简体中文](README.md) · [Installation](#installation) · [Real PID demo](#real-pid-sweep-demo)

An independent **DSH Desktop** community plugin (`v0.1.0-beta.2`) for MATLAB experiments. The Agent executes code through the **official MathWorks MATLAB MCP Server**; Workbench prepares session-owned experiments, verifies MATLAB-generated PNG/CSV/numeric metrics, attaches images to the conversation, and displays PID sweep comparisons. It does not bundle MATLAB, replace the official MCP server, or estimate precise metrics from image pixels.

**Beyond a generic MCP bridge:** unique immutable experiment IDs; PNG CRC and SHA-256 integrity checks; MATLAB-sourced metrics; explicit Agent `read_image` attachments; PID gain validation; progress, error and uncertain-outcome states; individual plots and overlays.

**Beta v0.1.0-beta.2 evidence:** On October 25, 2026, one real DSH Desktop 0.2.1-rc.2 session used official MATLAB MCP v0.15.0 with MATLAB R2025b, generated 3 runs / 4 PNGs, verified CSV and metrics, displayed the comparison tabs and supported Agent analysis. **A fresh-user installation of the portable connection example below has not yet been verified.** Historical M1 acceptance remains **FAIL** due to unresolved lifecycle issues; see [known limitations](docs/known-limitations.md).

## Requirements

- Windows x64 and DSH Desktop. Tested: 0.2.1-rc.2. The manifest also allows 0.2.1-rc.3, whose real Desktop installation has **not** been tested.
- An independently licensed, installed MATLAB. Tested: **R2025b**. Consult [MathWorks](https://github.com/matlab/matlab-mcp-server) for the MCP server's wider MATLAB version support. This example uses base MATLAB `ode45`, with no Control System Toolbox.
- The separately installed [official MATLAB MCP Server](https://github.com/matlab/matlab-mcp-server/releases) (tested **v0.15.0**). Neither its binary nor MATLAB or a license is distributed with this plugin.
- A DSH Agent that exposes `evaluate_matlab_code`, `run_matlab_file`, and the host's `read_image` attachment tool.

## Installation

1. In an environment with the DSH CLI installed and the target profile initialized, run `npx @deepseek-ai/dsh plugin --profile desktop add dsh-matlab-workbench@beta`. This installs the package selected by the npm `beta` dist-tag. Replace `desktop` if your DSH Desktop uses a different profile name. A local source directory remains useful for development, but is not evidence of the published-package install.
2. Install the official Windows binary named `matlab-mcp-server-windows-x64.exe` from its v0.15.0 release; put its directory and MATLAB's `bin` directory on the PATH seen by Desktop. Test from the same Windows environment with `matlab-mcp-server-windows-x64.exe --version` and `matlab -batch "disp(version)"`. Restart Desktop normally **only after saving your active session** if PATH changes need to be picked up.
3. **If there is no existing MATLAB MCP connection:** in Desktop **Settings → Plugins**, use the local-directory installer for `integration/matlab-mcp-gate`. This editable, public [connection example](integration/matlab-mcp-gate/cordis.patch.yml) registers **one** `matlab` stdio server using the official executable on PATH, in `new/nodesktop` mode. It contains no private or machine-specific paths. **Skip this step if a `matlab` server is already registered.** To customize binary paths/flags, copy the example into your own configuration directory and edit that copy; do not patch DSH core.
4. Activate the installed bundle through the DSH Desktop profile/plugin workflow. Bundle installation or updates may require a normal Desktop restart; save active sessions first and do not register a second `matlab` MCP connection. This Beta has not yet passed a fresh Desktop installation test.
5. Confirm the Agent sees `evaluate_matlab_code`, `run_matlab_file`, `dsh_matlab_prepare_sweep` and `dsh_matlab_collect_sweep`; check for **PID Input**, **MATLAB Figures**, and **PID Experiments** tabs. Use a session workspace with local write access. On startup failure, inspect the server executable/PATH and existing `matlab` registrations before changing configuration. Avoid automatically retrying MATLAB writes.

The one-machine M3 test used a private Gate wiring configuration, but **users do not depend on that setup**. The public connection example uses the same DSH MCP client settings format; **it has not yet passed a clean-machine installation test**. This plugin does not edit the Desktop profile, MATLAB `startup.m`, or unrelated plugins automatically.

## Real PID sweep demo

In **PID Input**, enter one `Kp,Ki,Kd` set per line, validate, and send the generated Agent message in the **same Desktop session**:

```text
1,0.5,0.2
3,1,0.5
2,0.8,0.9
```

The Agent runs `dsh_matlab_prepare_sweep`, executes the returned `setupCode` and `executeCode` with the **official** `evaluate_matlab_code`, confirms the completion marker, calls `dsh_matlab_collect_sweep` to verify all CSV/metrics/plots and the overlay, then calls `read_image` for **every** returned PNG. Preparation is not execution. Unverified/incomplete sweeps must not appear as completed comparisons.

Actual MATLAB R2025b metrics from the October 25, 2026, real Desktop demonstration, for a 12-second simulation window:

| Kp, Ki, Kd | IAE ↓ | ISE | 2% settling | Overshoot |
| --- | ---: | ---: | ---: | ---: |
| 1, 0.5, 0.2 | 1.9249665 | 0.6647999 | Undetermined in window | 0% |
| 3, 1, 0.5 | **0.9647213** | 0.2703758 | 9.10 s | 0% |
| 2, 0.8, 0.9 | 1.2256675 | 0.4373808 | 8.71 s | 0% |

Controller 2 has the lowest window IAE; controller 3 settles sooner. The fixed example plant is `y''+2ζωy'+ω²y=ω²u` (ζ=0.48, ω=3 rad/s), integrated with base MATLAB `ode45`. These are not hardware results or universal tuning recommendations. Session outputs are stored in `.dsh-matlab/`; do not publish the entire private session workspace.

## Development, feedback, limits

Run `npm run check` for syntax and `npm test` for Node regression tests using synthetic, non-private fixtures. `npm run test:matlab:m2` is an optional **standalone MATLAB** integration test (MATLAB on PATH or `MATLAB_EXE`) and is **not** a Desktop MCP acceptance test. Node 24 is the tested development environment; the plugin uses no third-party runtime npm packages.

Please file issues through the project's GitHub **Issues** page with sanitized reproduction steps and DSH/MATLAB/MCP version numbers, never tokens or private session logs. Suggested GitHub topics: `dsh-plugin`, `deepseek-harness`, `matlab`, `pid`, `simulation`. This is an **unofficial community project** unaffiliated with and not endorsed by DSH/DeepSeek or MathWorks. MATLAB® is a MathWorks trademark; users need their own MATLAB authorization and must follow its license. Project code: [MIT](LICENSE).

**Known limitations:** the historical M1 disable/tab lifecycle failure remains unresolved; `link:` uninstallation can leave a junction; cancelling or timing out a MATLAB MCP request does not prove execution stopped. See [known limitations and evidence scope](docs/known-limitations.md). Only one Windows/DSH/MATLAB combination has been verified. `nodesktop` does not guarantee that all MATLAB graphics commands avoid windows.

