---
description: Analyze an uploaded design document and generate full SAP CPI architecture. Usage: /analyze-design-doc <file-path-or-paste-content>
---

Parse `$ARGUMENTS` as either:
- A file path to a design document (.pptx, .docx, .pdf, .txt, .md)
- Pasted document content directly

Use the `@archflow-architecture` agent to produce the full 6-section architecture response:
1. Architecture Summary
2. Architecture Diagram (Mermaid)
3. CPI iFlow Design (sender, receiver, steps, exception subprocess)
4. CPI iFlow Skeleton (JSON)
5. Optional Scripts
6. Feedback — What Can Be Improved

SAP brand colours for diagrams: source `#0F2D4A`, CPI `#1A73C7`, target `#0A4D28`.