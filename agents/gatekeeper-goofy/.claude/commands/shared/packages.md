---
description: List all integration packages or iFlows in a package. Usage: /packages OR /packages <package-id>
---

If $ARGUMENTS is empty:
  Call `list_packages` and show:
  ```
  ## 📦 Integration Packages (<N> total)

  | # | Package ID | Package Name | Version |
  |---|-----------|-------------|---------|
  ```
  Total count at the bottom.
  Tip: `Run /packages <package-id> to list iFlows inside any package.`

If $ARGUMENTS contains a package ID or name:
  Call `list_artifacts` with the packageId from $ARGUMENTS and show:
  ```
  ## 📋 Artifacts in `<packageId>` (<N> total)

  | # | Artifact ID | Name | Type | Version |
  |---|------------|------|------|---------|
  ```
  Highlight iFlows (Type=IntegrationFlow) with 🔵 prefix.
  Total count at the bottom.
  Tip: `Run /spotcheck <iflow-name> to health-check any iFlow. Run /compare <iflow-name> to compare across environments.`

Examples:
- `/packages` → list all packages
- `/packages YOUR_PACKAGE_ID` → list iFlows in C4Cv2 custom flows package
- `/packages YOUR_PACKAGE_ID_2` → list iFlows in CPQ package
- `/packages CNSDevelopment` → list iFlows in CNS dev package

---

## MCP Tools used
- `list_packages` — when no argument given
- `list_artifacts` — when package ID given
