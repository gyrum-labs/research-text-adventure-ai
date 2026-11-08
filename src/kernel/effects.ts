/*
 * Effect application. Every effect returns a NEW state, so the kernel never
 * mutates the state it was given. That is what makes a transition replayable.
 */

import type { Adventure, Effect, GameState, Id } from './types.js';

export interface EffectContext {
  adventure: Adventure;
  /** The state the effect is being applied to. */
  state: GameState;
  /** Resolved argument bindings: argument name -> object id (or raw text). */
  bindings: Record<string, string>;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    inventory: [...state.inventory],
    objects: { ...state.objects },
    flags: { ...state.flags },
  };
}

function cloneObject(state: GameState, id: Id): GameState {
  const object = state.objects[id];
  if (object === undefined) return state;
  state.objects[id] = {
    at: object.at,
    flags: { ...object.flags },
    state: { ...object.state },
  };
  return state;
}

export function applyEffect(effect: Effect, state: GameState, ctx: EffectContext): GameState {
  const next = cloneState(state);

  switch (effect.op) {
    case 'move_to':
      next.roomId = effect.room;
      return next;

    case 'set_flag':
      next.flags[effect.key] = effect.value;
      return next;

    case 'set_arg_flag': {
      const bound = ctx.bindings[effect.arg];
      if (bound === undefined) return next;
      cloneObject(next, bound);
      next.objects[bound]!.flags[effect.key] = effect.value;
      return next;
    }

    case 'set_arg_room': {
      const bound = ctx.bindings[effect.arg];
      if (bound === undefined) return next;
      cloneObject(next, bound);
      next.objects[bound]!.at = effect.room;
      return next;
    }

    case 'add_to_inventory': {
      const bound = ctx.bindings[effect.arg];
      if (bound === undefined) return next;
      if (!next.inventory.includes(bound)) next.inventory.push(bound);
      return next;
    }

    case 'remove_from_inventory': {
      const bound = ctx.bindings[effect.arg];
      if (bound === undefined) return next;
      next.inventory = next.inventory.filter((id) => id !== bound);
      return next;
    }

    case 'reveal_container': {
      const bound = ctx.bindings[effect.arg];
      if (bound === undefined) return next;
      const object = ctx.adventure.objects[bound];
      if (object === undefined || object.container === undefined) return next;
      cloneObject(next, bound);
      next.objects[bound]!.flags['closed'] = false;
      next.objects[bound]!.flags['open'] = true;
      for (const child of object.container.contains) {
        cloneObject(next, child);
        next.objects[child]!.at = ctx.state.roomId;
      }
      return next;
    }

    case 'set_arg_state': {
      const bound = ctx.bindings[effect.arg];
      if (bound === undefined) return next;
      cloneObject(next, bound);
      next.objects[bound]!.state[effect.key] = effect.value;
      return next;
    }

    case 'give_hint':
      if (next.hintsLeft > 0) next.hintsLeft -= 1;
      return next;

    case 'finish':
      next.status = effect.outcome === 'success' ? 'success' : 'failure';
      return next;
  }
}
