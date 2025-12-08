// src/components/dashboard/MoodModal.tsx
import { useEffect, useRef, useState } from 'react'
import type { Mood } from '@/lib/mood'

type P = {
  open: boolean
  contextLine: string     // e.g. "Sep 25 • $92 • 11:20 PM • Late-night"
  onSave: (mood: Mood, note?: string) => void
  onSkip: () => void
}

const moods: Array<{ key: Mood; label: string; emoji: string }> = [
  { key: 'happy',   label: 'Happy',   emoji: '😊' },
  { key: 'neutral', label: 'Neutral', emoji: '😐' },
  { key: 'stressed',label: 'Stressed',emoji: '😟' },
  { key: 'impulse', label: 'Impulse', emoji: '⚡' },
]

export default function MoodModal({ open, contextLine, onSave, onSkip }: P) {
  const [selected, setSelected] = useState<Mood | null>(null)
  const [note, setNote] = useState('')
  const firstBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) { setSelected(null); setNote(''); return }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onSkip() }
    document.addEventListener('keydown', onEsc)
    const t = setTimeout(()=> firstBtn.current?.focus(), 10)
    return () => { clearTimeout(t); document.removeEventListener('keydown', onEsc) }
  }, [open, onSkip])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-[1px]" aria-modal="true" role="dialog" aria-labelledby="mood-title">
      <div className="absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-soft bg-white p-5 shadow-card">
        <h3 id="mood-title" className="text-lg font-semibold">How were you feeling during this spend?</h3>
        <p className="mt-1 text-sm text-gray-600">{contextLine}</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {moods.map((m, i) => (
            <button
              key={m.key}
              ref={i===0 ? firstBtn : undefined}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                selected === m.key ? 'border-brand-500 bg-brand-50' : 'border-soft bg-white hover:bg-cream'
              }`}
              aria-pressed={selected === m.key}
              onClick={() => setSelected(m.key)}
            >
              <span className="text-lg">{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm text-gray-700">
          Add a quick note (optional)
          <input
            value={note}
            onChange={(e)=>setNote(e.target.value.slice(0,140))}
            maxLength={140}
            className="mt-1 w-full rounded-xl border border-soft bg-white px-3 py-2"
            placeholder="Add a quick note (optional)"
          />
        </label>

        <div className="mt-4 flex items-center justify-between">
          <button onClick={onSkip} className="btn-ghost">Skip</button>
          <button
            onClick={()=> selected && onSave(selected, note || undefined)}
            className="btn-primary"
            disabled={!selected}
          >
            Save
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-500">This helps tailor insights & predictions.</p>
      </div>
    </div>
  )
}
