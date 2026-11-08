---
kind: brief
status: draft
date: 2026-11-08
owner: jonathanleahy
project: research-text-adventure-ai
tags: []
---

# Brief: research-text-adventure-ai

## Problem

Asking whether a language model is reliable gets a confident answer, because a fluent paragraph can hide a wrong one. The question that matters is narrower and harder: can the model keep track of a world and act correctly inside it, over several steps, using only what it has been given? Answering that needs an environment that is deterministic and fair, so that a failure belongs to the agent rather than to the scenery.

## Users

The primary user is the person building an AI organisation: an engineer deciding whether agent-shaped work can be delegated, who needs a measured answer rather than a demonstration. The secondary user is the reader of the published series, who wants the method, the numbers and the failures, and who wants to be able to rerun them.

## Success metrics

The series succeeds when the numbers are honest rather than favourable: a failure taxonomy that sorts every failed run into exactly one category, a hypothesis verdict that can be falsified, and a result that survives a rerun. Concretely, the matrix reports a cell with an interval rather than a bare number, every transcript replays to an identical hash chain, and a live run against a real provider is reported separately from the surrogate that stands in for it while no key is available.

## Scope

In scope: a pure state kernel with no clock, no input or output and no unseeded randomness; a perception boundary proved over every reachable state rather than sampled; an agent harness with provider adapters, budgets and guards; a failure taxonomy and the metrics it produces; a matrix with intervals and hypothesis verdicts; and a second world that the kernel is not allowed to know about.

## Out of scope

The obvious neighbour is a product. There is no user interface here, no deployment, no account and no service to keep running: this repository publishes evidence, not a running system. Also deferred is the browser client and the server, which are Phase 5 of the plan and stay open until the equivalence test they would enable can be built.
