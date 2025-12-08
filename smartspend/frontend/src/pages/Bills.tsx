import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import BillModal from '@/components/bills/BillModal'
import type { Bill as UiBill } from '@/lib/types'
import {
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Search,
  Trash2,
  X,
  Filter as FilterIcon,
} from 'lucide-react'
import { get, post, patch, del } from '@/lib/api'

type Cadence = 'monthly' | 'bi-weekly' | 'weekly' | 'custom'
type DueFilter = 'today' | 'next7' | 'overdue' | ''

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

function parseYMD(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0)
}

function daysFromToday(dateYMD: string) {
  const target = parseYMD(dateYMD)
  const today = new Date()
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const t1 = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((t1.getTime() - t0.getTime()) / (1000 * 60 * 60 * 24))
}

function relativeDueText(dateYMD: string) {
  const diff = daysFromToday(dateYMD)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 1) return `In ${diff} days`
  return `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'}`
}

const getUserId = () => Number(localStorage.getItem('userId') || 0)

// API row → UI Bill mapping
function mapApiBill(row: any): UiBill {
  return {
    id: String(row.id),
    name: row.name,
    amount: Number(row.amount ?? (row.amount_cents ? row.amount_cents / 100 : 0)),
    cadence: String(
      row.cadence || (row.recurrence_rule === 'biweekly' ? 'bi-weekly' : row.recurrence_rule || 'monthly'),
    ),
    recurrence: true,
    next_due: row.next_due ?? row.next_due_date ?? '', // 'YYYY-MM-DD'
    status: row.status || 'active',
    category: row.category ?? '',
    nwg: 'Need',
    notes: row.notes ?? '',
  } as UiBill
}

export default function BillsPage() {
  const [params, setParams] = useSearchParams()

  const [list, setList] = useState<UiBill[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string>('')

  const [q, setQ] = useState(params.get('q') ?? '')
  const [status, setStatus] = useState<'active' | 'paused' | ''>((params.get('status') as any) ?? '')
  const [cadence, setCadence] = useState<Cadence | ''>((params.get('cadence') as any) ?? '')
  const [category, setCategory] = useState<string>(params.get('category') ?? '')
  const [due, setDue] = useState<DueFilter>((params.get('due') as DueFilter) ?? '')
  const [filtersOpen, setFiltersOpen] = useState<boolean>(params.get('f') !== '0')

  const focusId = params.get('focus') ?? ''
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})

  // reflect filters -> URL
  useEffect(() => {
    const next = new URLSearchParams()
    if (filtersOpen === false) next.set('f', '0')
    if (q) next.set('q', q)
    if (status) next.set('status', status)
    if (cadence) next.set('cadence', cadence)
    if (category) next.set('category', category)
    if (due) next.set('due', due)
    if (focusId) next.set('focus', focusId)
    setParams(next, { replace: true })
  }, [filtersOpen, q, status, cadence, category, due, focusId, setParams])

  // focus scroll
  useEffect(() => {
    if (!focusId) return
    const el = rowRefs.current[focusId]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-brand-500')
      const t = setTimeout(() => el.classList.remove('ring-2', 'ring-brand-500'), 1600)
      return () => clearTimeout(t)
    }
  }, [focusId])

  // Load bills
  const buildQuery = useCallback(() => {
    const qs: Record<string, string> = {}
    const uid = getUserId()
    if (uid) qs.user_id = String(uid)
    if (q) qs.q = q
    if (status) qs.status = status
    if (cadence) qs.cadence = cadence === 'bi-weekly' ? 'biweekly' : cadence
    if (category) qs.category = category
    if (due) qs.due = due
    return qs
  }, [q, status, cadence, category, due])

  const load = useCallback(async () => {
    setErr('')
    setLoading(true)
    try {
      const data = await get<{ items: any[]; total?: number }>('/bills', buildQuery())
      const rows = Array.isArray(data?.items) ? data.items : []
      setList(rows.map(mapApiBill))
    } catch (e: any) {
      setErr(e?.message || 'Failed to load bills')
      setList([])
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    void load()
  }, [load])

  // summary
  const summary = useMemo(() => {
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const inMonth = list.filter((b) => {
      if (!b.next_due) return false
      const d = parseYMD(b.next_due)
      return d >= monthStart && d <= monthEnd && (b as any).status !== 'paused'
    })
    const totalMonth = inMonth.reduce((s, b) => s + (b.amount || 0), 0)
    const next7 = list.filter((b) => {
      if (!b.next_due) return false
      const dd = daysFromToday(b.next_due)
      return dd >= 0 && dd <= 7 && (b as any).status !== 'paused'
    })
    const activeCount = list.filter((b) => (b as any).status !== 'paused').length
    return { totalMonth, next7Count: next7.length, activeCount }
  }, [list])

  // filtered (client-side refinement)
  const filtered = useMemo(() => {
    let out = list.slice()
    out = out.filter((b) => b.recurrence === true)
    if (q) {
      const s = q.toLowerCase()
      out = out.filter((b) =>
        `${b.name} ${b.category ?? ''} ${(b as any).notes ?? ''}`.toLowerCase().includes(s),
      )
    }
    if (status) out = out.filter((b) => ((b as any).status ?? 'active') === status)
    if (cadence) out = out.filter((b) => (b.cadence as any) === cadence)
    if (category) out = out.filter((b) => b.category === category)
    if (due) {
      out = out.filter((b) => {
        if (!b.next_due) return false
        const d = daysFromToday(b.next_due)
        if (due === 'today') return d === 0
        if (due === 'next7') return d >= 0 && d <= 7
        if (due === 'overdue') return d < 0
        return true
      })
    }
    out.sort(
      (a, b) =>
        daysFromToday(a.next_due) - daysFromToday(b.next_due) ||
        (b.amount || 0) - (a.amount || 0),
    )
    return out
  }, [list, q, status, cadence, category, due])

  // modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editBill, setEditBill] = useState<UiBill | undefined>(undefined)

  function openAdd() {
    setEditBill(undefined)
    setModalOpen(true)
  }
  function openEdit(b: UiBill) {
    setEditBill(b)
    setModalOpen(true)
  }

  async function saveBill(b: UiBill) {
    const exists = list.some((x) => String(x.id) === String(b.id))
    const payload = {
      user_id: getUserId(),
      name: b.name,
      amount_cents: Math.round((b.amount || 0) * 100),
      recurrence_rule: b.cadence === 'bi-weekly' ? 'biweekly' : b.cadence,
      next_due_date: b.next_due,
      status: (b as any).status ?? 'active',
      category: (b as any).category ?? null,
      notes: (b as any).notes ?? null,
    }

    try {
      if (exists) {
        await patch(`/bills/${b.id}`, payload)
      } else {
        await post('/bills', payload)
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  async function deleteBill(id: string) {
    try {
      await del(`/bills/${id}`)
      setModalOpen(false)
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  async function toggleStatus(b: UiBill) {
    try {
      await post(`/bills/${b.id}/toggle`, { user_id: getUserId() })
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  async function markAsPaid(b: UiBill) {
    try {
      await post(`/bills/${b.id}/pay`, { user_id: getUserId() })
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  const next7Total = useMemo(() => {
    return list
      .filter((b) => {
        if (!b.next_due) return false
        const d = daysFromToday(b.next_due)
        return d >= 0 && d <= 7 && ((b as any).status ?? 'active') === 'active'
      })
      .reduce((sum, b) => sum + (b.amount || 0), 0)
  }, [list])

  const activeChips: Array<{ k: string; v: string; clear: () => void }> = []
  if (q) activeChips.push({ k: 'q', v: `"${q}"`, clear: () => setQ('') })
  if (status) activeChips.push({ k: 'status', v: status, clear: () => setStatus('' as any) })
  if (cadence) activeChips.push({ k: 'cadence', v: cadence, clear: () => setCadence('' as any) })
  if (category) activeChips.push({ k: 'category', v: category, clear: () => setCategory('') })
  if (due) activeChips.push({ k: 'due', v: due, clear: () => setDue('') })

  const clearAll = () => {
    setQ('')
    setStatus('' as any)
    setCadence('' as any)
    setCategory('')
    setDue('')
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-3 py-4 sm:px-4">
        <h1 className="text-xl font-semibold">Bills</h1>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          + Add bill
        </button>
      </div>

      <div className="mx-auto max-w-[1440px] px-3 sm:px-4">
        {next7Total > 0 && (
          <div className="mb-3 rounded-2xl border border-soft bg-white px-4 py-3 shadow-card">
            <span className="font-medium">Heads up:</span> you have{' '}
            <span className="font-semibold">{fmtCurrency(next7Total)}</span> due in the next 7 days.
          </div>
        )}

        {/* Summary */}
        <div className="rounded-2xl border border-soft bg-white px-4 py-3 shadow-card md:px-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div>
              Total this month:{' '}
              <span className="font-semibold">{fmtCurrency(summary.totalMonth)}</span>
            </div>
            <div>
              Next 7 days due: <span className="font-semibold">{summary.next7Count}</span>
            </div>
            <div>
              Active bills: <span className="font-semibold">{summary.activeCount}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 rounded-2xl border border-soft bg-white shadow-card">
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
                onClick={() => setFiltersOpen((o) => !o)}
                className="inline-flex items-center gap-2 rounded-xl border border-soft bg-white px-3 py-1.5 text-sm hover:bg-cream"
              >
                <CalendarDays size={16} />
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
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Bill name or notes"
                      className="w-full rounded-xl border border-soft bg-cream pl-9 pr-3 py-2"
                    />
                  </div>
                </div>

                {/* Status */}
                <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">Status</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-xl border border-soft bg-white px-3 py-2 pr-8"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                    >
                      <option value="">All</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                  </div>
                </div>

                {/* Cadence */}
                <div className="col-span-6 sm:col-span-3 lg:col-span-2">
                  <label className="mb-1 block text-xs text-gray-600">Cadence</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none rounded-xl border border-soft bg-white px-3 py-2 pr-8"
                      value={cadence}
                      onChange={(e) => setCadence(e.target.value as any)}
                    >
                      <option value="">All</option>
                      <option value="monthly">Monthly</option>
                      <option value="bi-weekly">Bi-weekly</option>
                      <option value="weekly">Weekly</option>
                      <option value="custom" disabled>
                        Custom
                      </option>
                    </select>
                    <ChevronDown
                      size={16}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                  </div>
                </div>

                {/* Due */}
                <div className="col-span-12 lg:col-span-3">
                  <label className="mb-1 block text-xs text-gray-600">Due</label>
                  <div className="grid h-[40px] grid-cols-3 gap-2">
                    {(['today', 'next7', 'overdue'] as DueFilter[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDue((prev) => (prev === d ? '' : d))}
                        className={`flex items-center justify-center rounded-full border px-2 text-[13px] transition-all
                          ${
                            due === d
                              ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                              : 'border-soft bg-white text-gray-700 hover:bg-cream'
                          }`}
                      >
                        {d === 'today' ? 'Today' : d === 'next7' ? 'Next 7' : 'Overdue'}
                      </button>
                    ))}
                  </div>
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

        {/* Table */}
        <div className="mt-3 overflow-hidden rounded-2xl border border-soft bg-white shadow-card">
          <div className="px-4 pt-3 text-sm text-gray-600">
            {loading ? 'Loading…' : err || null}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-cream/60">
              <tr className="text-left text-gray-600">
                <th className="px-4 py-3">Bill</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Cadence</th>
                <th className="px-4 py-3">Next due</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-2 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const diff = b.next_due ? daysFromToday(b.next_due) : 0
                const rel = b.next_due ? relativeDueText(b.next_due) : '—'
                const paused = ((b as any).status ?? 'active') === 'paused'
                const overdue = (b.next_due ? diff < 0 : false) && !paused
                return (
                  <tr
                    key={b.id}
                    ref={(el) => {
                      rowRefs.current[String(b.id)] = el
                    }}
                    className={`border-t border-soft ${paused ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-cream text-xs font-semibold">
                          {b.name?.[0]?.toUpperCase()}
                        </span>
                        <button
                          onClick={() => openEdit(b)}
                          className="font-medium hover:underline"
                          title="Edit bill"
                        >
                          {b.name}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">{fmtCurrency(b.amount || 0)}</td>
                    <td className="px-4 py-3 capitalize">
                      {String(b.cadence || '').replace('-', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {overdue && (
                          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                        )}
                        <span className={`${overdue ? 'text-red-600 font-medium' : ''}`}>{rel}</span>
                        <span className="text-gray-500">
                          ({b.next_due ? fmtDate(parseYMD(b.next_due)) : '—'})
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg border border-soft bg-white px-2 py-0.5">
                          {(b as any).category ?? '—'}
                        </span>
                        <span className="rounded-full bg-cream px-2 py-0.5 text-xs">Need</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          paused
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {paused ? 'Paused' : 'Active'}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => toggleStatus(b)}
                          className="rounded-lg px-2 py-1 hover:bg-cream"
                          title={paused ? 'Resume' : 'Pause'}
                        >
                          {paused ? <PlayCircle size={18} /> : <PauseCircle size={18} />}
                        </button>
                        <button
                          onClick={() => markAsPaid(b)}
                          className="rounded-lg px-2 py-1 hover:bg-cream"
                          title="Mark as paid"
                        >
                          <CheckCircle2 size={18} />
                        </button>
                        <button
                          onClick={() => openEdit(b)}
                          className="rounded-lg px-2 py-1 hover:bg-cream"
                          title="Edit"
                        >
                          ⋯
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && !loading && !err && (
                <tr>
                  <td className="px-4 py-8 text-center text-gray-600" colSpan={7}>
                    No bills match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <BillModal
        open={modalOpen}
        initial={editBill}
        onClose={() => setModalOpen(false)}
        onSave={saveBill}
        onDelete={(id: string) => deleteBill(id)}
      />
    </AppLayout>
  )
}
