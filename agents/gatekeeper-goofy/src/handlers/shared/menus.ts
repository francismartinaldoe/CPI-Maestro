// handlers/shared/menus.ts — All static menu and prompt strings

export const STARTUP_MENU = `## 🛡️ SAP CPI Deployment Intelligence Agent

Select a mode:
**1. 🔵 GUARDIAN MODE** — Spot-check a single environment
**2. 🟣 MIRROR MODE**   — Compare two environments side by side

Reply with **1** or **2**.`;

export const END_MENU = `
---
## What would you like to do next?

**1.** 🔵 Run GUARDIAN MODE again (same or different environment)
**2.** 🟣 Run MIRROR MODE again (same or different environments)
**3.** 🔄 Re-run same scope with different credentials
**4.** 💾 Save current run as baseline for future GUARDIAN parity checks
**5.** ❌ Exit

Reply with a number.`;

export const GUARDIAN_ENV_PROMPT = `## 🔵 GUARDIAN MODE — Step 1 of 4: Environment

Which environment do you want to check?

**1. DEV**
**2. TEST**
**3. PROD**

Reply with 1, 2, or 3.`;

export const MIRROR_SOURCE_ENV_PROMPT = `## 🟣 MIRROR MODE — Step 1 of 6: Source Environment

Select the **source** environment (what you are promoting FROM):

**1. DEV**
**2. TEST**
**3. PROD**`;

export const READONLY_CREDS_MSG =
  '❌ **Gatekeeper-Goofy is a read-only agent.** Credentials cannot be set through the agent. ' +
  'Please update `.env` directly with your tenant credentials and restart the server.';
