// Le sprite d'une escouade : arme + armure pour les nôtres, type pour l'ennemi (src/ui/sprites.json).
// Sans arme, ou sans sprite prévu, l'escouade garde un jeton provisoire.

import SPRITES from '../sprites.json';
import type { SquadView } from './mirror';

export interface SpriteLook {
  /** Nom du fichier dans assets/unites/, sans extension. */
  key: string;
  scale: number;
  /** Teinte plus sombre (les brutes). */
  dark: boolean;
}

interface EnemySprite {
  sprite: string;
  scale?: number;
  dark?: boolean;
}

const WEAPONS: Record<string, string> = SPRITES.player.weapons;
const ARMORS: Record<string, string> = SPRITES.player.armors;
const SUBSTITUTES: Record<string, string> = SPRITES.player.substitutes;
const ENEMIES: Record<string, EnemySprite> = SPRITES.enemies;

export function spriteOf(view: Pick<SquadView, 'equipment' | 'enemy'>): SpriteLook | undefined {
  if (view.enemy !== undefined) {
    const enemy = ENEMIES[view.enemy];
    return enemy ? { key: enemy.sprite, scale: enemy.scale ?? 1, dark: enemy.dark === true } : undefined;
  }
  const weapon = WEAPONS[view.equipment?.['arme'] ?? ''];
  const armor = ARMORS[view.equipment?.['armure'] ?? ''];
  if (weapon === undefined || armor === undefined) return undefined;
  const key = weapon + armor;
  return { key: SUBSTITUTES[key] ?? key, scale: 1, dark: false };
}

/** Tous les fichiers dont la bataille peut avoir besoin, à charger d'avance. */
export function allSpriteKeys(): string[] {
  const keys = new Set<string>();
  for (const weapon of Object.values(WEAPONS)) {
    for (const armor of Object.values(ARMORS)) keys.add(SUBSTITUTES[weapon + armor] ?? weapon + armor);
  }
  for (const enemy of Object.values(ENEMIES)) keys.add(enemy.sprite);
  return [...keys].sort();
}
