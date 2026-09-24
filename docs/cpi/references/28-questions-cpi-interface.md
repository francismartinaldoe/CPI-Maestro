# 28 Questions to Ask Before You Design an SAP CPI Interface

Use this checklist before starting any integration design. The questions are grouped
by severity — Critical questions block development if unanswered, Important questions
cause rework if wrong, Quality questions cause review comments if missing.

---

## CRITICAL — Build Blockers (answer all 9 before development starts)

| Q# | Question | Why it matters | Who to ask |
|----|----------|---------------|------------|
| Q1 | **Source ↔ Target topology** — 1-to-1 or multiple systems? | Determines iFlow fan-out pattern | Architect / Story author |
| Q4 | **Data flow direction** — one-way, two-way, multi-source, multi-target? | Drives entire iFlow structure — sync needs reply step | Architect |
| Q7 | **Frequency / trigger** — scheduled or event-triggered? | Scheduler adapter vs sender adapter — different design | Functional team |
| Q8 | **Trigger system** — who controls when the run starts? | Sender adapter type depends on this | Source system team |
| Q10 | **Data format** — XML, JSON, CSV, IDoc, EDIFACT? | Message mapping type depends on format | Functional team / BA |
| Q11 | **Adapter type** — HTTP, SFTP, OData, RFC, AS2, AMQP, Kafka? | Each adapter has completely different configuration | Architect / Basis |
| Q12 | **Authentication** — both legs (source→CPI and CPI→target)? | Credential alias must be provisioned before test | Basis / Security |
| Q13 | **Network restrictions** — IP whitelist, firewall, VPN? | Integration will fail at first test run without this | Basis / Network team |
| Q17 | **Sync vs Async** — does caller wait for a response? | Async = JMS / fire-and-forget. Sync = request-reply pattern | Architect |

---

## IMPORTANT — Design Decisions (wrong assumptions cause rework)

| Q# | Question | Why it matters | Who to ask |
|----|----------|---------------|------------|
| Q6 | **Full load vs delta** — all records or only changed ones? | Different filter logic, different volume, different schedule | Functional team |
| Q9 | **Sequence dependency** — does order of objects matter? | Header-before-item patterns require sorting / splitting | Functional team |
| Q14 | **Field mapping spec** — who provides it? | Cannot build Message Mapping step without this | Business Analyst |
| Q15 | **Payload size** — could it exceed 40 MB? | Large payloads need chunking / splitting step | Functional / Source team |
| Q18 | **Error handling strategy** — standard or custom recovery? | Exception subprocess design differs significantly | Architect |
| Q19 | **Retry logic** — how many retries, what backoff, what escalation? | Without this, failed messages silently disappear | Architect |
| Q21 | **Enrichment / lookup** — needed in CPI, sender, or receiver? | Adds a Value Mapping or RFC lookup step | Functional team |
| Q22 | **Single vs batch + partial failure** — all-or-nothing or per-record? | Batch splitting and error aggregation logic | Functional / Architect |
| Q25 | **Idempotency / upsert** — risk of duplicate processing? | DuplicateCheck step required if yes | Functional team |
| Q26 | **Event-based vs poll-based** — push or pull? | Push = sender adapter. Pull = polling consumer. Different config | Architect |
| Q28 | **Persistence required?** — DataStore, JMS Queue, variable? | DataStore for dedup. JMS for guaranteed delivery | Architect |

---

## QUALITY — Governance (missing these cause review comments)

| Q# | Question | Why it matters | Who to ask |
|----|----------|---------------|------------|
| Q2 | **System ownership contacts** — who is responsible for each system? | Needed to chase missing info quickly | Story author |
| Q3 | **What data / object types and priority?** — avoid scope creep | Defines iFlow scope boundary | Functional / Product Owner |
| Q5 | **Master vs transactional data** — nature affects volume and design | Master data = low frequency, high reuse. Transactional = high volume | Functional team |
| Q16 | **System limits** — API rate limits, max message size, throttle rules? | Exceeding limits causes intermittent failures in production | Source / Target Basis |
| Q20 | **Encryption required?** — PGP, signing, sensitive data? | PGP adapter step + key management setup needed | Security / Compliance |
| Q23 | **Monitoring / logging** — where to see logs and payloads? | MPL settings, payload logging level, alerting rules | Operations team |
| Q24 | **Reusability** — what logic or flows already exist to reuse? | Avoid rebuilding existing value maps, scripts, sub-flows | Integration team |
| Q27 | **Audit & compliance** — GDPR, GxP, or SOX requirements? | Audit logging, data retention, PII handling rules | Compliance / Legal |

---

## Quick Reference — Who to Ask for What

| Role | Typical questions they own |
|------|--------------------------|
| **Business Analyst / Functional Team** | Q3, Q5, Q6, Q9, Q14, Q21, Q22, Q25 |
| **Integration Architect** | Q1, Q4, Q17, Q18, Q19, Q26, Q28, Q24 |
| **Source System Basis Team** | Q7, Q8, Q11, Q12, Q13, Q16 |
| **Target System Basis Team** | Q11, Q12, Q13, Q16 |
| **Security / Compliance** | Q20, Q27 |
| **Operations Team** | Q23 |

---

## Completeness Bands

| Critical answered | Band | Action |
|------------------|------|--------|
| 7–9 of 9 | ✅ Build-Ready | Developer can start |
| 5–6 of 9 | 🟡 Refinement Needed | Close 1–2 gaps before sprint |
| 3–4 of 9 | 🟠 Design Incomplete | Do not assign to developer yet |
| 0–2 of 9 | 🔴 Skeleton Only | Return to requester |

---

*Source: CPI Maestro team practice. Maintained in `docs/cpi/references/`.*
*Used by `@-story2design` agent — Step 2 gap analysis.*
