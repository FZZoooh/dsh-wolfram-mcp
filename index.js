/**
 * Owns the Wolfram Mathematica MCP bridge for this bundle.
 *
 * The kernel executable is ordinary user configuration: it lives in this
 * plugin's own `config.kernelPath`, edited from the Plugins UI, and no path is
 * hard-coded here. The official `@deepseek-ai/dsh-mcp-client` bridge is created
 * on the root Loader at runtime (in-memory, recreated every boot) so an
 * unconfigured plugin starts no process at all.
 *
 * Two failure modes are handled explicitly:
 *
 * - The first connection after a cold boot (or a paclet update) can hang before
 *   the MCP handshake; the client then never registers tools while its child
 *   kernel stays alive. A watchdog notices that no `mcp__wolfram__` tool exists
 *   after a bounded wait and rebuilds the bridge.
 * - A wedged kernel makes every later call queue until it times out, so the
 *   configuration page exposes a restart action backed by the `restart` field,
 *   which rebuilds the bridge and therefore starts a fresh kernel.
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

/** Wait this long for tools after creating the bridge before rebuilding it. */
const WATCHDOG_MS = 75_000

/** Automatic rebuilds after a bridge that never produced tools. */
const MAX_REBUILDS = 2

export const name = 'wolfram-mcp'

/** The bridge entry is created through the Loader service. */
export const inject = ['loader']

export const Config = z.object({
  kernelPath: z
    .string()
    .default('')
    .description('Absolute path to the Wolfram kernel executable (wolfram.exe). Leave empty to keep the Wolfram tools off.')
    .volatile(),
  restart: z
    .number()
    .default(0)
    .description('Increment to rebuild the MCP bridge and start a fresh kernel.')
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
    // A wedged kernel must not hold one call for longer than a person waits.
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
  let generation = 0
  let watchdog
  let rebuilds = 0

  const currentPath = () => String(config.kernelPath.get() ?? '').trim()

  const hasTools = () => {
    const tools = ctx.get('tools')
    if (tools === undefined) return false
    try {
      return tools.schemas().some((schema) => schema.name.startsWith(`mcp__${SERVER_NAME}__`))
    } catch {
      return false
    }
  }

  const scheduleSync = () => {
    queue = queue.then(sync).catch((error) => {
      ctx.logger.warn('wolfram-mcp: connecting to %s failed: %s', currentPath(), error?.message ?? String(error))
    })
  }

  const armWatchdog = (token) => {
    watchdog = setTimeout(() => {
      if (disposed || token !== generation) return
      if (hasTools()) {
        rebuilds = 0
        return
      }
      if (rebuilds >= MAX_REBUILDS) {
        ctx.logger.warn(
          'wolfram-mcp: the bridge still exposes no tools after %d rebuilds; restart DSH or check the kernel path',
          MAX_REBUILDS,
        )
        return
      }
      rebuilds += 1
      ctx.logger.warn(
        'wolfram-mcp: no tools appeared after %ds; rebuilding the bridge (attempt %d/%d)',
        Math.round(WATCHDOG_MS / 1000),
        rebuilds,
        MAX_REBUILDS,
      )
      scheduleSync()
    }, WATCHDOG_MS)
  }

  async function sync() {
    if (disposed) return
    const token = ++generation
    clearTimeout(watchdog)
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
    armWatchdog(token)
  }

  if (currentPath()) await sync()

  ctx.effect(
    () => () => {
      disposed = true
      clearTimeout(watchdog)
      if (!mounted) return
      mounted = false
      return ctx.loader.remove(BRIDGE_ID)
    },
    'wolfram-mcp: bridge entry',
  )

  ctx.on('loader/volatile-update', (paths) => {
    const restart = paths.some((path) => path.length === 1 && path[0] === 'restart')
    const path = paths.some((entry) => entry.length === 1 && entry[0] === 'kernelPath')
    if (!restart && !path) return
    if (restart) {
      rebuilds = 0
      ctx.logger.info('wolfram-mcp: restarting the kernel on request')
    }
    // Reacting inside the settings transaction would nest an HMR transaction,
    // which the loader refuses; the entry update that committed the value has
    // finished by the next macrotask.
    setTimeout(scheduleSync, 0)
  })
}
