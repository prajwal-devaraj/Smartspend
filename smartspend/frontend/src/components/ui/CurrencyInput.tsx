import { InputHTMLAttributes, forwardRef } from 'react'

type P = InputHTMLAttributes<HTMLInputElement> & { label?: string }
export default forwardRef<HTMLInputElement, P>(function CurrencyInput({ label, ...props }, ref){
  return (
    <label className="block">
      {label && <div className="mb-2 text-sm text-gray-600">{label}</div>}
      <div className="flex items-center rounded-2xl border border-soft bg-white px-3 py-2">
        <span className="mr-2 text-gray-700">$</span>
        <input ref={ref} {...props}
          className="w-full appearance-none bg-transparent outline-none"
          inputMode="decimal"
        />
        <span className="ml-2 text-gray-500">USD</span>
      </div>
    </label>
  )
})
