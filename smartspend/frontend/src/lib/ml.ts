// src/lib/ml.ts
export type MlResponse = {
  tier2: {
    burn_rate: number
    runway_days: number
  }
  tier3: {
    risk_late_night: number
    risk_overspend: number
    risk_guilt: number
  }
}

// Simple helper that calls your Flask endpoint directly.
// You can later swap the base URL to env if needed.
export async function predictFromFeatures(features: number[]): Promise<MlResponse> {
  const res = await fetch('http://localhost:5000/api/v1/ml/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ features }),
  })

  if (!res.ok) {
    let msg = `ML API error: ${res.status}`
    try {
      const data = await res.json()
      if (data?.error) msg = data.error
    } catch {
      // ignore json parse error
    }
    throw new Error(msg)
  }

  return res.json()
}
