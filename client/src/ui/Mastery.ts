import { BALANCE, DEFAULT_PICKS, MSG, PATHS, WEAPONS, WEAPON_IDS, masteryLevel, masteryProgress, validPicks, type Picks, type WeaponId } from "@broken-ash/shared";
import type { Room } from "colyseus.js";
import { ACCENTS } from "../fx/accents";
import { barOf, masteryOf, pathOf, weaponOf, type LoadoutView } from "../net/loadout";
import { $, el, escapeHtml } from "./dom";
import { skillIcon } from "./pixelIcons";

/**
 * The weapon mastery panel (K): your weapon's level and progress, its tree — RMB and key-1 choices,
 * the passive rows — and switching weapons. Changes go to the server (MSG.loadout), which allows them
 * only outside a wave and checks every choice against the mastery level.
 */
export class Mastery {
  private open = false;
  private weapon: WeaponId | null = null;

  constructor(
    private readonly room: Room,
    private readonly sound: (key: string, volume: number) => void,
  ) {
    // Re-render when the server confirms a change (or mastery grows) while the panel is open.
    void this.open;
  }

  get isOpen() {
    return this.open;
  }

  toggle() {
    if (this.open) this.close();
    else {
      this.open = true;
      this.weapon = null;
      $("mastery").hidden = false;
      // The HUD and key hints would show through the panel; they step back while it's open.
      document.body.classList.add("mastery-open");
      this.renderInto($("mastery"));
    }
  }

  close() {
    this.open = false;
    $("mastery").hidden = true;
    document.body.classList.remove("mastery-open");
  }

  private me(): (LoadoutView & { picks: string }) | null {
    const st = this.room.state as unknown as { players: Map<string, LoadoutView>; phase: string };
    return (st.players.get(this.room.sessionId) as LoadoutView & { picks: string }) ?? null;
  }

  private send(weapon: WeaponId, picks: Picks) {
    this.sound("ui_confirm", 0.5);
    this.room.send(MSG.loadout, { weapon, picks });
  }

  private lastHtml = "";

  /** The held weapon's tree, drawn into the book's tab (weapons themselves come from the bag). */
  renderInto(box: HTMLElement) {
    this.weapon = null;
    const me = this.me();
    if (!me) return;
    const phase = (this.room.state as unknown as { phase: string }).phase;
    const locked = phase === "fight";
    const held = weaponOf(me);
    const shown = this.weapon ?? held;
    const xp = masteryOf(me);
    const level = masteryLevel(xp[shown] ?? 0);
    const prog = masteryProgress(xp[shown] ?? 0);
    let picks: Picks = DEFAULT_PICKS;
    try {
      picks = shown === held && me.picks ? (JSON.parse(me.picks) as Picks) : DEFAULT_PICKS;
    } catch {
      /* default */
    }
    picks = validPicks(picks, level);
    void barOf;

    const path = pathOf(me);
    const acc = ACCENTS[path];
    const w = WEAPONS[shown];
    const head = el("div", "m-head");
    head.append(el("h2", undefined, `Mistrzostwo: ${w.name}`), el("div", "muted", `poziom ${level} / ${BALANCE.mastery.maxLevel}`));
    const bar = el("div", "xp");
    const fill = el("i");
    fill.style.width = `${Math.round(prog * 100)}%`;
    bar.append(fill);
    const home = PATHS[path].homeWeapons.includes(shown);
    box.append(head, bar, el("p", "muted small m-help", `${home ? `Broń twojego ludu: ${PATHS[path].affinity.text} ` : ""}Mistrzostwo rośnie od obrażeń zadanych umiejętnościami tej broni. Inną broń założysz w zakładce Postać (I).`));
    if (locked) box.append(el("div", "note", "Podczas walki drzewka nie zmienisz — tylko między falami."));

    const M = BALANCE.mastery;
    const tree = el("div", "tree");
    const choose = (title: string, list: typeof w.rmb | typeof w.key, unlocks: readonly number[], current: number, apply: (i: number) => Picks) => {
      const col = el("div");
      col.append(el("h3", undefined, title));
      list.forEach((s, i) => {
        const open = level >= unlocks[i];
        // Locked by level (dim, with the level it opens at) is not the same as "not now" (a wave, or
        // looking at a weapon you don't hold): those stay readable.
        const b = el("button", `pick${i === current ? " on" : ""}${open ? "" : " lock"}${open && (locked || shown !== held) ? " frozen" : ""}`);
        b.disabled = !open || locked || shown !== held;
        const t = el("div");
        t.innerHTML = `<b>${escapeHtml(s.name)}</b> <span class="muted">${open ? "" : `· mistrzostwo ${unlocks[i]}`}</span><div class="muted">${escapeHtml(s.description)}</div>`;
        b.append(skillIcon(s, acc), t);
        b.addEventListener("click", () => this.send(shown, apply(i)));
        col.append(b);
      });
      return col;
    };
    tree.append(
      choose("Prawy przycisk", w.rmb, M.rmbUnlock, picks.rmb, (i) => ({ ...picks, rmb: i })),
      choose("Klawisz 1", w.key, M.keyUnlock, picks.key, (i) => ({ ...picks, key: i })),
    );
    box.append(el("h3", undefined, `${w.basic.name} (lewy przycisk) — zawsze`), tree, el("h3", undefined, "Zdolności"));
    w.passives.forEach((pair, row) => {
      const r = el("div", "prow");
      const open = level >= M.passiveUnlock[row];
      r.append(el("div", "lvl", `poz. ${M.passiveUnlock[row]}`));
      pair.forEach((pv, i) => {
        const b = el("button", `${picks.passives[row] === i ? "on" : ""}${open ? "" : " lock"}${open && (locked || shown !== held) ? " frozen" : ""}`.trim() || undefined);
        b.innerHTML = `<b>${escapeHtml(pv.name)}</b>${escapeHtml(pv.description)}`;
        b.disabled = !open || locked || shown !== held;
        b.addEventListener("click", () => {
          const passives = [...picks.passives];
          passives[row] = i;
          this.send(shown, { ...picks, passives });
        });
        r.append(b);
      });
      box.append(r);
    });
  }
}
