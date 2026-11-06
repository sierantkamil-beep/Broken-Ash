/**
 * Walks the menus of the real desktop app like a player: the title screen, a new character (path,
 * weapon and look tabs, the live preview), the lobby, hosting, and the mastery panel in game.
 * Screenshots in tools/e2e/out/menu-*.png. Run after building client + desktop, under xvfb on Linux.
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { _electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });
const electronPath = require(path.join(ROOT, "desktop", "node_modules", "electron"));
const shot = (win, name) => win.screenshot({ path: path.join(OUT, `menu-${name}.png`) });

(async () => {
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [path.join(ROOT, "desktop"), "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: { ...process.env, ASH_TEST_PARAMS: "", ASH_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "ash-menu-")) },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => console.log("pageerror", e.message));
  win.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
  await win.setViewportSize({ width: 1400, height: 860 }).catch(() => {});
  await win.waitForFunction(() => !!window.__game?.()?.scene.getScene("world"), null, { timeout: 120000 });
  await win.waitForTimeout(2500);
  await shot(win, "1-title");
  await win.click("[data-go=create]");
  await win.waitForTimeout(3500);
  await shot(win, "2-create-path");
  await win.click(".path-card:nth-child(3)");
  await win.click("[data-tab=weapon]");
  await win.waitForTimeout(1500);
  await shot(win, "3-create-weapon");
  await win.click("[data-tab=look]");
  await win.click("text=Hełm z grzebieniem");
  await win.click("text=Naramienniki");
  await win.click("[data-pv=run]");
  await win.waitForTimeout(1500);
  await shot(win, "4-create-look");
  await win.click("[data-pv=attack]");
  await win.waitForTimeout(700);
  await shot(win, "5-preview-attack");
  await win.fill("#name", "Tsuyu Kaede");
  await win.click("#create-next");
  await win.waitForTimeout(800);
  await shot(win, "6-lobby");
  await win.click("#host-btn");
  await win.waitForFunction(() => !!window.__room, null, { timeout: 60000 });
  await win.waitForFunction(() => window.__room.state.cinematic !== "", null, { timeout: 60000 }).catch(() => {});
  await win.keyboard.press("Escape");
  await win.waitForFunction(() => window.__room.state.cinematic === "", null, { timeout: 60000 });
  await win.waitForTimeout(2500);
  await shot(win, "7-ingame");
  await win.keyboard.press("k");
  await win.waitForTimeout(1200);
  await shot(win, "8-mastery");
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
