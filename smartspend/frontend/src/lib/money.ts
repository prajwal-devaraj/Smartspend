// src/lib/money.ts
export const dollarsToCents = (d: number) => Math.round(Number(d || 0) * 100);
export const centsToDollars = (c: number) => Math.round(Number(c || 0)) / 100;

export const fmtUSD = (d: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(d) ? d : 0);
