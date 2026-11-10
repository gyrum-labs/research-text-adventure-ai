---
name: verify-merge-in-deploy-tag
description: Before deploying "the feature you just merged", confirm the merge SHA is an ancestor of the deploy tag — the release pipeline tags incrementally so the latest tag can PREDATE your merge
metadata:
  type: feedback
---
Before deploying a version to make a just-merged change "live", confirm the merge commit is an ancestor of the tag you're deploying: `git merge-base --is-ancestor <merge-sha> <deploy-tag> && echo IN || echo MISSING`.

**Why:** Operator (jon, 2026-05-25) merged a feature then deployed the newest tag to make it live — but that tag had been cut from an EARLIER merge and PRE-DATED the feature; it shipped in the next tag (still building at deploy time). Caught only because the post-deploy live probe came back false. The release pipeline tags incrementally and asynchronously, so "latest tag" ≠ "tag with my change".

**How to apply:**
- Find the tag that contains YOUR merge SHA, not just the newest: `for t in $(git tag --sort=-creatordate | head -8); do git merge-base --is-ancestor <merge-sha> "$t" && echo "$t HAS it"; done`. Deploy that tag.
- After deploying, run a LIVE probe asserting the new behaviour is present (an API call, a rendered field) — image-tag-changed ≠ feature-live.
- Each distinct prod version deploy needs its own explicit operator authorization; a general "deploy it" doesn't cover a different version number. Canonical rule lives in `CLAUDE-enforcement-section.md` — keep both surfaces in sync.
