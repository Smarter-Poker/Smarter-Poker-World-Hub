import { createBrowserClient } from '@supabase/ssr'
import { useState } from 'react'
import { Phone, Facebook, Chrome } from 'lucide-react'

export default function LoginPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [phone, setPhone] = useState('')

  const sendSMS = async () => {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (error) alert(error.message)
    else alert('Code sent to ' + phone)
  }

  return (
    <div style={{ backgroundColor: 'black', minHeight: '100 screen', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
      <div style={{ backgroundColor: '#18181b', padding: '40px', borderRadius: '24px', border: '1px solid #27272a', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '900', marginBottom: '8px', letterSpacing: '-1px' }}>SMARTER.POKER</h1>
        <p style={{ color: '#71717a', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '32px' }}>Access Node</p>
        <input 
          type="tel" 
          placeholder="+1 (555) 000-0000" 
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ width: '100%', backgroundColor: 'black', border: '1px solid #27272a', color: 'white', padding: '16px', borderRadius: '12px', marginBottom: '16px', outline: 'none' }}
        />
        <button onClick={sendSMS} style={{ width: '100%', backgroundColor: '#ea580c', color: 'white', padding: '16px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer', border: 'none' }}>
          Verify via SMS
        </button>
      </div>
    </div>
  )
}
