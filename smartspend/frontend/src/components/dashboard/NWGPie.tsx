// src/components/dashboard/NWGPie.tsx
import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip } from 'recharts'

export type NWG = 'Need' | 'Want' | 'Guilt'

export type NWGRow = { name: NWG; value: number; pct?: number }

type Props = {
  data: NWGRow[]
}

const COLOR_MAP: Record<NWG, string> = {
  Need: '#10B981',  // green
  Want: '#F59E0B',  // amber
  Guilt: '#EF4444', // red
}

export default function NWGPie({ data }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1

  return (
    <div className="w-full">
      {/* title section */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800">
          Spending Breakdown
        </h3>
      </div>

      <div className="grid grid-cols-2 items-center gap-2">
        {/* pie chart */}
        <div className="h-44 w-full">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={3}
                stroke="#fff"
                strokeWidth={2}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={COLOR_MAP[d.name]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: any, n: any, p: any) => [
                  `$${(v as number).toFixed(2)} (${p.payload.pct}%)`,
                  n,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* legend and data */}
        <div className="space-y-2 text-sm">
          {data.map((d) => {
            const pct = Math.round((d.value / total) * 100)
            return (
              <div
                key={d.name}
                className="flex items-center justify-between text-gray-700"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: COLOR_MAP[d.name] }}
                  />
                  <span className="font-medium">{d.name}</span>
                </div>
                <span>
                  ${d.value.toFixed(2)}{' '}
                  <span className="text-gray-500 text-xs">({pct}%)</span>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* footer total */}
      <div className="mt-3 text-xs text-gray-600">
        Total Spent: ${total.toFixed(2)}
      </div>
    </div>
  )
}
