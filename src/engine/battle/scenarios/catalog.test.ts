// Les batailles du catalogue (src/engine/battle/catalog.ts), que l'affichage propose de regarder.
// Chaque journal est un .txt versionné, comme les autres scénarios ; quelques vérifications
// assurent que chaque bataille montre bien ce qu'annonce son titre.

import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../data/load';
import { type BattleResult, runBattle } from '../battle';
import { CATALOG } from '../catalog';
import { narrateBattle } from '../narrate';

const data = loadGameData();

const has = (r: BattleResult, type: string) => r.events.some((e) => e.type === type);

/** Ce que chaque bataille doit montrer. */
const CHECKS: Record<string, (r: BattleResult) => boolean> = {
  'vague-1-derriere-la-palissade': (r) => r.outcome.kind === 'victory',
  'palissade-assiegee-puis-brisee': (r) => r.events.filter((e) => e.type === 'fortificationDestroyed').length === 1,
  'tour-prise-par-l-ennemi': (r) => r.final.breaches === 1,
  'feu-sur-la-tour': (r) => r.events.some((e) => e.type === 'ignite' && e.site === 'tour'),
  'incursion-par-une-breche': (r) => r.final.breaches === 1,
  'pate-epuisee': (r) => r.events.some((e) => e.type === 'shot' && e.fire?.used === false && e.fire.why === 'noConsumable'),
  'tombes-repris-a-temps': (r) => has(r, 'fallenRecovered'),
  'tombes-perdus': (r) => r.events.some((e) => e.type === 'fallenDied' && e.atEnd !== true),
  'fuite-debandade': (r) => r.events.some((e) => e.type === 'dispersed' && e.squad === 'epeistes'),
};

describe('batailles du catalogue', () => {
  it('ont des identifiants uniques', () => {
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
  });

  it.each(CATALOG.map((e) => [e.id, e] as const))('%s', async (id, entry) => {
    const result = runBattle(data, entry.setup(data));
    await expect(narrateBattle(data, result)).toMatchFileSnapshot(`./${id}.txt`);
    expect(CHECKS[id]?.(result) ?? true).toBe(true);
  });
});
