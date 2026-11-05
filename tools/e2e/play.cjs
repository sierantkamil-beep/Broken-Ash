/**
 * End-to-end check of the real desktop app: two Electron windows, one hosts (Hostuj grę), the other
 * joins localhost; both skip the prolog, the Greyed come through the gate, the host fights.
 * Screenshots land in tools/e2e/out. On Linux run it under a virtual display: `xvfb-run -a pnpm e2e`.
 *
 * Needs Playwright (require("playwright")) — not a game dependency; only this check uses it.
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { _electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });
const electronPath = require(path.join(ROOT, "desktop", "node_modules", "electron"));

async function launch(params, tag) {
  const app = await _electron.launch({
    executablePath: electronPath,
    // No GPU on a CI box or under xvfb: let Chromium render WebGL in software.
    args: [path.join(ROOT, "desktop"), "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: { ...process.env, ASH_TEST_PARAMS: params, ASH_USER_DATA: fs.mkdtempSync(path.join(os.tmpdir(), `ash-${tag}-`)) },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => console.log(`[${tag}] pageerror`, e.message));
  win.on("console", (m) => m.type() === "error" && console.log(`[${tag}]`, m.text()));
  await win.setViewportSize({ width: 1280, height: 720 }).catch(() => {});
  return { app, win };
}

const scene = (win) => win.evaluate(() => window.__game?.()?.scene.getScene("world") && true);

(async () => {
  const hostPath = process.env.HOST_PATH ?? "thorn";
  const joinPath = process.env.JOIN_PATH ?? "blood";
  const a = await launch(`autohost=1&name=Ayume&path=${hostPath}&body=male`, "host");
  await a.win.waitForFunction(() => !!window.__room, null, { timeout: 120000 });
  const b = await launch(`autojoin=1&address=localhost&name=Sanoe&path=${joinPath}&body=female`, "join");
  await b.win.waitForFunction(() => !!window.__room, null, { timeout: 120000 });
  for (const { win } of [a, b]) await win.waitForFunction(() => window.__room.state.cinematic !== "", null, { timeout: 60000 }).catch(() => {});
  await a.win.screenshot({ path: path.join(OUT, "1-prolog.png") });
  for (const { win } of [a, b]) await win.keyboard.press("Escape");
  await a.win.waitForFunction(() => window.__room.state.phase === "fight" && window.__room.state.units.size >= 3, null, { timeout: 90000 });
  await a.win.waitForTimeout(4000);
  await a.win.screenshot({ path: path.join(OUT, "2-wave.png") });
  // A click must cast the basic attack (the server puts it on cooldown).
  await a.win.mouse.move(640, 300);
  await a.win.mouse.down();
  await a.win.mouse.up();
  // Poll on a timer: under software rendering animation frames are too rare to catch a 0.4 s cooldown.
  const casted = await a.win.waitForFunction(() => { const r = window.__room; return r.state.players.get(r.sessionId).cd[0] > 0; }, null, { timeout: 3000, polling: 30 }).then(() => true, () => false);
  console.log("click casts the basic attack:", casted);
  if (!casted) process.exitCode = 1;
  // The host aims at the nearest Greyed and fights for a while; the partner casts too.
  for (let i = 0; i < 30; i++) {
    for (const { win } of [a, b]) {
      const t = await win.evaluate(() => {
        const s = window.__game().scene.getScene("world");
        const u = [...s.units.values()].sort((p, q) => Math.hypot(p.screen.x - s.me.char.screen.x, p.screen.y - s.me.char.screen.y) - Math.hypot(q.screen.x - s.me.char.screen.x, q.screen.y - s.me.char.screen.y))[0];
        if (!u) return null;
        const c = s.cameras.main;
        return { x: (u.screen.x - c.worldView.x) * c.zoom, y: (u.screen.y - 60 - c.worldView.y) * c.zoom };
      });
      if (t) await win.mouse.move(t.x, t.y);
      await win.mouse.down();
      await win.mouse.up();
      if (i % 5 === 2) await win.keyboard.press(String(1 + (i % 4)));
      if (i % 7 === 3) await win.mouse.click(t?.x ?? 640, t?.y ?? 360, { button: "right" });
    }
    await a.win.waitForTimeout(250);
    if (i === 14) await a.win.screenshot({ path: path.join(OUT, "3-fight.png") });
  }
  await a.win.screenshot({ path: path.join(OUT, "4-after.png") });
  const report = await a.win.evaluate(() => {
    const r = window.__room;
    return { phase: r.state.phase, wave: r.state.wave, units: [...r.state.units.values()].map((u) => `${u.kind} ${u.hp}/${u.hpMax}`), players: [...r.state.players.values()].map((p) => `${p.name} ${p.path} ${p.hp}/${p.hpMax}${p.downed ? " DOWN" : ""}`) };
  });
  console.log(JSON.stringify(report));
  await a.app.close();
  await b.app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
