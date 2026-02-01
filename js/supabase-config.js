// js/supabase-config.js
// (clé anon seulement, jamais la service_role)

window.MMG_SUPABASE = {
  url: "https://dwmiiloophmziyqilygd.supabase.co",
  anonKey: "uNrn?48edE3DDaR",
  bucket: "media",
};

// Compatibilité (anciens scripts + debug console)
window.SUPABASE_URL = window.MMG_SUPABASE.url;
window.SUPABASE_ANON_KEY = window.MMG_SUPABASE.anonKey;
window.SUPABASE_BUCKET = window.MMG_SUPABASE.bucket;
