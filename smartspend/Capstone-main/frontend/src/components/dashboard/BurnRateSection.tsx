// src/components/dashboard/BurnRateSection.tsx
import { useEffect, useState } from 'react'
import BurnRateChart, { BurnPoint } from './BurnRateChart'
import { Card, CardTitle } from '@/components/ui/Card'
import { get } from '@/lib/api'

type BurnSeriesResponse = {
  points: Array<{ d: string; burn_cents: number }>
}

function getUserId(): number {
  return Number(localStorage.getItem('userId') || 0)
}

export default function BurnRateSection() {
  const [data, setData] = useState<BurnPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const uid = getUserId()
    if (!uid) return

    let cancelled = false
    async function load() {
      try {
        const res = await get<BurnSeriesResponse>('/dashboard/burn-series', {
          user_id: uid,
          days: 31,
        })
        if (cancelled) return

        const mapped: BurnPoint[] = (res.points || []).map((p) => ({
          day: p.d,
          spend: (p.burn_cents || 0) / 100,
        }))
        setData(mapped)
        setLoading(false)
      } catch (e) {
        console.error('Failed to load burn-series', e)
        if (!cancelled) {
          setData([])
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Dynamic Y-axis scale (same idea as Dashboard)
  const maxSpend = data.reduce((m, p) => Math.max(m, p.spend), 0)
  const step = Math.max(10, Math.ceil((maxSpend || 10) / 4))
  const yTicks = [0, step, step * 2, step * 3, step * 4]
  const yDomain: [number, number] = [0, step * 4]

  return (
    <Card className="col-span-2">
      <CardTitle>Daily Burn (last 30 days)</CardTitle>
      {loading ? (
        <div className="py-6 text-sm text-gray-500">Loading…</div>
      ) : data.length === 0 ? (
        <div className="py-6 text-sm text-gray-500">No burn data yet.</div>
      ) : (
        <div className="mt-2 h-44 w-full md:h-52 lg:h-56">
          <BurnRateChart data={data} yDomain={yDomain} yTicks={yTicks} />
        </div>
      )}
    </Card>
  )
}
