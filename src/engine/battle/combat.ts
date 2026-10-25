// Ce que partagent le tir et la mêlée : les effets des mots-clés, le calcul d'un coup d'après
// l'état du début de la phase, puis l'application simultanée et la déroute.
//
// Lot 1.2b : seuls les effets sans condition des déclencheurs onAttack (Perce-armure) et
// allyInFrontMelee (Soutien) sont pris en compte. Feu (onHit), Charge (condition de course)
// et les effets des fortifications arriveront au lot 1.2c.

import type { Action, Amount, GameData, KeywordRef, Trigger } from '../data/types';
import { type AttackBonus, type DamageBreakdown, applyDamage, computeDamage } from './damage';
import type { BattleEvent } from './events';
import { behind, sameCell } from './hex';
import { moraleEfficiency, isBroken, tierOf } from './morale';
import type { BattleSquad, BattleState } from './state';
import { isEngaged } from './targeting';

interface ResolvedEffect {
  keyword: string;
  action: Action;
  amount: number;
}

function resolveAmount(amount: Amount, ref: KeywordRef): number {
  return amount === 'X' ? (ref.x ?? 0) : amount;
}

/** Effets sans condition des mots-clés actifs d'une escouade, pour un déclencheur. */
export function effectsOf(data: GameData, squad: BattleSquad, trigger: Trigger): ResolvedEffect[] {
  return squad.keywords.flatMap((ref) => {
    const keyword = data.keywords.find((k) => k.id === ref.id);
    if (!keyword) return [];
    return keyword.effects
      .filter((effect) => effect.trigger === trigger && effect.condition === undefined)
      .map((effect) => ({ keyword: keyword.id, action: effect.action, amount: resolveAmount(effect.action.amount, ref) }));
  });
}

/** Défense ignorée par l'attaquant (Perce-armure X). */
function ignoredDefense(data: GameData, attacker: BattleSquad): { keyword: string; amount: number }[] {
  return effectsOf(data, attacker, 'onAttack')
    .filter((e) => e.action.kind === 'ignoreDefense')
    .map((e) => ({ keyword: e.keyword, amount: e.amount }));
}

/** Soutien : l'allié juste derrière, s'il n'est pas lui-même au contact d'un ennemi. */
export function supportBonuses(data: GameData, state: BattleState, squad: BattleSquad): AttackBonus[] {
  const cell = behind(squad.cell, squad.side);
  const supporter = state.squads.find((s) => s.status === 'active' && s.side === squad.side && sameCell(s.cell, cell));
  if (!supporter || isEngaged(state, supporter)) return [];
  return effectsOf(data, supporter, 'allyInFrontMelee')
    .filter((e) => e.action.kind === 'attackBonus')
    .map((e) => ({ keyword: e.keyword, from: supporter.id, amount: e.amount }));
}

/** Calcule un coup d'après l'état actuel de l'attaquant et de la cible. */
export function computeHit(
  data: GameData,
  attacker: BattleSquad,
  target: BattleSquad,
  attack: number,
  bonuses: AttackBonus[],
): DamageBreakdown {
  return computeDamage(
    {
      attack,
      bonuses,
      defense: target.stats.defense,
      ignoreDefense: ignoredDefense(data, attacker),
      tier: tierOf(attacker, data.config),
      efficiency: moraleEfficiency(attacker, data.config),
      wounded: attacker.wounded,
      soldiers: attacker.stats.soldiers,
    },
    data.config,
  );
}

export interface PlannedHit {
  attacker: BattleSquad;
  target: BattleSquad;
  damage: DamageBreakdown;
  /** Distance du tir ; absente pour la mêlée. */
  distance?: number;
}

/** Applique tous les coups d'une phase (calculés avant, donc simultanés), puis la déroute. */
export function applyHits(data: GameData, state: BattleState, hits: readonly PlannedHit[]): BattleEvent[] {
  const events: BattleEvent[] = hits.map((hit) => {
    const applied = applyDamage(hit.target, hit.damage.final, data.config);
    const common = { attacker: hit.attacker.id, target: hit.target.id, damage: hit.damage, applied };
    return hit.distance === undefined ? { type: 'strike', ...common } : { type: 'shot', distance: hit.distance, ...common };
  });
  return [...events, ...routBroken(state)];
}

/** Les escouades dont le moral est tombé à zéro partent en déroute et quittent le terrain. */
export function routBroken(state: BattleState): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const squad of state.squads) {
    if (squad.status !== 'active' || !isBroken(squad)) continue;
    squad.status = 'routed';
    events.push({ type: 'rout', squad: squad.id });
  }
  return events;
}
