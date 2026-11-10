# Screenshot assets

This directory holds images referenced by `docs/userguide.md` (and
optionally the top-level `README.md`). Hosting them in the repo
means they version and diff alongside the code, rather than
drifting on an external image host. Every file under `docs/` —
including the images — is picked up by `scripts/update-docs.sh`
and registered in `docs-viewer/_index.json`, so the viewer can
surface them in its sidebar and the validator can confirm links
resolve.

## Naming convention

Use short, lowercase, hyphen-separated names that describe the
**screen** the image shows, not the sequence it appears in:

| Good                          | Avoid                         |
|-------------------------------|-------------------------------|
| `tray-idle.png`               | `screenshot-1.png`            |
| `popup-alarm-ready.png`       | `fig2.png`                    |
| `settings-empty-state.png`    | `img_20260420_153012.png`     |

Two images of the same screen in different states should share a
prefix: `popup-alarm-typing.png` and `popup-alarm-ready.png` make
the pair obvious in the sidebar.

## What to capture

At minimum, projects with a user-facing UI should include:

- The empty-state **and** populated-state of each primary workflow
  screen.
- One completed example of the main output the product produces.
- A screenshot for every image referenced from `userguide.md` — an
  unresolved image link is a broken document in the viewer.

Projects with no UI — libraries, CLIs, backend-only services — are
exempt from the screenshot requirement; userguide.md can reference
terminal output or diagrams instead.

## Capturing

Any screenshot tool works. On Ubuntu, GNOME's built-in **Screenshot**
(`Shift+PrtSc`) is the easiest. Crop tight to the UI surface being
shown; leave a small amount of surrounding context (window chrome,
desktop edge) only when the reader needs it to locate the feature.

## After adding or replacing an image

Run `scripts/update-docs.sh` to refresh
`docs-viewer/_index.json`. A PR that adds an image but forgets the
index refresh will fail the `scripts/update-docs.sh --check` gate.
