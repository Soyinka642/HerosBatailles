// Phase de mouvement, résolue par pas simultanés : au pas k, toutes les escouades de vitesse ≥ k
// qui bougent encore choisissent leur case d'après les positions du début du pas, puis des
// règles fixes tranchent les conflits. Une escouade contrariée s'arrête pour la fin du tour
// (réaction par défaut) et reprend sa posture au tour suivant.
//
// Une palissade debout barre le passage des deux camps ; la tour se traverse.
// Une escouade en déroute fuit vers son camp, sans être retenue par le contact.

import type { Area, Cell, GameData } from '../data/types';
import type { BattleEvent, BlockReason, HaltReason, MoveWhy } from './events';
import { barrierAt, occupiedFortification } from './fortifications';
import { type Direction, ahead, behind, isOnField, neighbor, sameCell } from './hex';
import { type BattleSquad, type BattleState, isOnField as onField, isShooter, squadAt } from './state';
import { adjacentEnemies, enemyAheadOnRow, nearestEnemy, rangedTarget, stepToward } from './targeting';

export type Intent =
  /** Rien à faire à ce pas : Tenir, plan terminé, bord du terrain. */
  | { kind: 'none' }
  /** « wait » d'un tour planifié : reste sur place et continue au pas suivant. */
  | { kind: 'wait' }
  | { kind: 'halt'; reason: HaltReason }
  | { kind: 'move'; to: Cell; why: MoveWhy };

function engagedHalt(state: BattleState, squad: BattleSquad): Intent | undefined {
  const enemy = adjacentEnemies(state, squad)[0];
  return enemy ? { kind: 'halt', reason: { kind: 'engaged', by: enemy.id } } : undefined;
}

function plannedIntent(state: BattleState, squad: BattleSquad, step: number): Intent | undefined {
  const plan = squad.plannedTurns[state.turn - 1];
  if (!plan) return undefined;
  const planned = plan.steps[step - 1];
  if (planned === undefined) return { kind: 'none' };
  const halt = engagedHalt(state, squad);
  if (halt) return halt;
  return planned === 'wait' ? { kind: 'wait' } : { kind: 'move', to: planned, why: { kind: 'planned' } };
}

/** Arrêts communs à Avancer et Assaut : au contact d'un ennemi, ou tireur avec une cible à portée. */
function postureHalt(data: GameData, state: BattleState, squad: BattleSquad): Intent | undefined {
  const halt = engagedHalt(state, squad);
  if (halt) return halt;
  if (!isShooter(squad)) return undefined;
  const target = rangedTarget(data, state, squad);
  return target ? { kind: 'halt', reason: { kind: 'targetInRange', target: target.id } } : undefined;
}

function straightIntent(data: GameData, squad: BattleSquad): Intent {
  const to = ahead(squad.cell, squad.side);
  return isOnField(data.battlefield, to) ? { kind: 'move', to, why: { kind: 'straight' } } : { kind: 'none' };
}

/** Avancer : tout droit tant qu'un ennemi est devant sur sa rangée (ou qu'il n'y a aucun ennemi), sinon vers le plus proche. */
function advanceIntent(data: GameData, state: BattleState, squad: BattleSquad): Intent {
  const halt = postureHalt(data, state, squad);
  if (halt) return halt;
  const nearest = nearestEnemy(state, squad);
  if (!nearest || enemyAheadOnRow(state, squad)) return straightIntent(data, squad);
  return { kind: 'move', to: stepToward(data.battlefield, squad.cell, nearest.cell), why: { kind: 'deviate', toward: nearest.id } };
}

/** Assaut : tout droit sur sa rangée vers le camp adverse, sans jamais dévier. Un tireur reste dans la tour où il est entré. */
function assaultIntent(data: GameData, state: BattleState, squad: BattleSquad): Intent {
  const halt = postureHalt(data, state, squad);
  if (halt) return halt;
  if (isShooter(squad) && occupiedFortification(data, state, squad)) return { kind: 'none' };
  return straightIntent(data, squad);
}

/** Diagonales arrière, nord puis sud : vers l'ouest pour nous, vers l'est pour l'ennemi. */
const BACK_DIAGONALS: Record<BattleSquad['side'], readonly Direction[]> = { player: ['NW', 'SW'], enemy: ['NE', 'SE'] };

/**
 * Fuite en déroute : tout droit vers son camp ; si la case droit derrière est prise (escouade ou
 * palissade) au début du pas, la diagonale arrière nord, puis sud ; sinon elle reste sur place.
 */
function fleeIntent(data: GameData, state: BattleState, squad: BattleSquad): Intent {
  const candidates = [behind(squad.cell, squad.side), ...BACK_DIAGONALS[squad.side].map((d) => neighbor(squad.cell, d))];
  const free = candidates.find((cell) => isOnField(data.battlefield, cell) && !squadAt(state, cell) && !barrierAt(data, state, cell));
  return free ? { kind: 'move', to: free, why: { kind: 'flee' } } : { kind: 'none' };
}

/** Ce que veut faire une escouade au pas `step`, d'après les positions du début du pas. */
export function intentFor(data: GameData, state: BattleState, squad: BattleSquad, step: number): Intent {
  if (squad.stats.speed < step) return { kind: 'none' };
  if (squad.status === 'fleeing') return fleeIntent(data, state, squad);
  const planned = plannedIntent(state, squad, step);
  if (planned) return planned;
  switch (squad.movement) {
    case 'advance':
      return advanceIntent(data, state, squad);
    case 'assault':
      return assaultIntent(data, state, squad);
    case 'hold':
      return { kind: 'none' };
  }
}

export interface MoveRequest {
  squad: BattleSquad;
  to: Cell;
}

/**
 * Tranche les déplacements d'un pas, dans l'ordre fixé par la conception :
 * case tenue par une escouade immobile, puis cycles (échanges, rotations), puis conflits de
 * case (la plus rapide, puis la première déployée), puis chaînes, répétées jusqu'à stabilité.
 * Une barrière debout (palissade) compte comme une case tenue.
 * Rend, pour chaque escouade qui voulait bouger, la raison de son blocage (absente = elle bouge).
 */
export function resolveStep(data: GameData, state: BattleState, requests: readonly MoveRequest[]): Record<string, BlockReason | undefined> {
  const blocked: Record<string, BlockReason | undefined> = {};
  const moverAt = (cell: Cell) => requests.find((r) => sameCell(r.squad.cell, cell));

  for (const r of requests) {
    const barrier = barrierAt(data, state, r.to);
    if (barrier) {
      blocked[r.squad.id] = { kind: 'fortification', site: barrier.site };
      continue;
    }
    const occupant = squadAt(state, r.to);
    if (occupant && !moverAt(r.to)) blocked[r.squad.id] = { kind: 'occupied', by: occupant.id };
  }

  for (const r of requests) {
    if (blocked[r.squad.id]) continue;
    const cycle = cycleFrom(r, moverAt, blocked);
    if (cycle) {
      for (const member of cycle) {
        blocked[member.squad.id] = { kind: 'cycle', with: cycle.filter((m) => m !== member).map((m) => m.squad.id) };
      }
    }
  }

  for (const r of requests) {
    if (blocked[r.squad.id]) continue;
    const rivals = requests
      .filter((other) => !blocked[other.squad.id] && sameCell(other.to, r.to))
      .sort((a, b) => b.squad.stats.speed - a.squad.stats.speed || a.squad.rank - b.squad.rank);
    const winner = rivals[0]!;
    for (const loser of rivals.slice(1)) {
      const why = loser.squad.stats.speed < winner.squad.stats.speed ? 'faster' : 'deployedFirst';
      blocked[loser.squad.id] = { kind: 'conflict', winner: winner.squad.id, why };
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const r of requests) {
      if (blocked[r.squad.id]) continue;
      const ahead = moverAt(r.to);
      if (ahead && blocked[ahead.squad.id]) {
        blocked[r.squad.id] = { kind: 'chain', ahead: ahead.squad.id };
        changed = true;
      }
    }
  }
  return blocked;
}

/** Le cycle qui part de `start` (chacun vise la case du suivant), s'il existe. */
function cycleFrom(
  start: MoveRequest,
  moverAt: (cell: Cell) => MoveRequest | undefined,
  blocked: Record<string, BlockReason | undefined>,
): MoveRequest[] | undefined {
  const path: MoveRequest[] = [start];
  let current = moverAt(start.to);
  while (current && !blocked[current.squad.id]) {
    if (current === start) return path;
    if (path.includes(current)) return undefined;
    path.push(current);
    current = moverAt(current.to);
  }
  return undefined;
}

function inArea(area: Area, cell: Cell): boolean {
  return cell.col >= area.fromCol && cell.col <= area.toCol && cell.row >= area.fromRow && cell.row <= area.toRow;
}

/** Un ennemi qui entre dans le cœur du campement quitte la bataille ; l'incursion est comptée. */
function checkBreaches(data: GameData, state: BattleState, events: BattleEvent[]): void {
  for (const squad of state.squads) {
    if (squad.status !== 'active' || squad.side !== 'enemy' || !inArea(data.battlefield.campHeart, squad.cell)) continue;
    squad.status = 'breached';
    state.breaches += 1;
    events.push({ type: 'breach', squad: squad.id, cell: { ...squad.cell }, total: state.breaches });
  }
}

/** Une escouade en fuite qui atteint son camp (cœur du campement, ou portail pour l'ennemi) quitte le terrain. */
function checkFled(data: GameData, state: BattleState, events: BattleEvent[]): void {
  for (const squad of state.squads) {
    if (squad.status !== 'fleeing') continue;
    const home = squad.side === 'player' ? data.battlefield.campHeart : data.battlefield.portal;
    if (!inArea(home, squad.cell)) continue;
    squad.status = 'routed';
    events.push({ type: 'fled', squad: squad.id, cell: { ...squad.cell } });
  }
}

/** Joue un pas : modifie l'état et rend ses événements, dans l'ordre des escouades. */
function playStep(data: GameData, state: BattleState, step: number, stopped: string[]): BattleEvent[] {
  const movers = state.squads.filter((s) => onField(s) && !stopped.includes(s.id));
  const intents = movers.map((squad) => ({ squad, intent: intentFor(data, state, squad, step) }));
  const requests: MoveRequest[] = intents.flatMap(({ squad, intent }) => (intent.kind === 'move' ? [{ squad, to: intent.to }] : []));
  const blocked = resolveStep(data, state, requests);
  const events: BattleEvent[] = [];
  for (const { squad, intent } of intents) {
    if (intent.kind === 'none') continue;
    if (intent.kind === 'wait') {
      events.push({ type: 'wait', step, squad: squad.id });
    } else if (intent.kind === 'halt') {
      stopped.push(squad.id);
      events.push({ type: 'halted', step, squad: squad.id, reason: intent.reason });
    } else {
      const reason = blocked[squad.id];
      if (reason) {
        stopped.push(squad.id);
        if (reason.kind === 'fortification') squad.obstacle = reason.site;
        events.push({ type: 'blocked', step, squad: squad.id, target: intent.to, reason });
      } else {
        events.push({ type: 'move', step, squad: squad.id, from: { ...squad.cell }, to: { ...intent.to }, why: intent.why });
      }
    }
  }
  for (const { squad, intent } of intents) {
    if (intent.kind === 'move' && !blocked[squad.id]) squad.cell = { ...intent.to };
  }
  checkBreaches(data, state, events);
  checkFled(data, state, events);
  return events;
}

/** Phase de mouvement complète : modifie l'état et rend les événements. */
export function movementPhase(data: GameData, state: BattleState): BattleEvent[] {
  const moving = state.squads.filter(onField);
  const steps = Math.max(0, ...moving.map((s) => s.stats.speed));
  for (const squad of state.squads) delete squad.obstacle;
  const stopped: string[] = [];
  const events: BattleEvent[] = [];
  checkFled(data, state, events);
  for (let step = 1; step <= steps; step++) events.push(...playStep(data, state, step, stopped));
  return events;
}
