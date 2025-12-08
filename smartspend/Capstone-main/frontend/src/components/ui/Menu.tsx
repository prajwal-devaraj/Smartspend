import { useEffect, useRef, useState } from 'react'

export function Kebab({ items }: { items: { label: string; onClick: () => void; destructive?: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const onDoc = (e: MouseEvent)=>{ if(!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return ()=>document.removeEventListener('mousedown', onDoc)
  },[])
  return (
    <div className="relative" ref={ref}>
      <button onClick={()=>setOpen(o=>!o)} className="rounded-xl px-2 py-1 hover:bg-white">⋯</button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-40 rounded-2xl border border-soft bg-white p-1 shadow-card">
          {items.map((it,i)=>(
            <button
              key={i}
              onClick={()=>{ setOpen(false); it.onClick() }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-brand-50 ${it.destructive ? 'text-red-600 hover:bg-red-50' : ''}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
