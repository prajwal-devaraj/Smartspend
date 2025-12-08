// src/components/ui/ProgressBar.tsx
type ProgressBarProps = {
  value: number
  max: number
  barColor?: string // optional, default provided
}

export default function ProgressBar({ value, max, barColor = 'bg-emerald-500' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="h-2 w-full rounded-full bg-gray-200">
      <div
        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
