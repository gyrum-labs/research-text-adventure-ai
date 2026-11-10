---
name: complete-pr poll-timeout leaves the changelog entry unrecorded — recover via a changelog PR
description: gyrum-complete-pr's auto-merge poll can time out before a slow-CI merge lands, so the post-merge changelog entry is never written; --recover tags + tallies but NOT the changelog
type: feedback
---
`gyrum-complete-pr --merge` polls for auto-merge completion (timeout 1800s). If the merge lands AFTER the poll times out — common under fleet runner saturation, where the bash-test shards take ~40 min — the complete-pr process exits before the merge, so its post-merge tail never runs: the changelog ledger entry (`.changelog/entries.jsonl`) is NOT recorded.

`gyrum-complete-pr --recover <branch>` recovers the orphaned merge — it TAGS the merge commit and AUTO-TALLIES the ticket — but it does NOT record the changelog entry. So after a recover, the ledger still misses the entry.

**Why:** Confirmed 2026-08-08 merging devtools warp#12406 (PR #2023) and warp#12408 (PR #2026): both complete-pr processes timed out before the merges; `--recover` tagged v25.7.4 / v25.7.3 and closed the tickets, but `entries.jsonl` had no entries until recorded manually.

**How to apply:**
- After a recover leaves a missing changelog entry, record it via the changelog-PR path (the doc-only PR): branch from main, append the entry to `.changelog/entries.jsonl` (JSONL — one object per line; validate with `tail -n +2 <file> | jq -s 'empty'` because the file has a `#` header comment), `touch .gyrum/branch-meta.no-ticket` before pushing (the push gate needs it for a no-ticket changelog branch), create the PR (`gh pr create` is wrapper-blocked → `GYRUM_ALLOW_GH_PR=1`), approve via `changelog_pr_autoapprove` with `GYRUM_CHANGELOG_APPROVER_PAT_VARS="MARCUS_GITHUB_TOKEN LIN_GITHUB_TOKEN"`, then `gyrum-complete-pr --merge` (re-enrolls auto-merge if the approval dropped it and runs the fast doc-only tail).
- Prevention: don't rely on the poll for a slow-CI merge — poll the PR state directly and re-run `gyrum-complete-pr` once it is merged, so the post-merge tail runs on the landed commit.
