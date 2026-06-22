import React from 'react';

export const SectionHeader = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
  <div className="flex items-center gap-2 mb-3 px-4 md:px-0">
    <Icon size={16} className="text-[#00D4FF]" aria-hidden="true" />
    <h2 className="text-[15px] font-extrabold text-[#00D4FF] tracking-[0.15em] m-0 drop-shadow-[0_0_8px_rgba(0,212,255,0.3)] font-['Rajdhani']">
      {label}
    </h2>
  </div>
);

export default SectionHeader;
