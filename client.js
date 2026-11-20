// Browser half: the configuration form for the Wolfram bundle.
//
// It renders on the bundle's own page through `plugins.bundle.config`, between
// the description and the component list, so the kernel path is visible
// without opening a component page. The form is a live view over this
// plugin's Host configuration entry (`configForms`): saving a volatile field
// updates the running Host plugin in place, which rebuilds the MCP bridge.
window.__ModuleLoader__.load({
  id: 'dsh-wolfram-mcp',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'wolfram-mcp'
    const BUNDLE_NAME = 'dsh-wolfram-mcp'
    const CONFIG_NS = 'wolfram-mcp'
    const INPUT_ID = 'dsh-wolfram-kernel-path'

    const DICTS = {
      en: {
        label: 'Kernel executable',
        placeholder: 'Absolute path to the Wolfram kernel executable',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved. The Wolfram tools reconnect in a moment.',
        restart: 'Restart kernel',
        restarting: 'Restarting…',
        restarted: 'Kernel restarted. The Wolfram tools return in a few seconds.',
        failed: 'Could not save the path. Check the value and try again.',
        loading: 'Loading the saved configuration…',
        unavailable: 'This configuration is unavailable until the plugin is enabled.',
        readonly: 'This configuration is read-only for the current connection.',
        hint: 'Leave empty to keep the Wolfram tools off. The path is required because the kernel is never assumed.',
      },
      zh: {
        label: '内核可执行文件',
        placeholder: 'Wolfram 内核可执行文件的绝对路径',
        save: '保存',
        saving: '保存中…',
        saved: '已保存，Wolfram 工具稍后重新连接。',
        restart: '重启内核',
        restarting: '正在重启…',
        restarted: '内核已重启，工具将在数秒后恢复。',
        failed: '保存失败，请检查路径后重试。',
        loading: '正在读取已保存的配置…',
        unavailable: '插件启用后才能配置。',
        readonly: '当前连接对该配置只读。',
        hint: '留空则不启用 Wolfram 工具。内核位置不会被自动假定，需要显式填写。',
      },
    }

    const styles = {
      card: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '16px',
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: '12px',
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      label: { fontSize: '13px', fontWeight: '600', color: 'var(--dsw-alias-label-primary)' },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        padding: '8px 10px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        fontSize: '12px',
      },
      actions: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
      button: {
        padding: '6px 14px',
        borderRadius: '8px',
        border: '1px solid transparent',
        background: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-label-primary-inverted)',
        fontSize: '13px',
        cursor: 'pointer',
      },
      buttonDisabled: { opacity: '0.55', cursor: 'default' },
      buttonSecondary: {
        padding: '6px 14px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '13px',
        cursor: 'pointer',
      },
      buttonSecondaryDisabled: { opacity: '0.55', cursor: 'default' },
      hint: { margin: '0', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', lineHeight: '1.5' },
      ok: { fontSize: '12px', color: 'var(--dsw-alias-state-success-primary)' },
      error: { fontSize: '12px', color: 'var(--dsw-alias-state-error-primary)' },
    }

    function WolframConfig({ t, forms }) {
      const controller = React.useMemo(() => forms.get(CONFIG_NS), [forms])
      const subscribe = React.useCallback((listener) => controller.subscribe(listener), [controller])
      const read = React.useCallback(() => controller.getSnapshot(), [controller])
      const snapshot = React.useSyncExternalStore(subscribe, read)

      const [value, setValue] = React.useState('')
      const [status, setStatus] = React.useState('idle')
      const saved = snapshot.value?.kernelPath ?? ''

      React.useEffect(() => {
        if (snapshot.status === 'ready') setValue(saved)
      }, [snapshot.status, saved])

      // A form that has not read the saved entry yet must not offer Save: an
      // untouched empty field would otherwise clear a configured path.
      if (snapshot.status !== 'ready') {
        return h('p', { style: styles.hint }, snapshot.status === 'loading' ? t('loading') : t('unavailable'))
      }

      const busy = status === 'saving' || status === 'restarting'
      const disabled = snapshot.writable === false || busy

      const restartKernel = async () => {
        if (disabled) return
        setStatus('restarting')
        const next = Number(snapshot.value?.restart ?? 0) + 1
        try {
          const done = await controller.mutate([{ op: 'set', path: ['restart'], value: next }], snapshot.revision)
          setStatus(done ? 'restarted' : 'failed')
        } catch {
          setStatus('failed')
        }
      }

      const submit = async (event) => {
        event?.preventDefault?.()
        if (disabled) return
        setStatus('saving')
        const next = value.trim()
        const ops = next.length === 0
          ? [{ op: 'unset', path: ['kernelPath'] }]
          : [{ op: 'set', path: ['kernelPath'], value: next }]
        try {
          const done = await controller.mutate(ops, snapshot.revision)
          setStatus(done ? 'saved' : 'failed')
        } catch {
          setStatus('failed')
        }
      }

      return h(
        'form',
        { style: styles.card, onSubmit: submit },
        h('label', { style: styles.label, htmlFor: INPUT_ID }, t('label')),
        h('input', {
          id: INPUT_ID,
          style: styles.input,
          type: 'text',
          value,
          spellCheck: false,
          autoComplete: 'off',
          placeholder: t('placeholder'),
          onChange: (event) => {
            setValue(event.target.value)
            setStatus('idle')
          },
        }),
        h(
          'div',
          { style: styles.actions },
          h(
            'button',
            { type: 'submit', style: disabled ? { ...styles.button, ...styles.buttonDisabled } : styles.button, disabled },
            status === 'saving' ? t('saving') : t('save'),
          ),
          h(
            'button',
            {
              type: 'button',
              style: disabled ? { ...styles.buttonSecondary, ...styles.buttonSecondaryDisabled } : styles.buttonSecondary,
              disabled,
              onClick: restartKernel,
            },
            status === 'restarting' ? t('restarting') : t('restart'),
          ),
          status === 'saved' ? h('span', { style: styles.ok, role: 'status' }, t('saved')) : null,
          status === 'restarted' ? h('span', { style: styles.ok, role: 'status' }, t('restarted')) : null,
          status === 'failed' ? h('span', { style: styles.error, role: 'alert' }, t('failed')) : null,
        ),
        h('p', { style: styles.hint }, t('hint')),
        snapshot.writable === false ? h('p', { style: styles.hint, role: 'note' }, t('readonly')) : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'dsh-wolfram-mcp: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.inject(['configForms'], (scoped) => {
          const forms = scoped.configForms
          ctx.slots.inject('plugins.bundle.config', () =>
            ctx.slots.register(
              {
                name: 'plugins.bundle.config',
                key: BUNDLE_NAME,
                locale: NS,
                inject: () => ({ t }),
              },
              ({ view }) => (view === 'summary' ? null : h(WolframConfig, { t, forms })),
            ),
          )
        })
      },
    }
  },
})
