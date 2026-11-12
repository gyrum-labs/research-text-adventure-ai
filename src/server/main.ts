/*
 * The server's entry point.
 *
 * Serves the routes and, when the web client has been built, the page
 * itself, so `npm run build:web && npm run serve` is the whole deployment.
 */

import { startSessionServer } from './server.js';
import { liveAiFromEnvironment } from './live-ai.js';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';

const started = await startSessionServer({
  port,
  host,
  staticRoot: process.env.STATIC_ROOT ?? 'dist/web',
  liveAi: liveAiFromEnvironment(),
});

console.log(`listening on ${started.url}`);
console.log('sessions are held in memory; the page, when built, is served from dist/web');
