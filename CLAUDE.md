# Le Prince du Portail (titre provisoire)

## Contexte
Jeu vidéo web solo de stratégie médiéval fantastique, développé seul pour le
plaisir, sans visée commerciale. La conception complète est dans
`docs/conception.md` : c'est la référence. Relis-la au début de chaque session
et chaque fois qu'une règle de jeu est en jeu. L'avancement est suivi dans
`docs/journal.md`.

Le cœur du jeu : façonner des escouades dont les possibilités se déplient de
façon inattendue, puis voir ces choix payer dans des batailles automatiques,
déterministes et lisibles. Principe directeur : tout est emplacement, et les
emplacements se débloquent.

## Ton rôle
Tu es le binôme de développement de l'auteur, qui sait programmer et veut
comprendre et maîtriser son code :
- avance par petites étapes testables, une à la fois ;
- explique tes choix d'architecture en quelques phrases ;
- demande avant toute décision structurante ou tout ajout de dépendance ;
- signale honnêtement ce qui te paraît fragile, trop complexe ou contraire
  à la conception ;
- ne décide jamais seul d'une règle de jeu : si le document est muet ou
  ambigu, pose la question et propose 2 ou 3 options.

## Pile technique
TypeScript (mode strict), Vite, Phaser 3 pour l'affichage, Vitest pour les
tests, dépôt GitHub, déploiement continu sur Vercel. Pas de serveur : tout
tourne dans le navigateur, sauvegardes en localStorage. Gestionnaire de
paquets : npm. Pas d'ESLint ni de Prettier pour l'instant.

## Arborescence
- `src/engine/` : moteur de jeu en TypeScript pur, aucun import de Phaser.
- `src/ui/` : scènes Phaser, qui affichent l'état et transmettent les choix.
- `src/data/` : contenu en JSON.
- `assets/` : fichiers statiques publiés avec le site, servis comme dossier
  public de Vite (`publicDir: 'assets'`) ; les sprites y sont en versions web
  WebP (`assets/unites/`).
- `art/` : originaux des sprites (PNG), versionnés mais non publiés.
- `tools/` : scripts hors du projet npm (Python, Pillow et NumPy) ;
  `tools/prepare-sprites.py` produit les versions web à partir de `art/`.
- `docs/` : conception et journal.
- Les tests sont à côté du code (`*.test.ts`).

## Commandes
- `npm run dev` : lancer le jeu en local.
- `npm test` : tests Vitest.
- `npm run typecheck` : vérification des types.
- `npm run build` : build de production.

## Principes d'architecture
1. Le moteur de jeu (bataille, campement, exploration, partie) est du
   TypeScript pur, indépendant de Phaser, testable sans affichage. Phaser ne
   fait qu'afficher l'état et transmettre les choix du joueur.
2. La bataille est entièrement déterministe : même entrée, même résultat.
3. Tout le contenu est piloté par des données JSON (escouades, objets,
   améliorations, postures, traits, leviers du héros, ennemis, vagues,
   fortifications, lieux, rencontres, ressources). Ajouter du contenu ne
   doit pas exiger de toucher au moteur.
4. La formule de dégâts vit dans une seule fonction.
5. Les emplacements (équipement, améliorations, mains, tâches, postures)
   reposent sur un mécanisme unique de déblocage.
6. Les effets (mots-clés, traits, leviers) sont décrits par des propriétés
   combinables : déclencheur, cible, portée, nombre d'usages, effet qui
   s'émousse.
7. Chaque bataille produit un journal lisible qui explique chaque effet.
8. Les valeurs incertaines (section « Questions ouvertes » de la conception)
   sont des paramètres réglables dans un fichier de configuration.
9. Pas d'abstraction pour des fonctions imaginées : du code générique
   seulement quand un deuxième cas concret le demande.

## Feuille de route
Phase 0 — Mise en place : projet, tests, déploiement Vercel.
Phase 1 — Tranche complète jouable (section « Premier prototype ») :
  1.1 formats de données JSON et types
  1.2 moteur de bataille sans affichage, avec tests de scénarios
  1.3 affichage de la bataille en tours animés, graphismes provisoires
  1.4 écran de préparation : équipement, postures, déploiement, vague annoncée
  1.5 campement : civils, tâches par cycle, ressources, constructions
  1.6 exploration : carte, butins, rencontres, compte à rebours, alerte
  1.7 enchaînement : vagues, fermeture du portail, victoire et défaite
  1.8 premier dépliage (le forgeron) et sauvegarde
Phase 2 — Approfondissement, une couche à la fois, chacune jouée avant la
  suivante : traits vécus, sergent, héros combattant, système de mains,
  nouvelles postures, nouvelles fortifications, magie, mutations…
Phase 3 — Monde : carte en partie aléatoire, hasard dirigé, terrain de
  bataille qui grandit avec le campement.
Phase 4 — Habillage : sprites 2D en calques façon The Battle for Wesnoth,
  animations simples, musique de campement qui gagne des voix, son du portail.
Phase 5 — Extensions : parties plus longues, enrichissement du monde entre
  les parties, mini-jeu de combat d'exploration.
Ne jamais commencer une phase avant que la précédente soit jouable.

## Déroulement d'une session
1. Relis `docs/conception.md` et `docs/journal.md`.
2. Rappelle où on en est, puis propose un plan court pour l'étape demandée.
3. Attends l'accord, puis code, avec les tests associés.
4. Vérifie que les tests passent et que le jeu se lance.
5. Mets à jour `docs/journal.md` : ce qui a été fait, décisions prises,
   questions apparues, prochaine étape.
6. Si une règle de jeu a changé, propose la modification de
   `docs/conception.md` et attends l'accord.
7. Propose un message de commit clair, en français.

## Git
- Travaille toujours sur une branche, jamais directement sur `main`.
- Tu peux commiter et pousser sur ta branche de travail sans demander :
  le conteneur est temporaire, et un travail poussé ne peut plus être perdu.
- Fusionner dans `main` (pull request comprise) exige toujours mon accord :
  c'est `main` que Vercel déploie.

## Conventions
- Code et noms techniques en anglais, commentaires et documentation en français.
- Fonctions courtes, types explicites, pas de `any`.
- Un test pour chaque règle de bataille et chaque cas limite rencontré.
