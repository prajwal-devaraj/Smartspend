import type { Transaction, Bill, Category, Insight, Achievement, NWG } from './types'

// -------------------- YOUR DATA (unchanged) --------------------
export const transactions: Transaction[] = [
  { id:"t1", type:"expense", amount:12.50, occurred_at:"2025-09-28T23:10:00Z", merchant:"Starbucks",  time:"Dining",        nwg:"Want", late_night:true,  mood:"impulse", note:"" },
  { id:"t2", type:"expense", amount:62.00, occurred_at:"2025-09-27T19:20:00Z", merchant:"GroceryMart",  time:"Dining",     nwg:"Need", late_night:false, mood:"neutral" },
  { id:"t3", type:"income",  amount:1200.00,occurred_at:"2025-09-25T08:00:00Z", merchant:"Payroll",      time:"Dining",        nwg:null,   late_night:false, mood:null },
  { id:"t4", type:"expense", amount:19.99, occurred_at:"2025-09-26T22:45:00Z", merchant:"Netflix",     time:"Dining", nwg:"Want", late_night:true,  mood:"neutral" },
  { id:"t5", type:"expense", amount:45.00, occurred_at:"2025-09-24T12:10:00Z", merchant:"Uber",         time:"Dining",     nwg:"Need", late_night:false, mood:"stressed" },
  // NEW GUILT EXPENSE FOR THIS MONTH
  { id:"t6", type:"expense", amount:18.50, occurred_at:"2025-10-07T18:30:00Z", merchant:"LateNightSnacks", time:"Impulse", nwg:"Guilt", late_night:true, mood:"impulse", note:"" }
]

export const bills: Bill[] = [
  { id:'b1', name:'Rent',        amount:800, cadence:'monthly', next_due:'2025-10-01', category:'Housing',   nwg:'Need' },
  { id:'b2', name:'Electricity', amount:60,  cadence:'monthly', next_due:'2025-10-04', category:'Utilities', nwg:'Need' },
  { id:'b3', name:'Gym',         amount:45,  cadence:'monthly', next_due:'2025-10-08', category:'Health',    nwg:'Need' },
  { id:'b1', name:'Dinner',         amount:800, cadence:'monthly', next_due:'2025-10-01', category:'Housing',   nwg:'Guilt' }
]

export const categories: Category[] = [
  { id:'c1', name:'Groceries',     nwg:'Need' },
  { id:'c2', name:'Rent',          nwg:'Need' },
  { id:'c3', name:'Dining',        nwg:'Want' },
  { id:'c4', name:'Subscriptions', nwg:'Want' },
  { id:'c5', name:'Impulse',       nwg:'Guilt' },
]

export const insights: Insight[] = [
  { id:'i1', type:'late_night', message:'Late-night spending ↑ 20% this week', severity:'warn' },
  { id:'i2', type:'power_save', message:'Cutting Wants & Guilt could add +14 days', severity:'info' },
  { id:'i3', type:'bill_due',   message:'Rent due in 2 days', severity:'info' }
]

export const achievements: Achievement[] = [
  { id:'a1', name:'7-day streak',           earned_at:'2025-09-27' },
  { id:'a2', name:'15-day runway goal met', earned_at:'2025-09-20' }
]

export const runway = {
  computed_at:'2025-09-28T12:00:00Z',
  balance_cents:190000,
  days_left_regular:34,
  days_left_power_save:48,
  goal_days:45
}

// -----------------------------------------------------------------

// ===== Derived helpers =====

export const CATEGORY_TO_NWG: Record<string, NWG> = categories.reduce((acc, c) => {
  acc[c.name] = c.nwg
  return acc
}, {} as Record<string, NWG>)

export const CATEGORIES: string[] = Array.from(
  new Set([
    
    ...categories.map(c => c.name),
    'Income',
  ])
).sort((a, b) => a.localeCompare(b))

export function nwgForCategory(cat: string): NWG | null {
  return CATEGORY_TO_NWG[cat] ?? null
}

// ===== Local persistence around the mock =====

const LS_KEY = 'smartspend.txns'

export function loadTxns(): Transaction[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw) as Transaction[]
  } catch {}
  // fallback to your baked-in mocks
  return transactions.slice()
}

export function saveTxns(list: Transaction[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list))
  } catch {}
}

export function addTxn(input: Omit<Transaction, 'id'>): Transaction {
  const list = loadTxns()
  const row: Transaction = { id: crypto.randomUUID(), ...input }
  list.unshift(row)
  saveTxns(list)
  return row
}

export function updateTxn(id: string, patch: Partial<Transaction>) {
  const list = loadTxns()
  const i = list.findIndex(t => t.id === id)
  if (i >= 0) {
    list[i] = { ...list[i], ...patch }
    saveTxns(list)
  }
}

export function deleteTxn(id: string) {
  const list = loadTxns().filter(t => t.id !== id)
  saveTxns(list)
}
