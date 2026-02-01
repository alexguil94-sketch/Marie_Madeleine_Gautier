# Supabase — setup rapide (MMG)

## 1) Auth (sécurité)
Dans Supabase → **Authentication → Settings** :
- Désactive **Allow new users to sign up** (invite only)
- Ajoute les **Redirect URLs** :
- `https://marie-madeleine-gautier.netlify.app/admin/`
- `https://marie-madeleine-gautier.netlify.app/login.html`
- ton futur domaine : `https://marie-madeleine-gautier.fr/admin/` (exemple)
- ton futur domaine : `https://marie-madeleine-gautier.fr/login.html` (exemple)
- (optionnel) `http://localhost:5500/login.html` + `http://localhost:5500/admin/` si tu testes en local

💡 Si tu actives Google/Discord/Facebook, assure-toi aussi que ces URLs sont autorisées côté provider.

## 2) Database
Supabase → **SQL Editor** : colle `schema.sql` puis Run.

## 3) Storage
Supabase → **Storage → Buckets** : crée le bucket `media`.
Ensuite :
- soit tu le mets en **public**
- soit tu gardes privé + policies (déjà dans `schema.sql`)

## 4) Créer ton compte admin
Option simple :
1. Va sur `/admin/`
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
