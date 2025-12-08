import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardTitle } from '@/components/ui/Card'
import { get } from '@/lib/api'

type AchievementItem = {
  user_achievement_id?: number
  achievement_id: number
  code: string
  name: string
  description: string
  icon?: string
  earned_at: string
}

function getUserId(): number {
  return Number(localStorage.getItem('userId') || 0)
}

export default function AchievementsCard() {
  const navigate = useNavigate()
  const [items, setItems] = useState<AchievementItem[]>([])

  useEffect(() => {
    const uid = getUserId()
    if (!uid) return

    let cancelled = false
    async function load() {
      try {
        const res = await get<{ items: AchievementItem[] }>(
          '/dashboard/achievements/recent',
          { user_id: uid, limit: 6 }
        )
        if (!cancelled) setItems(res.items || [])
      } catch (e) {
        console.error('Failed to load achievements', e)
        if (!cancelled) setItems([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const latest = items[0]

  return (
    <Card>
      <CardTitle>Achievements</CardTitle>
      <div className="text-sm">
        {latest ? (
          <>
            <div>
              {latest.icon || '🏆'}{' '}
              <span className="font-medium">{latest.name}</span>
            </div>
            <p className="mt-1 text-gray-600 text-xs">
              {latest.description}
            </p>
          </>
        ) : (
          <div className="text-gray-600 text-sm">
            Keep going — your first milestone is coming soon.
          </div>
        )}

        <button
          className="mt-3 w-full rounded-2xl border border-soft bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors"
          onClick={() => navigate('/goals')}
        >
          View all
        </button>
      </div>
    </Card>
  )
}
