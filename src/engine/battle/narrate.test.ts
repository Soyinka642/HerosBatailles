import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data/load';
import { runBattle } from './battle';
import { type DamageBreakdown, computeDamage } from './damage';
import { formatDamage, formatNumber, narrateBattle, narrateEvent, of } from './narrate';
import { fromTemplate } from './setup';
import { ADVANCE, HOLD } from './test-helpers';

const data = loadGameData();
const names = { name: (id: string) => ({ epeistes: 'Épéistes', piquiers: 'Piquiers' })[id] ?? id, maxMorale: () => 16 };

function damage(input: Partial<Parameters<typeof computeDamage>[0]>): DamageBreakdown {
  return computeDamage(
    { attack: 6, bonuses: [], defense: 2, ignoreDefense: [], tier: 'steady', efficiency: 1, wounded: 0, soldiers: 20, ...input },
    data.config,
  );
}

describe('texte des dégâts', () => {
  it('nombres à la française', () => {
    expect(formatNumber(4.86)).toBe('4,86');
    expect(formatNumber(0.9)).toBe('0,9');
    expect(formatNumber(-3)).toBe('−3');
  });

  it('élision devant une voyelle', () => {
    expect(of('Épéistes')).toBe("d'Épéistes");
    expect(of('Archers')).toBe("d'Archers");
    expect(of('Piquiers')).toBe('de Piquiers');
  });

  it('soustraction simple', () => {
    expect(formatDamage(data, names, damage({}))).toBe('6 − 2 = 4 dégâts');
  });

  it('bonus, moral, blessés et arrondi', () => {
    const d = damage({ bonuses: [{ keyword: 'soutien', from: 'piquiers', amount: 2 }], tier: 'shaken', efficiency: 0.9, wounded: 2 });
    expect(formatDamage(data, names, d)).toBe('6 + 2 (Soutien de Piquiers) − 2 = 6 × 0,9 (ébranlés) × 0,9 (2 blessés sur 20) = 4,86 → 5 dégâts');
    const one = damage({ wounded: 1 });
    expect(formatDamage(data, names, one)).toBe('6 − 2 = 4 × 0,95 (1 blessé sur 20) = 3,8 → 4 dégâts');
  });

  it('Perce-armure et minimum', () => {
    expect(formatDamage(data, names, damage({ defense: 3, ignoreDefense: [{ keyword: 'perce-armure', amount: 2 }] }))).toBe(
      '6 − 1 (défense 3, Perce-armure 2) = 5 dégâts',
    );
    expect(formatDamage(data, names, damage({ attack: 1, defense: 4 }))).toBe('1 − 4 = −3 → minimum 1 dégât');
  });

  it('une frappe complète', () => {
    const line = narrateEvent(data, names, {
      type: 'strike',
      attacker: 'epeistes',
      target: 'fantassins',
      damage: damage({}),
      applied: { amount: 4, moraleBefore: 12, moraleAfter: 8, woundedBefore: 0, woundedAfter: 2 },
    });
    expect(line).toBe('  Épéistes frappent fantassins : 6 − 2 = 4 dégâts ; moral 12 → 8, blessés 0 → 2 ; ils sont ébranlés.');
  });
});

describe('déterminisme', () => {
  it('la même bataille jouée deux fois donne le même journal', () => {
    const setup = () => ({
      wave: data.waves[3]!,
      squads: [
        fromTemplate(data, 'epeistes', { cell: { col: 3, row: 1 }, order: ADVANCE }),
        fromTemplate(data, 'piquiers', { cell: { col: 2, row: 1 }, order: ADVANCE }),
        fromTemplate(data, 'archers', { cell: { col: 1, row: 2 }, order: HOLD }),
        fromTemplate(data, 'epeistes', { id: 'epeistes-2', name: 'Épéistes de la garde', cell: { col: 3, row: 3 }, order: HOLD }),
      ],
    });
    const first = runBattle(data, setup());
    const second = runBattle(data, setup());
    expect(second.events).toEqual(first.events);
    expect(narrateBattle(data, second)).toBe(narrateBattle(data, first));
  });
});
