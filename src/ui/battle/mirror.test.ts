import { describe, expect, it } from 'vitest';
import { CATALOG } from '../../engine/battle/catalog';
import { loadGameData } from '../../engine/data/load';
import { type Mirror, applyEvent, mirrorOf } from './mirror';
import { recordBattle } from './record';

const data = loadGameData();

/** Ce que la photo de fin de tour du moteur permet de comparer. */
function onField(mirror: Mirror) {
  return mirror.squads
    .filter((s) => s.onField)
    .map((s) => ({ id: s.id, cell: s.cell, morale: s.morale, maxMorale: s.maxMorale, wounded: s.wounded, ...(s.fleeing ? { fleeing: true } : {}) }));
}

describe('copie affichée', () => {
  it.each(CATALOG.map((e) => [e.id, e] as const))('%s : concorde avec le moteur à chaque fin de tour', (_id, entry) => {
    const recorded = recordBattle(data, entry.setup(data));
    const mirror = mirrorOf(recorded.initial);
    for (const turn of recorded.turns) {
      for (const event of turn.events) {
        if (event.type === 'turnEnd') {
          expect(onField(mirror)).toEqual(event.squads);
          expect(mirror.fallen).toEqual(event.fallen);
        }
        applyEvent(mirror, event, turn.state);
      }
      expect(mirror.forts.map((f) => f.structure)).toEqual(turn.state.fortifications.map((f) => f.structure));
    }
    // Après les tombés de fin de bataille, les blessés concordent avec l'état final.
    const final = recorded.turns.at(-1)!.state;
    expect(mirror.squads.map((s) => [s.id, s.wounded])).toEqual(final.squads.map((s) => [s.id, s.wounded]));
  });
});
