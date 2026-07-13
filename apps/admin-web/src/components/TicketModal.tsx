'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError, useAdminApi } from '@/lib/api'
import type { SupportTicketItem } from '@/lib/types'

const CATEGORIES = ['SYNC', 'PAYMENT', 'APP', 'HARDWARE', 'FEEDBACK', 'OTHER']
const SEVERITIES = ['CRITICAL', 'WARNING', 'INFO']
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

interface Props {
  ticket?: SupportTicketItem | null // present = edit/resolve mode
  canResolve: boolean
  onClose: () => void
  onSaved: () => void
}

export function TicketModal({ ticket, canResolve, onClose, onSaved }: Props) {
  const api = useAdminApi()
  const isEdit = !!ticket
  const [title, setTitle] = useState(ticket?.title ?? '')
  const [description, setDescription] = useState(ticket?.description ?? '')
  const [category, setCategory] = useState(ticket?.category ?? 'SYNC')
  const [severity, setSeverity] = useState(ticket?.severity ?? 'WARNING')
  const [businessId, setBusinessId] = useState(ticket?.businessId ?? '')
  const [ticketStatus, setTicketStatus] = useState(ticket?.status ?? 'OPEN')
  const [resolution, setResolution] = useState(ticket?.resolution ?? '')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      if (isEdit) {
        await api.patch(`/admin/support/tickets/${ticket!.id}`, {
          status: ticketStatus,
          severity,
          resolution: resolution || undefined,
        })
        toast.success('Ticket updated.')
      } else {
        if (!title.trim() || !description.trim())
          return toast.error('Title and description are required.')
        await api.post('/admin/support/tickets', {
          title: title.trim(),
          description: description.trim(),
          category,
          severity,
          businessId: businessId.trim() || undefined,
        })
        toast.success('Ticket created.')
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Failed to save ticket.')
    } finally {
      setBusy(false)
    }
  }

  const readOnlyCreateFields = isEdit

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold">{isEdit ? 'Ticket' : 'New ticket'}</h2>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-700">Title</span>
            <input
              className="rounded-lg border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
              value={title}
              disabled={readOnlyCreateFields}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-neutral-700">Description</span>
            <textarea
              className="rounded-lg border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
              rows={3}
              value={description}
              disabled={readOnlyCreateFields}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-neutral-700">Category</span>
              <select
                className="rounded-lg border border-neutral-300 px-3 py-2 disabled:bg-neutral-100"
                value={category}
                disabled={readOnlyCreateFields}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-neutral-700">Severity</span>
              <select
                className="rounded-lg border border-neutral-300 px-3 py-2"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          {!isEdit && (
            <label className="flex flex-col gap-1">
              <span className="font-medium text-neutral-700">Business ID (optional)</span>
              <input
                className="rounded-lg border border-neutral-300 px-3 py-2 font-mono text-xs"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                placeholder="uuid"
              />
            </label>
          )}
          {isEdit && (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-medium text-neutral-700">Status</span>
                <select
                  className="rounded-lg border border-neutral-300 px-3 py-2"
                  value={ticketStatus}
                  disabled={!canResolve}
                  onChange={(e) => setTicketStatus(e.target.value)}
                >
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-medium text-neutral-700">Resolution</span>
                <textarea
                  className="rounded-lg border border-neutral-300 px-3 py-2"
                  rows={2}
                  value={resolution}
                  disabled={!canResolve}
                  onChange={(e) => setResolution(e.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-neutral-200 px-6 py-4">
          <button
            className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          {(!isEdit || canResolve) && (
            <button
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={submit}
              disabled={busy}
            >
              {busy ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
