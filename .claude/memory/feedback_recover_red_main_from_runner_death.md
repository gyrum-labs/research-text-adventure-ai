---
name: Recover a red main caused by a dead self-hosted runner
description: When main is red from runner death (not a code bug), revive the runner and retrigger — never force-merge an unrelated PR
type: feedback
---
When devtools main is red and the failing shards show "The self-hosted runner lost communication with the server" or "starves it for CPU/Memory", the cause is a dead/ghost runner — NOT a code bug. The main-health circuit-breaker blocks every merge while main is red, and its fix-PR auto-pass only recognises a CODE fix (diff overlap), so an unrelated approved PR just sits blocked.

**Why:** On 2026-07-28 warp#11846 sat approved but unmergeable for hours because a dead runner red'd main. The recovery required non-obvious steps that cost significant time to discover.

**How to apply:**
1. Diagnose: check the failing shard logs for "lost communication" or "starves it for CPU/Memory" — this is the runner-death signature, not a test failure.
2. Reach the host: SSH may refuse the default key. Use the dark-factory ansible vault (`ansible/host_vars/<host>/vault.yml`) for the correct credentials, or `gyrum-fleet doctor` for SSH-less diagnosis.
3. Revive the ghost runner: `sudo systemctl kill -s SIGKILL actions.runner.<org>.<runner>.service && sudo systemctl reset-failed actions.runner.<org>.<runner>.service && sudo systemctl start actions.runner.<org>.<runner>.service`. The clean restart hangs in 'deactivating' — SIGKILL is required.
4. Retrigger the dead shard: re-run the failed job via the GitHub API or push an empty commit to the PR branch.
5. NEVER use `--merge-into-red` on an unrelated PR to bypass the breaker — that stacks work on a broken main.
6. CI pins shellcheck v0.10.0 — a newer system shellcheck may miss findings (e.g. SC2120), causing local-clean/CI-fail round-trips. Check the pinned version before debugging "phantom" shellcheck failures.
