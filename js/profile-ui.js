// js/profile-ui.js
// Header profile UI: "avatar + pseudo" + modal edit (pseudo + avatar)
// Requires: supabase.js + supabase-config.js + supabase-client.js
// Works with partials injection: listens to "partials:loaded"

(() => {
  "use strict";

  // ----------------------------
  // Anti double-init
  // ----------------------------
  if (window.__MMG_PROFILE_UI_INIT__) return;
  window.__MMG_PROFILE_UI_INIT__ = true;

  // ----------------------------
  // Helpers
  // ----------------------------
  const qs = (s, r = document) => r.querySelector(s);

  const toast = (msg) => {
    if (!msg) return;
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);padding:10px 12px;border-radius:12px;" +
      "background:rgba(0,0,0,.75);border:1px solid rgba(255,255,255,.12);color:#fff;z-index:99999;font:14px system-ui";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  };

  const errText = (e) =>
    e?.message || e?.error_description || e?.hint || e?.details || String(e || "Erreur");

  const getSB = () => window.mmgSupabase || window.mmg_supabase || null;

  const getBucket = () => {
    const c = window.MMG_SUPABASE || {};
    return c.bucket || window.SUPABASE_BUCKET || "media";
  };

  const getRedirectUrl = () => {
    // plus fiable que pathname (garde query/hash)
    return encodeURIComponent(location.pathname + location.search + location.hash);
  };

  async function getUser() {
    const sb = getSB();
    if (!sb?.auth) return null;
    const { data, error } = await sb.auth.getSession();
    if (error) return null;
    return data?.session?.user || null;
  }

  // Create the row if missing, then read it
  async function ensureProfileRow(user) {
    const sb = getSB();
    if (!sb || !user) return null;

    // upsert minimal (id = auth.uid)
    const payload = {
      id: user.id,
      display_name: user.user_metadata?.name || null,
      avatar_url: null,
    };

    // IMPORTANT: ne pas écraser un avatar existant par null
    // => on "insert if missing" via upsert mais sans forcer avatar_url
    await sb.from("profiles").upsert(payload, { onConflict: "id" });

    const { data, error } = await sb
      .from("profiles")
      .select("id,display_name,avatar_url,role")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("[MMG] profiles read error:", error);
      return null;
    }
    return data || null;
  }

  // ----------------------------
  // Modal mounting
  // ----------------------------
  function mountModalOnce() {
    if (qs("#pfModal")) return;

    const modal = document.createElement("div");
    modal.id = "pfModal";
    modal.className = "pf-modal";
    modal.hidden = true;

    modal.innerHTML = `
      <div class="pf-card" role="dialog" aria-modal="true" aria-labelledby="pfTitle">
        <div class="pf-head">
          <div>
            <div class="pf-kicker">Profil</div>
            <h2 id="pfTitle" class="pf-title">Choisis ton pseudo & ton avatar</h2>

            <div class="pf-row" style="margin-top:8px;align-items:center">
              <div class="pf-avatarbig" id="pfAvatarBox">
                <img id="pfAvatarImg" alt="" style="display:none" />
              </div>
              <div style="min-width:0">
                <div class="pf-muted">Connecté :</div>
                <div class="pf-email" id="pfEmail"></div>
              </div>
            </div>
          </div>

          <button class="pf-x" type="button" id="pfClose" aria-label="Fermer">×</button>
        </div>

        <div class="pf-field">
          <label class="pf-label" for="pfName">Pseudo</label>
          <input class="pf-input" id="pfName" maxlength="32" placeholder="Ton pseudo" />
        </div>

        <div class="pf-field">
          <label class="pf-label" for="pfAvatar">Avatar</label>
          <input class="pf-input" id="pfAvatar" type="file" accept="image/*" />
          <div class="pf-muted" style="margin-top:8px">PNG/JPG — carré conseillé</div>

          <div class="pf-row" style="margin-top:10px">
            <button class="pf-btn" type="button" id="pfRemoveAvatar" style="display:none">Retirer l’avatar</button>
          </div>
        </div>

        <div class="pf-row" style="margin-top:14px">
          <button class="pf-btn pf-primary" type="button" id="pfSave">Enregistrer</button>
          <button class="pf-btn" type="button" id="pfSignOut">Se déconnecter</button>
        </div>

        <div class="pf-muted" id="pfMsg" style="margin-top:10px;min-height:18px"></div>
      </div>
    `;

    document.body.appendChild(modal);

    // close by backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) window.MMGProfile.close();
    });
  }

  function setInert(isOn) {
    // Avoid aria-hidden warnings: block focus behind modal
    const modal = qs("#pfModal");
    const kids = Array.from(document.body.children).filter((x) => x !== modal);
    kids.forEach((el) => {
      try {
        el.inert = isOn;
      } catch {
        // inert not supported => ignore
      }
    });
  }

  // ----------------------------
  // Storage (avatar upload)
  // ----------------------------
  async function uploadAvatar(userId, file) {
    const sb = getSB();
    if (!sb) throw new Error("Supabase non prêt.");

    const bucket = getBucket();
    const ext =
      (file.name.split(".").pop() || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "") || "jpg";

    const path = `avatars/${userId}.${ext}`;

    const { error: upErr } = await sb.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });
    if (upErr) throw upErr;

    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  }

  // ----------------------------
  // Header rendering
  // ----------------------------
  async function renderHeader() {
    const slot = qs("#mmgProfileSlot");
    if (!slot) return; // header not injected yet

    const sb = getSB();
    if (!sb) {
      slot.innerHTML = "";
      return;
    }

    const user = await getUser();
    slot.innerHTML = "";

    // logged out => login link
    if (!user) {
      const a = document.createElement("a");
      a.className = "pill";
      a.href = `/login.html?redirect=${getRedirectUrl()}`;
      a.textContent = "Se connecter";
      slot.appendChild(a);
      return;
    }

    const profile = await ensureProfileRow(user);
    const name = (profile?.display_name || user.email || "Mon profil").trim();
    const avatar = profile?.avatar_url || "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mmg-profbtn";
    btn.innerHTML = `
      <span class="mmg-profavatar">${avatar ? `<img src="${avatar}" alt="">` : ""}</span>
      <span class="mmg-profname">${escapeHtml(name)}</span>
    `;
    btn.addEventListener("click", () => window.MMGProfile.open());

    slot.appendChild(btn);
  }

  // Avoid injecting unsafe strings
  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ----------------------------
  // Modal fill + actions
  // ----------------------------
  async function fillModal() {
    const sb = getSB();
    const user = await getUser();
    const modal = qs("#pfModal");
    if (!sb || !user || !modal) return;

    const profile = await ensureProfileRow(user);

    qs("#pfEmail").textContent = user.email || "";
    qs("#pfMsg").textContent = "";

    qs("#pfName").value = profile?.display_name || "";

    const img = qs("#pfAvatarImg");
    const removeBtn = qs("#pfRemoveAvatar");

    // existing avatar
    if (profile?.avatar_url) {
      img.src = profile.avatar_url;
      img.style.display = "block";
      removeBtn.style.display = "inline-block";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
      removeBtn.style.display = "none";
    }

    // instant preview on file select
    const input = qs("#pfAvatar");
    input.value = "";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      img.src = URL.createObjectURL(f);
      img.style.display = "block";
      removeBtn.style.display = "inline-block";
    };
  }

  async function saveProfile() {
    const sb = getSB();
    const user = await getUser();
    if (!sb || !user) return;

    const msgEl = qs("#pfMsg");
    const name = (qs("#pfName").value || "").trim();
    const file = qs("#pfAvatar").files?.[0] || null;

    if (!name) {
      msgEl.textContent = "Pseudo obligatoire.";
      return;
    }

    msgEl.textContent = "Enregistrement…";

    try {
      // keep existing avatar if no new file
      let avatarUrl = null;
      const { data: existing, error: exErr } = await sb
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (exErr) throw exErr;
      avatarUrl = existing?.avatar_url || null;

      if (file) {
        avatarUrl = await uploadAvatar(user.id, file);
      }

      const { error } = await sb
        .from("profiles")
        .update({ display_name: name, avatar_url: avatarUrl })
        .eq("id", user.id);

      if (error) throw error;

      msgEl.textContent = "Profil mis à jour ✅";
      toast("Profil mis à jour ✅");
      await renderHeader();
    } catch (e) {
      console.error(e);
      msgEl.textContent = errText(e);
      toast("Erreur profil");
    }
  }

  async function removeAvatar() {
    const sb = getSB();
    const user = await getUser();
    if (!sb || !user) return;

    const msgEl = qs("#pfMsg");
    msgEl.textContent = "Suppression…";

    try {
      const { error } = await sb.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      if (error) throw error;

      qs("#pfAvatarImg").style.display = "none";
      qs("#pfRemoveAvatar").style.display = "none";
      qs("#pfAvatar").value = "";

      msgEl.textContent = "Avatar retiré ✅";
      toast("Avatar retiré ✅");
      await renderHeader();
    } catch (e) {
      console.error(e);
      msgEl.textContent = errText(e);
    }
  }

  async function signOut() {
    const sb = getSB();
    try {
      await sb?.auth?.signOut?.();
    } catch {}
    toast("Déconnecté");
    window.MMGProfile.close();
    await renderHeader();
  }

  // ----------------------------
  // Public API (global)
  // ----------------------------
  window.MMGProfile = {
    async init() {
      mountModalOnce();

      // Bind once
      const modal = qs("#pfModal");
      if (modal && !modal.__mmgBound) {
        modal.__mmgBound = true;

        qs("#pfClose").addEventListener("click", () => this.close());
        qs("#pfSave").addEventListener("click", saveProfile);
        qs("#pfRemoveAvatar").addEventListener("click", removeAvatar);
        qs("#pfSignOut").addEventListener("click", signOut);
      }

      await renderHeader();

      // session change => refresh header
      const sb = getSB();
      if (sb?.auth?.onAuthStateChange && !window.__MMG_PROFILE_AUTH_WATCH__) {
        window.__MMG_PROFILE_AUTH_WATCH__ = true;
        sb.auth.onAuthStateChange(() => renderHeader());
      }
    },

    async open() {
      const modal = qs("#pfModal");
      if (!modal) return;

      modal.hidden = false;
      document.body.style.overflow = "hidden";
      setInert(true);

      await fillModal();

      // focus
      setTimeout(() => qs("#pfName")?.focus(), 0);
    },

    close() {
      const modal = qs("#pfModal");
      if (!modal) return;

      modal.hidden = true;
      document.body.style.overflow = "";
      setInert(false);
    },

    async refresh() {
      await renderHeader();
    },
  };

  // ----------------------------
  // Boot strategy:
  // - DOMContentLoaded: init
  // - partials:loaded: refresh header slot after header injection
  // ----------------------------
  window.addEventListener("DOMContentLoaded", () => window.MMGProfile.init());
  document.addEventListener("partials:loaded", () => window.MMGProfile.refresh());
})();
