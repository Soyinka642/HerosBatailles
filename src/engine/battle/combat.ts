// Ce que partagent le tir et la mêlée : les effets des mots-clés, le calcul d'un coup d'après
// l'état du début de la phase, puis l'application simultanée et la déroute.
//
// Les effets à condition des mots-clés (Charge) ne sont pas encore pris en compte (lot 1.2d).

import type { Action, Amount, GameData, KeywordRef, Trigger } from '../data/types';
import { type AttackBonus, type DamageBreakdown, applyDamage, computeDamage } from './damage';
import { ignite } from './burn';
import type { BattleEvent, FireDecision } from './events';
import { behind, sameCell } from './hex';
import { type FortificationBonus, defenseBonuses, isStanding } from './fortifications';
import { moraleEfficiency, isBroken, tierOf } from './morale';
import type { BattleSquad, BattleState, FortificationState } from './state';
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

/** Ce qui encaisse : une défense et les bonus des fortifications. */
export interface Defender {
  defense: number;
  bonuses: FortificationBonus[];
}

/** Défense d'une escouade contre un tir ou un coup de mêlée, fortifications comprises. */
export function squadDefender(data: GameData, state: BattleState, target: BattleSquad, ranged: boolean): Defender {
  return { defense: target.stats.defense, bonuses: defenseBonuses(data, state, target, ranged) };
}

/** Une fortification n'a pas de défense : la formule se réduit à l'attaque. */
export const FORTIFICATION_DEFENDER: Defender = { defense: 0, bonuses: [] };

/** Calcule un coup d'après l'état actuel de l'attaquant et de ce qui encaisse. */
export function computeHit(
  data: GameData,
  attacker: BattleSquad,
  defender: Defender,
  attack: number,
  bonuses: AttackBonus[],
): DamageBreakdown {
  return computeDamage(
    {
      attack,
      bonuses,
      defense: defender.defense,
      defenseBonuses: defender.bonuses,
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
  /** Choix du Feu, pour un tireur qui en porte. */
  fire?: FireDecision;
}

/** Un coup porté à une fortification (l'ennemi frappe la palissade qui lui barre la route). */
export interface PlannedFortificationHit {
  attacker: BattleSquad;
  fort: FortificationState;
  damage: DamageBreakdown;
}

/**
 * Applique tous les coups d'une phase (calculés avant, donc simultanés), puis les
 * fortifications détruites, puis la déroute.
 */
export function applyHits(
  data: GameData,
  state: BattleState,
  hits: readonly PlannedHit[],
  fortHits: readonly PlannedFortificationHit[] = [],
): BattleEvent[] {
  const events: BattleEvent[] = hits.flatMap((hit): BattleEvent[] => {
    const applied = applyDamage(hit.target, hit.damage.final, data.config);
    const common = { attacker: hit.attacker.id, target: hit.target.id, damage: hit.damage, applied };
    if (hit.distance === undefined) return [{ type: 'strike', ...common }];
    const shot: BattleEvent = { type: 'shot', distance: hit.distance, ...common, ...(hit.fire ? { fire: hit.fire } : {}) };
    return hit.fire?.used ? [shot, ignite(data, state, hit.attacker, hit.target, hit.fire)] : [shot];
  });
  const standing = state.fortifications.filter(isStanding);
  for (const hit of fortHits) {
    const before = hit.fort.structure;
    hit.fort.structure = Math.max(0, before - hit.damage.final);
    events.push({ type: 'fortificationHit', attacker: hit.attacker.id, site: hit.fort.site, damage: hit.damage, before, after: hit.fort.structure });
  }
  events.push(...destroyedSince(standing));
  return [...events, ...routBroken(state)];
}

/** Les fortifications de la liste tombées à 0 : la case redevient libre. */
export function destroyedSince(standing: readonly FortificationState[]): BattleEvent[] {
  return standing.filter((f) => !isStanding(f)).map((f) => ({ type: 'fortificationDestroyed', site: f.site }));
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
