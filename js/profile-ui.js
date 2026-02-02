// js/profile-ui.js
// Affiche "avatar + pseudo" dans le header + permet d’éditer (modal)
// Requiert: supabase.js + supabase-config.js + supabase-client.js

(() => {
  "use strict";

  if (window.__MMG_PROFILE_UI_INIT__) return;
  window.__MMG_PROFILE_UI_INIT__ = true;

  const qs = (s, r = document) => r.querySelector(s);

  const toast = (msg) => {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText =
      "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);padding:10px 12px;border-radius:12px;" +
      "background:rgba(0,0,0,.75);border:1px solid rgba(255,255,255,.12);color:#fff;z-index:99999;font:14px system-ui";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  };

  const getSB = () => window.mmgSupabase || window.mmg_supabase || null;

  const getBucket = () => {
    const c = window.MMG_SUPABASE || {};
    return c.bucket || window.SUPABASE_BUCKET || "media";
  };

  async function getUser() {
    const sb = getSB();
    if (!sb?.auth) return null;
    const { data } = await sb.auth.getSession();
    return data?.session?.user || null;
  }

  async function ensureProfileRow(user) {
    const sb = getSB();
    if (!sb || !user) return null;

    // Upsert minimal (id = auth.uid)
    await sb.from("profiles").upsert(
      { id: user.id, display_name: user.user_metadata?.name || null, avatar_url: null },
      { onConflict: "id" }
    );

    const { data } = await sb
      .from("profiles")
      .select("id,display_name,avatar_url,role")
      .eq("id", user.id)
      .maybeSingle();

    return data || null;
  }

  function mountModal() {
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
            <div class="pf-row" style="margin-top:8px">
              <div class="pf-avatarbig" id="pfAvatarBox"><img id="pfAvatarImg" alt="" /></div>
              <div>
                <div class="pf-muted">Connecté :</div>
                <div class="pf-email" id="pfEmail"></div>
              </div>
            </div>
          </div>
          <button class="pf-x" type="button" id="pfClose" aria-label="Fermer">×</button>
        </div>

        <div class="pf-field">
          <label class="pf-label">Pseudo</label>
          <input class="pf-input" id="pfName" maxlength="32" placeholder="Ton pseudo" />
        </div>

        <div class="pf-field">
          <label class="pf-label">Avatar</label>
          <input class="pf-input" id="pfAvatar" type="file" accept="image/*" />
          <div class="pf-muted" style="margin-top:8px">PNG/JPG — carré conseillé</div>
          <button class="pf-btn" type="button" id="pfRemoveAvatar" style="margin-top:10px;display:none">Retirer l’avatar</button>
        </div>

        <div class="pf-row" style="margin-top:14px">
          <button class="pf-btn pf-primary" type="button" id="pfSave">Enregistrer</button>
          <button class="pf-btn" type="button" id="pfSignOut">Se déconnecter</button>
        </div>

        <div class="pf-muted" id="pfMsg" style="margin-top:10px"></div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close by backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) window.MMGProfile.close();
    });
  }

  function setInert(isOn) {
    // Empêche les warnings aria-hidden en bloquant le focus derrière
    const modal = qs("#pfModal");
    const children = Array.from(document.body.children).filter((x) => x !== modal);
    children.forEach((el) => {
      try {
        el.inert = isOn;
      } catch {
        // inert pas supporté partout: pas grave
      }
    });
  }

  async function uploadAvatar(userId, file) {
    const sb = getSB();
    const bucket = getBucket();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `avatars/${userId}.${ext}`;

    const { error: upErr } = await sb.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (upErr) throw upErr;

    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || "";
  }

  async function renderHeader() {
    const slot = qs("#mmgProfileSlot");
    if (!slot) return; // hook manquant

    const user = await getUser();
    slot.innerHTML = "";

    // Pas connecté => bouton login
    if (!user) {
      const a = document.createElement("a");
      a.className = "pill";
      a.href = "login.html?redirect=" + encodeURIComponent(location.pathname);
      a.textContent = "Se connecter";
      slot.appendChild(a);
      return;
    }

    const profile = await ensureProfileRow(user);
    const name = profile?.display_name || "Mon profil";
    const avatar = profile?.avatar_url || "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mmg-profbtn";
    btn.innerHTML = `
      <span class="mmg-profavatar">${avatar ? `<img src="${avatar}" alt="">` : ""}</span>
      <span class="mmg-profname">${name}</span>
    `;
    btn.addEventListener("click", () => window.MMGProfile.open());

    slot.appendChild(btn);
  }

  async function fillModal() {
    const sb = getSB();
    const modal = qs("#pfModal");
    const user = await getUser();
    if (!sb || !modal || !user) return;

    const profile = await ensureProfileRow(user);

    qs("#pfEmail").textContent = user.email || "";
    const name = profile?.display_name || "";
    qs("#pfName").value = name;

    const img = qs("#pfAvatarImg");
    const box = qs("#pfAvatarBox");
    const removeBtn = qs("#pfRemoveAvatar");

    if (profile?.avatar_url) {
      img.src = profile.avatar_url;
      img.style.display = "block";
      removeBtn.style.display = "inline-block";
      box.style.opacity = "1";
    } else {
      img.removeAttribute("src");
      img.style.display = "none";
      removeBtn.style.display = "none";
      box.style.opacity = ".85";
    }

    // Preview immédiat
    const input = qs("#pfAvatar");
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

    const msg = qs("#pfMsg");
    msg.textContent = "Enregistrement…";

    const displayName = (qs("#pfName").value || "").trim();
    const file = qs("#pfAvatar").files?.[0] || null;

    if (!displayName) {
      msg.textContent = "Pseudo obligatoire.";
      return;
    }

    try {
      let avatarUrl = null;

      // si on a déjà un avatar en DB, on le garde si pas de nouveau fichier
      const { data: existing } = await sb.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
      avatarUrl = existing?.avatar_url || null;

      if (file) {
        avatarUrl = await uploadAvatar(user.id, file);
      }

      const { error } = await sb.from("profiles").update({
        display_name: displayName,
        avatar_url: avatarUrl,
      }).eq("id", user.id);

      if (error) throw error;

      msg.textContent = "Profil mis à jour ✅";
      toast("Profil mis à jour ✅");
      await renderHeader();
    } catch (e) {
      console.error(e);
      msg.textContent = e?.message || "Erreur sauvegarde";
    }
  }

  async function removeAvatar() {
    const sb = getSB();
    const user = await getUser();
    if (!sb || !user) return;

    const msg = qs("#pfMsg");
    msg.textContent = "Suppression…";

    try {
      const { error } = await sb.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      if (error) throw error;

      qs("#pfAvatarImg").style.display = "none";
      qs("#pfRemoveAvatar").style.display = "none";
      qs("#pfAvatar").value = "";
      msg.textContent = "Avatar retiré ✅";
      await renderHeader();
    } catch (e) {
      console.error(e);
      msg.textContent = e?.message || "Erreur";
    }
  }

  async function signOut() {
    const sb = getSB();
    await sb?.auth?.signOut?.();
    toast("Déconnecté");
    window.MMGProfile.close();
    await renderHeader();
  }

  // API globale
  window.MMGProfile = {
    async init() {
      mountModal();
      await renderHeader();

      const modal = qs("#pfModal");
      if (!modal) return;

      qs("#pfClose").onclick = () => this.close();
      qs("#pfSave").onclick = () => saveProfile();
      qs("#pfRemoveAvatar").onclick = () => removeAvatar();
      qs("#pfSignOut").onclick = () => signOut();

      // Re-render header quand session change
      const sb = getSB();
      sb?.auth?.onAuthStateChange?.(() => renderHeader());
    },

    async open() {
      const modal = qs("#pfModal");
      if (!modal) return;

      modal.hidden = false;
      document.body.style.overflow = "hidden";
      setInert(true);

      await fillModal();

      // focus dans la modale
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

  window.addEventListener("DOMContentLoaded", () => window.MMGProfile.init());
})();
