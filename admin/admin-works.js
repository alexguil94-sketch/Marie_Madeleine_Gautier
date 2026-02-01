/* admin/admin-works.js
   Compatible avec TON HTML:
   - #workForm, #workImages, #workDrop, #workPreview, #workMsg, #worksList
   - Champs: title, year, category, description, published (checkbox)
   - Upload Storage: media/works/<workId>/cover.<ext> + autres images optionnelles
   - Stocke cover dans works.image_path (si colonne existe)
   - Optionnel: tente d’insérer les autres images dans work_images (si table existe)
*/

(() => {
  const Admin = window.Admin;
  if (!Admin?.sb) throw new Error("Admin core non chargé");

  const sb = Admin.sb;
  const bucket = Admin.cfg?.bucket || "media";

  // ---- Sélecteurs (TON HTML)
  const $ = (s, r = document) => r.querySelector(s);

  const form = $("#workForm");
  const list = $("#worksList");
  const msg = $("#workMsg");

  const inputFiles = $("#workImages");
  const drop = $("#workDrop");
  const preview = $("#workPreview");
  const dropMeta = $("#workDropMeta");

  if (!form || !list) {
    console.warn("[ADMIN] works: éléments HTML manquants (#worksList / #workForm)");
    return;
  }

  // ---- Etat fichiers sélectionnés
  let files = []; // File[]

  const setMsg = (t = "", type = "muted") => {
    if (!msg) return;
    msg.textContent = t;
    msg.style.opacity = t ? "1" : "0.8";
  };

  const toast = (t, type = "info") => {
    Admin?.toast ? Admin.toast(t, type) : alert(t);
  };

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const extOf = (name) => {
    const e = (name.split(".").pop() || "jpg").toLowerCase();
    return e.replace(/[^a-z0-9]/g, "") || "jpg";
  };

  const publicUrl = (path) => Admin.publicUrl ? Admin.publicUrl(path) : "";

  // ---- Dropzone UI
  const renderPreviews = () => {
    if (!preview) return;
    preview.innerHTML = "";

    if (dropMeta) {
      dropMeta.textContent = files.length ? `${files.length} fichier(s) sélectionné(s)` : "";
    }

    files.forEach((f, idx) => {
      const card = document.createElement("div");
      card.className = "dz-thumb";

      const img = document.createElement("img");
      img.alt = f.name;
      img.src = URL.createObjectURL(f);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.title = "Retirer";
      btn.addEventListener("click", () => {
        files.splice(idx, 1);
        renderPreviews();
      });

      card.appendChild(img);
      card.appendChild(btn);
      preview.appendChild(card);
    });
  };

  const setFiles = (incoming) => {
    const arr = Array.from(incoming || []);
    // max 10
    const merged = [...files, ...arr].slice(0, 10);
    files = merged;
    renderPreviews();
  };

  // Click = ouvrir le file picker
  if (drop && inputFiles) {
    drop.addEventListener("click", () => inputFiles.click());
    drop.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        inputFiles.click();
      }
    });

    inputFiles.addEventListener("change", () => {
      setFiles(inputFiles.files);
      inputFiles.value = "";
    });

    // drag&drop
    ["dragenter", "dragover"].forEach((ev) => {
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.add("is-over");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      drop.addEventListener(ev, (e) => {
        e.preventDefault();
        drop.classList.remove("is-over");
      });
    });

    drop.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (!dt?.files?.length) return;
      setFiles(dt.files);
    });
  }

  // ---- DB helpers
  const fetchWorks = async () => {
    // on essaie de lire image_path/status si existent (si ça échoue: message clair)
    const { data, error } = await sb
      .from("works")
      .select("id,title,year,category,description,status,sort_order,image_path,updated_at,created_at")
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return data || [];
  };

  const renderList = (works) => {
    list.innerHTML = "";

    if (!works.length) {
      list.innerHTML = `<p class="muted">Aucune œuvre pour l’instant.</p>`;
      return;
    }

    works.forEach((w) => {
      const row = document.createElement("div");
      row.className = "admin-item";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.gap = "12px";

      const thumb = document.createElement("img");
      thumb.style.width = "64px";
      thumb.style.height = "64px";
      thumb.style.objectFit = "cover";
      thumb.style.borderRadius = "14px";
      thumb.style.border = "1px solid rgba(255,255,255,.12)";
      thumb.src = w.image_path ? publicUrl(w.image_path) : "";
      if (!thumb.src) thumb.style.background = "rgba(255,255,255,.06)";

      const txt = document.createElement("div");
      txt.innerHTML = `
        <div class="admin-item__meta">
          ${escapeHtml(w.status || "—")} • ${w.year ?? ""} • #${w.sort_order ?? 0}
        </div>
        <div><strong>${escapeHtml(w.title || "(sans titre)")}</strong></div>
        <div class="admin-item__text">${escapeHtml(w.description || "")}</div>
      `;

      left.appendChild(thumb);
      left.appendChild(txt);

      const actions = document.createElement("div");
      actions.className = "admin-actions";

      const btnStatus = document.createElement("button");
      btnStatus.type = "button";
      btnStatus.className = "btn";
      btnStatus.textContent = w.status === "published" ? "Dépublier" : "Publier";
      btnStatus.addEventListener("click", async () => {
        btnStatus.disabled = true;
        try {
          const next = w.status === "published" ? "draft" : "published";
          const { error } = await sb.from("works").update({ status: next }).eq("id", w.id);
          if (error) throw error;
          toast("Statut mis à jour.", "ok");
          await refresh();
        } catch (e) {
          console.error(e);
          toast(e.message || "Erreur statut", "err");
        } finally {
          btnStatus.disabled = false;
        }
      });

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn";
      btnDel.textContent = "Supprimer";
      btnDel.style.borderColor = "rgba(255,100,100,.35)";
      btnDel.addEventListener("click", async () => {
        if (!confirm(`Supprimer "${w.title}" ?`)) return;
        btnDel.disabled = true;
        try {
          // supprimer cover
          if (w.image_path) {
            await sb.storage.from(bucket).remove([w.image_path]);
          }
          // supprimer row
          const { error } = await sb.from("works").delete().eq("id", w.id);
          if (error) throw error;
          toast("Œuvre supprimée.", "ok");
          await refresh();
        } catch (e) {
          console.error(e);
          toast(e.message || "Erreur suppression", "err");
        } finally {
          btnDel.disabled = false;
        }
      });

      actions.appendChild(btnStatus);
      actions.appendChild(btnDel);

      row.appendChild(left);
      row.appendChild(actions);
      list.appendChild(row);
    });
  };

  const uploadOne = async (path, file) => {
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });
    if (error) throw error;
  };

  // ---- Submit: créer l’œuvre + upload images
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");

    const fd = new FormData(form);
    const title = String(fd.get("title") || "").trim();
    const yearRaw = String(fd.get("year") || "").trim();
    const category = String(fd.get("category") || "").trim();
    const description = String(fd.get("description") || "").trim();
    const published = !!fd.get("published"); // checkbox

    if (!title) return toast("Titre obligatoire.", "warn");

    try {
      // 1) créer la row works
      const payload = {
        title,
        year: yearRaw ? Number(yearRaw) : null,
        category: category || null,
        description: description || null,
        status: published ? "published" : "draft",
      };

      const { data: w, error: e1 } = await sb
        .from("works")
        .insert(payload)
        .select("*")
        .single();

      if (e1) throw e1;

      // 2) upload images (max 10)
      if (files.length) {
        // cover = 1ère image
        const cover = files[0];
        const coverPath = `works/${w.id}/cover.${extOf(cover.name)}`;
        await uploadOne(coverPath, cover);

        // update works.image_path si la colonne existe
        const { error: e2 } = await sb
          .from("works")
          .update({ image_path: coverPath, image_alt: title })
          .eq("id", w.id);

        // si image_path n’existe pas encore, e2 te le dira clairement
        if (e2) console.warn("update image_path failed:", e2);

        // autres images -> table work_images si elle existe
        if (files.length > 1) {
          const rows = [];
          for (let i = 1; i < files.length; i++) {
            const f = files[i];
            const path = `works/${w.id}/${String(i + 1).padStart(2, "0")}.${extOf(f.name)}`;
            await uploadOne(path, f);
            rows.push({ work_id: w.id, path, sort_order: i - 1, alt: title });
          }

          if (rows.length) {
            const { error: e3 } = await sb.from("work_images").insert(rows);
            // si la table n’existe pas, on ignore (cover reste ok)
            if (e3) console.warn("insert work_images failed (optional):", e3);
          }
        }
      }

      files = [];
      renderPreviews();
      form.reset();
      toast("Œuvre enregistrée ✅", "ok");
      await refresh();
    } catch (err) {
      console.error(err);
      toast(err?.message || "Erreur enregistrement", "err");
      setMsg(err?.message || "Erreur", "err");
    }
  });

  const refresh = async () => {
    try {
      const works = await fetchWorks();
      renderList(works);
    } catch (e) {
      console.error(e);
      toast(e?.message || "Erreur chargement œuvres", "err");
    }
  };

  // init
  refresh();
})();
