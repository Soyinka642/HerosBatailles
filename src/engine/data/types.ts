// Types des données de jeu chargées depuis src/data/*.json.
// Ils décrivent le contenu, pas l'état d'une partie ni d'une bataille.

export type Id = string;

/** Un déblocage nommé ; l'état de partie tiendra la liste de ceux obtenus. */
export interface Unlock {
  id: Id;
  name: string;
  description: string;
}

/** Tout ce qui peut être verrouillé : un seul mécanisme. Absent = disponible d'emblée. */
export interface Lockable {
  unlockedBy?: Id;
}

/** Emplacement d'escouade ou sous-emplacement d'objet : un seul type pour les deux. */
export interface SlotDef extends Lockable {
  id: Id;
  /** Catégories d'objets acceptées, ex. ["arc"]. */
  accepts: string[];
}

// --- Effets combinables : déclencheur, condition, cible, action ---

export const TRIGGERS = ['onAttack', 'onHit', 'whileOccupying'] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TARGETS = ['self', 'attackTarget'] as const;
export type Target = (typeof TARGETS)[number];

/** Un nombre, ou « X » : la valeur fournie par l'objet qui porte le mot-clé. */
export type Amount = number | 'X';

export type Condition =
  | { kind: 'movedAtLeast'; cells: number }
  | { kind: 'hasRangedAttack' };

export type Action =
  | { kind: 'ignoreDefense'; amount: Amount }
  | { kind: 'attackBonus'; amount: Amount }
  | { kind: 'defenseBonus'; amount: Amount }
  | { kind: 'rangeBonus'; amount: Amount }
  | { kind: 'delayedDamage'; amount: Amount; delayTurns: number }
  | { kind: 'moraleLoss'; amount: Amount };

export interface Effect {
  trigger: Trigger;
  condition?: Condition;
  target: Target;
  action: Action;
}

export interface Keyword {
  id: Id;
  /** Nom affiché, avec {X} si le mot-clé a un paramètre. */
  name: string;
  /** Texte du journal de bataille, avec {X} si besoin. */
  description: string;
  hasParameter: boolean;
  effects: Effect[];
}

/** Référence à un mot-clé ; x est obligatoire si et seulement si le mot-clé a un paramètre. */
export interface KeywordRef {
  id: Id;
  x?: number;
}

// --- Objets et escouades ---

/** Modificateurs ajoutés aux caractéristiques de base de l'escouade. */
export interface StatModifiers {
  meleeAttack?: number;
  rangedAttack?: number;
  range?: number;
  defense?: number;
  speed?: number;
}

/** Arme, armure ou amélioration (flèches enflammées…). */
export interface Item {
  id: Id;
  name: string;
  category: string;
  provisional?: boolean;
  stats: StatModifiers;
  keywords: KeywordRef[];
  upgradeSlots: SlotDef[];
}

export interface BaseStats {
  meleeAttack: number;
  rangedAttack: number;
  range: number;
  defense: number;
  speed: number;
  morale: number;
  soldiers: number;
}

/** Type d'escouade, du joueur comme de l'ennemi. */
export interface UnitType {
  id: Id;
  name: string;
  provisional?: boolean;
  stats: BaseStats;
  slots: SlotDef[];
  /** Id d'emplacement → id d'objet. */
  defaultEquipment: Record<Id, Id>;
  keywords: KeywordRef[];
}

export const MOVEMENTS = ['hold', 'advance'] as const;
export type Movement = (typeof MOVEMENTS)[number];

/** Posture : la donnée choisit un comportement dans la liste fermée MOVEMENTS. */
export interface Posture extends Lockable {
  id: Id;
  name: string;
  description: string;
  movement: Movement;
}

export const FORTIFICATION_KINDS = ['terrain', 'occupiable'] as const;
export type FortificationKind = (typeof FORTIFICATION_KINDS)[number];

export interface Fortification {
  id: Id;
  name: string;
  kind: FortificationKind;
  provisional?: boolean;
  /** Nombre d'escouades qui peuvent l'occuper ; uniquement pour « occupiable ». */
  capacity?: number;
  blocksMovement: boolean;
  effects: Effect[];
}

// --- Terrain et vagues ---

/** Les colonnes vont du campement (0) vers le portail ; les rangées sont les lignes de front. */
export interface Cell {
  col: number;
  row: number;
}

/** Rectangle de cases, bornes incluses. */
export interface Area {
  fromCol: number;
  toCol: number;
  fromRow: number;
  toRow: number;
}

export interface FortificationSite {
  fortification: Id;
  cell: Cell;
}

export interface Battlefield {
  provisional?: boolean;
  width: number;
  height: number;
  portal: Area;
  campHeart: Area;
  deploymentZone: Area;
  /** Emplacements où une fortification peut être bâtie (la construction relève du campement). */
  fortificationSites: FortificationSite[];
}

export interface Arrival {
  turn: number;
  enemy: Id;
  count: number;
  /** Rangée d'apparition ; absente = choisie par le moteur. */
  row?: number;
}

export const ANNOUNCEMENTS = ['full', 'partial'] as const;
export type Announcement = (typeof ANNOUNCEMENTS)[number];

export interface Wave {
  id: Id;
  index: number;
  isFinal: boolean;
  provisional?: boolean;
  announcement: Announcement;
  arrivals: Arrival[];
}

// --- Paramètres réglables (questions ouvertes de la conception) ---

export const DAMAGE_FORMULAS = ['subtraction', 'percentage'] as const;
export const RANGE_METRICS = ['manhattan', 'chebyshev', 'row'] as const;

export interface BattleConfig {
  provisional?: boolean;
  damage: {
    formula: (typeof DAMAGE_FORMULAS)[number];
    minimum: number;
    /** Formule en pourcentage : réduction par point de défense (0 à 1). */
    percentPerDefense: number;
  };
  morale: {
    /** Part du moral maximum (0 à 1) sous laquelle l'escouade est ébranlée, puis vacillante. */
    shakenBelow: number;
    waveringBelow: number;
    efficiency: { steady: number; shaken: number; wavering: number };
  };
  /** Puissance minimale (0 à 1) d'une escouade, quelle que soit la part de blessés. */
  wounded: { powerFloor: number };
  fallen: { turnsHeldBeforeDeath: number };
  field: { maxSquadsPerSide: number };
  range: { metric: (typeof RANGE_METRICS)[number] };
  flank: { attackBonus: number; extraMoraleLoss: number };
  pushback: { damageThreshold: number };
  passingFire: { damageFactor: number };
  encirclement: { extraLosses: number };
  maxTurns: number;
}

/** L'ensemble du contenu, validé. */
export interface GameData {
  unlocks: Unlock[];
  keywords: Keyword[];
  items: Item[];
  units: UnitType[];
  enemies: UnitType[];
  postures: Posture[];
  fortifications: Fortification[];
  battlefield: Battlefield;
  waves: Wave[];
  config: BattleConfig;
}
