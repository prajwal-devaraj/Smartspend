import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export default function AdjustGoalModal({
  initial,
  onSave,
  onClose,
}: {
  initial: number
  onSave: (days: number) => void
  onClose: () => void
}) {
  const [days, setDays] = useState(initial)

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose}>
      <div
        onClick={(e)=>e.stopPropagation()}
        className="absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-soft bg-white p-5 shadow-card"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Adjust runway goal</h3>
          <button className="rounded-xl p-1 hover:bg-cream" onClick={onClose}><X size={18} /></button>
        </div>

        <p className="mb-3 text-sm text-gray-600">
          Choose a runway target between <b>1</b> and <b>30</b> days.
        </p>

        <div className="mb-4">
          <input
            type="range"
            min={1}
            max={30}
            value={days}
            onChange={(e)=>setDays(Number(e.target.value))}
            className="w-full"
          />
          <div className="mt-1 text-center text-lg font-semibold">{days} days</div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={() => onSave(days)} className="btn-primary">Save</button>
        </div>
      </div>
    </div>
  )
}