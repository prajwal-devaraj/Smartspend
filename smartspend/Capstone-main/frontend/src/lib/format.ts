export const formatCurrency = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

export const formatCurrencyCompact = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n)

export const daysFromNow = (iso: string) => {
  const now = new Date()
  const target = new Date(iso + (iso.includes('T') ? '' : 'T00:00:00'))
  return Math.ceil((+target - +now) / (1000 * 60 * 60 * 24))
}
