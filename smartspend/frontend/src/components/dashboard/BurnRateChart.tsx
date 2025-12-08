import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

export type BurnPoint = {
  day: string        // label on X-axis ("M/D")
  spend: number      // dollars for that day
}

type Props = {
  data: BurnPoint[]
  yDomain: [number, number]
  yTicks: number[]
}

export default function BurnRateChart({ data, yDomain, yTicks }: Props) {
  return (
    <ResponsiveContainer>
      <AreaChart
        data={data}
        margin={{ left: 0, right: 20, top: 10, bottom: 0 }}
      >
        <defs>
          <linearGradient id="fillBrand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E25D37" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#E25D37" stopOpacity={0.08} />
          </linearGradient>
        </defs>

        {/* grid uses same ticks/domain as our manual Y-axis */}
        <CartesianGrid vertical={false} stroke="#eee" />

        {/* hidden Y axis (just to align grid lines & scale) */}
        <YAxis hide domain={yDomain} ticks={yTicks} />

        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          interval={0}
          minTickGap={10}
        />

        <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Spend']} />

        <Area
          type="monotone"
          dataKey="spend"
          stroke="#E25D37"
          strokeWidth={2}
          fill="url(#fillBrand)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
