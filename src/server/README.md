# Optional demo server

Serve the browser bundle, hold human sessions, and stream bounded agent runs.

## Quick start

From the repository root:

```sh
npm run build:web
npm run serve
```

Open `http://127.0.0.1:8787/`. Choose **Watch an agent**, select a policy, and select **Start demo**.
The scripted and random demos make no model calls. A scripted reference run demonstrates the known solution;
the random agent demonstrates the same runner without that script.

For a different port, use `PORT=8788 npm run serve`. `HOST` defaults to `127.0.0.1` and
`STATIC_ROOT` defaults to `dist/web`. Sessions and run records live in process memory.

Command records carry `{ type: 'command', turn, raw }` before parsing and feedback, so invalid attempts remain visible. Only public actions are streamed.

## API

Import `createSessionServer`, `startSessionServer` and `SessionServerOptions` from `server.ts`.
The first creates an unbound Node server. The second listens and returns `{ server, url, close }`;
its default port is ephemeral, which keeps tests independent of existing servers.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Health, adventure identifiers and safe AI configuration, or `ai: null` |
| `GET /api/adventure/:id` | The public adventure brief |
| `POST /api/session` | Open a session with `{ adventureId }` |
| `GET /api/session/:id` | Read the session snapshot |
| `POST /api/session/:id/command` | Send `{ raw }` and receive a turn |
| `POST /api/session/:id/reset` | Reset the held session |
| `POST /api/runs` | Open a demo with `{ adventureId, policy, seed }` |
| `GET /api/runs/:id/stream` | Observations, messages, final outcome and end marker as SSE |
| `DELETE /api/runs/:id` | Cancel an AI run, including a pending start |

The stream includes the final observation, so completed goals remain visible. Late subscribers
receive recorded events before the live tail. Disconnecting a watcher leaves a free demo
running; disconnecting the last AI watcher cancels its model request. A missing world or session returns a JSON error; a world without a
scripted path returns 422, so use its random policy or inject `scriptedPathFor` when creating the server.

Run `npm test -- tests/server/routes.test.ts` for the route and stream contracts.

## Real AI demo

Set `OPENROUTER_API_KEY` in the server environment and select a model explicitly:

```sh
AI_DEMO_MODEL=deepseek/deepseek-chat npm run serve
```

Choose **AI agent** in Policy, then **Start AI run**. Loading the page, checking health,
and running free demos never call the model. Credentials stay on the server. The model
receives the public observation, rules and history through the existing LLM policy.

Each AI run allows at most 20 turns, 20,000 total tokens, 300 output tokens per request,
16,000 prompt bytes and 120 seconds. Only one AI run can be active. Before each request,
the server reserves a conservative input allowance and limits output to the remaining
token budget. Missing provider counts use conservative estimates. The browser shows
usage and an estimated cost when the dated price table contains the model.

**Stop AI run**, switching to Play, or closing the last stream aborts inference and
retries. An in-flight request may still be billed by the provider. Human play keeps its
own session. Creating a run does not start inference: opening its stream does. Unwatched
pending starts expire after 30 seconds. AI routes require a local host and same-origin requests.

Transcripts default to `runs/browser/<run-id>.jsonl`. Set `AI_DEMO_TRANSCRIPT_DIR` to
change the directory. They record model, seed, configuration, prompt hashes, responses,
commands, usage and final outcome. Replay one with `npm run replay -- <transcript-path>`.

For an embedded server:

```ts
import { createLiveAiDemo } from './live-ai.js';
import { startSessionServer } from './server.js';

await startSessionServer({
  liveAi: createLiveAiDemo({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: 'deepseek/deepseek-chat',
    budgets: { maxTurns: 5 },
  }),
});
```

| Export from `live-ai.ts` | Purpose |
| --- | --- |
| `createLiveAiDemo`, `LiveAiOptions` | Configure credentials, model, transcript directory and lower limits |
| `liveAiFromEnvironment` | Read server configuration; return undefined when key or model is absent |
| `LIVE_AI_BUDGETS` | Maximum run budgets; embeddings can lower them |
| `LiveAiDemo`, `LiveAiMetadata` | Factory and safe public model description |
| `LiveAiRun`, `LiveAiUsage` | Cancellation, transcript lifecycle and usage totals |

Invalid limits fail configuration. Missing AI configuration returns 503; concurrent AI
starts return 409; cross-origin AI requests return 403. Provider failures appear as a
failed run without a scripted fallback or credential details. The runner's
`RunBudgetExceeded` error stops a request before it exceeds a limit.

AI streams add `run_started` metadata and `usage` records to the existing command,
feedback and final-state events. Run `npm test -- tests/server/live-ai.test.ts
tests/runner/cancellation.test.ts tests/agents/cancellation.test.ts` for offline
provider, cancellation, replay and limit coverage.
