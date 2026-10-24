import { describe, expect, it } from 'vitest';

// Garde-fou d'architecture : le moteur doit rester testable sans affichage,
// donc aucun fichier de src/engine/ ne doit importer Phaser.
// Les sources sont lues par import.meta.glob (Vite), ce qui évite de dépendre des types Node.
const sources = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

// import ... from 'phaser', import 'phaser', import('phaser'), export ... from 'phaser', require('phaser'),
// y compris les sous-chemins (« phaser/src/... »).
const PHASER_IMPORT = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]phaser(?:\/[^'"]*)?['"]/;

describe('architecture du moteur', () => {
  it('trouve des fichiers à vérifier', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0);
  });

  it("aucun fichier de src/engine/ n'importe phaser", () => {
    const offenders = Object.entries(sources)
      .filter(([, code]) => PHASER_IMPORT.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
