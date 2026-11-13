/*
 * A DOM stand-in.
 *
 * The browser client is written against a small part of the DOM, so a test
 * can drive the same code the page runs without a browser. This is that
 * part: elements, a tree, and the handful of selectors the client uses.
 *
 * The stand-in is deliberately literal. It implements what the client calls
 * and nothing more, so a test that passes here is a test about the client's
 * own behaviour rather than about a browser's.
 */

/** The parts of an event the client handles. */
export interface StubEvent {
  key?: string;
  preventDefault(): void;
}

type Listener = (event: StubEvent) => void;

/** An element that records what was done to it, and nothing else. */
export class StubElement {
  readonly tagName: string;
  value = '';
  placeholder = '';
  disabled = false;
  hidden = false;
  className = '';
  children: StubElement[] = [];
  scrollTop = 0;
  scrollHeight = 0;
  private text = '';
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Listener[]>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  /** Setting the text replaces the children, as it does in the DOM. */
  get textContent(): string {
    return this.text;
  }

  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }

  appendChild(child: StubElement): StubElement {
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, existing.filter(candidate => candidate !== listener));
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  focus(): void {
    /* the stand-in has nowhere to put the caret */
  }

  /** Deliver an event the way a browser would. */
  fire(type: string, event?: StubEvent): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event ?? { preventDefault: () => undefined });
    }
  }

  querySelector<T extends StubElement>(selector: string): T | null {
    for (const child of this.children) {
      if (matches(child, selector)) return child as T;
      const found = child.querySelector<T>(selector);
      if (found !== null) return found;
    }
    return null;
  }
}

function matches(node: StubElement, selector: string): boolean {
  if (selector.startsWith('#')) return node.getAttribute('id') === selector.slice(1);
  if (selector.startsWith('.')) return node.className.split(/\s+/).includes(selector.slice(1));
  const attribute = /^([a-zA-Z]+)\[([a-zA-Z-]+)="([^"]*)"\]$/.exec(selector);
  if (attribute !== null) {
    const [, tag, name, value] = attribute;
    return node.tagName.toLowerCase() === tag!.toLowerCase() && node.getAttribute(name!) === value;
  }
  return node.tagName.toLowerCase() === selector.toLowerCase();
}

/** A document that holds a tree of stand-in elements. */
export class StubDocument {
  hidden = false;
  readonly body = new StubElement('body');
  private readonly listeners = new Map<string, Listener[]>();

  createElement(tagName: string): StubElement {
    return new StubElement(tagName);
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  querySelector<T extends StubElement>(selector: string): T | null {
    if (matches(this.body, selector)) return this.body as T;
    return this.body.querySelector<T>(selector);
  }

  /** Deliver an event on the document, the way a browser would. */
  fire(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener({ preventDefault: () => undefined });
    }
  }
}

/** An element with an id, for the parts of a page the client looks up. */
export function stub(id: string, tagName = 'div'): StubElement {
  const element = new StubElement(tagName);
  element.setAttribute('id', id);
  return element;
}

/** An element with a class name, for the parts of a page the client looks up. */
export function classed(className: string, tagName = 'div'): StubElement {
  const element = new StubElement(tagName);
  element.className = className;
  return element;
}
