# Browser client

Play the adventure through a plain TypeScript page backed by memory or HTTP sessions.

## Quick start

Run `npm run build:web` followed by `npm run serve`, then open `http://127.0.0.1:8787/`. Enter commands, use arrow-key history, or type `reset` to start again. The default session lives in browser memory.

For a server-held game, set the page configuration before loading index.js:

```html
<script>
  window.TEXT_ADVENTURE_CONFIG = { mode: 'http', adventureId: 'mission-impossible' };
</script>
<script src="./index.js"></script>
```

Set `baseUrl` to select another server origin. A static host can serve memory mode without the optional session server.

## API

| Module and export | Purpose |
| --- | --- |
| client.ts: openSession, SessionMode, OpenOptions | Choose the memory or HTTP session |
| ui.ts: createTerminal, Terminal, TerminalOptions, UiElement, UiInputElement, UiEvent, UiDocument | Render a session through an injectable document interface |
| index.ts: boot, RuntimeConfig | Configure and start the page |
| shims/node-crypto.ts: createHash | Synchronous hash adapter used by the kernel |

Output uses text content. Session errors remain visible and restore the command input. Run `npm test -- tests/web` and `npm run build:web`; UI tests play the gold path and verify history and reset. Hash tests compare the browser adapter with Node.
