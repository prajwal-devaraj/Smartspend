import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { formatCurrency } from '@/lib/format'
import type { Transaction as Tx, Mood } from '@/lib/types'

export default function TransactionDrawer({
  tx,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  onSplit,
}: {
  tx: Tx
  onClose: () => void
  onSave: (tx: Tx) => void
  onDelete: (id: string) => void
  onDuplicate?: (tx: Tx) => void
  onSplit?: (tx: Tx) => void
}) {
  const [state, setState] = useState<Tx>(tx)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setState(tx) }, [tx])

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  const save = () => {
    if (state.type === 'expense' && !state.merchant.trim()) return
    if (!state.amount || state.amount <= 0) return
    onSave(state)
  }

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLInputElement>('input,select,button')
    first?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]" />
      <aside
        ref={panelRef}
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col overflow-hidden border-l border-soft bg-white shadow-xl animate-[fadeIn_120ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit transaction"
      >
        <div className="flex items-center justify-between border-b border-soft px-5 py-3">
          <div>
            <div className="text-sm text-gray-600">
              {state.type === 'expense' ? 'Expense' : 'Income'} • {formatCurrency(state.amount || 0)}
            </div>
            <h3 className="text-lg font-semibold leading-tight">Transaction</h3>
          </div>
          <button onClick={onClose} className="rounded-xl px-2 py-1 text-sm hover:bg-gray-100" aria-label="Close">Close</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Type"
                value={state.type}
                onChange={(e) => setState((s) => ({ ...s, type: e.target.value as Tx['type'], nwg: e.target.value === 'income' ? null : (s.nwg ?? 'Want') }))}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </Select>
              <Input label="Amount" type="number" inputMode="decimal" value={state.amount} onChange={(e) => setState((s) => ({ ...s, amount: Number(e.target.value) }))}/>
            </div>

            <Input
              label="Date & time"
              type="datetime-local"
              value={state.occurred_at.slice(0, 16)}
              onChange={(e) => setState((s) => ({ ...s, occurred_at: new Date(e.target.value).toISOString(), late_night: isLate(new Date(e.target.value)) }))}
            />

            {state.type === 'expense' && (
              <Input label="Merchant" value={state.merchant} onChange={(e) => setState((s) => ({ ...s, merchant: e.target.value }))}/>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Input label="Category" value={state.category} onChange={(e) => setState((s) => ({ ...s, category: e.target.value }))}/>
              <Select label="N/W/G" value={state.nwg ?? 'Want'} disabled={state.type === 'income'} onChange={(e) => setState((s) => ({ ...s, nwg: e.target.value as any }))}>
                <option value="Need">Need</option>
                <option value="Want">Want</option>
                <option value="Guilt">Guilt</option>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Mood"
                value={state.mood ?? 'neutral'}
                onChange={(e) => setState((s) => ({ ...s, mood: e.target.value as Mood }))}
              >
                <option value="happy">happy</option>
                <option value="neutral">neutral</option>
                <option value="impulse">impulse</option>
                <option value="stressed">stressed</option>
              </Select>
              <label className="mt-6 flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={state.late_night} onChange={(e) => setState((s) => ({ ...s, late_night: e.target.checked }))}/>
                Late-night spend
              </label>
            </div>

            <Input label="Note" value={state.note ?? ''} onChange={(e) => setState((s) => ({ ...s, note: e.target.value }))} placeholder="Add note…"/>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-soft px-5 py-3">
          <div className="flex items-center gap-2">
            {onDuplicate && <button onClick={() => onDuplicate(state)} className="rounded-2xl px-3 py-1.5 text-sm hover:bg-white">Duplicate</button>}
            {onSplit && state.type === 'expense' && <button onClick={() => onSplit(state)} className="rounded-2xl px-3 py-1.5 text-sm hover:bg-white">Split</button>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onDelete(state.id)} className="rounded-2xl px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Delete</button>
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={save} className="btn-primary">Save</button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function isLate(d: Date) {
  const h = d.getHours()
  return h >= 22 || h < 5
}
