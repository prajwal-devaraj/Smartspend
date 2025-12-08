// src/lib/mood.ts
export type Mood = 'happy' | 'neutral' | 'stressed' | 'impulse' | 'skipped'
export type MoodTarget = { type: 'transaction' | 'day'; id: string } // day = 'YYYY-MM-DD'

export type MoodEvent = {
  id: string
  user_id?: string
  target_type: MoodTarget['type']
  target_id: string
  mood: Mood
  note?: string | null
  captured_at: string
  source: 'chart_click' | 'post_txn_prompt'
}

const LS_EVENTS = 'smartspend.mood_events'
const LS_NAG = 'smartspend.mood_antinag' // {lastSkip: ISO, consecutiveSkips: number}

/** Read all mood events */
export function loadMoodEvents(): MoodEvent[] {
  try {
    const raw = localStorage.getItem(LS_EVENTS)
    if (raw) return JSON.parse(raw) as MoodEvent[]
  } catch {}
  return []
}

/** Append an event */
export function saveMoodEvent(ev: MoodEvent) {
  const all = loadMoodEvents()
  all.unshift(ev)
  try { localStorage.setItem(LS_EVENTS, JSON.stringify(all)) } catch {}
}

/** Basic de-dup: one per target per day */
export function hasMoodForTarget(t: MoodTarget) {
  const all = loadMoodEvents()
  return all.some(e => e.target_type === t.type && e.target_id === t.id)
}

/** Anti-nag: throttle auto prompts after two consecutive skips for 7 days */
export function recordSkip() {
  const now = new Date().toISOString()
  const curr = loadNag()
  const consecutive = (curr?.consecutiveSkips ?? 0) + 1
  persistNag({ lastSkip: now, consecutiveSkips: consecutive })
}

export function recordAnswered() {
  persistNag({ lastSkip: undefined, consecutiveSkips: 0 })
}

export function shouldAutoPromptToday(): boolean {
  const n = loadNag()
  if (!n) return true
  // If 2+ consecutive skips and last skip < 7 days ago, suppress auto prompts.
  if ((n.consecutiveSkips ?? 0) >= 2 && n.lastSkip) {
    const diff = Date.now() - new Date(n.lastSkip).getTime()
    const days = diff / (1000 * 60 * 60 * 24)
    return days >= 7
  }
  return true
}

type NagState = { lastSkip?: string; consecutiveSkips: number }
function loadNag(): NagState | null {
  try {
    const raw = localStorage.getItem(LS_NAG)
    if (raw) return JSON.parse(raw) as NagState
  } catch {}
  return null
}
function persistNag(n: NagState) {
  try { localStorage.setItem(LS_NAG, JSON.stringify(n)) } catch {}
}
