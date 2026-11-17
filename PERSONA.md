# PERSONA.md

Mémoire des agents et document d'architecture vivant. Le lire avant toute modification, le tenir à jour quand une décision est prise ou qu'un invariant change. En cas de conflit avec `docs/`, ce fichier gagne.

## Projet

**Persona Studio** : studio VTuber desktop (macOS d'abord) façon VCam, qui anime n'importe quel persona à partir d'images importées et l'envoie dans OBS.

- Principe directeur : tout est local. Caméra, micro et images ne quittent jamais la machine ; OBS lit un overlay servi sur `127.0.0.1`.
- Langue de l'interface : français.

## Utilisateurs et espaces

Un seul utilisateur local, pas de compte, pas d'auth, pas de backend distant.

## Barre de qualité

- **Exactitude** : un profil invalide sur disque est ignoré, jamais un crash ; une frame malformée côté overlay est jetée.
- **Sécurité** : les ids de profil et noms de média sont validés en Rust (UUID, extension image, format détecté par magic bytes), ce qui ferme la traversée de chemin. Le serveur n'écoute que sur 127.0.0.1.
- **Performance** : les données par frame ne passent jamais par React (refs + rAF) ; les frames ne traversent l'IPC que si un overlay est connecté ; MediaPipe est chargé à la demande.
- **Architecture** : noyau pur (`rig/rig.ts`, `avatar/pngtuber.ts`, `avatar/puppet/mesh.ts`, `overlay-link/protocol.ts`, `src-tauri/src/profiles.rs`) testé ; composants et commandes Tauri minces.

Vérifier avant de dire fini (via `portly temp` / `portly wait`) : `pnpm check-types`, `pnpm lint`, `pnpm test`, `pnpm build`, `cargo test` et `cargo clippy --all-targets -- -D warnings` dans `src-tauri/`.

## Architecture

- **Rust (`src-tauri/`)** : `profiles.rs` (stockage `app_data_dir/profiles/<uuid>/profile.json` + images `<uuid>.<ext>`), `overlay/` (serveur axum sur 127.0.0.1:39540, repli jusqu'à 39549) avec `/overlay` (page OBS ; redirige vers Vite en dev), `/media/{profil}/{fichier}` (CORS `*` pour les textures WebGL), `/ws` (relais : profil mis en cache + frames diffusées), `/static/*` (bundle via `asset_resolver`).
- **Front (`src/`)** : deux entrées Vite, `index.html` (studio) et `overlay.html` (OBS). Les bundles vont dans `dist/static/` (`build.assetsDir`), car le serveur réserve `/media` et `/ws`.
- `modules/rig` : `RigFrame` en conventions écran (yaw > 0 = nez vers la droite de l'écran, pitch > 0 = vers le bas, roll > 0 = horaire ; blinkL = œil gauche de l'avatar = droite de l'écran). Pose de tête calculée en 2D depuis les landmarks (pas la matrice MediaPipe) pour des signes testables.
- `modules/tracking` : moteur unique (caméra + MediaPipe Face Landmarker VIDEO + micro WebAudio), horloge dans un Web Worker (WebKit ralentit les timers de la page quand la fenêtre n'est pas au premier plan).
- `modules/avatar` : `AvatarStage` partagé studio/overlay. 2D = PNGTuber (expressions × états repos/parle/cligne/parle+cligne, images empilées, visibilité basculée en rAF). 2.5D = puppet (468 landmarks détectés une fois à l'import, maillage Delaunay landmarks + grille, trou de bouche, déformation pure puis WebGL1).
- `modules/avatar/vrm` : `pose.ts` (pur, testé) convertit la rig frame en rotations d'os normalisés (cou/tête/buste, bras baissés) et poids d'expressions VRM (`aa`, `blinkLeft/Right`, `happy`, `surprised`). Les modèles VRM 0.x sont tournés de 180° par `rotateVRM0`, d'où l'inversion X/Z (`forMetaVersion`). `VrmView` (three.js) est importé en lazy : un profil 2D ne charge jamais three.
- `modules/profiles` : schéma zod (union discriminée sur `kind`), store zustand, sauvegarde différée 350 ms ; le nettoyage des médias orphelins se fait seulement au chargement.

## Glossaire

Persona (profil), Expression, État (repos, parle, cligne, parle + cligne), Puppet / 2.5D, Overlay, Rig frame, Recentrer (calibration).

## Conventions

- Pas de commentaire par défaut ; 1 à 2 lignes sur le pourquoi si besoin. Pas de tiret cadratin, pas d'emoji.
- Identifiants et commits en anglais (`feat:`, `fix:`, `ref:`), textes visibles en français.
- Imports `@/...` ; mutations via `useMutation` (`isPending`, jamais `useState`) ; modales via `components/shared/app-modal.tsx`.
- `pnpm` uniquement ; serveurs via Portly.

## Commandes

- Assets MediaPipe (non versionnés) : `pnpm setup:assets` (copie le wasm, télécharge `face_landmarker.task`).
- Dev : projet Portly `persona-studio`, serveur `app` = `pnpm tauri dev` (Vite sur 1436).
- **Caméra et micro** : en `tauri dev` lancé par Portly, macOS attribue la demande à Portly, qui n'a pas de `NSCameraUsageDescription`, et refuse en silence. Pour tester la caméra, construire le bundle : `pnpm tauri build --debug --bundles app` puis `open "src-tauri/target/debug/bundle/macos/Persona Studio.app"`.
- OBS : pour la voix modifiée, cocher « Contrôler l'audio via OBS » sur la source Navigateur.
- OBS : source Navigateur, URL `http://127.0.0.1:39540/overlay`, 1920x1080 (`?debug=1` affiche l'état de connexion).

## Ordre de construction

1. Socle, profils 2D et 2.5D, tracking webcam/micro, overlay OBS, raccourcis globaux. **Fait (2026-11-17).**
2. Modèles 3D VRM (three-vrm, `kind: "vrm"`, chargé à la demande). **Fait (2026-11-17).**
3. Voix : changeur de voix (AudioWorklet de hauteur + effets WebAudio) envoyé à chaque overlay en WebRTC local (signalisation via le WebSocket, hub Rust bidirectionnel avec un id par overlay) ; animation par la voix par persona (seuil, gain de bouche, cri). **Fait (2026-11-17).**
4. Gestes VRM : bras (MediaPipe Pose lite, world landmarks) et doigts (Hand Landmarker, flexion par doigt), ~15 Hz, seulement si un profil VRM a `gestures` actif ; `rig/gestures.ts` (pur, testé) puis `avatar/vrm/arms.ts` (slerp vers la pose, retour au repos hors champ). **Fait (2026-11-17).**
5. VRoid : synchro d'un export .vrm (`watch.rs`, polling 1,5 s, réimport quand la taille est stable) et personnalisation dans l'app (`vrm.custom` : teinte/masquage par nom de matériau, taille de tête, humeur au repos). **Fait (2026-11-17).**
6. Atelier 1 : recoloration de texture qui garde les ombres (`avatar/vrm/recolor.ts`, pur), motifs par partie (`patterns.ts`, `TextureEditor` recalcule depuis la texture d'origine), décor pour tous les avatars (`scene.background`) et ambiances lumineuses 3D (`avatar/lighting.ts`), actions rapides d'humeur VRM (touches 1 à 6). **Fait (2026-11-17).**
7. Atelier 2 (créateur type VRoid, avec nos propres assets) : à cadrer, voir décisions ouvertes.
8. Live2D (Cubism SDK, voir décisions ouvertes).
9. Placement manuel des repères du visage quand la détection échoue (personnages très stylisés).

## Décisions

### Prises
- 2026-11-17 : Tauri 2 desktop, overlay OBS par Browser Source locale (pas de caméra virtuelle).
- 2026-11-17 : tracking MediaPipe embarqué dans l'app (hors ligne).

### Ouvertes
- Nom définitif du produit (« Persona Studio » provisoire) et identifiant de bundle.
- Live2D : le Cubism SDK est propriétaire (licence gratuite sous un seuil de chiffre d'affaires) ; valider avant d'intégrer.
- Signature et notarisation macOS pour la distribution.

## Pièges connus

- Les captures Chrome headless (`--screenshot`) sont prises au `load` : un canvas WebGL ou un modèle chargé en asynchrone n'y apparaît pas. Vérifier la 3D dans l'app (capture de fenêtre).

- Biome prend `gl.useProgram` pour un hook : règle désactivée seulement pour `avatar/puppet/renderer.ts`.
- `tauri build` échoue si le bundle est en cours d'exécution : quitter l'app avant de reconstruire.
- Mouvement de tête : filtre One Euro (`rig.ts`, `HeadFilter`) sur yaw/pitch/roll/x/y ; le lissage exponentiel ne traite plus que le visage. Un test verrouille qu'une tête immobile reste immobile.
- Gestes : la profondeur MediaPipe est bruitée (amortie x0,5), hystérésis de visibilité 0,75/0,45, zone morte de 2,5 degrés ; ne pas retirer ces garde-fous sans retester à la webcam.
- Gestes : le côté gauche/droite vient de la position des épaules dans l'image (Pose inverse parfois ses étiquettes) ; un bras ne démarre que si son poignet est dans le cadre et qu'une main est détectée à côté (Pose invente des bras hors champ) ; `avoidTorso` garde coude et main devant le torse.
- CSP Tauri : `connect-src` doit garder `blob:`. Dans WKWebView, GLTFLoader charge les textures du .vrm par `fetch(blob:)` ; sans `blob:` toutes les textures sautent en silence (modèle blanc) dans le bundle seulement, pas en `tauri dev`.
- Le premier `tauri build` après une modification renvoie parfois 1 alors que le second passe : relancer avant de conclure à une erreur.
- Le port Vite 1420 est déjà pris dans Portly par un autre projet ; on utilise 1436/1437.
