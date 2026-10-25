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

**Mise à jour** : la Phase 0 est terminée et déployée sur https://beyond-the-portal-six.vercel.app.

## 2026-10-24 — Lot 1.1 : formats de données JSON et types

### Ce qui a été fait

- Périmètre : uniquement ce dont le moteur de bataille (1.2) aura besoin. Ni campement ni exploration.
- Types dans `src/engine/data/types.ts` : déblocages, mots-clés et effets, objets (armes, armures, améliorations), types d'escouades (joueur et ennemis), postures, fortifications, terrain, vagues, paramètres réglables.
- Données dans `src/data/` : `unlocks.json` (le forgeron), `keywords.json` (Perce-armure X, Feu, Charge), `items.json` (épée, arc court, pique, masse, flèches enflammées, cuir, mailles, plates), `units.json` (épéistes, archers, piquiers), `enemies.json` (fantassins, tireurs et brutes du portail), `postures.json` (Tenir, Avancer), `fortifications.json` (palissade, tour), `battlefield.json` (terrain fixe 12 × 5), `waves.json` (quatre vagues), `config.json` (paramètres réglables).
- Validation sans dépendance, en deux passes :
  - `parse.ts` vérifie la forme de chaque fichier (types, champs obligatoires, clés inconnues, valeurs hors liste, bornes) ;
  - `references.ts` vérifie les références entre fichiers (mots-clés, objets, emplacements, catégories, déblocages, ennemis, fortifications), les ids en double, les cases hors du terrain, la numérotation des vagues, le paramètre x des mots-clés ;
  - les problèmes s'accumulent avec leur chemin, par exemple `items.json › [1].upgradeSlots[0].unlockedBy : déblocage inconnu « forgeur »` ;
  - `loadGameData()` renvoie des données typées ou lève une `DataError` qui liste tout ; elle est appelée au démarrage dans `src/main.ts`, donc une donnée invalide arrête le jeu tout de suite.
- Tests (`src/engine/data/load.test.ts`) : chaque fichier livré est valide, toutes les références existent, et 18 cas invalides sont rejetés avec un message précis.
- Vérifications : `typecheck`, `test` (33 tests) et `build` passent ; le jeu se lance sans erreur dans la console.

### Décisions prises

- Mécanisme unique de déblocage (principe 5) : tout ce qui est verrouillable (emplacements, sous-emplacements, postures) porte un champ facultatif `unlockedBy`, qui désigne un id de `unlocks.json`. Le sous-emplacement `fleches` de l'arc court est verrouillé par `forgeron`. En 1.8, l'état de partie tiendra la liste des déblocages obtenus.
- Effets combinables (principe 6) : un effet = déclencheur + condition facultative + cible + action. Le « X » de Perce-armure est un paramètre fourni par l'objet qui porte le mot-clé (`{ "id": "perce-armure", "x": 1 }`).
- La portée, le nombre d'usages et l'émoussement des effets ne sont pas encore dans le format : aucun cas du prototype ne les demande (principe 9). Ils viendront avec les leviers du héros.
- Un seul type pour les armes, les armures et les améliorations ; un seul type pour les escouades du joueur et les ennemis.
- Les postures désignent un comportement dans une liste fermée (`hold`, `advance`) : une nouvelle posture demandera du code moteur. C'est un écart assumé au principe 3.
- Les colonnes vont du campement (colonne 0) au portail ; les rangées sont les lignes de front.
- Les emplacements de fortifications sont des sites possibles : savoir si la palissade et la tour sont construites relève du campement (1.5).
- Le validateur refuse les clés inconnues, pour attraper les fautes de frappe.

### Valeurs et règles provisoires (à revoir en 1.2)

Ni les chiffres de la version plateau ni les 17 questions de règles posées en étape A n'ont été tranchés. Toutes les valeurs sont marquées `"provisional": true`. Les formats laissent les options ouvertes ; voici ce qui est provisoire dans les données :

1. Les chiffres viennent des stats de base de l'escouade plus les modificateurs de l'équipement (une arme et une armure).
2. Grille carrée ; la mesure de la portée est un paramètre (`range.metric`, Manhattan par défaut).
3. Les archers ont une faible attaque de mêlée de base (1).
4. Chaque type a sa famille d'armes (épée, arc, pique) ; toutes les armures vont à tous les types (cuir, mailles, plates, comme les sprites ; il n'existe pas de sprite d'archer en plates).
5. Ce que touchent les dégâts (moral ou effectifs) et l'effet des blessés sont à trancher en 1.2 (paramètres `morale` et `wounded.powerFloor`).
6. Feu : 2 dégâts au tour suivant et 1 point de moral. Le cumul de deux Feux reste à trancher.
7. Flèches enflammées : donnent Feu, sans contrepartie ni limite d'usages.
8. Charge est définie (+2 en attaque après 3 cases) mais n'est portée par personne.
9. Perce-armure 1 est porté par la masse des brutes du portail.
10. Le soutien des piquiers n'a pas encore de format : à trancher en 1.2.
11. Tour : +1 en portée pour une escouade qui tire ; capacité 1. Palissade : bloque le mouvement ; sa destruction n'est pas modélisée.
12. Vagues : arrivées échelonnées par tour ; toutes annoncées en entier ; la 4ᵉ vague est la bataille finale.
13. Moral maximum et nombre de soldats propres à chaque type.
14. Noms et chiffres des ennemis inventés.

### Questions apparues

- Les 17 questions de l'étape A restent ouvertes, ainsi que les chiffres de la version plateau.
- La bataille finale est-elle la 4ᵉ vague ou une 5ᵉ bataille ? Le format accepte les deux (`isFinal`).
- La palissade bloque-t-elle aussi nos propres escouades ? Le terrain provisoire lui laisse un passage sur la rangée centrale.

**Prochaine étape** : 1.2, moteur de bataille sans affichage, en commençant par trancher les règles ci-dessus.
