import { createBrowserClient } from '@supabase/ssr'
import { useState } from 'react'

export default function LoginPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [phone, setPhone] = useState('')

  const sendSMS = async () => {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (error) alert(error.message)
    else alert('Success: Code sent to ' + phone)
  }

  return (
    <div style={{ backgroundColor: 'black', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif' }}>
      <div style={{ backgroundColor: '#18181b', padding: '60px', borderRadius: '32px', textAlign: 'center', width: '100%', maxWidth: '450px', border: '1px solid #27272a', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
        <h1 style={{ fontSize: '40px', fontWeight: '900', marginBottom: '8px', letterSpacing: '-2px', fontStyle: 'italic' }}>SMARTER.POKER</h1>
        <p style={{ color: '#71717a', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '4px', marginBottom: '40px' }}>Access Node</p>
        <input 
          type="tel" 
          placeholder="+1 (555) 000-0000" 
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ width: '100%', backgroundColor: 'black', border: '1px solid #27272a', color: 'white', padding: '20px', borderRadius: '16px', marginBottom: '20px', fontSize: '18px', outline: 'none' }}
        />
        <button onClick={sendSMS} style={{ width: '100%', backgroundColor: '#ea580c', color: 'white', padding: '20px', borderRadius: '16px', fontWeight: '900', border: 'none', cursor: 'pointer', fontSize: '16px', textTransform: 'uppercase' }}>
          Verify via SMS
        </button>
      </div>
    </div>
  )
}
