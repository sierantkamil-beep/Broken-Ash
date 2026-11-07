/**
 * Real casts through the game (input → server → effects): a levelled character aims each skill (the
 * aim preview), releases it, and the wind-up marks, chant, flight and landing are photographed.
 * PATH=storm by default. Screenshots in tools/e2e/out/cast-*.png.
 *   xvfb-run -a node tools/e2e/casts.cjs     (after building client + desktop)
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { _electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out");
const electronPath = require(path.join(ROOT, "desktop", "node_modules", "electron"));
const PATH = process.env.PATH_ID ?? "storm";

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ash-casts-"));
  fs.writeFileSync(path.join(dir, "characters.json"), JSON.stringify({ ayume: { name: "Ayume", path: PATH, xp: 1e6, talents: [], mastery: {}, picks: {}, updated: "x" } }));
  fs.writeFileSync(path.join(dir, "story.json"), JSON.stringify({ area: "soramei_courtyard", flags: ["seen:prolog", "seen:cells_intro", "gate_held", "seen:escape"] }));
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [path.join(ROOT, "desktop"), "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: { ...process.env, ASH_TEST_PARAMS: `autohost=1&name=Ayume&path=${PATH}&body=female`, ASH_USER_DATA: dir },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => console.log("pageerror", e.message));
  await win.setViewportSize({ width: 1280, height: 720 }).catch(() => {});
  await win.waitForFunction(() => !!window.__room && !!window.__game?.()?.scene.getScene("world")?.me, null, { timeout: 120000 });
  await win.waitForTimeout(4000);
  // Dismiss the intro cards.
  for (let i = 0; i < 3; i++) {
    await win.keyboard.press("Enter");
    await win.waitForTimeout(400);
  }
  const center = await win.evaluate(() => {
    const s = window.__game().scene.getScene("world");
    const c = s.cameras.main;
    const p = s.me.char.screen;
    return { x: (p.x - c.worldView.x) * c.zoom, y: (p.y - c.worldView.y) * c.zoom };
  });
  const target = { x: center.x + 260, y: center.y - 40 };
  await win.mouse.move(target.x, target.y);
  for (const [slot, key] of [[1, null], [2, "1"], [3, "2"], [4, "3"], [5, "4"]]) {
    await win.evaluate((s) => window.__game().scene.getScene("world").press(s), slot);
    await win.waitForTimeout(500);
    await win.screenshot({ path: path.join(OUT, `cast-${slot}-aim.png`) });
    await win.evaluate((s) => window.__game().scene.getScene("world").release(s), slot);
    for (const [i, wait] of [[0, 120], [1, 250], [2, 500]]) {
      await win.waitForTimeout(wait);
      await win.screenshot({ path: path.join(OUT, `cast-${slot}-${i}.png`) });
    }
    await win.waitForTimeout(2500);
    void key;
  }
  const fx = await win.evaluate(() => window.__room.state.players.get(window.__room.sessionId).level);
  console.log("level", fx);
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
