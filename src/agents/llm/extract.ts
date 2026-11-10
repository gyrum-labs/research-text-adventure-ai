/*
 * The extraction chain.
 *
 * A model response is text. The command inside it has to be found without
 * guessing, so the search is a fixed ladder and the rung that worked is
 * recorded. That way formatting drift shows up as a metric rather than as a
 * mystery.
 *
 * The chain never repairs a command. If the model said "take the keycard",
 * the kernel may resolve "the keycard" through the adventure's own alias
 * table, because that table is declared and public. Nothing else is helped
 * along.
 */

export type ExtractionRoute = 'command_line' | 'last_line' | 'first_line' | 'none';

export interface Extraction {
  /** The command, or null when the response held none. */
  command: string | null;
  /** Which rung of the ladder produced it. */
  route: ExtractionRoute;
}

const COMMAND_LINE = /^COMMAND\s*:\s*(.*)$/i;

/**
 * The lines of a response, cleaned.
 *
 * Prompt characters and code fences are stripped, because a model that wraps
 * its answer in a fence still answered the question.
 */
function cleanLines(text: string): string[] {
  const lines: string[] = [];

  for (const raw of text.split('\n')) {
    const line = raw
      .replace(/^\s*[>›»]+\s*/, '')
      .replace(/^\s*```+\s*/, '')
      .replace(/\s*```+\s*$/, '')
      .trim();
    if (line.length === 0) continue;
    if (/^```+$/.test(line)) continue;
    lines.push(line);
  }

  return lines;
}

/**
 * Find the command in a response.
 *
 * `canParse` decides whether a candidate is a command the kernel would accept.
 * It is used for the two fallback rungs only: a `COMMAND:` line is taken as
 * written, so that a wrong command reaches the parser and the agent gets the
 * error and a chance to correct itself.
 */
export function extractCommand(
  text: string,
  canParse: (candidate: string) => boolean,
): Extraction {
  const lines = cleanLines(text);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index]!.match(COMMAND_LINE);
    if (match === null) continue;
    const command = match[1]!.trim();
    if (command.length === 0) continue;
    return { command, route: 'command_line' };
  }

  const last = lines[lines.length - 1];
  if (last !== undefined && canParse(last)) {
    return { command: last, route: 'last_line' };
  }

  const first = lines[0];
  if (first !== undefined && canParse(first)) {
    return { command: first, route: 'first_line' };
  }

  return { command: null, route: 'none' };
}
