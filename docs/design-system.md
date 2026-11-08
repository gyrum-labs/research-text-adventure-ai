---
kind: design-system
status: draft
date: 2026-11-08
owner: jonathanleahy
project: research-text-adventure-ai
tags: []
---

# Design system: research-text-adventure-ai

## Atomic design breakdown

The product owns almost no interface, and saying so is the honest answer. What a reader meets is the docs viewer, a static page of vanilla JavaScript and CSS served from the repository, and the command line, which is the real interface for the researcher. The viewer composes four primitives: a navigation rail listing the documents, a document body rendered from Markdown, a search box backed by a generated index, and a figure, which is an image with its alt text carried in the manifest. The terminal composes the same primitives in another medium: a scenario, a transcript, a report and a table.

## Hexagonal architecture

The domain core is `src/kernel`, and it is a leaf: it imports nothing from the layers above it, which an ESLint rule and a test both enforce. The driving ports are the human CLI, the agent runner and the sweep, and each drives the same reducer, so a human transcript and an agent transcript mean the same thing. The driven ports are the provider, the transcript store and the filesystem, and each is reached through an interface rather than directly. Nothing in the core reads a clock, asks anybody anything or changes its mind.

## Developer specifics

The stack is TypeScript in strict mode on Node 20, with no runtime dependency beyond a schema library and a command parser; the model adapters use plain `fetch` rather than a vendor SDK, so provider churn never becomes a dependency problem. The layout is `src/kernel` for the core, `src/agents` for the policies and the provider port, `src/runner` for the measurement harness, `src/cli` for the entry points, and `tests/` beside nothing, mirroring the source it tests. The checks are `npm run check`, which typechecks, lints, runs the tests and lints the prose, and `npm run coverage`, which holds the kernel above ninety per cent. The gates this repository declares sit in the `gates` block of `repo-type.yaml`: the standard profile, requiring the orientation-drift gate, which keeps `ORIENTATION.md` in step with `repo-meta.yaml`.
