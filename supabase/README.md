# Supabase — setup rapide (MMG)

## 1) Auth (sécurité)
Dans Supabase → **Authentication → Settings** :
- Désactive **Allow new users to sign up** (invite only)
- Ajoute les **Redirect URLs** :
  - `https://marie-madeleine-gautier.netlify.app/admin/`
  - ton futur domaine : `https://marie-madeleine-gautier.fr/admin/` (exemple)
  - (optionnel) `http://localhost:5500/admin/` si tu testes en local

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

