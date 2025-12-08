export default function OBProgress({ step }: { step: 1 | 2 | 3 }) {
  const pct = step === 1 ? 'w-1/3' : step === 2 ? 'w-2/3' : 'w-full'
  return (
    <div className="mb-6">
      <div className="mb-3 text-center text-sm text-gray-600">
        <span className="font-medium">Setup</span> {step} of 3
      </div>

      {/* segmented track + filled bar for extra clarity */}
      <div className="relative">
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand-500/90' : 'bg-gray-200'}`}
              aria-hidden="true"
            />
          ))}
        </div>
        <span className="sr-only">Progress {step} of 3</span>
      </div>
    </div>
  )
}
