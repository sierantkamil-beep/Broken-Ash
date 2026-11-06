/**
 * The skill gallery: hosts a game, then fires every skill's visual (its exact hit shape) (path signatures and every
 * weapon skill) on a grid around the player, pauses time mid-stroke and screenshots the result, a
 * page of skills at a time, into tools/e2e/out/ink-*.png. For judging the art, not a pass/fail test.
 *
 *   xvfb-run -a node tools/e2e/gallery.cjs     (after pnpm --filter client build && pnpm --filter desktop build)
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
    env: { ...process.env, ASH_TEST_PARAMS: process.env.PARAMS ?? "autohost=1&name=Gallery&path=thorn&body=male", ASH_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), "ash-gal-")) },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => console.log("pageerror", e.message));
  await win.setViewportSize({ width: 1280, height: 720 }).catch(() => {});
  await win.waitForFunction(() => !!window.__room, null, { timeout: 120000 });
  // Skip the prolog properly: wait for it to start, vote, wait for it to end (its wide shot would
  // make every stroke two pixels across).
  await win.waitForFunction(() => window.__room.state.cinematic !== "", null, { timeout: 60000 }).catch(() => {});
  await win.keyboard.press("Escape");
  await win.waitForFunction(() => window.__room.state.cinematic === "", null, { timeout: 60000 });
  await win.waitForTimeout(2500);
  const count = await win.evaluate(() => window.__skills.length);
  const per = 12;
  for (let page = 0; page * per < count; page++) {
   for (const pass of [0, 1]) {
    if (pass === 1) await win.evaluate(() => {
      const s = window.__game().scene.getScene("world");
      for (const l of s.galleryLabels ?? []) l.destroy();
      s.galleryLabels = [];
    });
    await win.waitForTimeout(pass ? 2500 : 0);
    await win.evaluate(
      ({ page, per }) => {
        const s = window.__game().scene.getScene("world");
        // (the scene clock keeps running: effects freeze through vfx.kit.hold instead)
        const cam = s.cameras.main;
        const skills = window.__skills.slice(page * per, page * per + per);
        const me = s.me.pred.render();
        skills.forEach((sk, i) => {
          // A 4 × 3 grid of world points around the player.
          const gx = (i % 4) - 1.5;
          const gy = Math.floor(i / 4) - 1;
          const x = me.x + gx * 4.2;
          const y = me.y + gy * 4.2;
          const aim = Math.PI * 0.25;
          const sh = sk.shape;
          const zone = sk.effects.find((e) => e.kind === "zone");
          if (sh.kind === "projectile") s.vfx.handle({ t: "bolt", id: 1e6 + i, skill: sk.id, vfx: sk.vfx, x, y, aim, speed: 3, range: 40, radius: sh.radius, owner: "x" });
          else if (sh.kind === "circle" && sh.at === "aim") s.vfx.handle({ t: "area", skill: sk.id, vfx: sk.vfx, x, y, radius: sh.radius, owner: "x" });
          else s.vfx.castShape(sk, sk.vfx, x, y, aim, "x");
          if (zone) s.vfx.handle({ t: "zone", skill: sk.id, vfx: sk.vfx, x: x + 0.5, y: y + 0.5, radius: zone.radius, duration: 5, owner: "x" });
          const p = s.cameras.main;
          void p;
          const label = s.add.text(0, 0, sk.name, { fontSize: "13px", color: "#fff", stroke: "#000", strokeThickness: 3 }).setDepth(1e7).setOrigin(0.5);
          const sc = (window.__iso ?? null);
          void sc;
          s.galleryLabels = s.galleryLabels ?? [];
          s.galleryLabels.push(label);
          label.setData("w", { x, y });
        });
        void cam;
      },
      { page, per },
    );
    // The first pass only paints (warms the cache); the second is the one photographed.
    if (!pass) await win.waitForTimeout(1500);
   }
    // Let wind-ups pass and strokes get laid, then freeze.
    await win.waitForTimeout(Number(process.env.FREEZE_MS ?? 120));
    await win.evaluate((seek) => {
      const s = window.__game().scene.getScene("world");
      // Hold every effect still for the photo, as it looks SEEK_MS after the cast.
      s.vfx.kit.hold = true;
      s.vfx.kit.seek(Number(seek));
      for (const l of s.galleryLabels ?? []) {
        const w = l.getData("w");
        const a = s.me.char.screen;
        const me = s.me.pred.render();
        // Same projection as the world (shared/src/view.ts, 64 px cells): offset from the player.
        const dx = w.x - me.x;
        const dy = w.y - me.y;
        l.setPosition(a.x + dx * 64, a.y + dy * 64 + 40);
      }
    }, Number(process.env.SEEK_MS ?? 110));
    await win.waitForTimeout(300);
    await win.screenshot({ path: path.join(OUT, `fx-${page}.png`) });
    await win.evaluate(() => {
      const s = window.__game().scene.getScene("world");
      s.vfx.kit.hold = false;
      for (const l of s.galleryLabels ?? []) l.destroy();
      s.galleryLabels = [];
      // (the scene clock keeps running: effects freeze through vfx.kit.hold instead)
    });
    await win.waitForTimeout(1200);
  }
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
