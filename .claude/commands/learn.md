---
description: >
  Capture a lesson learned into the team knowledge base so all future Claude sessions
  and all team members benefit from it automatically.
  Repo owner commits directly to main.
  All other team members create a branch and raise a PR for review.
  Usage: /learn <lesson in plain English>
  Example: /learn never spawn @flowlens-ai as background agent
---

Capture the following lesson into the Maestro team knowledge base.

**Lesson to capture:** $ARGUMENTS

## What to do

1. Read `.claude/memory/team-learnings.md`

2. Determine the right category:
   - **Agent Invocation** — how to call agents, which agent owns what
   - **Credentials & Configuration** — env files, secrets, placeholders
   - **Git Behaviour** — push, commit, rewrite rules
   - **MCP Setup** — MCP server config, connectivity
   - **Governance Report** — /cpi-governance specific
   - **Agent Empowerment** — empowerment tiers, proactive guidance rules
   - **Investigation & RCA** — failure analysis patterns, RCA grids
   - **Other** — create a new category if none fit

3. Add the lesson as a clear, actionable bullet point. Example:
   - **Never do X** — because Y.
   - **Always do Z** — reason.

4. Update the `Last updated` line with today's date.

5. Also update the relevant agent `.md` in `.claude/agents/` if the lesson changes how an agent should behave — edit the agent's output section or behaviour rules directly.

6. **Detect the current git user and follow the correct path:**

   ```bash
   git config user.email
   ```

   ### If git user is the repo owner — commit directly to main:
   ```bash
   git checkout main
   git pull --ff-only
   git add .claude/memory/team-learnings.md
   # also stage any agent .md files that were updated
   git commit -m "learn: <one-line summary of the lesson>"
   GH_HOST=github.<YOUR-DOMAIN> git push origin main
   ```
   Confirm: "✅ Lesson committed directly to main. Your whole team gets it on next `git pull`."

   ### If git user is anyone else — create a branch and raise a PR:
   ```bash
   BRANCH="learn/$(date '+%Y%m%d-%H%M')"
   git checkout -b "$BRANCH"
   git add .claude/memory/team-learnings.md
   # also stage any agent .md files that were updated
   git commit -m "learn: <one-line summary of the lesson>"
   GH_HOST=github.<YOUR-DOMAIN> git push origin "$BRANCH"
   GH_HOST=github.<YOUR-DOMAIN> gh pr create \
     --title "learn: <one-line summary>" \
     --body "## Lesson\n\n$ARGUMENTS\n\n## Why\nCaptured from real usage to help the whole team." \
     --base main
   ```
   Confirm: "✅ Lesson captured and PR raised. Once approved by the repo owner, your whole team gets it on next `git pull`."

## Rules for writing lessons

- Write as a rule Claude should follow, not as a description of what happened
- Be specific — "never spawn @flowlens-ai as background agent" not "agent problems"
- One lesson per bullet point
- Check for existing similar lessons — update instead of duplicating
- Do not duplicate existing lessons
