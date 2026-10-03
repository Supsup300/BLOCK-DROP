# BLOCK DROP — Android final

Application Android portrait complète de **BLOCK DROP**. Le jeu est embarqué dans l'APK : il démarre sans dépendre du site public et conserve localement la partie, les scores, les niveaux, les cartes postales et les paramètres.

## Ce qui est intégré

- moteur 8×8, glisser-déposer tactile, combos, bonus, niveaux et 19 pays ;
- fonds de pays derrière la grille et carte postale tous les 10 niveaux ;
- reprise automatique de la partie et bouton Retour Android ;
- vraie intégration Google Mobile Ads : interstitielle entre certaines parties et vidéo récompensée pour la seconde chance ;
- consentement Google UMP et gestion ultérieure des choix publicitaires ;
- orientation portrait, plein écran, icône, splash screen et vibrations ;
- `versionCode 101`, `versionName 2.1.0` ;
- workflow GitHub Actions produisant un APK installable et un AAB Google Play.

## Obtenir l'APK installable avec GitHub

1. Créer un dépôt GitHub vide et y envoyer tout le contenu de ce dossier.
2. Ouvrir l'onglet **Actions** puis **Build BLOCK DROP Android**.
3. Cliquer **Run workflow**.
4. À la fin, télécharger l'artefact **block-drop-debug-apk**.
5. Décompresser l'artefact et installer `app-debug.apk` sur le téléphone Android.

Le débogage Android utilise l'identifiant `fr.adriansalard.blockdrop.debug`, ce qui permet de le tester sans écraser une éventuelle version Play Store.

## Produire l'AAB signé pour Google Play

Créer une clé de signature, puis ajouter ces secrets au dépôt GitHub :

| Secret | Contenu |
|---|---|
| `BLOCKDROP_KEYSTORE_BASE64` | fichier keystore encodé en Base64 sur une seule ligne |
| `BLOCKDROP_STORE_PASSWORD` | mot de passe du keystore |
| `BLOCKDROP_KEY_ALIAS` | alias de la clé |
| `BLOCKDROP_KEY_PASSWORD` | mot de passe de la clé |

Relancer ensuite le workflow et télécharger **block-drop-release-aab**. Sans ces secrets, le workflow produit bien l'AAB, mais il n'est pas signé pour Google Play.

## Publicités : état de livraison

Le projet utilise volontairement les identifiants de test officiels Google : les annonces s'affichent réellement, mais ne génèrent ni revenu ni trafic invalide pendant les tests.

- interstitielle : au plus après 3 parties terminées et 90 secondes depuis la précédente ;
- aucune interstitielle après un record ou le déblocage d'une carte postale ;
- vidéo récompensée uniquement après un choix explicite du joueur ;
- aucune annonce pendant une partie, un combo ou une animation.

Avant la publication commerciale :

1. remplacer l'App ID dans `app/src/main/res/values/strings.xml` ;
2. remplacer les deux unités dans `app/src/main/java/fr/adriansalard/blockdrop/ads/AdConfig.java` ;
3. compléter la fiche AdMob, le consentement et `app-ads.txt` avec le compte éditeur réel ;
4. indiquer une adresse de contact réelle dans la politique de confidentialité ;
5. augmenter `versionCode` si une version Play Console numérotée 101 ou plus a déjà été envoyée.

## Équilibrage 2.1

Les tirages utilisent les espaces disponibles pour éviter les séries sans issue immédiate, tout en conservant du hasard. La partie commence avec **Gomme** et **Tirage** ; chaque joker peut revenir une fois après 15 ou 12 lignes détruites. Les jokers encore disponibles peuvent être utilisés au Game Over pour sauver la partie. Leurs stocks et recharges sont sauvegardés.

## Compilation locale

Avec Android Studio Ladybug ou plus récent et le SDK Android 36 installé :

```sh
./gradlew lint assembleDebug
./gradlew bundleRelease
```

L'APK se trouve dans `app/build/outputs/apk/debug/`. L'AAB se trouve dans `app/build/outputs/bundle/release/`.

## Architecture

- `app/src/main/assets/public/` : jeu navigateur complet, utilisable hors ligne ;
- `MainActivity.java` : WebView locale sécurisée, sauvegarde et navigation Android ;
- `ads/` : préchargement et affichage Rewarded/Interstitial AdMob ;
- `consent/` : Google UMP et bouton de gestion des choix ;
- `.github/workflows/android-build.yml` : compilation contrôlée APK + AAB.

La politique de confidentialité publique est incluse dans le jeu sous `privacy.html`.
