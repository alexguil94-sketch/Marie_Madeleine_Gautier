# Auth Google (Supabase) — MMG

Le code du site est déjà prêt (bouton Google sur `login.html` + sur l’admin `studio.html`).
Il reste à **activer Google OAuth** dans Supabase + Google Cloud.

## 1) Créer les identifiants Google

1. Ouvre **Google Cloud Console** → choisis/crée un projet.
2. Configure l’**écran de consentement OAuth** (nom de l’application, email, etc.).
3. Va dans **APIs & Services → Credentials**.
4. **Create Credentials → OAuth client ID** → type **Web application**.
5. Renseigne :
   - **Authorized JavaScript origins** :
     - Ton site : `https://ton-domaine.fr`
     - (dev) : `http://localhost:XXXX`
     - (GitHub Pages) : `https://<user>.github.io`
   - **Authorized redirect URIs** (IMPORTANT) :
     - `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

> Si tu vois l’erreur Google `redirect_uri_mismatch`, c’est presque toujours cette URL qui manque ou qui est différente.

## 2) Activer Google dans Supabase

Dans **Supabase Dashboard** :
1. **Authentication → Providers → Google**
2. Active Google, colle :
   - **Client ID**
   - **Client Secret**
3. Sauvegarde.

## 3) Configurer les URLs de redirection Supabase

Toujours dans Supabase :
1. **Authentication → URL Configuration**
2. Mets :
   - **Site URL** : l’URL publique du site (ex: `https://ton-domaine.fr`)
   - **Additional Redirect URLs** (ajoute au minimum) :
     - `https://ton-domaine.fr/login.html`
     - `https://ton-domaine.fr/studio.html`
     - `https://ton-domaine.fr/admin/index.html`
     - (dev) `http://localhost:XXXX/login.html`

> Le bouton Google sur l’admin redirige vers **la page admin courante**, donc ajoute aussi l’URL de l’admin que tu utilises (`/studio.html` ou `/admin/index.html`).

## 4) Test rapide

1. Va sur `login.html` → clique **Google**
2. Après connexion, tu dois voir `Connecté : ...`
3. Pour accéder à l’admin :
   - Dans Supabase → table `public.profiles` → mets `role = 'admin'` sur TON utilisateur, puis reconnecte-toi.

## 5) Dépannage (messages fréquents)

- **Supabase “Unsupported provider”** : Google n’est pas activé dans `Auth → Providers`.
- **Supabase “redirect_to not allowed” / “Invalid redirect URL”** : ajoute l’URL (et la page) dans `Auth → URL Configuration`.
- **Google 400 redirect_uri_mismatch** : l’URL callback Google doit être exactement :
  `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
- **Tu ouvres le site en `file://`** : OAuth ne marche pas. Il faut servir le site en `http(s)` (localhost ou domaine).

