/**
 * The character's screens in the real app: a levelled character with gear (a prepared save) opens
 * the book's four tabs, hovers an item, drops one on the ground; a brand-new character shows the
 * tutorial prompt and the first skill card. Screenshots in tools/e2e/out/ui-*.png.
 *   xvfb-run -a node tools/e2e/ui.cjs     (after building client + desktop)
 */
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { _electron } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "out");
fs.mkdirSync(OUT, { recursive: true });
const electronPath = require(path.join(ROOT, "desktop", "node_modules", "electron"));

const item = (uid, base, rarity = "common", affixes = []) => ({ uid, base, rarity, level: 7, affixes });
const SAVE = {
  ayume: {
    name: "Ayume",
    path: "thorn",
    xp: 1900,
    talents: ["thorn.edge.0a", "thorn.life.0a", "thorn.art.0b", "thorn.edge.1a"],
    mastery: { blades: 9000 },
    picks: {},
    inv: {
      gold: 137,
      equip: {
        weapon: item("w1", "u.guard_blades", "ashen"),
        chest: item("c1", "chest.lamellar.2", "rare", [["hp", 22], ["armour", 0.03], ["cost", 0.06]]),
        head: item("h1", "head.kabuto.2", "fine", [["cd", 0.05]]),
        boots: item("b1", "boots.boots.1"),
        ring1: item("r1", "ring.ring.2", "rare", [["dmg", 0.07], ["st.bleed", 0.12], ["leech", 0.02]]),
      },
      bag: [
        { item: item("g1", "glaive.2", "rare", [["dmg", 0.09], ["reach", 0.1], ["poise", 0.2]]), x: 0, y: 0 },
        { item: item("s1", "chest.silk.1", "fine", [["hp.pct", 0.05]]), x: 1, y: 0 },
        { item: item("k1", "knives.1"), x: 3, y: 0 },
        { item: item("a1", "amulet.amulet.2", "fine", [["dmg.sig", 0.08]]), x: 4, y: 0 },
        { item: item("rel", "relic.ysolde_shard", "ashen"), x: 5, y: 0 },
        { item: item("hh", "head.mask.1", "common"), x: 6, y: 0 },
        { item: item("gl", "hands.bracers.2", "rare", [["dmg.basic", 0.14], ["poise", 0.15], ["cd", 0.04]]), x: 8, y: 0 },
        { item: item("bw", "bow.1", "fine", [["dmg", 0.05]]), x: 1, y: 3 },
      ],
    },
    updated: "2026-01-01",
  },
};

async function launch(tag, params, prep) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ash-${tag}-`));
  prep?.(dir);
  const app = await _electron.launch({
    executablePath: electronPath,
    args: [path.join(ROOT, "desktop"), "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    env: { ...process.env, ASH_TEST_PARAMS: params, ASH_USER_DATA: dir },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => console.log(`[${tag}] pageerror`, e.message));
  win.on("console", (m) => m.type() === "error" && console.log(`[${tag}]`, m.text()));
  await win.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  await win.waitForFunction(() => !!window.__room && !!window.__game?.()?.scene.getScene("world")?.me, null, { timeout: 120000 });
  return { app, win };
}

(async () => {
  // 1. A levelled character at the farmstead: the book.
  {
    const { app, win } = await launch("book", "autohost=1&name=Ayume&path=thorn&body=female", (dir) => {
      fs.writeFileSync(path.join(dir, "characters.json"), JSON.stringify(SAVE));
      fs.writeFileSync(path.join(dir, "story.json"), JSON.stringify({ area: "farmstead", flags: ["seen:cells_intro", "seen:prolog", "seen:farm_intro", "seen:escape", "escaped"] }));
    });
    await win.waitForTimeout(5000);
    await win.screenshot({ path: path.join(OUT, "ui-0-hud.png") });
    for (const [k, name] of [["i", "char"], ["k", "skills"], ["t", "talents"], ["m", "weapon"]]) {
      await win.keyboard.press(k);
      await win.waitForTimeout(2500);
      if (name === "char") {
        const it = await win.$(".bag-item");
        if (it) {
          await it.hover();
          await win.waitForTimeout(800);
        }
      }
      await win.screenshot({ path: path.join(OUT, `ui-1-${name}.png`) });
      await win.keyboard.press(k);
      await win.waitForTimeout(400);
    }
    // Drop the bow on the ground: loot with its beam and name.
    await win.evaluate(() => window.__room.send("inv", { op: "drop", uid: "rel" }));
    await win.evaluate(() => window.__room.send("inv", { op: "drop", uid: "g1" }));
    await win.waitForTimeout(2500);
    await win.screenshot({ path: path.join(OUT, "ui-2-loot.png") });
    const st = await win.evaluate(() => ({ loot: window.__room.state.loot.size, level: window.__room.state.players.get(window.__room.sessionId).level }));
    console.log("loot on the ground:", st.loot, "level:", st.level);
    if (st.loot < 2 || st.level < 5) process.exitCode = 1;
    await app.close();
  }
  // 2. A new character in the cells: the intro skill card and the first tutorial prompt.
  {
    const { app, win } = await launch("new", "autohost=1&name=Nowa&path=ash&body=male");
    await win.waitForFunction(() => window.__room.state.cinematic !== "", null, { timeout: 60000 }).catch(() => {});
    await win.keyboard.press("Escape");
    await win.waitForFunction(() => window.__room.state.cinematic === "", null, { timeout: 30000 });
    await win.waitForTimeout(4000);
    await win.screenshot({ path: path.join(OUT, "ui-3-skillcard.png") });
    await win.keyboard.press("Enter");
    await win.waitForTimeout(1500);
    await win.keyboard.press("Enter");
    await win.waitForTimeout(1500);
    await win.screenshot({ path: path.join(OUT, "ui-4-tutorial.png") });
    const tut = await win.evaluate(() => document.getElementById("tutorial").textContent);
    console.log("tutorial:", tut);
    await app.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
