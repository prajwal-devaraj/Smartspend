type P = { checked: boolean; onChange: (v: boolean) => void; label?: string }
export default function Toggle({ checked, onChange, label }: P) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition
        ${checked ? 'bg-brand-500' : 'bg-neutral-300'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      {label && <span className="ml-3 text-sm">{label}</span>}
    </button>
  )
}
