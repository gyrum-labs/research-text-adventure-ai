# Browser client

Play the adventure or watch the optional server's agent demo through a plain TypeScript page.

## Quick start

From the repository root, run `npm run build:web` followed by `npm run serve` and open
`http://127.0.0.1:8787/`. **Play** uses an in-memory session by default. Commands, arrow-key history
and `reset` use the same terminal in both session modes. **Watch an agent** opens the separate
demo view; **Stop watching** disconnects its stream and enables another run.

Set a runtime configuration before loading `index.js` to use a server-held game:

```html
<script>
  window.TEXT_ADVENTURE_CONFIG = {
    mode: 'http',
    adventureId: 'mission-impossible'
  };
</script>
<script src="./index.js"></script>
```

`baseUrl` optionally selects a server origin. The default is the page's own origin. A static host
can serve the in-memory game without the optional server; watching requires the demo server.

## API

| Module and export | Purpose |
| --- | --- |
| `client.ts`: `openSession`, `SessionMode`, `OpenOptions` | Choose the memory or HTTP port |
| `ui.ts`: `createTerminal`, `Terminal`, `TerminalOptions`, `UiElement`, `UiInputElement`, `UiEvent`, `UiDocument` | Render a session through a small document interface |
| `index.ts`: `boot`, `RuntimeConfig` | Wire the page to its runtime configuration |
| `watch.ts`: `watchAgent`, `WatchOptions`, `RunRecord` | Start a local demo and consume SSE records |
| `watch-view.ts`: `mountWatchView`, `WatchViewOptions` | Render records and manage start, stop and retry controls |
| `shims/node-crypto.ts`: `createHash` | The synchronous browser hash adapter used by the kernel |

The watcher shows each chosen action as `> command` before its feedback, including invalid attempts. Feedback appears once; observations omit the messages already shown by the stream. Rendering uses text content, so event text is displayed literally. Streams are decoded across
chunk and UTF-8 boundaries. A disconnect or malformed stream surfaces an error and leaves retry
available. An aborted older request cannot replace a newer run's view. Scripted and random
policies make no model calls; they are separate from the research matrix.

When the server has `OPENROUTER_API_KEY` and `AI_DEMO_MODEL`, Policy also offers an AI
agent. **Start AI run** explicitly starts model calls and shows the model, limits,
commands and usage. **Stop AI run** or switching to Play cancels inference and retries
without changing the human game. Cancellation uses an independent DELETE request;
cancelling a pending POST never opens its model stream. See the
[server setup](../server/README.md#real-ai-demo) for budgets and transcripts.

Run `npm test -- tests/web` and `npm run build:web`. The crypto tests compare the browser hash
adapter against Node, and the session equivalence tests compare complete command hash chains.
