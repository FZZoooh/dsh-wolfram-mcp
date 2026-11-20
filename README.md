# Wolfram Mathematica for DSH

Connects a local Wolfram Mathematica kernel to DeepSeek Harness as an MCP tool
server. The Wolfram/AgentTools paclet already ships an MCP server, so this
bundle mounts the in-box `@deepseek-ai/dsh-mcp-client` bridge against
`wolfram.exe`; it does not implement a protocol of its own.

The kernel path is **not** hard-coded and is never guessed. It is this plugin's
own configuration, edited from the Plugins UI, and the bridge entry is created
at runtime only while a path is configured.

## Install

Add the spec `github:FZZoooh/dsh-wolfram-mcp` in **Plugins > Add plugin**, or
install it with the `plugin_manager` tool (`install_bundle` with the same
spec). The profile then depends on the Git repository, so the local checkout
can be moved or deleted. To pick up new commits, reinstall the bundle from the
same spec.

## Configure the kernel path

1. Open **Plugins** in the sidebar and select **Wolfram Mathematica**.
2. On the bundle's page, between its description and its components, enter the
   absolute path to the kernel executable in **Kernel executable** and save.

On Windows the executable is normally
`<Mathematica installation>\wolfram.exe`; use the exact file path, not the
Start-menu shortcut or `wolframscript.exe`. The plugin accepts any path the
launching user can execute. Clearing the field removes the override and stops
the tools while the plugin stays enabled.

Saving the field updates the running plugin in place (the field is volatile), so
the bridge reconnects without restarting DSH. A changed path starts a fresh
kernel; the previous one stops with the old bridge entry.

**Restart kernel** on the same page rebuilds the bridge and starts a fresh
kernel without touching the saved path. Use it when evaluations stop
responding: a hung evaluation keeps the kernel busy, and calls behind it queue
until they time out.

## Reliability

- The Wolfram MCP server constrains each evaluation to 60 seconds by default
  (`TimeConstraint -> 60` in its `WolframLanguageEvaluator`); the agent can pass
  a larger `timeConstraint` argument for a longer computation. The transport
  additionally caps one call at five minutes.
- A cold start, or the first start after a paclet update, can hang before the
  MCP handshake completes. If no `mcp__wolfram__` tool exists 75 seconds after
  the bridge is created, the plugin rebuilds it, up to two times, and logs each
  attempt. The rebuild also clears the hung child kernel.
- Nothing retries a tool call that the kernel never answers; the **Restart
  kernel** control is the recovery path.

## How it works

- The bundle's only row is this plugin, with two configuration fields,
  `kernelPath` and `restart`.
- On activation, and whenever either field changes, the plugin creates, removes
  or rebuilds an entry named `wolfram-mcp-bridge` on the root Loader, pointing
  at `@deepseek-ai/dsh-mcp-client` with the configured command. Runtime-created
  entries are in-memory: they are rebuilt from the saved path on every launch
  and never written into the profile patch.
- With no path, no bridge entry exists and no kernel process starts.

## Tools

After the bridge connects the agent sees tools named `mcp__wolfram__<tool>`.
With the default `WolframLanguage` tool set:

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

## Requirements

- Mathematica 14.3 or later with the `Wolfram/AgentTools` paclet (2.1.17 here,
  verified with 15.0.1) and an activated license.
- The kernel executable path, entered once through the configuration page.

## Limitations

- Each configured bridge starts one serving kernel process; the tools appear a
  few seconds after startup, or after a bridge rebuild.
- A single evaluation is constrained to 60 seconds by the server unless the
  caller passes a larger `timeConstraint`; the transport caps a call at five
  minutes.
- A missing or invalid path leaves the MCP connection failing with a logged
  error; the plugin itself keeps running. Reopen the configuration page to
  correct it.
- A crashed or wedged kernel is not detectable as such: calls simply time out
  until the bridge is rebuilt.

## Troubleshooting

Check the kernel outside DSH first:

```powershell
& '<Mathematica installation>\wolfram.exe' -run 'Print[$Version]' -noinit -noprompt
```

If that works but `mcp__wolfram__*` tools are missing, confirm the saved path in
**Plugins > Wolfram Mathematica > Configure** and that the Wolfram/AgentTools
paclet is present in that installation.
