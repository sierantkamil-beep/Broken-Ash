/**
 * Every skill's move as a filmstrip, in the real app: one window hosts at the courtyard, the
 * player's character plays each skill's move on a fixed clock (Character.testNow) facing east, and
 * six moments of it are photographed (half the wind-up, the wind-up's end, then through the release).
 * Basic attacks also show their chain's 2nd and 3rd beats. Crops land in tools/e2e/out/moves/, and
 * tools/e2e/moves_sheet.py puts them on one sheet per weapon.
 * Linux: `xvfb-run -a node tools/e2e/moves.cjs` (after building client + desktop).
 * ONLY=blades_ limits it to skills whose id starts with that.
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { _electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out", "moves");
fs.mkdirSync(OUT, { recursive: true });
const electronPath = require(path.join(ROOT, "desktop", "node_modules", "electron"));

const src = fs.readFileSync(path.join(ROOT, "client", "src", "entities", "moves.ts"), "utf8");
const table = src.slice(src.indexOf("export const SKILL_MOTION"));
const ids = [...table.matchAll(/^ {2}([a-z]+_[a-z]+): \{/gm)].map((m) => m[1]).filter((id) => !process.env.ONLY || id.startsWith(process.env.ONLY));
const WEAPONS = ["blades", "glaive", "greatblade", "brush", "talismans", "fan", "lantern", "bow", "knives"];
const BODY = process.env.BODY ?? "male";

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ash-moves-"));
  fs.writeFileSync(path.join(dir, "story.json"), JSON.stringify({ area: "soramei_courtyard", flags: ["seen:prolog", "seen:cells_intro", "gate_held", "seen:escape"] }));
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [path.join(ROOT, "desktop"), "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: { ...process.env, ASH_TEST_PARAMS: `autohost=1&name=Ayume&path=thorn&body=${BODY}`, ASH_USER_DATA: dir },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => console.log("pageerror", e.message));
  await win.setViewportSize({ width: 1280, height: 720 }).catch(() => {});
  await win.waitForFunction(() => !!window.__room && !!window.__game?.()?.scene.getScene("world")?.me, null, { timeout: 120000 });
  await win.waitForTimeout(4000);
  // Face east, stand still, zoom in.
  await win.evaluate(() => {
    const s = window.__game().scene.getScene("world");
    s.userZoom = 1.5;
  });

  for (const id of ids) {
    const weapon = WEAPONS.find((w) => id.startsWith(w + "_")) ?? "blades";
    const beats = /_(cut|sweep|cleave|stroke|throw|gust|wisp|arrow)$/.test(id) && WEAPONS.some((w) => id === `${w}_${id.split("_")[1]}`) ? 3 : 1;
    let clock = 1e7;
    for (let beat = 0; beat < beats; beat++) {
      const info = await win.evaluate(
        ([id, weapon, clock]) => {
          const s = window.__game().scene.getScene("world");
          const c = s.me.char;
          c.testWeapon = weapon;
          c.setWeapon(weapon);
          c.facing = 0;
          c.testNow = clock;
          c.playCast(id);
          const a = c.action;
          return a ? { w: a.strikeAt, d: a.dur } : null;
        },
        [id, weapon, clock],
      );
      if (!info) {
        console.log("no action for", id);
        continue;
      }
      const r = info.d - info.w;
      const moments = [info.w * 0.5, info.w, info.w + r * 0.12, info.w + r * 0.28, info.w + r * 0.5, info.w + r * 0.8];
      for (const [i, el] of moments.entries()) {
        // Step the clock up to the moment in small steps so the blade trail fills in on the way.
        for (let k = 3; k >= 0; k--) {
          await win.evaluate((t) => (window.__game().scene.getScene("world").me.char.testNow = t), clock + el - k * 18);
          await win.waitForTimeout(90);
        }
        const box = await win.evaluate(() => {
          const s = window.__game().scene.getScene("world");
          const c = s.cameras.main;
          const p = s.me.char.screen;
          return { x: (p.x - c.worldView.x) * c.zoom, y: (p.y - c.worldView.y) * c.zoom };
        });
        await win.screenshot({ path: path.join(OUT, `${id}${beat ? "~" + beat : ""}_${i}.png`), clip: { x: Math.round(box.x - 130), y: Math.round(box.y - 190), width: 260, height: 240 } });
      }
      clock += info.d + 120;
    }
    console.log("filmed", id);
  }
  await win.evaluate(() => {
    const c = window.__game().scene.getScene("world").me.char;
    c.testNow = null;
    c.testWeapon = null;
  });
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
