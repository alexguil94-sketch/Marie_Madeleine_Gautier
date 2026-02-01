(() => {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY; // ici c'est ta sb_publishable_...

  if (!url || !key) {
    console.warn("[SB] Missing SUPABASE_URL or SUPABASE_ANON_KEY");
    return;
  }

  // Custom fetch: supprime Authorization si c'est une API key (sb_...) et pas un JWT
  const fetchNoApiKeyBearer = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    const auth = headers.get("authorization") || headers.get("Authorization");

    if (auth) {
      const m = auth.match(/^Bearer\s+(.+)$/i);
      if (m) {
        const token = m[1].trim();
        const looksLikeJwt = token.split(".").length === 3;
        const looksLikeApiKey =
          token.startsWith("sb_publishable_") || token.startsWith("sb_secret_");

        // Si c'est une API key (pas un JWT), on supprime Authorization
        if (looksLikeApiKey && !looksLikeJwt) {
          headers.delete("authorization");
          headers.delete("Authorization");
        }
      }
    }

    return fetch(input, { ...init, headers });
  };

  // ⚠️ important: ton code utilise window.mmgSupabase
  window.mmgSupabase = supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: fetchNoApiKeyBearer,
    },
  });

  console.log("[SB] client ready", { keyPrefix: key.slice(0, 16), keyLength: key.length });
})();
