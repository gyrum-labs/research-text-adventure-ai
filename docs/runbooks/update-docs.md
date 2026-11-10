# Runbook — `scripts/update-docs.sh` reports drift

When CI (or a local `scripts/update-docs.sh --check`) fails with a
drift report, a file under `docs/shared/` no longer matches its
canonical source in `~/.gyrum/devtools/docs/shared/`. This runbook is
the recovery procedure.

## Symptom

```
$ scripts/update-docs.sh --check
update-docs: docs/shared/gate-stack.md differs from source — re-run without --check
```

`--check` exits non-zero; the PR's structural checks go red.

## Cause

`docs/shared/*` files are generated, not authored. Drift happens when:

1. Someone hand-edited a `docs/shared/` file (forbidden — the header
   says so), or
2. The canonical source in `gyrum-labs/devtools` advanced and this repo
   hasn't re-run the generator since.

## Fix

```sh
# 1. Make sure the deployed devtools checkout is current.
git -C ~/.gyrum/devtools pull --ff-only

# 2. Regenerate the shared docs in this repo.
scripts/update-docs.sh

# 3. Confirm the drift is gone.
scripts/update-docs.sh --check    # exits 0

# 4. Commit the regenerated files.
git add docs/shared docs-viewer/_index.json
git commit -m "docs: refresh shared docs from devtools"
```

If step 3 still reports drift after a clean regenerate, the source file
itself was edited in this repo's history — restore it from devtools by
re-running step 2 and discarding any local edits to `docs/shared/`.

## Never

- **Never** edit a `docs/shared/` file directly to silence the check —
  the next regenerate overwrites it and the drift returns.
- **Never** delete the `AUTO-GENERATED` header; the `--check` gate keys
  on it to tell a generated file from an authored one.
