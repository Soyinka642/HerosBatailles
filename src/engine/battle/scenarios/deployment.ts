// Le déploiement « sensé » des scénarios du lot 1.2c, commun aux vagues complètes :
// trois escouades derrière la palissade, toutes les fortifications bâties et intactes.
// - les Épéistes avancent d'une case au premier tour pour tenir la brèche (4,2), puis Tenir ;
// - les Piquiers entrent au même pas dans la case que les Épéistes libèrent, juste derrière
//   eux, pour le Soutien, puis Tenir ;
// - les Archers tiennent la tour (2,2).

import type { GameData, Wave } from '../../data/types';
import type { BattleSetup, PlayerSquadSetup } from '../setup';
import { ALL_FORTIFICATIONS, fireArchers, squad } from '../test-helpers';
import type { Order } from '../types';

const HOLD_AFTER = (steps: Order['plannedTurns'][number]['steps']): Order => ({ plannedTurns: [{ steps }], posture: 'tenir' });

/** Sans `paste`, les archers n'ont pas de flèches enflammées (vagues 1 et 2). */
export function sensibleSquads(data: GameData, paste?: number): PlayerSquadSetup[] {
  const archers = paste === undefined ? squad(data, 'archers', { col: 2, row: 2 }) : fireArchers(data, { col: 2, row: 2 }, paste);
  return [
    squad(data, 'epeistes', { col: 3, row: 2 }, HOLD_AFTER([{ col: 4, row: 2 }])),
    squad(data, 'piquiers', { col: 3, row: 1 }, HOLD_AFTER([{ col: 3, row: 2 }])),
    archers,
  ];
}

/** Vagues 1 et 2 sans flèches enflammées ; vagues 3, 4 et finale avec le forgeron et 4 unités de pâte. */
export function sensibleSetup(data: GameData, wave: Wave): BattleSetup {
  const withFire = wave.index >= 3;
  return {
    wave,
    squads: sensibleSquads(data, withFire ? 4 : undefined),
    fortifications: ALL_FORTIFICATIONS,
    unlocks: withFire ? ['forgeron'] : [],
  };
}
