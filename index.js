/**
 * Owns the Wolfram Mathematica MCP bridge for this bundle.
 *
 * The kernel executable is ordinary user configuration: it lives in this
 * plugin's own `config.kernelPath`, edited from the Plugins UI, and no path is
 * hard-coded here. The official `@deepseek-ai/dsh-mcp-client` bridge is created
 * on the root Loader at runtime (in-memory, recreated every boot) so an
 * unconfigured plugin starts no process at all.
 *
 * The field is `volatile()`, which is what makes it editable from the Plugins
 * row form without remounting this plugin; a committed change arrives as
 * `loader/volatile-update` and rebuilds the bridge entry with the new path.
 */
import z from '@deepseek-ai/schemastery'

/** Entry id of the runtime bridge; it only exists while a kernel path is set. */
const BRIDGE_ID = 'wolfram-mcp-bridge'

/** Stable MCP namespace: tools appear as `mcp__wolfram__<tool>`. */
const SERVER_NAME = 'wolfram'

/** Start the Wolfram/AgentTools MCP server without loading an init file. */
const BRIDGE_ARGS = [
  '-run',
  'PacletSymbol["Wolfram/AgentTools","Wolfram`AgentTools`StartMCPServer"][]',
  '-noinit',
  '-noprompt',
]

/** Tool set exposed by the Wolfram MCP server; see its own documentation. */
const MCP_SERVER_NAME = 'WolframLanguage'

export const name = 'wolfram-mcp'

/** The bridge entry is created through the Loader service. */
export const inject = ['loader']

export const Config = z.object({
  kernelPath: z
    .string()
    .default('')
    .description('Absolute path to the Wolfram kernel executable (wolfram.exe). Leave empty to keep the Wolfram tools off.')
    .volatile(),
})

/**
 * Transport configuration for one bridge instance.
 * @param kernelPath - configured absolute path to the kernel executable.
 * @returns the mcp-client stdio configuration.
 */
function bridgeConfig(kernelPath) {
  return {
    serverName: SERVER_NAME,
    transport: 'stdio',
    command: kernelPath,
    args: [...BRIDGE_ARGS],
    env: { MCP_SERVER_NAME },
    // A cold kernel plus paclet load takes seconds, and the client negotiates
    // through an extra probe process before the serving process starts.
    startupTimeoutMs: 120_000,
    // Symbolic integration and ODE solving routinely exceed the 60 s default.
    toolCallTimeoutMs: 300_000,
  }
}

/**
 * Mount or rebuild the MCP bridge so it matches the current kernel path.
 * @param ctx - this plugin's context.
 * @returns nothing.
 */
export async function apply(ctx, config) {
  let mounted = false
  let disposed = false
  let queue = Promise.resolve()

  const currentPath = () => String(config.kernelPath.get() ?? '').trim()

  const sync = async () => {
    if (disposed) return
    const kernelPath = currentPath()
    if (mounted) {
      mounted = false
      await ctx.loader.remove(BRIDGE_ID)
    }
    if (!kernelPath) {
      ctx.logger.info('wolfram-mcp: no kernel path configured; open Plugins > Wolfram Mathematica and set the kernel executable')
      return
    }
    await ctx.loader.create({
      id: BRIDGE_ID,
      name: '@deepseek-ai/dsh-mcp-client',
      config: bridgeConfig(kernelPath),
    })
    mounted = true
  }

  const scheduleSync = () => {
    queue = queue.then(sync).catch((error) => {
      ctx.logger.warn('wolfram-mcp: connecting to %s failed: %s', currentPath(), error?.message ?? String(error))
    })
  }

  if (currentPath()) await sync()

  ctx.effect(
    () => () => {
      disposed = true
      if (!mounted) return
      mounted = false
      return ctx.loader.remove(BRIDGE_ID)
    },
    'wolfram-mcp: bridge entry',
  )

  ctx.on('loader/volatile-update', (paths) => {
    if (!paths.some((path) => path.length === 1 && path[0] === 'kernelPath')) return
    // Reacting inside the settings transaction would nest an HMR transaction,
    // which the loader refuses; the entry update that committed the value has
    // finished by the next macrotask.
    setTimeout(scheduleSync, 0)
  })
}
