import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import type { Transaction as Tx } from '@/lib/types'

export default function SplitModal({
  tx, onClose, onSave
}: {
  tx: Tx
  onClose: () => void
  onSave: (parts: Tx[]) => void
}) {
  const [rows, setRows] = useState([{ amount: tx.amount, category: tx.category, nwg: tx.nwg ?? 'Want' as const, note: '' }])

  const total = rows.reduce((s,r)=>s+(Number(r.amount)||0), 0)
  const valid = Math.abs(total - tx.amount) < 0.0001 && rows.every(r=>Number(r.amount)>0)

  const add = () => setRows(rs => [...rs, { amount: 0, category: 'Dining', nwg: 'Want', note: '' }])
  const update = (i:number, patch: Partial<typeof rows[number]>) => {
    setRows(rs => rs.map((r,idx)=> idx===i ? {...r, ...patch} : r))
  }
  const remove = (i:number) => setRows(rs => rs.filter((_,idx)=>idx!==i))

  const save = () => {
    const parts: Tx[] = rows.map((r)=>({
      ...tx,
      id: crypto.randomUUID(),
      amount: Number(r.amount),
      category: r.category,
      nwg: r.nwg,
      note: r.note,
    }))
    onSave(parts)
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose}>
      <div className="absolute left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-soft bg-white p-5 shadow-card" onClick={(e)=>e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Split Transaction</h3>
          <button onClick={onClose} className="rounded-xl px-2 py-1 text-sm hover:bg-gray-100">Close</button>
        </div>

        <div className="space-y-3">
          {rows.map((r,i)=>(
            <div key={i} className="grid grid-cols-12 items-end gap-2">
              <Input className="col-span-3" label="Amount" type="number" value={r.amount} onChange={e=>update(i,{amount:Number(e.target.value)})}/>
              <Input className="col-span-3" label="Category" value={r.category} onChange={(e)=>update(i,{category:e.target.value})}/>
              <Select className="col-span-3" label="N/W/G" value={r.nwg} onChange={(e)=>update(i,{nwg: e.target.value as any})}>
                <option value="Need">Need</option>
                <option value="Want">Want</option>
                <option value="Guilt">Guilt</option>
              </Select>
              <Input className="col-span-3" label="Note" value={r.note} onChange={(e)=>update(i,{note:e.target.value})}/>
              {rows.length>1 && <button onClick={()=>remove(i)} className="col-span-12 rounded-xl px-2 py-1 text-sm text-red-600 hover:bg-red-50">Remove</button>}
            </div>
          ))}
          <button onClick={add} className="btn-ghost">+ Add line</button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm">Total: <span className={`font-semibold ${valid?'text-emerald-700':'text-red-600'}`}>{total.toFixed(2)}</span> / {tx.amount.toFixed(2)}</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={save} disabled={!valid} className="btn-primary disabled:opacity-50">Save split</button>
          </div>
        </div>
      </div>
    </div>
  )
}
