/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET /api/datasets/catalog
 *  Open Dataset Catalog, Schema.org DataCatalog, Zenodo & Wikipedia Citations
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Query Parameters:
 * - slug: Optional research study slug filter
 * - format: 'json' (default) | 'zenodo' | 'cff' | 'jsonld' | 'wikipedia' | 'notebook' | 'ipynb'
 */

import {
  getDatasetCatalogPayload,
  buildZenodoMetadata,
  buildCitationCff,
  buildDataCatalogJsonLd,
  WIKIPEDIA_CITATION_TARGETS,
} from '../../../src/lib/seo/datasetCatalog.mjs';

export function buildJupyterNotebookPayload() {
  return {
  "nbformat": 4,
  "nbformat_minor": 5,
  "metadata": {
    "colab": {
      "name": "poker_math_benchmarks_2026.ipynb",
      "provenance": [],
      "toc_visible": true
    },
    "kernelspec": {
      "display_name": "Python 3 (Standard Library)",
      "language": "python",
      "name": "python3"
    },
    "language_info": {
      "name": "python",
      "version": "3.14.2",
      "mimetype": "text/x-python",
      "file_extension": ".py"
    }
  },
  "cells": [
    {
      "cell_type": "markdown",
      "id": "cell-intro-md",
      "metadata": {},
      "source": [
        "# Smarter.Poker Quantitative Poker Datasets & Reproducible Benchmarks (CC-BY 4.0)\n",
        "\n",
        "This reproducible Jupyter / Google Colab notebook loads and verifies the published **Smarter.Poker Open Quantitative Poker Research Datasets (`v2026.11.12`)** and cross-checks deterministic poker math solvers against the public zero-auth Model Context Protocol (MCP) server (`v1.0.5`).\n",
        "\n",
        "## 1. Environment, Dependencies & Zero-Credential Guarantee\n",
        "- **Runtime**: `Python >= 3.10` (executed and verified in clean isolated mode `python3 -I` with **zero third-party packages required**; uses only Python standard library modules `json`, `csv`, `io`, `math`, `pathlib`, and `urllib.request`).\n",
        "- **Paid Services / Credentials**: **None.** All datasets are open-access (`CC-BY-4.0`) and all remote endpoints (`https://smarter.poker/api/mcp` and `https://smarter.poker/api/datasets/catalog`) are public, read-only, and require zero API keys, tokens, or paid subscriptions.\n",
        "- **Data Resolution**: Reads directly from the published repository files (`datasets/csv/*`, `datasets/json/*`, `bundles/*`) when cloned locally, and falls back automatically to the published GitHub raw release files when opened standalone in Google Colab.\n",
        "\n",
        "## 2. Expected Results\n",
        "1. **Cell 1 (Published Dataset Verification)**:\n",
        "   - Loads `datasets/csv/research-benchmarks-index.csv` (`15` study index rows), `datasets/csv/us-live-poker-room-rake-benchmark-2026.csv` (`6` regional stake/rake structure rows), and `datasets/csv/us-poker-room-census-by-state-2026.csv` (`12` regional market census rows).\n",
        "   - Loads the standalone study JSON files (`tournament-icm-bubble-factor-and-risk-premium-study.json`, `mystery-bounty-vs-pko-ev-and-bounty-power-factor-study.json`, `pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study.json`).\n",
        "   - Loads the `4` substantive dataset bundles (`12` regional markets + `10` tournament series; `169` starting hands + `25` canonical all-in matchups; `35` MCP tools + OpenAPI `3.1.0` spec; `30` floor rule summaries + `15` game variants + `80` glossary terms).\n",
        "2. **Cell 2 (Malmuth-Harville ICM, Chip Chop & Pot Odds / Draw Outs Reproduction)**:\n",
        "   - For stacks `[500000, 300000, 200000]` and payouts `[10000, 6000, 4000]`, exact Malmuth-Harville ICM equities are `[$7,678.57, $6,550.00, $5,771.43]` (summing to `$20,000.00`).\n",
        "   - For a `$100` pot facing a `$50` bet with `9` flush outs on the flop (`47` unseen cards), required equity is `25.00%`, Minimum Defense Frequency (MDF) is `66.67%`, exact 1-card turn equity is `19.15%` (`9/47`), and exact 2-card flop-to-river equity is `34.97%` (`1 - (38/47)*(37/46)`).\n",
        "3. **Cell 3 (Brownian Winrate Variance & Confidence Interval Verification)**:\n",
        "   - For winrate `5.0 bb/100` and standard deviation `85.0 bb/100` over `100,000` hands (`1,000` 100-hand blocks), expected profit is `+5,000.00 bb`, standard error is `2,687.94 bb`, `95%` confidence interval is `[-268.36 bb, +10,268.36 bb]`, and minimum hands for `95%` certainty of being a winning player (`N_95 = (1.96 * 85 / 5)^2 * 100`) is `111,023` hands.\n",
        "\n",
        "## 3. Methodology & Scope Limitations\n",
        "- **Combinatorial & GTO Preflop Baselines**: 25 preflop matchups use exact 52-card deck enumeration (`1,712,304` five-card boards per suit pairing, zero dead cards). 100BB 6-Max preflop ranges represent chip-EV (`cEV`) equilibrium baselines and do not incorporate live cash-game rake caps or multi-way limped pots.\n",
        "- **Independent Chip Model (ICM)**: Malmuth-Harville ICM weights finishing probabilities recursively by chip share and does not model future blind positions, table skill differentials, or card bunching.\n",
        "- **Live Cardroom Benchmarks**: Regional rake, time-collection, and table census metrics reflect verified public house rules and regulatory disclosures as of November 2026 and are subject to venue schedule changes.\n",
        "- **Floor Rule Reference**: Smarter.Poker rule summaries cite published Poker TDA (2024/2026) and Robert's Rules of Poker (v11) standards as independent educational references; they are not official rulings issued or endorsed by the Poker TDA.\n"
      ]
    },
    {
      "cell_type": "code",
      "id": "cell-code-1",
      "execution_count": 1,
      "metadata": {},
      "source": [
        "import csv\n",
        "import io\n",
        "import json\n",
        "import pathlib\n",
        "import urllib.request\n",
        "\n",
        "RAW_BASE = \"https://raw.githubusercontent.com/Smarter-Poker/smarter-poker-open-datasets/main\"\n",
        "REPO_ROOT = pathlib.Path(\".\")\n",
        "\n",
        "def load_text(rel_path: str) -> str:\n",
        "    local_path = REPO_ROOT / rel_path\n",
        "    if local_path.exists():\n",
        "        return local_path.read_text(encoding=\"utf-8\")\n",
        "    req = urllib.request.Request(\n",
        "        f\"{RAW_BASE}/{rel_path}\",\n",
        "        headers={\"User-Agent\": \"SmarterPoker-Notebook-Verifier/1.0\"}\n",
        "    )\n",
        "    with urllib.request.urlopen(req, timeout=15) as resp:\n",
        "        return resp.read().decode(\"utf-8\")\n",
        "\n",
        "def load_csv(rel_path: str):\n",
        "    return list(csv.DictReader(io.StringIO(load_text(rel_path))))\n",
        "\n",
        "def load_json(rel_path: str):\n",
        "    return json.loads(load_text(rel_path))\n",
        "\n",
        "index_rows = load_csv(\"datasets/csv/research-benchmarks-index.csv\")\n",
        "rake_rows = load_csv(\"datasets/csv/us-live-poker-room-rake-benchmark-2026.csv\")\n",
        "census_rows = load_csv(\"datasets/csv/us-poker-room-census-by-state-2026.csv\")\n",
        "\n",
        "icm_study = load_json(\"datasets/json/tournament-icm-bubble-factor-and-risk-premium-study.json\")\n",
        "bounty_study = load_json(\"datasets/json/mystery-bounty-vs-pko-ev-and-bounty-power-factor-study.json\")\n",
        "plo_study = load_json(\"datasets/json/pot-limit-omaha-plo4-plo5-plo6-equity-and-variance-study.json\")\n",
        "\n",
        "markets_bundle = load_json(\"bundles/north_american_poker_markets_and_series_2026.json\")\n",
        "gto_bundle = load_json(\"bundles/gto_preflop_169_hands_and_25_matchups_2026.json\")\n",
        "mcp_bundle = load_json(\"bundles/mcp_35_tools_and_openapi_3_1_spec_v1_0_5.json\")\n",
        "rules_bundle = load_json(\"bundles/official_tda_rrop_30_rules_15_variants_80_glossary_2026.json\")\n",
        "\n",
        "mcp_tools = mcp_bundle.get(\"mcpManifest\", {}).get(\"tools\", [])\n",
        "\n",
        "print(\"=== Verified Published Dataset Files ===\")\n",
        "print(f\"1. Research Benchmarks Index CSV: {len(index_rows)} studies\")\n",
        "print(f\"2. US Live Rake Benchmark CSV: {len(rake_rows)} regional stake/rake rows\")\n",
        "print(f\"3. US Regional Poker Market Census CSV: {len(census_rows)} regional market rows\")\n",
        "print(f\"4. ICM Bubble Factor Study JSON: {len(icm_study.get('rows', []))} stack-depth rows\")\n",
        "print(f\"5. PKO vs Mystery Bounty Study JSON: {len(bounty_study.get('rows', []))} stage rows\")\n",
        "print(f\"6. PLO4/PLO5/PLO6 Variance Study JSON: {len(plo_study.get('rows', []))} format rows\")\n",
        "print(f\"7. Markets & Series Bundle ({markets_bundle['doi']}): {markets_bundle['regionalMarketsCount']} markets, {markets_bundle['seriesGuidesCount']} series\")\n",
        "print(f\"8. GTO 169 Hands & 25 Matchups Bundle ({gto_bundle['doi']}): {gto_bundle['startingHandsCount']} hands, {gto_bundle['handMatchupsCount']} matchups\")\n",
        "print(f\"9. MCP v{mcp_bundle['version']} & OpenAPI 3.1 Bundle ({mcp_bundle['doi']}): {len(mcp_tools)} tools\")\n",
        "print(f\"10. Floor Rules, Variants & Glossary Bundle ({rules_bundle['doi']}): {rules_bundle['pokerRulesCount']} rules, {rules_bundle['pokerVariantsCount']} variants, {rules_bundle['glossaryTermsCount']} terms\")\n",
        "print(\"\\nSample Rake Benchmark Row (Las Vegas Strip):\", rake_rows[0])\n"
      ],
      "outputs": [
        {
          "name": "stdout",
          "output_type": "stream",
          "text": [
            "=== Verified Published Dataset Files ===\n",
            "1. Research Benchmarks Index CSV: 15 studies\n",
            "2. US Live Rake Benchmark CSV: 6 regional stake/rake rows\n",
            "3. US Regional Poker Market Census CSV: 12 regional market rows\n",
            "4. ICM Bubble Factor Study JSON: 6 stack-depth rows\n",
            "5. PKO vs Mystery Bounty Study JSON: 6 stage rows\n",
            "6. PLO4/PLO5/PLO6 Variance Study JSON: 4 format rows\n",
            "7. Markets & Series Bundle (10.5281/zenodo.24115447): 12 markets, 10 series\n",
            "8. GTO 169 Hands & 25 Matchups Bundle (10.5281/zenodo.24115452): 169 hands, 25 matchups\n",
            "9. MCP v1.0.5 & OpenAPI 3.1 Bundle (10.5281/zenodo.24115453): 35 tools\n",
            "10. Floor Rules, Variants & Glossary Bundle (10.5281/zenodo.24115454): 30 rules, 15 variants, 80 terms\n",
            "\n",
            "Sample Rake Benchmark Row (Las Vegas Strip): {'region_or_model': 'Las Vegas Strip & Regional NV', 'primary_stake': '$1/$3 NLH', 'rake_mechanism': '10% Pot Rake', 'typical_cap_or_down_fee': '$5 To $6 Cap', 'promo_drop': '$1 To $2 Jackpot', 'effective_bb100_cost': '8.5 To 11.0 BB/100'}\n"
          ]
        }
      ]
    },
    {
      "cell_type": "code",
      "id": "cell-code-2",
      "execution_count": 2,
      "metadata": {},
      "source": [
        "# Deterministic Malmuth-Harville ICM & Combinatorial Pot Odds / Hypergeometric Outs Verification\n",
        "def compute_malmuth_harville_icm(stacks, payouts):\n",
        "    total_chips = sum(stacks)\n",
        "    n = len(stacks)\n",
        "    ev = [0.0] * n\n",
        "\n",
        "    def recurse(remaining_idx, remaining_chips, prize_idx, prob):\n",
        "        if prize_idx >= len(payouts) or not remaining_idx or prob < 1e-12:\n",
        "            return\n",
        "        for i, player in enumerate(remaining_idx):\n",
        "            s = stacks[player]\n",
        "            if s <= 0:\n",
        "                continue\n",
        "            p_win = s / remaining_chips\n",
        "            ev[player] += prob * p_win * payouts[prize_idx]\n",
        "            if prize_idx + 1 < len(payouts):\n",
        "                next_idx = remaining_idx[:i] + remaining_idx[i+1:]\n",
        "                recurse(next_idx, remaining_chips - s, prize_idx + 1, prob * p_win)\n",
        "\n",
        "    recurse(list(range(n)), float(total_chips), 0, 1.0)\n",
        "    return [round(v, 2) for v in ev]\n",
        "\n",
        "stacks = [500000, 300000, 200000]\n",
        "payouts = [10000, 6000, 4000]\n",
        "icm_ev = compute_malmuth_harville_icm(stacks, payouts)\n",
        "assert round(sum(icm_ev), 2) == 20000.00, \"ICM payouts must conserve total prize pool\"\n",
        "\n",
        "pot, bet, outs = 100.0, 50.0, 9\n",
        "req_equity_pct = round((bet / (pot + 2 * bet)) * 100, 2)\n",
        "mdf_pct = round((pot / (pot + bet)) * 100, 2)\n",
        "turn_hit_pct = round((outs / 47) * 100, 2)\n",
        "flop_to_river_pct = round((1.0 - ((47 - outs) / 47) * ((46 - outs) / 46)) * 100, 2)\n",
        "\n",
        "print(\"=== Malmuth-Harville ICM Verification ===\")\n",
        "for idx, (s, ev_val) in enumerate(zip(stacks, icm_ev), start=1):\n",
        "    print(f\"Player {idx}: {s:,} chips ({s/sum(stacks)*100:.1f}%) -> ICM Equity: ${ev_val:,.2f}\")\n",
        "print(f\"Total Prize Pool Conserved: ${sum(icm_ev):,.2f}\")\n",
        "\n",
        "print(\"\\n=== Pot Odds, MDF & Exact Hypergeometric Draw Outs (9 Outs on Flop) ===\")\n",
        "print(f\"Pot: ${pot:.0f} | Facing Bet: ${bet:.0f} -> Required Equity: {req_equity_pct:.2f}% | MDF: {mdf_pct:.2f}%\")\n",
        "print(f\"Turn Hit (1 card, 47 unseen): {turn_hit_pct:.2f}% | Flop-to-River Hit (2 cards): {flop_to_river_pct:.2f}%\")\n"
      ],
      "outputs": [
        {
          "name": "stdout",
          "output_type": "stream",
          "text": [
            "=== Malmuth-Harville ICM Verification ===\n",
            "Player 1: 500,000 chips (50.0%) -> ICM Equity: $7,678.57\n",
            "Player 2: 300,000 chips (30.0%) -> ICM Equity: $6,550.00\n",
            "Player 3: 200,000 chips (20.0%) -> ICM Equity: $5,771.43\n",
            "Total Prize Pool Conserved: $20,000.00\n",
            "\n",
            "=== Pot Odds, MDF & Exact Hypergeometric Draw Outs (9 Outs on Flop) ===\n",
            "Pot: $100 | Facing Bet: $50 -> Required Equity: 25.00% | MDF: 66.67%\n",
            "Turn Hit (1 card, 47 unseen): 19.15% | Flop-to-River Hit (2 cards): 34.97%\n"
          ]
        }
      ]
    },
    {
      "cell_type": "code",
      "id": "cell-code-3",
      "execution_count": 3,
      "metadata": {},
      "source": [
        "import math\n",
        "\n",
        "# Cash-Game Winrate Variance & 95% Confidence Interval Simulation\n",
        "winrate_bb100 = 5.0\n",
        "std_dev_bb100 = 85.0\n",
        "hands_played = 100000\n",
        "blocks_100 = hands_played / 100.0\n",
        "\n",
        "expected_profit_bb = round(winrate_bb100 * blocks_100, 2)\n",
        "std_error_bb = round(std_dev_bb100 * math.sqrt(blocks_100), 2)\n",
        "ci95_low_bb = round(expected_profit_bb - 1.96 * std_error_bb, 2)\n",
        "ci95_high_bb = round(expected_profit_bb + 1.96 * std_error_bb, 2)\n",
        "min_hands_95_confidence = math.ceil(((1.96 * std_dev_bb100) / winrate_bb100) ** 2 * 100)\n",
        "prob_loss_z = -expected_profit_bb / std_error_bb\n",
        "prob_downswing = 0.5 * (1.0 + math.erf(prob_loss_z / math.sqrt(2.0))) * 100\n",
        "\n",
        "print(\"=== Cash-Game Variance & Sample Size Benchmark ===\")\n",
        "print(f\"True Winrate: {winrate_bb100:.1f} bb/100 | Std Dev: {std_dev_bb100:.1f} bb/100 | Sample: {hands_played:,} hands\")\n",
        "print(f\"Expected Profit: +{expected_profit_bb:,.2f} bb | Standard Error: ±{std_error_bb:,.2f} bb\")\n",
        "print(f\"95% Confidence Interval: [{ci95_low_bb:,.2f} bb, +{ci95_high_bb:,.2f} bb]\")\n",
        "print(f\"Probability of Net Loss After {hands_played:,} Hands: {prob_downswing:.2f}%\")\n",
        "print(f\"Minimum Hands Required for 95% Winrate Proof: {min_hands_95_confidence:,} hands\")\n"
      ],
      "outputs": [
        {
          "name": "stdout",
          "output_type": "stream",
          "text": [
            "=== Cash-Game Variance & Sample Size Benchmark ===\n",
            "True Winrate: 5.0 bb/100 | Std Dev: 85.0 bb/100 | Sample: 100,000 hands\n",
            "Expected Profit: +5,000.00 bb | Standard Error: ±2,687.94 bb\n",
            "95% Confidence Interval: [-268.36 bb, +10,268.36 bb]\n",
            "Probability of Net Loss After 100,000 Hands: 3.14%\n",
            "Minimum Hands Required for 95% Winrate Proof: 111,023 hands\n"
          ]
        }
      ]
    }
  ]
};
}

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { slug = '', format = 'json' } = req.query || {};
  const normalizedFormat = String(format || 'json').toLowerCase();

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (normalizedFormat === 'notebook' || normalizedFormat === 'ipynb') {
    res.setHeader('Content-Type', 'application/x-ipynb+json; charset=utf-8');
    return res.status(200).send(JSON.stringify(buildJupyterNotebookPayload(), null, 2));
  }

  if (normalizedFormat === 'cff') {
    res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
    return res.status(200).send(buildCitationCff());
  }

  if (normalizedFormat === 'zenodo') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json(buildZenodoMetadata());
  }

  if (normalizedFormat === 'jsonld') {
    res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
    return res.status(200).json(buildDataCatalogJsonLd());
  }

  if (normalizedFormat === 'wikipedia') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).json({
      count: WIKIPEDIA_CITATION_TARGETS.length,
      wikipedia_citation_targets: WIKIPEDIA_CITATION_TARGETS,
    });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json(getDatasetCatalogPayload({ slug }));
}
