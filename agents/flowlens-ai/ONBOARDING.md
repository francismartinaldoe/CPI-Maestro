# FlowLens AI — Onboarding Guide

Welcome to FlowLens AI. This guide gets you up and running in under 10 minutes.

---

## Prerequisites

Before you start, make sure you have:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | 18 or higher | https://nodejs.org |
| **Git** | Any recent version | https://git-scm.com |

To check if you already have them:
```bash
node --version
git --version
```

---

## Step 1 — Clone the repository

```bash
git clone <your-repo-url> FlowLens
cd FlowLens
```

---

## Step 2 — Install dependencies

Run this once. It installs everything for both the backend and frontend:

```bash
npm run setup
```

You should see npm installing packages for both `backend/` and `frontend/`. This takes about a minute.

---

## Step 3 — Configure credentials

FlowLens uses **two separate places** for credentials — make sure you use the right one for each:

---

### A) Anthropic API key → `backend/.env` (one-time file setup)

Copy the example file and add your Anthropic API key:

```bash
# Windows
copy backend\.env.example backend\.env

# Mac / Linux
cp backend/.env.example backend/.env
```

Open `backend/.env` and set your Anthropic key:

```env
ANTHROPIC_API_KEY=sk-ant-...your-key-here...
```

> This is the **only** thing that belongs in `.env`. Do **not** put CPI credentials here.

---

### B) CPI credentials → Settings panel inside the app (per user)

CPI credentials are entered **inside the running app**, not in any file. Each team member enters their own credentials once and the app saves them locally in the browser.

1. Start the app (`npm start`) and open **http://localhost:5173**
2. Click the **⚙ gear icon** in the top-right corner
3. Fill in your SAP CPI details:

| Field | Where to find it |
|-------|-----------------|
| **Tenant URL** | Your CPI tenant base URL |
| **Token URL** | SAP BTP Cockpit → Instances and Subscriptions → your CPI service key → `uaa.url` + `/oauth/token` |
| **Client ID** | Same service key → `clientid` |
| **Client Secret** | Same service key → `clientsecret` |

4. Click **Save** — credentials are stored in your browser and sent automatically on every request

> **Why not `.env`?** CPI credentials are personal — each team member has their own service key. The browser keeps them local to your machine so nothing sensitive is ever shared across the team.

---

## Step 4 — Start the app

```bash
npm start
```

This opens **two terminal windows** — one for the backend (port 3001), one for the frontend (port 5173).

Wait until both say they are ready, then open your browser:

```
http://localhost:5173
```

---

## Step 5 — Verify the connection

1. Click the **⚙ gear icon** in the top-right corner
2. You should see your CPI tenant URL already filled in from `.env`
3. If the connection indicator shows **green** — you are ready to use FlowLens

> **Credentials not loading from `.env`?**
> You can also enter them directly in the Settings panel in the app. They are saved in your browser locally.

---

## Staying up to date

When the team releases updates, run this single command from the `FlowLens` folder:

```bash
npm run update
```

This pulls the latest code and reinstalls any new dependencies. Your `.env` credentials are never touched.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `node: command not found` | Install Node.js 18+ from https://nodejs.org |
| Port 3001 already in use | Change `PORT=3002` in `backend/.env` |
| Port 5173 already in use | Another Vite app is running — stop it first |
| Green dot but iFlows not loading | Check your CPI_TENANT_URL — make sure it has no trailing slash |
| `npm run setup` fails | Delete `backend/node_modules` and `frontend/node_modules` and run again |

---

## What each tab does

| Tab | What it does |
|-----|-------------|
| **iFlow Explorer** | Enter any iFlow ID to get a full AI analysis — what it does, how it's built, scripts, and flow diagram |
| **Groovy Studio** | Generate, modify, explain, and simulate SAP CPI Groovy scripts |
