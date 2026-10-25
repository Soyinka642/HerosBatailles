import { describe, expect, it } from 'vitest';
import { Player, type Stage } from './player';
import type { Beat, BeatKind } from './timeline';

function beat(turn: number, kind: BeatKind): Beat {
  return { turn, kind, events: [] };
}

const BEATS = [beat(1, 'turnStart'), beat(1, 'step'), beat(1, 'turnEnd'), beat(2, 'turnStart'), beat(2, 'melee'), beat(2, 'turnEnd'), beat(2, 'end')];

/** Un plateau qui note ce qu'on lui fait jouer. */
function stage(): Stage & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    play: async (b, animated, speed) => {
      log.push(`${b.turn}:${b.kind}:${animated ? 'animé' : 'direct'}:x${speed}`);
    },
    reset: () => {
      log.push('reset');
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('lecteur', () => {
  it('la lecture joue tous les temps, animés, jusqu’à la fin', async () => {
    const s = stage();
    const player = new Player(BEATS, s);
    player.play();
    await settle();
    expect(s.log).toHaveLength(BEATS.length);
    expect(s.log[0]).toBe('1:turnStart:animé:x1');
    expect(player.isDone).toBe(true);
    expect(player.isPlaying).toBe(false);
  });

  it('tour suivant : joue d’un coup jusqu’à la fin du tour', async () => {
    const s = stage();
    const player = new Player(BEATS, s);
    await player.nextTurn();
    expect(s.log).toEqual(['1:turnStart:direct:x1', '1:step:direct:x1', '1:turnEnd:direct:x1']);
    expect(player.turn).toBe(1);
    await player.nextTurn();
    expect(s.log.slice(3)).toEqual(['2:turnStart:direct:x1', '2:melee:direct:x1', '2:turnEnd:direct:x1', '2:end:direct:x1']);
    expect(player.isDone).toBe(true);
  });

  it('vitesse : ×0,5, ×1, ×2, ×4, bornée', () => {
    const player = new Player(BEATS, stage());
    player.slower();
    player.slower();
    expect(player.speed).toBe(0.5);
    for (let i = 0; i < 5; i++) player.faster();
    expect(player.speed).toBe(4);
  });

  it('recommencer : revient au début', async () => {
    const s = stage();
    const player = new Player(BEATS, s);
    await player.nextTurn();
    await player.restart();
    expect(s.log.at(-1)).toBe('reset');
    expect(player.turn).toBe(0);
    expect(player.isDone).toBe(false);
  });
});
