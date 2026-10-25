import { describe, expect, it } from 'vitest';
import { abbreviation, shortName } from './labels';

describe('étiquettes des jetons', () => {
  it('nom court', () => {
    expect(shortName('Fantassins du portail n°1')).toBe('Fantassins n°1');
    expect(shortName('Archers en renfort')).toBe('Archers en renfort');
  });

  it('abréviation, avec le numéro des ennemis', () => {
    expect(abbreviation('Épéistes')).toBe('ÉP');
    expect(abbreviation('Brutes du portail n°2')).toBe('BR2');
  });
});
