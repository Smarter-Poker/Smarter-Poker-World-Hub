import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

const TABLE_PRESETS = [
  {
    id: 'reg-heavy',
    label: 'Reg-Heavy Study',
    players: [
      { name: 'UTG Seat', position: 'UTG', stack: 105, vpip: 22, pfr: 19, af: 3.5 },
      { name: 'MP Seat', position: 'MP', stack: 112, vpip: 24, pfr: 21, af: 3.2 },
      { name: 'CO Seat', position: 'CO', stack: 145, vpip: 26, pfr: 23, af: 3.8 },
      { name: 'Hero Seat', position: 'BTN', stack: 100, vpip: 25, pfr: 20, af: 3.0, isHero: true },
      { name: 'SB Seat', position: 'SB', stack: 88, vpip: 18, pfr: 15, af: 2.8 },
      { name: 'BB Seat', position: 'BB', stack: 92, vpip: 14, pfr: 11, af: 2.2 },
    ],
  },
  {
    id: 'loose-passive',
    label: 'Loose-Passive Study',
    players: [
      { name: 'UTG Seat', position: 'UTG', stack: 45, vpip: 55, pfr: 8, af: 0.6 },
      { name: 'Hero Seat', position: 'MP', stack: 120, vpip: 25, pfr: 20, af: 3.0, isHero: true },
      { name: 'CO Seat', position: 'CO', stack: 200, vpip: 48, pfr: 5, af: 0.4 },
      { name: 'BTN Seat', position: 'BTN', stack: 65, vpip: 42, pfr: 12, af: 1.0 },
      { name: 'SB Seat', position: 'SB', stack: 78, vpip: 38, pfr: 10, af: 0.8 },
      { name: 'BB Seat', position: 'BB', stack: 55, vpip: 32, pfr: 6, af: 0.5 },
    ],
  },
  {
    id: 'mixed-aggression',
    label: 'Mixed Aggression Study',
    players: [
      { name: 'UTG Seat', position: 'UTG', stack: 98, vpip: 22, pfr: 18, af: 3.0 },
      { name: 'MP Seat', position: 'MP', stack: 52, vpip: 50, pfr: 7, af: 0.5 },
      { name: 'Hero Seat', position: 'CO', stack: 115, vpip: 25, pfr: 20, af: 3.0, isHero: true },
      { name: 'BTN Seat', position: 'BTN', stack: 180, vpip: 38, pfr: 32, af: 4.5 },
      { name: 'SB Seat', position: 'SB', stack: 90, vpip: 12, pfr: 10, af: 2.0 },
      { name: 'BB Seat', position: 'BB', stack: 68, vpip: 45, pfr: 5, af: 0.4 },
    ],
  },
];

function classifyTable(players) {
  const avgVpip = players.reduce((total, player) => total + player.vpip, 0) / players.length;
  const avgAf = players.reduce((total, player) => total + player.af, 0) / players.length;

  if (avgVpip > 35) return { type: 'Loose-Passive', tone: 'positive', summary: 'Prioritize Thin Value And Selective Isolation.' };
  if (avgVpip > 30 && avgAf > 2.5) return { type: 'Loose-Aggressive', tone: 'warning', summary: 'Tighten Entry Ranges And Protect Strong Hands.' };
  if (avgVpip < 22 && avgAf > 2.5) return { type: 'Tight-Aggressive', tone: 'danger', summary: 'Pressure Capped Ranges And Defend Position Carefully.' };
  if (avgVpip < 22) return { type: 'Tight-Passive', tone: 'info', summary: 'Increase Steal Frequency Against Excess Folding.' };
  return { type: 'Mixed', tone: 'accent', summary: 'Build Adjustments Seat By Seat.' };
}

function buildAdjustments(players, tableType) {
  const targets = players.filter((player) => player.vpip > 35 && !player.isHero);
  const aggressiveSeats = players.filter((player) => player.af > 4 && !player.isHero);
  const shortStacks = players.filter((player) => player.stack < 60 && !player.isHero);
  const adjustments = [];

  if (targets.length > 0) {
    adjustments.push({ priority: 'Primary', tone: 'positive', text: `Isolate ${targets.map((player) => player.position).join(', ')} With A Wider Value Range.` });
    adjustments.push({ priority: 'Primary', tone: 'positive', text: 'Value Bet Thinner When Calling Ranges Stay Wide.' });
  }
  if (aggressiveSeats.length > 0) {
    adjustments.push({ priority: 'Primary', tone: 'danger', text: `Tighten Marginal Continues Against ${aggressiveSeats.map((player) => player.position).join(', ')} And Protect Strong Traps.` });
  }
  if (shortStacks.length > 0) {
    adjustments.push({ priority: 'Monitor', tone: 'info', text: `Expect Compressed Shove-Or-Fold Decisions From ${shortStacks.map((player) => player.position).join(', ')}.` });
  }
  if (tableType.type === 'Loose-Passive') {
    adjustments.push({ priority: 'Secondary', tone: 'warning', text: 'Reduce Low-Equity Bluffs And Increase Value Sizing.' });
  }
  if (tableType.type === 'Tight-Aggressive') {
    adjustments.push({ priority: 'Secondary', tone: 'accent', text: 'Apply Late-Position Pressure Without Overdefending Early Positions.' });
  }

  return adjustments.length > 0
    ? adjustments
    : [{ priority: 'Monitor', tone: 'info', text: 'Continue Seat-Specific Observation Before Expanding Ranges.' }];
}

function Metric({ label, value, tone }) {
  return (
    <div className={`sp-dynamics-metric sp-dynamics-tone--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AggressionMeter({ player }) {
  const percent = Math.min(100, (player.af / 5) * 100);
  const tone = player.af > 3 ? 'danger' : player.af > 2 ? 'warning' : player.af > 1 ? 'positive' : 'info';

  return (
    <div className="sp-dynamics-meter">
      <div className="sp-dynamics-meter__label">
        <span>{player.position}</span>
        <strong>{player.af.toFixed(1)}</strong>
      </div>
      <div
        className="sp-dynamics-meter__track"
        role="progressbar"
        aria-label={`${player.position} Authored Aggression Factor`}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={player.af}
      >
        <span className={`sp-dynamics-meter__fill sp-dynamics-tone--${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function StackDistribution({ players }) {
  const maxStack = Math.max(...players.map((player) => player.stack));

  return (
    <div className="sp-dynamics-stacks" aria-label="Authored Stack Distribution">
      {players.map((player) => {
        const percent = Math.max(10, (player.stack / maxStack) * 100);
        return (
          <div className={`sp-dynamics-stack ${player.isHero ? 'sp-dynamics-stack--hero' : ''}`} key={player.position}>
            <span>{player.stack} BB</span>
            <div className="sp-dynamics-stack__rail" aria-hidden="true">
              <i style={{ height: `${percent}%` }} />
            </div>
            <strong>{player.position}</strong>
          </div>
        );
      })}
    </div>
  );
}

export default function TableDynamicsPanel() {
  const [selectedTable, setSelectedTable] = useState(0);
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  const table = TABLE_PRESETS[selectedTable];
  const tableType = useMemo(() => classifyTable(table.players), [table]);
  const adjustments = useMemo(() => buildAdjustments(table.players, tableType), [table, tableType]);
  const averages = useMemo(() => ({
    vpip: table.players.reduce((total, player) => total + player.vpip, 0) / table.players.length,
    pfr: table.players.reduce((total, player) => total + player.pfr, 0) / table.players.length,
    af: table.players.reduce((total, player) => total + player.af, 0) / table.players.length,
    stack: table.players.reduce((total, player) => total + player.stack, 0) / table.players.length,
  }), [table]);

  const PanelWrapper = isPoppedOut ? motion.section : 'section';
  const wrapperProps = isPoppedOut ? {
    drag: true,
    dragMomentum: false,
    initial: { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    whileDrag: { cursor: 'grabbing' },
  } : {};

  return (
    <PanelWrapper
      {...wrapperProps}
      className={`sp-dynamics-panel ${isPoppedOut ? 'sp-dynamics-panel--floating' : ''}`}
      aria-labelledby="table-dynamics-title"
    >
      <header className="sp-dynamics-header">
        <div className="sp-dynamics-heading">
          <span className="sp-dynamics-kicker">Strategy Review Chamber / Authored Study</span>
          <h3 id="table-dynamics-title">Table Dynamics Lab</h3>
          <p>Compare Curated Seat Profiles And Practice Evidence-Based Adjustments.</p>
        </div>
        <div className="sp-dynamics-header__actions">
          <div className="sp-dynamics-source" role="status">
            <span>Source Status</span>
            <strong>Authored Training Scenario</strong>
            <small>No Live Player Telemetry</small>
          </div>
          <button type="button" className="sp-dynamics-dock" aria-pressed={isPoppedOut} onClick={() => setIsPoppedOut((current) => !current)}>
            {isPoppedOut ? 'Dock Panel' : 'Pop-Out Panel'}
          </button>
        </div>
      </header>

      <div className="sp-dynamics-scenario-rail" role="group" aria-label="Authored Table Scenario">
        {TABLE_PRESETS.map((preset, index) => (
          <button type="button" key={preset.id} aria-pressed={selectedTable === index} onClick={() => setSelectedTable(index)}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{preset.label}</strong>
          </button>
        ))}
      </div>

      <div className="sp-dynamics-classification">
        <div>
          <span>Table Classification</span>
          <strong className={`sp-dynamics-tone--${tableType.tone}`}>{tableType.type}</strong>
        </div>
        <p>{tableType.summary}</p>
      </div>

      <div className="sp-dynamics-metrics" aria-label="Authored Scenario Averages">
        <Metric label="Average VPIP" value={`${averages.vpip.toFixed(0)}%`} tone={averages.vpip > 30 ? 'positive' : 'warning'} />
        <Metric label="Average PFR" value={`${averages.pfr.toFixed(0)}%`} tone="info" />
        <Metric label="Average AF" value={averages.af.toFixed(1)} tone={averages.af > 2.5 ? 'danger' : 'positive'} />
        <Metric label="Average Stack" value={`${averages.stack.toFixed(0)} BB`} tone="accent" />
      </div>

      <div className="sp-dynamics-instruments">
        <section className="sp-dynamics-instrument" aria-labelledby="aggression-profile-title">
          <header><span>Instrument 01</span><h4 id="aggression-profile-title">Aggression Profile</h4></header>
          <div className="sp-dynamics-meter-grid">
            {table.players.map((player) => <AggressionMeter key={player.position} player={player} />)}
          </div>
        </section>

        <section className="sp-dynamics-instrument" aria-labelledby="stack-distribution-title">
          <header><span>Instrument 02</span><h4 id="stack-distribution-title">Stack Distribution</h4></header>
          <StackDistribution players={table.players} />
        </section>
      </div>

      <section className="sp-dynamics-seat-ledger" aria-labelledby="seat-ledger-title">
        <header><span>Scenario Evidence</span><h4 id="seat-ledger-title">Seat Profile Ledger</h4></header>
        <div className="sp-dynamics-table-scroll">
          <table>
            <thead>
              <tr><th scope="col">Seat</th><th scope="col">Position</th><th scope="col">VPIP</th><th scope="col">PFR</th><th scope="col">AF</th><th scope="col">Stack</th></tr>
            </thead>
            <tbody>
              {table.players.map((player) => (
                <tr className={player.isHero ? 'sp-dynamics-row--hero' : ''} key={player.position}>
                  <th scope="row">{player.name}</th>
                  <td>{player.position}</td>
                  <td>{player.vpip}%</td>
                  <td>{player.pfr}%</td>
                  <td>{player.af.toFixed(1)}</td>
                  <td>{player.stack} BB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sp-dynamics-adjustments" aria-labelledby="strategy-adjustments-title">
        <header><span>Decision Protocol</span><h4 id="strategy-adjustments-title">Strategy Adjustments</h4></header>
        <div className="sp-dynamics-adjustment-grid">
          {adjustments.map((adjustment, index) => (
            <article className={`sp-dynamics-adjustment sp-dynamics-adjustment--${adjustment.tone}`} key={`${adjustment.priority}-${index}`}>
              <span>{adjustment.priority}</span>
              <p>{adjustment.text}</p>
            </article>
          ))}
        </div>
      </section>
    </PanelWrapper>
  );
}
