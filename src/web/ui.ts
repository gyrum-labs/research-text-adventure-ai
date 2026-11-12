/*
 * The terminal.
 *
 * The whole of the web client's interface: an output pane, a command input
 * with history, a live log, and a status bar. It renders what the session
 * returns and sends what a human types. It holds no rules: nothing here
 * knows what a command means, only that a line was typed and a turn came
 * back.
 *
 * The document is passed in rather than imported, so a test can drive the
 * same code with a small stand-in for the DOM.
 */

import { buildObservation } from '../kernel/observation.js';
import { renderInventory, renderObservation } from '../kernel/render.js';
import type { Session } from '../session/types.js';

/** The parts of an element the terminal uses. */
export interface UiElement {
  readonly tagName: string;
  textContent: string | null;
  className: string;
  scrollTop: number;
  scrollHeight: number;
  appendChild(child: UiElement | Node): UiElement | Node;
  addEventListener(type: string, listener: (event: UiEvent) => void): void;
  focus(): void;
}

/** The input-specific surface, separate from containers and output panes. */
export interface UiInputElement extends UiElement {
  value: string;
  placeholder: string;
}

/** The parts of an event the terminal uses. */
export interface UiEvent {
  key?: string;
  preventDefault(): void;
}

/** The parts of the document the terminal uses. */
export interface UiDocument {
  createElement(tagName: 'input'): UiInputElement;
  createElement(tagName: string): UiElement;
}

/** The document, root and session used by one terminal. */
export interface TerminalOptions {
  document: UiDocument;
  root: UiElement;
  session: Session;
}

/** The terminal, once wired. */
export interface Terminal {
  /** Handle one command line as if it had been typed. */
  handleLine(raw: string): Promise<void>;
  /** The commands already sent, oldest first. */
  history(): string[];
  /** What the status bar currently says. */
  status(): { turn: number; goals: string; hash: string };
}

/** Build the terminal inside the root element and wire it to the session. */
export async function createTerminal(options: TerminalOptions): Promise<Terminal> {
  const { document: doc, root, session } = options;

  const output = doc.createElement('pre');
  output.className = 'output';
  const log = doc.createElement('pre');
  log.className = 'log';
  const input = doc.createElement('input');
  input.className = 'command';
  input.placeholder = 'type a command, or help';
  const status = doc.createElement('div');
  status.className = 'status';

  root.appendChild(output);
  root.appendChild(log);
  root.appendChild(input);
  root.appendChild(status);

  const history: string[] = [];
  let historyIndex = 0;
  let currentStatus = { turn: 0, goals: '', hash: '' };

  const print = (text: string): void => {
    output.textContent += `${text}\n`;
    output.scrollTop = output.scrollHeight;
  };

  const logLine = (text: string): void => {
    log.textContent += `${text}\n`;
    log.scrollTop = log.scrollHeight;
  };

  const setStatus = (turn: number, goals: string, hash: string): void => {
    currentStatus = { turn, goals, hash };
    status.textContent = `turn ${turn} · goals ${goals} · ${hash}`;
  };

  const renderState = async (): Promise<void> => {
    const snapshot = await session.snapshot();
    const observation = buildObservation(session.adventure, snapshot.state);
    print(renderObservation(observation));
    print(renderInventory(session.adventure, snapshot.state));
    const complete = observation.goals.filter((goal) => goal.status === 'complete').length;
    setStatus(snapshot.turn, `${complete}/${observation.goals.length}`, snapshot.hash);
  };

  const handleLine = async (raw: string): Promise<void> => {
    const line = raw.trim();
    if (line.length === 0) return;

    history.push(line);
    historyIndex = history.length;
    print(`> ${line}`);
    logLine(`send: ${line}`);

    if (line === 'reset') {
      await reset();
      return;
    }

    const turn = await session.send(line);
    const complete = turn.observation.goals.filter((goal) => goal.status === 'complete').length;
    setStatus(turn.turn, `${complete}/${turn.observation.goals.length}`, turn.hash);

    if (turn.message !== null) print(turn.message);
    for (const event of turn.events) {
      if (event.type === 'hint_given') print(`(${event.text})`);
    }

    const moved = turn.events.some((event) => event.type === 'action_succeeded');
    if (moved) {
      const after = await session.snapshot();
      print('');
      print(renderObservation(turn.observation));
      print(renderInventory(session.adventure, after.state));
    }

    logLine(`turn ${turn.turn} · ${turn.hash}`);

    if (turn.status !== 'running') {
      print('');
      print(
        turn.status === 'success'
          ? session.adventure.outcomeText.success
          : session.adventure.outcomeText.failure,
      );
      input.placeholder = 'the mission is over; type reset to play again';
      return;
    }
  };

  const reset = async (): Promise<void> => {
    await session.reset();
    output.textContent = '';
    print(session.adventure.brief);
    await renderState();
    input.placeholder = 'type a command, or help';
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      void handleLine(input.value).then(() => {
        input.value = '';
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (historyIndex === 0) return;
      historyIndex -= 1;
      input.value = history[historyIndex] ?? '';
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (historyIndex >= history.length - 1) {
        historyIndex = history.length;
        input.value = '';
        return;
      }
      historyIndex += 1;
      input.value = history[historyIndex] ?? '';
    }
  });

  print(session.adventure.brief);
  print('');
  await renderState();
  input.focus();

  return {
    handleLine,
    history: () => [...history],
    status: () => ({ ...currentStatus }),
  };
}
