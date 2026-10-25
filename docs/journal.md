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

## 2026-10-25 — Lot 1.2a : formats révisés et chiffres provisoires

### Ce qui a été fait

- Formats de données révisés selon les décisions de l'auteur (elles remplacent les choix provisoires du lot 1.1). Pas encore de moteur de bataille.
- Fichiers de `src/data/` :
  - supprimé : `units.json` (plus de types d'escouades) ;
  - nouveaux : `squad.json` (stats de base communes et emplacements), `masteries.json` (maîtrises de l'épée, de l'arc, de la pique), `templates.json` (modèles de départ : épéistes, archers, piquiers), `consumables.json` (pâte incendiaire), `orders.json` (emplacement « premier-tour ») ;
  - révisés : `items.json` (`kind`, `mastery` ; masse retirée ; flèches enflammées qui consomment de la pâte), `enemies.json` (stats directes, mots-clés, posture), `keywords.json` (Feu en brûlure, Soutien, Charge en ligne droite), `fortifications.json` (structure, occupants, bonus de défense), `battlefield.json` (portail élargi aux 5 rangées), `waves.json` (4 vagues + bataille finale), `config.json`, `postures.json` (description d'Avancer).
- Types : `src/engine/data/types.ts` révisé ; nouveau `src/engine/battle/types.ts` pour ce que le joueur décide (ordre, tour planifié, consommables portés, modificateurs de moral), qui n'est pas du contenu.
- Validation (`parse.ts`, `references.ts`) adaptée : maîtrise obligatoire pour une arme et réservée aux armes ; maîtrises, consommables, postures des ennemis et emplacements de l'équipement de départ vérifiés ; une seule bataille finale, en dernier ; rituel pas plus long que `maxTurns` ; occupants et capacité réservés aux fortifications à occuper ; ids uniques dans tous les fichiers, y compris les emplacements de tours planifiés.
- Conception mise à jour : escouades sans type figé, maîtrises, Feu, grille hexagonale, nouveau texte des ordres, ennemis, consommables, tour, palissade, bataille finale, et la phrase « L'équipement et les maîtrises changent les chiffres et les capacités, le vécu change le comportement ».
- Tests : 52, dont 29 qui vérifient que des données invalides sont rejetées avec un message précis. `typecheck`, `test` et `build` passent ; le jeu se lance sans erreur dans la console.

### Décisions de règle de ce lot

**Grille et terrain**
1. Grille hexagonale « pointe en haut », coordonnées décalées `{ col, row }` (« odd-r » : rangées impaires décalées d'un demi-hexagone vers l'est). Une rangée est une ligne droite du campement (ouest) au portail (est). Distance = nombre de pas d'hexagone (le moteur passera par les coordonnées cubiques, dans une seule fonction).
2. « Devant » et « derrière » = voisins est et ouest sur la même rangée.
3. Terrain 12 × 5 inchangé ; portail élargi aux 5 rangées de la colonne 11.

**Escouades, équipement, maîtrises**
4. Pas de type d'escouade figé : épéistes, archers et piquiers sont des modèles de départ (un équipement et des maîtrises).
5. Chiffres = stats de base communes + bonus de l'équipement. Sans arme de mêlée, l'escouade se bat à mains nues (mêlée de base 2).
6. Arme non maîtrisée : pas de capacités spéciales et malus d'attaque réglable (`mastery.unmasteredAttackPenalty`, 2).
7. Les flèches enflammées n'exigent pas la maîtrise de l'arc (les capacités d'une amélioration ne dépendent pas de la maîtrise).
8. Armures : cuir, mailles, plates (les plates ralentissent).

**Moral et dégâts**
9. Dégâts = attaque − défense, minimum 1, arrondis au plus proche, sur les dégâts finaux.
10. Les dégâts touchent d'abord le moral. Une fois l'escouade ébranlée, chaque point de dégâts retire 1 de moral et fait 1 blessé.
11. Les blessés réduisent l'attaque en proportion des valides, avec un plancher réglable (`wounded.attackFloor`, 0,5).
12. Moral maximum = base commune (`morale.base`, 20) + modificateurs de l'escouade ; aucun modificateur au prototype.

**Mots-clés**
13. Feu : perte de moral à l'impact (2), puis brûlure de 2 dégâts fixes, sans défense, au début de chacun des 2 tours suivants. Une escouade déjà en feu voit sa brûlure rafraîchie, sans cumul.
14. Feu sur une fortification : les deux brûlent (la fortification perd de la structure et l'escouade abritée prend la brûlure).
15. Charge : +2 en mêlée après au moins 3 cases en ligne droite ; réservée aux cavaliers, portée par personne au prototype.
16. Soutien (pique maîtrisée) : +2 en attaque à l'escouade juste devant quand elle combat en mêlée ; un piquier lui-même en mêlée ne soutient pas.
17. Perce-armure 2 : porté par les brutes du portail.

**Fortifications**
18. Tour : réservée aux tireurs (capacité 1), portée +1 et défense +2, 30 points de structure. L'ennemi peut la prendre en mêlée : l'occupant est attaqué normalement ; s'il part en déroute, l'attaquant entre ; des tireurs ennemis peuvent ensuite l'occuper.
19. Palissade : bloque le passage (des deux camps) jusqu'à sa destruction (24 points de structure). L'escouade sur la case juste derrière, côté campement, a +2 de défense contre les tirs ; pas de mêlée à travers la palissade.
20. Les dégâts des fortifications persistent après la bataille (réparation au campement, lot 1.5).

**Partie et vagues**
21. Quatre vagues, puis une cinquième bataille, finale, pendant le rituel de fermeture : il faut tenir `finalBattle.ritualTurns` tours (12) ; les règles habituelles de défaite s'appliquent.
22. Arrivées échelonnées sur plusieurs tours. Les `waves.fullyAnnounced` (2) premières batailles sont annoncées en entier ; les suivantes en partie : la liste des ennemis, sans les tours d'arrivée.

**Ordres**
23. Un ordre = une liste de tours planifiés, puis une posture. La profondeur autorisée passe par le mécanisme unique de déblocage (`orders.json`). Pas de format pour les ordres conditionnels.
24. Le prototype contient un premier tour planifié, disponible dès le début de la partie (le forgeron reste le seul dépliage).
25. Tour planifié = une liste de pas (au plus la vitesse) : une case voisine de la précédente, ou « wait » (rester sur place), n'importe où dans le trajet. Au prototype, il ne sert qu'au placement : il n'a pas de tir, et la phase de tir de ce tour suit la règle par défaut.
26. Vérifications au déploiement (lot 1.2) : pas plus de pas que la vitesse réelle ; chaque case voisine de la précédente, sur le terrain, ni palissade ni case d'un allié qui ne bouge pas ; la tour seulement pour des tireurs.
27. Postures du prototype : Tenir et Avancer. En Avancer, un tireur s'arrête dès qu'une cible est à portée au début d'un pas.
28. Déviation d'Avancer : vers l'ennemi le plus proche ; à égalité, celui de la rangée la plus au nord, puis le plus à l'ouest.
29. Réaction par défaut quand le plan est contrarié (chemin barré, conflit perdu, engagement) : l'escouade s'arrête sur sa case pour la fin du tour, combat ce qu'elle a au contact ou à portée, frappe l'obstacle hostile s'il est destructible (les ennemis frappent la palissade), et reprend sa posture au tour suivant.

**Ennemis**
30. Comportement fixe par type, connu du joueur : une posture de `postures.json` (Avancer pour tous au prototype). Format simplifié : stats directes, mots-clés, noms provisoires.

**Consommables**
31. Les consommables sont portés par les escouades. Chaque volée enflammée consomme une unité de pâte incendiaire ; sans pâte, la volée part normale.
32. Par défaut, le stock non attribué est réparti à parts égales entre les escouades capables de s'en servir ; le reste de la division reste au campement. La répartition modifiée par le joueur est conservée ; ce qui n'est pas utilisé reste à l'escouade.
33. Seule une escouade détruite perd sa part ; une escouade en déroute la garde.
34. Règle par défaut des flèches enflammées : seulement sur une cible de défense au moins égale à `fireArrows.minTargetDefense` (3), et pas si elle brûle déjà.

**Mouvements simultanés**
35. Résolution par pas : au pas k, toutes les escouades de vitesse ≥ k bougent d'une case en même temps ; chacune choisit sa case d'après les positions du début du pas (au tour planifié, la case de son trajet).
36. Une escouade au contact d'un ennemi au début d'un pas est engagée et ne bouge plus.
37. Échanges et rotations de cases : personne ne bouge.
38. Deux escouades qui visent la même case : la plus rapide entre, puis l'ordre de déploiement (nos escouades avant les ennemis ; entre ennemis, l'ordre d'arrivée puis l'ordre de la liste) ; les autres restent sur place.
39. Entrer dans une case qui se libère au même pas est autorisé ; si l'occupant est bloqué, celui qui le suit l'est aussi, en chaîne.
40. Ordre d'un pas : intentions, puis annulation des cycles, puis conflits de case, puis chaînes (répétées jusqu'à stabilité), puis application.

### Chiffres provisoires

Tous marqués `"provisional": true`, acceptés comme point de départ et à retravailler en jouant.
- Base commune : mêlée 2, tir 0, défense 0, vitesse 2, 20 soldats, moral 20.
- Épée +4 mêlée ; pique +3 mêlée ; arc court +5 tir, portée 3 ; cuir +1, mailles +2, plates +4 défense et −1 vitesse.
- Fantassins 5/2 (mêlée/défense), moral 16 ; tireurs tir 4, portée 3, défense 1, moral 14 ; brutes 6/3, moral 24, Perce-armure 2.
- Paliers de moral : ébranlée sous 0,66, vacillante sous 0,33 ; efficacité 1 / 0,9 / 0,8 (adoucie parce que les blessés réduisent aussi l'attaque).

### Questions apparues

- Au prototype, aucun ennemi n'a le Feu : la règle « les deux brûlent » ne jouera que si nos archers tirent sur un ennemi qui a pris la tour.
- Le Feu ne peut toucher la palissade puisque personne ne se tient dessus (option « case juste derrière »).
- Le moteur choisira la rangée d'apparition d'un ennemi quand l'arrivée n'en précise pas : règle à fixer en 1.2.
- La règle de flanc, le recul et l'encerclement sont encore à définir en hexagones (1.2).
- Le nombre de maîtrises d'une escouade pourrait devenir un emplacement à débloquer ; rien de prévu avant le lot 1.5.
- Les sprites se choisiront par la paire arme + armure ; il manque un sprite « mains nues » et un archer en plates.

### Idées notées pour plus tard (non codées)

- Un tireur qui ne maîtrise pas son arme pourrait viser la mauvaise case, selon une règle déterministe.
- Tir planifié (avec le deuxième tour planifié) : la cible serait une escouade ennemie désignée, numérotée par type dans l'ordre de l'annonce (par exemple `brutes-du-portail#1`), et le choix d'utiliser les flèches enflammées ne vaudrait que pour cette cible ; si le tir se reporte sur une autre cible, la règle par défaut décide.
- La pique aura un effet propre contre les cavaliers.

**Prochaine étape** : 1.2, moteur de bataille sans affichage, avec des tests de scénarios (géométrie hexagonale, formule de dégâts, moral et blessés, pas simultanés, tir, mêlée, journal de bataille).

## 2026-10-25 — Lot 1.2a (suite) : règles du lot reportées dans la conception

### Ce qui a été fait

- `docs/conception.md` reprend les règles du lot 1.2a qui n'étaient que dans le journal :
  - « Les escouades » : le moral encaisse d'abord, puis 1 point de dégâts = 1 de moral et 1 blessé une fois l'escouade ébranlée ; les blessés réduisent l'attaque en proportion des valides, avec un plancher ; moral maximum = base commune que l'histoire de l'escouade fera évoluer ;
  - « Dégâts » : arrondi au plus proche des dégâts finaux ;
  - « La bataille » : réaction par défaut, résolution par pas, arrêt du tireur en Avancer dès qu'une cible est à portée, conflits de mouvement, contact qui engage, usage des consommables (une unité par usage, reste au campement, déroute sans perte, règle par défaut des flèches enflammées) ;
  - « Questions ouvertes » : la question des blessés ne porte plus que sur le niveau du plancher.
- Le texte de l'auteur sur les ordres est inchangé ; les ajouts sont des puces voisines. Fins de ligne CRLF conservées.
- Aucune modification de code ni de données ; `typecheck`, `test` (52 tests) et `build` passent toujours.

### Décisions prises

- Aucune nouvelle règle : ce lot recopie dans la conception des décisions déjà prises (voir l'entrée précédente). Les chiffres restent dans la config, la conception ne nomme que les règles.

**Prochaine étape** : 1.2, moteur de bataille sans affichage, avec des tests de scénarios.
