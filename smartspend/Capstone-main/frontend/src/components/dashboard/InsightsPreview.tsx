import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardTitle } from '@/components/ui/Card'
import { get } from '@/lib/api'

type InsightItem = {
  id?: number
  source: string
  code: string
  title: string
  message: string
  severity: 'info' | 'warn' | 'error' | string
  created_at: string
}

function getUserId(): number {
  return Number(localStorage.getItem('userId') || 0)
}

export default function InsightsPreview() {
  const [items, setItems] = useState<InsightItem[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    const uid = getUserId()
    if (!uid) return

    let cancelled = false
    async function load() {
      try {
        const res = await get<{ items: InsightItem[] }>(
          '/dashboard/insights-preview',
          { user_id: uid, days: 7 }
        )
        if (!cancelled) setItems(res.items || [])
      } catch (e) {
        console.error('Failed to load insights preview', e)
        if (!cancelled) setItems([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const top = items[0]

  return (
    <Card className="transition-all hover:shadow-lg hover:border-brand-500">
      <CardTitle>
        <span className="hover:text-brand-500 transition-colors">Insights</span>
      </CardTitle>
      <div className="text-sm">
        {top ? (
          <>
            <div className="font-medium">{top.title || top.message}</div>
            <p className="mt-1 text-gray-600 text-xs">{top.message}</p>
          </>
        ) : (
          <div className="text-gray-600 text-sm">
            No insights yet. As you log more activity, we’ll surface patterns here.
          </div>
        )}
        <div className="mt-3">
          <button
            className="btn-ghost w-full hover:bg-cream hover:text-brand-700 transition-colors"
            onClick={() => navigate('/insights')}
          >
            See all Insights
          </button>
        </div>
      </div>
    </Card>
  )
}
