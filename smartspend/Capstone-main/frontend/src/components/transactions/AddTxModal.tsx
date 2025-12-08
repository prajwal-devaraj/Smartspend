import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { get } from '@/lib/api'   // 👈 use your existing API helper

type Kind = 'income' | 'expense'
type Mood = 'happy' | 'neutral' | 'stressed'
type NWG  = 'Need' | 'Want' | 'Guilt'

type Category = { id: number; name: string; kind: 'income' | 'expense' }

export type TxForModal = {
  id?: string | number
  type: Kind
  amount: number
  occurred_at: string
  merchant: string
  note?: string | null
  nwg?: NWG | null
  mood?: Mood | null
  category_id?: number | null
  late_night?: boolean

  is_recurring?: boolean
  recurrence_rule?: 'monthly' | 'weekly' | 'biweekly' | null
  next_due_date?: string | null
}

type Props = {
  kind: Kind
  initialData?: TxForModal
  onClose: () => void
  onSaveTransaction: (tx: TxForModal) => Promise<void>
  onSaveBill: (bill: {
    name: string
    amount: number
    recurrence_rule: 'monthly' | 'weekly' | 'biweekly'
    next_due_date: string
  }) => Promise<void>
}

const MOODS: Mood[] = ['happy', 'neutral', 'stressed']
const NWGS: NWG[]  = ['Need', 'Want', 'Guilt']

const getUserId = () => Number(localStorage.getItem('userId') || 0)

// Make a local "YYYY-MM-DDTHH:mm" string for <input type="datetime-local">
function localNowForDatetimeInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function normalizeDateTimeLocalToISO(dtLocal: string): string {
  if (!dtLocal) return dtLocal
  if (dtLocal.includes('Z') || dtLocal.includes('+')) return dtLocal
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dtLocal)) return dtLocal + ':00'
  return dtLocal
}
function todayYMD(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

/** Keep only digits and one '.'; trim to 2 decimals; strip leading zeros (except "0." case). */
function sanitizeAmountInput(raw: string): string {
  let s = raw.replace(/[^\d.]/g, '')

  // keep only first dot
  const firstDot = s.indexOf('.')
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '')
  }

  // limit to 2 decimals
  const dot = s.indexOf('.')
  if (dot !== -1) {
    const intPart = s.slice(0, dot)
    const decPart = s.slice(dot + 1, dot + 3)
    s = `${intPart}.${decPart}`
  }

  // remove leading zeros unless followed by '.'
  if (s.startsWith('0') && !s.startsWith('0.')) {
    s = s.replace(/^0+/, '')
    if (s === '') s = '0'
  }

  // prefix 0 if it begins with '.'
  if (s.startsWith('.')) s = '0' + s

  return s
}

export default function AddTxModal({
  kind,
  initialData,
  onClose,
  onSaveTransaction,
  onSaveBill,
}: Props) {
  // ------- form state -------
  const [type, setType] = useState<Kind>(initialData?.type ?? kind)

  // Amount as string for full control (leading zeros, decimals, etc.)
  const [amountStr, setAmountStr] = useState<string>(() => {
    const v = initialData?.amount
    return (typeof v === 'number' && Number.isFinite(v)) ? String(v) : '0'
  })

  const [occurredAt, setOccurredAt] = useState<string>(initialData?.occurred_at ?? localNowForDatetimeInput())
  const [merchant, setMerchant] = useState<string>(initialData?.merchant ?? '')
  const [note, setNote] = useState<string>(initialData?.note ?? '')
  const [nwg, setNWG] = useState<NWG | ''>(initialData?.nwg ?? (type === 'expense' ? '' : ''))
  const [mood, setMood] = useState<Mood | ''>(initialData?.mood ?? '')

  // ------- categories (Auto or pick one) -------
  const [categories, setCategories] = useState<Category[]>([])
  // 'auto' means let backend choose default via resolve_category_id_or_default
  const [categoryChoice, setCategoryChoice] = useState<'auto' | number>(
    initialData?.category_id ? Number(initialData.category_id) : 'auto'
  )

  useEffect(() => {
    (async () => {
      try {
        const data = await get<{ items: Category[] }>('/categories', {
          user_id: String(getUserId()),
          autocreate: '1',       // seed defaults if none
        })
        setCategories(Array.isArray(data?.items) ? data.items : [])
      } catch {
        setCategories([])
      }
    })()
  }, [])

  // show only categories that match current type
  const visibleCategories = useMemo(
    () => categories.filter(c => c.kind === (type === 'income' ? 'income' : 'expense')),
    [categories, type]
  )

  // Recurring (only shown when type=expense && nwg==='Need')
  const [isRecurring, setIsRecurring] = useState<boolean>(false)
  const [recurrenceRule, setRecurrenceRule] = useState<'monthly' | 'weekly' | 'biweekly'>('monthly')
  const [nextDueDate, setNextDueDate] = useState<string>(todayYMD())

  // If switch to income, clear NWG & recurring
  useEffect(() => {
    if (type !== 'expense') {
      setNWG('')
      setIsRecurring(false)
    }
  }, [type])

  // Reset recurring flag if NWG no longer Need
  useEffect(() => {
    if (!(type === 'expense' && nwg === 'Need')) {
      setIsRecurring(false)
    }
  }, [type, nwg])

  const amountNum = useMemo(() => {
    const n = parseFloat(amountStr || '0')
    return Number.isFinite(n) ? n : 0
  }, [amountStr])

  const canSubmit = useMemo(() => {
    if (!type) return false
    if (!(amountNum > 0)) return false
    if (!occurredAt) return false
    if (type === 'expense' && nwg === 'Need' && isRecurring) {
      if (!nextDueDate) return false
      if (!recurrenceRule) return false
    }
    return true
  }, [type, amountNum, occurredAt, nwg, isRecurring, nextDueDate, recurrenceRule])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    // Need + Recurring => create Bill
    if (type === 'expense' && nwg === 'Need' && isRecurring) {
      await onSaveBill({
        name: merchant || 'Recurring Expense',
        amount: amountNum, // dollars; parent converts to cents
        recurrence_rule: recurrenceRule,
        next_due_date: nextDueDate, // yyyy-mm-dd
      })
      onClose()
      return
    }

    // Otherwise, create a normal transaction
    await onSaveTransaction({
      type,
      amount: amountNum,
      occurred_at: normalizeDateTimeLocalToISO(occurredAt),
      merchant,
      note: note || null,
      nwg: type === 'expense' ? (nwg || null) : null,
      mood: (mood || null) as Mood | null,
      category_id: categoryChoice === 'auto' ? null : Number(categoryChoice),
      is_recurring: isRecurring,
      recurrence_rule: isRecurring ? recurrenceRule : null,
      next_due_date: isRecurring ? nextDueDate : null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-soft bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-soft px-4 py-3">
          <h2 className="text-base font-semibold">Add {type === 'expense' ? 'Expense' : 'Income'}</h2>
          <button className="rounded-lg p-1 hover:bg-cream" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4 px-4 py-4">
          {/* Type */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">Type</label>
            <select
              className="w-full rounded-xl border border-soft bg-white px-3 py-2"
              value={type}
              onChange={(e) => setType(e.target.value as Kind)}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>

          {/* Amount ($) with "0" default that disappears on focus */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">Amount ($)</label>
            <input
              inputMode="decimal"
              type="text"
              placeholder="0.00"
              value={amountStr}
              onFocus={(e) => {
                if (e.currentTarget.value === '0' || e.currentTarget.value === '0.00') {
                  setAmountStr('')
                }
              }}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim()
                setAmountStr(v === '' ? '0' : sanitizeAmountInput(v))
              }}
              onChange={(e) => setAmountStr(sanitizeAmountInput(e.target.value))}
              className="w-full rounded-xl border border-soft bg-white px-3 py-2"
              required
            />
          </div>

          {/* When */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">When</label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="w-full rounded-xl border border-soft bg-white px-3 py-2"
              required
            />
          </div>

          {/* Merchant / Note */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-600">Merchant / Source</label>
              <input
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder={type === 'income' ? 'Source (e.g., Salary)' : 'Merchant'}
                className="w-full rounded-xl border border-soft bg-white px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">Note</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-xl border border-soft bg-white px-3 py-2"
              />
            </div>
          </div>

          {/* Category (Auto or pick) */}
          <div>
            <label className="mb-1 block text-xs text-gray-600">Category</label>
            <select
              className="w-full rounded-xl border border-soft bg-white px-3 py-2"
              value={categoryChoice === 'auto' ? 'auto' : String(categoryChoice)}
              onChange={(e) => {
                const v = e.target.value
                setCategoryChoice(v === 'auto' ? 'auto' : Number(v))
              }}
            >
              <option value="auto">Auto (recommended)</option>
              {visibleCategories.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Auto picks a sensible default ({type === 'income' ? 'Salary' : 'Misc'}).
            </p>
          </div>

          {/* NWG & Mood together in one row */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* NWG (disabled for income) */}
            <div>
              <label className="mb-1 block text-xs text-gray-600">N/W/G</label>
              <select
                className="w-full rounded-xl border border-soft bg-white px-3 py-2"
                value={type === 'expense' ? nwg : ''}
                onChange={(e) => setNWG(e.target.value as NWG | '')}
                disabled={type !== 'expense'}
              >
                <option value="">—</option>
                {NWGS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Mood (always available) */}
            <div>
              <label className="mb-1 block text-xs text-gray-600">Mood (optional)</label>
              <select
                className="w-full rounded-xl border border-soft bg-white px-3 py-2"
                value={mood}
                onChange={(e) => setMood(e.target.value as Mood | '')}
              >
                <option value="">—</option>
                {MOODS.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Recurring toggle + details (only when expense + Need) */}
          {type === 'expense' && nwg === 'Need' && (
            <>
              <div className="flex items-end">
                <label className="inline-flex w-full items-center justify-between rounded-xl border border-soft bg-white px-3 py-2">
                  <span className="text-sm">Is this recurring?</span>
                  <span
                    role="switch"
                    aria-checked={isRecurring}
                    onClick={() => setIsRecurring(v => !v)}
                    className={`ml-2 h-5 w-9 cursor-pointer rounded-full p-0.5 transition ${isRecurring ? 'bg-brand-500' : 'bg-gray-300'}`}
                  >
                    <span className={`block h-4 w-4 rounded-full bg-white transition ${isRecurring ? 'translate-x-4' : ''}`} />
                  </span>
                </label>
              </div>

              {isRecurring && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">Recurrence</label>
                    <select
                      className="w-full rounded-xl border border-soft bg-white px-3 py-2"
                      value={recurrenceRule}
                      onChange={(e) => setRecurrenceRule(e.target.value as 'monthly' | 'weekly' | 'biweekly')}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-600">Next due date</label>
                    <input
                      type="date"
                      value={nextDueDate}
                      onChange={(e) => setNextDueDate(e.target.value)}
                      className="w-full rounded-xl border border-soft bg-white px-3 py-2"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-soft bg-white px-4 py-2 text-sm hover:bg-cream"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
