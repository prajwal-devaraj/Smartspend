// src/pages/Insights.tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import { get } from '@/lib/api'
import {
  LineChart as RLineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart as RPieChart, Pie, Cell, BarChart as RBarChart, Bar, CartesianGrid
} from 'recharts'
import { CalendarDays, Moon, PieChart, Sparkles, X } from 'lucide-react'
import { predictFromFeatures, type MlResponse } from '@/lib/ml'

type Range = '7d' | '30d'

// ---- API types ----
type Summary = {
  wants_share: number
  wants_expense_cents: number
  total_expense_cents: number
  late_night_count: number
  mood_avgs: { mood: 'happy' | 'neutral' | 'stressed'; avg_amount_cents: number }[]
  upcoming_bills: { occurrence_id: number; bill_id: number; name: string; amount_cents: number; due_date: string; status: string }[]
  runway: { days_left_regular: number; days_left_power_save: number }
}
type AlertsResp = { items: Array<{
  id?: number | string
  source?: string
  code?: string
  title: string
  message?: string
  severity?: 'info' | 'warn' | 'success'
  created_at?: string
}>}
type NWGShare = { breakdown: Array<{ class: 'need' | 'want' | 'guilt'; amount_cents: number }> }

// ---- UI helpers/components ----
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const centsTo = (c: number) => (c || 0) / 100

const NWG_COLORS: Record<'Need' | 'Want' | 'Guilt', string> = {
  Need: '#EA9B84',
  Want: '#E25D37',
  Guilt: '#F1B9A6',
}

function SectionCard({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-soft bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-soft px-4 py-3 md:px-5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {right}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </div>
  )
}

function AlertCard({
  icon, tone = 'info', title, description, cta, onClick, sparkline
}: {
  icon: React.ReactNode
  tone?: 'info' | 'warn' | 'success'
  title: string
  description?: string
  cta?: string
  onClick?: () => void
  sparkline?: { data: Array<{ x: string; y: number }> }
}) {
  const toneCls = tone === 'warn'
    ? 'bg-amber-50 text-amber-800'
    : tone === 'success'
      ? 'bg-emerald-50 text-emerald-800'
      : 'bg-cream text-gray-800'

  return (
    <div className="flex gap-3 rounded-2xl border border-soft bg-white p-4 shadow-card md:items-center">
      <div className={`grid h-10 w-10 place-items-center rounded-xl ${toneCls}`}>{icon}</div>
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        {description && <div className="mt-1 text-sm text-gray-600">{description}</div>}
        {sparkline && (
          <div className="mt-2 h-14">
            <ResponsiveContainer>
              <RLineChart data={sparkline.data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                <Line type="monotone" dataKey="y" stroke="#E25D37" strokeWidth={2} dot={false} />
                <XAxis dataKey="x" hide />
                <YAxis hide />
                <Tooltip cursor={{ stroke: '#EDE7E2' }} />
              </RLineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {cta && (
        <button onClick={onClick} className="btn-ghost shrink-0">
          {cta}
        </button>
      )}
    </div>
  )
}

function Drawer({ open, title, children, onClose }:
  { open: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40" aria-modal>
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-[min(520px,100%)] overflow-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-soft px-4 py-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="rounded-lg p-2 hover:bg-cream" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

const getUserId = () => Number(localStorage.getItem('userId') || 0)

export default function Insights() {
  const nav = useNavigate()

  // Filters / range
  const [range, setRange] = useState<Range>('7d')
  const days = range === '30d' ? 30 : 7

  // Server state
  const [summary, setSummary] = useState<Summary | null>(null)
  const [alerts, setAlerts] = useState<AlertsResp['items']>([])
  const [nwgShare, setNWGShare] = useState<NWGShare['breakdown']>([])

  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string>('')

  // Drawer (placeholder)
  const [drawer, setDrawer] = useState<{ open: boolean; title: string; content?: React.ReactNode }>({ open: false, title: '' })

  // ML state
  const [ml, setMl] = useState<MlResponse | null>(null)
  const [mlLoading, setMlLoading] = useState(false)
  const [mlErr, setMlErr] = useState<string>('')

  // Load from backend
  useEffect(() => {
    const user_id = getUserId()
    if (!user_id) return

    setLoading(true); setErr('')
    Promise.all([
      get<Summary>('/insights/summary', { user_id, days }),
      get<AlertsResp>('/insights/alerts', { user_id, days }),
      get<NWGShare>('/insights/nwg-share', { user_id, days }),
    ])
      .then(([s, a, n]) => {
        setSummary(s)
        setAlerts(Array.isArray(a?.items) ? a.items : [])
        setNWGShare(Array.isArray(n?.breakdown) ? n.breakdown : [])
      })
      .catch((e: any) => setErr(e?.message || 'Failed to load insights'))
      .finally(() => setLoading(false))
  }, [days])

  // Derived UI values — clamp REGULAR to 30d for a month-oriented app
  const runwayRegularRaw = summary?.runway.days_left_regular ?? 0
  const runwayPowerRaw   = summary?.runway.days_left_power_save ?? 0
  const runwayRegular = Math.min(runwayRegularRaw, 30)
  const runwayPower   = runwayPowerRaw

  // NWG pie from backend cents
  const nwgPie = useMemo(() => {
    const map: Record<'need'|'want'|'guilt', number> = { need: 0, want: 0, guilt: 0 }
    nwgShare.forEach(b => { map[b.class] = centsTo(b.amount_cents) })
    return [
      { name: 'Need',  value: map.need },
      { name: 'Want',  value: map.want },
      { name: 'Guilt', value: map.guilt },
    ]
  }, [nwgShare])

  // Mood vs avg spend (convert to dollars)
  const moodBar = useMemo(() => {
    return (summary?.mood_avgs || []).map(m => ({
      mood: m.mood,
      avg: centsTo(m.avg_amount_cents),
    }))
  }, [summary?.mood_avgs])

  // Transform backend alerts to UI cards
  const alertCards = useMemo(() => {
    return alerts.map((it, i) => {
      const tone = it.severity === 'warn' ? 'warn' : it.severity === 'success' ? 'success' : 'info'
      const icon =
        it.code?.includes('bill') ? <CalendarDays size={18}/> :
        it.code?.includes('late') ? <Moon size={18}/> :
        it.code?.includes('wants') ? <PieChart size={18}/> :
        <Sparkles size={18}/>
      return {
        id: it.id ?? i,
        title: it.title,
        desc: it.message,
        tone,
        icon,
      }
    })
  }, [alerts])

  // ---- ML: run prediction based on summary + NWG ----
  useEffect(() => {
    if (!summary) return

    const total = centsTo(summary.total_expense_cents)
    const wants = centsTo(summary.wants_expense_cents)
    const wantsShare = summary.wants_share
    const lateCount = summary.late_night_count
    const regular = runwayRegularRaw
    const power = runwayPowerRaw

    const need = nwgPie[0]?.value ?? 0
    const want = nwgPie[1]?.value ?? 0
    const guilt = nwgPie[2]?.value ?? 0

    // TODO: align this with your exact ML feature order.
    const features: number[] = [
      total,
      wants,
      wantsShare,
      lateCount,
      regular,
      power,
      need,
      want,
      guilt,
      days,
      0, // spare feature
    ]

    setMlLoading(true)
    setMlErr('')
    predictFromFeatures(features)
      .then(setMl)
      .catch(e => setMlErr(e.message || 'ML prediction failed'))
      .finally(() => setMlLoading(false))
  }, [summary, nwgPie, runwayRegularRaw, runwayPowerRaw, days])

  return (
    <AppLayout>
      {/* Header */}
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-3 py-4 sm:px-4">
        <h1 className="text-xl font-semibold">Alerts & Insights</h1>
        <div className="flex gap-2">
          <button
            className={`rounded-xl border px-3 py-1.5 text-sm ${range==='7d'?'border-brand-500 bg-brand-50 text-brand-700':'border-soft bg-white hover:bg-cream'}`}
            onClick={() => setRange('7d')}
          >Last 7 days</button>
          <button
            className={`rounded-xl border px-3 py-1.5 text-sm ${range==='30d'?'border-brand-500 bg-brand-50 text-brand-700':'border-soft bg-white hover:bg-cream'}`}
            onClick={() => setRange('30d')}
          >Last 30 days</button>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-3 sm:px-4">
        {err && <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{err}</div>}

        {/* A. Alerts feed */}
        <SectionCard
          title="Smart Alerts"
          right={<span className="text-xs text-gray-600">{alertCards.length} items</span>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {alertCards.map(a => (
              <AlertCard
                key={String(a.id)}
                icon={a.icon}
                tone={a.tone as any}
                title={a.title}
                description={a.desc}
              />
            ))}
            {(!loading && alertCards.length === 0) && (
              <div className="rounded-xl border border-soft bg-cream p-6 text-center text-gray-600">
                No insights yet. Start logging expenses and moods for personalized advice.
              </div>
            )}
          </div>
        </SectionCard>

        {/* B. Comparisons / Analytics */}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Regular vs Power-Save */}
          <SectionCard title="Runway Comparison">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-soft p-4 text-center">
                <div className="text-sm text-gray-600">Regular</div>
                <div className="mt-1 text-3xl font-semibold">{loading ? '—' : `${runwayRegular}d`}</div>
              </div>
              <div className="rounded-xl border border-soft p-4 text-center">
                <div className="text-sm text-gray-600">Power-Save</div>
                <div className="mt-1 text-3xl font-semibold text-emerald-600">{loading ? '—' : `${runwayPower}d`}</div>
              </div>
            </div>
            <button className="btn-ghost mt-3 inline-flex items-center gap-2" onClick={() => nav('/dashboard')}>
              <Sparkles size={16} /> Try Power-Save on Dashboard
            </button>
          </SectionCard>

          {/* Needs / Wants / Guilt */}
          <SectionCard title="Needs / Wants / Guilt">
            <div className="h-56">
              <ResponsiveContainer>
                <RPieChart>
                  <Pie dataKey="value" data={nwgPie} outerRadius={100} innerRadius={60}>
                    {nwgPie.map((p, i) => <Cell key={i} fill={NWG_COLORS[p.name as 'Need'|'Want'|'Guilt']} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [fmtCurrency(v), n]} />
                </RPieChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Mood vs Spend */}
          <SectionCard title="Mood vs Average Spend">
            <div className="h-56">
              <ResponsiveContainer>
                <RBarChart data={moodBar}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mood" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                  <Bar dataKey="avg" fill="#E25D37" />
                </RBarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Tip: click a bar to open filtered Transactions.
            </div>
          </SectionCard>
        </div>

        {/* C. ML risk & runway */}
        <div className="mt-3">
          <SectionCard title="AI Risk & Runway">
            {mlLoading && <div className="text-sm text-gray-600">Running prediction…</div>}
            {mlErr && <div className="text-sm text-red-600">{mlErr}</div>}
            {ml && !mlLoading && !mlErr && (
              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div>
                  <div className="text-xs text-gray-600 mb-1">Model-estimated runway</div>
                  <div className="text-2xl font-semibold">
                    {ml.tier2.runway_days.toFixed(1)} days
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    Burn rate: {ml.tier2.burn_rate.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 mb-1">Behavior risks (0–100%)</div>
                  <ul className="space-y-1">
                    <li>Late-night spending: {(ml.tier3.risk_late_night * 100).toFixed(1)}%</li>
                    <li>Overspending: {(ml.tier3.risk_overspend * 100).toFixed(1)}%</li>
                    <li>Guilt-driven spend: {(ml.tier3.risk_guilt * 100).toFixed(1)}%</li>
                  </ul>
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Drawer (placeholder) */}
      <Drawer
        open={drawer.open}
        title={drawer.title}
        onClose={() => setDrawer({ open: false, title: '' })}
      >
        {drawer.content ?? <div className="text-gray-600">Details coming soon.</div>}
      </Drawer>
    </AppLayout>
  )
}
