import { useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Card } from '@/components/ui/Card'
import { getProfile, setProfile } from '@/lib/settings'
import { Input } from '@/components/ui/Input'

export default function ProfilePage() {
  const [p, setP] = useState(getProfile())
  const [showPw, setShowPw] = useState(false)

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-4">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Profile</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Name" value={p.name} onChange={(e)=>setP({...p, name: e.target.value})}/>
            <Input label="Email" value={p.email} onChange={(e)=>setP({...p, email: e.target.value})}/>
            <Input label="Timezone" value={p.timezone} onChange={(e)=>setP({...p, timezone: e.target.value})} className="md:col-span-2"/>
            <div className="md:col-span-2">
              <div className="relative">
                <Input label="Change Password" type={showPw?'text':'password'} placeholder="••••••••" />
                <button type="button" onClick={()=>setShowPw(s=>!s)} className="absolute right-3 top-8 rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">
                  {showPw?'Hide':'Show'}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <button onClick={()=>setProfile(p)} className="btn-primary">Save changes</button>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
