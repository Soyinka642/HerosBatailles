// Types des données de jeu chargées depuis src/data/*.json.
// Ils décrivent le contenu, pas l'état d'une partie ni d'une bataille
// (les ordres et les consommables portés sont dans src/engine/battle/types.ts).

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

/** Un emplacement, qu'il reçoive un objet ou non (tour planifié…). */
export interface Slot extends Lockable {
  id: Id;
}

/** Emplacement d'escouade ou sous-emplacement d'objet : un seul type pour les deux. */
export interface SlotDef extends Slot {
  /** Catégories d'objets acceptées, ex. ["arc"]. */
  accepts: string[];
}

// --- Effets combinables : déclencheur, condition, cible, action ---

export const TRIGGERS = [
  'onAttack',
  'onHit',
  'whileOccupying',
  /** Se tenir sur la case juste derrière une barrière, côté campement. */
  'whileBehind',
  /** L'allié juste devant, sur la même rangée, combat en mêlée. */
  'allyInFrontMelee',
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TARGETS = ['self', 'attackTarget', 'allyInFront'] as const;
export type Target = (typeof TARGETS)[number];

/** Un nombre, ou « X » : la valeur fournie par l'objet qui porte le mot-clé. */
export type Amount = number | 'X';

export const CONDITION_KINDS = ['movedStraightAtLeast', 'hasRangedAttack', 'incomingRanged'] as const;

export type Condition =
  /** A parcouru au moins `cells` cases en ligne droite sur sa rangée. */
  | { kind: 'movedStraightAtLeast'; cells: number }
  | { kind: 'hasRangedAttack' }
  /** L'attaque subie est un tir. */
  | { kind: 'incomingRanged' };

export const ACTION_KINDS = ['ignoreDefense', 'attackBonus', 'defenseBonus', 'rangeBonus', 'moraleLoss', 'burn'] as const;

export type Action =
  | { kind: 'ignoreDefense'; amount: Amount }
  | { kind: 'attackBonus'; amount: Amount }
  | { kind: 'defenseBonus'; amount: Amount }
  | { kind: 'rangeBonus'; amount: Amount }
  | { kind: 'moraleLoss'; amount: Amount }
  /** Brûlure : `amount` dégâts fixes, sans défense, au début de chacun des `turns` tours suivants ; rafraîchie, sans cumul. */
  | { kind: 'burn'; amount: Amount; turns: number };

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
  /** Chaque usage coûte une unité de ce consommable ; sans unité, le mot-clé ne s'applique pas. */
  consumes?: Id;
}

// --- Maîtrises et consommables ---

/** Une maîtrise d'arme : sans elle, l'arme perd ses capacités et donne un malus d'attaque (config). */
export interface Mastery {
  id: Id;
  name: string;
  description: string;
}

/** Ressource portée par les escouades et dépensée en bataille (la pâte des flèches enflammées…). */
export interface Consumable {
  id: Id;
  name: string;
  description: string;
  provisional?: boolean;
}

// --- Objets ---

export const ITEM_KINDS = ['weapon', 'armor', 'upgrade'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

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
  kind: ItemKind;
  category: string;
  provisional?: boolean;
  stats: StatModifiers;
  /** Capacités spéciales ; celles d'une arme exigent sa maîtrise, celles d'une amélioration non. */
  keywords: KeywordRef[];
  upgradeSlots: SlotDef[];
  /** Armes seulement (et obligatoire) : la maîtrise qui donne accès aux capacités et évite le malus. */
  mastery?: Id;
}

// --- Escouades du joueur : pas de type figé ---

/** Caractéristiques sans le moral, qui vient de config.morale.base. */
export interface SquadStats {
  meleeAttack: number;
  rangedAttack: number;
  range: number;
  defense: number;
  speed: number;
  soldiers: number;
}

/** Ce que toutes nos escouades ont en commun : chiffres = base + équipement. */
export interface SquadBase {
  provisional?: boolean;
  /** Valeurs à mains nues et sans armure. */
  stats: SquadStats;
  slots: SlotDef[];
}

/** Composition de départ : un équipement et des maîtrises, rien d'autre. */
export interface SquadTemplate {
  id: Id;
  name: string;
  provisional?: boolean;
  /** Id d'emplacement (de squad.json) → id d'objet. */
  equipment: Record<Id, Id>;
  masteries: Id[];
}

// --- Ennemis : format simplifié ---

export interface EnemyStats extends SquadStats {
  morale: number;
}

export interface Enemy {
  id: Id;
  name: string;
  provisional?: boolean;
  stats: EnemyStats;
  keywords: KeywordRef[];
  /** Comportement fixe, connu du joueur : une posture de postures.json. */
  posture: Id;
}

// --- Postures et ordres ---

export const MOVEMENTS = ['hold', 'advance'] as const;
export type Movement = (typeof MOVEMENTS)[number];

/** Posture : la donnée choisit un comportement dans la liste fermée MOVEMENTS. */
export interface Posture extends Lockable {
  id: Id;
  name: string;
  description: string;
  movement: Movement;
}

/** Profondeur des ordres : un ordre compte au plus autant de tours planifiés que d'emplacements débloqués. */
export interface OrderSlots {
  plannedTurnSlots: Slot[];
}

// --- Fortifications ---

export const FORTIFICATION_KINDS = ['barrier', 'occupiable'] as const;
export type FortificationKind = (typeof FORTIFICATION_KINDS)[number];

export const OCCUPANTS = ['ranged'] as const;

export interface Fortification {
  id: Id;
  name: string;
  kind: FortificationKind;
  provisional?: boolean;
  /** Nombre d'escouades qui peuvent l'occuper ; uniquement pour « occupiable ». */
  capacity?: number;
  /** Qui peut l'occuper ; absent = tout le monde. Uniquement pour « occupiable ». */
  occupants?: (typeof OCCUPANTS)[number];
  blocksMovement: boolean;
  /** Points de structure (les dégâts persistent après la bataille) ; absent = indestructible. */
  structure?: number;
  effects: Effect[];
}

// --- Terrain et batailles ---

/**
 * Case d'une grille hexagonale « pointe en haut », en coordonnées décalées « odd-r » :
 * les rangées impaires sont décalées d'un demi-hexagone vers l'est. Une rangée est une
 * ligne droite ; les colonnes vont du campement (0, à l'ouest) vers le portail.
 */
export interface Cell {
  col: number;
  row: number;
}

/** Rectangle de cases en coordonnées décalées, bornes incluses. */
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

/** Quatre vagues, puis la bataille finale pendant le rituel de fermeture. */
export const BATTLE_KINDS = ['wave', 'final'] as const;
export type BattleKind = (typeof BATTLE_KINDS)[number];

/** Une bataille du portail. L'annonce (complète ou partielle) découle de config.waves.fullyAnnounced. */
export interface Wave {
  id: Id;
  index: number;
  kind: BattleKind;
  provisional?: boolean;
  arrivals: Arrival[];
}

// --- Paramètres réglables (questions ouvertes de la conception) ---

export const DAMAGE_FORMULAS = ['subtraction', 'percentage'] as const;

export interface BattleConfig {
  provisional?: boolean;
  damage: {
    formula: (typeof DAMAGE_FORMULAS)[number];
    minimum: number;
    /** Formule en pourcentage : réduction par point de défense (0 à 1). */
    percentPerDefense: number;
  };
  morale: {
    /** Moral maximum commun, avant les modificateurs de l'escouade. */
    base: number;
    /** Part du moral maximum (0 à 1) sous laquelle l'escouade est ébranlée, puis vacillante. */
    shakenBelow: number;
    waveringBelow: number;
    efficiency: { steady: number; shaken: number; wavering: number };
  };
  /** Part minimale (0 à 1) de l'attaque, quelle que soit la part de blessés. */
  wounded: { attackFloor: number };
  /** Malus d'attaque d'une arme non maîtrisée. */
  mastery: { unmasteredAttackPenalty: number };
  /** Règle par défaut : défense minimale d'une cible pour qu'on l'enflamme. */
  fireArrows: { minTargetDefense: number };
  fallen: { turnsHeldBeforeDeath: number };
  field: { maxPlayerSquads: number };
  flank: { attackBonus: number; extraMoraleLoss: number };
  pushback: { damageThreshold: number };
  passingFire: { damageFactor: number };
  encirclement: { extraLosses: number };
  /** Nombre de premières batailles annoncées en entier ; les suivantes le sont en partie. */
  waves: { fullyAnnounced: number };
  /** Nombre de tours à tenir pendant le rituel de fermeture. */
  finalBattle: { ritualTurns: number };
  maxTurns: number;
}

/** L'ensemble du contenu, validé. */
export interface GameData {
  unlocks: Unlock[];
  keywords: Keyword[];
  masteries: Mastery[];
  consumables: Consumable[];
  items: Item[];
  squad: SquadBase;
  templates: SquadTemplate[];
  enemies: Enemy[];
  postures: Posture[];
  orders: OrderSlots;
  fortifications: Fortification[];
  battlefield: Battlefield;
  waves: Wave[];
  config: BattleConfig;
}
