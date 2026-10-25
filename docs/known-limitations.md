# Beta limitations and historical acceptance

The **M1 formal acceptance decision remains FAIL**. An earlier Desktop disable operation left a visible MATLAB Workbench tab after the plugin had been disabled. The underlying cause was not conclusively identified. Separately, the Desktop package manager could leave a directory junction after uninstalling a local `link:` package. Successful later tests do **not** retroactively change this historical acceptance decision.

Do not remove a junction recursively: determine the exact link target and active registration before cleanup. Disable, uninstall and reinstallation are different operations. If a Desktop restart is needed, save the session and use the normal application lifecycle.

The M3 validation of 2026-10-25 used a real DSH Desktop 0.2.1-rc.2 Agent, official MATLAB MCP v0.15.0 in `new/nodesktop` mode and MATLAB R2025b. Both `evaluate_matlab_code` and `run_matlab_file` completed. A three-controller PID sweep produced CSV, MATLAB metrics, three run plots and an overlay. The Desktop Figures and PID comparison tabs displayed the artifacts, and Agent analysis used the attached images and MATLAB metric files. Node regression tests passed 24/24; an independent MATLAB regression suite also passed. These facts cover **one configured local system** only.

**Unverified for the public beta:** a clean-machine Desktop installation using the portable connection example, DSH Desktop 0.2.1-rc.3, alternative MATLAB releases, remote workspaces and unusual system PATH configurations. In MATLAB MCP, failures can appear as ordinary textual responses; `isError=false` alone does not establish success. Timeout/cancellation does not prove that MATLAB execution stopped, so do not automatically rerun writes. Figure and CSV integrity checks do not sandbox arbitrary user MATLAB code.

Historical full M0/M1 logs, profiles, screenshots and artifacts were intentionally **excluded** from the public snapshot to protect private local data. Their original records remain unchanged in the private development repository.
