// Phase de mêlée, simultanée : chaque escouade au contact d'un ennemi frappe une seule cible
// (l'ennemi juste devant, sinon le premier voisin dans un ordre fixe). Tous les coups sont
// calculés sur l'état du début de la phase, puis appliqués : une escouade prise par deux
// ennemis reçoit deux coups et n'en rend qu'un.
//
// Réaction par défaut : un ennemi dont le chemin a été barré par une palissade pendant le
// mouvement, et qui n'a aucune de nos escouades au contact, frappe la palissade.

import type { GameData } from '../data/types';
import {
  FORTIFICATION_DEFENDER,
  type PlannedFortificationHit,
  type PlannedHit,
  applyHits,
  computeHit,
  squadDefender,
  supportBonuses,
} from './combat';
import type { BattleEvent } from './events';
import { isStanding } from './fortifications';
import type { BattleSquad, BattleState, FortificationState } from './state';
import { meleeTarget } from './targeting';

/** La palissade qui a barré la route d'un ennemi ce tour-ci, si elle est encore debout. Nos fortifications ne sont hostiles qu'à l'ennemi. */
function hostileObstacle(state: BattleState, squad: BattleSquad): FortificationState | undefined {
  if (squad.side !== 'enemy' || squad.obstacle === undefined) return undefined;
  return state.fortifications.find((f) => f.site === squad.obstacle && isStanding(f));
}

export function meleePhase(data: GameData, state: BattleState): BattleEvent[] {
  const hits: PlannedHit[] = [];
  const fortHits: PlannedFortificationHit[] = [];
  for (const attacker of state.squads) {
    if (attacker.status !== 'active') continue;
    const bonuses = supportBonuses(data, state, attacker);
    const target = meleeTarget(state, attacker);
    if (target) {
      const damage = computeHit(data, attacker, squadDefender(data, state, target, false), attacker.stats.meleeAttack, bonuses);
      hits.push({ attacker, target, damage });
      continue;
    }
    const fort = hostileObstacle(state, attacker);
    if (fort) fortHits.push({ attacker, fort, damage: computeHit(data, attacker, FORTIFICATION_DEFENDER, attacker.stats.meleeAttack, bonuses) });
  }
  return applyHits(data, state, hits, fortHits);
}
