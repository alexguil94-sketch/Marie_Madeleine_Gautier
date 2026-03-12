import "dotenv/config";
import cors from "cors";
import express from "express";
import { Pool } from "pg";
import { createGalleryProspectsRouter } from "./routes/gallery-prospects.js";

const port = Number.parseInt(process.env.PORT || "8787", 10);
const databaseUrl = process.env.DATABASE_URL || "";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

const app = express();
app.disable("x-powered-by");

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", async (_req, res, next) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use("/api/gallery-prospects", createGalleryProspectsRouter(pool));

app.use((error, _req, res, _next) => {
  console.error("[gallery-prospects-api]", error);
  res.status(error?.status || 500).json({
    error: error?.message || "Internal server error",
  });
});

app.listen(port, () => {
  console.log(`[gallery-prospects-api] listening on http://localhost:${port}`);
});
