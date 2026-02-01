// js/supabase-config.js
// (clé anon seulement, jamais la service_role)

window.MMG_SUPABASE = {
  url: "https://dwmiiloophmziyqilygd.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3bWlpbG9vcGhteml5cWlseWdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2ODg2NjYsImV4cCI6MjA4NTI2NDY2Nn0.OMGbW4OYUPuklNfvSN3cqCX9PnmvIUiAB75qMfll_fg",
  bucket: "media",
};

// Compatibilité (anciens scripts + debug console)
window.SUPABASE_URL = window.MMG_SUPABASE.url;
window.SUPABASE_ANON_KEY = window.MMG_SUPABASE.anonKey;
window.SUPABASE_BUCKET = window.MMG_SUPABASE.bucket;
