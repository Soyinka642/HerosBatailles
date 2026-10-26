import { describe, expect, it } from 'vitest';
import { code, hash } from './hash';

describe('hasard d’apparence', () => {
  it('même entrée, même valeur, dans [0, 1)', () => {
    expect(hash(3, 4, 1)).toBe(hash(3, 4, 1));
    for (let i = 0; i < 200; i++) {
      const v = hash(i, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('des cases voisines donnent des valeurs différentes, assez bien réparties', () => {
    const values = Array.from({ length: 400 }, (_, i) => hash(i % 20, Math.floor(i / 20)));
    expect(new Set(values).size).toBe(400);
    const low = values.filter((v) => v < 0.5).length;
    expect(low).toBeGreaterThan(160);
    expect(low).toBeLessThan(240);
  });

  it('code de chaîne stable', () => {
    expect(code('palissade-nord')).toBe(code('palissade-nord'));
    expect(code('palissade-nord')).not.toBe(code('palissade-sud'));
  });
});
