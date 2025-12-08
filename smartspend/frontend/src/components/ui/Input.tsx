import { InputHTMLAttributes, forwardRef, useId } from 'react'

type P = InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string }

export const Input = forwardRef<HTMLInputElement, P>(function Input(
  { label, hint, error, className='', id, ...props }, ref
){
  const auto = useId()
  const inputId = id || auto
  const hintId = hint ? `${inputId}-hint` : undefined
  const errId  = error ? `${inputId}-error` : undefined

  return (
    <div className="space-y-1">
      {label && <label htmlFor={inputId} className="block text-sm text-gray-800">{label}</label>}
      <input
        id={inputId}
        ref={ref}
        aria-invalid={!!error}
        aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
        className={`w-full rounded-2xl border border-soft bg-white px-3 py-2 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-200 ${className}`}
        {...props}
      />
      {hint && <p id={hintId} className="text-xs text-gray-500">{hint}</p>}
      {error && <p id={errId} className="text-xs text-red-600">{error}</p>}
    </div>
  )
})
