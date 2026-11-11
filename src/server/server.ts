/*
 * The session server.
 *
 * A small HTTP server that holds games for whoever wants to play one: the
 * browser client, another process, or an agent whose run a human wants to
 * watch. The routes are the ones SPEC 14.3 names, plus the reset the
 * session interface needs and the run stream SPEC 14.4 names.
 *
 * There is no framework. The router is a list of patterns with :params,
 * because the whole surface is seven routes and a dependency would weigh
 * more than the code it replaced.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Adventure } from '../kernel/types.js';
import { buildObservation } from '../kernel/observation.js';
import { ADVENTURES } from '../adventures/index.js';
import { GOLD_PATH } from '../adventures/mission-impossible/gold-path.js';
import { InMemorySession } from '../session/in-memory.js';
import type { SessionTurn } from '../session/types.js';
import { ScriptedPolicy } from '../agents/scripted.js';
import { RandomPolicy } from '../agents/random.js';
import { run } from '../runner/run.js';

/** One streaming agent run the server is holding or has held. */
interface HeldRun {
  adventureId: string;
  records: Array<Record<string, unknown>>;
  finished: boolean;
  listeners: Set<(record: Record<string, unknown>) => void>;
}

export interface SessionServerOptions {
  /** The worlds a session can be opened against. Defaults to every shipped one. */
  adventures?: Record<string, Adventure>;
  /** The held sessions, injected so a test can look inside. */
  sessions?: Map<string, InMemorySession>;
  /** A directory of static files to serve, the built web client. */
  staticRoot?: string;
  /** Where scripted runs find their command list, by world. */
  scriptedPathFor?: (adventureId: string) => string[] | undefined;
}

/** A route pattern: method, segments with :params, and a handler. */
interface Route {
  method: string;
  segments: string[];
  handle(
    params: Record<string, string>,
    request: IncomingMessage,
    response: ServerResponse,
    state: ServerState,
  ): Promise<void> | void;
}

/** Everything the handlers share. */
interface ServerState {
  adventures: Record<string, Adventure>;
  sessions: Map<string, InMemorySession>;
  runs: Map<string, HeldRun>;
  staticRoot?: string;
  scriptedPathFor: (adventureId: string) => string[] | undefined;
}

const ROUTES: Route[] = [
  {
    method: 'GET',
    segments: ['api', 'health'],
    handle: async (_params, _request, response, state) => {
      json(response, 200, { ok: true, adventures: Object.keys(state.adventures) });
    },
  },
  {
    method: 'GET',
    segments: ['api', 'adventure', ':id'],
    handle: async (params, _request, response, state) => {
      const adventure = adventureIn(state, params['id']!);
      if (adventure === undefined) {
        json(response, 404, { error: `unknown adventure: ${params['id']}` });
        return;
      }
      json(response, 200, {
        id: adventure.id,
        title: adventure.title,
        version: adventure.version,
        brief: adventure.brief,
      });
    },
  },
  {
    method: 'POST',
    segments: ['api', 'session'],
    handle: async (_params, request, response, state) => {
      const body = (await readJson(request)) as { adventureId?: string };
      const adventure = adventureIn(state, body.adventureId ?? '');
      if (adventure === undefined) {
        json(response, 404, { error: `unknown adventure: ${body.adventureId ?? '(none)'}` });
        return;
      }
      const id = randomUUID();
      state.sessions.set(id, new InMemorySession(id, adventure));
      json(response, 201, { id, adventureId: adventure.id });
    },
  },
  {
    method: 'GET',
    segments: ['api', 'session', ':id'],
    handle: async (params, _request, response, state) => {
      const session = sessionIn(state, params['id']!, response);
      if (session === undefined) return;
      json(response, 200, await session.snapshot());
    },
  },
  {
    method: 'POST',
    segments: ['api', 'session', ':id', 'reset'],
    handle: async (params, _request, response, state) => {
      const session = sessionIn(state, params['id']!, response);
      if (session === undefined) return;
      json(response, 200, await session.reset());
    },
  },
  {
    method: 'POST',
    segments: ['api', 'session', ':id', 'command'],
    handle: async (params, request, response, state) => {
      const session = sessionIn(state, params['id']!, response);
      if (session === undefined) return;
      const body = (await readJson(request)) as { raw?: string };
      const turn: SessionTurn = await session.send(body.raw ?? '');
      json(response, 200, turn);
    },
  },
  {
    method: 'POST',
    segments: ['api', 'runs'],
    handle: async (_params, request, response, state) => {
      const body = (await readJson(request)) as {
        adventureId?: string;
        policy?: 'scripted' | 'random';
        seed?: number;
      };
      const adventure = adventureIn(state, body.adventureId ?? '');
      if (adventure === undefined) {
        json(response, 404, { error: `unknown adventure: ${body.adventureId ?? '(none)'}` });
        return;
      }
      const policy =
        body.policy === 'random'
          ? new RandomPolicy(adventure, body.seed ?? 1)
          : scriptedPolicyFor(state, adventure);
      if (policy === undefined) {
        json(response, 422, { error: `no scripted path for ${adventure.id}` });
        return;
      }
      const id = randomUUID();
      const held: HeldRun = {
        adventureId: adventure.id,
        records: [],
        finished: false,
        listeners: new Set(),
      };
      state.runs.set(id, held);

      // The run happens on its own; the stream endpoint reads it as it goes.
      void driveRun(held, adventure, policy);

      json(response, 201, { id, adventureId: adventure.id, policy: policy.id });
    },
  },
  {
    method: 'GET',
    segments: ['api', 'runs', ':id', 'stream'],
    handle: async (params, _request, response, state) => {
      const held = state.runs.get(params['id']!);
      if (held === undefined) {
        json(response, 404, { error: `unknown run: ${params['id']}` });
        return;
      }
      streamRun(held, response);
    },
  },
];

/** Run the policy, pushing each record to whoever is listening. */
async function driveRun(
  held: HeldRun,
  adventure: Adventure,
  policy: ScriptedPolicy | RandomPolicy,
): Promise<void> {
  const push = (record: Record<string, unknown>): void => {
    held.records.push(record);
    for (const listener of held.listeners) listener(record);
  };

  try {
    const result = await run({
      adventure,
      policy,
      maxTurns: 30,
      onObservation: (observation) => {
        push({ type: 'observation', turn: observation.turn, data: observation });
      },
      onMessage: (message) => {
        push({ type: 'message', text: message });
      },
      onCommand: (command) => {
        push({ type: 'command', ...command });
      },
    });
    push({ type: 'observation', turn: result.turns, data: buildObservation(adventure, result.state) });
    push({
      type: 'run_ended',
      data: { outcome: result.outcome, reason: result.reason, turns: result.turns, hash: result.hash },
    });
  } catch (error) {
    push({
      type: 'run_ended',
      data: { outcome: 'failure', reason: error instanceof Error ? error.message : 'the run crashed' },
    });
  } finally {
    held.finished = true;
    // The end marker is a record like the others, so a stream opened after
    // the run finished still terminates.
    push({ type: 'end' });
  }
}

/** Write the run's records to the response as server-sent events. */
function streamRun(held: HeldRun, response: ServerResponse): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  let queue: Array<Record<string, unknown>> = [];
  let flushing = false;

  const flush = (): void => {
    if (flushing) return;
    flushing = true;
    while (queue.length > 0) {
      const record = queue.shift()!;
      response.write(`data: ${JSON.stringify(record)}\n\n`);
      if (record['type'] === 'end') {
        response.end();
        held.listeners.delete(listener);
        return;
      }
    }
    flushing = false;
  };

  const listener = (record: Record<string, unknown>): void => {
    queue.push(record);
    flush();
  };

  // Everything already happened is replayed first, then the live tail.
  queue = [...held.records];
  held.listeners.add(listener);
  flush();
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text.length === 0 ? {} : JSON.parse(text);
}

function adventureIn(state: ServerState, id: string): Adventure | undefined {
  return state.adventures[id];
}

function sessionIn(
  state: ServerState,
  id: string,
  response: ServerResponse,
): InMemorySession | undefined {
  const session = state.sessions.get(id);
  if (session === undefined) {
    json(response, 404, { error: `unknown session: ${id}` });
  }
  return session;
}

function scriptedPolicyFor(
  state: ServerState,
  adventure: Adventure,
): ScriptedPolicy | undefined {
  const commands = state.scriptedPathFor(adventure.id);
  return commands === undefined ? undefined : new ScriptedPolicy(commands);
}

/** Serve a static file, refusing paths that try to leave the root. */
function serveStatic(root: string, pathname: string, response: ServerResponse): boolean {
  const relative = normalize(pathname).replace(/^([.][.][/\\])+/, '');
  const path = join(root, relative === '/' ? 'index.html' : relative);
  if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) return false;

  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };
  response.writeHead(200, {
    'content-type': types[extname(path)] ?? 'application/octet-stream',
  });
  createReadStream(path).pipe(response);
  return true;
}

/** Build the server. It is not listening until start() is called. */
export function createSessionServer(options: SessionServerOptions = {}): Server {
  const state: ServerState = {
    adventures: options.adventures ?? ADVENTURES,
    sessions: options.sessions ?? new Map(),
    runs: new Map(),
    staticRoot: options.staticRoot,
    scriptedPathFor:
      options.scriptedPathFor ?? ((id) => (id === 'mission-impossible' ? GOLD_PATH : undefined)),
  };

  return createServer((request, response) => {
    void handle(state, request, response);
  });
}

/** Match, dispatch, and never let a handler crash the socket. */
async function handle(
  state: ServerState,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);

  try {
    for (const route of ROUTES) {
      if (request.method !== route.method || route.segments.length !== segments.length) continue;
      const params: Record<string, string> = {};
      const matched = route.segments.every((pattern, index) => {
        if (pattern.startsWith(':')) {
          params[pattern.slice(1)] = segments[index]!;
          return true;
        }
        return pattern === segments[index];
      });
      if (!matched) continue;
      await route.handle(params, request, response, state);
      return;
    }

    if (
      request.method === 'GET' &&
      state.staticRoot !== undefined &&
      serveStatic(state.staticRoot, url.pathname, response)
    ) {
      return;
    }

    json(response, 404, { error: `no route: ${request.method} ${url.pathname}` });
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : 'the server failed' });
  }
}

/** Start the server on an ephemeral port and give the caller a way to stop it. */
export async function startSessionServer(
  options: SessionServerOptions & { port?: number; host?: string } = {},
): Promise<{ server: Server; url: string; close: () => Promise<void> }> {
  const server = createSessionServer(options);
  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  };
}
