<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-16 -->

---
title: research-text-adventure-ai. Documentation
status: living document
last-updated: 2026-11-16
---

# Documentation

This folder is the book: the specification, the experiment series that
builds it, and the operational docs around them. It is served by the
local reader at `/docs-viewer/`.

## Start here

Open [`docs-guide.md`](./docs-guide.md) first. It is the map of the whole
project and fixes a reading order, so the documents do not get read in
the wrong sequence.

## The short version of that order

1. [`../SPEC.md`](../SPEC.md) Part 0, Orientation - the idea from the beginning
2. [`../experiments/README.md`](../experiments/README.md) - the work as a numbered series
3. [`proposal.md`](./proposal.md) - what the project is, and is not
4. [`userguide.md`](./userguide.md) - how to play and how to run the agent
5. [`TESTING.md`](./TESTING.md) - the testing doctrine
6. [`../AGENT_BRIEF.md`](../AGENT_BRIEF.md) - the brief for an agent picking up work

## The rest

- [`ADVENTURES.md`](./ADVENTURES.md) - authoring the worlds
- [`MAPS.md`](./MAPS.md) - generated maps of every world (run `npm run maps`)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - the engine, layer by layer
- [`TESTING.md`](./TESTING.md) - what each test layer guarantees
- [`ASL-RESEARCH.md`](./ASL-RESEARCH.md) and [`RESEARCH-CONTEXT.md`](./RESEARCH-CONTEXT.md) - the research frame
- [`REFERENCES.md`](./REFERENCES.md) - sources
- [`images/`](./images/) - illustrations, with `illustrations.json` recording each one
- [`shared/`](./shared/) and [`gyrum/`](./gyrum/) - generated standards; edit their sources, not these copies
