import { X, Sparkles } from 'lucide-react'
import type { Achievement } from '@/lib/types'

export default function AchievementModal({
  achievement,
  onClose,
}: {
  achievement: Achievement
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose}>
      <div
        onClick={(e)=>e.stopPropagation()}
        className="absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-soft bg-white p-5 shadow-card"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="text-brand-500" />
            <h3 className="text-lg font-semibold">Achievement unlocked</h3>
          </div>
          <button className="rounded-xl p-1 hover:bg-cream" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="mb-2 text-base font-semibold">{achievement.name}</div>
        <div className="mb-3 text-sm text-gray-600">Earned on {new Date(achievement.earned_at).toDateString()}</div>

        <div className="rounded-xl bg-cream p-3 text-sm">
          Keep up the momentum! Next milestone: try doubling this streak for an extra badge and runway boost.
        </div>

        <div className="mt-4 flex items-center justify-end">
          <button className="btn-primary" onClick={onClose}>Nice!</button>
        </div>
      </div>
    </div>
  )
}
