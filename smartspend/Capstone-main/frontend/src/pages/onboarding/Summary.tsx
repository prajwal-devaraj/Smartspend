import OBShell from '@/components/onboarding/OBShell'
import { PrimaryCTA, GhostCTA } from '@/components/ui/CTA'
import { useNavigate } from 'react-router-dom'
import { runway } from '../../lib/mock'


export default function Summary(){
  const nav = useNavigate()
  const reg = runway.days_left_regular
  const ps  = runway.days_left_power_save
  const delta = ps - reg

  return (
    <OBShell>
      <h1 className="mb-6 text-center text-3xl font-bold md:text-4xl">All set 🎉</h1>

      <div className="mx-auto max-w-sm">
        <div className="mb-4 text-2xl font-bold">Days Left</div>
        <div className="space-y-1 text-2xl md:text-3xl">
          <div><span className="font-semibold">Regular:</span> <span className="ml-2">{reg} days</span></div>
          <div><span className="font-semibold">Power-Save</span> <span className="ml-2">{ps} days</span></div>
        </div>

        <p className="mt-5 text-gray-700">
          Cutting Wants &amp; Guilt could stretch your runway by +{delta} days.
        </p>

        <div className="mt-8 space-y-3">
          <PrimaryCTA onClick={()=>nav('/dashboard')}>Go to Dashboard</PrimaryCTA>
          <GhostCTA onClick={()=>nav('/transactions')}>Add your first expense</GhostCTA>
        </div>
      </div>
    </OBShell>
  )
}
