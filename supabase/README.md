# Supabase — setup rapide (MMG)

## 1) Auth (sécurité)
Dans Supabase → **Authentication → Settings** :
- Désactive **Allow new users to sign up** (invite only)
- Ajoute les **Redirect URLs** :
- `https://marie-madeleine-gautier.netlify.app/studio.html`
- `https://marie-madeleine-gautier.netlify.app/login.html`
- ton futur domaine : `https://marie-madeleine-gautier.fr/studio.html` (exemple)
- ton futur domaine : `https://marie-madeleine-gautier.fr/login.html` (exemple)
- (optionnel) `http://localhost:5500/login.html` + `http://localhost:5500/studio.html` si tu testes en local

💡 Si tu actives Google/Discord/Facebook, assure-toi aussi que ces URLs sont autorisées côté provider.

## 2) Database
Supabase → **SQL Editor** : colle `schema.sql` puis Run.
Si le projet est déjà en ligne, recolle le fichier complet pour remettre à jour les policies et ajouter les colonnes manquantes (`avatar_url`, contraintes de longueur, policies Storage avatar).

## 3) Storage
Supabase → **Storage → Buckets** : crée le bucket `media`.
Ensuite :
- soit tu le mets en **public**
- soit tu gardes privé + policies (déjà dans `schema.sql`)

Les nouvelles policies attendent cette organisation :
- contenus du site gérés par admin dans `media/*`
- avatars utilisateurs dans `media/avatars/<user-id>/...`

Les utilisateurs connectés ne peuvent modifier que leur propre dossier `avatars/<user-id>/`.

## 4) Créer ton compte admin
Option simple :
1. Va sur `/studio.html`
2. Connecte-toi avec ton email/mot de passe (user existant)
3. Dans Supabase → **Table Editor → profiles** :
   - mets `role = admin` pour ton user (id = uuid du user auth)

## 5) Relier le site
Ouvre `js/supabase-config.js` et colle :
- URL du projet
- anon key (Settings → API)

Commit + push → Netlify redéploie.



## 6) Connexions Google / Discord / Facebook + liaison d’identités
- Active les providers dans **Authentication → Providers**.
- Si tu veux que l’utilisateur puisse *lier/délier* plusieurs providers à un même compte depuis `login.html`, active **Enable Manual Linking** (Auth settings).
- Ensuite, la page `login.html` expose : connexion OAuth + liaison (`linkIdentity`) + délison (`unlinkIdentity`).
