# Rapport de validation — 23 septembre 2026

## Équilibrage vérifié le 27 septembre 2026

- 80 parties simulées avec placements courants : médiane 40 poses ;
- 80 parties simulées avec placements réfléchis : médiane 184 poses ;
- 500 placements rapides et cas de bords : réussite ;
- joker Gomme au Game Over : reprise sur une case libérée ;
- joker Tirage sur plateau plein : stock conservé et aucune partie bloquée ;
- rechargements après 12/15 lignes : un seul par joker et par partie, sauvegardés.

## Jeu et publicité

- moteur 8×8 : réussite ;
- bords, superpositions, lignes, colonnes, combos, Game Over, bonus et sauvegarde : réussite ;
- stress du moteur : 500 placements rapides successifs sans duplication ni corruption ;
- cadence interstitielle : réussite (3 parties + délai de 90 secondes) ;
- pont navigateur ↔ Android : récompensée, interstitielle et panne d'annonce testées ;
- indisponibilité d'une interstitielle : la nouvelle partie démarre sans blocage ;
- indisponibilité d'une récompensée : retour propre au Game Over sans attribuer la récompense.

## Version publique déployée

- déploiement Sites : version 7, statut `succeeded` ;
- accueil : la mascotte ne recouvre plus le titre (aire de chevauchement mesurée : 0) ;
- page : aucun débordement horizontal ou vertical dans le navigateur de validation ;
- plateau : 477 × 477 px, parfaitement carré ;
- fond pays : France visible derrière la grille ;
- glisser-déposer réel : une pièce de 4 blocs posée, score passé de 0 à 8 ;
- placement invalide sur cases occupées : score et grille inchangés ;
- version PWA : manifeste, icône et cache hors ligne présents.

## Projet Android

- manifeste, ressources et 6 fichiers XML : syntaxe valide ;
- jeu embarqué identique au déploiement public ;
- Google Mobile Ads et Google UMP intégrés avec identifiants de test officiels ;
- retour Android, sauvegarde en arrière-plan, orientation portrait et splash configurés ;
- workflow GitHub Actions valide pour `lint`, APK debug et AAB release ;
- aucun secret ni keystore inclus dans l'archive.

La compilation binaire doit être exécutée par le workflow GitHub fourni ou par Android Studio, car l'environnement ayant produit cette archive ne contient pas le SDK Android et ne peut pas télécharger Gradle. Le workflow livré effectue cette compilation sur un runner Android complet.
