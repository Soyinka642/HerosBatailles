// Seconde passe de validation : chaque référence d'un fichier à un autre
// (id de mot-clé, d'objet, d'emplacement, de déblocage, d'ennemi…) doit exister,
// et les règles de cohérence entre fichiers doivent tenir.

import { DATA_FILES } from './parse';
import { type Ctx, child, report } from './reader';
import type { Area, Battlefield, Cell, Effect, GameData, Item, Keyword, KeywordRef, SlotDef, UnitType } from './types';

function checkUniqueIds(ctx: Ctx, list: readonly { id: string }[], file: string): void {
  const seen = new Set<string>();
  list.forEach((entry, i) => {
    if (seen.has(entry.id)) report(ctx, child(child(file, i), 'id'), `id « ${entry.id} » en double`);
    seen.add(entry.id);
  });
}

function checkUnlock(ctx: Ctx, unlockedBy: string | undefined, path: string, unlocks: ReadonlySet<string>): void {
  if (unlockedBy !== undefined && !unlocks.has(unlockedBy)) report(ctx, child(path, 'unlockedBy'), `déblocage inconnu « ${unlockedBy} »`);
}

function checkKeywordRefs(ctx: Ctx, refs: readonly KeywordRef[], path: string, keywords: ReadonlyMap<string, Keyword>): void {
  refs.forEach((ref, i) => {
    const p = child(child(path, 'keywords'), i);
    const keyword = keywords.get(ref.id);
    if (!keyword) return report(ctx, child(p, 'id'), `mot-clé inconnu « ${ref.id} »`);
    if (keyword.hasParameter && ref.x === undefined) report(ctx, p, `« ${ref.id} » demande une valeur x`);
    if (!keyword.hasParameter && ref.x !== undefined) report(ctx, child(p, 'x'), `« ${ref.id} » n'a pas de paramètre x`);
  });
}

function checkSlots(ctx: Ctx, slots: readonly SlotDef[], path: string, key: string, data: References): void {
  const seen = new Set<string>();
  slots.forEach((slot, i) => {
    const p = child(child(path, key), i);
    if (seen.has(slot.id)) report(ctx, child(p, 'id'), `emplacement « ${slot.id} » en double`);
    seen.add(slot.id);
    checkUnlock(ctx, slot.unlockedBy, p, data.unlocks);
    slot.accepts.forEach((category, j) => {
      if (!data.categories.has(category)) report(ctx, child(child(p, 'accepts'), j), `aucun objet de catégorie « ${category} »`);
    });
  });
}

function checkEquipment(ctx: Ctx, unit: UnitType, path: string, items: ReadonlyMap<string, Item>): void {
  const p = child(path, 'defaultEquipment');
  for (const [slotId, itemId] of Object.entries(unit.defaultEquipment)) {
    const slot = unit.slots.find((s) => s.id === slotId);
    const item = items.get(itemId);
    if (!slot) report(ctx, child(p, slotId), `emplacement inconnu « ${slotId} » pour ${unit.id}`);
    if (!item) report(ctx, child(p, slotId), `objet inconnu « ${itemId} »`);
    if (slot && item && !slot.accepts.includes(item.category)) {
      report(ctx, child(p, slotId), `« ${itemId} » (catégorie ${item.category}) ne va pas dans « ${slotId} » (accepte ${slot.accepts.join(', ')})`);
    }
  }
}

function checkKeywordEffects(ctx: Ctx, keyword: Keyword, path: string): void {
  keyword.effects.forEach((effect: Effect, i) => {
    if (effect.action.amount === 'X' && !keyword.hasParameter) {
      report(ctx, child(child(child(path, 'effects'), i), 'action'), 'montant « X » alors que le mot-clé n\'a pas de paramètre');
    }
  });
}

function cellInside(cell: Cell, field: Battlefield): boolean {
  return cell.col < field.width && cell.row < field.height;
}

function checkArea(ctx: Ctx, area: Area, path: string, field: Battlefield): void {
  if (area.toCol >= field.width || area.toRow >= field.height) report(ctx, path, `sort du terrain (${field.width} × ${field.height})`);
}

function checkBattlefield(ctx: Ctx, field: Battlefield, fortifications: ReadonlySet<string>): void {
  const file = DATA_FILES.battlefield;
  checkArea(ctx, field.portal, child(file, 'portal'), field);
  checkArea(ctx, field.campHeart, child(file, 'campHeart'), field);
  checkArea(ctx, field.deploymentZone, child(file, 'deploymentZone'), field);
  const occupied = new Set<string>();
  field.fortificationSites.forEach((site, i) => {
    const p = child(child(file, 'fortificationSites'), i);
    const key = `${site.cell.col},${site.cell.row}`;
    if (!fortifications.has(site.fortification)) report(ctx, child(p, 'fortification'), `fortification inconnue « ${site.fortification} »`);
    if (!cellInside(site.cell, field)) report(ctx, child(p, 'cell'), `case (${key}) hors du terrain`);
    if (occupied.has(key)) report(ctx, child(p, 'cell'), `case (${key}) déjà occupée par un autre site`);
    occupied.add(key);
  });
}

function checkWaves(ctx: Ctx, data: GameData, enemies: ReadonlySet<string>): void {
  const file = DATA_FILES.waves;
  data.waves.forEach((wave, i) => {
    const p = child(file, i);
    if (wave.index !== i + 1) report(ctx, child(p, 'index'), `les vagues doivent être numérotées 1, 2, 3… dans l'ordre : ${i + 1} attendu, reçu ${wave.index}`);
    wave.arrivals.forEach((arrival, j) => {
      const a = child(child(p, 'arrivals'), j);
      if (!enemies.has(arrival.enemy)) report(ctx, child(a, 'enemy'), `ennemi inconnu « ${arrival.enemy} »`);
      if (arrival.row !== undefined && arrival.row >= data.battlefield.height) report(ctx, child(a, 'row'), `rangée ${arrival.row} hors du terrain (hauteur ${data.battlefield.height})`);
    });
  });
}

/** Index des ids, construits une fois pour toutes les vérifications. */
interface References {
  unlocks: ReadonlySet<string>;
  categories: ReadonlySet<string>;
  keywords: ReadonlyMap<string, Keyword>;
  items: ReadonlyMap<string, Item>;
}

function indexReferences(data: GameData): References {
  return {
    unlocks: new Set(data.unlocks.map((u) => u.id)),
    categories: new Set(data.items.map((item) => item.category)),
    keywords: new Map(data.keywords.map((k) => [k.id, k])),
    items: new Map(data.items.map((item) => [item.id, item])),
  };
}

function checkUnitTypes(ctx: Ctx, units: readonly UnitType[], file: string, refs: References): void {
  units.forEach((unit, i) => {
    const p = child(file, i);
    checkSlots(ctx, unit.slots, p, 'slots', refs);
    checkEquipment(ctx, unit, p, refs.items);
    checkKeywordRefs(ctx, unit.keywords, p, refs.keywords);
  });
}

/** Vérifie les références entre fichiers ; à appeler sur des données à la forme déjà valide. */
export function checkReferences(ctx: Ctx, data: GameData): void {
  checkUniqueIds(ctx, data.unlocks, DATA_FILES.unlocks);
  checkUniqueIds(ctx, data.keywords, DATA_FILES.keywords);
  checkUniqueIds(ctx, data.items, DATA_FILES.items);
  checkUniqueIds(ctx, data.units, DATA_FILES.units);
  checkUniqueIds(ctx, data.enemies, DATA_FILES.enemies);
  checkUniqueIds(ctx, data.postures, DATA_FILES.postures);
  checkUniqueIds(ctx, data.fortifications, DATA_FILES.fortifications);
  checkUniqueIds(ctx, data.waves, DATA_FILES.waves);

  const refs = indexReferences(data);
  data.keywords.forEach((keyword, i) => checkKeywordEffects(ctx, keyword, child(DATA_FILES.keywords, i)));
  data.items.forEach((item, i) => {
    const p = child(DATA_FILES.items, i);
    checkKeywordRefs(ctx, item.keywords, p, refs.keywords);
    checkSlots(ctx, item.upgradeSlots, p, 'upgradeSlots', refs);
  });
  checkUnitTypes(ctx, data.units, DATA_FILES.units, refs);
  checkUnitTypes(ctx, data.enemies, DATA_FILES.enemies, refs);
  data.postures.forEach((posture, i) => checkUnlock(ctx, posture.unlockedBy, child(DATA_FILES.postures, i), refs.unlocks));
  checkBattlefield(ctx, data.battlefield, new Set(data.fortifications.map((f) => f.id)));
  checkWaves(ctx, data, new Set(data.enemies.map((e) => e.id)));
}
