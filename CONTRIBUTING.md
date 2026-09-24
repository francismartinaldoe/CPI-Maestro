# Contributing to CPI Maestro

Thank you for helping Maestro grow. This guide explains how to contribute improvements so the whole team benefits.

---

## What you can contribute

| Contribution | How | Who reviews |
|-------------|-----|-------------|
| Lessons learned (`/learn`) | Automatic PR via `/learn` command | Repo owner |
| New slash commands | Branch + PR | Repo owner |
| Agent improvements | Branch + PR | Repo owner |
| Bug fixes | Branch + PR | Repo owner |
| Documentation | Branch + PR | Repo owner |
| Core config (hooks, CLAUDE.md) | PR only — restricted | Repo owner |

---

## Quickest way — `/learn` command

Found something Claude does wrong? Correct it once with `/learn`:

```
/learn <your lesson in plain English>
```

This automatically:
1. Adds the lesson to `.claude/memory/team-learnings.md`
2. Creates a branch `learn/<timestamp>`
3. Raises a PR for review
4. Once merged → all team members benefit on next `git pull`

Examples:
```
/learn always show iFlow package name in catalog results
/learn when comparing environments default to DEV vs TEST not DEV vs PROD
/learn governance report should show stream ART owner not CPI ART owner
```

---

## Standard contribution flow

**1. Create a branch**
```bash
git checkout -b feature/my-improvement
```

**2. Make your changes**

See [File Protection Tiers](#file-protection-tiers) to understand what you can change freely vs what needs careful review.

**3. Commit**
```bash
git add <files>
git commit -m "feat: <what you changed and why>"
```

**4. Push and raise a PR**
```bash
git push origin feature/my-improvement
```
Then open a PR on GitHub against `main`.

**5. Tag the repo owner**

Tag the repo owner in the PR for review. Small changes (docs, learnings, new commands) are merged quickly. Agent/hook changes take longer.

---

## File Protection Tiers

### 🟢 Free to contribute — low risk
Anyone can raise a PR for these:

```
.claude/memory/team-learnings.md   ← lessons learned
.claude/commands/                  ← slash commands (new or improved)
ONBOARDING.md                      ← onboarding guide
CONTRIBUTING.md                    ← this file
docs/                              ← documentation
```

### 🟡 Contribute with care — moderate impact
Changes here affect all agents — describe what and why clearly in the PR:

```
.claude/agents/                    ← agent definitions
scripts/                           ← utility scripts
```

### 🔴 Restricted — repo owner only
These control security, hooks, and core behaviour. Changes require explicit approval from the repo owner:

```
CLAUDE.md                          ← core rules loaded every session
.claude/hooks/                     ← git protection and session hooks
.claude/settings.json              ← MCP server config
mcp/                               ← MCP server submodule
.githooks/                         ← git lifecycle hooks
```

---

## Commit message conventions

| Prefix | When to use |
|--------|------------|
| `feat:` | New feature or agent capability |
| `fix:` | Bug fix |
| `learn:` | New lesson in team-learnings.md |
| `docs:` | Documentation only |
| `chore:` | Maintenance, cleanup |
| `refactor:` | Code/config restructure without behaviour change |

---

## Questions?

- Raise a GitHub Issue in this repo
- Use `/_tech-request` in Claude Code to submit a formal request
- Contact the repo owner
