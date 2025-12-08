import AppLayout from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import Slider from '@/components/ui/Slider'
import Toggle from '@/components/ui/Toggle'
import { getGoalPrefs, setGoalPrefs } from '@/lib/settings'
import { useState } from 'react'

export default function GoalPrefsPage() {
  const [g, setG] = useState(getGoalPrefs())

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-4">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Goal Preferences</h2>

          <div className="mb-5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm text-gray-700">Default runway target</span>
              <span className="text-sm font-medium">{g.runwayTarget} days</span>
            </div>
            <Slider value={g.runwayTarget} onChange={(v)=>{ const ng={...g, runwayTarget:v}; setG(ng); setGoalPrefs(ng) }} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Show achievements</div>
              <p className="text-sm text-gray-600">Display streaks and badges on Dashboard.</p>
            </div>
            <Toggle checked={g.showAchievements} onChange={(v)=>{ const ng={...g, showAchievements:v}; setG(ng); setGoalPrefs(ng) }} />
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
