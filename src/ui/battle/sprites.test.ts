import { describe, expect, it } from 'vitest';
import { allSpriteKeys, spriteOf } from './sprites';

describe('sprites des escouades', () => {
  it('arme + armure donnent le sprite', () => {
    expect(spriteOf({ equipment: { arme: 'epee', armure: 'mailles' } })?.key).toBe('EpeisteMailles');
    expect(spriteOf({ equipment: { arme: 'arc-court' } })?.key).toBe('ArcherSansArmure');
  });

  it('l’archer en plates prend le sprite en mailles (pas de sprite dédié)', () => {
    expect(spriteOf({ equipment: { arme: 'arc-court', armure: 'plates' } })?.key).toBe('ArcherMailles');
  });

  it('sans arme : pas de sprite, le jeton provisoire reste', () => {
    expect(spriteOf({ equipment: { armure: 'cuir' } })).toBeUndefined();
  });

  it('les brutes sont plus grandes et plus sombres', () => {
    expect(spriteOf({ enemy: 'brutes-du-portail' })).toEqual({ key: 'EpeistePlates', scale: 1.25, dark: true });
    expect(spriteOf({ enemy: 'fantassins-du-portail' })).toEqual({ key: 'EpeisteMailles', scale: 1, dark: false });
  });

  it('chaque sprite prévu existe dans assets/unites/', () => {
    const files = Object.keys(import.meta.glob('../../../assets/unites/*.webp'));
    for (const key of allSpriteKeys()) expect(files, key).toContain(`../../../assets/unites/${key}.webp`);
  });
});
