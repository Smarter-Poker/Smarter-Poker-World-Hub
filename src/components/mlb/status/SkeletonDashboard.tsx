import React from 'react';
import MetalFrame from '../../ui/MetalFrame';

export const SkeletonDashboard = () => (
  <div className="flex flex-col gap-8 mt-6">
    <div className="px-4 md:px-0">
      <MetalFrame className="px-5 py-4 h-[74px] animate-pulse bg-white/5">
        <div />
      </MetalFrame>
    </div>
    <div className="px-4 md:px-0">
      <div className="h-6 w-48 bg-white/5 rounded animate-pulse mb-4" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <MetalFrame key={i} className="p-4 h-[76px] animate-pulse bg-white/5">
            <div />
          </MetalFrame>
        ))}
      </div>
    </div>
    <div className="px-4 md:px-0">
      <div className="h-6 w-48 bg-white/5 rounded animate-pulse mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <MetalFrame key={i} className="p-5 h-[94px] animate-pulse bg-white/5">
            <div />
          </MetalFrame>
        ))}
      </div>
    </div>
  </div>
);
