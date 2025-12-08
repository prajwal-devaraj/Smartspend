import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardTitle } from '@/components/ui/Card'
import { daysFromNow } from '@/lib/format'
import { get } from '@/lib/api'

type UpcomingBillItem = {
  occurrence_id: number
  bill_id: number
  name: string
  amount_cents: number
  due_date: string // YYYY-MM-DD
  status: string
}

function getUserId(): number {
  return Number(localStorage.getItem('userId') || 0)
}

export default function UpcomingBills() {
  const navigate = useNavigate()
  const [items, setItems] = useState<UpcomingBillItem[]>([])

  useEffect(() => {
    const uid = getUserId()
    if (!uid) return

    let cancelled = false
    async function load() {
      try {
        const res = await get<{ items: UpcomingBillItem[] }>(
          '/dashboard/upcoming-bills',
          { user_id: uid, days: 7 }
        )
        if (!cancelled) setItems(res.items || [])
      } catch (e) {
        console.error('Failed to load upcoming bills', e)
        if (!cancelled) setItems([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const upcoming = [...items].sort(
    (a, b) => daysFromNow(a.due_date) - daysFromNow(b.due_date)
  ).slice(0, 2)

  return (
    <Card>
      <CardTitle>Upcoming Bills</CardTitle>
      <ul className="space-y-2 text-sm">
        {upcoming.length === 0 && (
          <li className="text-gray-600">No bills due in the next 7 days.</li>
        )}
        {upcoming.map((b) => (
          <li key={b.occurrence_id} className="flex items-center justify-between">
            <span className="font-medium">{b.name}</span>
            <span className="text-gray-700">
              in {daysFromNow(b.due_date)} days
            </span>
          </li>
        ))}
      </ul>
      <button
        className="mt-3 w-full rounded-2xl border border-soft bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors"
        onClick={() => navigate('/bills')}
      >
        + Add Bill
      </button>
    </Card>
  )
}
