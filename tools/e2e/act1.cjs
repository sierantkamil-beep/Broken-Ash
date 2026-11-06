/**
 * Act 1's locations in the real desktop app: for each area, one window hosts a game whose story save
 * (story.json in the profile dir) already stands in that area with its intro seen, and screenshots
 * it. Then the cells are played from the start: the intro, the walk into the bleeding hall, the dead
 * getting up. Screenshots land in tools/e2e/out/act1-*.png. Linux: `xvfb-run -a node tools/e2e/act1.cjs`.
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { _electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });
const electronPath = require(path.join(ROOT, "desktop", "node_modules", "electron"));

const SEEN = ["cells_intro", "prolog", "farm_intro", "mine_intro", "road_intro"].map((s) => `seen:${s}`);

async function launch(params, tag, story) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ash-${tag}-`));
  if (story) fs.writeFileSync(path.join(dir, "story.json"), JSON.stringify(story));
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [path.join(ROOT, "desktop"), "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: { ...process.env, ASH_TEST_PARAMS: params, ASH_USER_DATA: dir },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => console.log(`[${tag}] pageerror`, e.message));
  win.on("console", (m) => m.type() === "error" && console.log(`[${tag}]`, m.text()));
  await win.setViewportSize({ width: 1280, height: 720 }).catch(() => {});
  await win.waitForFunction(() => !!window.__room, null, { timeout: 120000 });
  return { app, win };
}

/** Puts the camera on a cell (the follow is turned off), for an overview of the area. */
const look = (win, x, y, zoom) =>
  win.evaluate(
    ([x, y, zoom]) => {
      window.__game().scene.getScene("world").testView = { x, y, zoom };
    },
    [x, y, zoom],
  );

const AREAS = [
  { area: "soramei_cells", flags: [], views: [[12, 9, 0.75]] },
  { area: "farmstead", flags: ["captives_saved", "tapper_dead"], views: [[15, 12, 0.6], [14, 15, 1.2]] },
  { area: "sap_mine", flags: [], views: [[18, 5, 0.8], [18, 14, 0.8], [17, 25, 0.8]] },
  { area: "sap_mine", flags: ["pumps_on", "tapper_dead"], views: [[18, 5, 0.8]], tag: "open" },
  { area: "harrow_road", flags: [], views: [[12, 10, 0.75], [32, 10, 0.8]] },
];

(async () => {
  for (const a of process.env.ONLY_CELLS ? [] : AREAS) {
    const { app, win } = await launch(`autohost=1&name=Ayume&path=thorn&body=male`, a.area, { area: a.area, flags: [...SEEN, ...a.flags] });
    await win.waitForTimeout(5000);
    for (const [i, [x, y, z]] of a.views.entries()) {
      await look(win, x, y, z);
      await win.waitForTimeout(1200);
      await win.screenshot({ path: path.join(OUT, `act1-${a.area}${a.tag ? "-" + a.tag : ""}-${i}.png`) });
    }
    const map = await win.evaluate(() => window.__room.state.mapId);
    console.log(a.area, "→", map);
    if (map !== a.area) process.exitCode = 1;
    await app.close();
  }

  // The cells from the start: the intro (skipped), then walk east into the hall; the dead get up.
  const { app, win } = await launch(`autohost=1&name=Ayume&path=thorn&body=male`, "cells");
  await win.waitForFunction(() => window.__room.state.cinematic === "cells_intro", null, { timeout: 60000 });
  await win.waitForTimeout(9000);
  await win.screenshot({ path: path.join(OUT, "act1-cells-intro.png") });
  await win.keyboard.press("Escape");
  await win.waitForFunction(() => window.__room.state.cinematic === "", null, { timeout: 20000 });
  // Under software rendering the client runs at a few frames a second: walk until in the hall.
  await win.keyboard.down("d");
  await win.waitForFunction(() => { const r = window.__room; return r.state.players.get(r.sessionId).x > 9; }, null, { timeout: 60000, polling: 200 }).catch(() => {});
  await win.keyboard.up("d");
  console.log("after the walk:", await win.evaluate(() => { const r = window.__room; const p = r.state.players.get(r.sessionId); return { x: p.x, y: p.y, phase: r.state.phase, cin: r.state.cinematic }; }));
  const fight = await win.waitForFunction(() => window.__room.state.units.size >= 2, null, { timeout: 30000 }).then(() => true, () => false);
  await win.waitForTimeout(2500);
  await win.screenshot({ path: path.join(OUT, "act1-cells-fight.png") });
  console.log("the dead get up in the cells:", fight);
  if (!fight) process.exitCode = 1;
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
