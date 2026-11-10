<!-- AUTO-GENERATED from gyrum-labs/devtools docs/shared/workflow-boilerplate.md. Do not edit directly. Run scripts/update-docs.sh to refresh. -->

# The three-command workflow

Every gyrum project uses the same short developer loop: start work, run the review, complete the PR. There are three commands — `gyrum-start-work`, `gyrum-review-pr`, and `gyrum-complete-pr` — and together they cover the full journey from "I want to change something" to "the change is on main with a new version tag". The shape is deliberate. Each command is a checkpoint with a defined side effect: a branch exists, a review has run, a version has been bumped. And because the loop is identical across every gyrum repository, a developer who has used it once can drop into any other gyrum project without re-learning how changes get shipped.

## Start work

```bash
gyrum-start-work add-user-auth
```

`gyrum-start-work <feature-name>` creates a new branch named `feat/<feature-name>` from an up-to-date local `main`, pushes it to the remote, and immediately opens a draft pull request against `main`. This all happens before you have written a single line of code. That timing is intentional. The PR becomes the living description of the work from the moment the idea is committed to: it is visible to anyone watching the repository, it is where the review personas eventually land their verdicts, and it removes the small-but-annoying decision of "when is this ready to open a PR?" — the answer is "right now, at the start, as a draft". The draft state tells the review panel and other humans that the work is in progress, and a later command will flip it to ready once the review has passed.

## Work

What happens between "start work" and "review" is ordinary coding, with one quiet backstop: the `pre-push` hook that `gyrum-setup` installs runs on every push and refuses to let you push a broken branch. The exact checks depend on the project stack, but the core is always the same — if the build fails or the tests fail, the push is blocked and you see the failure immediately, before anyone else has reason to look at the branch. This is not meant to be annoying. It is a protective layer: the hook catches regressions at the cheapest possible moment, on your own machine, where the fix loop is fast and nobody else is waiting. The hook is deliberately light — build and test only — so it stays fast on every push; the heavier suite (linters, coverage, secret scans, complexity, security) is reserved for `gyrum-review-pr`, which runs it once, at the moment it matters, on top of the full AI review panel.

There is a second way to work on a change, which is the AI-assisted path via `gyrum-implement "<task>"`. Running this starts a guided loop: Claude asks you a handful of clarifying questions about what the feature needs, you answer in plain text, and the script synthesises a structured specification — requirements, acceptance criteria, open questions — and writes it straight to the PR description *before* any code is written. Only after you confirm the spec does implementation start, and it starts test-first. The important idea is that the PR exists as a requirements document first, a code change second. That order lets the author and the reviewers read and refine the spec on GitHub, in context, before any commits arrive to argue with.

## Review

```bash
gyrum-review-pr
```

`gyrum-review-pr` is the moment a change is put up against the gate. Running it is not optional — it is the script that drives every layer of the gate, including the calls that post formal GitHub reviews on the author's behalf, so merge to `main` is blocked until it has been run and passed on the latest commit. Running `gyrum-review-pr` first runs the structural checks, because there is no point asking an AI reviewer to read a diff that does not compile, and exits with a clear failure message if any blocking check fails. Once the structural layer is green, the four review personas run in parallel. Each one reads the diff with its own narrow mandate — Priya for security, Marcus for architecture, Lin for test and doc quality, Dana for reader onboarding — and each one files a verdict. Priya, Marcus, and Lin post their verdicts as real GitHub reviews, using persona-specific personal access tokens, and those reviews are what branch protection actually counts. Dana posts her feedback as a PR comment, clearly labelled as advisory, and her verdict gates the local script's exit code but not GitHub's formal approval threshold. The reasoning behind the split is explained in `gate-stack.md`.

The structural layer is a suite of mechanical checks; the exact set depends on the project stack, but every consumer runs these blocking categories:

- **Build + test** — the project compiles and its tests pass on the PR's head commit.
- **Lint + static analysis** — `staticcheck`/`eslint` and the language-specific vetters catch style and common-bug patterns.
- **Coverage** — diff coverage on changed statements must clear the floor from `lib/thresholds.conf`.
- **Size + shape** — new files under the file-line cap, new functions under the cyclomatic cap, the whole PR under the line/file caps.
- **Secret + binary scan** — no credentials in the diff, no multi-megabyte blobs outside LFS.
<!-- the /tmp path is a runtime-artifact location, not a repo-relative path; it intentionally does not resolve in the consumer tree -->
<!-- doc-truth: ignore-next -->
- **Viewer-validator** — every markdown file under `docs/` must satisfy the mechanical contract in `doc-standards.md` (index registration, frontmatter on living docs, single H1 with no skipped heading levels, tagged code fences, relative internal links to registered files, and seeded templates filled in). Run by `viewer-validator.py` and blocking; a JSON report lands at `/tmp/gyrum-viewer-validator.json` for diagnostics.

Verdicts from the AI panel appear inline as the script runs, so you can see each persona's call the moment it comes in. If one of them requests changes, the script exits with a non-zero code and prints what to fix. The right response is not to rewrite history or amend the PR — it is to make a new commit that addresses the feedback, push it, and run `gyrum-review-pr` again. The script uses incremental review, which means each persona only re-reads the diff between its last verdict and the new HEAD; a small fix does not force the whole PR to be re-reviewed from scratch. When the threshold is met — the structural gate green **and** at least two of the three formal approvals (Priya/Marcus/Lin) **and** Dana's advisory pass — the script updates the PR body from the commit log, flips the PR out of draft state, and prints a success message telling you to run the completion command. Merge to `main` is blocked until all three of those conditions hold.

## Complete

```bash
gyrum-complete-pr
```

`gyrum-complete-pr` is the final checkpoint. It waits until the required approvals are in place on GitHub, performs the merge, syncs your local `main`, derives the next patch version from the `VERSION` file's MAJOR.MINOR anchor plus the count of merges since the anchor was last changed, tags the merge commit, and pushes the tag. The tag is not a cosmetic touch; it is how every merged change gets a unique, visible version identifier, which in turn is what makes rollback and audit tractable without any additional ceremony. If something breaks on `main` next week, "when did this start?" has a precise answer, because every merge since has a tag attached to it. Because the patch number is *derived* at tag time instead of written back to the file, two `gyrum-complete-pr` runs for different PRs merging in parallel cannot collide — each tags its own merge commit with its own deterministic count.

## Thresholds

<!-- consumer may not have .gyrum/debt-thresholds.json yet — overridable per-project, optional -->
<!-- doc-truth: ignore-next -->
The numeric thresholds that govern the gate — coverage minimums, diff-size limits, file-length caps, cyclomatic complexity, function length, directory file count — live in a single file: `lib/thresholds.conf` inside the devtools checkout. Review-pr.sh sources it directly, and the CLAUDE.md template that `gyrum-setup` drops into a new project is rendered from the same values. That means the number in your CLAUDE.md and the number the gate will enforce cannot drift — they come from the same place. A project can override any individual threshold by writing `.gyrum/debt-thresholds.json` in its own tree, and the override layers on top of the SSOT at review time. The specific values are intentionally not listed here: if you want to know what they are right now, read `lib/thresholds.conf`.

## Escape hatches, and the ones that do not exist

Real life occasionally asks for exceptions, and it is worth being clear about which ones the workflow supports and which it does not. The answer is short: there is deliberately no developer-time flag to bypass the AI review panel. If you want to know whether the structural layer is happy, push and let the `pre-push` hook run its checks locally; that is the designed-in shortcut. If you want to know what the panel will say, run `gyrum-review-pr` — including while iterating — and let each re-run use the incremental review to keep the feedback loop tight.

Shortcuts that skip the hooks entirely — `git push --no-verify` is the obvious one — are not forbidden, because sometimes an emergency is real. They are, however, not invisible. A push that skipped the gate should leave a note in the PR description explaining why and a follow-up debt entry via `gyrum-file-debt` so the shortcut is accounted for. The point is not that the hooks are sacred. The point is that the gate is the mechanism by which everyone downstream trusts the merge, and skipping it silently breaks that trust for every reader of the log who comes after you. Leave a trail and the shortcut costs nothing; hide it and the shortcut costs the team's confidence in the rest of the history.

## In one sentence

The three commands are the ergonomic front end of the system described in `gate-stack.md`: the start command puts a draft PR on the board, the review command runs the gate, the completion command ships the change with a new version, and branch protection on the server is what makes sure the steps actually happened.
