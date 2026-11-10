/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET /api/datasets/catalog
 *  Open Dataset Catalog, Schema.org DataCatalog, Zenodo & Wikipedia Citations
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Query Parameters:
 * - slug: Optional research study slug filter
 * - format: 'json' (default) | 'zenodo' | 'cff' | 'jsonld' | 'wikipedia'
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
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      colab: {
        name: 'Smarter_Poker_Quantitative_Poker_Research_And_MCP_Solvers.ipynb',
        provenance: [],
        toc_visible: true,
      },
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: {
        name: 'python',
        version: '3.11.0',
        mimetype: 'text/x-python',
        file_extension: '.py',
      },
    },
    cells: [
      {
        cell_type: 'markdown',
        metadata: {},
        source: [
          '# Smarter.Poker Quantitative Poker Datasets & Zero-Auth MCP Solvers (CC-BY 4.0)\n',
          '\n',
          'This interactive Jupyter / Google Colab notebook connects directly to the public **Smarter.Poker Open Data Catalog** and **35-Tool Model Context Protocol (MCP) Server**.\n',
          '\n',
          '- **Canonical Research Hub**: https://smarter.poker/research\n',
          '- **Interactive Calculators (24 Tools)**: https://smarter.poker/tools\n',
          '- **Open Dataset Catalog**: https://smarter.poker/api/datasets/catalog\n',
          '- **Zero-Auth MCP Endpoint**: https://smarter.poker/api/mcp\n',
        ],
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          'import json\n',
          'import urllib.request\n',
          'import pandas as pd\n',
          '\n',
          'CATALOG_URL = "https://smarter.poker/api/datasets/catalog"\n',
          'req = urllib.request.Request(CATALOG_URL, headers={"User-Agent": "SmarterPoker-Research-Notebook/1.0"})\n',
          'with urllib.request.urlopen(req) as resp:\n',
          '    catalog = json.loads(resp.read().decode("utf-8"))\n',
          '\n',
          'datasets = catalog.get("schema_org_data_catalog", {}).get("dataset", [])\n',
          'df_studies = pd.DataFrame([{\n',
          '    "name": d.get("name"),\n',
          '    "url": d.get("url"),\n',
          '    "dateModified": d.get("dateModified"),\n',
          '} for d in datasets])\n',
          'print(f"Loaded {len(df_studies)} Smarter.Poker Empirical Studies:")\n',
          'df_studies.head(15)\n',
        ],
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '# Call Smarter.Poker Zero-Auth MCP JSON-RPC 2.0 Server (ICM, Chop, Variance & Pot Odds)\n',
          'MCP_URL = "https://smarter.poker/api/mcp"\n',
          '\n',
          'def call_smarter_poker_mcp(tool_name, arguments):\n',
          '    payload = json.dumps({\n',
          '        "jsonrpc": "2.0",\n',
          '        "id": 1,\n',
          '        "method": "tools/call",\n',
          '        "params": {"name": tool_name, "arguments": arguments}\n',
          '    }).encode("utf-8")\n',
          '    request = urllib.request.Request(\n',
          '        MCP_URL,\n',
          '        data=payload,\n',
          '        headers={"Content-Type": "application/json", "User-Agent": "SmarterPoker-Colab/1.0"},\n',
          '        method="POST"\n',
          '    )\n',
          '    with urllib.request.urlopen(request) as response:\n',
          '        rpc_data = json.loads(response.read().decode("utf-8"))\n',
          '        text_body = rpc_data["result"]["content"][0]["text"]\n',
          '        return json.loads(text_body)\n',
          '\n',
          'chop_result = call_smarter_poker_mcp("calculate_tournament_chop", {\n',
          '    "stacks": [500000, 300000, 200000],\n',
          '    "payouts": [10000, 6000, 4000],\n',
          '    "saveAmount": 1000\n',
          '})\n',
          'pd.DataFrame(chop_result["players"])\n',
        ],
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '# Simulate Poker Variance & 95% Confidence Intervals\n',
          'variance_result = call_smarter_poker_mcp("simulate_poker_variance", {\n',
          '    "winrateBb100": 5,\n',
          '    "stdDevBb100": 85,\n',
          '    "handsPlayed": 100000\n',
          '})\n',
          'print(json.dumps(variance_result, indent=2))\n',
        ],
      },
    ],
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
