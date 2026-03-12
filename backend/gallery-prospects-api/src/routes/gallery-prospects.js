import { Router } from "express";

const STATUS = new Set(["a_contacter", "contacte", "relance", "reponse", "refus", "collaboration"]);
const TYPES = new Set(["sculpture", "contemporain", "figuratif"]);

const SORT_SQL = {
  date_desc: "contact_date desc nulls last, updated_at desc",
  date_asc: "contact_date asc nulls last, updated_at desc",
  name_asc: "name asc, updated_at desc",
  name_desc: "name desc, updated_at desc",
};

const text = (value) => String(value ?? "").trim();
const nullable = (value) => (text(value) ? text(value) : null);
const validDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : null);
const statusValue = (value) => (STATUS.has(text(value)) ? text(value) : "a_contacter");
const typeValue = (value) => (TYPES.has(text(value)) ? text(value) : "contemporain");

function cleanPayload(input = {}) {
  return {
    name: text(input.name),
    city: text(input.city),
    country: text(input.country),
    address: nullable(input.address),
    email: nullable(text(input.email).toLowerCase()),
    website: nullable(input.website),
    gallery_type: typeValue(input.type || input.gallery_type),
    status: statusValue(input.status),
    contact_date: validDate(input.contactDate || input.contact_date),
    notes: nullable(input.notes),
  };
}

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    country: row.country,
    address: row.address || "",
    email: row.email || "",
    website: row.website || "",
    type: row.gallery_type,
    status: row.status,
    contactDate: row.contact_date || "",
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertRequired(payload) {
  if (!payload.name || !payload.city || !payload.country) {
    const error = new Error("name, city and country are required");
    error.status = 400;
    throw error;
  }
}

function listWhere(query) {
  const clauses = [];
  const values = [];

  if (text(query.search)) {
    values.push(`%${text(query.search)}%`);
    clauses.push(`(
      name ilike $${values.length}
      or city ilike $${values.length}
      or country ilike $${values.length}
      or coalesce(email, '') ilike $${values.length}
    )`);
  }

  if (text(query.city)) {
    values.push(text(query.city));
    clauses.push(`city = $${values.length}`);
  }

  if (text(query.country)) {
    values.push(text(query.country));
    clauses.push(`country = $${values.length}`);
  }

  if (STATUS.has(text(query.status))) {
    values.push(text(query.status));
    clauses.push(`status = $${values.length}`);
  }

  if (TYPES.has(text(query.type))) {
    values.push(text(query.type));
    clauses.push(`gallery_type = $${values.length}`);
  }

  return {
    sql: clauses.length ? `where ${clauses.join(" and ")}` : "",
    values,
  };
}

function csvEscape(value) {
  const raw = String(value ?? "");
  if (!/[;"\n\r,]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, "\"\"")}"`;
}

function csvFromRows(rows) {
  const headers = ["name", "city", "country", "address", "email", "website", "type", "status", "contactDate", "notes"];
  const lines = [headers.join(";")].concat(
    rows.map((row) => headers.map((key) => csvEscape(row[key])).join(";"))
  );
  return `\uFEFF${lines.join("\r\n")}`;
}

async function insertMany(pool, rows) {
  if (!rows.length) return 0;

  const values = [];
  const groups = rows.map((row, index) => {
    const offset = index * 10;
    values.push(
      row.name,
      row.city,
      row.country,
      row.address,
      row.email,
      row.website,
      row.gallery_type,
      row.status,
      row.contact_date,
      row.notes
    );

    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`;
  });

  await pool.query(
    `insert into gallery_prospects (
      name, city, country, address, email, website, gallery_type, status, contact_date, notes
    ) values ${groups.join(", ")}`,
    values
  );

  return rows.length;
}

export function createGalleryProspectsRouter(pool) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const limit = Math.max(1, Math.min(Number.parseInt(req.query.limit || "500", 10), 2000));
      const sort = SORT_SQL[text(req.query.sort)] || SORT_SQL.date_desc;
      const where = listWhere(req.query);

      const { rows } = await pool.query(
        `select *
         from gallery_prospects
         ${where.sql}
         order by ${sort}
         limit $${where.values.length + 1}`,
        where.values.concat(limit)
      );

      res.json({ items: rows.map(mapRow) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/stats", async (_req, res, next) => {
    try {
      const { rows } = await pool.query(`
        select
          count(*)::int as total,
          count(*) filter (where status <> 'a_contacter')::int as contacted,
          count(*) filter (where status in ('a_contacter', 'relance'))::int as pending,
          count(*) filter (where status = 'collaboration')::int as collaborations
        from gallery_prospects
      `);

      res.json(rows[0]);
    } catch (error) {
      next(error);
    }
  });

  router.get("/export.csv", async (_req, res, next) => {
    try {
      const { rows } = await pool.query("select * from gallery_prospects order by contact_date desc nulls last, updated_at desc");
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", "attachment; filename=\"gallery-prospects.csv\"");
      res.send(csvFromRows(rows.map(mapRow)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const payload = cleanPayload(req.body);
      assertRequired(payload);

      const { rows } = await pool.query(
        `insert into gallery_prospects (
          name, city, country, address, email, website, gallery_type, status, contact_date, notes
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        returning *`,
        [
          payload.name,
          payload.city,
          payload.country,
          payload.address,
          payload.email,
          payload.website,
          payload.gallery_type,
          payload.status,
          payload.contact_date,
          payload.notes,
        ]
      );

      res.status(201).json({ item: mapRow(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const payload = cleanPayload(req.body);
      assertRequired(payload);

      const { rows } = await pool.query(
        `update gallery_prospects
         set
           name = $2,
           city = $3,
           country = $4,
           address = $5,
           email = $6,
           website = $7,
           gallery_type = $8,
           status = $9,
           contact_date = $10,
           notes = $11,
           updated_at = now()
         where id = $1
         returning *`,
        [
          req.params.id,
          payload.name,
          payload.city,
          payload.country,
          payload.address,
          payload.email,
          payload.website,
          payload.gallery_type,
          payload.status,
          payload.contact_date,
          payload.notes,
        ]
      );

      if (!rows.length) {
        res.status(404).json({ error: "Gallery prospect not found" });
        return;
      }

      res.json({ item: mapRow(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/import", async (req, res, next) => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows.map(cleanPayload) : [];
      rows.forEach(assertRequired);
      const inserted = await insertMany(pool, rows);
      res.status(201).json({ inserted });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
