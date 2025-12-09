// src/lib/ml.ts
import { post } from "./api"

// ------------------------------
// Shared ML Types
// ------------------------------
export type MlResponse = {
  tier2: {
    runway_days: number
    burn_rate: number
  }
  tier3: {
    risk_late_night: number
    risk_overspend: number
    risk_guilt: number
  }
}

// ------------------------------
// 0. Legacy ML predictor used by Insights & Goals
// ------------------------------
export const predictFromFeatures = async (features: number[]): Promise<MlResponse> => {
  const [
    total = 0,
    wantsOrBurn = 0,
    shareOrWindow = 0,
    e1 = 0,
    e2 = 0,
    e3 = 0,
    e4 = 0,
    riskLate = 0,
    riskOver = 0,
    riskGuilt = 0,
    e8 = 0,
    e9 = 0
  ] = features

  const safeTotal = Math.max(1, total || 1)
  const burn_rate = wantsOrBurn > 0 ? wantsOrBurn : safeTotal / Math.max(1, shareOrWindow || 7)
  const runway_days = Math.max(1, safeTotal / Math.max(1, burn_rate))

  return {
    tier2: { runway_days, burn_rate },
    tier3: {
      risk_late_night: Math.min(1, Math.abs(riskLate)),
      risk_overspend:  Math.min(1, Math.abs(riskOver)),
      risk_guilt:      Math.min(1, Math.abs(riskGuilt)),
    },
  }
}

// ------------------------------
// Backend ML Calls
// ------------------------------
export const predictBurn = async (amount: number) => {
  const res = await post("/ml/predict/burn", { amount })
  return res.data.burn_rate as number
}

export const predictRunway = async (balance: number, dailyBurn: number) => {
  const res = await post("/ml/predict/runway", { balance, daily_burn: dailyBurn })
  return res.data.runway_days as number | null
}

export const classifyNWG = async (text: string) => {
  const res = await post("/ml/classify/nwg", { text })
  return res.data.category as "needs" | "wants" | "guilt" | "unknown"
}

export const predictGuilt = async (amount: number, mood: string, hour: number) => {
  const res = await post("/ml/predict/guilt", { amount, mood, hour })
  return res.data.guilt_score as number
}

export const fetchInsights = async (balance: number, burn: number) => {
  const res = await post("/ml/insights", { balance, burn })
  return res.data.insights as string[]
}

export const fetchFullInsights = async () => {
  const res = await post("/ml/insights/full")
  return res.data.full_insights as string[]
}

export const fetchRiskScore = async (
  burn: number,
  lateNight: number,
  moodScore: number
) => {
  const res = await post("/ml/risk", { burn, late_night: lateNight, mood_score: moodScore })
  return res.data.risk_score as number
}
