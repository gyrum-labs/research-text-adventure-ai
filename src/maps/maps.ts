/*
 * The maps, as a library.
 *
 * A map of the flow and a map of every game, drawn from the repository's own
 * data: the adventures as they are defined, the experiments as they are
 * shipped, and the phases as the plan records them. Hand-drawn maps go stale
 * the moment an adventure changes, and a stale map is worse than no map,
 * because it is believed.
 *
 * The command that writes them is `scripts/generate-maps.ts`; the check is
 * `npm run maps:check`, which fails when the committed file no longer matches
 * what the data says.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ADVENTURES, goldPathFor } from '../adventures/index.js';

/** Where the generated file lives, relative to the repository root. */
export const OUTPUT = 'docs/MAPS.md';

/** A room, drawn as a node with its contents listed. */
function roomNode(id: string, name: string, contents: string[]): string {
  const inside = contents.length === 0 ? '' : `<br/>${contents.map((c) => c).join('<br/>')}`;
  return `${id}["${name}${inside}"]`;
}

/** The room graph of one world, as mermaid. */
function roomGraph(adventure: (typeof ADVENTURES)[string]): string {
  const lines: string[] = ['```mermaid', 'graph LR'];
  for (const room of Object.values(adventure.rooms)) {
    lines.push(`  ${roomNode(room.id, room.name, room.contents)}`);
  }
  for (const door of Object.values(adventure.doors)) {
    const label = door.locked === true ? `${door.label} (locked)` : door.label;
    lines.push(`  ${door.from} -->|${label}| ${door.to}`);
  }
  lines.push('```');
  return lines.join('\n');
}

/** The gold path as a chain of steps, as mermaid. */
function pathGraph(adventureId: string): string {
  const path = goldPathFor(adventureId);
  const lines: string[] = ['```mermaid', 'graph LR'];
  path.forEach((command, index) => {
    const id = `s${index + 1}`;
    const next = index + 1 < path.length ? `--> s${index + 2}` : '';
    lines.push(`  ${id}["${command}"]${next}`);
  });
  lines.push('```');
  return lines.join('\n');
}

/** The gold path as a table, so the reader can see the whole route. */
function pathTable(adventureId: string): string {
  const path = goldPathFor(adventureId);
  const rows = path.map((command, index) => `| ${index + 1} | \`${command}\` |`);
  return ['| # | Command |', '|---|---|', ...rows].join('\n');
}

/** The verbs one world answers to, as a table. */
function verbTable(adventure: (typeof ADVENTURES)[string]): string {
  const rows = adventure.actions.map((action) => {
    const synonyms = (action.synonyms ?? []).length === 0 ? '' : `, ${(action.synonyms ?? []).join(', ')}`;
    const args = action.args.map((arg) => arg.name).join(', ');
    return `| \`${action.verb}\` | ${synonyms} | ${args} |`;
  });
  return ['| Verb | Also | Takes |', '|---|---|---|', ...rows].join('\n');
}

/** The goals one world sets, as a table. */
function goalTable(adventure: (typeof ADVENTURES)[string]): string {
  const rows = adventure.goals.map((goal) => `| ${goal.id} | ${goal.text} |`);
  return ['| Goal | What it asks |', '|---|---|', ...rows].join('\n');
}

/** The phases the plan records, with the cards under each. */
export interface Phase {
  title: string;
  cards: string[];
}

/** Read the phase plan: the phases and the cards under them. */
function readPhases(root: string): Phase[] {
  const path = join(root, 'TASKS.md');
  if (!existsSync(path)) return [];
  const phases: Phase[] = [];
  let current: Phase | undefined;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const phase = /^## Phase (\d+): (.+)$/.exec(line);
    if (phase !== null) {
      current = { title: phase[2]!.trim(), cards: [] };
      phases.push(current);
      continue;
    }
    const card = /^### (T\d+\.\d+) (.+)$/.exec(line);
    if (card !== null && current !== undefined) {
      current.cards.push(`${card[1]} ${card[2]}`.trim());
    }
  }
  return phases;
}

/** The artefact directories the series has produced. */
function readArtefacts(root: string): string[] {
  const directory = join(root, 'results');
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry: string) => !entry.startsWith('.'))
    .sort();
}

/** The flow of the series, from the phase plan and the shipped artefacts. */
function flowGraph(phases: Phase[], artefacts: string[]): string {
  const lines: string[] = ['```mermaid', 'graph TD'];
  phases.forEach((phase, index) => {
    const id = `p${index + 1}`;
    lines.push(`  ${id}["${phase.title}"]`);
    phase.cards.forEach((card, cardIndex) => {
      const cardId = `${id}c${cardIndex + 1}`;
      lines.push(`  ${cardId}["${card}"]`);
      lines.push(`  ${id} --> ${cardId}`);
    });
  });
  artefacts.forEach((artefact, index) => {
    const id = `a${index + 1}`;
    lines.push(`  ${id}[("results/${artefact}")]`);
    if (index === 0) {
      const first = phases[0];
      if (first !== undefined) lines.push(`  p1 --> ${id}`);
    }
  });
  lines.push('```');
  return lines.join('\n');
}

/** The experiments the repository ships, read from their own directories. */
function experimentList(root: string): string[] {
  const directory = join(root, 'experiments');
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry: string) => entry.startsWith('exp-'))
    .sort();
}

/** The whole document. */
export function buildMaps(root: string = process.cwd()): string {
  const parts: string[] = [];

  parts.push('# The maps');
  parts.push('');
  parts.push(
    '<!-- GENERATED FILE: run `npm run maps` after changing an adventure, an experiment or the phase plan. `npm run maps:check` fails when this file no longer matches the data. -->',
  );
  parts.push('');
  parts.push(
    'Everything below is drawn from the repository: the rooms, doors, verbs and goals come from the adventure definitions, the gold paths come from the route each world ships, and the experiment list comes from the directories the series ships.',
  );
  parts.push('');

  const phases = readPhases(root);
  const artefacts = readArtefacts(root);
  parts.push('## The flow');
  parts.push('');
  parts.push(flowGraph(phases, artefacts));
  parts.push('');
  parts.push('The phases and their cards, as the plan records them:');
  parts.push('');
  for (const phase of phases) {
    parts.push(`### ${phase.title}`);
    parts.push('');
    for (const card of phase.cards) parts.push(`- ${card}`);
    parts.push('');
  }
  parts.push('The experiments, in the order the plan builds them:');
  parts.push('');
  for (const entry of experimentList(root)) parts.push(`- \`${entry}\``);
  parts.push('');
  parts.push('The artefacts the series has produced:');
  parts.push('');
  for (const artefact of artefacts) parts.push(`- \`results/${artefact}\``);
  parts.push('');

  for (const adventure of Object.values(ADVENTURES)) {
    const path = goldPathFor(adventure.id);
    parts.push(`## ${adventure.title}`);
    parts.push('');
    parts.push(
      `\`${adventure.id}\` · ${Object.keys(adventure.rooms).length} rooms · ${Object.keys(adventure.objects).length} objects · ${Object.keys(adventure.doors).length} doors · ${adventure.actions.length} verbs · ${path.length}-command gold path`,
    );
    parts.push('');
    parts.push(adventure.brief);
    parts.push('');
    parts.push('### The rooms');
    parts.push('');
    parts.push(roomGraph(adventure));
    parts.push('');
    parts.push('### The gold path');
    parts.push('');
    parts.push(pathGraph(adventure.id));
    parts.push('');
    parts.push(pathTable(adventure.id));
    parts.push('');
    parts.push('### The verbs');
    parts.push('');
    parts.push(verbTable(adventure));
    parts.push('');
    parts.push('### The goals');
    parts.push('');
    parts.push(goalTable(adventure));
    parts.push('');
  }

  // The document ends after the last line, with no blank line after it.
  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return `${parts.join('\n')}\n`;
}
