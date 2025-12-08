// src/pages/Transactions.tsx
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import AddTxModal from '@/components/transactions/AddTxModal'
import { get, post, patch, del } from '@/lib/api'
import {
  Search, CalendarDays, ChevronDown, Moon, SlidersHorizontal, Trash2, X,
  Filter as FilterIcon
} from 'lucide-react'

/** ===== Money helpers (store cents, show dollars) ===== */
const dollarsToCents = (d: number) => Math.round(Number(d || 0) * 100)
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
type DatePreset = '7d' | '30d' | '90d' | 'all'

/** Modal contracts (mirror AddTxModal.tsx)
 *  NOTE: New props for recurring → is_recurring, recurrence_rule, next_due_date
 */
type Kind = 'income' | 'expense'
type RecurrenceRule = 'weekly' | 'biweekly' | 'monthly'
type TxForModal = {
  id?: string | number
  type: Kind
  amount: number              // dollars
  occurred_at: string
  merchant: string
  note?: string | null
  nwg?: 'Need' | 'Want' | 'Guilt' | null
  mood?: 'happy' | 'neutral' | 'stressed'  | null
  category_id?: number | null
  late_night?: boolean

  /** NEW (for “Need + Recurring → Bill”) */
  is_recurring?: boolean
  recurrence_rule?: RecurrenceRule | null
  next_due_date?: string | null // 'YYYY-MM-DD'
}

type Mood = NonNullable<TxForModal['mood']>
type NWG  = NonNullable<TxForModal['nwg']>

const MOODS: Mood[] = ['happy', 'neutral', 'stressed']
const NWGS: NWG[]  = ['Need', 'Want', 'Guilt']

const getUserId = () => Number(localStorage.getItem('userId') || 0)

function parseNumber(v: string | null): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function dateFromPreset(preset: DatePreset): Date | undefined {
  const now = new Date()
  if (preset === 'all') return undefined
  const d = new Date(now)
  if (preset === '7d') d.setDate(d.getDate() - 7)
  if (preset === '30d') d.setDate(d.getDate() - 30)
  if (preset === '90d') d.setDate(d.getDate() - 90)
  return d
}

/** Row from API (amount already in DOLLARS after normalization below) */
type TxRow = {
  id: string | number
  type: 'expense' | 'income'
  amount: number             // dollars
  occurred_at: string
  merchant: string | null
  note?: string | null
  nwg?: NWG | null
  mood?: Mood | null
  category_id?: number | null
  late_night: boolean
}

/** Category from /categories API */
type Category = { id: number; name: string; kind: 'income' | 'expense' }

export default function Transactions() {
  const [params, setParams] = useSearchParams()

  // Filters / view state
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [categoryId, setCategoryId] = useState<number | ''>('') // filter by category_id (numeric)
  const [nwg, setNWG] = useState<NWG | ''>((params.get('nwg') as NWG) ?? '')
  const [mood, setMood] = useState<Mood | ''>((params.get('mood') as Mood) ?? '')
  const [type, setType] = useState<'' | 'expense' | 'income'>((params.get('type') as 'expense' | 'income') ?? '')
  const [lateNight, setLateNight] = useState<boolean>(params.get('late') === 'true')
  const [min, setMin] = useState<number | undefined>(parseNumber(params.get('min')))
  const [max, setMax] = useState<number | undefined>(parseNumber(params.get('max')))
  const [datePreset, setDatePreset] = useState<DatePreset>((params.get('date') as DatePreset) ?? '30d')
  const [sort, setSort] = useState<SortKey>((params.get('sort') as SortKey) ?? 'date_desc')
  const [filtersOpen, setFiltersOpen] = useState<boolean>(params.get('f') !== '0')

  // include bills in list (query param include_bills)
  const [includeBills, setIncludeBills] = useState<boolean>(params.get('ib') === '1')

  // Modal state
  const [openKind, setOpenKind] = useState<null | 'expense' | 'income'>(null)
  const [editing, setEditing] = useState<TxRow | null>(null)

  // Data
  const [all, setAll] = useState<TxRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string>('')

  // Categories
  const [categories, setCategories] = useState<Category[]>([])
  const catMap = useMemo(() => {
    const m = new Map<number, string>()
    categories.forEach(c => m.set(c.id, c.name))
    return m
  }, [categories])

  /** Reflect UI -> URL querystring (omit categoryId; it’s client-only) */
  useEffect(() => {
    const next = new URLSearchParams()
    if (filtersOpen === false) next.set('f', '0')
    if (includeBills) next.set('ib', '1')
    if (query) next.set('q', query)
    if (nwg) next.set('nwg', nwg)
    if (mood) next.set('mood', mood)
    if (type) next.set('type', type)
    if (lateNight) next.set('late', 'true')
    if (min != null && !Number.isNaN(min)) next.set('min', String(min))
    if (max != null && !Number.isNaN(max)) next.set('max', String(max))
    if (datePreset) next.set('date', datePreset)
    if (sort) next.set('sort', sort)
    setParams(next, { replace: true })
  }, [
    filtersOpen, includeBills, query, nwg, mood, type,
    lateNight, min, max, datePreset, sort, setParams
  ])

  /** Build server query (always include user_id) */
  const buildAPIQuery = useCallback(() => {
    const qs: Record<string, string> = {}
    const uid = getUserId()
    if (uid) qs.user_id = String(uid)
    if (query) qs.q = query
    if (nwg) qs.nwg = nwg
    if (mood) qs.mood = mood
    if (type) qs.type = type
    if (lateNight) qs.late = 'true'
    if (min != null && !Number.isNaN(min)) qs.min = String(min)   // dollars; server converts
    if (max != null && !Number.isNaN(max)) qs.max = String(max)
    if (datePreset) qs.date = datePreset
    if (sort) qs.sort = sort
    qs.include_bills = includeBills ? '1' : '0'   // server’s _parse_bool accepts 1/0
    return qs
  }, [query, nwg, mood, type, lateNight, min, max, datePreset, sort, includeBills])

  /** Load transactions from backend (normalize response keys) */
  const load = useCallback(async () => {
    setErr('')
    setLoading(true)
    try {
      const qs = buildAPIQuery()
      const data = await get<{ items: any[] }>('/transactions', qs)

      const items: TxRow[] = (Array.isArray(data?.items) ? data.items : []).map((r: any) => ({
        id: r.id,
        type: r.type,
        amount: Number(
          r.amount != null
            ? r.amount
            : (typeof r.amount_cents === 'number' ? r.amount_cents / 100 : 0)
        ),
        occurred_at: r.occurred_at ?? r.occurred_at_local ?? '',
        merchant: r.merchant ?? null,
        note: r.note ?? r.memo ?? null,
        nwg: r.nwg ?? (typeof r.spend_class === 'string'
          ? (r.spend_class.charAt(0).toUpperCase() + r.spend_class.slice(1)) as NWG
          : null),
        mood: r.mood ?? null,
        category_id: (r.category_id ?? null),
        late_night: Boolean(r.late_night ?? r.late_night_local ?? false),
      }))

      setAll(items)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load transactions')
      setAll([])
    } finally {
      setLoading(false)
    }
  }, [buildAPIQuery])

  /** Load categories (auto-seed defaults for new users) */
  useEffect(() => {
    (async () => {
      try {
        const user_id = String(getUserId())
        const data = await get<{ items: Category[] }>('/categories', {
          user_id,
          autocreate: '1',
        })
        setCategories(Array.isArray(data?.items) ? data.items : [])
      } catch {
        setCategories([])
      }
    })()
  }, [])

  useEffect(() => { void load() }, [load])

  /** Derived: client-side filtering (kept minimal since server already filters) */
  const filtered = useMemo(() => {
    const after = dateFromPreset(datePreset)?.getTime()
    const q = query.trim().toLowerCase()
    let list = all.slice()
    if (after) list = list.filter(t => new Date(t.occurred_at).getTime() >= after)
    if (type) list = list.filter(t => t.type === type)
    if (nwg) list = list.filter(t => t.nwg === nwg)
    if (mood) list = list.filter(t => t.mood === mood)
    if (lateNight) list = list.filter(t => t.late_night)
    if (categoryId !== '') list = list.filter(t => (t.category_id ?? null) === Number(categoryId))
    if (min != null) list = list.filter(t => t.amount >= min)
    if (max != null) list = list.filter(t => t.amount <= max)
    if (q) list = list.filter(t => (`${t.merchant ?? ''} ${t.note ?? ''}`).toLowerCase().includes(q))

    switch (sort) {
      case 'date_desc': list.sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at)); break
      case 'date_asc': list.sort((a, b) => +new Date(a.occurred_at) - +new Date(b.occurred_at)); break
      case 'amount_desc': list.sort((a, b) => b.amount - a.amount); break
      case 'amount_asc': list.sort((a, b) => a.amount - b.amount); break
    }
    return list
  }, [all, query, nwg, mood, type, lateNight, min, max, datePreset, sort, categoryId])

  const totals = useMemo(() => {
    let exp = 0, inc = 0
    filtered.forEach(t => (t.type === 'expense' ? (exp += t.amount) : (inc += t.amount)))
    return { expenses: exp, income: inc, net: inc - exp }
  }, [filtered])

  /** ===== CREATE (from modal)
   * If expense + Need + is_recurring → create BILL (/bills)
   * else → create TRANSACTION (/transactions)
   */
  async function handleSave(tx: TxForModal) {
    const user_id = getUserId()

    // Case 1: Recurring Need → Bill
    const isRecurringNeed =
      tx.type === 'expense' &&
      (tx.nwg === 'Need') &&
      Boolean(tx.is_recurring) &&
      Boolean(tx.recurrence_rule) &&
      Boolean(tx.next_due_date)

    if (isRecurringNeed) {
      const billPayload = {
        user_id,
        name: tx.merchant || 'Recurring bill',
        amount_cents: dollarsToCents(tx.amount || 0),
        recurrence_rule: tx.recurrence_rule as RecurrenceRule, // weekly | biweekly | monthly
        next_due_date: tx.next_due_date as string,             // 'YYYY-MM-DD'
        // (optional) You can add category/notes here if you later add columns
      }

      await post('/bills', billPayload)
      setOpenKind(null)
      await load()
      return
    }

    // Case 2: Normal transaction (non-recurring or not Need)
    const payload: any = {
      user_id,
      type: tx.type,                                   // 'income' | 'expense'
      amount_cents: dollarsToCents(tx.amount),         // convert dollars -> cents
      occurred_at: tx.occurred_at,                     // ISO string
      merchant: tx.merchant || null,
      memo: tx.note || null,                           // note -> memo
      mood: tx.mood || null,
      category_id: tx.category_id || null,
    }
    if (tx.type === 'expense') {
      payload.spend_class = tx.nwg ? String(tx.nwg).toLowerCase() : null // need|want|guilt|null
    }
    await post('/transactions', payload)
    setOpenKind(null)
    await load()
  }

  /** ===== CREATE BILL (recurring) — direct path if modal chooses “Create Bill” explicitly */
  async function handleSaveBill(bill: any) {
    const payload = {
      user_id: getUserId(),
      name: bill.name,
      amount_cents: dollarsToCents(bill.amount || 0),
      recurrence_rule: bill.recurrence_rule,   // 'weekly'|'biweekly'|'monthly'
      next_due_date: bill.next_due_date,       // 'YYYY-MM-DD'
    }
    await post('/bills', payload)
    setOpenKind(null)
    await load()
  }

  /** ===== EDIT ===== */
  function startEdit(t: TxRow) {
    setEditing(t)
    setOpenKind(t.type) // satisfies 'expense' | 'income' | null
  }

  async function saveEdit(tx: TxForModal) {
    const id = (editing as TxRow).id
    const body: any = {
      user_id: getUserId(),
      type: tx.type,
      amount_cents: dollarsToCents(tx.amount),     // convert again
      occurred_at: tx.occurred_at,
      merchant: tx.merchant || null,
      memo: tx.note || null,
      mood: tx.mood || null,
      category_id: tx.category_id || null,
      spend_class: tx.type === 'expense' && tx.nwg ? String(tx.nwg).toLowerCase() : null,
    }
    await patch(`/transactions/${id}`, body)
    setOpenKind(null)
    setEditing(null)
    await load()
  }

  async function deleteTx(id: string | number) {
    await del(`/transactions/${id}?user_id=${getUserId()}`)
    await load()
  }

  const clearAll = () => {
    setQuery(''); setCategoryId(''); setNWG(''); setMood(''); setType('');
    setLateNight(false); setMin(undefined); setMax(undefined);
    setDatePreset('30d'); setSort('date_desc'); setIncludeBills(false)
  }

  const activeChips: Array<{ k: string; v: string; clear: () => void }> = []
  if (query) activeChips.push({ k: 'q', v: `"${query}"`, clear: () => setQuery('') })
  if (categoryId !== '')
    activeChips.push({
      k: 'category',
      v: catMap.get(Number(categoryId)) ?? String(categoryId),
      clear: () => setCategoryId('')
    })
  if (nwg) activeChips.push({ k: 'nwg', v: nwg, clear: () => setNWG('') })
  if (mood) activeChips.push({ k: 'mood', v: mood, clear: () => setMood('') })
  if (type) activeChips.push({ k: 'type', v: type, clear: () => setType('') })
  if (lateNight) activeChips.push({ k: 'late-night', v: 'yes', clear: () => setLateNight(false) })
  if (min != null) activeChips.push({ k: 'min', v: `$${min}`, clear: () => setMin(undefined) })
  if (max != null) activeChips.push({ k: 'max', v: `$${max}`, clear: () => setMax(undefined) })
  if (datePreset && datePreset !== '30d')
    activeChips.push({ k: 'date', v: datePreset, clear: () => setDatePreset('30d') })
  if (includeBills) activeChips.push({ k: 'include_bills', v: 'on', clear: () => setIncludeBills(false) })

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-3 py-4 sm:px-4">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpenKind('income')}
            className="inline-flex items-center gap-2 rounded-xl border border-brand-500 bg-white px-4 py-2 text-sm font-medium text-brand-600 shadow-sm hover:bg-brand-50 transition"
          >+ Income</button>
          <button onClick={() => setOpenKind('expense')} className="btn-primary">+ Expense</button>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-3 sm:px-4">
        {/* FILTER PANEL */}
        <div className="rounded-2xl border border-soft bg-white shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-soft px-4 py-3 md:px-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <FilterIcon size={16} />
              Filters
              {activeChips.length > 0 && (
                <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-xs text-gray-700">
                  {activeChips.length} active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeChips.length > 0 && (
                <button
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 rounded-xl border border-soft bg-cream px-3 py-1.5 text-sm hover:bg-white"
                >
                  <Trash2 size={14} /> Clear all
                </button>
              )}
              <button
                onClick={() => setFiltersOpen(o => !o)}
                className="inline-flex items-center gap-2 rounded-xl border border-soft bg-white px-3 py-1.5 text-sm hover:bg-cream"
              >
                <SlidersHorizontal size={16} />
                {filtersOpen ? 'Hide' : 'Show'} Filters
              </button>
            </div>
          </div>

          <div
            className={`grid grid-cols-12 gap-3 px-4 pb-4 pt-3 transition-[grid-template-rows,padding] duration-200 ease-out md:gap-4 md:px-5 ${
              filtersOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] pb-0'
            }`}
          >
            <div className="col-span-12 overflow-hidden">
              <div className="grid grid-cols-12 gap-3 md:gap-4">
                {/* Search */}
                <div className="col-span-12 lg:col-span-4">
                  <label className="mb-1 block text-xs text-gray-600">Search</label>
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Merchant or note"
                      className="w-full rounded-xl border border-soft bg-cream pl-9 pr-3 py-2"
                    />
                  </div>
                </div>

                {/* Category */}
                <div className="col-span-6 sm:col-span-4 lg:col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">Category</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-xl border border-soft bg-white px-3 py-2 pr-8"
                      value={categoryId === '' ? '' : String(categoryId)}
                      onChange={(e) => {
                        const v = e.target.value
                        setCategoryId(v ? Number(v) : '')
                      }}
                    >
                      <option value="">All</option>
                      {categories.map((c) => (
                        <option key={c.id} value={String(c.id)}>{c.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>

                {/* N/W/G */}
                <div className="col-span-6 sm:col-span-4 lg:col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">N/W/G</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-xl border border-soft bg-white px-3 py-2 pr-8"
                      value={nwg}
                      onChange={(e) => setNWG(e.target.value as NWG | '')}
                    >
                      <option value="">All</option>
                      {NWGS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>

                {/* Mood */}
                <div className="col-span-6 sm:col-span-4 lg:col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">Mood</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-xl border border-soft bg-white px-3 py-2 pr-8"
                      value={mood}
                      onChange={(e) => setMood(e.target.value as Mood | '')}
                    >
                      <option value="">All</option>
                      {MOODS.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>

                {/* Type */}
                <div className="col-span-6 sm:col-span-4 lg:col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">Type</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-xl border border-soft bg-white px-3 py-2 pr-8"
                      value={type}
                      onChange={(e) => setType(e.target.value as 'expense'|'income'|'') }
                    >
                      <option value="">All</option>
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>

                {/* Late-night */}
                <div className="col-span-6 sm:col-span-4 lg:col-span-2 flex items-end">
                  <button
                    type="button"
                    onClick={() => setLateNight(v => !v)}
                    className={`inline-flex w-full items-center justify-between rounded-xl border px-3 py-2 ${
                      lateNight ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-soft bg-white'
                    }`}
                    title="Occurred after 10pm"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <Moon size={16} /> Late-night
                    </span>
                    <span className={`h-5 w-9 rounded-full p-0.5 transition ${lateNight ? 'bg-brand-500' : 'bg-gray-300'}`}>
                      <span className={`block h-4 w-4 rounded-full bg-white transition ${lateNight ? 'translate-x-4' : ''}`} />
                    </span>
                  </button>
                </div>

                {/* Min / Max */}
                <div className="col-span-6 sm:col-span-3 lg:col-span-3">
                  <label className="mb-1 block text-xs text-gray-600">Min $</label>
                  <input
                    type="number"
                    value={min ?? ''}
                    onChange={(e) => setMin(e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-full rounded-xl border border-soft bg-white px-3 py-2"
                    min={0}
                  />
                </div>
                <div className="col-span-6 sm:col-span-3 lg:col-span-3">
                  <label className="mb-1 block text-xs text-gray-600">Max $</label>
                  <input
                    type="number"
                    value={max ?? ''}
                    onChange={(e) => setMax(e.target.value === '' ? undefined : Number(e.target.value))}
                    className="w-full rounded-xl border border-soft bg-white px-3 py-2"
                    min={0}
                  />
                </div>

                {/* Date presets */}
                <div className="col-span-12 lg:col-span-4">
                  <label className="mb-1 block text-xs text-gray-600">Date</label>
                  <div className="flex flex-wrap items-center gap-2">
                    {(['7d','30d','90d','all'] as const).map(preset => (
                      <button
                        key={preset}
                        onClick={() => setDatePreset(preset)}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${
                          datePreset === preset ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-soft bg-white'
                        }`}
                      >
                        <CalendarDays size={14} />
                        {preset === '7d' && '7d'}
                        {preset === '30d' && '30d'}
                        {preset === '90d' && '90d'}
                        {preset === 'all' && 'All'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort */}
                <div className="col-span-12 lg:col-span-4">
                  <label className="mb-1 block text-xs text-gray-600">Sort</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-xl border border-soft bg-white px-3 py-2 pr-8"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortKey)}
                    >
                      <option value="date_desc">Date ↓</option>
                      <option value="date_asc">Date ↑</option>
                      <option value="amount_desc">Amount ↓</option>
                      <option value="amount_asc">Amount ↑</option>
                    </select>
                    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>

                {/* Include Bills Toggle */}
                <div className="col-span-12 lg:col-span-4 flex items-end">
                  <button
                    type="button"
                    onClick={() => setIncludeBills(v => !v)}
                    className={`inline-flex w-full items-center justify-between rounded-xl border px-3 py-2 ${
                      includeBills ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-soft bg-white'
                    }`}
                    title="Include bill payment transactions"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      Include bill transactions
                    </span>
                    <span className={`h-5 w-9 rounded-full p-0.5 transition ${includeBills ? 'bg-brand-500' : 'bg-gray-300'}`}>
                      <span className={`block h-4 w-4 rounded-full bg-white transition ${includeBills ? 'translate-x-4' : ''}`} />
                    </span>
                  </button>
                </div>
              </div>

              {/* Active chips */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {activeChips.map((c) => (
                  <span
                    key={c.k}
                    className="inline-flex items-center gap-2 rounded-full border border-soft bg-cream px-3 py-1 text-xs"
                  >
                    {c.k}: {c.v}
                    <button aria-label="clear filter" onClick={c.clear}>
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SUMMARY */}
        <div className="mt-3 rounded-2xl border border-soft bg-white px-4 py-3 text-sm shadow-card md:px-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>Expenses: <span className="font-semibold text-red-600">{fmtCurrency(totals.expenses)}</span></div>
            <div>Income: <span className="font-semibold text-emerald-700">+{fmtCurrency(totals.income)}</span></div>
            <div>Net: <span className={`font-semibold ${totals.net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {totals.net >= 0 ? '+' : ''}{fmtCurrency(totals.net)}
            </span></div>
          </div>
        </div>

        {/* TABLE */}
        <div className="mt-3 overflow-hidden rounded-2xl border border-soft bg-white shadow-card">
          <div className="px-4 pt-3 text-sm text-gray-600">{loading ? 'Loading…' : err || null}</div>
          <table className="w-full text-sm">
            <thead className="bg-cream/60">
              <tr className="text-left text-gray-600">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">N-W-G</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Mood</th>
                <th className="px-2 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const occurredDate = t.occurred_at ? new Date(t.occurred_at) : null
                const dateStr = occurredDate ? occurredDate.toLocaleDateString() : '—'
                const weekDay = occurredDate ? occurredDate.toLocaleDateString(undefined, { weekday: 'long' }) : '—'
                return (
                  <tr key={t.id} className="border-t border-soft">
                    <td className="px-4 py-3">{dateStr}</td>
                    <td className="px-4 py-3">{weekDay}</td>
                    <td className="px-4 py-3">{t.merchant ?? '—'}</td>
                    <td className="px-4 py-3">{t.note ?? '—'}</td>
                    <td className="px-4 py-3">{t.category_id ? (catMap.get(t.category_id) ?? '—') : '—'}</td>
                    <td className="px-4 py-3">{t.nwg ?? '—'}</td>
                    <td className="px-4 py-3">{fmtCurrency(t.amount)}</td>
                    <td className="px-4 py-3">{t.mood ?? '—'}</td>
                    <td className="px-2 py-3 text-right space-x-2">
                      <button
                        className="rounded-lg px-2 py-1 hover:bg-cream text-blue-600"
                        title="Edit transaction"
                        onClick={() => startEdit(t)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-lg px-2 py-1 hover:bg-cream text-red-600"
                        title="Delete transaction"
                        onClick={() => deleteTx(t.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && !loading && !err && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-600">
                    No matches. Try clearing filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(openKind || editing) && (
        <AddTxModal
          kind={openKind ?? (editing?.type ?? 'expense')}
          initialData={
            editing
              ? {
                  id: editing.id,
                  type: editing.type as Kind,
                  amount: editing.amount,               // dollars
                  occurred_at: editing.occurred_at,
                  merchant: editing.merchant || '',
                  note: editing.note ?? '',
                  nwg: editing.nwg ?? null,
                  mood: editing.mood ?? null,
                  category_id: editing.category_id ?? null,
                  late_night: editing.late_night ?? false,

                  // NEW fields: leave blank on edit unless you support converting to Bill
                  is_recurring: false,
                  recurrence_rule: null,
                  next_due_date: null,
                } as TxForModal
              : undefined
          }
          onClose={() => { setOpenKind(null); setEditing(null) }}
          onSaveTransaction={editing ? saveEdit : handleSave}
          onSaveBill={handleSaveBill}
        />
      )}
    </AppLayout>
  )
}
