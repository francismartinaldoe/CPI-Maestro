# FlowLens AI

**AI-powered SAP CPI iFlow Explorer and Groovy Studio.**

FlowLens connects directly to your SAP Integration Suite tenant and lets you explore, understand, and write integration flows — without leaving your browser.

---

## What it does

| Tab | Capability |
|-----|-----------|
| **iFlow Explorer** | Enter any iFlow ID → get a full AI analysis: what it does, how it's built, flow diagram, scripts, adapters, and configuration |
| **Groovy Studio** | Generate, modify, explain, and simulate SAP CPI Groovy scripts with built-in standards enforcement |

---

## Quick start

```bash
git clone <your-repo-url> FlowLens
cd FlowLens
npm run setup
cp backend/.env.example backend/.env   # then fill in your CPI credentials
npm start
```

Open **http://localhost:5173** in your browser.

> New team member? See [ONBOARDING.md](ONBOARDING.md) for a full step-by-step guide.

---

## Getting updates

When a new version is released, run this from the `FlowLens` folder:

```bash
npm run update
```

Or on Windows, double-click **`update.bat`**.

This pulls the latest code and installs any new dependencies. Your `.env` credentials are never changed.

---

## Prerequisites

- **Node.js 18+** — https://nodejs.org
- **Git** — https://git-scm.com
- Access to an **SAP Integration Suite / CPI tenant** (OAuth2 or Basic Auth)

---

## Project structure

```
FlowLens/
├── backend/                  Express API server (port 3001)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── chat.ts       AI-powered iFlow analysis engine
│   │   │   ├── iflow.ts      iFlow zip download and file extraction
│   │   │   ├── groovy.ts     Groovy Studio endpoint
│   │   │   ├── messages.ts   Failed message log queries
│   │   │   ├── runtime.ts    Runtime artifact status
│   │   │   └── owners.ts     iFlow ownership lookup
│   │   ├── groovy/
│   │   │   ├── engine.ts     Rule-based Groovy script generator
│   │   │   └── templates.ts  Built-in script templates
│   │   ├── auth.ts           OAuth2 / Basic Auth handler
│   │   └── client.ts         SAP CPI axios client factory
│   └── .env.example          Credential template — copy to .env
│
├── frontend/                 React + Vite app (port 5173)
│   └── src/
│       ├── pages/
│       │   ├── ChatPage.tsx  iFlow Explorer tab
│       │   └── GroovyPage.tsx Groovy Studio tab
│       └── components/       UI components
│
├── ONBOARDING.md             Step-by-step setup guide for new team members
├── CHANGELOG.md              Release notes
├── update.bat                One-click update for Windows
├── update.sh                 One-command update for Mac/Linux
└── package.json              Root scripts: setup, start, update
```

---

## Configuration

All configuration lives in `backend/.env`. Copy `backend/.env.example` to get started.

| Variable | Description |
|----------|-------------|
| `CPI_TENANT_URL` | Your CPI tenant base URL |
| `CPI_TOKEN_URL` | OAuth2 token endpoint |
| `CPI_CLIENT_ID` | OAuth2 client ID |
| `CPI_CLIENT_SECRET` | OAuth2 client secret |
| `CPI_USERNAME` | Basic auth username (alternative to OAuth) |
| `CPI_PASSWORD` | Basic auth password (alternative to OAuth) |
| `ANTHROPIC_API_KEY` | Claude API key — enables AI analysis and Groovy generation |
| `ANTHROPIC_BASE_URL` | Optional — proxy URL if your network routes Claude API calls |
| `OWNERS_FILE_PATH` | Path to your iFlow owners Excel file (optional) |

> Credentials can also be entered directly in the app's Settings panel (⚙) and are saved locally in your browser.

---

## npm scripts

| Command | What it does |
|---------|-------------|
| `npm run setup` | Install all dependencies (run once after cloning) |
| `npm start` | Start both backend and frontend dev servers |
| `npm run update` | Pull latest code + reinstall dependencies |
| `npm run start:backend` | Start backend only |
| `npm run start:frontend` | Start frontend only |

---

## Security notes

- `backend/.env` is in `.gitignore` — it is never committed
- Each team member uses their own credentials — nothing shared on a server
- All SAP API calls are made from your local machine directly to your tenant
- The app runs entirely on `localhost` — no data leaves your machine
