/**
 * Tournament Table Break Manager
 * /commander/tournaments/[id]/break-manager
 *
 * Shows auto-break alerts when 9+ open seats exist on other tables.
 * Floor manager reviews suggested assignments, can adjust, then executes.
 * Generates printable seat assignment receipts for wireless printer.
 *
 * Flow:
 * 1. System detects: "Table 4 has 6 players, 10 open seats on other tables → BREAK TABLE 4"
 * 2. Floor manager sees suggested assignments (who goes where)
 * 3. Manager can swap assignments if needed
 * 4. Tap "Break Table & Print Receipts"
 * 5. Executes all moves via API
 * 6. Opens print dialog → sends to wireless receipt printer
 * 7. Hand receipts to players: "You're now at Table 2, Seat 7"
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, AlertTriangle, Loader2, RefreshCw, Printer,
  Users, ArrowRight, Check, X, ChevronRight, Table2, Zap
} from 'lucide-react';

export default function BreakManager() {
  const router = useRouter();
  const { id: tournamentId } = router.query;
  const [loading, setLoading] = useState(true);
  const [breakData, setBreakData] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [executed, setExecuted] = useState(null);
  const [receipts, setReceipts] = useState(null);
  const printRef = useRef(null);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  const checkBreak = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const res = await fetch(`/api/commander/tournaments/${tournamentId}/auto-break`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const json = await res.json();
      if (json.success) {
        setBreakData(json.data);
        if (json.data.assignments) setAssignments(json.data.assignments);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tournamentId]);

  useEffect(() => { checkBreak(); const i = setInterval(checkBreak, 30000); return () => clearInterval(i); }, [checkBreak]);

  const executeBreak = async () => {
    if (!breakData?.break_table || assignments.length === 0) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/commander/tournaments/${tournamentId}/auto-break`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          break_table: breakData.break_table,
          assignments
        })
      });
      const json = await res.json();
      if (json.success) {
        setExecuted(json.data);
        setReceipts(json.data.receipts);
      }
    } catch (err) { console.error(err); }
    finally { setExecuting(false); }
  };

  const printReceipts = () => {
    if (!receipts) return;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Table Break Receipts</title>
  <style>
    @page { margin: 0; size: 80mm auto; }
    body { font-family: 'Courier New', monospace; margin: 0; padding: 0; }
    .receipt {
      width: 72mm; padding: 4mm; margin: 0 auto;
      page-break-after: always; border-bottom: 1px dashed #000;
    }
    .receipt:last-child { page-break-after: avoid; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .big { font-size: 20px; }
    .med { font-size: 14px; }
    .sm { font-size: 11px; }
    .divider { border-top: 1px dashed #000; margin: 3mm 0; }
    .row { display: flex; justify-content: space-between; }
    .arrow { font-size: 24px; text-align: center; margin: 2mm 0; }
  </style>
</head>
<body>
${receipts.map(r => `
  <div class="receipt">
    <div class="center bold med">${r.tournament_name}</div>
    <div class="center sm">TABLE BREAK</div>
    <div class="divider"></div>
    <div class="center bold med">${r.player_name}</div>
    <div class="divider"></div>
    <div class="row sm">
      <span>FROM:</span>
      <span class="bold">Table ${r.from_table}, Seat ${r.from_seat}</span>
    </div>
    <div class="arrow">⬇</div>
    <div class="row">
      <span class="med">NEW SEAT:</span>
      <span class="bold big">T${r.to_table} - S${r.to_seat}</span>
    </div>
    <div class="divider"></div>
    ${r.chips ? `<div class="row sm"><span>Chips:</span><span class="bold">${Number(r.chips).toLocaleString()}</span></div>` : ''}
    <div class="sm center" style="margin-top:2mm;opacity:0.6">
      ${new Date(r.timestamp).toLocaleTimeString()}
    </div>
    <div class="sm center" style="opacity:0.4;margin-top:1mm">Smarter.Poker</div>
  </div>
`).join('')}
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    // Small delay for rendering
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  if (loading) return (
    <div className="min-h-screen bg-[#18191A] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
    </div>
  );

  return (
    <>
      <Head><title>Table Break Manager | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <img src="/images/btn-back.png" alt="Back" style={{ height: 44, objectFit: 'contain' }} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Table Break Manager</h1>
            <p className="text-xs text-[#B0B3B8]">{breakData?.total_players || 0} players across {breakData?.tables_active || 0} tables</p>
          </div>
          <button onClick={checkBreak} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        <div className="p-4 space-y-4">

          {/* ===== EXECUTED STATE ===== */}
          {executed && (
            <div className="space-y-4">
              <div className="bg-[#31A24C]/10 border-2 border-[#31A24C]/30 rounded-2xl p-5 text-center">
                <Check className="w-12 h-12 text-[#31A24C] mx-auto mb-3" />
                <h2 className="text-xl font-bold text-white mb-1">Table {executed.table_broken} Broken</h2>
                <p className="text-sm text-[#B0B3B8]">{executed.players_moved} players moved to new seats</p>
              </div>

              {/* Print button */}
              {receipts && receipts.length > 0 && (
                <button onClick={printReceipts}
                  className="w-full py-5 rounded-2xl bg-[#1877F2] text-white text-lg font-bold flex items-center justify-center gap-3 active:bg-[#1565D8]">
                  <Printer className="w-6 h-6" />
                  Print {receipts.length} Seat Receipts
                </button>
              )}

              {/* Move summary */}
              <div className="space-y-2">
                {(executed.moves || []).map((m, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 bg-[#242526] rounded-xl border border-[#3A3B3C]">
                    <span className="text-sm font-medium text-white flex-1">{m.player_name}</span>
                    <span className="text-xs text-[#B0B3B8]">T{m.from_table}-S{m.from_seat}</span>
                    <ArrowRight className="w-4 h-4 text-[#31A24C]" />
                    <span className="text-sm font-bold text-[#31A24C]">T{m.to_table}-S{m.to_seat}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => { setExecuted(null); setReceipts(null); checkBreak(); }}
                className="w-full py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] font-medium active:bg-[#4A4B4C]">
                Check Again
              </button>
            </div>
          )}

          {/* ===== BREAK DETECTION ===== */}
          {!executed && (
            <>
              {/* Table summary */}
              <div className="space-y-2">
                <p className="text-xs text-[#B0B3B8] font-medium uppercase tracking-wider">Table Status</p>
                {(breakData?.table_summary || []).map(t => (
                  <div key={t.table_number}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                      t.table_number === breakData?.break_table && breakData?.should_break
                        ? 'bg-[#EF4444]/10 border-[#EF4444]/30'
                        : 'bg-[#242526] border-[#3A3B3C]'
                    }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      t.table_number === breakData?.break_table && breakData?.should_break
                        ? 'bg-[#EF4444]/20 text-[#EF4444]'
                        : 'bg-[#1877F2]/20 text-[#1877F2]'
                    }`}>
                      T{t.table_number}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{t.players}/{t.max_seats} players</p>
                      <p className="text-xs text-[#B0B3B8]">{t.open_seats} open seat{t.open_seats !== 1 ? 's' : ''}</p>
                    </div>
                    {t.table_number === breakData?.break_table && breakData?.should_break && (
                      <span className="px-3 py-1 rounded-full bg-[#EF4444] text-white text-xs font-bold">BREAK</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Break Alert */}
              {breakData?.should_break ? (
                <div className="bg-[#F59E0B]/10 border-2 border-[#F59E0B]/40 rounded-2xl p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Zap className="w-6 h-6 text-[#F59E0B] flex-shrink-0 mt-0.5" />
                    <div>
                      <h2 className="text-base font-bold text-[#F59E0B]">Break Table {breakData.break_table}</h2>
                      <p className="text-sm text-[#B0B3B8] mt-1">{breakData.reason}</p>
                    </div>
                  </div>

                  {/* Assignments preview */}
                  <div className="space-y-1.5 mb-4">
                    <p className="text-xs text-[#B0B3B8] font-medium uppercase tracking-wider">Seat Assignments</p>
                    {assignments.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 bg-[#18191A] rounded-lg">
                        <span className="text-sm text-white flex-1 truncate">{a.player_name}</span>
                        <span className="text-xs text-[#B0B3B8] font-mono">T{a.from_table}-S{a.from_seat}</span>
                        <ArrowRight className="w-3 h-3 text-[#F59E0B]" />
                        <span className="text-sm font-bold text-[#31A24C] font-mono">T{a.to_table}-S{a.to_seat}</span>
                      </div>
                    ))}
                  </div>

                  {/* Execute button */}
                  <button onClick={executeBreak} disabled={executing}
                    className="w-full py-4 rounded-xl bg-[#F59E0B] text-black text-base font-bold flex items-center justify-center gap-2 active:bg-[#D97706] disabled:opacity-50">
                    {executing ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Breaking Table...</>
                    ) : (
                      <><Printer className="w-5 h-5" /> Break Table & Print Receipts</>
                    )}
                  </button>
                </div>
              ) : (
                <div className="bg-[#31A24C]/10 border border-[#31A24C]/30 rounded-2xl p-5 text-center">
                  <Check className="w-10 h-10 text-[#31A24C] mx-auto mb-2" />
                  <h2 className="text-base font-bold text-white mb-1">No Break Needed</h2>
                  <p className="text-sm text-[#B0B3B8]">{breakData?.reason || 'Tables are balanced'}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
