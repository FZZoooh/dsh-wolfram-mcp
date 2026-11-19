# Wolfram Mathematica for DSH

Connects a local Wolfram Mathematica kernel to DeepSeek Harness as an MCP tool
server. The Wolfram/AgentTools paclet already ships an MCP server, so this
bundle does not implement a protocol of its own: it mounts the in-box
`@deepseek-ai/dsh-mcp-client` bridge against `wolfram.exe` and lets the agent
call the kernel.

## Install

Add the spec `github:FZZoooh/dsh-wolfram-mcp` in **Plugins > Add plugin**, or
install it with the `plugin_manager` tool (`install_bundle` with the same
spec). The profile then depends on the Git repository, so the local checkout
can be moved or deleted. To pick up new commits, reinstall the bundle from the
same spec.

## Requirements

- Mathematica 14.3 or later with the `Wolfram/AgentTools` paclet (2.1.17 here,
  verified with 15.0.1) and an activated license.
- Windows, with the kernel at `D:\Applications\Mathematica15.0\wolfram.exe`
  (edit `command` in `cordis.patch.yml` for another installation directory).

## Tools

After activation the agent sees tools named `mcp__wolfram__<tool>`. With the
default `WolframLanguage` tool set:

| Tool | Purpose |
|---|---|
| `WolframLanguageEvaluator` | Evaluate Wolfram Language code in a persistent kernel |
| `WolframLanguageContext` | Read the current session context and definitions |
| `SymbolDefinition` | Show a symbol's definition |
| `ReadNotebook` / `WriteNotebook` | Read and write `.nb` notebooks |
| `CodeInspector` | Lint Wolfram Language code |
| `TestReport` | Run a test file and report results |

`WolframLanguageEvaluator` keeps state within a session, so variables defined
in one call remain available in the next.

## Configuration

`cordis.patch.yml` holds one `dsh-mcp-client` row. After installation you can
edit the same row in **Settings > Plugins**; either path needs a DSH restart so
the new configuration is loaded. Change these fields:

- `command` — path to `wolfram.exe` (or `wolframscript.exe`).
- `env.MCP_SERVER_NAME` — `WolframLanguage` (coding), `Wolfram` (adds
  `WolframAlpha`), or `WolframPacletDevelopment` (adds paclet tools).
- `toolCallTimeoutMs` — default 300000 ms here instead of the client's 60000 ms,
  because symbolic integration and ODE solving are slow.
- `startupTimeoutMs` — default 120000 ms here; a cold kernel plus paclet load
  takes seconds, and the client negotiates through an extra probe process.

After editing the patch, restart DSH so the new configuration is loaded.

## Limitations

- Every DSH launch starts its own kernel process; the tools appear a few
  seconds after startup, and two kernels (probe plus serving process) are
  started per launch.
- A single evaluation can run for up to five minutes; longer work should be
  split.
- `failOnStartupError` stays at its `false` default, so a missing kernel or an
  invalid license leaves the plugin enabled with no `mcp__wolfram__*` tools and
  only a logged error. If the tools do not appear, run the kernel command under
  Troubleshooting, check `command` and `MCP_SERVER_NAME`, then restart DSH.
  Disable the plugin to stop kernels from starting at all.

## Troubleshooting

Check the kernel outside DSH first:

```powershell
& 'D:\Applications\Mathematica15.0\wolfram.exe' -run 'Print[$Version]' -noinit -noprompt
```

If that works but `mcp__wolfram__*` tools are missing, confirm the `command`
path and `MCP_SERVER_NAME`, then restart DSH. The MCP client logs the failure
cause at startup.
