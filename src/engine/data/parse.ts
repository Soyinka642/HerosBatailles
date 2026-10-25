// Première passe de validation : la forme de chaque fichier, prise isolément.
// Les références d'un fichier à l'autre sont vérifiées ensuite (references.ts).

import {
  type Ctx,
  child,
  checkNumber,
  readArray,
  readBoolean,
  readEnum,
  readList,
  readNumber,
  readObject,
  readOptionalBoolean,
  readOptionalNumber,
  readOptionalString,
  readString,
  report,
} from './reader';
import {
  ACTION_KINDS,
  BATTLE_KINDS,
  CONDITION_KINDS,
  DAMAGE_FORMULAS,
  FORTIFICATION_KINDS,
  ITEM_KINDS,
  MOVEMENTS,
  OCCUPANTS,
  TARGETS,
  TRIGGERS,
  type Action,
  type Amount,
  type Area,
  type BattleConfig,
  type Battlefield,
  type Cell,
  type Condition,
  type Consumable,
  type Effect,
  type Enemy,
  type EnemyStats,
  type Fortification,
  type FortificationSite,
  type GameData,
  type Item,
  type Keyword,
  type KeywordRef,
  type Mastery,
  type OrderSlots,
  type Posture,
  type Slot,
  type SlotDef,
  type SquadBase,
  type SquadStats,
  type SquadTemplate,
  type StatModifiers,
  type Unlock,
  type Wave,
} from './types';

/** Nom de fichier (dans src/data/) de chaque partie du contenu. */
export const DATA_FILES = {
  unlocks: 'unlocks.json',
  keywords: 'keywords.json',
  masteries: 'masteries.json',
  consumables: 'consumables.json',
  items: 'items.json',
  squad: 'squad.json',
  templates: 'templates.json',
  enemies: 'enemies.json',
  postures: 'postures.json',
  orders: 'orders.json',
  fortifications: 'fortifications.json',
  battlefield: 'battlefield.json',
  waves: 'waves.json',
  config: 'config.json',
} as const satisfies Record<keyof GameData, string>;

/** Contenu brut des fichiers JSON, encore non vérifié. */
export type RawGameData = Record<keyof GameData, unknown>;

const INT = { integer: true } as const;
const NATURAL = { integer: true, min: 0 } as const;
const POSITIVE = { integer: true, min: 1 } as const;
const FRACTION = { min: 0, max: 1 } as const;

// --- Briques communes ---

function setUnlockedBy(ctx: Ctx, o: Record<string, unknown>, path: string, target: { unlockedBy?: string }): void {
  const unlockedBy = readOptionalString(ctx, o, 'unlockedBy', path);
  if (unlockedBy !== undefined) target.unlockedBy = unlockedBy;
}

/** Emplacement sans objet (tour planifié…). */
function parseBareSlot(ctx: Ctx, value: unknown, path: string): Slot | undefined {
  const o = readObject(ctx, value, path, ['id', 'unlockedBy']);
  if (!o) return undefined;
  const slot: Slot = { id: readString(ctx, o, 'id', path) };
  setUnlockedBy(ctx, o, path, slot);
  return slot;
}

function parseSlot(ctx: Ctx, value: unknown, path: string): SlotDef | undefined {
  const o = readObject(ctx, value, path, ['id', 'accepts', 'unlockedBy']);
  if (!o) return undefined;
  const slot: SlotDef = {
    id: readString(ctx, o, 'id', path),
    accepts: readStrings(ctx, o, 'accepts', path),
  };
  setUnlockedBy(ctx, o, path, slot);
  return slot;
}

function readStrings(ctx: Ctx, o: Record<string, unknown>, key: string, path: string): string[] {
  return readArray(ctx, o, key, path, (v, p) => (typeof v === 'string' ? v : badString(ctx, v, p)));
}

function badString(ctx: Ctx, value: unknown, path: string): undefined {
  report(ctx, path, `chaîne attendue, reçu ${JSON.stringify(value)}`);
  return undefined;
}

function parseKeywordRef(ctx: Ctx, value: unknown, path: string): KeywordRef | undefined {
  const o = readObject(ctx, value, path, ['id', 'x', 'consumes']);
  if (!o) return undefined;
  const ref: KeywordRef = { id: readString(ctx, o, 'id', path) };
  const x = readOptionalNumber(ctx, o, 'x', path, NATURAL);
  if (x !== undefined) ref.x = x;
  const consumes = readOptionalString(ctx, o, 'consumes', path);
  if (consumes !== undefined) ref.consumes = consumes;
  return ref;
}

function parseAmount(ctx: Ctx, value: unknown, path: string): Amount {
  if (value === 'X') return 'X';
  return checkNumber(ctx, value, path, INT);
}

function parseCondition(ctx: Ctx, value: unknown, path: string): Condition | undefined {
  const head = readObject(ctx, value, path, ['kind', 'cells']);
  if (!head) return undefined;
  const kind = readEnum(ctx, head, 'kind', path, CONDITION_KINDS);
  if (kind === 'movedStraightAtLeast') return { kind, cells: readNumber(ctx, head, 'cells', path, POSITIVE) };
  readObject(ctx, value, path, ['kind']);
  return { kind };
}

function parseAction(ctx: Ctx, value: unknown, path: string): Action | undefined {
  const head = readObject(ctx, value, path, ['kind', 'amount', 'turns']);
  if (!head) return undefined;
  const kind = readEnum(ctx, head, 'kind', path, ACTION_KINDS);
  if (!('amount' in head)) report(ctx, child(path, 'amount'), 'champ obligatoire manquant');
  const amount = parseAmount(ctx, head['amount'], child(path, 'amount'));
  if (kind === 'burn') return { kind, amount, turns: readNumber(ctx, head, 'turns', path, POSITIVE) };
  readObject(ctx, value, path, ['kind', 'amount']);
  return { kind, amount };
}

function parseEffect(ctx: Ctx, value: unknown, path: string): Effect | undefined {
  const o = readObject(ctx, value, path, ['trigger', 'condition', 'target', 'action']);
  if (!o) return undefined;
  const action = parseAction(ctx, o['action'], child(path, 'action'));
  if (!action) return undefined;
  const effect: Effect = {
    trigger: readEnum(ctx, o, 'trigger', path, TRIGGERS),
    target: readEnum(ctx, o, 'target', path, TARGETS),
    action,
  };
  if ('condition' in o) {
    const condition = parseCondition(ctx, o['condition'], child(path, 'condition'));
    if (condition) effect.condition = condition;
  }
  return effect;
}

function parseCell(ctx: Ctx, value: unknown, path: string): Cell {
  const o = readObject(ctx, value, path, ['col', 'row']) ?? {};
  return { col: readNumber(ctx, o, 'col', path, NATURAL), row: readNumber(ctx, o, 'row', path, NATURAL) };
}

function parseArea(ctx: Ctx, value: unknown, path: string): Area {
  const o = readObject(ctx, value, path, ['fromCol', 'toCol', 'fromRow', 'toRow']) ?? {};
  const area = {
    fromCol: readNumber(ctx, o, 'fromCol', path, NATURAL),
    toCol: readNumber(ctx, o, 'toCol', path, NATURAL),
    fromRow: readNumber(ctx, o, 'fromRow', path, NATURAL),
    toRow: readNumber(ctx, o, 'toRow', path, NATURAL),
  };
  if (area.fromCol > area.toCol || area.fromRow > area.toRow) report(ctx, path, 'rectangle vide (début après la fin)');
  return area;
}

function setProvisional(ctx: Ctx, o: Record<string, unknown>, path: string, target: { provisional?: boolean }): void {
  const provisional = readOptionalBoolean(ctx, o, 'provisional', path);
  if (provisional !== undefined) target.provisional = provisional;
}

// --- Un analyseur par fichier ---

function parseUnlock(ctx: Ctx, value: unknown, path: string): Unlock | undefined {
  const o = readObject(ctx, value, path, ['id', 'name', 'description']);
  if (!o) return undefined;
  return { id: readString(ctx, o, 'id', path), name: readString(ctx, o, 'name', path), description: readString(ctx, o, 'description', path) };
}

function parseMastery(ctx: Ctx, value: unknown, path: string): Mastery | undefined {
  const o = readObject(ctx, value, path, ['id', 'name', 'description']);
  if (!o) return undefined;
  return { id: readString(ctx, o, 'id', path), name: readString(ctx, o, 'name', path), description: readString(ctx, o, 'description', path) };
}

function parseConsumable(ctx: Ctx, value: unknown, path: string): Consumable | undefined {
  const o = readObject(ctx, value, path, ['id', 'name', 'description', 'provisional']);
  if (!o) return undefined;
  const consumable: Consumable = { id: readString(ctx, o, 'id', path), name: readString(ctx, o, 'name', path), description: readString(ctx, o, 'description', path) };
  setProvisional(ctx, o, path, consumable);
  return consumable;
}

function parseKeyword(ctx: Ctx, value: unknown, path: string): Keyword | undefined {
  const o = readObject(ctx, value, path, ['id', 'name', 'description', 'hasParameter', 'effects']);
  if (!o) return undefined;
  return {
    id: readString(ctx, o, 'id', path),
    name: readString(ctx, o, 'name', path),
    description: readString(ctx, o, 'description', path),
    hasParameter: readBoolean(ctx, o, 'hasParameter', path),
    effects: readArray(ctx, o, 'effects', path, (v, p) => parseEffect(ctx, v, p)),
  };
}

const MODIFIER_KEYS = ['meleeAttack', 'rangedAttack', 'range', 'defense', 'speed'] as const;

function parseModifiers(ctx: Ctx, value: unknown, path: string): StatModifiers {
  const o = readObject(ctx, value, path, MODIFIER_KEYS) ?? {};
  const stats: StatModifiers = {};
  for (const key of MODIFIER_KEYS) {
    const n = readOptionalNumber(ctx, o, key, path, INT);
    if (n !== undefined) stats[key] = n;
  }
  return stats;
}

function parseItem(ctx: Ctx, value: unknown, path: string): Item | undefined {
  const o = readObject(ctx, value, path, ['id', 'name', 'kind', 'category', 'mastery', 'provisional', 'stats', 'keywords', 'upgradeSlots']);
  if (!o) return undefined;
  const item: Item = {
    id: readString(ctx, o, 'id', path),
    name: readString(ctx, o, 'name', path),
    kind: readEnum(ctx, o, 'kind', path, ITEM_KINDS),
    category: readString(ctx, o, 'category', path),
    stats: parseModifiers(ctx, o['stats'], child(path, 'stats')),
    keywords: readArray(ctx, o, 'keywords', path, (v, p) => parseKeywordRef(ctx, v, p)),
    upgradeSlots: readArray(ctx, o, 'upgradeSlots', path, (v, p) => parseSlot(ctx, v, p)),
  };
  const mastery = readOptionalString(ctx, o, 'mastery', path);
  if (item.kind === 'weapon' && mastery === undefined) report(ctx, child(path, 'mastery'), 'obligatoire pour une arme');
  if (item.kind !== 'weapon' && mastery !== undefined) report(ctx, child(path, 'mastery'), 'réservé aux armes');
  if (mastery !== undefined) item.mastery = mastery;
  setProvisional(ctx, o, path, item);
  return item;
}

const SQUAD_STAT_KEYS = ['meleeAttack', 'rangedAttack', 'range', 'defense', 'speed', 'soldiers'] as const;

function readSquadStats(ctx: Ctx, o: Record<string, unknown>, path: string): SquadStats {
  const read = (key: (typeof SQUAD_STAT_KEYS)[number], min: number): number => readNumber(ctx, o, key, path, { integer: true, min });
  return {
    meleeAttack: read('meleeAttack', 0),
    rangedAttack: read('rangedAttack', 0),
    range: read('range', 0),
    defense: read('defense', 0),
    speed: read('speed', 0),
    soldiers: read('soldiers', 1),
  };
}

function parseSquadBase(ctx: Ctx, value: unknown, path: string): SquadBase {
  const o = readObject(ctx, value, path, ['provisional', 'stats', 'slots']) ?? {};
  const statsPath = child(path, 'stats');
  const squad: SquadBase = {
    stats: readSquadStats(ctx, readObject(ctx, o['stats'], statsPath, SQUAD_STAT_KEYS) ?? {}, statsPath),
    slots: readArray(ctx, o, 'slots', path, (v, p) => parseSlot(ctx, v, p)),
  };
  setProvisional(ctx, o, path, squad);
  return squad;
}

function parseEnemyStats(ctx: Ctx, value: unknown, path: string): EnemyStats {
  const o = readObject(ctx, value, path, [...SQUAD_STAT_KEYS, 'morale']) ?? {};
  return { ...readSquadStats(ctx, o, path), morale: readNumber(ctx, o, 'morale', path, POSITIVE) };
}

function parseEquipment(ctx: Ctx, value: unknown, path: string): Record<string, string> {
  const o = readObject(ctx, value, path, Object.keys(value ?? {})) ?? {};
  const equipment: Record<string, string> = {};
  for (const [slot, item] of Object.entries(o)) {
    if (typeof item === 'string') equipment[slot] = item;
    else badString(ctx, item, child(path, slot));
  }
  return equipment;
}

function parseTemplate(ctx: Ctx, value: unknown, path: string): SquadTemplate | undefined {
  const o = readObject(ctx, value, path, ['id', 'name', 'provisional', 'equipment', 'masteries']);
  if (!o) return undefined;
  const template: SquadTemplate = {
    id: readString(ctx, o, 'id', path),
    name: readString(ctx, o, 'name', path),
    equipment: parseEquipment(ctx, o['equipment'], child(path, 'equipment')),
    masteries: readStrings(ctx, o, 'masteries', path),
  };
  setProvisional(ctx, o, path, template);
  return template;
}

function parseEnemy(ctx: Ctx, value: unknown, path: string): Enemy | undefined {
  const o = readObject(ctx, value, path, ['id', 'name', 'provisional', 'stats', 'keywords', 'posture']);
  if (!o) return undefined;
  const enemy: Enemy = {
    id: readString(ctx, o, 'id', path),
    name: readString(ctx, o, 'name', path),
    stats: parseEnemyStats(ctx, o['stats'], child(path, 'stats')),
    keywords: readArray(ctx, o, 'keywords', path, (v, p) => parseKeywordRef(ctx, v, p)),
    posture: readString(ctx, o, 'posture', path),
  };
  setProvisional(ctx, o, path, enemy);
  return enemy;
}

function parsePosture(ctx: Ctx, value: unknown, path: string): Posture | undefined {
  const o = readObject(ctx, value, path, ['id', 'name', 'description', 'movement', 'unlockedBy']);
  if (!o) return undefined;
  const posture: Posture = {
    id: readString(ctx, o, 'id', path),
    name: readString(ctx, o, 'name', path),
    description: readString(ctx, o, 'description', path),
    movement: readEnum(ctx, o, 'movement', path, MOVEMENTS),
  };
  setUnlockedBy(ctx, o, path, posture);
  return posture;
}

function parseOrderSlots(ctx: Ctx, value: unknown, path: string): OrderSlots {
  const o = readObject(ctx, value, path, ['plannedTurnSlots']) ?? {};
  return { plannedTurnSlots: readArray(ctx, o, 'plannedTurnSlots', path, (v, p) => parseBareSlot(ctx, v, p)) };
}

function parseFortification(ctx: Ctx, value: unknown, path: string): Fortification | undefined {
  const o = readObject(ctx, value, path, ['id', 'name', 'kind', 'provisional', 'capacity', 'occupants', 'blocksMovement', 'structure', 'effects']);
  if (!o) return undefined;
  const fortification: Fortification = {
    id: readString(ctx, o, 'id', path),
    name: readString(ctx, o, 'name', path),
    kind: readEnum(ctx, o, 'kind', path, FORTIFICATION_KINDS),
    blocksMovement: readBoolean(ctx, o, 'blocksMovement', path),
    effects: readArray(ctx, o, 'effects', path, (v, p) => parseEffect(ctx, v, p)),
  };
  const occupiable = fortification.kind === 'occupiable';
  const capacity = readOptionalNumber(ctx, o, 'capacity', path, POSITIVE);
  if (occupiable && capacity === undefined) report(ctx, child(path, 'capacity'), 'obligatoire pour une fortification à occuper');
  if (!occupiable && capacity !== undefined) report(ctx, child(path, 'capacity'), 'réservé aux fortifications à occuper');
  if (capacity !== undefined) fortification.capacity = capacity;
  if ('occupants' in o) {
    if (!occupiable) report(ctx, child(path, 'occupants'), 'réservé aux fortifications à occuper');
    fortification.occupants = readEnum(ctx, o, 'occupants', path, OCCUPANTS);
  }
  const structure = readOptionalNumber(ctx, o, 'structure', path, POSITIVE);
  if (structure !== undefined) fortification.structure = structure;
  setProvisional(ctx, o, path, fortification);
  return fortification;
}

function parseSite(ctx: Ctx, value: unknown, path: string): FortificationSite | undefined {
  const o = readObject(ctx, value, path, ['fortification', 'cell']);
  if (!o) return undefined;
  return { fortification: readString(ctx, o, 'fortification', path), cell: parseCell(ctx, o['cell'], child(path, 'cell')) };
}

function parseBattlefield(ctx: Ctx, value: unknown, path: string): Battlefield {
  const keys = ['provisional', 'width', 'height', 'portal', 'campHeart', 'deploymentZone', 'fortificationSites'];
  const o = readObject(ctx, value, path, keys) ?? {};
  const field: Battlefield = {
    width: readNumber(ctx, o, 'width', path, POSITIVE),
    height: readNumber(ctx, o, 'height', path, POSITIVE),
    portal: parseArea(ctx, o['portal'], child(path, 'portal')),
    campHeart: parseArea(ctx, o['campHeart'], child(path, 'campHeart')),
    deploymentZone: parseArea(ctx, o['deploymentZone'], child(path, 'deploymentZone')),
    fortificationSites: readArray(ctx, o, 'fortificationSites', path, (v, p) => parseSite(ctx, v, p)),
  };
  setProvisional(ctx, o, path, field);
  return field;
}

function parseWave(ctx: Ctx, value: unknown, path: string): Wave | undefined {
  const o = readObject(ctx, value, path, ['id', 'index', 'kind', 'provisional', 'arrivals']);
  if (!o) return undefined;
  const wave: Wave = {
    id: readString(ctx, o, 'id', path),
    index: readNumber(ctx, o, 'index', path, POSITIVE),
    kind: readEnum(ctx, o, 'kind', path, BATTLE_KINDS),
    arrivals: readArray(ctx, o, 'arrivals', path, (v, p) => {
      const a = readObject(ctx, v, p, ['turn', 'enemy', 'count', 'row']);
      if (!a) return undefined;
      const row = readOptionalNumber(ctx, a, 'row', p, NATURAL);
      const arrival = { turn: readNumber(ctx, a, 'turn', p, POSITIVE), enemy: readString(ctx, a, 'enemy', p), count: readNumber(ctx, a, 'count', p, POSITIVE) };
      return row === undefined ? arrival : { ...arrival, row };
    }),
  };
  setProvisional(ctx, o, path, wave);
  return wave;
}

/** Lit une section de config.json : un objet dont toutes les clés sont des nombres. */
function readSection<K extends string>(ctx: Ctx, o: Record<string, unknown>, key: string, path: string, rules: Record<K, { integer?: boolean; min?: number; max?: number }>): Record<K, number> {
  const p = child(path, key);
  const keys = Object.keys(rules) as K[];
  const section = readObject(ctx, o[key], p, keys) ?? {};
  const result = {} as Record<K, number>;
  for (const k of keys) result[k] = readNumber(ctx, section, k, p, rules[k]);
  return result;
}

function parseConfig(ctx: Ctx, value: unknown, path: string): BattleConfig {
  const keys = [
    'provisional', 'damage', 'morale', 'wounded', 'mastery', 'fireArrows', 'fallen', 'field',
    'flank', 'pushback', 'passingFire', 'encirclement', 'waves', 'finalBattle', 'maxTurns',
  ];
  const o = readObject(ctx, value, path, keys) ?? {};
  const damageObj = readObject(ctx, o['damage'], child(path, 'damage'), ['formula', 'minimum', 'percentPerDefense']) ?? {};
  const moraleObj = readObject(ctx, o['morale'], child(path, 'morale'), ['base', 'shakenBelow', 'waveringBelow', 'efficiency']) ?? {};
  const dPath = child(path, 'damage');
  const mPath = child(path, 'morale');
  const config: BattleConfig = {
    damage: {
      formula: readEnum(ctx, damageObj, 'formula', dPath, DAMAGE_FORMULAS),
      minimum: readNumber(ctx, damageObj, 'minimum', dPath, NATURAL),
      percentPerDefense: readNumber(ctx, damageObj, 'percentPerDefense', dPath, FRACTION),
    },
    morale: {
      base: readNumber(ctx, moraleObj, 'base', mPath, POSITIVE),
      shakenBelow: readNumber(ctx, moraleObj, 'shakenBelow', mPath, FRACTION),
      waveringBelow: readNumber(ctx, moraleObj, 'waveringBelow', mPath, FRACTION),
      efficiency: readSection(ctx, moraleObj, 'efficiency', mPath, { steady: FRACTION, shaken: FRACTION, wavering: FRACTION }),
    },
    wounded: readSection(ctx, o, 'wounded', path, { attackFloor: FRACTION }),
    mastery: readSection(ctx, o, 'mastery', path, { unmasteredAttackPenalty: NATURAL }),
    fireArrows: readSection(ctx, o, 'fireArrows', path, { minTargetDefense: NATURAL }),
    fallen: readSection(ctx, o, 'fallen', path, { turnsHeldBeforeDeath: POSITIVE }),
    field: readSection(ctx, o, 'field', path, { maxPlayerSquads: POSITIVE }),
    flank: readSection(ctx, o, 'flank', path, { attackBonus: NATURAL, extraMoraleLoss: NATURAL }),
    pushback: readSection(ctx, o, 'pushback', path, { damageThreshold: POSITIVE }),
    passingFire: readSection(ctx, o, 'passingFire', path, { damageFactor: FRACTION }),
    encirclement: readSection(ctx, o, 'encirclement', path, { extraLosses: NATURAL }),
    waves: readSection(ctx, o, 'waves', path, { fullyAnnounced: NATURAL }),
    finalBattle: readSection(ctx, o, 'finalBattle', path, { ritualTurns: POSITIVE }),
    maxTurns: readNumber(ctx, o, 'maxTurns', path, POSITIVE),
  };
  if (config.morale.waveringBelow > config.morale.shakenBelow) report(ctx, mPath, 'waveringBelow doit être ≤ shakenBelow');
  if (config.finalBattle.ritualTurns > config.maxTurns) report(ctx, child(path, 'finalBattle'), 'ritualTurns doit être ≤ maxTurns');
  setProvisional(ctx, o, path, config);
  return config;
}

/** Vérifie la forme de chaque fichier ; les problèmes s'accumulent dans ctx. */
export function parseStructure(ctx: Ctx, raw: RawGameData): GameData {
  const list = <T>(key: keyof GameData, item: (c: Ctx, v: unknown, p: string) => T | undefined): T[] =>
    readList(ctx, raw[key], DATA_FILES[key], (v, p) => item(ctx, v, p));
  return {
    unlocks: list('unlocks', parseUnlock),
    keywords: list('keywords', parseKeyword),
    masteries: list('masteries', parseMastery),
    consumables: list('consumables', parseConsumable),
    items: list('items', parseItem),
    squad: parseSquadBase(ctx, raw.squad, DATA_FILES.squad),
    templates: list('templates', parseTemplate),
    enemies: list('enemies', parseEnemy),
    postures: list('postures', parsePosture),
    orders: parseOrderSlots(ctx, raw.orders, DATA_FILES.orders),
    fortifications: list('fortifications', parseFortification),
    battlefield: parseBattlefield(ctx, raw.battlefield, DATA_FILES.battlefield),
    waves: list('waves', parseWave),
    config: parseConfig(ctx, raw.config, DATA_FILES.config),
  };
}
