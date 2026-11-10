// Static publication adapter; the viewer keeps rendering and query policy.
const SHARD_BYTES = 786432;
const ARTIFACT_BYTES = 1048576;
const FETCH_CONCURRENCY = 2;
const PREFIX_CHARACTERS = 50000;
const LEAF = /^_search\.([a-f0-9]{64})\.json$/;

function requireValid(condition) {
  if (!condition) throw new Error("invalid documentation search publication");
}

function shape(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === fields;
}

async function bytes(path, maximum) {
  const response = await fetch(path);
  requireValid(response.ok);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      requireValid(false);
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function decoded(raw) {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
}

function expectedPaths(nodes, found = new Set()) {
  for (const node of nodes) {
    if (node.type === "file") {
      requireValid(typeof node.path === "string" && !found.has(node.path));
      found.add(node.path);
    } else if (node.children) expectedPaths(node.children, found);
  }
  return found;
}

function complete(entries, paths) {
  requireValid(Array.isArray(entries) && entries.length === paths.size);
  const seen = new Set();
  for (const entry of entries) {
    requireValid(shape(entry, "path,text") && typeof entry.text === "string" && paths.has(entry.path) && !seen.has(entry.path));
    seen.add(entry.path);
  }
  return entries;
}

function manifest(value, paths) {
  requireValid(shape(value, "documents,shards,version") && value.version === 1 && value.documents === paths.size && Array.isArray(value.shards));
  let count = 0;
  const seen = new Set();
  for (const shard of value.shards) {
    requireValid(shape(shard, "documents,path,sha256") && typeof shard.path === "string");
    const match = LEAF.exec(shard.path);
    requireValid(match && match[1] === shard.sha256 && !seen.has(shard.path) && Number.isSafeInteger(shard.documents) && shard.documents > 0);
    seen.add(shard.path);
    count += shard.documents;
  }
  requireValid(count === value.documents);
  return value.shards;
}

async function shardEntries(record) {
  const raw = await bytes(record.path, SHARD_BYTES);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", raw));
  const actual = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
  requireValid(actual === record.sha256);
  const values = decoded(raw);
  requireValid(Array.isArray(values) && values.length === record.documents);
  return values;
}

async function readShards(records) {
  const results = new Array(records.length);
  let next = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < records.length) {
      const index = next++;
      try { results[index] = await shardEntries(records[index]); }
      catch (error) { failed = true; throw error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, records.length) }, worker));
  return results.flat();
}

// loadSearchIndex validates the whole bounded publication against the actual
// document tree before the caller can expose any full-text results.
export async function loadSearchIndex(tree) {
  const paths = expectedPaths(tree);
  // pydocs serves legacy arrays in memory. Bound them by the known inventory
  // and source prefix, allowing worst-case JSON escaping without a file gate.
  const legacyBudget = ARTIFACT_BYTES + Array.from(paths).reduce(
    (size, path) => size + 12 * PREFIX_CHARACTERS + 6 * path.length + 100, 0);
  const raw = await bytes("_search.json", legacyBudget);
  const data = decoded(raw);
  if (Array.isArray(data)) return complete(data, paths);
  requireValid(raw.byteLength <= ARTIFACT_BYTES);
  return complete(await readShards(manifest(data, paths)), paths);
}
