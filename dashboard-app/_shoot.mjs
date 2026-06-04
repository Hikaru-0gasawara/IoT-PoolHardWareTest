import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = "/home/user/IoT-PoolHardWareTest/dashboard-app/dist/client";
const OUT = "/tmp/shots";
mkdirSync(OUT, { recursive: true });

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain",
};

const ROUTES = [
  { label: "Visão Geral", file: "01-visao-geral" },
  { label: "Gráficos", file: "02-graficos" },
  { label: "Aquecimento", file: "03-aquecimento" },
  { label: "Alertas", file: "04-alertas" },
  { label: "Configurações", file: "05-config" },
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  headless: true,
});

async function serveRoute(route) {
  const url = new URL(route.request().url());
  if (url.hostname !== "local.app") return route.continue(); // deixa externos (fontes) seguirem
  let p = decodeURIComponent(url.pathname);
  let fsPath = join(DIST, p);
  if (p === "/" || !existsSync(fsPath) || extname(fsPath) === "") {
    // SPA fallback → shell
    fsPath = join(DIST, "index.html");
  }
  try {
    const body = readFileSync(fsPath);
    const ct = TYPES[extname(fsPath)] || "application/octet-stream";
    return route.fulfill({ status: 200, headers: { "content-type": ct }, body });
  } catch {
    return route.fulfill({ status: 404, body: "not found" });
  }
}

async function shoot(theme) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    colorScheme: theme === "light" ? "light" : "dark",
    deviceScaleFactor: 2,
  });
  await ctx.route("**/*", serveRoute);
  await ctx.addInitScript((t) => {
    try { localStorage.setItem("aquasense-theme", t); } catch {}
  }, theme);
  const page = await ctx.newPage();

  await page.goto("http://local.app/", { waitUntil: "load" });
  await page.waitForTimeout(3000); // store inicia com valores; deixa assentar

  for (const r of ROUTES) {
    try {
      const link = page.getByRole("link", { name: r.label, exact: false }).first();
      if (await link.count()) {
        await link.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1200);
      }
    } catch {}
    await page.screenshot({ path: `${OUT}/${theme}-${r.file}.png`, fullPage: true });
    console.log("shot", theme, r.file);
  }
  await ctx.close();
}

await shoot("dark");
await shoot("light");
await browser.close();
console.log("DONE");
