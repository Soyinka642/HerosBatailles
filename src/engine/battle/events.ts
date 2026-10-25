// Journal de bataille (principe 7) : des événements structurés, sans texte. La traduction en
// français est dans narrate.ts. Les escouades sont désignées par leur id.

import type { Cell } from '../data/types';
import type { DamageApplied, DamageBreakdown } from './damage';
import type { Outcome } from './state';

/** Pourquoi un déplacement n'a pas eu lieu : l'escouade s'arrête pour la fin du tour. */
export type BlockReason =
  /** La case est tenue par une escouade qui ne bouge pas. */
  | { kind: 'occupied'; by: string }
  /** Deux escouades visaient la case : l'autre est entrée (plus rapide, ou déployée avant). */
  | { kind: 'conflict'; winner: string; why: 'faster' | 'deployedFirst' }
  /** Échange de cases ou rotation : personne ne bouge. */
  | { kind: 'cycle'; with: string[] }
  /** L'escouade devant, qui devait libérer la case, est elle-même bloquée. */
  | { kind: 'chain'; ahead: string }
  /** Une barrière debout (palissade) occupe la case. */
  | { kind: 'fortification'; site: string };

export type HaltReason =
  /** Au contact d'un ennemi au début du pas : engagée. */
  | { kind: 'engaged'; by: string }
  /** Tireur en Avancer : une cible est à portée au début du pas. */
  | { kind: 'targetInRange'; target: string };

export type MoveWhy =
  | { kind: 'planned' }
  | { kind: 'straight' }
  /** Avancer : aucun ennemi devant sur sa rangée, l'escouade dévie vers le plus proche. */
  | { kind: 'deviate'; toward: string };

export interface SquadSnapshot {
  id: string;
  cell: Cell;
  morale: number;
  maxMorale: number;
  wounded: number;
}

export type BattleEvent =
  | { type: 'turnStart'; turn: number }
  | { type: 'arrival'; squad: string; cell: Cell }
  | { type: 'arrivalDelayed'; squad: string }
  | { type: 'move'; step: number; squad: string; from: Cell; to: Cell; why: MoveWhy }
  | { type: 'wait'; step: number; squad: string }
  | { type: 'blocked'; step: number; squad: string; target: Cell; reason: BlockReason }
  | { type: 'halted'; step: number; squad: string; reason: HaltReason }
  | { type: 'breach'; squad: string; cell: Cell; total: number }
  | { type: 'shot'; attacker: string; target: string; distance: number; damage: DamageBreakdown; applied: DamageApplied }
  | { type: 'strike'; attacker: string; target: string; damage: DamageBreakdown; applied: DamageApplied }
  | { type: 'fortificationHit'; attacker: string; site: string; damage: DamageBreakdown; before: number; after: number }
  | { type: 'fortificationDestroyed'; site: string }
  | { type: 'rout'; squad: string }
  | { type: 'turnEnd'; turn: number; squads: SquadSnapshot[] }
  | { type: 'battleEnd'; turn: number; outcome: Outcome; breaches: number };
