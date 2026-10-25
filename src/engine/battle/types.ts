// Formats de ce que le joueur décide pour une bataille : ordres et consommables portés.
// Ce ne sont pas des données de contenu (src/data/) mais l'entrée du futur moteur (lot 1.2).

import type { Cell, Id } from '../data/types';

/** Un pas d'un trajet planifié : une case voisine de la précédente, ou « wait » pour rester sur place. */
export type PlannedStep = Cell | 'wait';

/**
 * Un tour fixé au déploiement. Au prototype, il ne sert qu'au placement : la phase de tir
 * de ce tour suit la règle par défaut. Le tir planifié viendra avec le deuxième tour planifié.
 */
export interface PlannedTurn {
  /** Au plus `vitesse` pas ; liste vide = ne pas bouger de ce tour. */
  steps: PlannedStep[];
}

/** Ordre donné au déploiement : des tours planifiés, puis une posture pour le reste de la bataille. */
export interface Order {
  /** Au plus autant de tours que d'emplacements débloqués dans orders.json. */
  plannedTurns: PlannedTurn[];
  posture: Id;
}

/** Consommables portés par une escouade : id de consommable → quantité. */
export type Carried = Record<Id, number>;

/** Modificateur du moral maximum (étendard, sergent, épreuves vécues…) ; aucun au prototype. */
export interface MoraleModifier {
  source: string;
  amount: number;
}
