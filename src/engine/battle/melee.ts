// Phase de mêlée, simultanée : chaque escouade au contact d'un ennemi frappe une seule cible
// (l'ennemi juste devant, sinon le premier voisin dans un ordre fixe). Tous les coups sont
// calculés sur l'état du début de la phase, puis appliqués : une escouade prise par deux
// ennemis reçoit deux coups et n'en rend qu'un.

import type { GameData } from '../data/types';
import { type PlannedHit, applyHits, computeHit, supportBonuses } from './combat';
import type { BattleEvent } from './events';
import type { BattleState } from './state';
import { meleeTarget } from './targeting';

export function meleePhase(data: GameData, state: BattleState): BattleEvent[] {
  const hits: PlannedHit[] = [];
  for (const attacker of state.squads) {
    if (attacker.status !== 'active') continue;
    const target = meleeTarget(state, attacker);
    if (!target) continue;
    const damage = computeHit(data, attacker, target, attacker.stats.meleeAttack, supportBonuses(data, state, attacker));
    hits.push({ attacker, target, damage });
  }
  return applyHits(data, state, hits);
}
