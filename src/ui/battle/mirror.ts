// Ce que l'écran montre, tenu à jour en recopiant les valeurs que portent les événements du
// moteur (case d'arrivée, moral et blessés après un coup, structure après un coup…). Aucune
// règle n'est recalculée ici. À chaque fin de tour, la copie se recale sur la photo du moteur.

import type { BattleEvent } from '../../engine/battle/events';
import { moraleTier } from '../../engine/battle/morale';
import type { BattleSquad, BattleState, FallenGroup } from '../../engine/battle/state';
import type { Cell, GameData } from '../../engine/data/types';

export type Tier = 'steady' | 'shaken' | 'wavering' | 'fleeing';

export interface SquadView {
  id: string;
  name: string;
  side: 'player' | 'enemy';
  cell: Cell;
  morale: number;
  maxMorale: number;
  wounded: number;
  soldiers: number;
  /** Sur le terrain (au combat ou en fuite) ; false une fois sortie. */
  onField: boolean;
  fleeing: boolean;
  /** Tours de brûlure restants (0 : ne brûle pas). */
  burning: number;
}

export interface FortView {
  site: string;
  kind: 'barrier' | 'occupiable';
  cell: Cell;
  structure: number;
  maxStructure: number;
  burning: number;
}

export interface Mirror {
  squads: SquadView[];
  forts: FortView[];
  fallen: FallenGroup[];
}

function squadView(s: BattleSquad): SquadView {
  return {
    id: s.id,
    name: s.name,
    side: s.side,
    cell: { ...s.cell },
    morale: s.morale,
    maxMorale: s.stats.maxMorale,
    wounded: s.wounded,
    soldiers: s.stats.soldiers,
    onField: s.status === 'active' || s.status === 'fleeing',
    fleeing: s.status === 'fleeing',
    burning: s.burning?.turnsLeft ?? 0,
  };
}

/** La copie fidèle d'un état du moteur. */
export function mirrorOf(state: BattleState): Mirror {
  return {
    squads: state.squads.map(squadView),
    forts: state.fortifications.map((f) => ({
      site: f.site,
      kind: f.kind,
      cell: { ...f.cell },
      structure: f.structure,
      maxStructure: f.maxStructure,
      burning: f.burning?.turnsLeft ?? 0,
    })),
    fallen: structuredClone(state.fallen),
  };
}

/** Le palier affiché : celui du moteur (moraleTier), ou « en fuite ». */
export function tierOf(data: GameData, squad: SquadView): Tier {
  return squad.fleeing ? 'fleeing' : moraleTier(squad.morale, squad.maxMorale, data.config);
}

function squad(mirror: Mirror, id: string): SquadView | undefined {
  return mirror.squads.find((s) => s.id === id);
}

function fort(mirror: Mirror, site: string): FortView | undefined {
  return mirror.forts.find((f) => f.site === site);
}

function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

/**
 * Applique un événement à la copie. `turnState` est l'état du moteur à la fin du tour en cours :
 * il fournit ce qui ne change pas (nom, moral maximum) d'un ennemi qui vient d'arriver.
 */
export function applyEvent(mirror: Mirror, event: BattleEvent, turnState: BattleState): void {
  switch (event.type) {
    case 'arrival': {
      const engine = turnState.squads.find((s) => s.id === event.squad)!;
      const view = squadView(engine);
      Object.assign(view, { cell: { ...event.cell }, morale: engine.stats.maxMorale, wounded: 0, onField: true, fleeing: false, burning: 0 });
      mirror.squads = [...mirror.squads.filter((s) => s.id !== view.id), view];
      return;
    }
    case 'move': {
      const s = squad(mirror, event.squad);
      if (s) s.cell = { ...event.to };
      return;
    }
    case 'shot':
    case 'strike': {
      const s = squad(mirror, event.target);
      if (s) Object.assign(s, { morale: event.applied.moraleAfter, wounded: event.applied.woundedAfter });
      return;
    }
    case 'burn': {
      const s = squad(mirror, event.squad);
      if (s) Object.assign(s, { morale: event.applied.moraleAfter, wounded: event.applied.woundedAfter, burning: event.turnsLeft });
      return;
    }
    case 'ignite': {
      const s = squad(mirror, event.target);
      if (s) Object.assign(s, { morale: event.moraleAfter, burning: event.burn?.turnsLeft ?? s.burning });
      const f = event.site === undefined ? undefined : fort(mirror, event.site);
      if (f && event.burn) f.burning = event.burn.turnsLeft;
      return;
    }
    case 'fortificationHit': {
      const f = fort(mirror, event.site);
      if (f) f.structure = event.after;
      return;
    }
    case 'fortificationBurn': {
      const f = fort(mirror, event.site);
      if (f) Object.assign(f, { structure: event.after, burning: event.after > 0 ? event.turnsLeft : 0 });
      return;
    }
    case 'fortificationDestroyed': {
      const f = fort(mirror, event.site);
      if (f) Object.assign(f, { structure: 0, burning: 0 });
      return;
    }
    case 'rout': {
      const s = squad(mirror, event.squad);
      if (s) s.fleeing = true;
      return;
    }
    case 'breach':
    case 'fled':
    case 'dispersed': {
      const s = squad(mirror, event.squad);
      if (s) Object.assign(s, { onField: false, fleeing: false, burning: 0 });
      return;
    }
    case 'fallen': {
      const s = squad(mirror, event.squad);
      if (s) s.wounded -= event.count;
      mirror.fallen.push({ squad: event.squad, cell: { ...event.cell }, count: event.count, heldTurns: 0 });
      return;
    }
    case 'fallenHeld': {
      const g = mirror.fallen.find((f) => f.squad === event.squad && sameCell(f.cell, event.cell));
      if (g) g.heldTurns = event.turns;
      return;
    }
    case 'fallenRecovered': {
      const s = squad(mirror, event.squad);
      if (s) s.wounded = Math.min(s.soldiers, s.wounded + event.count);
      mirror.fallen = mirror.fallen.filter((f) => !(f.squad === event.squad && sameCell(f.cell, event.cell)));
      return;
    }
    case 'fallenDied': {
      mirror.fallen = mirror.fallen.filter((f) => !(f.squad === event.squad && sameCell(f.cell, event.cell)));
      return;
    }
    case 'turnEnd':
      // Recalage sur la photo du moteur en fin de tour : la copie doit déjà concorder (testé).
      for (const s of mirror.squads) {
        const snap = event.squads.find((x) => x.id === s.id);
        if (!snap) Object.assign(s, { onField: false, fleeing: false });
        else Object.assign(s, { cell: { ...snap.cell }, morale: snap.morale, wounded: snap.wounded, onField: true, fleeing: snap.fleeing === true });
      }
      mirror.fallen = structuredClone(event.fallen);
      return;
    default:
      return;
  }
}
