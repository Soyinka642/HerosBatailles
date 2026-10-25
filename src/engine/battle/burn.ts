// Le Feu : une volée enflammée fait perdre du moral à l'impact, puis la cible brûle (dégâts
// fixes qui ignorent la défense, au début de chacun des tours suivants ; rafraîchie, sans
// cumul). Une cible abritée dans une fortification la fait brûler aussi.
//
// Les effets viennent des mots-clés (déclencheur onHit). Au prototype, ils ne portent que sur
// les tirs : ce sont les flèches qui sont enflammées.

import type { GameData, Id, KeywordRef } from '../data/types';
import { applyDamage } from './damage';
import type { BattleEvent, FireDecision } from './events';
import { defenseBonuses, fortificationAt, isStanding } from './fortifications';
import type { BattleSquad, BattleState, Burning } from './state';

interface OnHitKeyword {
  ref: KeywordRef;
  keyword: Id;
  moraleLoss: number;
  burn?: Burning;
}

/** Le premier mot-clé de l'escouade qui agit à l'impact (Feu), avec ses chiffres. */
function onHitKeyword(data: GameData, squad: BattleSquad): OnHitKeyword | undefined {
  for (const ref of squad.keywords) {
    const keyword = data.keywords.find((k) => k.id === ref.id);
    const effects = keyword?.effects.filter((e) => e.trigger === 'onHit' && e.condition === undefined) ?? [];
    if (!keyword || effects.length === 0) continue;
    let moraleLoss = 0;
    let burn: Burning | undefined;
    for (const { action } of effects) {
      const amount = action.amount === 'X' ? (ref.x ?? 0) : action.amount;
      if (action.kind === 'moraleLoss') moraleLoss += amount;
      if (action.kind === 'burn') burn = { amount, turnsLeft: action.turns };
    }
    return { ref, keyword: keyword.id, moraleLoss, ...(burn ? { burn } : {}) };
  }
  return undefined;
}

/**
 * Tire-t-on enflammé ? Sans unité du consommable, la volée part normale. La règle par défaut
 * n'enflamme qu'une cible assez cuirassée (défense réelle contre les tirs, fortifications
 * comprises, au moins égale au seuil) qui ne brûle pas déjà.
 */
export function decideFire(data: GameData, state: BattleState, attacker: BattleSquad, target: BattleSquad): FireDecision | undefined {
  const hit = onHitKeyword(data, attacker);
  if (!hit) return undefined;
  const consumable = hit.ref.consumes;
  const base = { keyword: hit.keyword, ...(consumable ? { consumable } : {}) };
  if (consumable === undefined) return { ...base, used: true };
  if ((attacker.carried[consumable] ?? 0) <= 0) return { ...base, used: false, why: 'noConsumable' };
  const defense = target.stats.defense + defenseBonuses(data, state, target, true).reduce((sum, b) => sum + b.amount, 0);
  if (defense < data.config.fireArrows.minTargetDefense) return { ...base, used: false, why: 'lowDefense', defense };
  if (target.burning) return { ...base, used: false, why: 'alreadyBurning' };
  return { ...base, used: true };
}

/** Applique une volée enflammée qui a touché : consommable, perte de moral, brûlure de la cible et de son abri. */
export function ignite(data: GameData, state: BattleState, attacker: BattleSquad, target: BattleSquad, decision: FireDecision): BattleEvent {
  const hit = onHitKeyword(data, attacker)!;
  let consumed: { consumable: Id; left: number } | undefined;
  if (decision.consumable !== undefined) {
    const left = (attacker.carried[decision.consumable] ?? 0) - 1;
    attacker.carried[decision.consumable] = left;
    consumed = { consumable: decision.consumable, left };
  }
  const moraleBefore = target.morale;
  target.morale = Math.max(0, target.morale - hit.moraleLoss);
  const shelter = fortificationAt(state, target.cell);
  if (hit.burn) {
    target.burning = { ...hit.burn };
    if (shelter) shelter.burning = { ...hit.burn };
  }
  return {
    type: 'ignite',
    attacker: attacker.id,
    target: target.id,
    keyword: hit.keyword,
    moraleBefore,
    moraleAfter: target.morale,
    ...(hit.burn ? { burn: { ...hit.burn } } : {}),
    ...(hit.burn && shelter ? { site: shelter.site } : {}),
    ...(consumed ? { consumed } : {}),
  };
}

/** Début de tour : les escouades et les fortifications en feu brûlent. */
export function burnPhase(data: GameData, state: BattleState): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const squad of state.squads) {
    if (squad.status !== 'active' || !squad.burning) continue;
    const { amount } = squad.burning;
    const applied = applyDamage(squad, amount, data.config);
    squad.burning.turnsLeft -= 1;
    events.push({ type: 'burn', squad: squad.id, amount, applied, turnsLeft: squad.burning.turnsLeft });
    if (squad.burning.turnsLeft <= 0) delete squad.burning;
  }
  for (const fort of state.fortifications) {
    if (!isStanding(fort) || !fort.burning) continue;
    const before = fort.structure;
    fort.structure = Math.max(0, before - fort.burning.amount);
    fort.burning.turnsLeft -= 1;
    events.push({ type: 'fortificationBurn', site: fort.site, amount: fort.burning.amount, before, after: fort.structure, turnsLeft: fort.burning.turnsLeft });
    if (fort.burning.turnsLeft <= 0 || !isStanding(fort)) delete fort.burning;
  }
  return events;
}
