<!-- page-version: 1.0.0 status: draft last-reviewed: 2026-11-08 -->

# Diagrams

The logic of this project, visually. Every diagram here is Mermaid, so it renders in the
docs-viewer, diffs cleanly in review, and needs no build step.

Each diagram says what it shows and where the prose version lives. If a diagram and the prose
disagree, the prose in `SPEC.md` is authoritative and the diagram is the bug.

---

## D1: System context

The five layers, and what each is allowed to know about the others. The arrows point the way
information flows; nothing points back up.

```mermaid
flowchart TB
    subgraph edge["Interfaces — the edges"]
        CLI["Human CLI"]
        WEB["Browser client"]
        AGENT["Agent runner"]
    end

    subgraph port["Session — a port, not a dependency"]
        SESSION["Session<br/>InMemory · File · Http"]
    end

    subgraph kernel["Kernel — pure, deterministic"]
        ADV["Adventure<br/>rooms · objects · doors · goals<br/><i>pure data</i>"]
        REDUCE["reduce(state, command)<br/>→ { state, events }"]
        PARSE["Command parser"]
        OBS["Observation builder<br/><b>the only state → agent path</b>"]
    end

    subgraph agents["Agents"]
        POL["AgentPolicy<br/>scripted · random · llm"]
        PROV["LlmProvider<br/>anthropic · openai · ollama · mock"]
    end

    subgraph harness["Harness"]
        RUNNER["Runner<br/>budgets · guards"]
        TRANS["Transcript (JSONL)"]
        METRICS["Metrics · Failure taxonomy F1–F9"]
    end

    CLI --> SESSION
    WEB --> SESSION
    AGENT --> SESSION
    SESSION --> REDUCE
    ADV --> REDUCE
    PARSE --> REDUCE
    REDUCE --> OBS
    OBS --> POL
    POL --> RUNNER
    PROV --> POL
    RUNNER --> REDUCE
    RUNNER --> TRANS
    TRANS --> METRICS
```

**The two rules the picture encodes.** The kernel sits alone in the middle with no arrows pointing
out of it except the observation builder. It cannot call anything, because it *is* a function. And
the observation builder is the only path from state to agent; the adventure's gold path, hint table
and action predicates have no arrow to the agent side at all, because the builder never receives
them.

Prose: `SPEC.md` §4.

---

## D2: The turn loop

The whole experiment, in one loop.

```mermaid
flowchart LR
    OBS["observe<br/><i>build the observation</i>"] --> DEC["decide<br/><i>the policy chooses a command</i>"]
    DEC --> RED["reduce<br/><i>apply the command</i>"]
    RED --> REC["record<br/><i>events + state hash</i>"]
    REC --> CHK{"goals<br/>complete?"}
    CHK -- yes --> WIN["SUCCESS"]
    CHK -- no --> GUARD{"guards<br/>tripped?"}
    GUARD -- no --> OBS
    GUARD -- yes --> END["FINISH<br/><i>budget · loop · provider</i>"]

    style OBS fill:#e8f0fe,stroke:#0969da
    style RED fill:#e8f0fe,stroke:#0969da
    style WIN fill:#dafbe1,stroke:#1a7f37
    style END fill:#ffebe9,stroke:#cf222e
```

Note where the model is *not*: it appears once, in "decide". Everything else is the environment,
and the environment never consults the model.

Prose: `SPEC.md` §11.1.

---

## D3: Command resolution

What happens to a line of text. Every red exit is a recoverable failure the agent is told about.

```mermaid
flowchart TD
    RAW["raw text<br/><i>take the brass key</i>"] --> NORM["normalise<br/>trim · lowercase · collapse spaces"]
    NORM --> VERB{"verb known?"}
    VERB -- no --> E1["parse_error<br/><i>Unknown command. Try: look, inventory, take, go, open…</i>"]
    VERB -- yes --> ARGS{"argument count<br/>matches the verb?"}
    ARGS -- no --> E2["parse_error<br/><i>take needs one object</i>"]
    ARGS -- yes --> RESOLVE{"resolve each argument"}
    RESOLVE -- "in this room" --> OK
    RESOLVE -- "in inventory" --> OK
    RESOLVE -- "in exits" --> OK
    RESOLVE -- "ambiguous" --> E3["parse_error<br/><i>Two things match 'key'. Say which.</i>"]
    RESOLVE -- "not found" --> E4["parse_error<br/><i>You can't see anything called 'brass key' here.<br/>You can see: keycard, bulletin, desk.</i>"]
    OK --> CMD["Command { verb, args }"]

    style E1 fill:#ffebe9,stroke:#cf222e
    style E2 fill:#ffebe9,stroke:#cf222e
    style E3 fill:#ffebe9,stroke:#cf222e
    style E4 fill:#ffebe9,stroke:#cf222e
    style CMD fill:#dafbe1,stroke:#1a7f37
```

**The important property:** the parser never *fixes* the agent's intent. `take the brass key` fails
even though a keycard is present, because "brass" is not in the scenario's declared alias table.
If the parser guessed, the invalid-action rate would measure the parser instead of the agent.

Prose: `SPEC.md` §8.

---

## D4: Predicate and effect evaluation

How one action either happens or does not.

```mermaid
flowchart TD
    CMD["Command"] --> SPEC["find the action spec<br/>matching the verb"]
    SPEC --> PRE{"all <b>requires</b> predicates hold?"}
    PRE -- no --> FAIL["action_failed<br/><i>state unchanged</i><br/>informative message"]
    PRE -- yes --> EFF["apply each <b>effect</b> in order"]
    EFF --> NEW["new state"]
    NEW --> EV["events[]"]
    EV --> GOAL{"a goal's<br/><b>achievedWhen</b> now holds?"}
    GOAL -- yes --> GC["goal_completed event"]
    GOAL -- no --> NEXT["next turn"]
    GC --> NEXT

    style FAIL fill:#ffebe9,stroke:#cf222e
    style GC fill:#dafbe1,stroke:#1a7f37
```

The predicate vocabulary is six kinds and the effect vocabulary is eight; both are listed in
`SPEC.md` §5.1. That is the entire engine.

Prose: `SPEC.md` §5.1, §6.

---

## D5: The adventure as a state machine

The whole Mission Impossible scenario, as states and transitions. This is the picture to check a
reading of the scenario against.

```mermaid
stateDiagram-v2
    [*] --> briefing

    briefing: BRIEFING ROOM
    corridor: SERVICE CORRIDOR
    vault: SERVER VAULT

    briefing --> corridor: go corridor
    corridor --> briefing: go briefing
    corridor --> vault: go vault<br/>(door locked)
    vault --> corridor: go corridor

    note right of corridor
        locker: closed
        → cutters, manual
        keypad: the safe code
    end note

    note right of vault
        bomb: 3 wires
        → cut the yellow one
        safe: locked, code 4821
        → case
    end note

    state "case recovered" as recovered
    state "bomb detonated" as boom
    state "mission complete" as won

    corridor --> recovered : take case
    vault --> boom : cut red or blue
    recovered --> won
```

The gold path walks this graph: `take keycard` · `go corridor` · `open locker` · `take cutters` ·
`read manual` · `unlock vault door with keycard` · `go vault` · `cut yellow wire with cutters` ·
`unlock safe with 4821` · `take case`.

Prose: `SPEC.md` §7.

---

## D6: One agent turn, as a sequence

Who calls whom, and in what order.

```mermaid
sequenceDiagram
    autonumber
    participant R as Runner
    participant P as AgentPolicy
    participant V as LlmProvider
    participant K as Kernel
    participant T as Transcript

    R->>K: buildObservation(state)
    K-->>R: Observation
    R->>P: next(observation, context)
    P->>V: complete(system, messages)
    V-->>P: text
    P->>P: extract a command<br/>(record which rung)
    P-->>R: Command
    R->>K: reduce(state, command)
    K-->>R: { state, events }
    R->>T: append events + state hash
    R->>K: goals achieved?
    K-->>R: yes / no
```

The provider is called exactly once per turn, and only when the policy needs it. The kernel is
never in the same conversation as the model.

Prose: `SPEC.md` §10, §11.1.

---

## D7: The leak boundary

The single most important picture in this document. The dashed line is the boundary the agent
cannot cross.

```mermaid
flowchart LR
    subgraph truth["The truth — all of it"]
        ST["GameState<br/>room · inventory · open doors"]
        HL["Hidden facts<br/>safe code · which wire is safe"]
        GP["The gold path"]
        HT["The hint table"]
        PR["Action predicates<br/>and effects"]
    end

    subgraph built["What the builder receives"]
        IN["state +<br/>public adventure fields"]
    end

    subgraph seen["What the agent sees"]
        OB["Observation<br/>location · visible objects · inventory<br/>exits · goals · last outcome"]
    end

    ST --> IN
    IN --> OB
    OB --> AG["The agent"]

    HL -.->|"never crosses"| X["✕"]
    GP -.->|"never crosses"| X
    HT -.->|"never crosses"| X
    PR -.->|"never crosses"| X

    style X fill:#ffebe9,stroke:#cf222e,stroke-width:2px
    style OB fill:#dafbe1,stroke:#1a7f37
```

The enforcement is structural, not a promise: the builder's signature does not receive the hidden
facts, so it cannot pass them on. `tests/leakage.test.ts` then checks the property for every
reachable state.

Prose: `SPEC.md` §9, `experiments/exp-02-what-the-agent-sees/`.

---

## D8: Context strategies

The same observation, four ways. This is the variable that answers "do we give the agent the whole
conversation, or a summary of where it is?".

```mermaid
flowchart TD
    OBS["Observation<br/><i>the current turn</i>"] --> S1["none<br/><i>this turn only</i>"]
    OBS --> S2["full<br/><i>the entire transcript</i>"]
    OBS --> S3["window<br/><i>the last 5 turns</i>"]
    OBS --> S4["structured<br/><i>a derived known-facts block</i>"]

    HIST["The agent's own<br/>observation history"] --> S3
    HIST --> S4

    S1 --> PROMPT["The prompt"]
    S2 --> PROMPT
    S3 --> PROMPT
    S4 --> PROMPT

    style S4 fill:#dafbe1,stroke:#1a7f37
    style S1 fill:#ffebe9,stroke:#cf222e
```

`structured` is highlighted because it is the recommended default: it is the Reflexion-style bounded
summary, and it is the shape an organisation-simulation agent would need. A dashboard, not a
transcript. `none` is the control.

Prose: `SPEC.md` §10.4.

---

## D9: Budgets and guards

Every way a run can end, and what each one means.

```mermaid
flowchart TD
    T["turn"] --> B1{"turns used<br/>≥ maxTurns?"}
    B1 -- yes --> E1["budget_exhausted"]
    B1 -- no --> B2{"tokens used<br/>≥ ceiling?"}
    B2 -- yes --> E1
    B2 -- no --> B3{"same state hash<br/>3 turns running?"}
    B3 -- yes --> E2["loop_detected"]
    B3 -- no --> B4{"provider errors<br/>≥ 3?"}
    B4 -- yes --> E3["provider_error"]
    B4 -- no --> B5{"parse errors<br/>≥ 10?"}
    B5 -- yes --> E4["budget_exhausted"]
    B5 -- no --> B6{"goals complete?"}
    B6 -- yes --> OK["success"]
    B6 -- no --> B7{"a fatal action<br/>fired?"}
    B7 -- yes --> E5["failure"]
    B7 -- no --> T

    style OK fill:#dafbe1,stroke:#1a7f37
    style E5 fill:#ffebe9,stroke:#cf222e
    style E2 fill:#ffebe9,stroke:#cf222e
    style E3 fill:#ffebe9,stroke:#cf222e
```

`budget_exhausted` is the most common honest outcome, and it is a result, not a bug. It means the
agent spent its turns without finding the facts it needed.

Prose: `SPEC.md` §11.2, §11.3.

---

## D10: Classifying a failure

The decision tree that turns a failed run into one category. It reads the transcript, never the
model.

```mermaid
flowchart TD
    F["A failed run"] --> Q1{"the response produced<br/>no parsable command?"}
    Q1 -- yes --> C1["F1 · parsing"]
    Q1 -- no --> Q2{"named an object that is<br/>not in the room or inventory?"}
    Q2 -- yes --> C2["F2 · hallucination"]
    Q2 -- no --> Q3{"acted before discovering<br/>the fact it needed?"}
    Q3 -- yes --> C4["F4 · ordering / precondition"]
    Q3 -- no --> Q4{"repeated a failed action,<br/>or cycled?"}
    Q4 -- yes --> C3["F3 · planning"]
    Q4 -- no --> Q5{"cut the wrong wire?"}
    Q5 -- yes --> C6["F6 · lethal trap"]
    Q5 -- no --> Q6{"never found a required fact<br/>inside the budget?"}
    Q6 -- yes --> C5["F5 · exploration failure"]
    Q6 -- no --> Q7{"the API failed?"}
    Q7 -- yes --> C8["F8 · provider error"]
    Q7 -- no --> Q8{"declared itself stuck<br/>or stopped early?"}
    Q8 -- yes --> C9["F9 · abstention"]
    Q8 -- no --> C7["F7 · budget exhaustion"]
```

Exactly one category per failed run, applied in this priority order. The histogram this produces is
the project's primary artefact. See `experiments/exp-04-why-it-failed/`.

Prose: `SPEC.md` §12.3.

---

## D11: The sweep

From a matrix of models and conditions to a table of results.

```mermaid
flowchart LR
    M["matrix<br/>models × conditions × seeds"] --> R1["run 1"]
    M --> R2["run 2"]
    M --> RN["run n…"]
    R1 --> T["transcript<br/>+ metrics<br/>+ classification"]
    R2 --> T
    RN --> T
    T --> AGG["aggregate per cell"]
    AGG --> W["success rate<br/>+ Wilson 95% interval"]
    AGG --> F["failure histogram F1–F9"]
    AGG --> C["cost per solved mission"]
    W --> SUM["results/summary.md"]
    F --> SUM
    C --> SUM
```

A cell with fewer runs than it was configured for is reported as **incomplete**, not averaged. A
partial cell silently averaged is how papers lie.

Prose: `SPEC.md` §12.4, §12.5.

---

## D12: Replay verification

How "the environment is deterministic" is proved rather than asserted.

```mermaid
sequenceDiagram
    autonumber
    participant U as Reader
    participant R as Replay
    participant K as Kernel
    participant T as Transcript

    U->>R: npm run replay -- run.jsonl
    R->>T: read the recorded commands
    R->>K: reduce(initial, command[1])
    K-->>R: state[1]
    R->>R: hash(state[1]) == recorded hash[1]?
    R->>K: reduce(state[1], command[2])
    K-->>R: state[2]
    R->>R: hash(state[2]) == recorded hash[2]?
    Note over R: every state must match
    R-->>U: exit 0 — the run is exactly reproducible
```

This is also the executable form of "one engine, three interfaces": the same command sequence must
produce the same hash chain through the human CLI, the browser client and the agent runner.

Prose: `SPEC.md` §13.2, §4.3.

---

## D13: The core data model

The types the kernel speaks, as a class diagram.

```mermaid
classDiagram
    class Adventure {
        +id
        +title
        +version
        +brief
        +rooms
        +objects
        +doors
        +actions
        +goals
        +hints
        +initial
    }

    class Room {
        +id
        +name
        +description
        +contents
        +exits
    }

    class GameObject {
        +id
        +name
        +aliases
        +description
        +detail
        +container
        +readable
    }

    class Door {
        +id
        +from
        +to
        +direction
        +label
        +locked
        +requiresAction
    }

    class ActionSpec {
        +verb
        +synonyms
        +args
        +requires
        +effects
        +text
    }

    class GameState {
        +roomId
        +inventory
        +objects
        +flags
        +turn
        +hintsLeft
        +status
    }

    class Observation {
        +turn
        +room
        +visible
        +inventory
        +exits
        +messages
        +goals
        +legalActions
    }

    class Command {
        +verb
        +args
        +raw
    }

    Adventure "1" *-- "many" Room
    Adventure "1" *-- "many" GameObject
    Adventure "1" *-- "many" Door
    Adventure "1" *-- "many" ActionSpec
    Adventure ..> GameState : initial
    GameState ..> Observation : built by
    Command ..> GameState : applied to
```

`Adventure` is data; `GameState` is a value; `Observation` is the *smaller* view of `GameState`.
The kernel never sees an `Observation` and the agent never sees a `GameState`.

Prose: `SPEC.md` §6.

---

## D14: How the build is ordered

The phases, and which experiment carries each one.

```mermaid
flowchart LR
    P0["P0 · Kernel"] --> P1["P1 · Adventure"]
    P1 --> P2["P2 · Human CLI"]
    P0 --> E2["E2 · What the agent sees"]
    P2 --> E3["E3 · The agent plays"]
    E2 --> E3
    E3 --> E4["E4 · Why it failed"]
    E4 --> E5["E5 · The matrix"]
    E5 --> P6["P6 · Results"]
    P5["P5 · Browser + server"]
    E5 --> E6["E6 · An organisation"]
    E6 --> P7["P7 · Generality probe"]
    P8["P8 · QuestJS comparison"]

    style P0 fill:#e8f0fe,stroke:#0969da
    style E3 fill:#e8f0fe,stroke:#0969da
    style E6 fill:#e8f0fe,stroke:#0969da
```

The critical edge is **E2 → E3**: the agent cannot be evaluated until you are certain it was never
told the answer. Everything after that is measurement.

Prose: `SPEC.md` §16, `experiments/README.md`.

---

## D15: Adventure → organisation

The mapping the whole project points at. The adventure vocabulary is not decoration; it is the
proposed model for an organisation, and Experiment 06 is where that claim gets tested.

```mermaid
flowchart LR
    subgraph adv["The adventure"]
        A1["Room"]
        A2["Object"]
        A3["Door"]
        A4["Flag"]
        A5["Goal"]
        A6["Observation"]
        A7["Command"]
        A8["Inventory"]
    end

    subgraph org["The organisation"]
        O1["Team · queue · system"]
        O2["Ticket · artefact · credential"]
        O3["Handoff · dependency · escalation"]
        O4["Ticket status · budget · SLA"]
        O5["Objective · KPI"]
        O6["Your dashboard: queue, blockers,<br/>standing instructions"]
        O7["A tool call: read a ticket, post,<br/>deploy"]
        O8["Working context · open threads"]
    end

    A1 --- O1
    A2 --- O2
    A3 --- O3
    A4 --- O4
    A5 --- O5
    A6 --- O6
    A7 --- O7
    A8 --- O8
```

**The one thing that does not carry over:** in the adventure, the agent can *read* the manual and
learn the rule. In an organisation, some rules are written down and some are not. And an agent
that cannot tell the difference is the failure mode we actually care about.

Prose: `SPEC.md` §18.

---

## D16: One engine, three interfaces

The property that makes a human transcript a valid comparison for an agent transcript.

```mermaid
flowchart TB
    subgraph iface["Interfaces"]
        H["Human at the terminal"]
        B["Browser"]
        A["Agent"]
    end

    H -->|"same commands"| E["The kernel<br/><i>one reducer, one rulebook</i>"]
    B -->|"same commands"| E
    A -->|"same commands"| E

    E --> TH["The same transcript format"]
    H -.->|"hash chain A"| TH
    B -.->|"hash chain B"| TH
    A -.->|"hash chain C"| TH

    TH --> CMP["Comparable by construction"]

    style E fill:#e8f0fe,stroke:#0969da
    style CMP fill:#dafbe1,stroke:#1a7f37
```

A human wins and the agent wins are then statements about the same world, measured the same way.

Prose: `SPEC.md` §4.3, §14.

---

## D17: Where the project goes next

From a text adventure to an organisation, and what each step costs.

```mermaid
flowchart LR
    G["GameState<br/><i>one room, one inventory</i>"]
    M["Multi-world<br/><i>several agents, one organisation</i>"]
    L["Live systems<br/><i>the organisation is real</i>"]

    G -->|"Phase 7 · Experiment 06<br/>teams as rooms, tickets as objects<br/><b>no kernel change</b>"| M
    M -->|"needs a stateful backend,<br/>permissions, approvals"| L

    G -.->|"Phase 8<br/>the same scenario on QuestJS"| Q["Is our engine<br/>the reason it works,<br/>or the scenario?"]

    style G fill:#e8f0fe,stroke:#0969da
    style M fill:#dafbe1,stroke:#1a7f37
```

Phase 8 is a **control on our own work**: if the same agent scores the same on QuestJS, then our
results are about the agent and the scenario, not about our engine's design choices.

Prose: `SPEC.md` §18, §16 Phase 7–8.
