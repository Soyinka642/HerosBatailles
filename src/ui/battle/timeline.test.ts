import { describe, expect, it } from 'vitest';
import { CATALOG, catalogEntry } from '../../engine/battle/catalog';
import { loadGameData } from '../../engine/data/load';
import { recordBattle } from './record';
import { buildTimeline } from './timeline';

const data = loadGameData();

describe('temps d’animation', () => {
  it.each(CATALOG.map((e) => [e.id, e] as const))('%s : chaque événement est dans un temps, dans l’ordre', (_id, entry) => {
    const recorded = recordBattle(data, entry.setup(data));
    const beats = buildTimeline(recorded);
    expect(beats.flatMap((b) => b.events)).toEqual(recorded.turns.flatMap((t) => t.events));
    expect(beats.at(-1)?.kind).toBe('end');
  });

  it('un tour de la vague 1 : début, arrivées, pas, tir, mêlée, fin', () => {
    const beats = buildTimeline(recordBattle(data, catalogEntry('vague-1-derriere-la-palissade').setup(data)));
    expect(beats.filter((b) => b.turn === 1).map((b) => b.kind + (b.step ? b.step : ''))).toEqual(['turnStart', 'arrivals', 'step1', 'turnEnd']);
    const turn7 = beats.filter((b) => b.turn === 7).map((b) => b.kind);
    expect(turn7).toEqual(['turnStart', 'step', 'fire', 'melee', 'turnEnd']);
  });

  it('la déroute rejoint le temps qui la provoque', () => {
    const beats = buildTimeline(recordBattle(data, catalogEntry('vague-1-derriere-la-palissade').setup(data)));
    const routBeat = beats.find((b) => b.events.some((e) => e.type === 'rout'));
    expect(routBeat?.kind).toBe('melee');
  });
});
