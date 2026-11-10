---
name: The PR body is signed review evidence — never edit it after the final review
description: gyrum-review-pr signs the ticket, PR body, policy, panel and exact head; any later body edit voids the signature and the merge train refuses the PR.
type: feedback
---
Finish every PR-body edit, including `## Friction`, BEFORE the final `gyrum-review-pr` run. An edit afterwards makes `gyrum-complete-pr --train` refuse with `signed exact-head review policy is not authoritative … REFUSE/evidence_unverified` (`candidate matches: general=false legacy=false pair=false`).

**Why:** confirmed 2026-10-01 on PR #3435 — a post-review Friction fix voided its 2/2 review.

**How to apply:** if an edit is unavoidable after review, make it and run `gyrum-review-pr` once more on the same head.
