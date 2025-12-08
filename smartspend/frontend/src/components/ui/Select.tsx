type P = React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }
export default function Select({ label, className='', ...props }: P) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-sm text-gray-700">{label}</span>}
      <select
        className={`w-full rounded-2xl border border-soft bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-200 ${className}`}
        {...props}
      />
    </label>
  )
}
