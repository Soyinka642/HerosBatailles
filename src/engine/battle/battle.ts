// Boucle de bataille : arrivées par le portail, puis mouvement → tir → mêlée. Les conditions
// de fin sont vérifiées à la fin de chaque phase ; le rituel et maxTurns, à la fin du tour.

import type { Area, Cell, GameData, Id } from '../data/types';
import type { BattleEvent } from './events';
import { firePhase } from './fire';
import { meleePhase } from './melee';
import { movementPhase } from './movement';
import { type BattleSetup, createBattle, enemySquad } from './setup';
import { type BattleState, type Outcome, squadAt } from './state';

/** Rangées du portail dans l'ordre d'apparition : le centre, puis en alternant nord et sud. */
export function portalRows(area: Area): number[] {
  const center = Math.floor((area.fromRow + area.toRow) / 2);
  const rows = [center];
  for (let offset = 1; rows.length < area.toRow - area.fromRow + 1; offset++) {
    if (center - offset >= area.fromRow) rows.push(center - offset);
    if (center + offset <= area.toRow) rows.push(center + offset);
  }
  return rows;
}

/** Première case libre du portail : la rangée imposée d'abord, puis l'ordre de portalRows. */
function freePortalCell(data: GameData, state: BattleState, row: number | undefined): Cell | undefined {
  const area = data.battlefield.portal;
  const rows = portalRows(area);
  const ordered = row === undefined ? rows : [row, ...rows.filter((r) => r !== row)];
  for (const r of ordered) {
    for (let col = area.fromCol; col <= area.toCol; col++) {
      if (!squadAt(state, { col, row: r })) return { col, row: r };
    }
  }
  return undefined;
}

/** Les ennemis dont le tour est venu sortent du portail ; si tout est occupé, ils attendent. */
function arrivals(data: GameData, state: BattleState): BattleEvent[] {
  const events: BattleEvent[] = [];
  const due = state.pending.filter((p) => p.turn <= state.turn);
  for (const arrival of due) {
    const cell = freePortalCell(data, state, arrival.row);
    if (!cell) {
      events.push({ type: 'arrivalDelayed', squad: arrival.id });
      continue;
    }
    state.squads.push(enemySquad(data, arrival, cell));
    state.pending = state.pending.filter((p) => p !== arrival);
    events.push({ type: 'arrival', squad: arrival.id, cell });
  }
  state.squads.sort((a, b) => a.rank - b.rank);
  return events;
}

/** Fin de bataille après une phase : défaite si nous n'avons plus personne (même si l'ennemi non plus). */
function phaseOutcome(state: BattleState): Outcome | undefined {
  const active = state.squads.filter((s) => s.status === 'active');
  if (!active.some((s) => s.side === 'player')) return { kind: 'defeat', reason: 'allSquadsRouted' };
  if (state.pending.length === 0 && !active.some((s) => s.side === 'enemy')) return { kind: 'victory', reason: 'noEnemiesLeft' };
  return undefined;
}

/** Fin de bataille à la fin d'un tour : rituel tenu (bataille finale), ou maxTurns atteint. */
function turnOutcome(data: GameData, state: BattleState): Outcome | undefined {
  if (state.kind === 'final' && state.turn >= data.config.finalBattle.ritualTurns) return { kind: 'victory', reason: 'ritualHeld' };
  if (state.turn >= data.config.maxTurns) return { kind: 'undecided', reason: 'maxTurns' };
  return undefined;
}

function turnEnd(state: BattleState): BattleEvent {
  return {
    type: 'turnEnd',
    turn: state.turn,
    squads: state.squads
      .filter((s) => s.status === 'active')
      .map((s) => ({ id: s.id, cell: { ...s.cell }, morale: s.morale, maxMorale: s.stats.maxMorale, wounded: s.wounded })),
  };
}

const PHASES = [movementPhase, firePhase, meleePhase] as const;

/** Joue un tour sur une copie de l'état ; rend le nouvel état et les événements du tour. */
export function playTurn(data: GameData, previous: BattleState): { state: BattleState; events: BattleEvent[] } {
  if (previous.outcome) throw new Error('La bataille est terminée.');
  const state = structuredClone(previous);
  state.turn += 1;
  const events: BattleEvent[] = [{ type: 'turnStart', turn: state.turn }, ...arrivals(data, state)];
  for (const phase of PHASES) {
    events.push(...phase(data, state));
    state.outcome = phaseOutcome(state);
    if (state.outcome) break;
  }
  state.outcome ??= turnOutcome(data, state);
  events.push(turnEnd(state));
  if (state.outcome) events.push({ type: 'battleEnd', turn: state.turn, outcome: state.outcome, breaches: state.breaches });
  return { state, events };
}

export interface BattleResult {
  initial: BattleState;
  final: BattleState;
  events: BattleEvent[];
  outcome: Outcome;
  /** Structure finale de chaque fortification bâtie : ses dégâts persistent après la bataille. */
  fortifications: { site: Id; structure: number }[];
}

/** Joue toute la bataille ; même entrée, même résultat. */
export function runBattle(data: GameData, setup: BattleSetup): BattleResult {
  const initial = createBattle(data, setup);
  let state = initial;
  const events: BattleEvent[] = [];
  while (!state.outcome) {
    const turn = playTurn(data, state);
    state = turn.state;
    events.push(...turn.events);
  }
  const fortifications = state.fortifications.map((f) => ({ site: f.site, structure: f.structure }));
  return { initial, final: state, events, outcome: state.outcome, fortifications };
}
