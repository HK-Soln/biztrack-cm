import { useThemeStore, type ThemeChrome, type ThemeMode, type ThemePalette } from '@/stores/theme.store'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Appearance — FULLY FUNCTIONAL (per-user, local, works offline). Drives the shared
// theme store: palette + light/dark/system mode + nav chrome. The live preview reads
// the same CSS variables, so it reflects the chosen look instantly.

const PALETTES: Array<{ id: ThemePalette; name: MessageKey; desc: MessageKey; sw: string[]; def?: boolean }> = [
  { id: 'a', name: 'appr.palAName', desc: 'appr.palADesc', sw: ['#F4F5F7', '#FFFFFF', '#16467A', '#2F7D4F', '#C0473F'], def: true },
  { id: 'b', name: 'appr.palBName', desc: 'appr.palBDesc', sw: ['#F3F5F5', '#FFFFFF', '#0F5C5C', '#2F7D4F', '#C0473F'] },
  { id: 'c', name: 'appr.palCName', desc: 'appr.palCDesc', sw: ['#F5F5F4', '#FFFFFF', '#33332F', '#2F7D4F', '#C0473F'] },
  { id: 'd', name: 'appr.palDName', desc: 'appr.palDDesc', sw: ['#F5F5F8', '#FFFFFF', '#4A3F94', '#2F7D4F', '#C0473F'] },
]

const MODES: Array<{ v: ThemeMode; label: MessageKey }> = [
  { v: 'light', label: 'appr.light' },
  { v: 'dark', label: 'appr.dark' },
  { v: 'system', label: 'appr.system' },
]
const CHROMES: Array<{ v: ThemeChrome; label: MessageKey }> = [
  { v: 'neutral', label: 'appr.neutral' },
  { v: 'brand', label: 'appr.brand' },
]

const BARS = [40, 62, 48, 80, 66, 54, 72]

export function AppearanceSection() {
  const t = useT()
  const mode = useThemeStore((s) => s.mode)
  const palette = useThemeStore((s) => s.palette)
  const chrome = useThemeStore((s) => s.chrome)
  const setMode = useThemeStore((s) => s.setMode)
  const setPalette = useThemeStore((s) => s.setPalette)
  const setChrome = useThemeStore((s) => s.setChrome)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Theme */}
      <div className="card">
        <div className="card-h"><div><h3>{t('appr.themeTitle')}</h3><p>{t('appr.themeSub')}</p></div></div>
        <div className="themes">
          {PALETTES.map((p) => (
            <button key={p.id} type="button" className="theme-card" aria-pressed={palette === p.id} onClick={() => setPalette(p.id)}>
              <div className="swr">{p.sw.map((c, i) => <i key={i} style={{ background: c }} />)}</div>
              <div className="tn">{t(p.name)}{p.def ? <em>{t('appr.default')}</em> : null}</div>
              <div className="td">{t(p.desc)}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 18 }}>
          <div>
            <div className="ol">{t('appr.mode')}</div>
            <span className="seg2">
              {MODES.map((m) => (
                <button key={m.v} type="button" aria-pressed={mode === m.v} onClick={() => setMode(m.v)}>{t(m.label)}</button>
              ))}
            </span>
          </div>
          <div>
            <div className="ol">{t('appr.chrome')}</div>
            <span className="seg2">
              {CHROMES.map((c) => (
                <button key={c.v} type="button" aria-pressed={chrome === c.v} onClick={() => setChrome(c.v)}>{t(c.label)}</button>
              ))}
            </span>
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="card">
        <div className="card-h"><div><h3>{t('appr.previewTitle')}</h3><p>{t('appr.previewSub')}</p></div><span className="chip-tag" style={{ color: 'var(--success)' }}>▲ 12.4%</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { lab: t('appr.revenue'), val: '2 480 500', hint: t('appr.today') },
            { lab: t('appr.receivable'), val: '1 247 000', hint: t('appr.debtors') },
            { lab: t('appr.netProfit'), val: '645 300', hint: 'FCFA' },
          ].map((k) => (
            <div key={k.lab} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '13px 14px', background: 'var(--surface)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 500 }}>{k.lab}</div>
              <div style={{ fontSize: 17, fontWeight: 700, margin: '6px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{k.val}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.hint}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11.5, color: 'var(--text-2)', marginBottom: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--brand)' }} />{t('appr.thisWeek')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--border-strong)' }} />{t('appr.lastWeek')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, marginBottom: 16 }}>
          {BARS.map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '5px 5px 0 0', background: i >= 5 ? 'var(--border-strong)' : 'var(--brand)' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary" type="button">{t('appr.primaryAction')}</button>
          <button className="btn" type="button">{t('appr.secondary')}</button>
          <span className="st st-ok"><span className="d" />{t('appr.paid')}</span>
          <span className="st st-low"><span className="d" />{t('appr.partial')}</span>
          <span className="pill-tag">MTN MoMo</span>
        </div>
      </div>

      <div className="form-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
        <span>{t('appr.systemNote')}</span>
      </div>
    </div>
  )
}
