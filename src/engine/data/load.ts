// Chargement du contenu : lit les JSON de src/data/, vérifie leur forme puis leurs
// références, et renvoie des données typées ou une erreur qui liste tous les problèmes.

import unlocks from '../../data/unlocks.json';
import keywords from '../../data/keywords.json';
import items from '../../data/items.json';
import units from '../../data/units.json';
import enemies from '../../data/enemies.json';
import postures from '../../data/postures.json';
import fortifications from '../../data/fortifications.json';
import battlefield from '../../data/battlefield.json';
import waves from '../../data/waves.json';
import config from '../../data/config.json';
import { type RawGameData, parseStructure } from './parse';
import type { Ctx } from './reader';
import { checkReferences } from './references';
import type { GameData } from './types';

/** Contenu brut livré avec le jeu. */
export const BUNDLED_DATA: RawGameData = { unlocks, keywords, items, units, enemies, postures, fortifications, battlefield, waves, config };

export class DataError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Données de jeu invalides (${issues.length} problème${issues.length > 1 ? 's' : ''}) :\n- ${issues.join('\n- ')}`);
    this.name = 'DataError';
  }
}

/** Liste les problèmes ; les références ne sont vérifiées que si la forme est valide. */
export function validateGameData(raw: RawGameData): { data: GameData; issues: string[] } {
  const ctx: Ctx = { issues: [] };
  const data = parseStructure(ctx, raw);
  if (ctx.issues.length === 0) checkReferences(ctx, data);
  return { data, issues: ctx.issues };
}

/** Renvoie les données validées, ou lève une DataError qui liste tous les problèmes. */
export function parseGameData(raw: RawGameData): GameData {
  const { data, issues } = validateGameData(raw);
  if (issues.length > 0) throw new DataError(issues);
  return data;
}

export function loadGameData(): GameData {
  return parseGameData(BUNDLED_DATA);
}
