// Moral : paliers d'efficacité (ferme, ébranlée, vacillante) et déroute à zéro.

import type { BattleConfig } from '../data/types';

export type MoraleTier = 'steady' | 'shaken' | 'wavering';

/** Ce dont le moral a besoin : une escouade de bataille convient. */
export interface MoraleGauge {
  morale: number;
  stats: { maxMorale: number };
}

export function moraleTier(morale: number, maxMorale: number, config: BattleConfig): MoraleTier {
  if (morale < config.morale.waveringBelow * maxMorale) return 'wavering';
  if (morale < config.morale.shakenBelow * maxMorale) return 'shaken';
  return 'steady';
}

export function tierOf(squad: MoraleGauge, config: BattleConfig): MoraleTier {
  return moraleTier(squad.morale, squad.stats.maxMorale, config);
}

/** Multiplicateur d'efficacité du palier : il s'applique aux dégâts que l'escouade inflige. */
export function moraleEfficiency(squad: MoraleGauge, config: BattleConfig): number {
  return config.morale.efficiency[tierOf(squad, config)];
}

/** Déroute : le moral est tombé à zéro. */
export function isBroken(squad: MoraleGauge): boolean {
  return squad.morale <= 0;
}
