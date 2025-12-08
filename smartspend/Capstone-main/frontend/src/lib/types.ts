// src/lib/types.ts

export type NWG = 'Need' | 'Want' | 'Guilt'
export type Mood = 'happy' | 'neutral' | 'impulse' | 'stressed' | 'sad'


export type Transaction = {
  id: string
  type: string
  amount: number
  occurred_at: string
  merchant: string

  nwg: NWG | null
  late_night: boolean
  mood: string | null
  note?: string
  payDay?: string 
  time: string,  
  // others ...
}


export type Bill = {
  id: string
  name: string
  amount: number
  category: string
  cadence: string
  next_due: string
  nwg?: string
  recurrence?: boolean
  status?: 'active' | 'paused'
  [key: string]: any
}



export type Category = {
  id: string
  name: string
  nwg: NWG
}

export type Insight = {
  id: string
  type: string
  message: string
  severity: 'info' | 'warn' | 'error'
}

export type Achievement = {
  id: string
  name: string
  earned_at: string // YYYY-MM-DD
}
