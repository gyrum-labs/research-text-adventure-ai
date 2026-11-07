<!-- AUTO-GENERATED from gyrum-labs/devtools docs/shared/native-capture-provenance-contract.md. Do not edit directly. Run scripts/update-docs.sh to refresh. -->

# Native capture provenance contract (warp#20935)

The persona review's **test-evidence section** tells a reviewer which tests the
review tool itself ran at the reviewed head. This document is the written
contract for the **metadata-aware capture**: what the producer writes beside a
capture, what the consumer requires before it trusts it, what "unavailable"
means, and how a metadata-aware capture is told apart from a legacy one.

Owner: the metadata-aware capture contract installed by
`lib/persona-review-test-evidence.sh` (`_persona_capture_install_contract`) on
the native Shell capture entry point (`mutation_run_suite`), and its consumer
in the same file (`_persona_test_evidence_render_from_sink`). The producer's
own library (`lib/mutation-score-lib.sh`) is held by an open devtools PR, so
the contract is installed where the capture sink is consumed rather than
inside the producer; the recorded facts are still the producer's own published
facts, read at capture time from the invocation that produced the capture.

## Why the contract exists

The producer knows four facts about a run that the reviewer needs: the time
allowance that **actually applied** to that invocation, where that allowance
came from, the **original exit code**, and the **failure class the producer
observed**. A capture that carries only the log and the exit code cannot be
told apart from an assertion failure, and cannot be told apart from a failure
at a *different* registered budget. The reviewer then reads a timeout at one
bound as a breach of another bound — the dark-factory PR #2643 incident.

The contract therefore carries exactly those four facts, plus the **provenance**
that binds them to the capture they belong to.

## The sidecar

A metadata-aware capture is a triple in the capture sink:

```
<sink>/<slug>.log    the captured output bytes (unchanged, unchanged shape)
<sink>/<slug>.rc     the original exit code the producer observed
<sink>/<slug>.meta   the metadata-aware sidecar (this contract)
```

`<slug>` is the capture file path with `/` replaced by `_` (the same transform
`mutation_run_suite` and the consumer already use for `.log`/`.rc`).

### Sidecar fields

The sidecar is a `key=value` line format, one field per line. The first `=`
separates the key from its value; later `=` characters remain part of that value. **All seven
fields are required**; a sidecar missing any of them, or carrying an empty
value for one of them, is malformed and renders as unavailable.

| Field | Required | Meaning |
|---|---|---|
| `schema` | yes | `persona-capture-provenance-v1`. The consumer accepts this exact value; any other value is malformed. |
| `allowance_seconds` | yes | The invocation allowance that **actually applied** to this execution, in whole seconds (≥ 1). It is *not* a registered budget the suite might be subject to elsewhere. |
| `allowance_source` | yes | Where that allowance came from — the setting or caller that supplied it (e.g. `MUTATION_SCORE_BASELINE_TIMEOUT`, `persona-test-evidence`). It is **not** a model or provider identifier. |
| `original_exit` | yes | The exit code the producer observed for the invocation, before any interpretation (0–255). |
| `producer_class` | yes | The producer-observed failure class, verbatim. One of `passed`, `test-failed`, `setup-failed`, `invocation-failed`, `timeout`, `signal-or-infrastructure`. |
| `command` | yes | The command the producer ran for this invocation (already redacted and bounded by the producer). |
| `log_sha256` | yes | The SHA-256 of the captured `.log` bytes. This is the **provenance binding**: it ties the four facts to this exact capture. |

### The producer's published fields

The contract reads the producer's own published result fields, taken from
`lib/mutation-score-lib.sh` (`mutation_run_suite`):

| Field | Published as | Meaning |
|---|---|---|
| `MUTATION_RUN_EXIT_CLASS` | one of `passed`, `test-failed`, `setup-failed`, `invocation-failed`, `timeout`, `signal-or-infrastructure` | the failure class the producer observed for the invocation it just ran |
| `MUTATION_RUN_COMMAND` | the command it ran, redacted and bounded by the producer before publication | which invocation the facts describe |
| `MUTATION_RUN_DIAGNOSTIC` | one bounded line with `command=`, `timeout=`, `timeout_source=`, `exit=` and `class=` | the producer's own per-invocation record |

The regression test pins the producer's published class vocabulary against the
accepted set above, so a producer-side vocabulary change is caught at this
boundary instead of silently demoting a capture to "unavailable".

### Invocation granularity

A capture that holds several files runs the producer once per file, so each
capture carries the facts of its own invocation. Every suite file still
executes exactly once, and the capture order and the stop-at-the-first-failure
behaviour are the producer's own; what changes is the runner's batching, not
the suite's execution count.

### Where the sidecar is written

The sidecar is written at capture time, by the same function that runs the
producer invocation: the facts are read from the producer's published result
fields for that invocation, never reconstructed afterwards. The contract
covers the captures taken after this module is sourced; a caller that runs
the producer before it is loaded keeps the legacy log/rc-only protocol. A capture can
therefore never carry another invocation's facts, and a producer that returns
before publishing a class records an empty class — which renders as
unavailable, never as a fabricated class.

### Provenance

Provenance is the evidence that `allowance_seconds`, `allowance_source`,
`original_exit` and `producer_class` belong to **the same invocation** as the
accompanying `.log` and `.rc`. It is established by two checks the consumer
performs on every metadata-aware capture:

1. `log_sha256` equals the SHA-256 of the `.log` file that is rendered beside it.
2. `original_exit` equals the content of the `.rc` file that is rendered beside it.

A sidecar that parses correctly but was produced by a **different invocation**
fails check 1 and renders as unavailable. Nothing about the other invocation's
allowance, source or class is attributed to this one.

## The consumer's rules

* **Metadata-aware capture** (a `.meta` sidecar is present and valid): the
  rendered entry shows the outcome word, the invocation allowance that applied,
  the allowance source, the original exit code and the producer's class
  verbatim. The class is never renamed, aliased, merged or re-derived from the
  exit code; the consumer infers no assertion cause from an arbitrary nonzero
  exit.
* **Timeout** reads as **INCOMPLETE** at the allowance that actually applied.
  It never reads as an assertion failure and never as a failure at another
  registered budget.
* **Unavailable**: a `.meta` sidecar that is missing a required field,
  malformed (a non-numeric allowance, an unknown class, a wrong schema, an
  unknown key), or mismatched (its digest or exit does not belong to the
  rendered log/rc) renders as a visible statement that the provenance could
  not be trusted. It never supplies success, never supplies a budget figure,
  and never silently falls back to looking like verified legacy evidence.
* **Legacy capture** (no `.meta` sidecar — an established non-Shell caller, or
  a stored legacy corpus): rendered exactly as before, byte for byte. The
  consumer asserts no allowance, source, class or provenance for it and adds
  no "unavailable" wording.

## Metadata-aware vs legacy — how they are told apart

A filesystem entry at the `.meta` path expresses metadata intent. A regular
sidecar must still pass the field, digest and exit checks; an empty or partial
regular file, a directory or a dangling symlink renders as unavailable. A
nonregular entry is rejected without reading it. Truncating a regular file
leaves its metadata intent present; truncation does not unlink it. Producer
execution count, order, original return and stop behavior remain unchanged
when a metadata write fails.

There is no flag, environment variable or caller opt-in. A completely absent
sidecar still selects the established legacy protocol. This discriminator
cannot infer metadata intent when no entry exists; it does not claim to recover
an entirely missing marker or an unwritable-parent history from log/rc alone.

A legacy capture is any capture that did not select this contract — a
log/rc-only capture from an established non-Shell caller, or a stored legacy
corpus. Its rendered bytes are unchanged, so a legacy corpus captured before
this contract existed still renders identically.

## Privacy

The rendered evidence carries the four invocation facts and the bounded case
lines / five-line tail the renderer already displayed. It never carries the
full private raw log, and never carries environment, provider or credential
data. The sidecar's `command` field is the producer's own published command
(`MUTATION_RUN_COMMAND`), which the producer redacts and bounds before it
publishes it.

The stored log/rc sink adapter retains the fixed legacy rendering. Standalone
internal diagnostics keep the current outcome-before-case rendering; a
metadata-aware sink emits its producer-observed outcome once, without a second
exit-code inference. Focused selection still delegates through that sink adapter.
