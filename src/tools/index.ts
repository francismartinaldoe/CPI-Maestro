// src/tools/index.ts — Barrel re-export for all agent tool definitions
//
// Structure:
//   tools/
//     cpi/       — SAP CPI tool definitions per category
//     jira/      — JIRA tool definitions (shared across agents)
//     flowlens/  — FlowLens AI tool definitions
//
// Add new integration categories (ServiceNow, S/4HANA, etc.) as new subfolders here.

export { GUARDIAN_TOOLS }   from './cpi/guardianTools.js';
export { MONITORING_TOOLS } from './cpi/monitoringTools.js';
export { SECURITY_TOOLS }   from './cpi/securityTools.js';
export { CATALOG_TOOLS }    from './cpi/catalogTools.js';
export { DEPLOY_TOOLS }     from './cpi/deployTools.js';
export { PARTNER_TOOLS }    from './cpi/partnerTools.js';
export { HUB_TOOLS }        from './cpi/hubTools.js';
export { JIRA_TOOLS }       from './jira/jiraTools.js';
export { FLOWLENS_TOOLS }   from './flowlens/flowlensTools.js';
