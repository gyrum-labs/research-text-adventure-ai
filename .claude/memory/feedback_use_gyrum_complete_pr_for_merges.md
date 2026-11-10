---
name: Always merge PRs via gyrum-complete-pr, never via direct gh pr merge
description: Operator wants the gyrum-devtools workflow gates enforced; hand-rolled persona reviews + raw `gh pr merge` rubber-stamp instead of gating
type: feedback
---
For any PR in a gyrum-installed repo: merge via `gyrum-complete-pr` from a checkout of the feature branch. Run `gyrum-review-pr` first if reviews aren't already in. Never use `gh pr merge` directly.

**Why:** gyrum-complete-pr enforces the actual contract — `gyrum-review-pr` runs structural checks (build, test, coverage, complexity, file length) AND triggers real AI persona reviews (not me writing persona-themed prose). Then gyrum-complete-pr verifies review pass, merges with `--merge` (preserves history; not `--squash`), and tags the version. The hand-rolled "submit persona reviews via PATs then `gh pr merge --squash`" pattern bypasses every one of those gates and produces lower-quality merges. Operator called this out explicitly on 2026-04-22 after watching ~10 PRs in a row use the bypass.

**How to apply:**
- Skip the workflow ONLY if the repo doesn't have gyrum-devtools installed yet (check for `.githooks/pre-push` referencing `~/.gyrum/devtools/pre-push.sh`)
- For PRs opened by background agents in /tmp worktrees: clone fresh, checkout the agent's branch, rebase onto current main if needed, run `gyrum-review-pr`, then `gyrum-complete-pr`
- If `gyrum-review-pr` fails on a pre-existing issue (test failing on main, etc.), surface that to operator before working around it — don't `--no-verify` or admin-merge to bypass
- The stacked-PR pattern still works: rebase each child onto current main as the parent merges; gyrum-complete-pr handles the merge mechanics correctly
- Do not confuse this with simple commit/push (where the pre-push hook runs anyway) — this rule is specifically about merging
