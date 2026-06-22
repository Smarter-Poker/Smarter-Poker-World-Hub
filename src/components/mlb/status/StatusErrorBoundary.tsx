import React from 'react';
import { RefreshCw, ServerCrash } from 'lucide-react';
import MetalFrame from '../../ui/MetalFrame';
import BottomNavBar from '../../ui/BottomNavBar';
import { logError } from '@/utils/logger';

export class StatusErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    seo: React.ReactNode;
    header: React.ReactNode;
    nav: React.ReactNode;
  },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    logError('Status UI Error', error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="page-container pb-[70px]">
          {this.props.seo}
          {this.props.header}
          {this.props.nav}
          <main className="feed-layout flex justify-center items-center min-h-[50vh] py-12">
            <MetalFrame className="w-full max-w-md p-8 text-center border-[#FF4444]/50 shadow-[0_0_20px_rgba(255,68,68,0.15)]">
              <ServerCrash className="w-12 h-12 text-[#FF4444] mx-auto mb-4" aria-hidden="true" />
              <h2 className="text-[31px] font-black text-white capitalize tracking-[0.12em] mb-2 font-['Rajdhani']">
                Render Error
              </h2>
              <p className="text-slate-400 text-[13px] font-bold capitalize tracking-widest mb-6 break-words">
                {this.state.error?.message || 'An unexpected rendering error occurred.'}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 hex-button px-6 py-3 text-[14px] font-black tracking-widest capitalize touch-manipulation text-[#00D4FF] hover:text-white transition-colors"
              >
                <RefreshCw size={14} />
                Reload
              </button>
            </MetalFrame>
          </main>
          <BottomNavBar />
        </div>
      );
    }
    return this.props.children;
  }
}
