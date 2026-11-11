# Session ports

Hold one adventure behind the same asynchronous interface, in memory, in a file, or over HTTP.

## Quick start

From the repository root, run a session through every port:

```sh
npm test -- tests/session/ports.test.ts tests/equivalence.test.ts
```

```ts
import { InMemorySession } from './src/session/in-memory.js';
import { adventure } from './src/adventures/mission-impossible/adventure.js';

const session = new InMemorySession('example', adventure);
const turn = await session.send('take keycard');
console.log(turn.observation, turn.hash);
```

For persistence, construct `FileSession('example', adventure, 'sessions/example.json')`.
Opening the same file resumes its stored state, turn and hash. For a server-held game,
open `POST /api/session`, then construct `HttpSession(id, adventure, { baseUrl })`.

## API

| Export | Purpose |
| --- | --- |
| `Session` | The `send`, `snapshot` and `reset` contract, in `types.ts` |
| `SessionTurn`, `SessionSnapshot` | Command results and stored snapshots |
| `InMemorySession` | Holds state in the current process or browser |
| `FileSession` | Saves a snapshot after each command or reset |
| `HttpSession`, `HttpOptions`, `FetchLike` | Reach a server-held session with an injectable fetch |

Parsing and transitions stay in the kernel. Invalid commands return a message without advancing
the hash. File and HTTP errors reject the operation; callers should display or report the error.
A file snapshot is trusted local state. It is not a replacement for a replayable research transcript.
