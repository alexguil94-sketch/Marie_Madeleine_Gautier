// js/newsletter.js
// Gère tous les formulaires .newsletter-form de la page.
// Attribut data-source sur le <form> : "accueil", "galerie", etc.
(() => {
  "use strict";

  const waitForSB = (ms = 7000) =>
    new Promise((resolve) => {
      if (window.mmgSupabase) return resolve(window.mmgSupabase);
      const status = window.__MMG_SB_STATUS__;
      if (status && status !== "loading") return resolve(window.mmgSupabase || null);
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(window.mmgSupabase || null); } };
      document.addEventListener("sb:ready", finish, { once: true });
      setTimeout(finish, ms);
    });

  async function initForms() {
    const forms = document.querySelectorAll(".newsletter-form");
    if (!forms.length) return;

    const sb = await waitForSB();

    forms.forEach((form) => {
      const source = String(form.dataset.source || "site").trim();
      const msgEl  = form.querySelector(".newsletter-msg");
      const setMsg = (text) => { if (msgEl) msgEl.textContent = text; };

      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const emailInput = form.querySelector('[name="email"]');
        const btn        = form.querySelector('[type="submit"]');
        const email      = String(emailInput?.value || "").trim().toLowerCase();

        if (!email) return;

        if (!sb) {
          setMsg("Connexion indisponible — réessayez dans un instant.");
          return;
        }

        if (btn) btn.disabled = true;
        setMsg("Inscription en cours…");

        try {
          const { error } = await sb.from("abonnes").insert({ email, source });

          if (error) {
            if (error.code === "23505") {
              setMsg("✅ Vous êtes déjà inscrit(e) !");
            } else {
              throw error;
            }
          } else {
            setMsg("✅ Merci ! Vous recevrez les nouvelles de l'atelier.");
            form.reset();
          }
        } catch (err) {
          console.error("[newsletter]", err);
          setMsg("Erreur — " + (err?.message || String(err)));
        } finally {
          if (btn) btn.disabled = false;
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", initForms);
})();
