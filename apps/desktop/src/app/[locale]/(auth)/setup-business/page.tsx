'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Input, Button } from '@biztrack/ui'
import { toast } from 'sonner'
import { AuthCard } from '@/components/auth/AuthCard'
import { getApiErrorMessage } from '@/services/api-response'
import { setupBusiness } from '@/services/auth.api'
import { updateLocalBusinessProfile } from '@/services/local-businesses.local'
import { useAuthStore } from '@/stores/auth.store'

export default function SetupBusinessPage() {
  const locale = useLocale()
  const t = useTranslations('auth')
  const router = useRouter()

  const businessId = useAuthStore((s) => s.businessId)
  const applyBusinessMeta = useAuthStore((s) => s.applyBusinessMeta)

  const [form, setForm] = useState({ name: '', city: '', address: '' })
  const [loading, setLoading] = useState(false)

  const goTo = (path: string) => router.push(`/${locale}${path}`)

  const handleChange = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try {
      const business = await setupBusiness({
        name: form.name,
        city: form.city || undefined,
        address: form.address || undefined,
      })

      // Persist the updated profile to local SQLite so the auth store (which
      // reads businessName from there) reflects the new name on all screens.
      if (businessId) {
        await updateLocalBusinessProfile({
          id: businessId,
          name: business.name,
          city: business.city ?? null,
          address: business.address ?? null,
          phone: business.phone ?? null,
          email: business.email ?? null,
          currency: business.currency ?? null,
        })
      }

      // Update the in-memory store immediately so the dashboard/topbar shows
      // the correct name without waiting for the next sync cycle.
      applyBusinessMeta({
        businessName: business.name,
        businessCity: business.city ?? null,
        businessAddress: business.address ?? null,
        businessPhone: business.phone ?? null,
        businessEmail: business.email ?? null,
        businessCurrency: business.currency || 'XAF',
      })

      return goTo('/select-plan')
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('setup_business.error_default')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthCard title={t('setup_business.title')} subtitle={t('setup_business.subtitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('setup_business.name_label')}
          </label>
          <Input value={form.name} onChange={handleChange('name')} required autoFocus />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('setup_business.city_label')}
          </label>
          <Input
            value={form.city}
            onChange={handleChange('city')}
            placeholder={t('setup_business.city_placeholder')}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('setup_business.address_label')}
          </label>
          <Input
            value={form.address}
            onChange={handleChange('address')}
            placeholder={t('setup_business.address_placeholder')}
          />
        </div>
        <Button type="submit" variant="primary" className="w-full" disabled={loading}>
          {loading ? t('setup_business.loading') : t('setup_business.continue')}
        </Button>
      </form>
    </AuthCard>
  )
}
