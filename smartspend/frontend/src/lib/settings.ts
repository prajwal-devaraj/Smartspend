type NWG = 'Need' | 'Want' | 'Guilt'

export type Profile = { name: string; email: string; timezone: string }
export type Category = { id: string; name: string; nwg: NWG }
export type Notifications = {
  bills: boolean; goals: boolean; alerts: boolean
}
export type GoalPrefs = { runwayTarget: number; showAchievements: boolean }

const ns = (k: string) => `smartspend:${k}`

export const load = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(ns(key)); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}
export const save = (key: string, v: unknown) => localStorage.setItem(ns(key), JSON.stringify(v))

// Defaults
export const getProfile = () =>
  load<Profile>('profile', { name: 'Sandeep', email: 'sandeep@example.com', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })

export const setProfile = (p: Profile) => save('profile', p)

export const getCategories = () =>
  load<Category[]>('categories', [
    { id: 'c1', name: 'Groceries', nwg: 'Need' },
    { id: 'c3', name: 'Dining', nwg: 'Want' },
    { id: 'c5', name: 'Impulse', nwg: 'Guilt' },
  ])
export const setCategories = (cs: Category[]) => save('categories', cs)

export const getNotifications = () =>
  load<Notifications>('notifications', { bills: true, goals: true, alerts: true })
export const setNotifications = (n: Notifications) => save('notifications', n)

export const getGoalPrefs = () =>
  load<GoalPrefs>('goalPrefs', { runwayTarget: 45, showAchievements: true })
export const setGoalPrefs = (g: GoalPrefs) => save('goalPrefs', g)
