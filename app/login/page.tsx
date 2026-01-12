'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useState } from 'react'
import { Mail, Phone, Facebook, Chrome } from 'lucide-react'

export default function UnifiedLogin() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [phone, setPhone] = useState('')

  const loginWithGoogle = () => supabase.auth.signInWithOAuth({ 
    provider: 'google', 
    options: { redirectTo: 'https://smarter.poker/auth/callback' } 
  })

  const loginWithFacebook = () => supabase.auth.signInWithOAuth({ 
    provider: 'facebook', 
    options: { redirectTo: 'https://smarter.poker/auth/callback' } 
  })

  const sendSMSCode = async () => {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (!error) alert('Check your phone for the code from Smarter.Poker!')
    else alert(error.message)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-6">
      <div className="w-full max-w-md border border-zinc-800 bg-zinc-900 p-10 rounded-3xl shadow-2xl">
        <h1 className="text-4xl font-black text-center text-white mb-2 tracking-tighter italic">SMARTER.POKER</h1>
        <p className="text-zinc-500 text-center mb-8 font-bold text-xs uppercase tracking-[0.3em]">Empire Access Node</p>
        
        <div className="space-y-4">
          <button onClick={loginWithGoogle} className="w-full flex items-center justify-center gap-3 bg-white text-black py-4 rounded-xl font-bold hover:bg-zinc-200 transition-all active:scale-95">
            <Chrome size={20} /> Continue with Google
          </button>
          
          <button onClick={loginWithFacebook} className="w-full flex items-center justify-center gap-3 bg-[#1877F2] text-white py-4 rounded-xl font-bold hover:bg-[#166fe5] transition-all active:scale-95">
            <Facebook size={20} /> Continue with Facebook
          </button>

          <div className="relative py-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-zinc-800"></span></div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-widest"><span className="bg-zinc-900 px-4 text-zinc-500 font-black">Secure SMS Delivery</span></div>
          </div>

          <input 
            type="tel" 
            placeholder="+1 (555) 000-0000" 
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full bg-black border border-zinc-800 text-white py-4 px-5 rounded-xl focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all text-lg"
          />
          
          <button onClick={sendSMSCode} className="w-full bg-orange-600 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-orange-500 transition-all active:scale-95 shadow-lg shadow-orange-900/20">
            Send Code
          </button>
        </div>
      </div>
    </div>
  )
}
