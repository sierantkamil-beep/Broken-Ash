import {
  BAG_H,
  BAG_W,
  EQUIP_SLOTS,
  ITEM_BASES,
  KEYSTONE_LEVEL,
  MSG,
  PATHS,
  SLOT_NAMES,
  SLOT_UNLOCK,
  STATUS_INFO,
  TIER_LEVEL,
  XP_FOR,
  levelOf,
  levelProgress,
  pointsAt,
  slotOf,
  statsOf,
  talentTree,
  type EquipSlot,
  type Inventory,
  type Item,
  type SkillDef,
  type StatusId,
  type TalentNode,
  type Bonus,
} from "@broken-ash/shared";
import type { Room } from "colyseus.js";
import { ACCENTS } from "../fx/accents";
import { barOf, bonusesOf, pathOf, type LoadoutView } from "../net/loadout";
import { $, el, escapeHtml, scoped } from "./dom";
import { goldIcon, itemIcon } from "./itemIcons";
import { bonusText, itemTooltip } from "./itemText";
import { skillIcon } from "./pixelIcons";
import type { Mastery } from "./Mastery";
import { Preview } from "./menu/Preview";

export type Tab = "char" | "skills" | "talents" | "weapon";
const TABS: [Tab, string, string][] = [
  ["char", "Postać", "I"],
  ["skills", "Umiejętności", "K"],
  ["talents", "Talenty", "T"],
  ["weapon", "Mistrzostwo broni", "M"],
];
const KEYS = ["LPM", "PPM", "1", "2", "3", "4"];
const CELL = 46;

/** What the panels read from a synced player (server/src/schema/WorldState.ts). */
type Me = LoadoutView & { name: string; body: string; level: number; xp: number; talents: string; inv: string; equip: string; hp: number; hpMax: number; resMax: number };

const parse = <T>(s: string, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** A skill's hit shape in words: what it covers and where. */
export function shapeText(s: SkillDef): string {
  const sh = s.shape;
  switch (sh.kind) {
    case "cone":
      return `łuk ${sh.arc}° przed tobą, zasięg ${sh.range}`;
    case "line":
      return `linia ${sh.length} × ${sh.width}`;
    case "circle":
      return sh.at === "aim" ? `krąg ${sh.radius} tam, gdzie celujesz (do ${sh.reach ?? 8} kratek)` : `krąg ${sh.radius} wokół ciebie`;
    case "projectile":
      return `${(sh.count ?? 1) > 1 ? `${sh.count} pociski` : "pocisk"}, zasięg ${sh.range}${sh.pierce ? ", przebija" : ""}`;
    case "self":
      return "na sobie";
  }
}

/** How to use a skill, by its shape. */
export function howToUse(s: SkillDef, key: string): string {
  const sh = s.shape;
  const hold = key === "LPM" ? "Kliknij" : `Przytrzymaj ${key}, wyceluj myszą, puść`;
  if (sh.kind === "self") return `${key === "LPM" ? "Kliknij" : `Naciśnij ${key}`}: działa od razu na tobie.`;
  if (sh.kind === "circle" && sh.at === "aim") return `${hold}: krąg spadnie pod kursorem.`;
  if (sh.kind === "circle") return `${key === "LPM" ? "Kliknij" : `Naciśnij ${key}`}: uderza wszystko wokół ciebie.`;
  return `${hold}: leci tam, gdzie wskazuje mysz.`;
}

/** The numbers of a skill: damage per hit, statuses, cooldown, cost, wind-up. */
export function skillNumbers(s: SkillDef, resource: string): string[] {
  const out: string[] = [];
  const add = (x: string) => void (!out.includes(x) && out.push(x));
  const dmg = s.effects.filter((e) => e.kind === "damage").reduce((a, e) => a + (e as { amount: number }).amount, 0);
  if (dmg) add(`Obrażenia: ${Math.round(dmg)}`);
  for (const e of s.effects) {
    if (e.kind === "status") add(`${STATUS_INFO[e.status as StatusId]?.name ?? e.status}${e.duration ? ` (${e.duration} s)` : ""}`);
    else if (e.kind === "zone") add(`Pole na ${e.duration} s`);
    else if (e.kind === "detonate") add(`Detonuje: ${STATUS_INFO[e.status as StatusId]?.name ?? e.status}`);
    else if (e.kind === "lifesteal") add(`Leczy ${Math.round(e.fraction * 100)}% obrażeń`);
    else if (e.kind === "heal") add("Leczy");
    else if (e.kind === "knockback") add("Odrzuca");
    else if (e.kind === "dash") add("Doskok");
    else if (e.kind === "summon") add("Przyzywa sługi");
  }
  add(`Odnowienie: ${s.cooldown} s`);
  if (s.cost > 0) add(`Koszt: ${s.cost} (${resource})`);
  if (s.hpCost) add(`Koszt: ${s.hpCost} życia`);
  if (s.windup >= 0.25) add(`Przygotowanie: ${s.windup} s`);
  return out;
}

/**
 * The book (I, K, T, M): your character and bag, your skills, your talents, your weapon's mastery.
 * Everything you change goes to the server, which checks it; the book redraws from what it syncs.
 */
export class Book {
  private open = false;
  private tab: Tab = "char";
  private lastKey = "";
  private preview: Preview | null = null;
  /** The doll's own element, kept across redraws (its Phaser game lives inside it). */
  private readonly previewHost = el("div", "preview-host");
  private drag: { item: Item; from: "bag" | EquipSlot; ghost: HTMLCanvasElement } | null = null;

  constructor(
    private readonly room: Room,
    private readonly mastery: Mastery,
    private readonly sound: (key: string, volume: number) => void,
  ) {
    window.setInterval(() => {
      if (this.open) this.render();
    }, 300);
    window.addEventListener("pointermove", (e) => this.moveGhost(e), scoped());
    window.addEventListener("pointerup", (e) => this.endDrag(e), scoped());
  }

  get isOpen() {
    return this.open;
  }

  /** Opens on a tab, or closes when that tab is already showing. */
  toggle(tab: Tab) {
    if (this.open && this.tab === tab) return this.close();
    this.tab = tab;
    this.open = true;
    $("book").hidden = false;
    document.body.classList.add("book-open");
    document.body.dataset.book = tab;
    this.lastKey = "";
    this.sound("ui_click", 0.4);
    this.render();
  }

  close() {
    this.open = false;
    $("book").hidden = true;
    $("tooltip").hidden = true;
    document.body.classList.remove("book-open");
    delete document.body.dataset.book;
    this.preview?.pause(true);
  }

  private me(): Me | null {
    const st = this.room.state as unknown as { players: Map<string, Me> };
    return st.players.get(this.room.sessionId) ?? null;
  }

  private render() {
    const me = this.me();
    if (!me) return;
    const key = JSON.stringify([this.tab, me.inv, me.equip, me.level, Math.floor(me.xp / 5), me.talents, me.picks, me.mastery, me.weapon, me.hpMax, (this.room.state as unknown as { phase: string }).phase]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const box = $("book");
    box.replaceChildren();
    const tabs = el("div", "book-tabs");
    for (const [id, name, k] of TABS) {
      const b = el("button", id === this.tab ? "on" : undefined, `${name} `);
      b.append(el("span", "k", k));
      if (id === "talents") {
        const pts = pointsAt(me.level) - parse<string[]>(me.talents, []).length;
        if (pts > 0) b.append(el("span", "badge", String(pts)));
      }
      b.addEventListener("click", () => {
        this.tab = id;
        document.body.dataset.book = id;
        this.lastKey = "";
        this.sound("ui_click", 0.4);
        this.render();
      });
      tabs.append(b);
    }
    const close = el("button", "book-close", "✕");
    close.addEventListener("click", () => this.close());
    tabs.append(close);
    const body = el("div", "book-body");
    box.append(tabs, body);
    if (this.tab !== "char") this.preview?.pause(true);
    if (this.tab === "char") this.character(body, me);
    else if (this.tab === "skills") this.skills(body, me);
    else if (this.tab === "talents") this.talents(body, me);
    else this.mastery.renderInto(body);
  }

  // ----------------------------------------------------------------------------- character and bag

  private character(body: HTMLElement, me: Me) {
    const inv = parse<Pick<Inventory, "bag" | "gold">>(me.inv, { bag: [], gold: 0 });
    const equip = parse<Partial<Record<EquipSlot, Item>>>(me.equip, {});
    const path = PATHS[pathOf(me)];
    const wrap = el("div", "char");
    // Left: the paper doll between the equipment slots, and the numbers.
    const doll = el("div", "doll");
    const stage = el("div", "doll-stage");
    const slotsL = el("div", "slots");
    const slotsR = el("div", "slots");
    const slotBox = (s: EquipSlot) => {
      const d = el("div", `eq-slot${equip[s] ? " full" : ""}`);
      d.dataset.slot = s;
      const it = equip[s];
      if (it) {
        d.append(itemIcon(it, 64, 64));
        d.style.borderColor = rarityColor(it);
        d.addEventListener("mouseenter", () => this.tip(d, itemTooltip(it, null, s === "weapon" ? "Broń w dłoni. Zamień ją, przeciągając inną broń z torby." : "Prawy klik albo przeciągnij do torby, by zdjąć.")));
        d.addEventListener("mouseleave", () => ($("tooltip").hidden = true));
        d.addEventListener("pointerdown", (e) => e.button === 0 && this.startDrag(e, it, s));
        d.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          if (s !== "weapon") this.send({ op: "unequip", slot: s });
        });
      } else d.append(el("span", "eq-name", SLOT_NAMES[s]));
      return d;
    };
    for (const s of ["head", "chest", "hands", "legs", "boots"] as EquipSlot[]) slotsL.append(slotBox(s));
    for (const s of ["weapon", "amulet", "ring1", "ring2", "relic"] as EquipSlot[]) slotsR.append(slotBox(s));
    stage.append(slotsL, el("div", "doll-view"), slotsR);
    doll.append(stage);
    const pv = stage.querySelector<HTMLElement>(".doll-view")!;
    pv.append(this.previewHost);
    const spec = { path: pathOf(me), body: me.body === "female" ? "female" : "male", weapon: barOf(me).skills[0].id.split("_")[0] as never, look: parse(me.appearance, {}) as never };
    if (this.preview) {
      this.preview.pause(false);
      this.preview.show(spec);
    } else
      // The doll's little game is made once its box has a size (a WebGL canvas of 0 × 0 fails).
      requestAnimationFrame(() => {
        if (this.preview || !this.previewHost.clientWidth) return;
        this.preview = new Preview(this.previewHost);
        this.preview.show(spec);
      });

    const stats = statsOf(path, bonusesOf(me));
    const lvl = me.level;
    const xpNext = lvl >= 20 ? "—" : `${me.xp - XP_FOR[lvl]} / ${XP_FOR[lvl + 1] - XP_FOR[lvl]}`;
    const st = el("div", "stats");
    st.innerHTML = `
      <div class="who"><b>${escapeHtml(me.name)}</b><span class="muted">${escapeHtml(path.name)} · poziom ${lvl}</span></div>
      <div class="xp" title="Doświadczenie"><i style="width:${Math.round(levelProgress(me.xp) * 100)}%"></i><span>${xpNext}</span></div>
      <div class="grid">
        <span>Życie</span><b>${me.hpMax}</b>
        <span>Ochrona</span><b>${Math.round((1 - stats.taken) * 100)}%</b>
        <span>Bieg</span><b>${Math.round((stats.speed / path.speed) * 100)}%</b>
        <span>Złoto</span><b class="gold">${inv.gold}</b>
      </div>`;
    const tot = sumBonuses(bonusesOf(me).filter((b) => b.kind !== "hp" && b.kind !== "armour" && b.kind !== "speed"));
    if (tot.length) {
      const list = el("div", "bonuses");
      list.innerHTML = `<div class="muted">Z talentów i ekwipunku</div>${tot.map((b) => escapeHtml(bonusText(b))).join("<br>")}`;
      st.append(list);
    }
    doll.append(st);

    // Right: the bag.
    const bagBox = el("div", "bag-box");
    const head = el("div", "bag-head");
    head.append(el("h3", undefined, "Torba"));
    const purse = el("span", "purse");
    purse.append(goldIcon(22), el("span", undefined, String(inv.gold)));
    head.append(purse);
    const grid = el("div", "bag");
    grid.style.width = `${BAG_W * CELL}px`;
    grid.style.height = `${BAG_H * CELL}px`;
    for (const p of inv.bag) {
      const b = ITEM_BASES[p.item.base];
      if (!b) continue;
      const d = el("div", `bag-item r-${p.item.rarity}`);
      d.style.left = `${p.x * CELL}px`;
      d.style.top = `${p.y * CELL}px`;
      d.style.width = `${b.w * CELL - 2}px`;
      d.style.height = `${b.h * CELL - 2}px`;
      d.append(itemIcon(p.item, b.w * CELL - 2, b.h * CELL - 2));
      const target = b.slot === "ring" ? (equip.ring1 ? "ring2" : "ring1") : (b.slot as EquipSlot);
      const worn = b.slot === "ring" ? equip.ring1 ?? null : equip[target] ?? null;
      d.addEventListener("mouseenter", () => this.tip(d, itemTooltip(p.item, worn, "Prawy klik: załóż · przeciągnij: przenieś, załóż albo wyrzuć")));
      d.addEventListener("mouseleave", () => ($("tooltip").hidden = true));
      d.addEventListener("pointerdown", (e) => e.button === 0 && this.startDrag(e, p.item, "bag"));
      d.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.send({ op: "equip", uid: p.item.uid });
      });
      grid.append(d);
    }
    const drop = el("div", "drop-zone", "Wyrzuć (upuść tutaj)");
    bagBox.append(head, grid, drop, el("p", "muted small", "Przedmioty znajdziesz przy wrogach, w skrzyniach i na ciałach (F). Złoto zbierasz, przechodząc po nim."));
    wrap.append(doll, bagBox);
    body.append(wrap);
  }

  private tip(target: HTMLElement, html: string) {
    if (this.drag) return;
    const t = $("tooltip");
    t.innerHTML = html;
    t.hidden = false;
    t.classList.add("rich");
    const r = target.getBoundingClientRect();
    const x = r.right + 10 + t.offsetWidth > window.innerWidth ? r.left - t.offsetWidth - 10 : r.right + 10;
    t.style.left = `${Math.max(8, x)}px`;
    t.style.top = `${Math.max(8, Math.min(window.innerHeight - t.offsetHeight - 8, r.top))}px`;
  }

  private startDrag(e: PointerEvent, item: Item, from: "bag" | EquipSlot) {
    e.preventDefault();
    $("tooltip").hidden = true;
    const b = ITEM_BASES[item.base];
    const ghost = itemIcon(item, b.w * CELL, b.h * CELL);
    ghost.classList.add("drag-ghost");
    document.body.append(ghost);
    this.drag = { item, from, ghost };
    this.moveGhost(e);
  }

  private moveGhost(e: PointerEvent) {
    if (!this.drag) return;
    const g = this.drag.ghost;
    g.style.left = `${e.clientX - g.width / 2}px`;
    g.style.top = `${e.clientY - g.height / 2}px`;
  }

  private endDrag(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost.remove();
    const under = document.elementsFromPoint(e.clientX, e.clientY);
    const slotEl = under.find((x) => (x as HTMLElement).dataset?.slot) as HTMLElement | undefined;
    const bag = under.find((x) => x.classList.contains("bag")) as HTMLElement | undefined;
    const dropZone = under.find((x) => x.classList.contains("drop-zone"));
    const b = ITEM_BASES[d.item.base];
    if (slotEl) {
      const slot = slotEl.dataset.slot as EquipSlot;
      if (d.from === "bag" && slotOf(slot) === b.slot) this.send({ op: "equip", uid: d.item.uid, slot });
    } else if (bag) {
      const r = bag.getBoundingClientRect();
      const x = Math.round((e.clientX - r.left) / CELL - b.w / 2);
      const y = Math.round((e.clientY - r.top) / CELL - b.h / 2);
      if (d.from === "bag") this.send({ op: "move", uid: d.item.uid, x, y });
      else if (d.from !== "weapon") this.send({ op: "unequip", slot: d.from, x, y });
    } else if (dropZone && d.from === "bag") this.send({ op: "drop", uid: d.item.uid });
  }

  private send(msg: Record<string, unknown>) {
    this.sound("ui_confirm", 0.4);
    this.room.send(MSG.inv, msg);
  }

  // ----------------------------------------------------------------------------- skills

  private skills(body: HTMLElement, me: Me) {
    const path = PATHS[pathOf(me)];
    const bar = barOf(me).skills;
    const acc = ACCENTS[pathOf(me)];
    body.append(el("p", "muted small", `Pasek: broń daje lewy i prawy przycisk oraz klawisz 1 (wybierasz je w Mistrzostwie broni), ścieżka ${path.name} — klawisze 2–4. Nowe miejsca otwierają się z poziomem.`));
    const list = el("div", "skill-cards");
    bar.forEach((s, i) => {
      const open = me.level >= SLOT_UNLOCK[i];
      const c = el("div", `skill-card${open ? "" : " locked"}`);
      const icon = skillIcon(s, acc);
      const k = el("div", "sk-key", KEYS[i]);
      const left = el("div", "sk-left");
      left.append(icon, k);
      const txt = el("div", "sk-text");
      txt.innerHTML = `<div class="sk-name">${escapeHtml(s.name)} <span class="muted">· ${i <= 2 ? "broń" : "ścieżka"}</span></div>
        <div class="sk-desc">${escapeHtml(s.description)}</div>
        <div class="sk-shape">${escapeHtml(shapeText(s))}</div>
        <div class="sk-nums">${skillNumbers(s, path.resource.name).map((x) => `<span>${escapeHtml(x)}</span>`).join("")}</div>
        <div class="sk-how">${open ? escapeHtml(howToUse(s, KEYS[i])) : `Otworzy się na poziomie ${SLOT_UNLOCK[i]}.`}</div>`;
      c.append(left, txt);
      list.append(c);
    });
    body.append(list);
  }

  // ----------------------------------------------------------------------------- talents

  private talents(body: HTMLElement, me: Me) {
    const path = PATHS[pathOf(me)];
    const held = parse<string[]>(me.talents, []);
    const points = pointsAt(me.level) - held.length;
    body.append(
      el(
        "p",
        "small",
        points > 0
          ? `Punkty do wydania: ${points}. Kliknij talent, by go wziąć. Każdy poziom daje punkt; kolejne rzędy otwierają się z poziomem.`
          : `Wszystkie punkty wydane (${held.length}). Następny punkt na poziomie ${Math.min(20, me.level + 1)}.`,
      ),
    );
    const cols = el("div", "talent-cols");
    const take = (n: TalentNode) => {
      if (held.includes(n.id)) return;
      this.sound("ui_confirm", 0.5);
      this.room.send(MSG.talent, { talents: [...held, n.id] });
    };
    for (const b of talentTree(path)) {
      const col = el("div", "talent-col");
      col.append(el("h3", undefined, b.name), el("div", "muted small", b.blurb));
      b.tiers.forEach((pair, t) => {
        const row = el("div", "talent-row");
        row.append(el("div", "t-lvl", `poz. ${TIER_LEVEL[t]}`));
        for (const n of pair) {
          const has = held.includes(n.id);
          const sib = pair.some((x) => x !== n && held.includes(x.id));
          const can = !has && !sib && points > 0 && me.level >= TIER_LEVEL[t];
          const btn = el("button", `talent${has ? " on" : ""}${can ? " can" : ""}${sib ? " off" : ""}`);
          btn.innerHTML = `<b>${escapeHtml(n.name)}</b><span>${escapeHtml(n.description)}</span>`;
          btn.disabled = !can;
          btn.addEventListener("click", () => take(n));
          row.append(btn);
        }
        col.append(row);
      });
      const ks = b.keystone;
      const kHas = held.includes(ks.id);
      const kCan = !kHas && points > 0 && me.level >= KEYSTONE_LEVEL && b.tiers.every((pair) => pair.some((x) => held.includes(x.id)));
      const kb = el("button", `talent keystone${kHas ? " on" : ""}${kCan ? " can" : ""}`);
      kb.innerHTML = `<i>Kamień węgielny · poz. ${KEYSTONE_LEVEL}</i><b>${escapeHtml(ks.name)}</b><span>${escapeHtml(ks.description)}</span>`;
      kb.disabled = !kCan;
      kb.addEventListener("click", () => take(ks));
      col.append(kb);
      cols.append(col);
    }
    body.append(cols);
    if (held.length) {
      const reset = el("button", "reset", "Zwróć wszystkie talenty (tylko przy ognisku)");
      reset.addEventListener("click", () => {
        this.sound("ui_click", 0.5);
        this.room.send(MSG.talent, { talents: [] });
      });
      body.append(reset);
    }
    void levelOf;
  }
}

/** Adds up bonuses of the same kind and target, so the list reads "+20% obrażeń" once, not five times. */
function sumBonuses(list: Bonus[]): Bonus[] {
  const out = new Map<string, Bonus>();
  for (const b of list) {
    const k = `${b.kind}|${"to" in b ? b.to ?? "all" : ""}|${b.kind === "status" ? b.status : ""}|${b.kind === "rider" ? JSON.stringify(b.effect) : ""}`;
    const prev = out.get(k);
    if (!prev) out.set(k, { ...b } as Bonus);
    else if ("pct" in prev && "pct" in b && typeof prev.pct === "number") (prev as { pct: number }).pct += b.pct as number;
    else if (prev.kind === "projectiles" && b.kind === "projectiles") prev.add += b.add;
  }
  return [...out.values()];
}

function rarityColor(it: Item) {
  return { common: "#5a5550", fine: "#c8c2b6", rare: "#5a9ae0", ashen: "#e0442a" }[it.rarity] ?? "#5a5550";
}

export { EQUIP_SLOTS };
