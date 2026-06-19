import { useNavigate } from 'react-router-dom'
import { Button, Input, Pagination } from '@biztrack/ui/biztrack'
import { RfqStatus } from '@biztrack/types'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { usePaged } from '@/lib/usePaged'
import { useT } from '@/i18n'
import { useBreakpoint } from '@/lib/useBreakpoint'
import type { LocalRfqListItem } from '@shared/ipc'

const STATUS_CLASS: Record<string, string> = {
  DRAFT: 'st-neutral',
  SENT: 'st-brand',
  QUOTED: 'st-low',
  CONVERTED: 'st-ok',
  CLOSED: 'st-neutral',
  CANCELLED: 'st-out',
}

export function Rfqs() {
  const t = useT()
  const bp = useBreakpoint()
  const navigate = useNavigate()

  const { items, total, page, limit, totalPages, isPending, search, setSearch, setPage } = usePaged<LocalRfqListItem>(
    queryKeys.rfqs,
    (q) => dataClient.rfqs.list(q),
    { enabled: isElectron },
  )

  const statusPill = (s: RfqStatus) => <span className={`st ${STATUS_CLASS[s] ?? 'st-neutral'}`}>{t(`rfq.status_${s}` as Parameters<typeof t>[0])}</span>

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('rfq.title')}</h1>
          <p>{t('rfq.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/purchasing/rfqs/new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 5v14M5 12h14" /></svg>
          {t('rfq.new')}
        </Button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>{t('rfq.all')}</h3>
          <div className="spacer" style={{ flex: 1 }} />
          <Input value={search} placeholder={t('rfq.search')} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 230, height: 36 }} />
        </div>

        {isPending ? (
          <div className="cat-empty">{t('rfq.loading')}</div>
        ) : items.length === 0 ? (
          <div className="cat-empty">{t('rfq.empty')}</div>
        ) : bp === 'mobile' ? (
          <div className="u-cards">
            {items.map((r) => (
              <div key={r.id} className="u-card clickable" onClick={() => navigate(`/purchasing/rfqs/${r.id}`)}>
                <div className="u-main">
                  <div className="u-nm">{r.number}{r.title ? ` · ${r.title}` : ''}</div>
                  <div className="u-sub" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {statusPill(r.status)}
                    <span className="chip-tag">{t('rfq.nItems').replace('{n}', String(r.itemCount))}</span>
                    <span className="chip-tag">{t('rfq.nQuotes').replace('{q}', String(r.quoteCount)).replace('{s}', String(r.supplierCount))}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table className="utbl">
            <thead>
              <tr>
                <th>{t('rfq.colNumber')}</th>
                <th>{t('rfq.colStatus')}</th>
                <th className="right">{t('rfq.colItems')}</th>
                <th className="right">{t('rfq.colQuotes')}</th>
                <th>{t('rfq.colDate')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => navigate(`/purchasing/rfqs/${r.id}`)}>
                  <td><div className="nm">{r.number}</div>{r.title ? <div className="sub">{r.title}</div> : null}</td>
                  <td>{statusPill(r.status)}</td>
                  <td className="right num">{r.itemCount}</td>
                  <td className="right num">{r.quoteCount}/{r.supplierCount}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPage={setPage} prevLabel={t('common.prev')} nextLabel={t('common.next')} />
      </div>
    </div>
  )
}
