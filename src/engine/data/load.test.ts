import { describe, expect, it } from 'vitest';
import { BUNDLED_DATA, DataError, loadGameData, parseGameData, validateGameData } from './load';
import { DATA_FILES, type RawGameData } from './parse';

/** Copie modifiable du contenu livré, pour fabriquer des cas invalides. */
function copy(): RawGameData {
  return structuredClone(BUNDLED_DATA);
}

type Path = readonly (string | number)[];

/** Parent du dernier maillon de `path` dans un JSON brut. */
function parentOf(raw: unknown, path: Path): Record<string | number, unknown> {
  let node = raw;
  for (const key of path.slice(0, -1)) node = (node as Record<string | number, unknown>)[key];
  return node as Record<string | number, unknown>;
}

/** Problèmes signalés après avoir remplacé la valeur au bout de `path`. */
function issuesAfterSet(path: Path, value: unknown): string[] {
  const raw = copy();
  parentOf(raw, path)[path[path.length - 1]!] = value;
  return validateGameData(raw).issues;
}

/** Problèmes signalés après avoir supprimé le champ au bout de `path`. */
function issuesAfterDelete(path: Path): string[] {
  const raw = copy();
  delete parentOf(raw, path)[path[path.length - 1]!];
  return validateGameData(raw).issues;
}

describe('contenu livré', () => {
  it.each(Object.values(DATA_FILES))('%s a une forme valide', (file) => {
    const { issues } = validateGameData(BUNDLED_DATA);
    expect(issues.filter((issue) => issue.startsWith(file))).toEqual([]);
  });

  it('toutes les références entre fichiers existent', () => {
    expect(validateGameData(BUNDLED_DATA).issues).toEqual([]);
  });

  it('se charge et contient le périmètre du prototype', () => {
    const data = loadGameData();
    expect(data.units.map((u) => u.id)).toEqual(['epeistes', 'archers', 'piquiers']);
    expect(data.postures.map((p) => p.id)).toEqual(['tenir', 'avancer']);
    expect(data.keywords.map((k) => k.id)).toEqual(['perce-armure', 'feu', 'charge']);
    expect(data.fortifications.map((f) => f.id)).toEqual(['palissade', 'tour']);
    expect(data.waves).toHaveLength(4);
  });

  it("le sous-emplacement de l'arc est verrouillé par le forgeron", () => {
    const bow = loadGameData().items.find((item) => item.id === 'arc-court');
    expect(bow?.upgradeSlots).toEqual([{ id: 'fleches', accepts: ['fleches'], unlockedBy: 'forgeron' }]);
  });
});

describe('forme invalide', () => {
  it('rejette un fichier invalide avec un message clair', () => {
    const raw = copy();
    (raw.items as Record<string, unknown>[])[0]!['stats'] = { defense: 'beaucoup' };
    expect(() => parseGameData(raw)).toThrow(DataError);
    expect(() => parseGameData(raw)).toThrow('items.json › [0].stats.defense : nombre attendu, reçu la chaîne « beaucoup »');
  });

  it('signale un champ obligatoire manquant', () => {
    expect(issuesAfterDelete(['units', 1, 'name'])).toEqual(['units.json › [1].name : champ obligatoire manquant']);
  });

  it('signale une clé inconnue (faute de frappe)', () => {
    const issues = issuesAfterSet(['postures', 0, 'unlockBy'], 'forgeron');
    expect(issues).toEqual([expect.stringContaining('postures.json › [0].unlockBy : clé inconnue')]);
  });

  it('signale une valeur hors liste', () => {
    const issues = issuesAfterSet(['postures', 1, 'movement'], 'charge');
    expect(issues).toEqual(['postures.json › [1].movement : valeur attendue parmi hold, advance, reçu la chaîne « charge »']);
  });

  it("signale un fichier qui n'est pas une liste", () => {
    expect(issuesAfterSet(['waves'], {})).toEqual(['waves.json : liste attendue, reçu un objet']);
  });

  it('accumule plusieurs problèmes au lieu de s’arrêter au premier', () => {
    const raw = copy();
    parentOf(raw, ['config', 'maxTurns'])['maxTurns'] = 0;
    parentOf(raw, ['config', 'damage', 'formula'])['formula'] = 'racine';
    const { issues } = validateGameData(raw);
    expect(issues).toHaveLength(2);
  });

  it('exige une capacité pour une fortification à occuper', () => {
    const issues = issuesAfterDelete(['fortifications', 1, 'capacity']);
    expect(issues).toEqual(['fortifications.json › [1].capacity : obligatoire pour une fortification à occuper']);
  });

  it('refuse des paliers de moral inversés', () => {
    const issues = issuesAfterSet(['config', 'morale', 'waveringBelow'], 0.9);
    expect(issues).toEqual(['config.json › morale : waveringBelow doit être ≤ shakenBelow']);
  });
});

describe('références invalides', () => {
  it('signale un mot-clé inconnu', () => {
    const issues = issuesAfterSet(['items', 4, 'keywords', 0, 'id'], 'glace');
    expect(issues).toEqual(['items.json › [4].keywords[0].id : mot-clé inconnu « glace »']);
  });

  it('exige la valeur x de Perce-armure, et seulement là', () => {
    expect(issuesAfterDelete(['items', 3, 'keywords', 0, 'x'])).toEqual(['items.json › [3].keywords[0] : « perce-armure » demande une valeur x']);
    expect(issuesAfterSet(['items', 4, 'keywords', 0, 'x'], 2)).toEqual(["items.json › [4].keywords[0].x : « feu » n'a pas de paramètre x"]);
  });

  it('signale un déblocage inconnu', () => {
    const issues = issuesAfterSet(['items', 1, 'upgradeSlots', 0, 'unlockedBy'], 'forgeur');
    expect(issues).toEqual(['items.json › [1].upgradeSlots[0].unlockedBy : déblocage inconnu « forgeur »']);
  });

  it("signale un emplacement qui n'accepte aucune catégorie existante", () => {
    const issues = issuesAfterSet(['units', 0, 'slots', 1, 'accepts'], ['bouclier']);
    expect(issues).toContain('units.json › [0].slots[1].accepts[0] : aucun objet de catégorie « bouclier »');
  });

  it('signale un équipement par défaut inconnu ou mal placé', () => {
    expect(issuesAfterSet(['units', 0, 'defaultEquipment', 'arme'], 'hache')).toEqual(['units.json › [0].defaultEquipment.arme : objet inconnu « hache »']);
    expect(issuesAfterSet(['units', 0, 'defaultEquipment', 'arme'], 'arc-court')).toEqual([
      'units.json › [0].defaultEquipment.arme : « arc-court » (catégorie arc) ne va pas dans « arme » (accepte epee)',
    ]);
  });

  it('signale un ennemi inconnu dans une vague', () => {
    const issues = issuesAfterSet(['waves', 0, 'arrivals', 0, 'enemy'], 'dragons');
    expect(issues).toEqual(['waves.json › [0].arrivals[0].enemy : ennemi inconnu « dragons »']);
  });

  it('signale une fortification inconnue ou hors du terrain', () => {
    expect(issuesAfterSet(['battlefield', 'fortificationSites', 0, 'fortification'], 'fosse')).toEqual([
      'battlefield.json › fortificationSites[0].fortification : fortification inconnue « fosse »',
    ]);
    expect(issuesAfterSet(['battlefield', 'fortificationSites', 0, 'cell', 'col'], 12)).toEqual([
      'battlefield.json › fortificationSites[0].cell : case (12,2) hors du terrain',
    ]);
  });

  it('signale un id en double', () => {
    const issues = issuesAfterSet(['units', 2, 'id'], 'archers');
    expect(issues).toEqual(['units.json › [2].id : id « archers » en double']);
  });

  it('signale des vagues mal numérotées', () => {
    const issues = issuesAfterSet(['waves', 1, 'index'], 3);
    expect(issues).toEqual(["waves.json › [1].index : les vagues doivent être numérotées 1, 2, 3… dans l'ordre : 2 attendu, reçu 3"]);
  });

  it("refuse un montant « X » dans un mot-clé sans paramètre", () => {
    const issues = issuesAfterSet(['keywords', 1, 'effects', 0, 'action', 'amount'], 'X');
    expect(issues).toEqual(["keywords.json › [1].effects[0].action : montant « X » alors que le mot-clé n'a pas de paramètre"]);
  });
});
