#!/usr/bin/env bash
# >>> gyrum-managed:start
# Thin wrapper: delegates to devtools so improvements in gyrum-labs/devtools
# propagate automatically on the next `git pull` in ~/.gyrum/devtools.
exec bash "$HOME/.gyrum/devtools/update-docs.sh" "$@"
# >>> gyrum-managed:end

# Repo-local doc-refresh steps below — preserved across gyrum-setup runs.
