// Découpe les événements du moteur en « temps » d'animation : tout ce qui se passe en même
// temps dans le moteur (un pas de mouvement, la phase de tir, la mêlée…) s'anime ensemble.

import type { BattleEvent } from '../../engine/battle/events';
import type { RecordedBattle } from './record';

export type BeatKind = 'turnStart' | 'arrivals' | 'burn' | 'step' | 'fire' | 'melee' | 'fallen' | 'turnEnd' | 'end';

export interface Beat {
  turn: number;
  kind: BeatKind;
  /** Numéro du pas, pour un temps de mouvement. */
  step?: number;
  events: BattleEvent[];
}

/** Durée d'un temps à la vitesse ×1, en millisecondes. */
export const BEAT_DURATION: Record<BeatKind, number> = {
  turnStart: 250,
  arrivals: 450,
  burn: 600,
  step: 450,
  fire: 700,
  melee: 700,
  fallen: 600,
  turnEnd: 150,
  end: 400,
};

/** Le temps qui ouvre un événement, ou undefined : il rejoint le temps en cours (déroute, sortie…). */
function opens(e: BattleEvent): { kind: BeatKind; step?: number } | undefined {
  switch (e.type) {
    case 'turnStart':
      return { kind: 'turnStart' };
    case 'arrival':
    case 'arrivalDelayed':
      return { kind: 'arrivals' };
    case 'burn':
    case 'fortificationBurn':
      return { kind: 'burn' };
    case 'move':
    case 'wait':
    case 'blocked':
    case 'halted':
      return { kind: 'step', step: e.step };
    case 'shot':
    case 'ignite':
      return { kind: 'fire' };
    case 'strike':
    case 'fortificationHit':
      return { kind: 'melee' };
    case 'fallenHeld':
      return { kind: 'fallen' };
    case 'fallenRecovered':
    case 'fallenDied':
      return e.atEnd ? { kind: 'end' } : { kind: 'fallen' };
    case 'turnEnd':
      return { kind: 'turnEnd' };
    case 'battleEnd':
      return { kind: 'end' };
    default:
      return undefined;
  }
}

export function buildTimeline(recorded: RecordedBattle): Beat[] {
  const beats: Beat[] = [];
  recorded.turns.forEach((turn, index) => {
    let current: Beat | undefined;
    for (const event of turn.events) {
      const open = opens(event);
      const same = open && current && current.kind === open.kind && current.step === open.step && open.kind !== 'turnStart';
      if (open && !same) {
        current = { turn: index + 1, kind: open.kind, ...(open.step === undefined ? {} : { step: open.step }), events: [] };
        beats.push(current);
      } else if (!open && (!current || current.kind === 'turnStart' || current.kind === 'turnEnd')) {
        // Une sortie au tout début du mouvement, avant le premier pas : un temps à part.
        current = { turn: index + 1, kind: 'step', step: 0, events: [] };
        beats.push(current);
      }
      current!.events.push(event);
    }
  });
  return beats;
}
