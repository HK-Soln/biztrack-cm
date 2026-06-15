import { useQuery } from '@tanstack/react-query'
import { dataClient, isElectron } from '@/lib/data-client'
import { queryKeys } from '@/lib/query'
import { useT } from '@/i18n'
import { useSessionStore } from '@/stores/session.store'

export function Dashboard() {
  const t = useT()
  const businessName = useSessionStore((s) => s.status.businessName)
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => dataClient.skeleton.getHealth(),
    enabled: isElectron,
  })

  return (
    <div className="frame">
      <div className="page-head">
        <div>
          <h1>{t('dash.title')}</h1>
          <p>{businessName ? `${t('dash.welcome')} — ${businessName}` : t('dash.welcome')}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div>
            <h3>{t('dash.localCheck')}</h3>
            <p>{t('dash.localCheckSub')}</p>
          </div>
          <span className={`badge ${data ? 'b-up' : 'b-warn'}`}>
            {!isElectron ? t('dash.cloudPreview') : data ? t('dash.ok') : t('dash.loading')}
          </span>
        </div>
        {!isElectron ? (
          <p style={{ color: 'var(--text-2)', fontSize: 13.5 }}>{t('dash.cloudPreviewBody')}</p>
        ) : isPending ? (
          <p style={{ color: 'var(--text-2)' }}>{t('dash.loading')}</p>
        ) : isError ? (
          <p style={{ color: 'var(--danger)' }}>
            {error instanceof Error ? error.message : t('dash.reachError')}
          </p>
        ) : (
          <div className="grid3">
            <div className="kpi-s">
              <div className="lab">{t('dash.products')}</div>
              <div className="val">{data?.productCount}</div>
            </div>
            <div className="kpi-s">
              <div className="lab">{t('dash.source')}</div>
              <div className="val" style={{ fontSize: 15 }}>
                {data?.source}
              </div>
            </div>
            <div className="kpi-s">
              <div className="lab">{t('dash.marker')}</div>
              <div className="val" style={{ fontSize: 13 }}>
                {data?.skeletonValue ?? '—'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
