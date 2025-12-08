// src/pages/Dashboard.tsx
import { useEffect, useRef, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import {
  BalanceCard,
  DailyBurnCard,
  DaysLeftCard,
  Next7DaysBurnCard,
} from '@/components/dashboard/KpiCards'
import BurnRateChart, { BurnPoint } from '@/components/dashboard/BurnRateChart'
import NWGPie, { type NWGRow, type NWG } from '@/components/dashboard/NWGPie'
import InsightsPreview from '@/components/dashboard/InsightsPreview'
import UpcomingBills from '@/components/dashboard/UpcomingBills'
import AchievementsCard from '@/components/dashboard/AchievementsCard'
import { Card, CardTitle } from '@/components/ui/Card'
import { get } from '@/lib/api'

type Range = 'today' | '7d' | '30d'

function getUserId(): number {
  return Number(localStorage.getItem('userId') || 0)
}

export default function Dashboard() {
  const [range, setRange] = useState<Range>('7d')
  const [burnData, setBurnData] = useState<BurnPoint[]>([])
  const [nwgRows, setNwgRows] = useState<NWGRow[]>([
    { name: 'Need', value: 0, pct: 0 },
    { name: 'Want', value: 0, pct: 0 },
    { name: 'Guilt', value: 0, pct: 0 },
  ])


  const scrollRef = useRef<HTMLDivElement | null>(null)

  // -------- Burn series (math from backend) --------
  useEffect(() => {
    const uid = getUserId()
    if (!uid) return

    let cancelled = false

    async function loadBurn() {
      try {
        const res = await get<{ points: { d: string; burn_cents: number }[] }>(
          '/dashboard/burn-series',
          { user_id: uid, days: 31 }
        )
        if (cancelled) return

        const pts: BurnPoint[] = (res.points || []).map((p) => ({
          day: p.d,
          spend: (p.burn_cents || 0) / 100,
        }))
        setBurnData(pts)
      } catch (e) {
        console.error('Failed to load burn series', e)
        if (!cancelled) setBurnData([])
      }
    }

    void loadBurn()
    return () => {
      cancelled = true
    }
  }, [])

  // auto-scroll to latest day
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth
    })
  }, [burnData.length])

  // shared Y scale & ticks for burn chart
  const maxSpend = burnData.reduce((m, p) => Math.max(m, p.spend), 0)
  const step = Math.max(10, Math.ceil((maxSpend || 10) / 4)) // at least $10 steps
  const yTicks = [0, step, step * 2, step * 3, step * 4]
  const yDomain: [number, number] = [0, step * 4]

  // -------- NWG breakdown (math from backend) --------
  useEffect(() => {
    const uid = getUserId()
    if (!uid) return

    let cancelled = false
    async function loadNwg() {
      try {
        const res = await get<{ breakdown: { class: string; amount_cents: number }[] }>(
          '/dashboard/nwg',
          { user_id: uid, range }
        )
        if (cancelled) return

        const base: Record<NWG, number> = { Need: 0, Want: 0, Guilt: 0 }
        for (const r of res.breakdown || []) {
          const cls = String(r.class || '').toLowerCase()
          const dollars = (r.amount_cents || 0) / 100
          if (cls === 'need') base.Need += dollars
          if (cls === 'want') base.Want += dollars
          if (cls === 'guilt') base.Guilt += dollars
        }
        const total = base.Need + base.Want + base.Guilt || 1
        const rows: NWGRow[] = (['Need', 'Want', 'Guilt'] as NWG[]).map((k) => ({
          name: k,
          value: Number(base[k].toFixed(2)),
          pct: Math.round((base[k] / total) * 100),
        }))
        setNwgRows(rows)
      } catch (e) {
        console.error('Failed to load NWG breakdown', e)
        if (!cancelled)
          setNwgRows([
            { name: 'Need', value: 0, pct: 0 },
            { name: 'Want', value: 0, pct: 0 },
            { name: 'Guilt', value: 0, pct: 0 },
          ])
      }
    }
    void loadNwg()
    return () => {
      cancelled = true
    }
  }, [range])

  return (
    <AppLayout>
      {/* KPI Row */}
      <div className="grid gap-3 md:grid-cols-4">
        <BalanceCard />
        <DaysLeftCard />
        <DailyBurnCard />
        <Next7DaysBurnCard />
      </div>

      {/* Row 2: Daily Burn + NWG */}
      <div className="mt-2 grid gap-3 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardTitle>Daily Burn</CardTitle>

          {/* Fixed Y-axis + scrollable chart */}
          <div className="relative mt-2 h-44 w-full md:h-52 lg:h-56">
            {/* left Y labels (fixed) */}
            <div className="pointer-events-none absolute left-0 top-0 flex h-full w-12 flex-col justify-between text-[11px] text-gray-500">
              {yTicks
                .slice()
                .reverse()
                .map((t) => (
                  <span key={t}>${t}</span>
                ))}
            </div>

            {/* scrollable chart area */}
            <div
              ref={scrollRef}
              className="absolute right-0 top-0 bottom-0 left-12 overflow-x-auto no-scrollbar"
            >
              <div
                style={{
                  minWidth: Math.max(burnData.length, 7) * 70,
                  height: '100%',
                }}
              >
                <BurnRateChart data={burnData} yDomain={yDomain} yTicks={yTicks} />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-2 flex items-center justify-between">
            <CardTitle>Need/Want/Guilt</CardTitle>
            <div className="flex items-center gap-1">
              {(['today', '7d', '30d'] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded-xl border px-2.5 py-1 text-xs transition ${
                    range === r
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-soft bg-white hover:bg-cream'
                  }`}
                  title={
                    r === '7d'
                      ? 'Last 7 days'
                      : r === '30d'
                      ? 'Last 30 days'
                      : 'Today'
                  }
                >
                  {r === 'today' ? 'Today' : r === '7d' ? 'Week' : 'Month'}
                </button>
              ))}
            </div>
          </div>

          <NWGPie data={nwgRows} />
        </Card>
      </div>

      {/* Row 3: Insights / Bills / Achievements */}
      <div className="mt-2 grid gap-2 md:grid-cols-3">
        <InsightsPreview />
        <UpcomingBills />
        <AchievementsCard />
      </div>
    </AppLayout>
  )
}
