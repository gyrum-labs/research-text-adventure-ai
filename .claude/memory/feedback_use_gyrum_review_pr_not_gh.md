---
name: Never use gh pr create or gh pr merge — use gyrum-review-pr
description: gh pr create/merge bypasses the 3-persona AI review — PRs sit at REVIEW_REQUIRED forever. A gh wrapper in ~/.gyrum/bin blocks these commands physically.
type: feedback
---
Never use `gh pr create` or `gh pr merge` in gyrum repos. A wrapper in ~/.gyrum/bin/gh blocks these commands (warp#11010). Use the gyrum workflow:

1. `gyrum-start-work` — creates branch, claims ticket
2. Implement changes
3. `gyrum-review-pr` — runs structural checks AND triggers 3-persona review (priya, marcus, lin)
4. `gyrum-complete-pr` — verifies reviews, merges, tags version

**Why:** `gh pr create` never triggers the persona reviewers. Branch protection requires 1-2 approvals. Without `gyrum-review-pr`, PRs sit at REVIEW_REQUIRED forever. On 2026-07-19, 10+ PRs across 5 repos blocked the deploy pipeline overnight because the agent skipped `gyrum-review-pr`.

**How to apply:**
- If you already created a PR with `gh pr create`, run `gyrum-review-pr` from the branch workspace to trigger reviews
- `gyrum-review-pr` seeds an Outcome section — fill it in and re-run
- `gh pr view`, `gh pr list`, `gh pr checks` still work (read-only)
- Operator override: `GYRUM_ALLOW_GH_PR=1 gh pr create ...` (audited)
