import React from 'react';

export const MetalFrame = ({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={`relative bg-gradient-to-b from-[#3d4f5f] via-[#1a2332] to-[#0d1117] border-[3px] border-[#3d4f5f] rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden ${className}`}
  >
    {/* Frame Bolts */}
    <div className="absolute w-3 h-3 rounded-full border border-[#2a3a4a] bg-[radial-gradient(circle,#5a6a7a_30%,#3a4a5a_70%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center text-[8px] text-[#1a2a3a] top-2 left-2 pointer-events-none z-0">
      +
    </div>
    <div className="absolute w-3 h-3 rounded-full border border-[#2a3a4a] bg-[radial-gradient(circle,#5a6a7a_30%,#3a4a5a_70%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center text-[8px] text-[#1a2a3a] top-2 right-2 pointer-events-none z-0">
      +
    </div>
    <div className="absolute w-3 h-3 rounded-full border border-[#2a3a4a] bg-[radial-gradient(circle,#5a6a7a_30%,#3a4a5a_70%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center text-[8px] text-[#1a2a3a] bottom-2 left-2 pointer-events-none z-0">
      +
    </div>
    <div className="absolute w-3 h-3 rounded-full border border-[#2a3a4a] bg-[radial-gradient(circle,#5a6a7a_30%,#3a4a5a_70%)] shadow-[inset_0_1px_2px_rgba(255,255,255,0.2)] flex items-center justify-center text-[8px] text-[#1a2a3a] bottom-2 right-2 pointer-events-none z-0">
      +
    </div>
    <div className="relative z-10 w-full h-full">{children}</div>
  </div>
);

export default MetalFrame;
