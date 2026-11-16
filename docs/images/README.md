# Screenshot assets

This directory holds images referenced by `docs/userguide.md` (and
optionally the top-level `README.md`). Hosting them in the repo
means they version and diff alongside the code, rather than
drifting on an external image host. Every file under `docs/` —
including the images — is picked up by `scripts/update-docs.sh`
and registered in `docs-viewer/_index.json`, so the viewer can
surface them in its sidebar and the validator can confirm links
resolve.

## Illustrations (sketch set)

Beyond screenshots, this directory carries the book's sketch
illustrations, recorded in `illustrations.json`. The style contract for
every illustration is a two-stage pipeline:

**Stage 1 - clean base (required).** Each subject is drawn as a clean,
precise SVG in a professional technical style: correct rooms, labels,
layout and proportions, tidy geometry, sans-serif lettering. This file is
the editable source of truth. It is rendered to the deliverable PNG at
1240 px:

    rsvg-convert -w 1240 docs/images/<name>.svg -o docs/images/<name>.png

The base is deliberately not sketchy: it is the accurate version a
reader could measure from.

**Stage 2 - sketch-pen pass (done).** The rendered base is passed through
the image model with the sketch-pen style and the collected style references,
producing `<name>-hand.png`: the same drawing, every room, label and position
preserved, rendered as an organic hand-pen sketch. The pass runs through
**Replicate** (`google/nano-banana`, about $0.04 per image, driven by
`~/bin/replicate-sketch.sh`) - the OpenCode gateway does not include image
models on the OpenCode Go plan. The prompt template lives in
`illustrations.json` under `pipeline.stage2_prompt`; status per file is
recorded in the manifest (`stage2`: done, pending, or skipped with a reason).
All fourteen were drawn on 2026-11-16.

To change an illustration: edit the SVG, re-render, run
`scripts/update-docs.sh`, then run the stage 2 pass when a working
credential is installed.

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
