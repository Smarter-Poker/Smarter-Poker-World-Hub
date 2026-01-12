import { createBrowserClient } from '@supabase/ssr'
import { useState } from 'react'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const sendSMS = async () => {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (error) alert(error.message)
    else alert('Code sent to ' + phone)
  }

  return (
    <div style={{ backgroundColor: 'black', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
      <div style={{ backgroundColor: '#18181b', padding: '60px', borderRadius: '32px', textAlign: 'center', width: '100%', maxWidth: '450px', border: '1px solid #27272a' }}>
        <h1 style={{ fontSize: '40px', fontWeight: '900', marginBottom: '40px', fontStyle: 'italic' }}>SMARTER.POKER</h1>
        <input 
          type="tel" 
          placeholder="+15550000000" 
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ width: '100%', backgroundColor: 'black', border: '1px solid #27272a', color: 'white', padding: '20px', borderRadius: '16px', marginBottom: '20px', fontSize: '18px' }}
        />
        <button onClick={sendSMS} style={{ width: '100%', backgroundColor: '#ea580c', color: 'white', padding: '20px', borderRadius: '16px', fontWeight: '900', border: 'none', cursor: 'pointer' }}>
          VERIFY VIA SMS
        </button>
      </div>
    </div>
  )
}
