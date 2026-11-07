---
name: verify-api-before-recommending
description: Live-probe an API/service/supervisor before proposing a fix that depends on its behaviour — paste the actual response into the analysis
metadata:
  type: feedback
---
Any time you propose a fix that depends on how an API, service, queue, supervisor, or external system actually behaves — do a live probe FIRST and paste the response into your analysis. Don't infer behaviour from code reading alone.

**Why:** Operator (jon, 2026-05-16) flagged that an agent proposed "supervisors race for tickets because warp-ready returns the same list to all" without checking. Live probe of `/api/v1/items?status=ready` showed the list is already filtered server-side (`claimed_by: null, lease_expires_at: null`). The proposed cross-supervisor pre-poll-filtering fix was unnecessary; the real bug was a single-supervisor re-claim loop (warp#2969), a completely different shape. Time cost of probe < 30s; time cost of operator catching an unverified fix > 5min + token budget burned on the wrong implementation. The probe is always cheaper.

**How to apply:**
- API behaviour claim → `curl -sS … | jq`. Paste actual response in analysis.
- Service behaviour claim → check journal/logs/state file. Paste actual content.
- Supervisor/agent behaviour claim → grep the script + check the function definition. Paste actual lines.
- If you can't probe (no access / no test fixture available) — flag it: "untested assumption: <X>; need verification before proceeding".
- Sister behavioural-hygiene catches: cluster-detection (warp#2980), the actual re-claim-loop fix (warp#2969). Canonical rule lives in `CLAUDE-enforcement-section.md` — keep both surfaces in sync.
