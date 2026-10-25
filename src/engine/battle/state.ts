// État d'une bataille : un objet simple, sérialisable, sans Map ni Set.
// Les escouades sont dans un tableau trié par une règle explicite (rank) : nos escouades dans
// l'ordre de déploiement, puis les ennemis dans l'ordre d'arrivée prévu. Toute itération du
// moteur suit ce tableau, ce qui garantit le déterminisme.

import type { BattleKind, Cell, FortificationKind, Id, KeywordRef, Movement } from '../data/types';
import type { Side } from './hex';
import type { PlannedTurn } from './types';

/** Chiffres réels d'une escouade en bataille (base + équipement, ou stats directes d'un ennemi). */
export interface CombatStats {
  meleeAttack: number;
  rangedAttack: number;
  range: number;
  defense: number;
  speed: number;
  soldiers: number;
  maxMorale: number;
}

/** Arme portée sans sa maîtrise : malus d'attaque et capacités perdues (pour le journal). */
export interface UnmasteredWeapon {
  item: Id;
  penalty: number;
  lostKeywords: Id[];
}

export type SquadStatus = 'active' | 'routed' | 'breached';

export interface BattleSquad {
  /** Unique dans la bataille : id choisi par le joueur, ou « fantassins-du-portail#1 ». */
  id: string;
  name: string;
  side: Side;
  /** Ordre de déploiement (joueur) puis d'arrivée prévue (ennemis) : départage des conflits. */
  rank: number;
  cell: Cell;
  stats: CombatStats;
  /** Capacités actives (celles d'une arme non maîtrisée sont déjà retirées). */
  keywords: KeywordRef[];
  unmastered: UnmasteredWeapon[];
  morale: number;
  wounded: number;
  posture: Id;
  movement: Movement;
  /** Tours planifiés : le tour n utilise plannedTurns[n − 1], puis la posture. */
  plannedTurns: PlannedTurn[];
  status: SquadStatus;
  /** Fortification qui a barré son chemin pendant le mouvement de ce tour (site), remise à zéro à chaque tour. */
  obstacle?: Id;
}

/** Une fortification bâtie sur un site du terrain. Ses dégâts persistent après la bataille. */
export interface FortificationState {
  site: Id;
  fortification: Id;
  name: string;
  kind: FortificationKind;
  cell: Cell;
  /** Points de structure restants ; 0 = détruite (la case redevient libre). */
  structure: number;
  maxStructure: number;
}

/** Un ennemi annoncé qui n'est pas encore sorti du portail. */
export interface PendingArrival {
  id: string;
  name: string;
  enemy: Id;
  rank: number;
  turn: number;
  row?: number;
}

export type Outcome =
  | { kind: 'victory'; reason: 'noEnemiesLeft' | 'ritualHeld' }
  | { kind: 'defeat'; reason: 'allSquadsRouted' }
  | { kind: 'undecided'; reason: 'maxTurns' };

export interface BattleState {
  waveId: Id;
  kind: BattleKind;
  /** Tour en cours (1 pour le premier) ; 0 avant le premier tour. */
  turn: number;
  squads: BattleSquad[];
  pending: PendingArrival[];
  /** Fortifications bâties, dans l'ordre des sites de battlefield.json. */
  fortifications: FortificationState[];
  /** Ennemis qui ont atteint le cœur du campement. */
  breaches: number;
  outcome?: Outcome;
}

export function activeSquads(state: BattleState): BattleSquad[] {
  return state.squads.filter((squad) => squad.status === 'active');
}

export function activeEnemiesOf(state: BattleState, squad: BattleSquad): BattleSquad[] {
  return state.squads.filter((other) => other.status === 'active' && other.side !== squad.side);
}

export function squadAt(state: BattleState, cell: Cell): BattleSquad | undefined {
  return state.squads.find((squad) => squad.status === 'active' && squad.cell.col === cell.col && squad.cell.row === cell.row);
}

export function findSquad(state: BattleState, id: string): BattleSquad {
  const squad = state.squads.find((s) => s.id === id);
  if (!squad) throw new Error(`Escouade inconnue : ${id}`);
  return squad;
}

/** Peut tirer : une attaque à distance et une portée. */
export function isShooter(squad: BattleSquad): boolean {
  return squad.stats.rangedAttack > 0 && squad.stats.range > 0;
}
