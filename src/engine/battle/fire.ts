// Phase de tir, simultanée : chaque tireur qui n'est pas au contact d'un ennemi vise l'ennemi
// à portée le plus proche ; tous les tirs sont calculés sur l'état du début de la phase, puis
// appliqués. Pas de ligne de vue ; on peut tirer sur un ennemi engagé avec un allié.

import type { GameData } from '../data/types';
import { type PlannedHit, applyHits, computeHit, squadDefender } from './combat';
import type { BattleEvent } from './events';
import { hexDistance } from './hex';
import { type BattleState, isShooter } from './state';
import { isEngaged, rangedTarget } from './targeting';

export function firePhase(data: GameData, state: BattleState): BattleEvent[] {
  const hits: PlannedHit[] = [];
  for (const attacker of state.squads) {
    if (attacker.status !== 'active' || !isShooter(attacker) || isEngaged(state, attacker)) continue;
    const target = rangedTarget(data, state, attacker);
    if (!target) continue;
    const damage = computeHit(data, attacker, squadDefender(data, state, target, true), attacker.stats.rangedAttack, []);
    hits.push({ attacker, target, damage, distance: hexDistance(attacker.cell, target.cell) });
  }
  return applyHits(data, state, hits);
}
