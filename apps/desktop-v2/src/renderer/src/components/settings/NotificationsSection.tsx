import { useState, type ReactNode } from 'react'
import { Input } from '@biztrack/ui/biztrack'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n/messages'

// Notifications — INTERACTIVE PREVIEW (design-notifications.html). No backend yet, so
// the channel×event matrix, quiet hours and recipients are local state behind a
// coming-soon banner.

type Channel = 'inapp' | 'email' | 'sms' | 'whatsapp'
const CHANNELS: Array<{ key: Channel; label: MessageKey; icon: ReactNode }> = [
  { key: 'inapp', label: 'ntf.inapp', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M9 20h6" /></svg> },
  { key: 'email', label: 'ntf.email', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg> },
  { key: 'sms', label: 'ntf.sms', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></svg> },
  { key: 'whatsapp', label: 'ntf.whatsapp', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 21l1.6-5A8 8 0 1 1 8 19.4L3 21Z" /><path d="M8.5 9.5c.5 3 3 5.5 6 6" /></svg> },
]

type Row = { key: string; name: MessageKey; desc: MessageKey; icon: ReactNode; v: Record<Channel, boolean> }
const on = (...ch: Channel[]): Record<Channel, boolean> => ({ inapp: ch.includes('inapp'), email: ch.includes('email'), sms: ch.includes('sms'), whatsapp: ch.includes('whatsapp') })

const I = (d: ReactNode) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{d}</svg>

const INITIAL_ROWS: Row[] = [
  { key: 'lowStock', name: 'ntf.lowStock', desc: 'ntf.lowStockDesc', icon: I(<path d="M3 7h18M3 12h18M3 17h10" />), v: on('inapp', 'email') },
  { key: 'newOrder', name: 'ntf.newOrder', desc: 'ntf.newOrderDesc', icon: I(<><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></>), v: on('inapp', 'email', 'sms', 'whatsapp') },
  { key: 'payment', name: 'ntf.payment', desc: 'ntf.paymentDesc', icon: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.2a2.5 2 0 0 1 5 0c0 2.5-5 1-5 3.6a2.5 2 0 0 0 5 0" /></>), v: on('inapp', 'sms') },
  { key: 'debt', name: 'ntf.debt', desc: 'ntf.debtDesc', icon: I(<><circle cx="12" cy="12" r="8" /><path d="M9.5 10a2.5 2 0 0 1 5 0c0 2-2.5 1.6-2.5 3.2M12 16h.01" /></>), v: on('inapp', 'email', 'whatsapp') },
  { key: 'daily', name: 'ntf.daily', desc: 'ntf.dailyDesc', icon: I(<><path d="M4 20V4M4 20h16" /><rect x="7" y="11" width="3" height="6" /><rect x="13" y="7" width="3" height="10" /></>), v: on('inapp', 'email') },
  { key: 'team', name: 'ntf.team', desc: 'ntf.teamDesc', icon: I(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5a3 3 0 0 1 0 6" /></>), v: on('inapp') },
  { key: 'billing', name: 'ntf.billing', desc: 'ntf.billingDesc', icon: I(<path d="M12 2 4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5Z" />), v: on('inapp', 'email', 'sms') },
]

export function NotificationsSection() {
  const t = useT()
  const [rows, setRows] = useState<Row[]>(INITIAL_ROWS)
  const [quiet, setQuiet] = useState(true)
  const [from, setFrom] = useState('21:00')
  const [until, setUntil] = useState('07:00')

  const toggle = (rowKey: string, ch: Channel) =>
    setRows((rs) => rs.map((r) => (r.key === rowKey ? { ...r, v: { ...r.v, [ch]: !r.v[ch] } } : r)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="banner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><span>{t('ntf.comingSoon')}</span></div>

      {/* Matrix */}
      <div className="card">
        <div className="card-h"><div><h3>{t('ntf.title')}</h3><p>{t('ntf.sub')}</p></div></div>
        <table className="nmx">
          <thead>
            <tr>
              <th className="evh">{t('ntf.event')}</th>
              {CHANNELS.map((c) => (
                <th key={c.key}><div className="chcol"><span className="chi">{c.icon}</span><span className="chl">{t(c.label)}</span></div></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="evt">
                  <div className="ev">
                    <div className="nm"><span className="ic">{r.icon}</span>{t(r.name)}</div>
                    <div className="ds">{t(r.desc)}</div>
                  </div>
                </td>
                {CHANNELS.map((c) => (
                  <td key={c.key} className="cell">
                    <button type="button" className={`cbx${r.v[c.key] ? ' on' : ''}`} aria-pressed={r.v[c.key]} aria-label={`${t(r.name)} · ${t(c.label)}`} onClick={() => toggle(r.key, c.key)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="form-note" style={{ marginTop: 18 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
          <span>{t('ntf.creditNote')}</span>
        </div>
      </div>

      {/* Quiet hours */}
      <div className="card">
        <div className="card-h"><div><h3>{t('ntf.quietTitle')}</h3><p>{t('ntf.quietSub')}</p></div></div>
        <div className="set-line">
          <div><div className="nm">{t('ntf.quietEnable')}</div><div className="ds">{t('ntf.quietEnableDesc')}</div></div>
          <button type="button" className={`switch${quiet ? ' on' : ''}`} aria-pressed={quiet} onClick={() => setQuiet((v) => !v)} />
        </div>
        <div className="qh" style={{ marginTop: 16 }}>
          <div><label className="lbl">{t('ntf.from')}</label><Input type="time" value={from} disabled={!quiet} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="lbl">{t('ntf.until')}</label><Input type="time" value={until} disabled={!quiet} onChange={(e) => setUntil(e.target.value)} /></div>
        </div>
      </div>

      {/* Recipients */}
      <div className="card">
        <div className="card-h"><div><h3>{t('ntf.recipientsTitle')}</h3><p>{t('ntf.recipientsSub')}</p></div><button className="btn" type="button" style={{ marginLeft: 'auto' }} disabled>{t('ntf.manage')}</button></div>
        <div className="rcp-row">
          <div className="av">HA</div>
          <div><div className="nm">henson@boutiquemballa.cm</div><div className="sub">{t('ntf.emailVerified')}</div></div>
          <div className="ch"><span>{t('ntf.email')}</span><span>{t('ntf.inapp')}</span></div>
        </div>
        <div className="rcp-row">
          <div className="av">HA</div>
          <div><div className="nm">+237 6 78 21 44 02</div><div className="sub">{t('ntf.phoneVerified')}</div></div>
          <div className="ch"><span>{t('ntf.sms')}</span><span>{t('ntf.whatsapp')}</span></div>
        </div>
      </div>
    </div>
  )
}
