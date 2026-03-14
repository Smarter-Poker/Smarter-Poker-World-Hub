import { useState, useEffect } from 'react';
import SEOHead from '../../src/components/seo/SEOHead';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';
import ArenaLedger from '../../src/components/commander/admin/ArenaLedger';
import { busEmit } from '../../src/engine/EventBus';
import { supabase } from '../../src/lib/supabase';

export default function ArenaLedgerPage() {
  useEffect(() => { busEmit.sessionStart?.('commander-arena-ledger'); }, []);
  const [clubId, setClubId] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('commander_staff');
      if (stored) {
        const staff = JSON.parse(stored);
        if (staff.venue_id) setClubId(staff.venue_id);
      }
    } catch (e) { /* silent */ }
  }, []);

  return (
    <CommanderLayout title="Arena Ledger" backHref="/commander/dashboard">
      <SEOHead
        title="Commander — Arena Ledger"
        description="Immutable Live Audit Trail"
        noindex={true}
      />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        {clubId ? (
          <ArenaLedger clubId={clubId} />
        ) : (
          <div className="flex items-center justify-center p-20 text-[#64748B]">
            Loading Venue Data...
          </div>
        )}
      </div>
    </CommanderLayout>
  );
}
