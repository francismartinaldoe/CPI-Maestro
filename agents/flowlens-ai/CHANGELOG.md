# Changelog

All notable changes to FlowLens AI are recorded here.

**What gets logged:** new features, behaviour changes, dependency updates, breaking changes.
**What doesn't:** routine bug fixes, cosmetic tweaks, refactors with no user-facing impact.

Category icons:
- 🆕 New feature
- 🔧 Improvement to existing feature
- 🐛 Bug fix
- 💥 Breaking change (action required on update)
- 📚 Documentation

---

## 2026-06-09

🆕 **iFlow Explorer** — New dedicated tab that takes an iFlow ID and returns a full AI-powered analysis: business summary, objective statement, step-by-step breakdown, ASCII flow diagram, connection details, scripts, and configuration. Replaces the old conversational CPI Monitor chat interface.

🆕 **SAP Hub tools merged into CPI server** — Hub search tools (`hub_search_packages`, `hub_search_iflows`, `hub_get_iflow` etc.) are now part of the main MCP server. The standalone sap-hub server has been removed.

🆕 **Groovy Studio merged into CPI server** — Groovy generate/modify/explain/simulate tools are now MCP tools inside the main server. The standalone Groovy Studio HTTP server (port 3002) has been removed.

🔧 **iFlow analysis — Objective card** — Response now includes a dedicated green "🎯 Objective" card showing a single verb-led mission statement for the iFlow, separate from the business summary.

🔧 **iFlow analysis — Business summary** — Summary field now returns 2-4 meaningful sentences instead of a one-liner, shown in a blue "What This Integration Does" card at the top of every response.

🆕 **6 new MCP tools added** — `list_message_store_entries`, `get_message_store_entry`, `get_api_analytics`, `list_certificate_resources`, `list_fault_message_types`, `list_service_interfaces`.

🐛 **iFlow zip download fix** — Fixed SAP 501 error on the `/$value` endpoint caused by the shared axios client sending `Accept: application/json` on a binary endpoint.

🐛 **Credential forwarding fix** — iFlow Explorer now uses the same `credHeaders()` helper as the rest of the app, fixing OAuth vs Basic Auth credential routing.
