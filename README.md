# Maestro

**Natural-language orchestrator for SAP CPI — routes requests to Gatekeeper-Goofy and FlowLens AI.**

Maestro sits in front of your two SAP CPI intelligence agents and lets you talk to both through a single conversational interface. You type in plain English; Maestro classifies your intent and dispatches to the right agent automatically.

---

## Architecture

```
You (natural language)
         │
         ▼
  ┌─────────────────────────────────────────────┐
  │              MAESTRO  (this repo)            │
  │                                             │
  │  ┌──────────────┐    ┌────────────────────┐ │
  │  │ IntentRouter │    │ ContextManager      │ │
  │  │ (Claude)     │    │ (session entities)  │ │
  │  └──────┬───────┘    └────────────────────┘ │
  │         │                                   │
  │  ┌──────▼────────────────────────────────┐  │
  │  │         Orchestration Engine           │  │
  │  │  (dispatch → agents → synthesize)      │  │
  │  └──────┬────────────────────┬───────────┘  │
  └─────────┼────────────────────┼──────────────┘
            │                    │
            ▼  stdio / MCP       ▼  HTTP (port 3001)
  ┌─────────────────┐   ┌──────────────────────┐
  │ Gatekeeper-Goofy│   │    FlowLens AI        │
  │   (MCP server)  │   │  (Express + React)    │
  │                 │   │                       │
  │ GUARDIAN checks │   │ iFlow AI analysis     │
  │ MIRROR compare  │   │ Groovy Studio         │
  │ CPI queries     │   │ Owner lookup          │
  └─────────────────┘   └──────────────────────┘
            │                    │
            └────────────────────┘
                       │
               SAP CPI tenants
               (DEV · TEST · PROD)
```

---

## Folder structure

```
maestro/
├── src/
│   ├── orchestrator/
│   │   ├── types.ts              ← Shared type definitions
│   │   ├── intentRouter.ts       ← LLM-powered intent classifier
│   │   ├── contextManager.ts     ← Rolling conversation state & entity extraction
│   │   ├── responseSynthesizer.ts← Merges multi-agent outputs into one answer
│   │   └── maestro.ts            ← Core orchestration engine
│   │
│   ├── agents/
│   │   ├── baseAgent.ts          ← Abstract base class
│   │   ├── gatekeeperAgent.ts    ← Gatekeeper-Goofy wrapper (MCP or HTTP)
│   │   └── flowlensAgent.ts      ← FlowLens AI wrapper (HTTP)
│   │
│   ├── transport/
│   │   ├── mcpClient.ts          ← JSON-RPC stdio client for MCP servers
│   │   └── httpClient.ts         ← Axios-based HTTP client
│   │
│   ├── utils/
│   │   ├── logger.ts             ← Colour console logger
│   │   └── config.ts             ← Environment config loader
│   │
│   ├── cli/
│   │   └── index.ts              ← Interactive REPL (entry point)
│   │
│   └── index.ts                  ← Public API barrel exports
│
├── dist/                         ← Compiled output (gitignored)
├── .env.example                  ← Environment variable template
├── package.json
└── tsconfig.json
```

---

## Prerequisites

1. **Gatekeeper-Goofy** — must be built (`npm run build` inside the Gatekeeper-Goofy repo)
2. **FlowLens AI** — backend must be running (`npm start` inside FlowLens) — port 3001
3. **Node.js 18+**
4. **Anthropic API key** (for intent routing and response synthesis)

---

## Setup

```bash
cd maestro
npm install

# Copy and fill in the env file
cp .env.example .env
```

Edit `.env`:

```env
ANTHROPIC_API_KEY=your_key_here
GATEKEEPER_MCP_PATH=C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/dist/mcp/CPI_MCP/index.js
FLOWLENS_HTTP_URL=http://localhost:3001
```

---

## Running

**Development (auto-reload):**
```bash
npm run dev
```

**Production (compiled JS):**
```bash
npm run build
npm start
```

---

## Example session

```
You: Spot-check DuplicateOpportunityForecastExclusion in DEV
Maestro: [routes to Gatekeeper-Goofy → spotcheck_iflow]
  ✓ Activation: STARTED
  ✓ Endpoint reachable
  ✓ Credentials healthy
  ✓ Value mappings present
  ⚠ Smoke test: skipped (403 — auth required)
  ✓ Config parity: MATCH
  ✓ Security artifacts present
  ✓ Log level: INFO (acceptable)

You: Now compare it DEV vs TEST
Maestro: [routes to Gatekeeper-Goofy → compare_iflow, context: iFlow remembered]
  [MIRROR result with 17-criteria comparison table]

You: Generate a Groovy script that maps the payload JSON to OData filter headers
Maestro: [routes to FlowLens AI → generate_groovy]
  ```groovy
  import groovy.json.JsonSlurper
  ...
  ```

You: /status
Maestro:
  ● Gatekeeper-Goofy  ONLINE
  ● FlowLens AI       ONLINE
```

---

## Agent routing rules

| Your request | Routes to | Tool/Action |
|---|---|---|
| "spot-check", "health check", "verify" | Gatekeeper-Goofy | `spotcheck_iflow` |
| "compare", "diff", "mirror", "promote" | Gatekeeper-Goofy | `compare_iflow` |
| "batch compare", "compare all" | Gatekeeper-Goofy | `batch_compare` |
| "analyse", "explain the iFlow", "what does" | FlowLens AI | `analyze_iflow` |
| "generate groovy", "write a script" | FlowLens AI | `generate_groovy` |
| "modify this script", "add error handling to" | FlowLens AI | `modify_groovy` |
| "explain this script" | FlowLens AI | `explain_groovy` |
| "simulate / dry-run this script" | FlowLens AI | `simulate_groovy` |
| "failed messages", "what failed" | Gatekeeper-Goofy | `get_failed_messages` |
| "list keystores / credentials / queues" | Gatekeeper-Goofy | `list_*` |
| "who owns", "iFlow owner" | FlowLens AI | `list_owners` |
| "help", "what can you do" | Orchestrator | built-in capability summary |

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✓ | — | Claude API key |
| `ANTHROPIC_BASE_URL` | | — | Proxy URL (SAP network) |
| `GATEKEEPER_TRANSPORT` | | `mcp` | `mcp` or `http` |
| `GATEKEEPER_MCP_PATH` | ✓ (mcp) | — | Path to `dist/mcpServer.js` |
| `GATEKEEPER_HTTP_URL` | ✓ (http) | — | Base URL of Gatekeeper HTTP server |
| `FLOWLENS_HTTP_URL` | | `http://localhost:3001` | FlowLens backend URL |
| `MAESTRO_MAX_HISTORY` | | `20` | Turns to retain in session context |
| `LOG_LEVEL` | | `info` | `debug`, `info`, `warn`, `error` |
