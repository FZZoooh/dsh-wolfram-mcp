// Browser half: the row configuration page for the Wolfram bundle.
//
// The Plugins page opens this page from a row's Configure control and hands
// over `form`, a view over the row's Host settings entry (value, revision,
// write queue). Saving a volatile field updates the running Host plugin in
// place, which rebuilds the MCP bridge with the new kernel path.
window.__ModuleLoader__.load({
  id: 'dsh-wolfram-mcp',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'wolfram-mcp'
    const ROW_KEY = 'dsh-wolfram-mcp#wolfram-mcp'
    const INPUT_ID = 'dsh-wolfram-kernel-path'

    const DICTS = {
      en: {
        label: 'Kernel executable',
        placeholder: 'Absolute path to the Wolfram kernel executable',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved. The Wolfram tools reconnect in a moment.',
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
      hint: { margin: '0', fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', lineHeight: '1.5' },
      ok: { fontSize: '12px', color: 'var(--dsw-alias-state-success-primary)' },
      error: { fontSize: '12px', color: 'var(--dsw-alias-state-error-primary)' },
    }

    function WolframConfig({ form, t }) {
      if (!form) return h('p', { style: styles.hint }, t('unavailable'))

      const state = form.state ?? {}
      const [value, setValue] = React.useState(state.value?.kernelPath ?? '')
      const [status, setStatus] = React.useState('idle')

      // A form that has not read the saved entry yet must not offer Save: an
      // untouched empty field would otherwise clear a configured path.
      if (state.status !== 'ready') {
        return h('p', { style: styles.hint }, state.status === 'loading' ? t('loading') : t('unavailable'))
      }

      const busy = status === 'saving'
      const disabled = state.writable === false || busy

      const submit = async (event) => {
        event?.preventDefault?.()
        if (disabled) return
        setStatus('saving')
        const next = value.trim()
        const ops = next.length === 0
          ? [{ op: 'unset', path: ['kernelPath'] }]
          : [{ op: 'set', path: ['kernelPath'], value: next }]
        try {
          const saved = await form.mutate(ops, state.revision)
          setStatus(saved ? 'saved' : 'failed')
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
            busy ? t('saving') : t('save'),
          ),
          status === 'saved' ? h('span', { style: styles.ok, role: 'status' }, t('saved')) : null,
          status === 'failed' ? h('span', { style: styles.error, role: 'alert' }, t('failed')) : null,
        ),
        h('p', { style: styles.hint }, t('hint')),
        state.writable === false ? h('p', { style: styles.hint, role: 'note' }, t('readonly')) : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICTS), 'dsh-wolfram-mcp: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('plugins.row.config', () =>
          ctx.slots.register(
            {
              name: 'plugins.row.config',
              key: ROW_KEY,
              locale: NS,
              inject: () => ({ t }),
            },
            ({ view, form }) => (view === 'summary' ? null : h(WolframConfig, { form, t })),
          ),
        )
      },
    }
  },
})
