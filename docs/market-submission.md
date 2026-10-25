# DSH plugin catalog submission draft

**Status:** prepared only. Submit only after a public repository and tagged beta release exist and the clean-machine Desktop installation is independently verified.

- Repository name: `dsh-matlab-workbench`
- Version: `v0.1.0-beta.1` (GitHub prerelease; no npm package)
- Type/category suggestion: developer / engineering tools (verify actual catalog category at submission)
- Topics: `dsh-plugin`, `deepseek-harness`, `matlab`, `matlab-mcp-server`, `simulation`, `pid`
- Keywords: MATLAB, MCP, PID, simulation, plots, experiment comparison, CSV
- Icon: `icon.svg` (original community icon)
- License: MIT
- EN: `DSH Desktop workbench for official MATLAB MCP experiments, verified figures and numerical PID sweep comparisons.`
- ZH: `通过官方 MATLAB MCP 在 DSH Desktop 中运行 MATLAB 实验，校验图像与数值指标并对比 PID 参数扫描。`
- Links: public repository root, GitHub prerelease, Issues, README installation section (fill in once created)
- Compatibility: DSH Desktop 0.2.1-rc.2 tested; MATLAB R2025b + official MCP v0.15.0 tested; additional declared versions unverified.
- Known limits: M1 lifecycle acceptance FAIL, directory junction uninstall issue and clean-machine setup pending verification.

The [awesome-dsh-plugin contribution guidance](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) currently requests `dsh.bundle` in package.json and the `dsh-plugin` GitHub topic, then a bilingual catalog entry PR. The directory website also mentions a `data/plugins/` YAML submission path; check the repository's **current** contribution format before submitting. The in-DSH market consumes that catalog rather than accepting an entry in the market application repository itself. Do not submit the catalog entry while installation remains unverified or the public repository is absent.
