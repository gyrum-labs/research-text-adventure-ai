# scripts/update-docs.sh

Thin wrapper that refreshes this repo's shared documentation from the
canonical source in [`gyrum-labs/devtools`](https://github.com/gyrum-labs/devtools).
It delegates to `~/.gyrum/devtools/update-docs.sh` so improvements to the
shared docs propagate automatically the next time the deployed devtools
checkout pulls.

## What it does

- Copies every file under `~/.gyrum/devtools/docs/shared/*` into this
  repo's `docs/shared/`, each carrying an `AUTO-GENERATED` header.
- Regenerates `docs-viewer/_index.json` to match the current docs tree.

## Usage

```sh
scripts/update-docs.sh            # perform the writes
scripts/update-docs.sh --check    # dry run — exit 1 if a generated file
                                  # has been hand-edited (suitable for CI)
```

## Rules

- Files under `docs/shared/` carry an `AUTO-GENERATED` header and **must
  not** be edited directly — edit the source in
  `~/.gyrum/devtools/docs/shared/` instead, then re-run this script.
- `--check` is the CI-safe mode: it never writes, and exits non-zero when
  a generated file has drifted from its source.

See the runbook at [`docs/runbooks/update-docs.md`](../docs/runbooks/update-docs.md)
for the recovery procedure when `--check` reports drift.
