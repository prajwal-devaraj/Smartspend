// src/components/transactions/TxnForm.tsx
import { useEffect, useMemo, useState } from 'react'
import { CATEGORIES, nwgForCategory } from '@/lib/mock'
import type { Mood, NWG } from '@/lib/types'

export type TxnDraft = {
  type: 'expense' | 'income'
  amount: number
  date: string       // YYYY-MM-DD
  time: string       // HH:mm
  merchant: string
  category: string
  nwg: NWG | null
  mood: Mood | null
  late_night: boolean
  note?: string
}

export default function TxnForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: TxnDraft
  onSubmit: (draft: TxnDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<TxnDraft>(initial)
  const [error, setError] = useState('')

  // auto N/W/G from category for expenses
  useEffect(() => {
    if (draft.type === 'expense') {
      setDraft(d => ({ ...d, nwg: nwgForCategory(d.category) }))
    } else {
      setDraft(d => ({ ...d, nwg: null }))
    }
  }, [draft.category, draft.type])

  // late-night detection
  useEffect(() => {
    const [h] = draft.time.split(':').map(Number)
    setDraft(d => ({ ...d, late_night: h >= 22 || h < 5 }))
  }, [draft.time])

  const canSubmit = useMemo(() => {
    return draft.amount > 0 && !!draft.merchant.trim() && draft.date && draft.time
  }, [draft])

  function submit() {
    if (!canSubmit) {
      setError('Enter amount, merchant, date & time.')
      return
    }
    setError('')
    onSubmit(draft)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6">
          <label className="mb-1 block text-xs text-gray-600">Amount</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={draft.amount}
            onChange={e => setDraft(d => ({ ...d, amount: Number(e.target.value) }))}
            className="w-full rounded-xl border border-soft bg-white px-3 py-2"
          />
        </div>
        <div className="col-span-6">
          <label className="mb-1 block text-xs text-gray-600">Merchant / Payee</label>
          <input
            value={draft.merchant}
            onChange={e => setDraft(d => ({ ...d, merchant: e.target.value }))}
            placeholder={draft.type === 'income' ? 'Payroll, Transfer…' : 'Starbucks…'}
            className="w-full rounded-xl border border-soft bg-white px-3 py-2"
          />
        </div>

        <div className="col-span-6">
          <label className="mb-1 block text-xs text-gray-600">Date</label>
          <input
            type="date"
            value={draft.date}
            onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
            className="w-full rounded-xl border border-soft bg-white px-3 py-2"
          />
        </div>
        <div className="col-span-6">
          <label className="mb-1 block text-xs text-gray-600">Time</label>
          <input
            type="time"
            value={draft.time}
            onChange={e => setDraft(d => ({ ...d, time: e.target.value }))}
            className="w-full rounded-xl border border-soft bg-white px-3 py-2"
          />
        </div>

        <div className="col-span-6">
          <label className="mb-1 block text-xs text-gray-600">Category</label>
          <select
            className="w-full rounded-xl border border-soft bg-white px-3 py-2"
            value={draft.category}
            onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="col-span-6">
          <label className="mb-1 block text-xs text-gray-600">Mood</label>
          <select
            className="w-full rounded-xl border border-soft bg-white px-3 py-2"
            value={draft.mood ?? ''}
            onChange={e => setDraft(d => ({ ...d, mood: (e.target.value || null) as any }))}
          >
            <option value="">—</option>
            {['happy','neutral','stressed','impulse'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="col-span-12">
          <label className="mb-1 block text-xs text-gray-600">Note</label>
          <input
            value={draft.note ?? ''}
            onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
            placeholder="Optional"
            className="w-full rounded-xl border border-soft bg-white px-3 py-2"
          />
        </div>

        <div className="col-span-12">
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${draft.late_night ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'bg-cream text-gray-700'}`}>
            {draft.late_night ? '🌙 Late-night' : 'Regular time'}
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel} className="rounded-xl border border-soft bg-white px-3 py-2 text-sm">Cancel</button>
        <button
          onClick={submit}
          className="btn-primary disabled:opacity-50"
          disabled={!canSubmit}
        >
          Save
        </button>
      </div>
    </div>
  )
}
