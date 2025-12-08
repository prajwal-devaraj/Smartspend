import AppLayout from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import Toggle from '@/components/ui/Toggle'
import { getNotifications, setNotifications } from '@/lib/settings'
import { useState } from 'react'

export default function NotificationsPage() {
  const [n, setN] = useState(getNotifications())

  const set = (k: keyof typeof n, v: boolean) => {
    const nn = { ...n, [k]: v }
    setN(nn); setNotifications(nn)
  }

  return (
    <AppLayout>
      <div className="max-w-2xl">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Notifications</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Bills</div>
                <p className="text-sm text-gray-600">Remind me about due dates.</p>
              </div>
              <Toggle checked={n.bills} onChange={(v)=>set('bills', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Goals</div>
                <p className="text-sm text-gray-600">Nudges about runway and targets.</p>
              </div>
              <Toggle checked={n.goals} onChange={(v)=>set('goals', v)} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Spending alerts</div>
                <p className="text-sm text-gray-600">Late-night or unusual spending.</p>
              </div>
              <Toggle checked={n.alerts} onChange={(v)=>set('alerts', v)} />
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
