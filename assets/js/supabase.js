// ============================================================
// Supabase client (Supabase JS v2, loaded from CDN)
// ============================================================
window.FRS = window.FRS || {};

(function () {
  'use strict';

  const cfg = window.FRS_CONFIG;
  const ok = cfg &&
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_URL.indexOf('PASTE_YOUR') === -1 &&
    cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_ANON_KEY.indexOf('PASTE_YOUR') === -1;

  if (!ok) {
    console.warn('[FRS] Supabase not configured. Open assets/js/config.js and paste your credentials.');
    window.FRS.configured = false;
    return;
  }
  window.FRS.configured = true;
  window.FRS.client = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );
})();