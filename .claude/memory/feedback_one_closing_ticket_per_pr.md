---
name: One closing ticket per PR — the merge train refuses more
description: The train refuses a PR whose body has a Closes/Fixes/Resolves/Refs line naming any ticket other than the title's, reporting it as snapshot-unavailable — one such line is already enough, not just two or more naming different tickets.
type: feedback
---
Keep exactly one closing line, for the ticket in the PR title. Write other delivered tickets as `Also delivers warp#N` and close them after the merge. Also keep `warp_ticket:` metadata to the title ticket.

**Why:** `train_signed_review_snapshot` (lib/merge-train-signed-review-authority.sh) requires every closing line to equal the title ticket; PR #3540 was dequeued as `snapshot-unavailable` on 2026-10-01, and the message wrongly advises a re-review.

**How to apply:** batch PRs use one primary ticket until the train accepts multi-ticket PRs (warp#20100); then this memory should be retired.
