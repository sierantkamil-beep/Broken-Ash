/**
 * Gore check: hosts a game, then kills a body each way around the player (beheaded by an execution,
 * burst by a crushing blow, cut down, charred, shocked, rotted, drained) and photographs it in flight
 * and after it settles: tools/e2e/out/gore-1.png, gore-2.png. For judging the art.
 *
 *   xvfb-run -a node tools/e2e/gore.cjs     (after pnpm --filter client build && pnpm --filter desktop build)
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
    env: { ...process.env, ASH_TEST_PARAMS: "autohost=1&name=Gore&path=thorn&body=male", ASH_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "ash-gore-")) },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => console.log("pageerror", e.message));
  await win.setViewportSize({ width: 1280, height: 720 }).catch(() => {});
  await win.waitForFunction(() => !!window.__room, null, { timeout: 120000 });
  await win.waitForFunction(() => window.__room.state.cinematic !== "", null, { timeout: 60000 }).catch(() => {});
  await win.keyboard.press("Escape");
  await win.waitForFunction(() => window.__room.state.cinematic === "", null, { timeout: 60000 });
  await win.waitForTimeout(2000);
  await win.evaluate(() => {
    const s = window.__game().scene.getScene("world");
    const me = s.me.pred.render();
    const causes = [["exec", 2], ["crush", 2], ["cut", 0.6], ["fire", 0.5], ["shock", 0.5], ["rot", 0.5], ["spirit", 0.5], ["claw", 0.1]];
    causes.forEach(([cause, ok], i) => {
      const a = (i / causes.length) * Math.PI * 2;
      const x = me.x + Math.cos(a) * 3.2;
      const y = me.y + Math.sin(a) * 2.4;
      s.vfx.handle({ t: "death", id: `g${i}`, gore: true, x, y, dx: Math.cos(a), dy: Math.sin(a), cause, ok, kind: "shambler" });
    });
  });
  await win.waitForTimeout(350);
  await win.screenshot({ path: path.join(OUT, "gore-1.png") });
  await win.waitForTimeout(3500);
  await win.screenshot({ path: path.join(OUT, "gore-2.png") });
  await app.close();
})();
