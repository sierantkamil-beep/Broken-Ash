import { PATHS, RARITY, SLOT_UNLOCK, pointsAt, type FxEvent, type SkillDef } from "@broken-ash/shared";
import { ACCENTS } from "../fx/accents";
import { barOf, pathOf, type LoadoutView } from "../net/loadout";
import { howToUse, shapeText, skillNumbers } from "./Book";
import { $, el, escapeHtml } from "./dom";
import { skillIcon } from "./pixelIcons";

const KEYS = ["LPM", "PPM", "1", "2", "3", "4"];

export interface ProgressHooks {
  banner(title: string, sub?: string): void;
  sound(key: string, volume: number): void;
  /** A pillar of light on the player (level-up). */
  celebrate(): void;
  /** Makes a bar slot glow until it's first used. */
  glow(slot: number, on: boolean): void;
}

type Me = LoadoutView & { name: string; level: number; talents: string; cast: string; x: number; y: number; dodgeT: number; inv: string };

/** One step of the first-hour tutorial: when it shows, its text, and when it's done. */
interface Step {
  id: string;
  when(c: Ctx): boolean;
  text(c: Ctx): string;
  done(c: Ctx): boolean;
}
interface Ctx {
  me: Me;
  flags: Set<string>;
  moved: number;
  casts: Set<number>;
  dodged: boolean;
  picked: boolean;
  bookOpened: boolean;
  bar: SkillDef[];
}

const STEPS: Step[] = [
  { id: "move", when: () => true, text: () => "<b>WASD</b> — ruch · <b>mysz</b> — celowanie", done: (c) => c.moved > 3 },
  { id: "attack", when: () => true, text: (c) => `<b>LPM</b> — ${escapeHtml(c.bar[0]?.name ?? "atak")}: podstawowy atak twojej broni`, done: (c) => c.casts.has(0) },
  { id: "dodge", when: () => true, text: () => "<b>Spacja</b> — przewrót: przetocz się przez cios, gdy na ziemi pojawi się czerwony znak", done: (c) => c.dodged },
  { id: "skill", when: () => true, text: (c) => `<b>2</b> — ${escapeHtml(c.bar[3]?.name ?? "")}: pierwsza umiejętność twojej ścieżki`, done: (c) => c.casts.has(3) },
  { id: "search", when: (c) => c.flags.has("cells_cleared"), text: () => "Przeszukaj martwego strażnika w sali (<b>F</b>)", done: (c) => c.picked || c.flags.has("loot:soramei_cells:guard") },
  { id: "loot", when: (c) => c.flags.has("loot:soramei_cells:guard"), text: () => "Podnieś to, co leży na ziemi (<b>F</b>)", done: (c) => c.picked },
  { id: "bag", when: (c) => c.picked, text: () => "<b>I</b> — torba i ekwipunek: prawy klik zakłada przedmiot", done: (c) => c.bookOpened },
  { id: "talent", when: (c) => pointsAt(c.me.level) > 0, text: () => "Nowy poziom: <b>T</b> — wydaj punkt talentu", done: (c) => parseTalents(c.me.talents) > 0 },
];

const parseTalents = (s: string) => {
  try {
    return (JSON.parse(s) as unknown[]).length;
  } catch {
    return 0;
  }
};

/**
 * Character growth on screen: level-ups (banner, light, the new skill introduced on a card with how
 * to use it), what you picked up, a full bag, and the first hour's tutorial, one prompt at a time.
 * What's been shown is remembered per character on this computer.
 */
export class Progression {
  private seen = new Set<string>();
  private name = "";
  private cards: number[] = [];
  private cardShown = false;
  private current = -1;
  private ctx: Omit<Ctx, "me" | "flags" | "bar"> = { moved: 0, casts: new Set(), dodged: false, picked: false, bookOpened: false };
  private last: { x: number; y: number } | null = null;
  private lastCast = "";
  private glowing = new Set<number>();
  private started = false;

  constructor(
    private readonly myId: string,
    private readonly hooks: ProgressHooks,
  ) {
    $("newskill").addEventListener("click", () => this.hideCard());
    window.addEventListener("keydown", (e) => {
      if (this.cardShown && (e.code === "Enter" || e.code === "Escape" || e.code === "Space")) this.hideCard();
    });
  }

  private load(): string[] {
    try {
      return JSON.parse(localStorage.getItem(`ash.progress.${this.name}`) ?? "[]");
    } catch {
      return [];
    }
  }

  private mark(id: string) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    try {
      localStorage.setItem(`ash.progress.${this.name}`, JSON.stringify([...this.seen]));
    } catch {
      /* private window */
    }
  }

  /** Fx from the server that concern growth and loot. */
  handle(e: FxEvent, me: Me | null) {
    if (e.t === "levelUp" && e.id === this.myId && me) {
      this.hooks.sound("sfx_victory", 0.7);
      this.hooks.celebrate();
      const opened = e.slots.map((s) => barOf(me).skills[s]?.name).filter(Boolean);
      this.hooks.banner(`Poziom ${e.level}`, [opened.length ? `Nowa umiejętność: ${opened.join(", ")}` : "", e.points > 0 ? `Punkt talentu (T)` : ""].filter(Boolean).join(" · "));
      for (const s of e.slots) this.queueCard(s);
    } else if (e.t === "pickup" && e.by === this.myId) {
      this.ctx.picked = true;
      this.hooks.sound(e.gold ? "ui_click" : "ui_confirm", 0.5);
      this.toast(e.gold ? `+ ${e.gold} złota` : `+ ${e.name}`, e.gold ? "#e0c070" : RARITY[e.rarity as keyof typeof RARITY]?.color ?? "#fff");
    } else if (e.t === "bagFull" && e.id === this.myId) {
      this.toast("Torba pełna", "#e0442a");
      this.hooks.sound("ui_hover", 0.6);
    }
  }

  private toast(text: string, color: string) {
    const box = $("pickups");
    const d = el("div", "pickup", text);
    d.style.color = color;
    box.append(d);
    window.setTimeout(() => d.classList.add("gone"), 2600);
    window.setTimeout(() => d.remove(), 3400);
    while (box.children.length > 5) box.firstElementChild?.remove();
  }

  private queueCard(slot: number) {
    if (!this.cards.includes(slot)) this.cards.push(slot);
  }

  private showCard(me: Me, slot: number) {
    const s = barOf(me).skills[slot];
    if (!s) return;
    this.current = slot;
    const path = PATHS[pathOf(me)];
    const box = $("newskill");
    box.replaceChildren();
    const icon = skillIcon(s, ACCENTS[pathOf(me)]);
    const left = el("div", "ns-left");
    left.append(icon, el("div", "ns-key", KEYS[slot]));
    const t = el("div", "ns-text");
    t.innerHTML = `<div class="ns-kicker">${slot <= 2 ? "Umiejętność broni" : `Umiejętność ścieżki ${escapeHtml(path.name)}`}</div>
      <div class="ns-name">${escapeHtml(s.name)}</div>
      <div class="ns-desc">${escapeHtml(s.description)}</div>
      <div class="ns-shape">${escapeHtml(shapeText(s))} · ${skillNumbers(s, path.resource.name).slice(0, 3).map(escapeHtml).join(" · ")}</div>
      <div class="ns-how">${escapeHtml(howToUse(s, KEYS[slot]))}</div>
      <div class="ns-close">Kliknij albo Enter — rozumiem</div>`;
    box.append(left, t);
    box.hidden = false;
    box.classList.remove("show");
    void box.offsetWidth;
    box.classList.add("show");
    this.cardShown = true;
    this.hooks.sound("sfx_bell", 0.5);
    this.mark(`card:${slot}`);
    this.glowing.add(slot);
    this.hooks.glow(slot, true);
    window.setTimeout(() => this.cardShown && this.hideCard(), 14000);
  }

  private hideCard() {
    if (!this.cardShown) return;
    this.cardShown = false;
    this.current = -1;
    $("newskill").classList.remove("show");
    window.setTimeout(() => ($("newskill").hidden = true), 300);
  }

  /** Each frame: tutorial progress from what the player does, cards waiting their turn. */
  update(me: Me | null, flags: Set<string>, inScene: boolean, bookOpen: string | null) {
    if (!me) return;
    if (!this.name && me.name) {
      this.name = me.name;
      for (const id of this.load()) this.seen.add(id);
    }
    // The two skills a new character starts with are introduced on their first steps.
    if (!this.started && !inScene) {
      this.started = true;
      for (const slot of [0, 3]) if (me.level >= SLOT_UNLOCK[slot] && !this.seen.has(`card:${slot}`)) this.queueCard(slot);
    }
    if (this.last) this.ctx.moved += Math.hypot(me.x - this.last.x, me.y - this.last.y);
    this.last = { x: me.x, y: me.y };
    if (me.dodgeT > 0) this.ctx.dodged = true;
    if (bookOpen === "char") this.ctx.bookOpened = true;
    if (me.cast && me.cast !== this.lastCast) {
      const slot = barOf(me).skills.findIndex((s) => s.id === me.cast);
      if (slot >= 0) {
        this.ctx.casts.add(slot);
        if (this.glowing.delete(slot)) this.hooks.glow(slot, false);
      }
    }
    this.lastCast = me.cast;
    // Cards wait while the book is open (they'd sit behind it).
    if (bookOpen && this.cardShown) {
      const slot = this.current;
      this.hideCard();
      if (slot >= 0) this.cards.unshift(slot);
    }
    if (!inScene && !bookOpen && !this.cardShown && this.cards.length) this.showCard(me, this.cards.shift()!);

    // The first tutorial step not yet done whose moment has come.
    const c: Ctx = { ...this.ctx, me, flags, bar: barOf(me).skills };
    const tip = $("tutorial");
    let shown: Step | null = null;
    for (const s of STEPS) {
      if (this.seen.has(`tut:${s.id}`)) continue;
      if (s.done(c)) {
        this.mark(`tut:${s.id}`);
        this.hooks.sound("ui_hover", 0.35);
        continue;
      }
      if (s.when(c)) {
        shown = s;
        break;
      }
    }
    const html = shown && !inScene && !this.cardShown ? shown.text(c) : "";
    if (tip.innerHTML !== html) tip.innerHTML = html;
    tip.hidden = !html;
  }
}
