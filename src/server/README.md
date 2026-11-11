# Optional demo server

Serve the browser bundle, hold human sessions, and stream bounded scripted or random agent runs.

## Quick start

From the repository root:

```sh
npm run serve
```

Check `http://127.0.0.1:8787/api/health` for available worlds. Open a human session with `POST /api/session` and `{ "adventureId": "mission-impossible" }`, then send a command to its command route. For an agent demo, use `POST /api/runs` with `{ "adventureId": "mission-impossible", "policy": "scripted" }`, then read the returned run's stream route. The demo makes no model calls. Browser controls follow in the browser integration slice.

For a different port, use `PORT=8788 npm run serve`. `HOST` defaults to `127.0.0.1` and
`STATIC_ROOT` defaults to `dist/web`. Sessions and run records live in process memory.

## API

Import `createSessionServer`, `startSessionServer` and `SessionServerOptions` from `server.ts`.
The first creates an unbound Node server. The second listens and returns `{ server, url, close }`;
its default port is ephemeral, which keeps tests independent of existing servers.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Health and adventure identifiers |
| `GET /api/adventure/:id` | The public adventure brief |
| `POST /api/session` | Open a session with `{ adventureId }` |
| `GET /api/session/:id` | Read the session snapshot |
| `POST /api/session/:id/command` | Send `{ raw }` and receive a turn |
| `POST /api/session/:id/reset` | Reset the held session |
| `POST /api/runs` | Open a demo with `{ adventureId, policy, seed }` |
| `GET /api/runs/:id/stream` | Observations, messages, final outcome and end marker as SSE |

Late subscribers receive recorded events before the live tail. Disconnecting a watcher leaves the bounded run
running on the server. A missing world or session returns a JSON error; a world without a
scripted path returns 422, so use its random policy or inject `scriptedPathFor` when creating the server.

Run `npm test -- tests/server/routes.test.ts` for the route and stream contracts.
