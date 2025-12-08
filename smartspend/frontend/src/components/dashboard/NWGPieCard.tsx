// src/components/dashboard/NWGPieCard.tsx
import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import NWGPie, { type NWGRow } from './NWGPie'
import { get } from '@/lib/api'

type BackendItem = {
  class: 'need' | 'want' | 'guilt'
  amount_cents: number
}

type BackendResponse = {
  breakdown: BackendItem[]
}

function getUserId(): number {
  return Number(localStorage.getItem('userId') || 0)
}

export default function NWGPieCard() {
  const [rows, setRows] = useState<NWGRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const uid = getUserId()
    if (!uid) return

    let cancelled = false
    async function load() {
      try {
        const res = await get<BackendResponse>('/dashboard/nwg', {
          user_id: uid,
          range: '7d',
        })
        if (cancelled) return

        const mapName = (cls: BackendItem['class']): NWGRow['name'] =>
          cls === 'need' ? 'Need' : cls === 'want' ? 'Want' : 'Guilt'

        const mapped: NWGRow[] = (res.breakdown || []).map((b) => ({
          name: mapName(b.class),
          value: (b.amount_cents || 0) / 100,
        }))

        setRows(mapped)
        setLoading(false)
      } catch (e) {
        console.error('Failed to load NWG breakdown', e)
        if (!cancelled) {
          setRows([])
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card>
      {loading ? (
        <div className="py-6 text-sm text-gray-500">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-sm text-gray-500">
          No spending yet to show a breakdown.
        </div>
      ) : (
        <NWGPie data={rows} />
      )}
    </Card>
  )
}
