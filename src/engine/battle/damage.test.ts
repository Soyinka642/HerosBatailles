import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/load';
import { type DamageInput, applyDamage, computeDamage, roundHalfUp, woundedFactor } from './damage';
import { isBroken, moraleEfficiency, moraleTier } from './morale';

const config = loadGameData().config;

function input(overrides: Partial<DamageInput>): DamageInput {
  return {
    attack: 6,
    bonuses: [],
    defense: 2,
    defenseBonuses: [],
    ignoreDefense: [],
    tier: 'steady',
    efficiency: 1,
    wounded: 0,
    soldiers: 20,
    ...overrides,
  };
}

describe('paliers de moral', () => {
  it('ferme, ébranlée sous 0,66, vacillante sous 0,33', () => {
    expect(moraleTier(20, 20, config)).toBe('steady');
    expect(moraleTier(14, 20, config)).toBe('steady');
    expect(moraleTier(13, 20, config)).toBe('shaken');
    expect(moraleTier(7, 20, config)).toBe('shaken');
    expect(moraleTier(6, 20, config)).toBe('wavering');
    expect(moraleTier(1, 20, config)).toBe('wavering');
  });

  it('efficacité 1 / 0,9 / 0,8', () => {
    const at = (morale: number) => moraleEfficiency({ morale, stats: { maxMorale: 20 } }, config);
    expect([at(20), at(13), at(6)]).toEqual([1, 0.9, 0.8]);
  });

  it('déroute à zéro', () => {
    expect(isBroken({ morale: 0, stats: { maxMorale: 20 } })).toBe(true);
    expect(isBroken({ morale: 1, stats: { maxMorale: 20 } })).toBe(false);
  });
});

describe('formule de dégâts', () => {
  it('attaque − défense', () => {
    expect(computeDamage(input({}), config)).toMatchObject({ net: 4, raw: 4, final: 4, floored: false });
  });

  it('au moins le minimum', () => {
    expect(computeDamage(input({ attack: 2, defense: 5 }), config)).toMatchObject({ net: -3, final: 1, floored: true });
  });

  it('les bonus s’ajoutent à l’attaque', () => {
    const d = computeDamage(input({ bonuses: [{ keyword: 'soutien', from: 'piquiers', amount: 2 }] }), config);
    expect(d.net).toBe(6);
  });

  it('Perce-armure réduit la défense, sans descendre sous 0', () => {
    expect(computeDamage(input({ defense: 2, ignoreDefense: [{ keyword: 'perce-armure', amount: 2 }] }), config)).toMatchObject({
      effectiveDefense: 0,
      final: 6,
    });
    expect(computeDamage(input({ defense: 1, ignoreDefense: [{ keyword: 'perce-armure', amount: 2 }] }), config).effectiveDefense).toBe(0);
  });

  it('moral et blessés multiplient les dégâts nets, après la défense', () => {
    // (6 + 2 − 2) × 0,9 × 0,9 = 4,86 → 5
    const d = computeDamage(
      input({ bonuses: [{ keyword: 'soutien', amount: 2 }], tier: 'shaken', efficiency: 0.9, wounded: 2 }),
      config,
    );
    expect(d.woundedFactor).toBeCloseTo(0.9);
    expect(d.raw).toBeCloseTo(4.86);
    expect(d.final).toBe(5);
  });

  it('arrondi au plus proche, 0,5 vers le haut', () => {
    // (5 − 0) × 0,9 = 4,5 → 5 ; (5 − 0) × 0,8 = 4 ; 3 × 0,8 = 2,4 → 2
    expect(computeDamage(input({ attack: 5, defense: 0, efficiency: 0.9 }), config).final).toBe(5);
    expect(computeDamage(input({ attack: 3, defense: 0, efficiency: 0.8 }), config).final).toBe(2);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(4.4999999999)).toBe(5);
    expect(roundHalfUp(4.49)).toBe(4);
  });

  it('les blessés ne font pas descendre sous le plancher', () => {
    expect(woundedFactor(15, 20, config)).toBe(0.5);
    expect(woundedFactor(5, 20, config)).toBe(0.75);
  });

  it('formule en pourcentage (réglable)', () => {
    const percent = { ...config, damage: { ...config.damage, formula: 'percentage' as const } };
    // 6 × (1 − 0,1 × 2) = 4,8 → 5
    expect(computeDamage(input({}), percent).final).toBe(5);
  });
});

describe('application des dégâts', () => {
  const squad = (morale: number, wounded = 0) => ({ morale, wounded, stats: { maxMorale: 20, soldiers: 20 } });

  it('une escouade ferme ne perd que du moral', () => {
    const s = squad(20);
    expect(applyDamage(s, 4, config)).toEqual({ amount: 4, moraleBefore: 20, moraleAfter: 16, woundedBefore: 0, woundedAfter: 0 });
  });

  it('point par point : le seuil franchi, chaque point fait un blessé', () => {
    // 15 → 14 (ferme), 14 → 13 (ferme au début du point), puis 13 → 12 et 12 → 11 avec un blessé chacun.
    const s = squad(15);
    expect(applyDamage(s, 4, config)).toMatchObject({ moraleAfter: 11, woundedAfter: 2 });
  });

  it('le moral s’arrête à 0, l’excédent est perdu', () => {
    const s = squad(3, 5);
    expect(applyDamage(s, 10, config)).toMatchObject({ moraleAfter: 0, woundedAfter: 8 });
  });

  it('les blessés ne dépassent pas l’effectif', () => {
    const s = { morale: 10, wounded: 19, stats: { maxMorale: 20, soldiers: 20 } };
    expect(applyDamage(s, 5, config)).toMatchObject({ moraleAfter: 5, woundedAfter: 20 });
  });
});
