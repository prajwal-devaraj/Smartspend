export default function Pill({ children, onClick, active=false }: {children:React.ReactNode; onClick?:()=>void; active?:boolean}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-2 text-[15px] transition
        ${active ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-soft bg-white hover:bg-white'}
      `}
    >
      {children}
    </button>
  )
}
