/**
 * Every skill fired by the player alone, as the server would send it (the cast, then its bolt,
 * landing or zone after the wind-up), photographed three times: mid wind-up, as it's released,
 * and as it plays out. Crops land in tools/e2e/out/skills/, and moves_sheet.py-style sheets per
 * weapon are made by tools/e2e/skills_sheet.py. Not a pass/fail test: for judging the effects.
 *   xvfb-run -a node tools/e2e/skills.cjs     (ONLY=ash_ to film a few)
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { _electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out", "skills");
fs.mkdirSync(OUT, { recursive: true });
const electronPath = require(path.join(ROOT, "desktop", "node_modules", "electron"));
const WEAPONS = ["blades", "glaive", "greatblade", "brush", "talismans", "fan", "lantern", "bow", "knives"];

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ash-skills-"));
  fs.writeFileSync(path.join(dir, "story.json"), JSON.stringify({ area: "soramei_courtyard", flags: ["seen:prolog", "seen:cells_intro", "gate_held", "seen:escape"] }));
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [path.join(ROOT, "desktop"), "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: { ...process.env, ASH_TEST_PARAMS: "autohost=1&name=Ayume&path=thorn&body=female", ASH_USER_DATA: dir },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => console.log("pageerror", e.message));
  await win.setViewportSize({ width: 1280, height: 720 }).catch(() => {});
  await win.waitForFunction(() => !!window.__room && !!window.__game?.()?.scene.getScene("world")?.me && !!window.__skills, null, { timeout: 120000 });
  await win.waitForTimeout(3500);
  // Slow motion: the animation-frame clock (which drives Phaser's loop, its timers, tweens and every
  // effect) runs at SLOW of real time.
  await win.evaluate((slow) => {
    window.__slow = slow;
    const real = window.requestAnimationFrame.bind(window);
    let last = null;
    let virt = 0;
    window.requestAnimationFrame = (cb) =>
      real((t) => {
        if (last === null) {
          last = t;
          virt = t;
        }
        virt += (t - last) * window.__slow;
        last = t;
        cb(virt);
      });
  }, Number(process.env.SLOW ?? 0.05));
  await win.waitForTimeout(1000);
  const ids = (await win.evaluate(() => window.__skills.map((s) => s.id))).filter((id) => !process.env.ONLY || id.startsWith(process.env.ONLY));

  for (const id of ids) {
    const weapon = WEAPONS.find((w) => id.startsWith(w + "_")) ?? "blades";
    const windup = await win.evaluate(
      ([id, weapon]) => {
        const s = window.__game().scene.getScene("world");
        const sk = window.__skills.find((k) => k.id === id);
        const me = s.me.pred.render();
        const c = s.me.char;
        c.testWeapon = weapon;
        c.setWeapon(weapon);
        c.facing = 0;
        c.lastBasicEnd = -1e12;
        const sid = window.__room.sessionId;
        c.playCast(id);
        s.vfx.handle({ t: "cast", id: sid, skill: id, vfx: sk.vfx, aim: 0, x: me.x, y: me.y });
        const sh = sk.shape;
        const zone = sk.effects.find((e) => e.kind === "zone");
        // What the server sends at the release: a bolt, a landing, a zone.
        s.time.delayedCall(sk.windup * 1000, () => {
          const tx = me.x + Math.min(sh.reach ?? 5, 5);
          if (sh.kind === "projectile") {
            const n = sh.count ?? 1;
            for (let i = 0; i < n; i++) {
              const a = n > 1 ? ((i / (n - 1) - 0.5) * (sh.spread ?? 0) * Math.PI) / 180 : 0;
              s.vfx.handle({ t: "bolt", id: 9e5 + i + Math.floor(Math.random() * 1e4), skill: id, vfx: sk.vfx, x: me.x, y: me.y, aim: a, speed: sh.speed, range: Math.min(sh.range, 6), radius: sh.radius, owner: sid });
            }
          } else if (sh.kind === "circle" && sh.at === "aim") s.vfx.handle({ t: "area", skill: id, vfx: sk.vfx, x: tx, y: me.y, radius: sh.radius, owner: sid });
          if (zone) s.vfx.handle({ t: "zone", skill: id, vfx: sk.vfx, x: sh.kind === "circle" && sh.at === "aim" ? tx : me.x, y: me.y, radius: zone.radius, duration: 3, owner: sid });
        });
        return sk.windup * 1000;
      },
      [id, weapon],
    );
    const box = await win.evaluate(() => {
      const s = window.__game().scene.getScene("world");
      const c = s.cameras.main;
      const p = s.me.char.screen;
      return { x: (p.x - c.worldView.x) * c.zoom, y: (p.y - c.worldView.y) * c.zoom };
    });
    const clip = { x: Math.max(0, Math.round(box.x - 220)), y: Math.max(0, Math.round(box.y - 250)), width: 640, height: 400 };
    // The game runs 20× slower while filming (see SLOW below), so the screenshot's own delay is a
    // few game milliseconds: each photo lands on its moment.
    const start = await win.evaluate(() => window.__game().scene.getScene("world").time.now - 0);
    const shots = [windup * 0.6, windup + 130, windup + 420];
    for (const [i, at] of shots.entries()) {
      await win.waitForFunction((t) => window.__game().scene.getScene("world").time.now >= t, start + at, { polling: 30, timeout: 120000 });
      await win.screenshot({ path: path.join(OUT, `${id}_${i}.png`), clip });
    }
    // Let it all finish at full speed (2 game seconds), then back to slow motion for the next.
    await win.evaluate(() => (window.__slow = 1));
    await win.waitForTimeout(2000);
    await win.evaluate((slow) => (window.__slow = slow), Number(process.env.SLOW ?? 0.05));
    console.log("filmed", id);
  }
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
