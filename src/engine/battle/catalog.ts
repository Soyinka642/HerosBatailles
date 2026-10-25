// Catalogue des batailles déjà écrites : les vagues avec le déploiement « sensé », et des
// scénarios parlants. L'affichage (lot 1.3) propose de les regarder ; les tests de scénarios
// les jouent et versionnent leur journal. En attendant l'écran de préparation (lot 1.4).

import type { Cell, GameData, Id, Wave } from '../data/types';
import type { FortificationSetup } from './fortifications';
import { type BattleSetup, type PlayerSquadSetup, fromTemplate } from './setup';
import type { Order } from './types';

export const HOLD: Order = { plannedTurns: [], posture: 'tenir' };

/** Un premier tour planifié, puis Tenir. */
export function holdAfter(...steps: Order['plannedTurns'][number]['steps']): Order {
  return { plannedTurns: [{ steps }], posture: 'tenir' };
}

/** Tous les sites du terrain, bâtis et intacts. */
export const ALL_FORTIFICATIONS: FortificationSetup[] = [
  { site: 'tour' },
  { site: 'palissade-nord' },
  { site: 'palissade-centre-nord' },
  { site: 'palissade-centre-sud' },
  { site: 'palissade-sud' },
];

export function squad(data: GameData, template: Id, cell: Cell, order: Order = HOLD, id?: string): PlayerSquadSetup {
  return fromTemplate(data, template, { cell, order, ...(id === undefined ? {} : { id }) });
}

/** Archers aux flèches enflammées, avec `paste` unités de pâte incendiaire. */
export function fireArchers(data: GameData, cell: Cell, paste: number, order: Order = HOLD, id?: string): PlayerSquadSetup {
  const archers = squad(data, 'archers', cell, order, id);
  archers.upgrades = { arme: { fleches: 'fleches-enflammees' } };
  archers.carried = { 'pate-incendiaire': paste };
  return archers;
}

/**
 * Le déploiement « sensé » : les Épéistes avancent d'une case au premier tour pour tenir la
 * brèche (4,2) ; les Piquiers entrent au même pas dans la case qu'ils libèrent, juste derrière
 * eux, pour le Soutien ; les Archers tiennent la tour (2,2). Sans `paste`, pas de flèches enflammées.
 */
export function sensibleSquads(data: GameData, paste?: number): PlayerSquadSetup[] {
  const archers = paste === undefined ? squad(data, 'archers', { col: 2, row: 2 }) : fireArchers(data, { col: 2, row: 2 }, paste);
  return [
    squad(data, 'epeistes', { col: 3, row: 2 }, holdAfter({ col: 4, row: 2 })),
    squad(data, 'piquiers', { col: 3, row: 1 }, holdAfter({ col: 3, row: 2 })),
    archers,
  ];
}

/**
 * Vagues 1 et 2 sans flèches enflammées ; vagues 3, 4 et finale avec le forgeron et 4 unités
 * de pâte. Vague 4 et finale : une 4ᵉ escouade (un civil recruté), des Archers en renfort en (3,0).
 */
export function sensibleSetup(data: GameData, wave: Wave): BattleSetup {
  const withFire = wave.index >= 3;
  const squads = sensibleSquads(data, withFire ? 4 : undefined);
  if (wave.index >= 4) squads.push(fromTemplate(data, 'archers', { id: 'archers-en-renfort', name: 'Archers en renfort', cell: { col: 3, row: 0 }, order: HOLD }));
  return { wave, squads, fortifications: ALL_FORTIFICATIONS, unlocks: withFire ? ['forgeron'] : [] };
}

function scenarioWave(arrivals: Wave['arrivals']): Wave {
  return { id: 'scenario', index: 1, kind: 'wave', arrivals };
}

export interface CatalogEntry {
  /** Identifiant, qui est aussi le nom du journal versionné dans scenarios/. */
  id: string;
  title: string;
  description: string;
  setup(data: GameData): BattleSetup;
}

function waveEntry(id: string, title: string, description: string, index: number): CatalogEntry {
  return { id, title, description, setup: (data) => sensibleSetup(data, data.waves[index]!) };
}

export const CATALOG: readonly CatalogEntry[] = [
  waveEntry('vague-1-derriere-la-palissade', 'Vague 1', 'Deux fantassins contre la palissade et la brèche.', 0),
  waveEntry('vague-2-complete', 'Vague 2', 'Des tireurs ennemis ajoutent la pression à distance.', 1),
  waveEntry('vague-3-complete', 'Vague 3', 'Une brute teste la palissade ; flèches enflammées.', 2),
  waveEntry('vague-4-complete', 'Vague 4', 'Deux fronts, avec des archers en renfort.', 3),
  waveEntry('bataille-finale-complete', 'Bataille finale', 'Tenir douze tours pendant le rituel de fermeture.', 4),
  {
    id: 'palissade-assiegee-puis-brisee',
    title: 'La palissade brisée',
    description: 'Une brute défonce la palissade sous les flèches.',
    setup: (data) => ({
      wave: scenarioWave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 1 }]),
      squads: [squad(data, 'epeistes', { col: 3, row: 1 }), squad(data, 'archers', { col: 2, row: 2 })],
      fortifications: ALL_FORTIFICATIONS,
    }),
  },
  {
    id: 'tour-prise-par-l-ennemi',
    title: 'La tour prise',
    description: 'Une brute chasse les archers de la tour et file au campement.',
    setup: (data) => ({
      wave: scenarioWave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 }]),
      squads: [squad(data, 'archers', { col: 2, row: 2 }), squad(data, 'epeistes', { col: 3, row: 0 })],
      fortifications: ALL_FORTIFICATIONS,
    }),
  },
  {
    id: 'feu-sur-la-tour',
    title: 'Le Feu sur la tour',
    description: 'Une brute retenue dans la tour : la volée enflammée brûle aussi la tour.',
    setup: (data) => ({
      wave: scenarioWave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 }]),
      squads: [squad(data, 'epeistes', { col: 1, row: 2 }), fireArchers(data, { col: 1, row: 0 }, 4)],
      fortifications: ALL_FORTIFICATIONS,
      unlocks: ['forgeron'],
    }),
  },
  {
    id: 'incursion-par-une-breche',
    title: 'Une incursion',
    description: 'Une palissade abîmée cède ; un fantassin atteint le cœur du campement.',
    setup: (data) => ({
      wave: scenarioWave([{ turn: 1, enemy: 'fantassins-du-portail', count: 1, row: 3 }]),
      squads: [squad(data, 'epeistes', { col: 3, row: 1 }), squad(data, 'archers', { col: 2, row: 0 })],
      fortifications: [...ALL_FORTIFICATIONS.filter((f) => f.site !== 'palissade-centre-sud'), { site: 'palissade-centre-sud', structure: 6 }],
    }),
  },
  {
    id: 'pate-epuisee',
    title: 'La pâte épuisée',
    description: 'Trois brutes, deux unités de pâte : la troisième volée part normale.',
    setup: (data) => ({
      wave: scenarioWave([
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 1 },
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 },
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 3 },
      ]),
      squads: sensibleSquads(data, 2),
      fortifications: ALL_FORTIFICATIONS,
      unlocks: ['forgeron'],
    }),
  },
  {
    id: 'tombes-repris-a-temps',
    title: 'Les tombés repris',
    description: 'Les épéistes cèdent dans la brèche ; les piquiers relèvent leurs blessés.',
    setup: (data) => ({
      wave: scenarioWave([{ turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 }]),
      squads: [squad(data, 'epeistes', { col: 3, row: 2 }, holdAfter({ col: 4, row: 2 })), squad(data, 'piquiers', { col: 3, row: 1 }, holdAfter({ col: 3, row: 2 }))],
      fortifications: ALL_FORTIFICATIONS,
    }),
  },
  {
    id: 'tombes-perdus',
    title: 'Les tombés perdus',
    description: "L'ennemi tient la case où gisent nos blessés : ils meurent.",
    setup: (data) => ({
      wave: scenarioWave([
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 },
        { turn: 2, enemy: 'tireurs-du-portail', count: 1, row: 2 },
      ]),
      squads: [squad(data, 'epeistes', { col: 3, row: 2 }), squad(data, 'archers', { col: 1, row: 4 })],
    }),
  },
  {
    id: 'fuite-debandade',
    title: 'La débandade',
    description: 'Des épéistes en fuite, cernés par leurs propres alliés, se débandent.',
    setup: (data) => ({
      wave: scenarioWave([
        { turn: 1, enemy: 'brutes-du-portail', count: 1, row: 2 },
        { turn: 2, enemy: 'brutes-du-portail', count: 1, row: 2 },
      ]),
      squads: [
        squad(data, 'epeistes', { col: 3, row: 2 }),
        squad(data, 'piquiers', { col: 2, row: 2 }),
        squad(data, 'archers', { col: 2, row: 1 }),
        squad(data, 'archers', { col: 2, row: 3 }, HOLD, 'archers-2'),
      ],
    }),
  },
];

export function catalogEntry(id: string): CatalogEntry {
  const entry = CATALOG.find((e) => e.id === id);
  if (!entry) throw new Error(`Bataille inconnue au catalogue : ${id}`);
  return entry;
}
