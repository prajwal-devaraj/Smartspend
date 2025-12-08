import { useEffect, useMemo, useState } from 'react'
import type { Bill } from '@/lib/types'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { categories as CATEGORY_OBJECTS } from '@/lib/mock'

type Cadence = 'monthly' | 'bi-weekly' | 'weekly' | 'custom'

type Draft = {
  id?: string
  name: string
  amountStr: string
  amountNum: number
  category: string
  cadence: Cadence
  next_due: string // YYYY-MM-DD
  status: 'active' | 'paused'
  notes?: string
  custom_every?: number
  custom_unit?: 'days' | 'weeks' | 'months'
}

const DEFAULT_CATEGORY = CATEGORY_OBJECTS?.[0]?.name ?? 'Rent'

const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

function parseYMD(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function addWeeks(d: Date, n: number) {
  return addDays(d, n * 7)
}
function addMonths(d: Date, n: number) {
  const x = new Date(d)
  const day = x.getDate()
  x.setMonth(x.getMonth() + n)
  while (x.getDate() < day) x.setDate(x.getDate() - 1)
  return x
}

function nextDatesFrom(
  anchor: Date,
  cadence: Cadence,
  opts?: { every?: number; unit?: 'days' | 'weeks' | 'months' },
  count = 3,
) {
  const out: Date[] = []
  let cur = new Date(anchor)
  for (let i = 0; i < count; i++) {
    if (i === 0) out.push(new Date(cur))
    if (cadence === 'weekly') cur = addWeeks(cur, 1)
    else if (cadence === 'bi-weekly') cur = addWeeks(cur, 2)
    else if (cadence === 'monthly') cur = addMonths(cur, 1)
    else if (cadence === 'custom') {
      const every = opts?.every ?? 1
      const unit = opts?.unit ?? 'days'
      if (unit === 'days') cur = addDays(cur, every)
      if (unit === 'weeks') cur = addWeeks(cur, every)
      if (unit === 'months') cur = addMonths(cur, every)
    }
    if (i > 0) out.push(new Date(cur))
  }
  return out
}

export default function BillModal({
  open,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  initial?: Bill | undefined
  onClose: () => void
  onSave: (bill: Bill) => void
  onDelete?: (id: string) => void
}) {
  const editMode = !!initial

  const [draft, setDraft] = useState<Draft>(() => {
    const todayYMD = new Date().toISOString().slice(0, 10)
    if (initial) {
      return {
        id: initial.id,
        name: initial.name,
        amountStr: String(initial.amount ?? ''),
        amountNum: Number(initial.amount ?? 0),
        category: initial.category ?? DEFAULT_CATEGORY,
        cadence: (initial.cadence as Cadence) ?? 'monthly',
        next_due: initial.next_due || todayYMD,
        status: (initial as any).status ?? 'active',
        notes: (initial as any).notes ?? '',
        custom_every: (initial as any).custom_every ?? undefined,
        custom_unit: (initial as any).custom_unit ?? undefined,
      }
    }
    return {
      name: '',
      amountStr: '',
      amountNum: 0,
      category: DEFAULT_CATEGORY,
      cadence: 'monthly',
      next_due: todayYMD,
      status: 'active',
      notes: '',
    }
  })

  const [error, setError] = useState<string>('')

  // 🔹 Re-sync draft when modal opens or initial changes (important for Edit)
  useEffect(() => {
    if (!open) return
    const todayYMD = new Date().toISOString().slice(0, 10)
    if (initial) {
      setDraft({
        id: initial.id,
        name: initial.name,
        amountStr: String(initial.amount ?? ''),
        amountNum: Number(initial.amount ?? 0),
        category: initial.category ?? DEFAULT_CATEGORY,
        cadence: (initial.cadence as Cadence) ?? 'monthly',
        next_due: initial.next_due || todayYMD,
        status: (initial as any).status ?? 'active',
        notes: (initial as any).notes ?? '',
        custom_every: (initial as any).custom_every ?? undefined,
        custom_unit: (initial as any).custom_unit ?? undefined,
      })
    } else {
      setDraft({
        name: '',
        amountStr: '',
        amountNum: 0,
        category: DEFAULT_CATEGORY,
        cadence: 'monthly',
        next_due: todayYMD,
        status: 'active',
        notes: '',
      })
    }
    setError('')
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  const previewDates = useMemo(() => {
    const anchor = parseYMD(draft.next_due)
    return nextDatesFrom(
      anchor,
      draft.cadence,
      {
        every: draft.custom_every,
        unit: draft.custom_unit,
      },
      3,
    )
  }, [draft.next_due, draft.cadence, draft.custom_every, draft.custom_unit])

  if (!open) return null

  const save = () => {
    const amt = Number(draft.amountStr || draft.amountNum || 0)
    if (!draft.name.trim()) return setError('Bill name is required.')
    if (!amt || amt <= 0) return setError('Amount must be greater than 0.')
    if (!draft.cadence) return setError('Cadence is required.')
    if (!draft.next_due) return setError('Next due date is required.')

    const out: Bill = {
      id: draft.id ?? crypto.randomUUID(),
      name: draft.name.trim(),
      amount: amt,
      cadence: draft.cadence,
      next_due: draft.next_due,
      category: draft.category,
      ...(draft.notes ? { notes: draft.notes } : {}),
      ...(draft.status ? { status: draft.status } : {}),
      ...(draft.cadence === 'custom'
        ? { custom_every: draft.custom_every ?? 1, custom_unit: draft.custom_unit ?? 'days' }
        : {}),
    } as any

    setError('')
    onSave(out)
  }

  const isPaused = draft.status === 'paused'

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-soft bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">
              {editMode ? 'Edit Bill' : 'Add Bill'}
            </h3>
            {editMode && isPaused && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                Paused – you can still edit
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl px-2 py-1 text-sm hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-8">
            <Input
              label="Bill name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </div>

          {/* Amount */}
          <div className="col-span-12 sm:col-span-4">
            <label className="mb-1 block text-xs text-gray-600">Amount</label>
            <input
              placeholder="0.00"
              inputMode="decimal"
              className="w-full rounded-xl border border-soft bg-white px-3 py-2"
              value={draft.amountStr}
              onFocus={(e) => {
                if (e.currentTarget.value === '0' || e.currentTarget.value === '0.00') {
                  setDraft((d) => ({ ...d, amountStr: '' }))
                }
              }}
              onChange={(e) => {
                const v = e.target.value
                if (/^\d*([.]\d{0,2})?$/.test(v) || v === '') {
                  setDraft((d) => ({ ...d, amountStr: v }))
                }
              }}
              onBlur={() => {
                const n = Number(draft.amountStr || 0)
                setDraft((d) => ({
                  ...d,
                  amountNum: n,
                  amountStr: n ? String(n) : '',
                }))
              }}
            />
          </div>

          <div className="col-span-12 sm:col-span-6">
            <Input
              label="Category"
              value={draft.category}
              onChange={(e) =>
                setDraft((d) => ({ ...d, category: e.target.value }))
              }
            />
          </div>

          {/* Read-only N/W/G hint */}
          <div className="col-span-12 sm:col-span-6 flex items-end">
            <span className="inline-block rounded-full bg-cream px-2 py-1 text-xs text-gray-700 select-none">
              N/W/G: Need
            </span>
          </div>

          <div className="col-span-12 sm:col-span-6">
            <Select
              label="Cadence"
              value={draft.cadence}
              onChange={(e) =>
                setDraft((d) => ({ ...d, cadence: e.target.value as Cadence }))
              }
            >
              <option value="monthly">Monthly</option>
              <option value="bi-weekly">Bi-weekly</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom</option>
            </Select>
          </div>

          {draft.cadence === 'custom' && (
            <>
              <div className="col-span-6 sm:col-span-3">
                <Input
                  label="Every"
                  type="number"
                  min={1}
                  value={draft.custom_every ?? 1}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      custom_every: Number(e.target.value || 1),
                    }))
                  }
                />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Select
                  label="Unit"
                  value={draft.custom_unit ?? 'days'}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      custom_unit: e.target.value as 'days' | 'weeks' | 'months',
                    }))
                  }
                >
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                  <option value="months">months</option>
                </Select>
              </div>
            </>
          )}

          <div className="col-span-12 sm:col-span-6">
            <Input
              label="Next due"
              type="date"
              value={draft.next_due}
              onChange={(e) =>
                setDraft((d) => ({ ...d, next_due: e.target.value }))
              }
            />
          </div>

          <div className="col-span-12 sm:col-span-6">
            <Select
              label="Status"
              value={draft.status}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  status: e.target.value as 'active' | 'paused',
                }))
              }
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </Select>
          </div>

          <div className="col-span-12">
            <Input
              label="Notes (optional)"
              value={draft.notes ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, notes: e.target.value }))
              }
            />
          </div>
        </div>

        {/* Preview */}
        <div className="mt-4 rounded-xl border border-soft bg-cream px-3 py-2 text-sm">
          <div className="font-medium">Next 3 dates:</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {previewDates.map((d, i) => (
              <span key={i} className="rounded-full bg-white px-2 py-0.5">
                {fmtDate(d)}
              </span>
            ))}
            {draft.cadence === 'custom' && (
              <span className="text-gray-600">
                (repeats every {draft.custom_every ?? 1}{' '}
                {draft.custom_unit ?? 'days'})
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          {editMode && onDelete ? (
            <button
              onClick={() => onDelete(initial!.id)}
              className="text-red-600 hover:underline"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button onClick={save} className="btn-primary">
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
