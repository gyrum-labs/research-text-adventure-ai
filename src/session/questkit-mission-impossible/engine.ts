/*
 * The QuestKit engine, headless.
 *
 * QuestKit is the maintained JavaScript toolkit of the Quest engine family
 * (MIT). Its compiler turns a world of YAML sections into the data the engine
 * runs on, and its engine is a set of plain JavaScript files that expect a
 * browser.
 *
 * This module loads that engine into a Node VM, gives it the smallest user
 * interface that can capture its output, and exposes two things: a way to
 * send a command, and a way to read the world's state afterwards. The
 * compilation of the sections is the same transformation the toolkit's own
 * compiler performs, written out here so the port can be read and tested
 * without a browser or a build step.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

/** The engine's own files, in the order the toolkit loads them. */
const CORE_FILES = [
  'core.js',
  'core.scopes.js',
  'core.parser.js',
  'core.descriptions.js',
  'core.commands.js',
  'en.js',
];

/** One section of a world, the shape the toolkit's compiler reads. */
export interface Section {
  /** The kind of thing this section declares. */
  type: 'game' | 'location' | 'object' | 'character' | 'exit' | 'command';
  /** The thing's name, which is how the world refers to it. */
  name: string;
  /** Everything else about it. */
  attributes?: Record<string, unknown>;
  /** The patterns a command matches, with `#slot#` placeholders. */
  patterns?: string[];
  /** The script a command runs when its pattern matches. */
  action?: string;
  /** A script that runs instead of a value, for an attribute. */
  script?: string;
}

/** One thing the world holds. */
export interface Thing {
  /** The world's name for it. */
  id: string;
  /** The name the world shows for it. */
  name: string;
  /** What it looks like. */
  description: string;
}

/** The engine's view of the world after a command. */
export interface EngineState {
  /** The room the player is in. */
  room: { id: string; name: string; description: string };
  /** The things in the room. */
  contents: Thing[];
  /** The things the player carries. */
  inventory: Thing[];
  /** The exits from the room, by direction or label. */
  exits: Array<{ label: string; to: string }>;
  /** Whether the player carries the given thing. */
  carries(id: string): boolean;
  /** Whether the world has the given flag set. */
  flag(name: string): boolean;
}

/** A running QuestKit world. */
export interface Engine {
  /** Send one command line and return everything the engine said. */
  send(command: string): string;
  /** Read the world as it stands. */
  state(): EngineState;
}

/** Where the toolkit lives, and the YAML and JavaScript it ships. */
interface Toolkit {
  directory: string;
  coreYaml: string;
  languageYaml: string;
  coreJs: string;
  templates: Record<string, unknown>;
  /** The built-in commands, as sections. */
  coreSections: Section[];
}

/** A YAML reader, taken from the toolkit's own dependency tree. */
interface Yaml {
  load(text: string): unknown;
  loadAll(text: string): unknown[];
}

/** A YAML reader, taken from the toolkit's own dependency tree. */
function yamlReader(): Yaml {
  const require = createRequire(import.meta.url);
  const toolkitPackage = require.resolve('questkit/package.json');
  const yamlPath = require.resolve('js-yaml', { paths: [dirname(toolkitPackage)] });
  const yaml = require(yamlPath) as Record<string, unknown>;

  // js-yaml v3 spells it safeLoad and safeLoadAll; v4 renamed them to load
  // and loadAll and removed the old names. The toolkit pins v3.
  const load = (yaml['safeLoad'] ?? yaml['load']) as (text: string) => unknown;
  const loadAll = (yaml['safeLoadAll'] ?? yaml['loadAll']) as (text: string) => unknown[];
  return { load, loadAll };
}

/** Parse a YAML document stream into plain objects. */
function parseDocuments(text: string): Array<Record<string, unknown>> {
  const yaml = yamlReader();
  const documents: Array<Record<string, unknown>> = [];
  for (const value of yaml.loadAll(text)) {
    if (value !== null && typeof value === 'object') documents.push(value as Record<string, unknown>);
  }
  return documents;
}

/** Load the toolkit: its engine, its language, and its built-in commands. */
function loadToolkit(): Toolkit {
  const require = createRequire(import.meta.url);
  const directory = dirname(require.resolve('questkit/package.json'));
  const coreJs = CORE_FILES.map((file) => readFileSync(join(directory, file), 'utf8')).join('\n');
  const coreYaml = readFileSync(join(directory, 'core.yaml'), 'utf8');
  const languageYaml = readFileSync(join(directory, 'en.yaml'), 'utf8');

  const yaml = yamlReader();
  const language = yaml.load(languageYaml) as {
    defaults?: Record<string, unknown>;
    [key: string]: unknown;
  };

  const sections: Section[] = [];
  for (const document of parseDocuments(coreYaml)) {
    const type = Object.keys(document)[0];
    if (type === undefined) continue;
    const value = document[type];

    // The toolkit's own YAML gives a command as `command: drop` with its
    // patterns and scripts beside it; our sections carry a name and a set of
    // attributes instead.
    if (typeof value === 'string') {
      const attributes: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(document)) {
        if (key !== type) attributes[key] = entry;
      }
      sections.push({
        type: type as Section['type'],
        name: value,
        attributes,
        patterns: resolvePatterns(attributes['patterns'], language),
        action: scriptOf(attributes['action']),
      });
      continue;
    }

    const attributes = { ...(value as Record<string, unknown>) };
    const name = typeof attributes['name'] === 'string' ? (attributes['name'] as string) : '';
    sections.push({
      type: type as Section['type'],
      name,
      attributes,
      patterns: resolvePatterns(attributes['patterns'], language),
      action: scriptOf(attributes['action']),
    });
  }

  return {
    directory,
    coreYaml,
    languageYaml,
    coreJs,
    templates: language.defaults ?? {},
    coreSections: sections,
  };
}

/** The patterns of a command, whether they were written out or named. */
function resolvePatterns(
  patterns: unknown,
  language: Record<string, unknown>,
): string[] | undefined {
  if (Array.isArray(patterns)) return patterns as string[];
  if (patterns !== null && typeof patterns === 'object') {
    const template = (patterns as { template?: unknown }).template;
    if (typeof template === 'string') {
      const named = language[template];
      if (Array.isArray(named)) return named as string[];
    }
  }
  return undefined;
}

/** The script inside an attribute, if it holds one. */
function scriptOf(attribute: unknown): string | undefined {
  if (attribute !== null && typeof attribute === 'object') {
    const script = (attribute as { script?: unknown }).script;
    if (typeof script === 'string') return script;
  }
  return undefined;
}

/** The argument names in a pattern, in order. */
function groupsOf(patterns: string[]): string[] {
  const groups: string[] = [];
  const matcher = /#(.*?)#/g;
  let match = matcher.exec(patterns[0] ?? '');
  while (match !== null) {
    groups.push(match[1] ?? '');
    match = matcher.exec(patterns[0] ?? '');
  }
  return groups;
}

/** The regular expressions for a command's patterns. */
function regexesOf(patterns: string[]): string[] {
  const matcher = /#(.*?)#/g;
  return patterns.map((pattern) => {
    const escaped = pattern.replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\./g, '\\.');
    return `/^${escaped.replace(matcher, '(.*?)')}$/`;
  });
}

/** The JavaScript that declares the world, the way the toolkit's compiler writes it. */
function worldSource(sections: Section[], templates: Record<string, unknown>): string {
  const lines: string[] = [];
  const objects: string[] = [];
  const commands: string[] = [];
  const exits: string[] = [];

  for (const section of sections) {
    if (section.type === 'game') {
      for (const [key, value] of Object.entries(section.attributes ?? {})) {
        lines.push(`set('${key}', ${JSON.stringify(value)});`);
      }
      continue;
    }

    if (section.type === 'command') {
      commands.push(section.name);
      const patterns = section.patterns ?? [];
      const groups = groupsOf(patterns);
      lines.push(`initData.regexes['${section.name}'] = {`);
      lines.push(`  patterns: [${regexesOf(patterns).join(', ')}],`);
      lines.push(`  groups: ${JSON.stringify(groups)}`);
      lines.push('};');
      if (section.action !== undefined) {
        lines.push(`initData.scripts['${section.name}.action'] = function (${groups.join(', ')}) {`);
        lines.push(section.action);
        lines.push('};');
      }
      // A command can carry other scripts too, such as the `multiple` script
      // that resolves "take keycard and cutters" into a list.
      for (const [key, value] of Object.entries(section.attributes ?? {})) {
        if (key === 'patterns' || key === 'action') continue;
        const script = scriptOf(value);
        if (script !== undefined) {
          lines.push(`initData.scripts['${section.name}.${key}'] = function () {`);
          lines.push(script);
          lines.push('};');
        }
      }
      continue;
    }

    if (section.type === 'exit') {
      exits.push(section.name);
    } else {
      objects.push(section.name);
    }

    for (const [key, value] of Object.entries(section.attributes ?? {})) {
      const script = scriptOf(value);
      if (script !== undefined) {
        lines.push(`initData.scripts['${section.name}.${key}'] = function () {`);
        lines.push(script);
        lines.push('};');
      } else {
        lines.push(`set('${section.name}.${key}', ${JSON.stringify(value)});`);
      }
    }
  }

  lines.push(`initData.objects = ${JSON.stringify(objects)};`);
  lines.push(`initData.commands = ${JSON.stringify(commands)};`);
  lines.push(`initData.exits = ${JSON.stringify(exits)};`);
  lines.push(`initData.templates = ${JSON.stringify(templates)};`);

  return lines.join('\n');
}

/** The name the engine shows for an object. */
function displayName(
  questkit: { get(a: string, b?: string): unknown },
  object: string,
): string {
  const alias = questkit.get(object, 'alias');
  if (typeof alias === 'string' && alias.length > 0) return alias;
  const name = questkit.get(object, 'name');
  return typeof name === 'string' && name.length > 0 ? name : object;
}

/** What the engine knows about one object. */
function thing(
  questkit: { get(a: string, b?: string): unknown },
  object: string,
): Thing {
  const description = questkit.get(object, 'description');
  return {
    id: object,
    name: displayName(questkit, object),
    description: typeof description === 'string' ? description : '',
  };
}

/**
 * The engine, running a world.
 *
 * The engine is loaded into its own context, so the world's scripts run
 * inside the engine's own closure where its helpers live, and the output
 * the engine produces is collected rather than printed.
 */
export function createEngine(world: Section[]): Engine {
  const toolkit = loadToolkit();
  // The game's commands come first, the way the toolkit's own compiler
  // writes them: when two patterns match equally, the game's own wins.
  const sections = [...world, ...toolkit.coreSections];
  const source = [
    '(function () {',
    toolkit.coreJs,
    'globalThis.__questkit = questkit;',
    worldSource(sections, toolkit.templates),
    'questkit.ui.init = function () {};',
    'questkit.ui.addText = function (text) { __output.push(text); };',
    'questkit.init(initData);',
    '})();',
  ].join('\n');

  const output: string[] = [];
  const context = createContext({
    console,
    __output: output,
    window: { localStorage: { getItem: () => null, setItem: () => undefined } },
    localStorage: { getItem: () => null, setItem: () => undefined },
    setTimeout,
    clearTimeout,
  });
  runInContext(source, context, { filename: 'questkit.js' });

  const questkit = context.__questkit as {
    handleCommand(input: string): void;
    get(a: string, b?: string): unknown;
    povParent(): string;
    getDirectChildren(location: string): string[];
    allObjects(): string[];
  };

  const state = (): EngineState => {
    const roomId = questkit.povParent();
    const description = (questkit.get(roomId, 'description') as string) ?? '';
    const name = displayName(questkit, roomId);
    const contents = questkit
      .getDirectChildren(roomId)
      .filter((child) => child !== 'player')
      .map((child) => thing(questkit, child));
    const carried = questkit
      .getDirectChildren('player')
      .map((child) => thing(questkit, child));
    const exits = questkit
      .getDirectChildren(roomId)
      .filter((child) => questkit.get(child, 'to') !== null)
      .map((child) => ({
        label: (questkit.get(child, 'alias') as string) ?? child,
        to: (questkit.get(child, 'to') as string) ?? '',
      }));

    return {
      room: { id: roomId, name, description },
      contents,
      inventory: carried,
      exits,
      carries: (id: string) =>
        questkit.getDirectChildren('player').some((child) => child === id),
      flag: (name: string) => questkit.get(name) === true,
    };
  };

  return {
    send(command: string): string {
      output.length = 0;
      questkit.handleCommand(command);
      return output.join('\n');
    },
    state,
  };
}
