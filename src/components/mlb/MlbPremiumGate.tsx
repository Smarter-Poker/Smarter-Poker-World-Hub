import React, { ReactNode } from 'react';
import Link from 'next/link';
import useVIP from '../../hooks/useVIP';
import { Lock } from 'lucide-react';

interface MlbPremiumGateProps {
    children: ReactNode;
    featureName: string;
}

export default function MlbPremiumGate({ children, featureName }: MlbPremiumGateProps) {
    const { isVip, initializing } = useVIP();

    if (initializing) {
        return (
            <div className="w-full flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-yellow-500"></div>
            </div>
        );
    }

    if (isVip) {
        return <>{children}</>;
    }

    // Secure Paywall overlay (doesn't render children in DOM to prevent inspection)
    return (
        <div className="relative w-full rounded-2xl overflow-hidden border border-[#3E4042] min-h-[500px] bg-[#111111]">
            {/* Fake skeleton background to look like blurred data */}
            <div className="absolute inset-0 opacity-20 pointer-events-none select-none p-6">
                <div className="h-8 bg-gray-600 rounded w-1/3 mb-6"></div>
                <div className="space-y-4">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex space-x-4">
                            <div className="h-12 bg-gray-700 rounded w-1/4"></div>
                            <div className="h-12 bg-gray-700 rounded w-1/4"></div>
                            <div className="h-12 bg-gray-700 rounded w-1/4"></div>
                            <div className="h-12 bg-gray-700 rounded w-1/4"></div>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Absolute overlay over the fake content */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-black/60 backdrop-blur-[2px]">
                <div className="bg-gradient-to-br from-[#1a1a3e] to-[#0a0a2a] p-8 rounded-2xl max-w-md w-full border border-yellow-500/30 shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_60px_rgba(255,215,0,0.05)] text-center">
                    <div className="w-16 h-16 rounded-full mx-auto mb-4 bg-gradient-to-br from-[#FFD700] to-[#FFA500] flex items-center justify-center text-3xl shadow-[0_4px_20px_rgba(255,215,0,0.3)]">
                        <Lock size={28} className="text-black" />
                    </div>
                    <h2 className="text-[#E4E6EB] text-2xl font-extrabold mb-2 tracking-wide">
                        VIP Exclusive
                    </h2>
                    <p className="text-[#B0B3B8] text-sm leading-relaxed mb-6">
                        <strong className="text-[#FFD700] font-bold">{featureName}</strong> is a proprietary model output. 
                        Upgrade to VIP to unlock unlimited access to the full MLB intelligence suite!
                    </p>
                    <Link href="/hub/diamond-store?tab=vip"
                        className="block w-full py-3.5 px-5 rounded-xl bg-gradient-to-br from-[#FFD700] to-[#FFA500] text-black font-extrabold text-[15px] shadow-[0_4px_16px_rgba(255,215,0,0.3)] transition-transform hover:scale-[1.02]"
                    >
                        Get VIP Membership
                    </Link>
                </div>
            </div>
        </div>
    );
}
