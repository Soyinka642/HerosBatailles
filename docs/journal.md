# Journal de développement

## 2026-10-24 — Phase 0 : mise en place du projet

### Ce qui a été fait

- Fichiers de projet écrits à la main (sans `npm create vite`) : `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore` (`node_modules`, `dist`).
- Arborescence :
  - `src/engine/` : moteur en TypeScript pur, sans Phaser. Pour l'instant, seulement `index.ts`, qui exporte la constante `GAME_TITLE` ;
  - `src/ui/` : scènes Phaser, pour l'instant `TitleScene.ts` (le titre sur fond sombre, lu depuis `GAME_TITLE` : le sens de dépendance va du moteur vers l'interface) ;
  - `src/data/` : contenu JSON, vide (`.gitkeep`) ;
  - `src/main.ts` : point d'entrée, démarre Phaser (1280 × 720, mise à l'échelle `FIT`, centrée).
- Garde-fou `src/engine/architecture.test.ts` : il échoue si un fichier de `src/engine/` importe `phaser` (y compris un sous-chemin, un `import()` dynamique ou un `require`). Vérifié en ajoutant un fichier fautif temporaire : le test échoue et nomme le fichier.
- Scripts npm : `dev`, `build` (vérification des types puis `vite build`), `preview`, `test` (`vitest run`), `typecheck` (`tsc --noEmit`).
- Vérifications : `typecheck`, `test` et `build` passent ; `npm run dev` affiche la scène titre sans erreur dans la console ; les sprites sont servis à `/unites/…` et copiés dans `dist/unites/`.
- Aucune règle de jeu dans ce lot.

### Décisions prises

- npm ; TypeScript en mode strict ; Vite ; Phaser 3, épinglé `^3.90.0` (Phaser 4 est désormais la version `latest` sur npm) ; Vitest. Aucune autre dépendance : ni ESLint ni Prettier.
- Versions installées : Phaser 3.90.0, TypeScript 7.0.2, Vite 8.3.5, Vitest 5.0.5.
- `assets/` sert de dossier public Vite (`publicDir: 'assets'`) ; aucun sprite déplacé.
- `tsconfig.json` : `strict`, `moduleResolution: "bundler"`, `resolveJsonModule`, plus `noUncheckedIndexedAccess` (un accès indexé peut être `undefined`, utile pour les grilles et les tables de données), `verbatimModuleSyntax` et `isolatedModules` (ce qu'attend Vite).
- Vitest tourne en environnement `node` : le moteur se teste sans navigateur.
- Le garde-fou lit les sources par `import.meta.glob(…, { query: '?raw' })`, ce qui évite d'ajouter `@types/node`.
- Le cache disque des modules de Vitest 5 (`fsModuleCache`) est désactivé : il figeait le résultat de `import.meta.glob`, et le garde-fou ne voyait pas un nouveau fichier fautif.
- Seuil d'avertissement de taille des paquets relevé à 1 500 ko : Phaser pèse à lui seul environ 1,2 Mo minifié (320 ko compressé).

### Questions apparues

- TypeScript 7 est la réécriture native (en Go) du compilateur. Tout fonctionne, mais si un outil se plaint plus tard, revenir à TypeScript 5.x reste possible.
- Au build, le code va dans `dist/assets/` (dossier par défaut de Vite) et le contenu de `assets/` est copié à la racine de `dist/` (`dist/unites/…`). Pas de conflit aujourd'hui ; à garder en tête si un sous-dossier `assets/assets/` apparaissait un jour.
- Faut-il découper Phaser dans un paquet séparé pour le cache navigateur ? Inutile pour le prototype.

**Prochaine étape** : Phase 0, brancher le dépôt sur Vercel ; puis 1.1, formats de données JSON et types.
