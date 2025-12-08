// src/lib/onboarding.ts
import { get, post, put } from "./api";

export async function saveCadence(payload: {
  pay_cadence: "weekly" | "biweekly" | "monthly";
  pay_anchor_day_of_month?: number;   // for monthly/biweekly
  pay_anchor_weekday?: string;        // for weekly (e.g., "sunday")
}) {
  const user_id = Number(localStorage.getItem("userId"));
  return put("/budget", { user_id, ...payload });
}

export async function saveMonthlyIncomeCents(monthly_income_cents: number) {
  const user_id = Number(localStorage.getItem("userId"));
  return put("/budget/period", { user_id, monthly_income_cents });
}

export async function createBills(bills: Array<{
  name: string;
  amount_cents?: number;
  recurrence_rule: "weekly" | "biweekly" | "monthly";
  next_due_date?: string; // YYYY-MM-DD
}>) {
  const user_id = Number(localStorage.getItem("userId"));
  return post("/onboarding/bills", { user_id, bills });
}

export async function finishOnboarding() {
  const user_id = Number(localStorage.getItem("userId"));
  const data = await post("/onboarding/complete", { user_id });
  // backend returns { access_token or access, scope:'app', ... }
  const access = (data as any).access_token ?? (data as any).access;
  if (access) localStorage.setItem("access", access);
  localStorage.setItem("scope", "app");
  return data;
}

export async function fetchDashboard() {
  const user_id = Number(localStorage.getItem("userId"));
  return get("/dashboard/summary", { user_id });
}
