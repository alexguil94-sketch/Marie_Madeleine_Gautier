/* admin/js/admin-works.js
   Admin works manager:
   - list all works (draft/published/archived)
   - create/update
   - upload cover image to Storage: works/<id>/cover.<ext>
   - publish/unpublish
   - delete (db + storage file)
   - drag&drop reorder (sort_order)
*/

(() => {
  const Admin = window.Admin;
  if (!Admin?.sb) throw new Error("Admin core non chargé");

  // === SELECTORS (si ton HTML est différent, change ici) ===
  const SEL = {
    list: "#worksList",
    form: "#workForm",
    // inputs in the form
    title: "[name='title']",
    status: "[name='status']",
    sort: "[name='sort_order']",
    alt: "[name='image_alt']",
    file: "[name='image_file']",
    desc: "[name='description']",
    year: "[name='year']",
    medium: "[name='medium']",
    dims: "[name='dimensions']",
    price: "[name='price_eur']",
    idHidden: "[name='id']",
    resetBtn: "[data-work-reset]",
  };

  const state = {
    works: [],
    draggingId: null,
  };

  const el = {};
  const cacheEls = () => {
    el.list = Admin.qs(SEL.list);
    el.form = Admin.qs(SEL.form);
    if (!el.list || !el.form) return false;

    el.inTitle = Admin.qs(SEL.title, el.form);
    el.inStatus = Admin.qs(SEL.status, el.form);
    el.inSort = Admin.qs(SEL.sort, el.form);
    el.inAlt = Admin.qs(SEL.alt, el.form);
    el.inFile = Admin.qs(SEL.file, el.form);
    el.inDesc = Admin.qs(SEL.desc, el.form);
    el.inYear = Admin.qs(SEL.year, el.form);
    el.inMedium = Admin.qs(SEL.medium, el.form);
    el.inDims = Admin.qs(SEL.dims, el.form);
    el.inPrice = Admin.qs(SEL.price, el.form);
    el.inId = Admin.qs(SEL.idHidden, el.form);
    el.resetBtn = Admin.qs(SEL.resetBtn, el.form);
    return true;
  };

  const readForm = () => {
    const toInt = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      id: el.inId?.value?.trim() || null,
      title: el.inTitle?.value?.trim() || "",
      status: el.inStatus?.value || "draft",
      sort_order: toInt(el.inSort?.value ?? 0) ?? 0,
      image_alt: (el.inAlt?.value || "").trim(),
      description: (el.inDesc?.value || "").trim(),
      year: toInt(el.inYear?.value),
      medium: (el.inMedium?.value || "").trim(),
      dimensions: (el.inDims?.value || "").trim(),
      price_eur: toInt(el.inPrice?.value),
      file: el.inFile?.files?.[0] || null,
    };
  };

  const fillForm = (w) => {
    if (el.inId) el.inId.value = w?.id || "";
    if (el.inTitle) el.inTitle.value = w?.title || "";
    if (el.inStatus) el.inStatus.value = w?.status || "draft";
    if (el.inSort) el.inSort.value = String(w?.sort_order ?? 0);
    if (el.inAlt) el.inAlt.value = w?.image_alt || w?.title || "";
    if (el.inDesc) el.inDesc.value = w?.description || "";
    if (el.inYear) el.inYear.value = w?.year ?? "";
    if (el.inMedium) el.inMedium.value = w?.medium ?? "";
    if (el.inDims) el.inDims.value = w?.dimensions ?? "";
    if (el.inPrice) el.inPrice.value = w?.price_eur ?? "";
    if (el.inFile) el.inFile.value = ""; // reset file input
  };

  const clearForm = () => fillForm(null);

  const fetchWorks = async () => {
    const { data, error } = await Admin.sb
      .from("works")
      .select(
        "id,title,status,sort_order,image_path,image_alt,updated_at,created_at"
      )
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });

    if (error) throw error;
    state.works = data || [];
    return state.works;
  };

  const uploadCover = async (workId, file) => {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `works/${workId}/cover.${safeExt}`;

    const { error } = await Admin.sb.storage
      .from(Admin.cfg.bucket)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || "image/jpeg",
      });

    if (error) throw error;
    return path;
  };

  const upsertWork = async (payload) => {
    const base = {
      title: payload.title,
      status: payload.status,
      sort_order: payload.sort_order,
      image_alt: payload.image_alt || payload.title,
      description: payload.description || null,
      year: payload.year,
      medium: payload.medium || null,
      dimensions: payload.dimensions || null,
      price_eur: payload.price_eur,
    };

    if (!base.title) throw new Error("Titre obligatoire.");

    if (!payload.id) {
      // INSERT
      const { data, error } = await Admin.sb
        .from("works")
        .insert(base)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    } else {
      // UPDATE
      const { data, error } = await Admin.sb
        .from("works")
        .update(base)
        .eq("id", payload.id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    }
  };

  const setStatus = async (id, status) => {
    const { error } = await Admin.sb.from("works").update({ status }).eq("id", id);
    if (error) throw error;
    await Admin.audit("set_status", "works", id, { status });
  };

  const deleteWork = async (id) => {
    // read image path
    const { data: w, error: e1 } = await Admin.sb
      .from("works")
      .select("image_path,title")
      .eq("id", id)
      .single();
    if (e1) throw e1;

    // delete storage file if exists
    if (w?.image_path) {
      const { error: e2 } = await Admin.sb.storage
        .from(Admin.cfg.bucket)
        .remove([w.image_path]);
      if (e2) {
        // on continue quand même: parfois l'image a déjà été supprimée
        console.warn("remove storage failed", e2);
      }
    }

    // delete db row
    const { error: e3 } = await Admin.sb.from("works").delete().eq("id", id);
    if (e3) throw e3;

    await Admin.audit("delete", "works", id, { title: w?.title });
  };

  const render = () => {
    el.list.innerHTML = "";
    if (!state.works.length) {
      el.list.innerHTML = `<p style="opacity:.7">Aucune œuvre pour l’instant.</p>`;
      return;
    }

    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "10px";

    state.works.forEach((w) => {
      const row = document.createElement("div");
      row.dataset.id = w.id;
      row.draggable = true;
      row.style.display = "grid";
      row.style.gridTemplateColumns = "64px 1fr auto";
      row.style.gap = "10px";
      row.style.alignItems = "center";
      row.style.padding = "10px";
      row.style.border = "1px solid rgba(255,255,255,.12)";
      row.style.borderRadius = "12px";
      row.style.background = "rgba(0,0,0,.15)";

      const img = document.createElement("img");
      img.alt = w.image_alt || w.title || "";
      img.width = 64;
      img.height = 64;
      img.style.objectFit = "cover";
      img.style.borderRadius = "10px";
      img.style.border = "1px solid rgba(255,255,255,.12)";
      img.src = w.image_path ? Admin.publicUrl(w.image_path) : "";
      if (!img.src) {
        img.style.background = "rgba(255,255,255,.06)";
      }

      const mid = document.createElement("div");
      const badge =
        w.status === "published"
          ? "✅ publié"
          : w.status === "draft"
          ? "📝 brouillon"
          : "📦 archivé";
      mid.innerHTML = `
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <strong>${escapeHtml(w.title || "(sans titre)")}</strong>
          <span style="opacity:.75;font-size:12px">${badge}</span>
          <span style="opacity:.55;font-size:12px">#${w.sort_order ?? 0}</span>
        </div>
        <div style="opacity:.55;font-size:12px">id: ${w.id}</div>
      `;

      const right = document.createElement("div");
      right.style.display = "flex";
      right.style.gap = "8px";
      right.style.flexWrap = "wrap";
      right.style.justifyContent = "flex-end";

      const btnEdit = mkBtn("Éditer", async () => {
        fillForm(w);
        Admin.toast("Mode édition.", "info");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      const btnPub = mkBtn(
        w.status === "published" ? "Dépublier" : "Publier",
        async () => {
          await setStatus(w.id, w.status === "published" ? "draft" : "published");
          Admin.toast("Statut mis à jour.", "ok");
          await refresh();
        }
      );

      const btnDel = mkBtn("Supprimer", async () => {
        const ok = confirm(`Supprimer l'œuvre : "${w.title}" ?`);
        if (!ok) return;
        await deleteWork(w.id);
        Admin.toast("Œuvre supprimée.", "ok");
        await refresh();
      });
      btnDel.style.borderColor = "rgba(255,100,100,.35)";

      right.append(btnEdit, btnPub, btnDel);

      // drag events
      row.addEventListener("dragstart", () => {
        state.draggingId = w.id;
        row.style.opacity = "0.6";
      });
      row.addEventListener("dragend", () => {
        state.draggingId = null;
        row.style.opacity = "1";
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      row.addEventListener("drop", async (e) => {
        e.preventDefault();
        const targetId = row.dataset.id;
        if (!state.draggingId || state.draggingId === targetId) return;
        reorder(state.draggingId, targetId);
        await persistSortOrder();
        Admin.toast("Ordre mis à jour.", "ok");
        await refresh(false);
      });

      row.append(img, mid, right);
      wrap.appendChild(row);
    });

    el.list.appendChild(wrap);
  };

  const reorder = (dragId, targetId) => {
    const arr = state.works.slice();
    const from = arr.findIndex((x) => x.id === dragId);
    const to = arr.findIndex((x) => x.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);

    // renumber sort_order (0..n-1)
    state.works = arr.map((w, idx) => ({ ...w, sort_order: idx }));
    render();
  };

  const persistSortOrder = async () => {
    // batch update (simple)
    const updates = state.works.map((w) => ({ id: w.id, sort_order: w.sort_order }));
    // On envoie une requête par item (simple et fiable). Si tu veux, je te fais une RPC bulk plus tard.
    for (const u of updates) {
      const { error } = await Admin.sb.from("works").update({ sort_order: u.sort_order }).eq("id", u.id);
      if (error) throw error;
    }
    await Admin.audit("reorder", "works", "bulk", { count: updates.length });
  };

  const refresh = async (doFetch = true) => {
    try {
      if (doFetch) await fetchWorks();
      render();
    } catch (e) {
      console.error(e);
      Admin.toast(Admin.errText(e), "err");
    }
  };

  const bindForm = () => {
    el.form.addEventListener("submit", async (evt) => {
      evt.preventDefault();
      try {
        const p = readForm();

        // 1) insert/update work row (no image yet)
        let w = await upsertWork(p);

        // 2) upload image if provided
        if (p.file) {
          const path = await uploadCover(w.id, p.file);
          const { error } = await Admin.sb.from("works").update({ image_path: path }).eq("id", w.id);
          if (error) throw error;
          w.image_path = path;
        }

        await Admin.audit(p.id ? "update" : "create", "works", w.id, { title: w.title });

        Admin.toast(p.id ? "Œuvre mise à jour." : "Œuvre créée.", "ok");
        clearForm();
        await refresh(true);
      } catch (e) {
        console.error(e);
        Admin.toast(Admin.errText(e), "err");
      }
    });

    if (el.resetBtn) {
      el.resetBtn.addEventListener("click", (e) => {
        e.preventDefault();
        clearForm();
      });
    }
  };

  const mkBtn = (label, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.padding = "8px 10px";
    b.style.borderRadius = "10px";
    b.style.border = "1px solid rgba(255,255,255,.15)";
    b.style.background = "rgba(255,255,255,.06)";
    b.style.color = "inherit";
    b.style.cursor = "pointer";
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await onClick();
      } finally {
        b.disabled = false;
      }
    });
    return b;
  };

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  // Public init
  Admin.initWorksAdmin = async () => {
    const ok = cacheEls();
    if (!ok) {
      console.warn("[ADMIN] works: éléments HTML manquants (#worksList / #workForm)");
      return;
    }
    bindForm();
    await refresh(true);
  };
})();
