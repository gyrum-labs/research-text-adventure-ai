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
import type { Adventure, GameState } from '../kernel/types.js';
import { ADVENTURES, findGoldPath } from '../adventures/index.js';
import { InMemorySession } from '../session/in-memory.js';
import type { SessionTurn } from '../session/types.js';
import { ScriptedPolicy } from '../agents/scripted.js';
import { RandomPolicy } from '../agents/random.js';
import type { LiveAiDemo, LiveAiMetadata } from './live-ai.js';
import { aiConfigured, aiOffers, aiStateFrom, driveRun, pendingModelRun, streamRun,
  type AiState, type HeldRun } from './ai-runs.js';
import type { RunResumeState } from '../runner/run.js';
import type { LiveAiUsage } from './live-ai.js';
import { SavedRunStore } from './saved-runs.js';

/** Dependencies and content for the optional session and demo server. */
export interface SessionServerOptions {
  /** Opt-in model configuration; absent by default and never serialized. */
  liveAi?: LiveAiDemo;
  /** Several configured models, one per entry the watcher can offer. */
  liveAis?: { demos: Map<string, LiveAiDemo>; models: LiveAiMetadata[] };
  /** The worlds a session can be opened against. Defaults to every shipped one. */
  adventures?: Record<string, Adventure>;
  /** The held sessions, injected so a test can look inside. */
  sessions?: Map<string, InMemorySession>;
  /** A directory of static files to serve, the built web client. */
  staticRoot?: string;
  /** Where scripted runs find their command list, by world. */
  scriptedPathFor?: (adventureId: string) => string[] | undefined;
  /** Where watched runs are kept. The default is `runs/watched`, next to the process. */
  savedRunsRoot?: string;
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
  /** The configured AI demos and the single active slot. Absent demos: no AI. */
  ai: AiState;
  /** A paused AI run: nothing runs, nothing spends, and it waits for its operator. */
  pausedAi?: PausedAi;
  adventures: Record<string, Adventure>;
  sessions: Map<string, InMemorySession>;
  runs: Map<string, HeldRun>;
  saved: SavedRunStore;
  staticRoot?: string;
  scriptedPathFor: (adventureId: string) => string[] | undefined;
}

/** A paused AI run and everything a resume continues from. */
interface PausedAi {
  id: string;
  adventure: Adventure;
  seed: number;
  /** The world as the pause left it. */
  world: GameState;
  /** The runner's bundle, to hand back to the continuation. */
  resume: RunResumeState;
  /** What the lineage has spent: turns, wall clock, and the policy's tokens. */
  turns: number;
  elapsedMs: number;
  tokens: { inputTokens: number; outputTokens: number };
  usage: LiveAiUsage;
}

const ROUTES: Route[] = [
  {
    method: 'GET',
    segments: ['api', 'health'],
    handle: async (_params, _request, response, state) => {
      json(response, 200, { ok: true, adventures: Object.keys(state.adventures),
        ai: state.ai.models[0] ?? null, aiModels: state.ai.models });
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
        policy?: 'scripted' | 'random' | 'llm';
        model?: string;
        seed?: number;
      };
      const requested = body.policy ?? 'scripted';
      if (!['scripted', 'random', 'llm'].includes(requested)) {
        json(response, 400, { error: 'unknown demo policy' });
        return;
      }
      if (requested === 'llm' && !localModelRequest(request)) {
        json(response, 403, { error: 'AI demos require a same-origin local request.' });
        return;
      }
      if (requested === 'llm' && !aiConfigured(state.ai)) {
        json(response, 503, { error: 'AI is not configured on this server.' });
        return;
      }
      if (requested === 'llm' && body.model !== undefined && !aiOffers(state.ai, body.model)) {
        json(response, 400, { error: `this server does not offer ${body.model}.` });
        return;
      }
      if (requested === 'llm' && state.ai.activeAiId !== undefined) {
        json(response, 409, { error: 'An AI run is already active. Stop it before starting another.' });
        return;
      }
      const adventure = adventureIn(state, body.adventureId ?? '');
      if (adventure === undefined) {
        json(response, 404, { error: `unknown adventure: ${body.adventureId ?? '(none)'}` });
        return;
      }
      if (requested === 'llm') {
        const id = randomUUID();
        const seed = body.seed ?? 1;
        const demo = body.model === undefined ? undefined : state.ai.demos?.get(body.model);
        state.runs.set(id, pendingModelRun({ id, adventure, seed,
          runs: state.runs, ai: state.ai, saved: state.saved, demo,
          onPaused: paused => {
            state.pausedAi = {
              id: paused.id, adventure, seed,
              world: paused.world, resume: paused.resume, turns: paused.turns,
              elapsedMs: paused.elapsedMs, tokens: paused.tokens, usage: paused.usage,
            };
          },
        }));
        json(response, 201, { id, adventureId: adventure.id, policy: 'llm' });
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
        id,
        adventureId: adventure.id,
        seed: 1,
        records: [],
        finished: false,
        listeners: new Set(),
      };
      state.runs.set(id, held);

      // The run happens on its own; the stream endpoint reads it as it goes.
      void driveRun(held, adventure, policy, state.saved);

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
      if (held.metadata !== undefined && !localModelRequest(_request)) {
        json(response, 403, { error: 'AI demos require a same-origin local request.' });
        return;
      }
      if (held.start !== undefined && !held.start()) {
        json(response, 409, { error: 'An AI run is already active. Stop it before starting another.' });
        return;
      }
      streamRun(held, response);
    },
  },

  {
    method: 'GET',
    segments: ['api', 'runs', 'saved'],
    handle: async (_params, _request, response, state) => {
      json(response, 200, { runs: state.saved.list() });
    },
  },
  {
    method: 'GET',
    segments: ['api', 'runs', 'saved', ':id'],
    handle: async (params, _request, response, state) => {
      const saved = state.saved.open(params['id']!);
      if (saved === null) {
        json(response, 404, { error: `unknown saved run: ${params['id']}` });
        return;
      }
      json(response, 200, saved);
    },
  },
  {
    method: 'POST',
    segments: ['api', 'runs', 'saved', ':id', 'replay'],
    handle: async (params, _request, response, state) => {
      const replay = state.saved.replay(params['id']!);
      if (replay === null) {
        json(response, 404, { error: `unknown saved run: ${params['id']}` });
        return;
      }
      if (replay.error !== undefined) {
        json(response, 422, { error: replay.error });
        return;
      }
      json(response, 200, replay);
    },
  },
  {
    method: 'DELETE', segments: ['api', 'runs', ':id'],
    handle: async (params, request, response, state) => {
      if (!localModelRequest(request)) { json(response, 403, { error: 'A local request is required.' }); return; }
      // Stopping a paused run discards it: that is what stopping means.
      if (state.pausedAi?.id === params['id']) state.pausedAi = undefined;
      state.runs.get(params['id']!)?.cancel?.();
      json(response, 200, { stopped: true });
    },
  },
  {
    method: 'POST', segments: ['api', 'runs', ':id', 'pause'],
    handle: async (params, request, response, state) => {
      if (!localModelRequest(request)) { json(response, 403, { error: 'A local request is required.' }); return; }
      const held = state.runs.get(params['id']!);
      if (held === undefined || held.live === undefined || state.ai.activeAiId !== held.id) {
        json(response, 409, { error: 'Only a running AI run can be paused. A paused run is already holding still.' });
        return;
      }
      held.live.pause();
      json(response, 200, { pausing: true });
    },
  },
  {
    method: 'POST', segments: ['api', 'runs', ':id', 'resume'],
    handle: async (params, request, response, state) => {
      if (!localModelRequest(request)) { json(response, 403, { error: 'A local request is required.' }); return; }
      if (state.pausedAi === undefined || state.pausedAi.id !== params['id']) {
        json(response, 404, { error: 'No paused run with this id. A paused run waits only in this server; stopping or a restart lets it go.' });
        return;
      }
      if (state.ai.activeAiId !== undefined) {
        json(response, 409, { error: 'An AI run is already active. It must end before the paused one resumes.' });
        return;
      }
      const paused = state.pausedAi;
      state.pausedAi = undefined;
      state.runs.set(params['id']!, pendingModelRun({
        id: params['id']!, adventure: paused.adventure, seed: paused.seed,
        runs: state.runs, ai: state.ai, saved: state.saved,
        continuation: { world: paused.world, resume: paused.resume, turns: paused.turns,
          elapsedMs: paused.elapsedMs, tokens: paused.tokens },
      }));
      json(response, 201, { id: paused.id, adventureId: paused.adventure.id, resumed: true });
    },
  },
];

function localModelRequest(request: IncomingMessage): boolean {
  try {
    const host = new URL(`http://${request.headers.host ?? ''}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)) return false;
    const site = request.headers['sec-fetch-site'];
    if (site !== undefined && site !== 'same-origin' && site !== 'none') return false;
    return request.headers.origin === undefined || request.headers.origin === host.origin;
  } catch { return false; }
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
    ai: aiStateFrom(options),
    adventures: options.adventures ?? ADVENTURES,
    sessions: options.sessions ?? new Map(),
    runs: new Map(),
    saved: new SavedRunStore(options.savedRunsRoot ?? join(process.cwd(), 'runs', 'watched')),
    staticRoot: options.staticRoot,
    scriptedPathFor: options.scriptedPathFor ?? findGoldPath,
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
