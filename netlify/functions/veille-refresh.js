// netlify/functions/veille-refresh.js
// Trigger a fresh Veille scan on demand and return the generated JSON payload.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

const getIp = (headers = {}) => {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), v]));
  const direct = String(h["x-nf-client-connection-ip"] || "").trim();
  if (direct) return direct;
  const forwarded = String(h["x-forwarded-for"] || "").split(",")[0]?.trim();
  return forwarded || "unknown";
};

const RATE = new Map();
const rateLimit = (ip, { limit, windowMs }) => {
  const now = Date.now();
  const cur = RATE.get(ip);
  if (!cur || now >= cur.resetAt) {
    RATE.set(ip, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (cur.count >= limit) return { ok: false, remaining: 0, resetAt: cur.resetAt };
  cur.count += 1;
  return { ok: true, remaining: limit - cur.count, resetAt: cur.resetAt };
};

const execFile = (command, args, { cwd, timeoutMs }) =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let timer = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        finish({
          ok: false,
          code: null,
          stdout,
          stderr: `${stderr}\nProcess timed out after ${timeoutMs}ms`.trim(),
        });
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk || "");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      finish({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}\n${String(error?.message || error || "spawn error")}`.trim(),
      });
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      finish({
        ok: code === 0,
        code,
        stdout,
        stderr,
      });
    });
  });

const pythonLaunchers = [
  { command: "py", prefix: ["-3"] },
  { command: "python3", prefix: [] },
  { command: "python", prefix: [] },
];

async function resolvePython(cwd) {
  for (const launcher of pythonLaunchers) {
    const probe = await execFile(launcher.command, [...launcher.prefix, "--version"], {
      cwd,
      timeoutMs: 4000,
    });
    if (probe.ok) return launcher;
  }
  return null;
}

async function runScan({ cwd, scriptPath, outPath }) {
  const launcher = await resolvePython(cwd);
  if (!launcher) {
    throw new Error("python_unavailable");
  }

  const args = [
    ...launcher.prefix,
    scriptPath,
    "--out",
    outPath,
    "--timeout",
    String(process.env.MMG_VEILLE_LIVE_TIMEOUT || 5),
    "--max-links",
    String(process.env.MMG_VEILLE_LIVE_MAX_LINKS || 80),
    "--limit-items",
    String(process.env.MMG_VEILLE_LIVE_LIMIT_ITEMS || 80),
  ];

  const result = await execFile(launcher.command, args, {
    cwd,
    timeoutMs: Number(process.env.MMG_VEILLE_LIVE_PROCESS_TIMEOUT_MS || 45000),
  });

  if (!result.ok) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(detail || `scan_failed (${launcher.command})`);
  }

  return {
    launcher: `${launcher.command} ${launcher.prefix.join(" ")}`.trim(),
    stdout: result.stdout,
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const ip = getIp(event.headers || {});
  const rl = rateLimit(ip, { limit: 12, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return json(429, { ok: false, error: "rate_limited" });

  const cwd = process.cwd();
  const scriptPath = path.join(cwd, "tools", "veille", "scan.py");
  if (!fs.existsSync(scriptPath)) {
    return json(500, { ok: false, error: "missing_scan_script" });
  }

  const outPath = path.join(
    os.tmpdir(),
    `mmg-veille-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  );

  try {
    const scanMeta = await runScan({ cwd, scriptPath, outPath });

    const raw = fs.readFileSync(outPath, "utf8");
    const data = JSON.parse(raw || "{}");
    const items = Array.isArray(data?.items) ? data.items : [];

    return json(200, {
      ok: true,
      generatedAt: String(data?.generatedAt || ""),
      items,
      meta: {
        runner: "python",
        launcher: scanMeta.launcher,
        count: items.length,
      },
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: "scan_failed",
      detail: String(error?.message || error || "scan failed"),
    });
  } finally {
    try {
      fs.unlinkSync(outPath);
    } catch {}
  }
};
