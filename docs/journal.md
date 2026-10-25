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

## 2026-10-25 — Lot 1.2b : cœur du moteur de bataille

### Ce qui a été fait

- Moteur de bataille sans affichage dans `src/engine/battle/`, en TypeScript pur, codé dans l'ordre du périmètre, chaque étape avec ses tests :
  1. `hex.ts` : grille « odd-r », coordonnées cubiques (seul module à les connaître), distance, voisins dans un ordre fixe (E, NE, NW, W, SW, SE), devant/derrière relatifs au camp, appartenance au terrain ;
  2. `state.ts` et `setup.ts` : état de bataille sérialisable (tableau d'escouades trié par `rank`, ni Map ni Set) ; stats réelles (base + équipement, malus et capacités perdues d'une arme non maîtrisée, moral maximum = base + modificateurs) ; vérification du déploiement (`BattleSetupError` qui liste tous les problèmes) ; file des ennemis annoncés, numérotés par type (« Fantassins du portail n°2 ») ; `fromTemplate` pour partir d'un modèle ;
  3. `damage.ts` : la formule unique `computeDamage`, qui rend le détail du calcul pour le journal ; `applyDamage`, point par point ; `morale.ts` : paliers et déroute ;
  4. `movement.ts` et `targeting.ts` : pas simultanés, intentions (tour planifié, Tenir, Avancer avec déviation, tireur qui s'arrête à portée), puis résolution : case tenue par une escouade immobile, cycles, conflits, chaînes ; contact qui engage ; réaction par défaut ; incursions au cœur du campement ;
  5. `fire.ts` : tir simultané, cible par défaut ;
  6. `melee.ts` : mêlée simultanée, cible par priorité fixe, Soutien ; `combat.ts` : ce que partagent tir et mêlée (effets des mots-clés, calcul et application des coups, déroute) ;
  7. déroute à zéro de moral, vérifiée à la fin de chaque phase ;
  8. `battle.ts` : `playTurn` (sur une copie de l'état, pour l'affichage tour par tour du lot 1.3) et `runBattle` ; arrivées par le portail, conditions de fin ;
  9. `events.ts` (événements structurés) et `narrate.ts` (journal en français, chaque calcul de dégâts écrit en entier).
- **Fortifications ignorées** : en 1.2b, le moteur ne lit pas `battlefield.fortificationSites` (commentaires dans `setup.ts`, `movement.ts`, `battle.ts`, `combat.ts`) et chaque journal commence par « Fortifications ignorées (lot 1.2c) ». Feu, consommables, Charge, tir de passage, flanc, recul, soldats tombés et encerclement sont aussi hors du lot : les effets à condition et les effets `onHit` sont ignorés.
- Scénarios lisibles dans `src/engine/battle/scenarios/` : douze journaux `.txt` versionnés (`toMatchFileSnapshot`), dont « épéistes contre fantassins », « piquiers en soutien », « archers qui tirent puis subissent la mêlée », « deux escouades visent la même case », « échange de cases et chaîne bloquée », « premier tour planifié », « la vague 1 complète ».
- Déterminisme : aucun `Math.random` ; toute itération suit le tableau trié des escouades ; un test joue deux fois la vague 4 et compare événements et journaux.
- Tests : 172 en tout (120 nouveaux). `typecheck`, `test` (y compris avec `CI=true`, qui compare les journaux sans les réécrire) et `build` passent ; le jeu se lance (l'interface n'utilise pas encore le moteur).
- `docs/conception.md` reprend les règles tranchées dans ce lot (Avancer, arrivées, tir, mêlée, déroute, fin de bataille, ordre des modificateurs de dégâts), avec l'accord de l'auteur.

### Décisions de règle de ce lot

1. Avancer : tout droit tant qu'un ennemi est devant sur sa rangée (ou qu'il n'y a aucun ennemi) ; sinon, déviation vers l'ennemi le plus proche.
2. Pas de déviation : parmi les voisines qui rapprochent le plus, sa propre rangée, puis le nord, puis l'est, sans tenir compte des alliés présents (une case prise = chemin barré). Les cases hors du terrain sont écartées.
3. Pendant un tour planifié, le plan prime : seul le contact l'interrompt (pas l'arrêt du tireur à portée).
4. « Devant » est relatif au camp ; le départage des cibles reste « le plus proche, puis le nord, puis l'ouest » pour tous.
5. Rangée d'apparition non précisée : centre d'abord, puis en alternant nord et sud (2, 1, 3, 0, 4).
6. Case du portail occupée (par n'importe quelle escouade) : case libre suivante dans cet ordre (la rangée imposée passe d'abord) ; portail plein : l'arrivée attend le tour suivant et garde son rang.
7. Les ennemis sortent au début du tour et agissent aussitôt.
8. Arme non maîtrisée : le malus porte sur les attaques que l'arme améliore, jamais sous 0.
9. Dégâts = (attaque + bonus − défense) × efficacité du moral × part des valides, puis arrondi au plus proche (0,5 vers le haut), puis minimum. Les multiplicateurs portent sur les dégâts nets. Perce-armure ne descend pas la défense sous 0.
10. Application point par point : un point encaissé par une escouade encore ferme ne fait pas de blessé. Le moral s'arrête à 0, les blessés à l'effectif, l'excédent est perdu.
11. Les paliers de moral ne touchent que l'attaque.
12. Tir : l'ennemi à portée le plus proche ; un tireur au contact ne tire pas ; on peut tirer sur un ennemi engagé avec un allié ; pas de ligne de vue ; tir simultané.
13. Mêlée : une cible, l'ennemi juste devant, sinon E, NE, SE, NW, SW, W ; tous les coups simultanés ; le Soutien vaut aussi pour un coup en diagonale.
14. Déroute : l'escouade quitte le terrain aussitôt. Pas de remontée du moral, pas de contagion.
15. Un ennemi qui entre dans le cœur du campement quitte la bataille ; l'incursion est comptée et la bataille continue.
16. Fin de bataille, vérifiée à la fin de chaque phase : défaite si toutes nos escouades sont en déroute (y compris si l'ennemi l'est aussi) ; victoire s'il ne reste aucun ennemi sur le terrain ni à venir. À la fin du tour : victoire de la bataille finale quand le rituel est tenu (victoire anticipée possible) ; issue « indécise » à `maxTurns`.

### Questions apparues

- **Les incursions sont presque impossibles** : avec la règle d'Avancer, un ennemi poursuit toujours notre escouade la plus proche et s'engage au contact avant la colonne 0. Le scénario « incursion au cœur » n'a pas pu être écrit avec un déploiement légal (le mécanisme est testé à part). La palissade (1.2c) ou un comportement ennemi « vers le campement » changera la donne : à décider.
- **Un tireur en Avancer s'arrête souvent trop tard** : l'arrêt se décide au début du pas, et l'ennemi avance en même temps ; dans le scénario, les archers tirent une volée puis se font rejoindre. À rejouer.
- **Des piquiers en Avancer sur la même rangée que des épéistes finissent souvent au contact en diagonale**, donc sans soutenir (vague 1). La formation « piquiers derrière » se tient mieux en Tenir.
- Des archers en Tenir trop en arrière (colonne 1 ou 2) ne tirent jamais : la portée 3 est courte sur un terrain de 12 colonnes.
- Une incursion du dernier ennemi donne une victoire (« plus aucun ennemi ») avec des incursions comptées : le lot 1.7 dira ce qu'elles coûtent.

### Idées notées pour plus tard (non codées)

- Futur dépliage : un choix de comportement permettra par exemple à des épéistes de contourner un allié pour attaquer de flanc au lieu de rester derrière.
- Futur dépliage : la priorité de cible (tir, et sans doute mêlée) pourra être changée.
- La fuite des escouades en déroute sera revue en 1.2c, avec les soldats tombés.

**Prochaine étape** : lot 1.2c (fortifications, Feu et consommables, tir de passage, flanc, recul, soldats tombés, encerclement, Charge), ou d'abord trancher la question des incursions.

## 2026-10-25 — Lot 1.2c : comportement des ennemis, fortifications, Feu et pâte

### Ce qui a été fait

- **Assaut** (`postures.json`, `movement: "assault"`, `enemyOnly: true`) : tout droit sur sa rangée vers le cœur du campement, sans dévier ; un tireur s'arrête dès qu'une cible est à portée et reste dans une tour libre où il entre. Tous les ennemis l'utilisent. Le déploiement la refuse pour nos escouades.
- **Fantassins du portail : vitesse 1** (aucun autre chiffre changé).
- **Journal** : articles partout (« Les Épéistes frappent les Fantassins du portail n°1 ») ; l'escouade est nommée à chaque changement d'état (« les Brutes du portail n°1 sont ébranlées ») ; accord au féminin grâce à un champ facultatif `feminine` des ennemis (les Brutes) ; en-tête avec les fortifications, les consommables portés, la portée et la défense réelles dans la tour.
- **Fortifications** (`fortifications.ts`) : chaque site de `battlefield.json` a un `id` ; la bataille reçoit `fortifications: [{ site, structure? }]` (un site absent n'est pas bâti) et rend la structure finale de chacune.
  - Palissade : bloque le passage des deux camps ; l'ennemi dont elle barre la route, sans escouade au contact, la frappe à la mêlée (formule unique, défense 0) ; détruite, la case est libre ; +2 en défense contre les tirs pour l'escouade juste derrière.
  - Tour : +1 portée et +2 défense pour un tireur (contre le tir et la mêlée) ; tout le monde la traverse ; un tireur ennemi en Assaut qui y entre y reste ; on ne déploie que nos tireurs dans la tour.
- **Feu et pâte** (`burn.ts`) : `upgrades` (flèches enflammées dans le sous-emplacement `fleches` de l'arc, verrouillé par le forgeron) et `carried` (consommables portés) en entrée ; `carried` restant en sortie. Règle par défaut : défense réelle contre les tirs (fortifications comprises) au moins égale au seuil, cible qui ne brûle pas déjà, une unité par volée. Impact : dégâts, puis perte de moral pure, puis brûlure rafraîchie sans cumul ; une cible sur une fortification la fait brûler aussi. La brûlure tombe au début du tour, après les arrivées et avant le mouvement.
- **Scénarios** : onze nouveaux journaux (`scenarios/fortifications.test.ts`), dont la vague 1 derrière la palissade et les vagues 2, 3, 4 et finale complètes avec le déploiement sensé (`scenarios/deployment.ts`) ; les douze du lot 1.2b sont regénérés.
- Tests : 216 (y compris `CI=true`). `typecheck`, `test` et `build` passent.
- Commits poussés sur la branche de travail, étape par étape (nouvelle règle de `CLAUDE.md`).

### Décisions de règle de ce lot

1. Posture « Assaut », réservée aux ennemis : tout droit vers le cœur du campement, sans dévier ; le contact engage ; un tireur s'arrête dès qu'une cible est à portée ; un tireur qui entre dans une tour libre y reste.
2. Fantassins du portail : vitesse 1.
3. Rangées d'apparition : chaque arrivée recevra sa rangée dans `waves.json` (proposition ci-dessous, non appliquée) ; l'ordre centre-nord-sud reste le secours.
4. Nos escouades ne frappent jamais la palissade.
5. Dégâts sur une palissade : la formule unique avec une défense de 0 (moral et blessés de l'attaquant comptent).
6. L'ennemi frappe la palissade si elle lui a barré la route pendant le mouvement de ce tour et qu'aucune de nos escouades n'est à son contact ; sinon il frappe l'escouade.
7. Les tireurs ne visent pas une palissade.
8. Palissade détruite : la case est libre aussitôt, la structure reste à 0 dans l'état rendu.
9. La tour ne perd de structure que par le Feu ; à 0, elle est détruite et l'occupant reste sans bonus.
10. Tout le monde traverse la tour vide ; seuls les tireurs y gagnent les bonus ; nous n'y déployons que des tireurs.
11. Bonus de la tour (+1 portée, +2 défense) contre toutes les attaques.
12. Feu : perte de moral pure à l'impact, appliquée après les dégâts de la volée.
13. Brûlure au début du tour, après les arrivées, avant le mouvement ; déroute et fin de bataille vérifiées juste après.
14. Seuil des flèches enflammées : défense réelle (bonus des fortifications compris).
15. La règle par défaut s'applique aussi à un ennemi abrité dans notre tour : la tour brûle aussi.
16. Brûlure d'une fortification : les mêmes chiffres que celle d'une escouade (2 par tour, 2 tours), même si l'occupant part.
17. Format : `upgrades` (emplacement → sous-emplacement → objet) et `fortifications: [{ site, structure }]` avec des ids de sites.

### Choix techniques de ce lot (sans règle de jeu nouvelle)

- Les effets du Feu des flèches ne portent que sur les tirs : des archers en mêlée ne brûlent rien.
- Deux volées enflammées sur la même cible au même tour coûtent chacune une unité (le tir est simultané) ; la seconde rafraîchit la brûlure.
- Le champ `feminine` des ennemis ne sert qu'au journal.

### Intentions des batailles (Q24, confirmées)

- Vague 1 : prise en main, sans perte grave.
- Vague 2 : première pression à distance (les tireurs).
- Vague 3 : la brute qui teste la palissade.
- Vague 4 : deux fronts, la palissade entamée.
- Finale : tenir 12 tours, au moins une palissade brisée, la victoire arrachée.

### Bilan d'équilibrage (déploiement sensé, trois escouades, chiffres actuels)

| Bataille | Issue | Tours | Nos escouades à la fin | Volées (enflammées) | Palissades N / CN / CS / S |
| --- | --- | --- | --- | --- | --- |
| Vague 1 | victoire | 13 | Épéistes 16/20, Piquiers 20/20, Archers 20/20 | 9 (0) | 24 / 0 / 24 / 24 |
| Vague 2 | victoire | 17 | Épéistes en déroute, Piquiers 7/20, Archers 20/20 | 13 (0) | 24 / 0 / 24 / 24 |
| Vague 3 | défaite | 30 | les trois en déroute | 16 (2) | 24 / 0 / 0 / 24 |
| Vague 4 | défaite | 18 | les trois en déroute | 8 (2) | 24 / 0 / 12 / 24 |
| Finale | victoire (rituel) | 12 | Épéistes et Piquiers en déroute, Archers 20/20 | 8 (2) | 22 / 0 / 0 / 24 |

Aucune incursion. La tour n'est jamais touchée.

Comparaison avec les intentions :
- Vague 1 : conforme, mais un seul escadron de fantassins abat une palissade (24) en six tours.
- Vague 2 : la pression à distance est réelle (13 tirs ennemis), mais les Épéistes partent en déroute : plus dur que prévu.
- Vague 3 : la brute passe par la brèche (rangée 2, apparition « centre d'abord ») au lieu de tester la palissade ; défaite.
- Vague 4 : défaite nette.
- Finale : « arrachée » au sens strict (deux escouades en déroute, deux palissades brisées), mais le rituel finit avant l'ennemi.

Ce qui pèse le plus : les Tireurs du portail s'arrêtent à 3 cases des Épéistes, en avant dans la brèche, hors de portée utile de nos Archers (qui visent le plus proche), et les usent 2 points par tour ; puis tout ce qui vient sur la rangée 2 tombe sur les mêmes Épéistes.

### Questions apparues

- **Un tireur ennemi ne peut presque jamais occuper la tour** : il s'arrête dès qu'une de nos escouades est à 3 cases, et toute case de la zone de déploiement est à 3 cases ou moins de la rangée 2 en colonne 3. Le scénario « Feu sur un ennemi abrité dans la tour » utilise donc une Brute arrêtée dans la tour par nos Épéistes.
- **Les flèches enflammées ne visent au prototype que les Brutes** (défense 3) : fantassins (2) et tireurs (1) sont sous le seuil de 3, sauf un tireur dans la tour.
- **Une égalité tardive** : en vague 3, Archers et Tireurs se mettent en déroute à la même phase au tour 30, ce qui donne une défaite (règle d'égalité) alors que tous les ennemis sont en déroute.
- **Avec trois escouades, la vague 4 est perdue** quels que soient les réglages essayés ; avec une 4ᵉ escouade (le civil recruté), elle se gagne. Faut-il caler la vague 4 sur quatre escouades ?

### Idées notées pour plus tard (non codées)

- Futur dépliage « archers prudents » : la règle par défaut épargne nos propres fortifications.
- Arme d'allonge qui frappe par-dessus la palissade.
- Priorité de cible modifiable (déjà notée) : viser les tireurs ennemis d'abord changerait beaucoup les vagues 2 à 4.

**Prochaine étape** : trancher les rangées d'apparition et les ajustements de chiffres proposés, puis lot 1.2d (tir de passage, flanc, recul, soldats tombés, encerclement, fuite des escouades en déroute).

## 2026-10-25 — Lot 1.2c (suite) : ajustements appliqués, règle d'égalité

### Ce qui a été fait

- Ajustements acceptés par l'auteur et appliqués :
  1. rangées d'apparition dans `waves.json`, une arrivée par rangée (`count: 1`) :
     - V1 : fantassins 2, 1 ;
     - V2 : fantassins 2, 3 ; tireurs 0 ;
     - V3 : fantassins 2, 4 ; tireurs 0 ; brute 1 ;
     - V4 : fantassins 2, 1 ; tireurs 4 ; brute 3 ; fantassins du tour 5 en 2, 0 ;
     - finale : fantassins 2, 1, 3 ; tireurs 0 ; brute 1 ; tireurs 4 ; fantassins du tour 5 en 2, 0 ; brute 3 ; fantassins du tour 7 en 2, 4 ;
  2. palissade : structure 24 → 36 ;
  3. Tireurs du portail : tir 4 → 3 ;
  4. vague 4 et finale calibrées sur quatre escouades : dans les scénarios, des Archers en renfort en (3,0), derrière la palissade nord.
- Règle d'égalité changée (Q23) : si nos dernières escouades et les derniers ennemis partent en déroute à la même phase, et qu'aucune arrivée ne reste, c'est une victoire (avant : défaite).
- `docs/conception.md` reprend les règles du lot 1.2c (Assaut, palissade, tour, Feu) et la nouvelle règle d'égalité.
- Scénarios regénérés ; tests adaptés aux nouveaux chiffres. `typecheck`, `test` et `build` passent.

### Bilan final (déploiement sensé, chiffres appliqués)

| Bataille | Issue | Tours | Nos escouades à la fin | Volées (enflammées) | Pâte restante | Palissades N / CN / CS / S |
| --- | --- | --- | --- | --- | --- | --- |
| Vague 1 | victoire | 13 | Épéistes 16/20, Piquiers 20/20, Archers 20/20 | 9 (0) | — | 36 / 12 / 36 / 36 |
| Vague 2 | victoire | 24 | Épéistes en déroute, Piquiers 13/20, Archers 20/20 | 13 (0) | — | 36 / 36 / 12 / 36 |
| Vague 3 | victoire | 22 | Épéistes en déroute, Piquiers 13/20, Archers 20/20 | 18 (3) | 1 | 36 / 10 / 36 / 0 |
| Vague 4 (4 escouades) | victoire | 20 | Épéistes et Piquiers en déroute, Archers 20/20, Archers en renfort 20/20 | 26 (2) | 2 | 27 / 16 / 0 / 29 |
| Finale (4 escouades) | victoire (rituel) | 12 | Épéistes 3/20 (10 blessés), Piquiers 20/20, Archers 20/20, Archers en renfort 16/20 | 18 (0) | 4 | 29 / 15 / 6 / 36 |

Aucune incursion ; la tour n'est jamais touchée. Les intentions de Q24 sont tenues : prise en main (V1), pression à distance (V2), la brute qui brise une palissade (V3), deux fronts et une palissade brisée (V4), victoire arrachée (finale).

### Points à réexaminer

- **Le recrutement devient quasi obligatoire avant la vague 4** : avec trois escouades, la vague 4 est perdue. À réexaminer au lot 1.5 (campement, civils, recrutement).
- **Objectif de durée, à viser plus tard** : une bataille en 10 à 15 tours environ. Aujourd'hui, les vagues 2 à 4 durent 20 à 24 tours (fantassins lents, palissade solide, duels d'escouades affaiblies).
- Les Épéistes de la brèche partent en déroute dans presque toutes les batailles : c'est le poste le plus exposé.

**Prochaine étape** : fusion du lot 1.2c dans `main` (accord donné si le bilan correspond à l'annonce), puis lot 1.2d.

## 2026-10-25 — Lot 1.2d : soldats tombés et fuite en déroute

Dernier lot du moteur de bataille pour le prototype.

### Ce qui a été fait

- **Fuite en déroute** (retour sur Q18) : une escouade dont le moral tombe à 0 passe au statut `fleeing`. Elle fuit vers son camp à sa vitesse : tout droit, sinon la diagonale arrière nord, puis sud, sinon elle reste sur place. Elle rompt le contact et n'est plus une cible, mais elle occupe encore sa case. Elle quitte le terrain en atteignant son camp : le cœur du campement pour nous, le portail pour l'ennemi. Elle compte comme en déroute dès sa déroute, pour la fin de bataille.
- **Soldats tombés** (`fallen.ts`) :
  - une de nos escouades en déroute abandonne la moitié de ses blessés, arrondie à l'inférieur, sur sa case (`fallen.abandonedShare`, 0,5) ;
  - à la fin de chaque tour, si un ennemi se tient sur la case et qu'aucune de nos escouades au combat n'est dessus ou au contact, l'ennemi la tient ; au bout de 2 tours consécutifs (`fallen.turnsHeldBeforeDeath`), les tombés meurent ;
  - sinon l'horloge repart à zéro ; s'il n'y a aucun ennemi sur la case et qu'une de nos escouades est dessus ou au contact, les tombés sont relevés et rejoignent leur escouade, blessés ;
  - à la fin de la bataille : relevés en cas de victoire, morts en cas de défaite ; en cas d'issue indécise, morts si la case est tenue, relevés sinon ;
  - l'ennemi n'abandonne pas de tombés.
- **Ce que rend la bataille** : `losses`, pour chacune de nos escouades : effectif restant (effectif − morts), blessés (tombés relevés compris), morts, tombés relevés pendant la bataille, relevés à la fin, perdus à la fin.
- **Journal** : déroute (« ils fuient vers le campement »), blessés abandonnés, case tenue (« tour 1 sur 2 »), tombés relevés ou morts, sortie du terrain, tombés à terre listés en fin de tour.
- **Scénarios** : cinq nouveaux (`scenarios/fallen.test.ts`) : tombés repris à temps, tombés perdus, fuite qui contourne ses alliés, fuite ennemie vers le portail, défaite qui fait mourir les tombés. Les anciens sont regénérés.
- Tests : 240 (y compris `CI=true`). `typecheck`, `test` et `build` passent.

### Décisions de règle de ce lot

T1 A, T2 A, T3 B, T4 A, T5 B, T6 A, T7 A ; F1 A à F8 A ; R1 (voir l'étape A du lot et le résumé ci-dessus). La brûlure d'une escouade en fuite (F8) ne fait plus rien, son moral étant à 0 : le moteur ne la joue simplement plus.

### Reporté en Phase 2

Tir de passage, flanc, recul, encerclement : leurs paramètres restent dans `config.json` (`passingFire`, `flank`, `pushback`, `encirclement`), sans être lus par le moteur. S'y ajoute la **poursuite des escouades en fuite** (F4 B : une escouade en fuite reste une cible, et les coups font de nouveaux tombés).

### Bilan d'équilibrage (déploiement sensé, chiffres du lot 1.2c)

| Bataille | Issue | Tours | Nos escouades à la fin | Volées (enflammées) | Morts | Tombés relevés (pendant + fin) | Palissades N / CN / CS / S |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vague 1 | victoire | 13 | Épéistes 16/20, Piquiers 20/20, Archers 20/20 | 9 (0) | 0 | 0 + 0 | 36 / 12 / 36 / 36 |
| Vague 2 | victoire | 24 | Épéistes en déroute (13 blessés), Piquiers 13/20, Archers 20/20 | 13 (0) | 0 | 6 + 0 | 36 / 36 / 12 / 36 |
| Vague 3 | victoire | 22 | Épéistes en déroute (13 blessés), Piquiers 13/20, Archers 20/20 | 18 (3) | 0 | 6 + 0 | 36 / 10 / 36 / 0 |
| Vague 4 | victoire | 20 | Épéistes et Piquiers en déroute (13 blessés chacun), les deux Archers 20/20 | 26 (2) | 0 | 12 + 0 | 27 / 16 / 0 / 29 |
| Finale | victoire (rituel) | 12 | Épéistes 8/20 (5 blessés), Piquiers 20/20, Archers 20/20, Archers en renfort 16/20 | 18 (0) | 0 | 0 + 0 | 34 / 15 / 6 / 36 |

- Issues et durées identiques au lot 1.2c. La règle ne rapproche pas les batailles de l'objectif de 10 à 15 tours.
- Aucun mort dans les cinq batailles : chaque fois que les Épéistes cèdent dans la brèche, les Piquiers juste derrière relèvent aussitôt leurs 6 blessés. Les morts n'apparaissent que dans les scénarios où notre ligne cède sans voisin (« tombés perdus ») et dans les défaites.
- Finale un peu plus facile qu'au lot 1.2c (Épéistes 8/20 au lieu de 3/20, palissade nord à 34 au lieu de 29) : des ennemis en fuite gênent ceux qui arrivent.

### Questions apparues

- **Embouteillage de fuite** : dans la bataille finale, les Fantassins n°1 en fuite en (6,2) ont derrière eux les Fantassins n°4, et leurs deux diagonales arrière sont prises. Ni les uns ni les autres ne bougent du tour 9 à la fin (tour 12), et les Fantassins n°6 restent bloqués en chaîne. C'est conforme à F2 A (« sinon elle reste sur place »), mais c'est un blocage permanent. Options proposées dans le compte rendu du lot ; règle inchangée en attendant.
- La poursuite (F4 B) rendrait la fuite plus coûteuse ; à jouer en Phase 2.

**Prochaine étape** : trancher l'embouteillage de fuite, fusionner le lot 1.2d, puis lot 1.3 (affichage de la bataille en tours animés).

## 2026-10-25 — Lot 1.2d (suite) : débandade, conception

### Ce qui a été fait

- **Débandade** (décision de l'auteur, option A) : une escouade en fuite qui n'a pas pu bouger de tout un tour (phase de mouvement entière) quitte le terrain. Pour nos escouades, c'est comme si elle avait atteint le campement : elle garde les blessés qu'elle emmenait ; les tombés déjà abandonnés suivent leur propre règle. Événement `dispersed`, raconté « bloqués dans leur fuite, se débandent et quittent le terrain ».
- Nouveau scénario `fuite-debandade` : nos Épéistes cèdent, leurs trois cases arrière sont tenues par nos propres escouades, et ils se débandent au tour suivant avec leurs blessés.
- `docs/conception.md` : nouvelle puce « Déroute » (fuite, débandade) et règle complète « celui qui tient le terrain relève les siens ».
- Scénarios regénérés ; `typecheck`, `test` et `build` passent.

### Bilan final (déploiement sensé)

| Bataille | Issue | Tours | Nos escouades à la fin | Volées (enflammées) | Morts | Tombés relevés (pendant + fin) | Débandades | Palissades N / CN / CS / S |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Vague 1 | victoire | 13 | Épéistes 16/20, Piquiers 20/20, Archers 20/20 | 9 (0) | 0 | 0 + 0 | 0 | 36 / 12 / 36 / 36 |
| Vague 2 | victoire | 24 | Épéistes en déroute (13 blessés), Piquiers 13/20, Archers 20/20 | 13 (0) | 0 | 6 + 0 | 0 | 36 / 36 / 12 / 36 |
| Vague 3 | victoire | 22 | Épéistes en déroute (13 blessés), Piquiers 13/20, Archers 20/20 | 18 (3) | 0 | 6 + 0 | 0 | 36 / 10 / 36 / 0 |
| Vague 4 | victoire | 20 | Épéistes et Piquiers en déroute (13 blessés chacun), les deux Archers 20/20 | 26 (2) | 0 | 12 + 0 | 0 | 27 / 16 / 0 / 29 |
| Finale | victoire (rituel) | 12 | Épéistes 3/20 (10 blessés), Piquiers 20/20, Archers 20/20, Archers en renfort 16/20 | 18 (0) | 0 | 0 + 0 | 1 | 31 / 15 / 6 / 36 |

- Aucune issue ne change. Dans la finale, les Fantassins n°1 bloqués en (6,2) se débandent ; la rangée 2 se libère, et les Épéistes retrouvent l'état du lot 1.2c (3/20).
- Le moteur de bataille du prototype est complet. La durée (20 à 24 tours pour les vagues 2 à 4) reste au-dessus de l'objectif de 10 à 15 tours.

**Prochaine étape** : lot 1.3, affichage de la bataille en tours animés.

## 2026-10-25 — Lot 1.3 : la bataille dans le navigateur

### Ce qui a été fait

- **Moteur (M1, M2)** :
  - `src/engine/battle/catalog.ts` rassemble les batailles déjà écrites : les vagues 1 à 4 et la finale avec le déploiement sensé, et huit scénarios parlants (palissade brisée, tour prise, Feu sur la tour, incursion, pâte épuisée, tombés repris, tombés perdus, débandade). Les tests de scénarios le lisent (`scenarios/catalog.test.ts`), et leurs journaux `.txt` sont inchangés.
  - `namesOf` et `lossesOf` sont exportés, pour raconter les événements un à un et afficher les pertes.
  - Aucune règle ajoutée ni modifiée.
- **Affichage** (`src/ui/`), Phaser pour le terrain seulement, HTML autour (D1 A) :
  - `app.ts` : menu des batailles, écran de bataille (terrain, commandes, légende, issue, journal), mise en page sur deux colonnes ou empilée sur écran étroit (le terrain y garde 720 px de large et défile du doigt) ;
  - `BattleScene.ts` : hexagones « odd-r », cœur du campement, zone de déploiement, portail, palissades et tour avec leur structure, éboulis, flamme d'une fortification en feu ;
  - `battle/token.ts` : jetons provisoires (V1 A) aux couleurs des camps (V2 A), abréviation, nom, barre de moral colorée selon le palier du moteur (V3 A), blessés, flamme et lueur du Feu (V5 A + B), jeton pâle avec flèche en fuite (V4 A) ;
  - tombés en étiquette grise « 6 à terre · 1/2 » (V6 A) ; chiffres flottants et traits de tir (V7 A) ;
  - `battle/record.ts` : la bataille est calculée en entier par `playTurn` avant d'être regardée ;
  - `battle/mirror.ts` : la copie affichée, tenue à jour en recopiant les valeurs des événements, recalée sur la photo de fin de tour du moteur ;
  - `battle/timeline.ts` : les temps d'animation (arrivées, Feu, chaque pas, tir, mêlée, tombés, fin de tour, issue) ;
  - `battle/player.ts` : lecture, pause, tour suivant, ×0,5 à ×4, recommencer ;
  - `battle/view.ts` : applique, anime et raconte chaque temps (texte de `narrateEvent`), puis l'issue et le tableau des pertes ;
  - `battle/animate.ts` : déplacements pas à pas, coups, tirs, apparitions et sorties.
- **Tests** : 281, dont la concordance entre la copie affichée et le moteur à chaque fin de tour pour tout le catalogue, le découpage en temps d'animation et le lecteur (sans Phaser). `typecheck`, `test` et `build` passent.
- **Aucune dépendance ajoutée.** Les captures d'écran de vérification ont été faites avec le Chromium et le Playwright de l'environnement, hors du projet.
- `TitleScene` est retirée ; le titre est dans l'en-tête HTML.

### Décisions prises

- D1 A, M1, M2, V1 A, V2 A, V3 A, V4 A, V5 A + B légère, V6 A, V7 A ; terrain et vitesses comme proposés (voir l'étape A du lot).
- Les lignes du journal reprennent le texte du moteur ; seul le préfixe « pas N : » est retiré, l'intitulé du temps le portant déjà.

### Questions apparues

- Le texte du terrain est petit (9 à 15 px à taille réelle) : lisible sur ordinateur, juste sur téléphone. Les sprites (Phase 4) changeront de toute façon l'échelle.
- Une bataille de 20 tours prend environ une minute à ×1 ; l'objectif de 10 à 15 tours compte aussi pour le confort de lecture.
- Deux escouades portent le même nom (« Archers ») dans la débandade : l'écran de préparation (1.4) devra donner des noms distincts.

**Prochaine étape** : vérifier la version en ligne après la fusion, puis lot 1.4 (écran de préparation).
