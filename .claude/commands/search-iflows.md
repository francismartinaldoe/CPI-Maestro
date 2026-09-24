---
description: Search deployed SAP CPI iFlows and packages by name or keyword. Usage: /search-iflows <query> [status=STARTED|STOPPED|ERROR]
---

Parse `$ARGUMENTS`:
- First token = search query (required, partial name or keyword)
- `status=<value>` = filter by runtime status (optional)

Use `@archflow-repository` agent with `mcp__sap-cpi__get_runtime_artifacts` to search by partial name match.
If multiple matches: list all, do not ask user to narrow down unless > 20 results.

Example: `/search-iflows CPQ`
Example: `/search-iflows subscription contract status=STARTED`

Output:
### Search Results: "<query>"
| Id | Name | Package | Status | Version | Deployed By | Deployed On |
|----|------|---------|--------|---------|-------------|-------------|

Count: `<n> iFlow(s) found`

If 0 results:
```
No iFlows found matching "<query>"
Try: broader search term, or check design-time with /search-iflows <query> design
```