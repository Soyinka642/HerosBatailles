// Scénarios de bataille écrits à la main. Chaque journal, en français, est enregistré dans un
// fichier .txt versionné à côté de ce test : c'est la référence lisible du comportement du
// moteur. Après un changement de règle voulu, relire les .txt puis les regénérer (vitest -u).

import { describe, expect, it } from 'vitest';
import { loadGameData } from '../../data/load';
import type { Cell, Id, Wave } from '../../data/types';
import { runBattle } from '../battle';
import { narrateBattle } from '../narrate';
import { type PlayerSquadSetup, fromTemplate } from '../setup';
import { ADVANCE, HOLD } from '../test-helpers';
import type { Order } from '../types';

const data = loadGameData();
const FANTASSINS = 'fantassins-du-portail';

function wave(arrivals: Wave['arrivals']): Wave {
  return { id: 'scenario', index: 1, kind: 'wave', arrivals };
}

function our(template: Id, cell: Cell, order: Order, id?: string, name?: string): PlayerSquadSetup {
  return fromTemplate(data, template, { cell, order, ...(id ? { id } : {}), ...(name ? { name } : {}) });
}

function planned(posture: Id, ...steps: Order['plannedTurns'][number]['steps']): Order {
  return { plannedTurns: [{ steps }], posture };
}

async function play(file: string, w: Wave, squads: PlayerSquadSetup[]) {
  const result = runBattle(data, { wave: w, squads });
  await expect(narrateBattle(data, result)).toMatchFileSnapshot(`./${file}.txt`);
  return result;
}

describe('scénarios', () => {
  it('épéistes contre fantassins', async () => {
    const result = await play('epeistes-contre-fantassins', wave([{ turn: 1, enemy: FANTASSINS, count: 1, row: 2 }]), [
      our('epeistes', { col: 3, row: 2 }, HOLD),
    ]);
    expect(result.outcome.kind).toBe('victory');
  });

  it('piquiers en soutien derrière les épéistes', async () => {
    await play('piquiers-en-soutien', wave([{ turn: 1, enemy: FANTASSINS, count: 1, row: 2 }]), [
      our('epeistes', { col: 3, row: 2 }, HOLD),
      our('piquiers', { col: 2, row: 2 }, HOLD),
    ]);
  });

  it('piquiers sans maîtrise de la pique', async () => {
    const piquiers = our('piquiers', { col: 2, row: 2 }, HOLD, 'piquiers', 'Piquiers sans maîtrise');
    piquiers.masteries = [];
    await play('piquiers-sans-maitrise', wave([{ turn: 1, enemy: FANTASSINS, count: 1, row: 2 }]), [
      our('epeistes', { col: 3, row: 2 }, HOLD),
      piquiers,
    ]);
  });

  it('archers qui tirent puis subissent la mêlée', async () => {
    await play('archers-tirent-puis-melee', wave([{ turn: 1, enemy: FANTASSINS, count: 1, row: 2 }]), [
      our('archers', { col: 2, row: 2 }, HOLD),
    ]);
  });

  it('deux escouades visent la même case', async () => {
    const lourds = our('epeistes', { col: 3, row: 0 }, ADVANCE, 'epeistes-en-plates', 'Épéistes en plates');
    lourds.equipment.armure = 'plates';
    await play(
      'meme-case-visee',
      wave([
        { turn: 1, enemy: FANTASSINS, count: 1, row: 2 },
        { turn: 1, enemy: FANTASSINS, count: 1, row: 0 },
      ]),
      [our('epeistes', { col: 3, row: 2 }, ADVANCE), lourds],
    );
  });

  it('échange de cases et chaîne bloquée', async () => {
    await play('echange-et-chaine', wave([{ turn: 3, enemy: FANTASSINS, count: 1, row: 1 }]), [
      our('epeistes', { col: 3, row: 1 }, planned('tenir', { col: 2, row: 1 })),
      our('piquiers', { col: 2, row: 1 }, planned('tenir', { col: 3, row: 1 })),
      our('archers', { col: 1, row: 1 }, planned('tenir', { col: 2, row: 1 })),
    ]);
  });

  it('premier tour planifié, puis posture', async () => {
    await play('premier-tour-planifie', data.waves[0]!, [
      our('epeistes', { col: 2, row: 1 }, planned('tenir', { col: 3, row: 1 }, { col: 4, row: 1 })),
      our('piquiers', { col: 1, row: 1 }, planned('tenir', { col: 2, row: 1 }, { col: 3, row: 1 })),
      our('archers', { col: 1, row: 3 }, planned('tenir', 'wait', { col: 2, row: 3 })),
      our('epeistes', { col: 2, row: 4 }, planned('avancer', { col: 2, row: 3 }), 'epeistes-2', 'Épéistes de la garde'),
    ]);
  });

  it('Avancer : déviation vers un ennemi d’une autre rangée', async () => {
    await play('avancer-deviation', wave([{ turn: 1, enemy: FANTASSINS, count: 1, row: 4 }]), [
      our('epeistes', { col: 3, row: 0 }, ADVANCE),
    ]);
  });

  it('un tireur en Avancer s’arrête à portée', async () => {
    await play('tireur-avancer-s-arrete', wave([{ turn: 1, enemy: FANTASSINS, count: 1, row: 2 }]), [
      our('archers', { col: 1, row: 2 }, ADVANCE),
    ]);
  });

  it('brutes et Perce-armure', async () => {
    const lourds = our('epeistes', { col: 3, row: 2 }, HOLD, 'epeistes', 'Épéistes en plates');
    lourds.equipment.armure = 'plates';
    await play('brutes-perce-armure', wave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 }]), [
      lourds,
      our('archers', { col: 1, row: 2 }, HOLD),
    ]);
  });

  it('portail occupé', async () => {
    await play('portail-occupe', wave([{ turn: 1, enemy: FANTASSINS, count: 7 }]), [
      our('epeistes', { col: 3, row: 1 }, HOLD),
      our('piquiers', { col: 2, row: 1 }, HOLD),
      our('archers', { col: 1, row: 2 }, HOLD),
      our('epeistes', { col: 3, row: 3 }, HOLD, 'epeistes-2', 'Épéistes de la garde'),
    ]);
  });

  it('la vague 1 complète', async () => {
    await play('vague-1-complete', data.waves[0]!, [
      our('epeistes', { col: 3, row: 1 }, ADVANCE),
      our('piquiers', { col: 2, row: 1 }, ADVANCE),
      our('archers', { col: 2, row: 2 }, HOLD),
      our('epeistes', { col: 3, row: 3 }, ADVANCE, 'epeistes-2', 'Épéistes de la garde'),
    ]);
  });
});
