// La formule de dégâts (principe 4) : une seule fonction, computeDamage, qui rend aussi le
// détail du calcul pour le journal. Puis leur application : le moral encaisse d'abord.

import type { BattleConfig } from '../data/types';
import { type MoraleTier, moraleTier } from './morale';

/** Un bonus d'attaque, avec sa source pour le journal (Soutien…). */
export interface AttackBonus {
  /** Id du mot-clé qui le donne. */
  keyword: string;
  /** Escouade qui le donne (le piquier qui soutient), si ce n'est pas l'attaquant. */
  from?: string;
  amount: number;
}

export interface DamageInput {
  attack: number;
  bonuses: AttackBonus[];
  defense: number;
  /** Défense ignorée (Perce-armure X), avec le mot-clé qui la donne. */
  ignoreDefense: { keyword: string; amount: number }[];
  /** Palier de moral de l'attaquant, et son multiplicateur. */
  tier: MoraleTier;
  efficiency: number;
  /** Blessés et effectif de l'attaquant. */
  wounded: number;
  soldiers: number;
}

export interface DamageBreakdown extends DamageInput {
  /** Défense après Perce-armure, jamais sous 0. */
  effectiveDefense: number;
  /** Attaque + bonus − défense (formule soustractive) ; peut être négatif. */
  net: number;
  /** Part des valides, avec le plancher wounded.attackFloor. */
  woundedFactor: number;
  /** Dégâts avant arrondi : net × efficacité × blessés. */
  raw: number;
  /** Dégâts finaux : arrondis au plus proche, puis au moins le minimum. */
  final: number;
  /** Le minimum a remplacé le résultat de l'arrondi. */
  floored: boolean;
}

/** Arrondi au plus proche, 0,5 vers le haut, insensible aux erreurs de virgule flottante (4,4999999 → 5). */
export function roundHalfUp(value: number): number {
  return Math.floor(Math.round(value * 1e6) / 1e6 + 0.5);
}

export function woundedFactor(wounded: number, soldiers: number, config: BattleConfig): number {
  if (soldiers <= 0) return config.wounded.attackFloor;
  return Math.max(config.wounded.attackFloor, (soldiers - wounded) / soldiers);
}

/**
 * Dégâts = (attaque + bonus − défense) × efficacité du moral × part des valides, arrondis au plus
 * proche, avec un minimum. Les multiplicateurs portent sur les dégâts nets, après la défense.
 */
export function computeDamage(input: DamageInput, config: BattleConfig): DamageBreakdown {
  const pierce = input.ignoreDefense.reduce((sum, p) => sum + p.amount, 0);
  const effectiveDefense = Math.max(0, input.defense - pierce);
  const attack = input.attack + input.bonuses.reduce((sum, b) => sum + b.amount, 0);
  const net =
    config.damage.formula === 'subtraction'
      ? attack - effectiveDefense
      : attack * Math.max(0, 1 - config.damage.percentPerDefense * effectiveDefense);
  const wf = woundedFactor(input.wounded, input.soldiers, config);
  const raw = net * input.efficiency * wf;
  const rounded = roundHalfUp(raw);
  const final = Math.max(config.damage.minimum, rounded);
  return { ...input, effectiveDefense, net, woundedFactor: wf, raw, final, floored: final !== rounded };
}

/** Ce qu'une escouade doit exposer pour encaisser des dégâts. */
export interface DamageTaker {
  morale: number;
  wounded: number;
  stats: { maxMorale: number; soldiers: number };
}

export interface DamageApplied {
  amount: number;
  moraleBefore: number;
  moraleAfter: number;
  woundedBefore: number;
  woundedAfter: number;
}

/**
 * Applique les dégâts point par point : un point encaissé par une escouade ferme ne retire que
 * du moral ; une fois ébranlée, chaque point retire 1 de moral et fait 1 blessé. Le moral ne
 * descend pas sous 0, les blessés ne dépassent pas l'effectif ; l'excédent est perdu.
 */
export function applyDamage(squad: DamageTaker, amount: number, config: BattleConfig): DamageApplied {
  const moraleBefore = squad.morale;
  const woundedBefore = squad.wounded;
  for (let point = 0; point < amount && squad.morale > 0; point++) {
    const steady = moraleTier(squad.morale, squad.stats.maxMorale, config) === 'steady';
    squad.morale -= 1;
    if (!steady && squad.wounded < squad.stats.soldiers) squad.wounded += 1;
  }
  return { amount, moraleBefore, moraleAfter: squad.morale, woundedBefore, woundedAfter: squad.wounded };
}
