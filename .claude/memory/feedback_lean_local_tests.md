---
name: Run only the changed tests locally, once, stripped down
description: The CI runners run the full suite on every PR, so local runs cover only the changed tests, once, in the stripped-down environment that mirrors CI.
type: feedback
---
Run each new or changed test unit ONCE locally: `env -i HOME="$HOME" PATH=/usr/bin:/bin bash scripts/ci-run-unit.sh <unit>`. Use a normal run only to diagnose a failure that appears stripped-down. Do not re-run the wider suite locally.

**Why:** operator, 2026-10-01 — the full tests run on the runners anyway. That day the laptop sat at load ~20-25 while 11 of 12 runners were idle, and the stripped-down run catches ambient-credential leaks a normal laptop run hides (warp#20025).

**How to apply:** if a unit fails or times out locally, rerun it the same way on plain main before treating it as yours; several units only fail on a loaded laptop.
