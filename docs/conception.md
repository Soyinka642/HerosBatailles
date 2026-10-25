# Le Prince du Portail — Document de conception

Oct 24, 2026 · @Yves-Pol Deniélou

## Pitch

**Un jeune prince en deuil apprend à devenir chef dans un monde inconnu : il grandit, et avec lui ses escouades et son campement, et chaque choix se lit clairement dans des batailles où rien n'est laissé au hasard.**

Jeu vidéo solo de stratégie médiéval fantastique, jouable dans le navigateur. Le titre « Le Prince du Portail » est provisoire.

## Intention et public visé

Le joueur doit ressentir le plaisir de l'architecte d'armée : façonner des escouades dont les possibilités s'étendent de façon inattendue, puis voir ces choix payer sur le champ de bataille.

- **Principe directeur** : le jeu se déplie. On croit jouer à un petit jeu d'armes et d'armures, puis apparaissent des compétences, des emplacements, des leviers, la magie. Références de sensation : *A Dark Room*, *Universal Paperclips*, *Inscryption*.
- **Hiérarchie des piliers** : la gestion des escouades est le cœur, la bataille en est le juge, l'exploration et le campement sont des sources qui nourrissent le cœur.
- **Public** : l'auteur lui-même, sans visée commerciale pour l'instant.
- **Joueurs** : un seul, contre une IA. Le défi vient de la lecture d'armées ennemies annoncées, pas du bluff.
- **Durée** : parties courtes et rejouables (de l'ordre d'une heure, à préciser), à allonger ensuite.
- **Moyens** : un développeur seul, polyvalent (code, graphisme, son), jeu web hébergé via GitHub et Vercel.

## Boucle de jeu principale

Un cycle va d'une ouverture du portail à la suivante : le héros explore pendant que le campement se prépare, puis tout se joue en bataille.

1. **Explorer** : le héros parcourt la carte ; butins, rencontres, recrues.
2. **Préparer** : équiper, entraîner, bâtir ; tâches du campement.
3. **Lire la menace** : la vague du portail est annoncée.
4. **Déployer** (le portail s'ouvre) : placer les escouades et choisir leurs postures.
5. **Combattre** : tours animés automatiques ; leviers si le héros est là.
6. **Récolter** : expérience, butin, blessés à soigner. Puis cycle suivant.

Pendant l'exploration, escouades et civils accomplissent les tâches fixées en début de cycle. Le héros peut être absent à l'ouverture : l'armée se bat alors sans ses leviers, et une alerte prévient avant la case de non-retour. C'est la tension centrale du jeu : jusqu'où pousser avant de rentrer commander.

## Règles et mécaniques

Tout repose sur une règle : **tout est emplacement, et les emplacements se débloquent.** Chaque nouvelle couche doit changer des décisions, pas seulement des chiffres.

### Les escouades

- L'escouade est le personnage : nom, niveau, équipement commun, soldats anonymes.
- Deux jauges : le **moral**, avec des paliers d'efficacité (ferme, ébranlé, vacillant) et la déroute à zéro ; les **effectifs**, en valides, blessés et morts (rares).
- **Le moral encaisse d'abord** : tant que l'escouade est ferme, les dégâts ne retirent que du moral. Une fois l'escouade ébranlée, chaque point de dégâts retire 1 de moral et fait 1 blessé.
- **Les blessés réduisent l'attaque** en proportion des soldats valides, sans descendre sous un plancher : la perte d'effectifs affaiblit modérément, sans effondrer.
- Le **moral maximum** est une base commune, que l'histoire de l'escouade fera évoluer (étendard, sergent, nom, épreuves vécues…).
- Un **sergent** émerge avec l'expérience. Les héros sont des unités spéciales à part.
- **Pas de type d'escouade figé** : épéistes, archers et piquiers sont des compositions de départ, c'est-à-dire un équipement et des maîtrises. Une escouade peut changer d'arme et apprendre de nouvelles maîtrises par l'entraînement au campement. Elle peut porter une arme qu'elle ne maîtrise pas, mais sans les capacités spéciales de l'arme (le soutien de la pique, par exemple) et avec un malus d'attaque. Cavaliers et catapultes viendront plus tard ; leurs chiffres sont à calibrer.

### Dégâts

- **Dégâts = Attaque − Défense, avec un minimum.** Les dégâts finaux, une fois appliqués tous les modificateurs (moral, blessés, bonus), sont arrondis au plus proche. La formule vit dans une seule fonction du code pour pouvoir passer au pourcentage si besoin.
- Les multiplicateurs de moral et de blessés portent sur les dégâts nets, après la défense. Seule l'attaque subit les paliers. Perce-armure ne fait pas descendre la défense sous 0. Le malus d'une arme non maîtrisée porte sur l'attaque qu'elle améliore.
- Mots-clés : *Perce-armure X* (ignore X de défense), *Feu* (perte de moral à l'impact, puis brûlure : des dégâts fixes qui ignorent la défense ; une escouade déjà en feu voit sa brûlure rafraîchie, sans cumul ; si la cible se tient sur une fortification, la fortification brûle aussi), *Charge* (bonus après une course suffisante).

### La bataille

- **Tours animés**, avec accélération, ralentissement et pause. Ordre des phases : mouvement, tir, mêlée.
- **Terrain asymétrique**, sur une grille hexagonale : le campement fortifié d'un côté, le portail de l'autre. Il grandit avec le campement.
- **L'ennemi arrive par vagues** depuis le portail, selon un calendrier annoncé au moins en partie.
- **Les ordres** se donnent au déploiement, comme le ferait un commandant. Leur
  finesse se déplie avec l'expérience du héros :
  1. **Ordres généraux** : au début, une posture pour toute la bataille
     (*Tenir*, *Avancer*, *Contre-charger*…, puis d'autres débloquées :
     *Charger*, *Rallier*, *Retraite ordonnée*…). En *Avancer*, l'escouade va
     tout droit sur sa rangée ; si un ennemi s'y trouve, elle dévie vers le
     plus proche.
  2. **Premier tour planifié** : on fixe exactement le premier tour (trajet
     dessiné case par case, arrêts, tirs), puis l'escouade reprend sa posture.
  3. **Tours planifiés supplémentaires** : deuxième tour, troisième tour…
  4. **Ordres conditionnels**, en petit nombre par escouade (par exemple trois
     pour les plus grosses unités) : « si tu es chargé, recule ».
- **Quand le plan se heurte à la réalité** (chemin barré, aucune cible à
  portée), l'escouade applique une **réaction par défaut**, connue d'avance.
  Le dépliage permet de la modifier.
- **Réaction par défaut** : l'escouade dont le plan est contrarié s'arrête sur sa case pour le reste du tour, combat ce qu'elle a au contact ou à portée, frappe l'obstacle hostile s'il est destructible (l'ennemi frappe la palissade), puis reprend sa posture au tour suivant.
- **Mouvements simultanés** : toutes les escouades exécutent leur tour en même
  temps, et des règles fixes tranchent les conflits (même case visée, trajets
  qui se croisent). La bataille reste entièrement déterministe.
- **Résolution par pas** : au premier pas, toutes les escouades qui bougent avancent d'une case en même temps ; au deuxième pas, celles de vitesse 2 ou plus, et ainsi de suite. Chacune choisit sa case d'après les positions au début du pas.
- Un tireur en *Avancer* s'arrête dès qu'une cible est à portée au début d'un pas, puis tire.
- **Conflits de mouvement** : si deux escouades visent la même case, la plus rapide entre, puis la première déployée (nos escouades avant les ennemis ; entre ennemis, l'ordre d'arrivée), et l'autre reste sur place. Un échange de cases, ou une rotation, ne se fait pas : personne ne bouge. On peut entrer dans une case qui se libère au même pas ; si son occupant est bloqué, celui qui le suit l'est aussi.
- **Le contact engage** : une escouade au contact d'un ennemi au début d'un pas ne bouge plus. On ne passe pas à côté d'un ennemi.
- **Avancer** : tout droit tant qu'un ennemi est devant sur sa rangée, sinon vers l'ennemi le plus proche ; à chaque pas, la case de sa rangée d'abord, puis le nord, puis l'est. Un allié sur la case barre le chemin. Pendant un tour planifié, seul le contact interrompt le plan.
- **Arrivées** : au début du tour, et l'ennemi agit aussitôt. Sans rangée imposée, les rangées sont prises dans l'ordre centre, nord, sud. Une case occupée passe à la suivante ; si le portail est plein, l'arrivée attend.
- **Tir** : l'ennemi à portée le plus proche (départage nord, puis ouest). Un tireur au contact ne tire pas. On peut tirer sur un ennemi engagé avec un allié, sans ligne de vue.
- **Mêlée** : une seule cible, l'ennemi juste devant, sinon un ordre fixe. Une escouade prise par deux ennemis reçoit deux coups et n'en rend qu'un.
- **Déroute** : l'escouade fuit vers son camp (cœur du campement ou portail) à sa vitesse, tout droit, sinon par la diagonale arrière nord puis sud. Elle rompt le contact et n'est plus une cible, mais elle occupe sa case. Elle quitte le terrain en atteignant son camp ; bloquée pendant tout un tour, elle se débande et quitte aussi le terrain, avec les blessés qu'elle emmenait. Elle compte comme en déroute dès sa déroute. Le moral ne remonte pas pendant la bataille.
- **Fin de bataille** : un ennemi au cœur du campement quitte la bataille et l'incursion est comptée. Défaite quand toutes nos escouades sont en déroute ; si les derniers ennemis partent en déroute à la même phase et qu'aucune arrivée ne reste, c'est une victoire. Victoire quand il ne reste plus d'ennemi, ni sur le terrain ni à venir, ou quand le rituel est tenu. Issue indécise à la limite de tours.
- **Assaut** (posture des ennemis) : tout droit sur sa rangée vers le cœur du campement, sans dévier ; le contact engage. Un tireur s'arrête dès qu'une cible est à portée et reste dans une tour libre où il entre. Nos escouades ne la prennent pas. Chaque arrivée d'une vague a sa rangée d'apparition.
- **Palissade** : bloque le passage des deux camps. L'ennemi qu'elle arrête la frappe, sauf s'il a une de nos escouades au contact (formule unique, défense 0). Nous ne la frappons pas, et les tireurs ne la visent pas. Détruite, la case est libre ; les dégâts persistent.
- **Tour** : tout le monde la traverse ; seuls les tireurs y gagnent +1 portée et +2 défense, contre toutes les attaques. Elle ne perd de structure que par le Feu ; détruite, l'occupant reste sur sa case sans bonus.
- **Feu** : perte de moral pure à l'impact, après les dégâts. La brûlure tombe au début du tour, avant le mouvement. Une fortification brûle comme une escouade, même si l'occupant part. Le seuil des flèches enflammées porte sur la défense réelle, fortifications comprises, y compris pour un ennemi dans notre tour.
- **Tir de passage** : traverser la zone d'un tireur coûte des dégâts sans arrêter le mouvement. Les catapultes frappent une zone fixe choisie au déploiement.
- **Mêlée simultanée** : les deux camps subissent leurs dégâts en même temps. Soutien d'une pique maîtrisée placée derrière (la pique aura plus tard un effet propre contre les cavaliers), recul en cas de gros dégâts.
- **Flanc** : bonus d'attaque et perte de moral supplémentaire pour l'escouade prise de côté.
- **En cours de bataille**, le héros, s'il est présent, peut modifier des
  ordres grâce à ses leviers.
- **Les ennemis** ont un comportement simple et fixe par type, connu du joueur.
- **Les consommables** (la pâte des flèches enflammées…) sont portés par les
  escouades. Par défaut, le stock est réparti à parts égales entre les
  escouades capables de s'en servir. Avant chaque bataille, on peut changer
  cette répartition, qui est ensuite conservée. Ce qui n'est pas utilisé reste
  à l'escouade. Si l'escouade est détruite, sa part est perdue.
- **Usage des consommables** : chaque usage coûte une unité ; sans unité, l'escouade agit sans l'effet (une volée sans pâte part normale). Le reste d'une répartition inégale reste au campement, et une escouade en déroute garde sa part. Par défaut, les archers n'enflamment que les cibles assez cuirassées (seuil réglable) qui ne brûlent pas déjà.
- **Celui qui tient le terrain relève les siens** : les soldats tombés restent sur leur case ; repris à temps, ils reviennent blessés ; si l'ennemi tient la case plusieurs tours, ils meurent. L'encerclement aggrave les pertes. Une de nos escouades en déroute abandonne une part réglable de ses blessés sur sa case. L'ennemi tient la case s'il s'y trouve et qu'aucune de nos escouades n'est au contact ; après un nombre réglable de tours consécutifs, les tombés meurent. Sans ennemi sur la case, une de nos escouades dessus ou au contact les relève. À la fin de la bataille, ils sont relevés en cas de victoire et meurent en cas de défaite. L'ennemi n'abandonne pas de tombés.

### Équipement et développement

- **Emplacements fixes** : armes, armure (casque éventuel), monture, accessoires. Chacun a des **sous-emplacements d'amélioration** (flèches enflammées sur l'arc, qui consomment de la pâte incendiaire ; caparaçon sur le cheval).
- **Système de mains** : deux mains par défaut, plus avec des mutations. Arme à distance puis mêlée ; arme d'allonge puis arme courte ; deux armes = attaque modestement accrue sans défense ; épée et bouclier = défense.
- Certains objets ralentissent (plates, caparaçon). La rareté des matériaux limite l'équipement lourd.
- **On apprend ce qu'on pratique** : le combat améliore ce qu'on a fait au combat ; l'entraînement au campement permet d'apprendre le reste, dont de nouvelles maîtrises d'armes.
- **Traits vécus**, surtout positifs, nés de ce qui est arrivé (*Aguerris au tir*, *Craintifs*).
- **L'équipement et les maîtrises changent les chiffres et les capacités, le vécu change le comportement.**

### Le campement

- Les escouades et les civils reçoivent des **tâches une fois par cycle** : s'entraîner, construire, récolter, se reposer. Le nombre de tâches simultanées se débloque.
- Les **civils** travaillent, peuvent être recueillis en exploration et entraînés pour devenir soldats. Ils servent aussi de jauge de survie.
- **Fortifications** : surtout des structures à occuper, du terrain passif (palissades, fossés, haies) et quelques pièges. Une **tour**, réservée aux tireurs, augmente leur portée et leur défense ; l'ennemi peut la prendre en mêlée. Une **palissade** bloque le passage jusqu'à sa destruction (points de structure) et protège qui se tient derrière. Les dégâts des fortifications persistent après la bataille et se réparent au campement. Un piège échoue selon des conditions lisibles : usage unique, déjoué par les éclaireurs ou les volants.

### Le héros

- Second fils non préparé : au début, il reste en retrait et ne donne que des ordres simples. Plus tard, il peut apprendre à se battre, seul sur une case ou intégré à une escouade.
- Ses **leviers** viennent de son parcours (exploration, rencontres, apprentissages). Chacun porte ses propres limites : usages par bataille ou par partie, portée, effet qui s'émousse.
- **Ce qu'il enseigne reste acquis en son absence ; ce qu'il fait en personne exige sa présence.**

### L'exploration

- Déplacement case par case, avec des points de mouvement par jour, sur une petite carte dense.
- De nombreux **petits butins** et des **rencontres à choix** plus rares qui changent les options.
- **Règle de conception** : tout ce qu'on trouve doit pouvoir se voir en bataille.
- Les rencontres hostiles sont des événements à choix au résultat déterministe.
- Un avertissement prévient avant la case qui empêche de rentrer avant l'ouverture du portail.

### Ressources

- Deux ou trois au départ (nourriture, bois, métal), d'autres apparaissent avec les découvertes.
- Elles servent à équiper, construire et soigner. Un **entretien léger** en nourriture pèse sur le moral, donc sur la tenue en bataille et la guérison.

## Victoire et défaite

On gagne en **fermant le portail**, on perd quand **il n'y a plus de civils** ou quand **le héros meurt**.

- **Victoire** : l'exploration révèle le moyen de sceller le portail (artefact, rituel, peuple qui sait faire). La fermeture exige de tenir une dernière bataille, la plus rude, pendant le rituel : après les quatre vagues, une cinquième bataille où il faut tenir un nombre de tours fixé. Thématiquement, le prince ne reconquiert rien : il fait son deuil et choisit de vivre ici.
- **Défaite immédiate** : un ennemi qui atteint le cœur du campement tue des civils ; quand il n'en reste plus, la partie est perdue.
- **Le héros** : tombé sur sa case, il est sauvé blessé et immobilisé quelques cycles si un allié reprend la case à temps ; il meurt si l'ennemi la tient trop longtemps, et la partie s'arrête.
- **Difficulté** : escalade fixe des vagues pour commencer.

Les choix qui en découlent :

- explorer loin ou rentrer commander ;
- investir dans les hommes ou dans les murs ;
- enrôler un civil (un soldat de plus) ou le garder (une vie et des bras) ;
- à qui confier l'équipement rare ;
- chercher la fermeture du portail ou se renforcer ;
- engager le héros en première ligne ou le protéger.

## Progression

Dans une partie, la progression **est** le dépliage ; entre les parties, rien n'est conservé pour l'instant.

- **Ce qui grandit** : le héros (qui apprend à commander puis à combattre), les escouades (expérience, traits vécus, sergent), les emplacements d'équipement et de tâches, les postures, les leviers, les ressources connues, le campement et son champ de bataille.
- **Rythme** : au gré des découvertes, avec un **hasard dirigé** (dans l'esprit des « conteurs » de *RimWorld*) qui garantit des choses intéressantes au bon moment, par exemple près du campement de départ.
- **Génération de la carte** : en partie aléatoire, soit entière au départ avec des garanties, soit au fil de l'exploration en tenant compte du passé. À trancher en codant.
- **Rejouabilité** : ce que le monde offre détermine l'ordre du dépliage. Un haras sauvage fait découvrir la cavalerie tôt, une mine de fer pousse vers l'armure lourde, une tour en ruine ouvre la magie.
- **Entre les parties** : aucune progression permanente. Piste pour plus tard : enrichir le monde (nouveaux lieux, rencontres, couches possibles) sans rendre le joueur plus fort.

## Univers et direction artistique

Un monde **mélancolique et lumineux**, étrange et beau, où un peuple réfugié apprend à refaire sa vie.

- **Histoire** : fuyant des ennemis terribles, un peuple franchit un portail interdimensionnel. Le roi et son fils aîné meurent dans la fuite. Le second fils, jeune et non destiné à régner, doit mener les réfugiés dans un monde inconnu. Le portail se rouvre périodiquement pour lâcher les poursuivants.
- **Thème** : le deuil et l'enracinement. Explorer, recueillir des locaux, apprendre de ce monde, c'est déjà s'y installer ; fermer le portail, c'est couper le lien avec l'ancien.
- **Ce que le thème justifie** : le portail est l'horloge, le monde inconnu motive l'exploration, la rareté des recrues valorise l'amélioration plutôt que l'accumulation, les civils sont à la fois bras, recrues et vies.
- **Lumière** : un portail aux couleurs froides de l'ancien monde ; un campement d'abord gris qui se réchauffe à mesure qu'il grandit.
- **Style visuel** : 2D illustrée vue de trois quarts, dans l'esprit de *The Battle for Wesnoth*. **Sprites en calques** (corps, armure, armes, monture, étendard) pour afficher n'importe quelle combinaison d'équipement, animations simples. La 3D à la *Heroes of Might and Magic* reste un rêve pour plus tard.
- **Son** : une musique de campement qui **gagne des voix** à mesure que la communauté grandit ; un portail à la signature froide et dissonante, de plus en plus présente avant chaque ouverture.

## Premier prototype

Le premier prototype est une **tranche complète simplifiée**, jouable du début à la fin, pour découvrir en jouant ce que le moteur doit accueillir.

### Périmètre

- **Exploration** : carte d'environ 15 × 15 cases faite à la main, héros case par case, une dizaine de lieux, quelques petits butins, trois ou quatre rencontres à choix.
- **Campement** : quelques civils, trois tâches (s'entraîner, construire, récolter), deux ou trois ressources, entretien lié au moral.
- **Escouades** : trois compositions de départ (épéistes, archers, piquiers) ; une arme et une armure ; un sous-emplacement (flèches enflammées) ; ordres : un premier tour planifié, puis les postures *Tenir* et *Avancer* ; moral et blessés.
- **Bataille** : terrain fixe, une palissade et une tour à occuper, tours animés, ennemis sortant du portail, règle « celui qui tient le terrain relève les siens », journal de bataille.
- **Partie** : quatre vagues, un objet à trouver pour fermer le portail, puis une cinquième bataille, finale, pendant le rituel de fermeture.
- **Un seul vrai dépliage** pour tester la sensation : rencontrer un forgeron débloque les sous-emplacements d'amélioration.
- **Graphismes et son provisoires** : formes et icônes simples.

**Pour plus tard** : magie, mutations, mains multiples, héros combattant, traits vécus, mini-jeu d'exploration, terrain qui grandit, génération aléatoire, musique évolutive, 3D.

### Étapes de construction

- [ ] Choisir la pile technique : TypeScript, rendu 2D (Phaser ou PixiJS), déploiement GitHub + Vercel.
- [ ] Définir les formats de données en JSON : escouades, objets, ennemis, vagues, lieux, rencontres.
- [ ] Coder le moteur de bataille sans affichage, avec des tests sur quelques scénarios écrits à la main.
- [ ] Afficher la bataille en tours animés, avec chiffres de dégâts et journal qui explique chaque effet.
- [ ] Ajouter l'écran de préparation : équipement, postures, déploiement, lecture de la vague annoncée.
- [ ] Ajouter le campement : civils, tâches par cycle, ressources, construction de la palissade et de la tour.
- [ ] Ajouter la carte d'exploration : déplacement, butins, rencontres, compte à rebours du portail et alerte de non-retour.
- [ ] Enchaîner la partie : quatre vagues, objet de fermeture, bataille finale, écrans de victoire et de défaite.
- [ ] Ajouter le dépliage du forgeron et jouer plusieurs parties complètes.
- [ ] Noter ce qui ennuie, ce qui manque et ce qui surprend, puis choisir la couche suivante.

## Risques et parades

Le plus grand risque est le dépliage sans fin : il y aura toujours une couche de plus à imaginer.

| Risque | Parade |
| --- | --- |
| Dépliage sans fin | Terminer la tranche jouable avant tout ajout, puis une couche à la fois, jouée avant la suivante |
| Batailles illisibles à mesure que les règles s'empilent | Chiffres de dégâts visibles et journal de bataille dès le prototype |
| Moteur trop rigide ou trop ambitieux | Contenu en JSON ; du code générique seulement quand un deuxième cas concret le demande |
| Spirales d'équilibrage (perte de civils, absence du héros, équipement lourd) | Jouer beaucoup ; réglages chiffrés dans les fichiers de données |
| Graphismes en calques longs à produire | Graphismes provisoires jusqu'à ce que la boucle plaise, puis un seul type d'escouade illustré pour valider la méthode |
| Essoufflement d'un projet solo sans échéance | Un premier jalon jouable en entier, même laid, le plus vite possible |

## Questions ouvertes

À trancher en jouant, pas sur le papier.

- [ ] Les chiffres de base des escouades, recalibrés pour le jeu vidéo.
- [ ] Soustraction avec plancher ou réduction en pourcentage pour les dégâts.
- [ ] Combien de soldats par escouade, et le niveau du plancher de puissance des blessés.
- [ ] Combien de tours l'ennemi doit tenir une case pour que les soldats tombés meurent.
- [ ] La durée d'un cycle entre deux portails, et la vitesse de guérison qui va avec.
- [ ] La taille du champ de bataille de départ et le nombre d'escouades par camp.
- [ ] La valeur des leviers du héros : assez forts pour justifier sa présence, pas au point qu'une absence condamne.
- [ ] Le catalogue des leviers du héros, chacun avec ses limites propres.
- [ ] Les règles de combinaison du système de mains.
- [ ] La sauvegarde face au combat déterministe : recharge libre, sauvegarde de début de cycle ou mode sans recharge.
- [ ] Le hasard affiché pour certains pièges, en complément des échecs par conditions.
- [ ] Une escalade liée aux actes du joueur ou un ennemi qui s'adapte, si l'escalade fixe lasse.
- [ ] La spirale après une bataille coûteuse en civils.
- [ ] La forme du futur mini-jeu de combat d'exploration.
- [ ] Carte générée entière au départ ou au fil de l'exploration.
- [ ] L'enrichissement du monde entre les parties, quand le jeu s'allongera.
