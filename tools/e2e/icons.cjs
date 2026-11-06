/**
 * The icon sheet: every skill's pixel icon (paths' signatures and every weapon skill) on one page,
 * with its name, in the accent of the path that owns it (weapon skills in Thorn's), screenshotted to
 * tools/e2e/out/icons.png. For judging the art, not a pass/fail test.
 *
 *   xvfb-run -a node tools/e2e/icons.cjs     (after pnpm --filter client build && pnpm --filter desktop build)
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { _electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });
const electronPath = require(path.join(ROOT, "desktop", "node_modules", "electron"));

(async () => {
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [path.join(ROOT, "desktop"), "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: { ...process.env, ASH_TEST_PARAMS: "icons=1", ASH_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "ash-icons-")) },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => console.log("pageerror", e.message));
  await win.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
  await win.waitForFunction(() => !!window.__skillIcon && !!window.__skills, null, { timeout: 60000 });
  const n = await win.evaluate(() => {
    const sheet = document.createElement("div");
    sheet.style.cssText = "position:fixed;inset:0;z-index:99;background:#0b090a;display:grid;grid-template-columns:repeat(14,1fr);gap:6px;padding:12px;overflow:auto;font:11px serif;color:#b9b2a8";
    const owner = (id) => Object.keys(window.__accents).find((p) => id.startsWith(p + ".")) ?? "thorn";
    for (const s of window.__skills) {
      const cell = document.createElement("div");
      cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center";
      const c = window.__skillIcon(s, window.__accents[owner(s.id)]);
      c.style.cssText = "width:48px;height:48px;image-rendering:pixelated";
      const t = document.createElement("span");
      t.textContent = s.name;
      cell.append(c, t);
      sheet.append(cell);
    }
    document.body.append(sheet);
    return window.__skills.length;
  });
  await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(OUT, "icons.png") });
  console.log("icons", n);
  await app.close();
})();
