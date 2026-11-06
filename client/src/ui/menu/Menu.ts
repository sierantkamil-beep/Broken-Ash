import {
  ARMOURS,
  BALANCE,
  DEFAULT_LOOKS,
  DYES,
  HEADS,
  PATHS,
  PATH_IDS,
  PEOPLES,
  SHOULDERS,
  SKIN_TONES,
  STATUS_INFO,
  WEAPONS,
  WEAPON_IDS,
  type CharacterLook,
  type PathDef,
  type PathId,
  type SkillDef,
  type WeaponDef,
  type WeaponId,
} from "@broken-ash/shared";
import { ACCENTS } from "../../fx/accents";
import { $, el, escapeHtml, tooltip } from "../dom";
import { logoMark, skillIcon } from "../pixelIcons";
import { currentCharacter, deleteCharacter, listCharacters, newCharacter, saveCharacter, selectCharacter, type SavedCharacter } from "./characters";
import { Preview, type PreviewMode } from "./Preview";

const TYPE = { melee: "wręcz", magic: "magia", ranged: "dystans" } as const;
const GRIP = { one: "jednoręczna", two: "dwuręczna", bow: "łuk w drugiej ręce", pair: "para, w obu rękach" } as const;
const RES_NOTE: Record<string, string> = {
  fury: "rośnie z każdym trafieniem, gaśnie bez walki",
  stamina: "odnawia się sama, wydajesz ją na ciężkie ciosy",
  none: "płacisz własnym życiem",
  heat: "umiejętności go podnoszą — przy pełnym przegrzewasz się",
  charge: "zbierasz go w biegu",
  ash: "zbierasz go z trupów wokół",
  focus: "odnawia się szybko, wydajesz na celne strzały",
  doses: "dawki trucizny odnawiają się powoli",
};

type Screen = "title" | "chars" | "create" | "lobby";

export interface MenuHooks {
  sound(key: string, volume?: number): void;
  settings(): void;
  quit(): void;
  /** The character is ready: show the host / join step. */
  ready(c: SavedCharacter): void;
}

/** Which weapon sprite stands for a weapon type in the menu (tools/pixellab/parts.py). */
const WEAPON_SPRITE: Record<WeaponId, string> = {
  blades: "katana",
  glaive: "glaive",
  greatblade: "nodachi",
  brush: "brush",
  talismans: "talismans",
  fan: "fan",
  lantern: "lantern",
  bow: "bow",
  knives: "knife",
};

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/**
 * The title screen and character creation: a real game menu (keyboard and mouse), path cards with
 * full explanations, the weapon trees, appearance with a live preview, saved characters.
 */
export class Menu {
  private c: SavedCharacter;
  private editing = false;
  private preview: Preview | null = null;
  private tab: "path" | "weapon" | "look" = "path";
  private gear: { img: HTMLImageElement; frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> } | null = null;

  constructor(private readonly hooks: MenuHooks) {
    this.c = currentCharacter() ?? newCharacter("thorn");
    this.paintLogo();
    this.wireTitle();
    this.wireCreate();
    $("chars-back").addEventListener("click", () => this.go("title"));
    $("chars-new").addEventListener("click", () => this.startNew());
    $("lobby-back").addEventListener("click", () => this.go("title"));
    void this.loadGear();
    this.go("title");
  }

  /** The character the lobby will play (the one being made, or the last one). */
  get character(): SavedCharacter {
    return this.c;
  }

  /** Used by automated checks: play a path straight away with the default look. */
  quickCharacter(path: PathId, body: "male" | "female", name: string) {
    const found = listCharacters().find((x) => x.name === name && x.path === path && x.body === body);
    this.c = found ?? { ...newCharacter(path, body, name) };
    saveCharacter(this.c);
  }

  go(screen: Screen) {
    for (const s of ["title", "chars", "create", "lobby"]) $(`screen-${s}`).hidden = s !== screen;
    this.preview?.pause(screen !== "create");
    if (screen === "title") this.refreshTitle();
    if (screen === "chars") this.renderChars();
    if (screen === "lobby") this.renderLobby();
  }

  // ----------------------------------------------------------------------------- title

  private paintLogo() {
    // A crisp pixel mark (an open enso with a slash) beside the name, at a whole-pixel scale.
    $("logo-ink").replaceChildren(logoMark());
  }

  private wireTitle() {
    const nav = $("main-nav");
    const buttons = () => [...nav.querySelectorAll<HTMLButtonElement>("button")].filter((b) => !b.disabled && !b.hidden);
    let sel = 0;
    const mark = () => buttons().forEach((b, i) => b.classList.toggle("sel", i === sel));
    for (const b of nav.querySelectorAll<HTMLButtonElement>("button")) {
      b.addEventListener("mouseenter", () => {
        sel = buttons().indexOf(b);
        mark();
      });
      b.addEventListener("click", () => {
        this.hooks.sound("ui_confirm", 0.5);
        const go = b.dataset.go;
        if (go === "continue") this.hooks.ready(this.c);
        else if (go === "create") this.startNew();
        else if (go === "characters") this.go("chars");
        else if (go === "settings") this.hooks.settings();
        else if (go === "quit") this.hooks.quit();
      });
    }
    window.addEventListener("keydown", (e) => {
      if ($("screen-title").hidden || !$("menu") || $("menu").hidden) return;
      if (!$("pause").hidden) return;
      const list = buttons();
      if (e.key === "ArrowDown" || e.key === "s") sel = (sel + 1) % list.length;
      else if (e.key === "ArrowUp" || e.key === "w") sel = (sel - 1 + list.length) % list.length;
      else if (e.key === "Enter") return list[sel]?.click();
      else return;
      this.hooks.sound("ui_hover", 0.3);
      mark();
    });
    mark();
  }

  private refreshTitle() {
    const has = listCharacters().length > 0;
    const cont = $<HTMLButtonElement>("nav-continue");
    cont.hidden = !has;
    $("nav-chars").hidden = !has;
    if (has) {
      const c = currentCharacter()!;
      this.c = c;
      $("continue-name").textContent = `${c.name || "bez imienia"} · ${PATHS[c.path].name} · ${WEAPONS[c.weapon].name}`;
    }
    const first = $("main-nav").querySelector<HTMLButtonElement>("button:not([hidden])");
    for (const b of $("main-nav").querySelectorAll("button")) b.classList.toggle("sel", b === first);
  }

  // ----------------------------------------------------------------------------- saved characters

  private renderChars() {
    const box = $("char-list");
    box.replaceChildren();
    const cur = currentCharacter();
    for (const c of listCharacters()) {
      const row = el("div", `char-row${cur?.id === c.id ? " cur" : ""}`);
      const who = el("div", "who");
      who.append(el("b", undefined, c.name || "bez imienia"), el("div", undefined, `${PATHS[c.path].name} · ${WEAPONS[c.weapon].name} · ${c.body === "male" ? "ciało męskie" : "ciało kobiece"}`));
      const play = el("button", "primary", "Graj");
      play.addEventListener("click", () => {
        selectCharacter(c.id);
        this.c = c;
        this.hooks.ready(c);
      });
      const edit = el("button", undefined, "Zmień");
      edit.addEventListener("click", () => this.edit(c));
      const del = el("button", undefined, "Usuń");
      del.addEventListener("click", () => {
        if (!confirm(`Usunąć postać ${c.name || ""}? Jej mistrzostwo broni zostaje u hosta.`)) return;
        deleteCharacter(c.id);
        this.renderChars();
      });
      row.append(skillIcon(PATHS[c.path].signature[0], ACCENTS[c.path]), who, play, el("span"));
      row.lastElementChild!.replaceWith(edit);
      row.append(del);
      row.style.gridTemplateColumns = "52px 1fr auto auto auto";
      box.append(row);
    }
  }

  // ----------------------------------------------------------------------------- creation

  private startNew() {
    const body = this.c?.body ?? "female";
    this.c = newCharacter("thorn", body);
    this.editing = false;
    this.openCreate();
  }

  private edit(c: SavedCharacter) {
    this.c = { ...c, look: { ...c.look } };
    this.editing = true;
    this.openCreate();
  }

  private openCreate() {
    $("create-title").textContent = this.editing ? "Zmień postać" : "Nowa postać";
    $<HTMLInputElement>("name").value = this.c.name;
    this.go("create");
    if (!this.preview) this.preview = new Preview($("preview"));
    this.renderPaths();
    this.renderTab();
    this.updatePreview();
  }

  private wireCreate() {
    for (const b of document.querySelectorAll<HTMLButtonElement>(".tabs button")) {
      b.addEventListener("click", () => {
        this.tab = b.dataset.tab as "path" | "weapon" | "look";
        this.hooks.sound("ui_click", 0.4);
        this.renderTab();
      });
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-pv]")) b.addEventListener("click", () => this.preview?.act(b.dataset.pv as PreviewMode));
    $("pv-left").addEventListener("click", () => this.preview?.turn(-1));
    $("pv-right").addEventListener("click", () => this.preview?.turn(1));
    window.addEventListener("keydown", (e) => {
      if ($("screen-create").hidden || document.activeElement?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") this.preview?.turn(-1);
      if (e.key === "ArrowRight") this.preview?.turn(1);
    });
    $<HTMLInputElement>("name").addEventListener("input", (e) => {
      this.c.name = (e.target as HTMLInputElement).value;
      $("preview-name").textContent = this.c.name;
    });
    $("create-back").addEventListener("click", () => this.go(listCharacters().length ? "title" : "title"));
    $("create-next").addEventListener("click", () => {
      const name = $<HTMLInputElement>("name").value.trim();
      if (!name) {
        $<HTMLInputElement>("name").focus();
        $<HTMLInputElement>("name").placeholder = "Postać potrzebuje imienia";
        return;
      }
      this.c.name = name;
      saveCharacter(this.c);
      this.hooks.sound("ui_confirm", 0.6);
      this.hooks.ready(this.c);
    });
  }

  private setPath(id: PathId) {
    const was = this.c.path;
    if (was === id) return;
    // A new path brings its people's colours and first home weapon, unless they were changed.
    const lookWasDefault = JSON.stringify(this.c.look) === JSON.stringify(DEFAULT_LOOKS[was]);
    const weaponWasHome = this.c.weapon === PATHS[was].homeWeapons[0];
    this.c.path = id;
    if (this.c.people === PATHS[was].people) this.c.people = PATHS[id].people;
    if (lookWasDefault) this.c.look = { ...DEFAULT_LOOKS[id] };
    if (weaponWasHome) this.c.weapon = PATHS[id].homeWeapons[0];
    this.hooks.sound("ui_click", 0.4);
    this.renderPaths();
    this.renderTab();
    this.updatePreview();
  }

  private renderPaths() {
    const box = $("path-list");
    box.replaceChildren();
    for (const id of PATH_IDS) {
      const p = PATHS[id];
      const card = el("button", `path-card${this.c.path === id ? " on" : ""}`);
      const name = el("b", undefined, p.name.replace("Ścieżka ", ""));
      const meta = el("div", "meta");
      meta.innerHTML = `${TYPE[p.type]} · <span class="diff">${"◆".repeat(p.difficulty)}${"◇".repeat(3 - p.difficulty)}</span><br>${escapeHtml(p.tagline)}`;
      card.append(skillIcon(p.signature[0], ACCENTS[id]), name, meta);
      card.addEventListener("click", () => this.setPath(id));
      box.append(card);
    }
  }

  private renderTab() {
    for (const b of document.querySelectorAll<HTMLButtonElement>(".tabs button")) b.classList.toggle("on", b.dataset.tab === this.tab);
    for (const t of ["path", "weapon", "look"]) $(`tab-${t}`).hidden = t !== this.tab;
    if (this.tab === "path") this.renderPathTab();
    if (this.tab === "weapon") this.renderWeaponTab();
    if (this.tab === "look") this.renderLookTab();
    document.querySelectorAll(".steps span").forEach((s, i) => s.classList.toggle("on", i === ["path", "weapon", "look"].indexOf(this.tab)));
  }

  private skillRow(s: SkillDef, accent: number, note = "", locked = false) {
    const row = el("div", `skill-row${locked ? " locked" : ""}`);
    const txt = el("div");
    const cost = [s.cost > 0 ? `koszt ${s.cost}` : s.cost < 0 ? `zrzuca ${-s.cost}` : "", s.hpCost ? `${s.hpCost} życia` : "", `odnowienie ${s.cooldown} s`].filter(Boolean).join(" · ");
    txt.innerHTML = `<b>${escapeHtml(s.name)}</b>${note ? ` <span class="sm">${escapeHtml(note)}</span>` : ""}<div class="sd">${escapeHtml(s.description)}</div><div class="sm">${cost}${statusesOf(s)}</div>`;
    row.append(skillIcon(s, accent), txt);
    return row;
  }

  private renderPathTab() {
    const p = PATHS[this.c.path];
    const box = $("tab-path");
    box.replaceChildren();
    const h = el("h3", undefined, p.name);
    const blurb = el("p", undefined, p.blurb);
    const facts = el("dl", "facts");
    const add = (k: string, v: string) => facts.append(el("dt", undefined, k), el("dd", undefined, v));
    add("Rodzaj", `${TYPE[p.type]} · trudność ${"◆".repeat(p.difficulty)}${"◇".repeat(3 - p.difficulty)}`);
    add("Lud", PEOPLES.find((x) => x.id === p.people)?.name ?? "");
    add("Zdrowie", `${p.hp}${p.speed > 1.02 ? " · szybki krok" : p.speed < 0.98 ? " · ciężki krok" : ""}`);
    add(p.resource.max > 0 ? p.resource.name : "Zasób", p.resource.max > 0 ? `${RES_NOTE[p.resource.id] ?? ""}` : RES_NOTE.none);
    add("Przetrwanie", p.sustain);
    add("We dwoje", p.combo);
    add("Broń ludu", `${p.homeWeapons.map((w) => WEAPONS[w].name).join(", ")} — ${p.affinity.text}`);
    box.append(h, blurb, facts, el("h3", undefined, "Umiejętności ścieżki (klawisze 2–4)"));
    for (const s of p.signature) box.append(this.skillRow(s, ACCENTS[this.c.path]));
    const note = el("p", "muted small", "Lewy i prawy przycisk myszy oraz klawisz 1 daje broń — każda ma własne drzewko mistrzostwa. Każda ścieżka może walczyć każdą bronią.");
    box.append(note);
  }

  private renderWeaponTab() {
    const box = $("tab-weapon");
    box.replaceChildren();
    const grid = el("div", "weapon-grid");
    const home = PATHS[this.c.path].homeWeapons;
    for (const id of WEAPON_IDS) {
      const w = WEAPONS[id];
      const card = el("button", `weapon-card${this.c.weapon === id ? " on" : ""}`);
      card.append(this.weaponCanvas(id), el("span", undefined, w.name));
      if (home.includes(id)) card.append(el("span", "home", "BROŃ LUDU"));
      card.addEventListener("click", () => {
        this.c.weapon = id;
        this.hooks.sound("ui_click", 0.4);
        this.renderWeaponTab();
        this.updatePreview();
      });
      grid.append(card);
    }
    box.append(grid);
    const w = WEAPONS[this.c.weapon];
    const acc = ACCENTS[this.c.path];
    box.append(el("h3", undefined, w.name), el("p", undefined, w.blurb));
    const facts = el("dl", "facts");
    facts.append(el("dt", undefined, "Chwyt"), el("dd", undefined, GRIP[w.grip]), el("dt", undefined, "Walka"), el("dd", undefined, w.range === "melee" ? "wręcz" : "na dystans"));
    if (home.includes(this.c.weapon)) facts.append(el("dt", undefined, "Ludu"), el("dd", undefined, `+${Math.round(BALANCE.mastery.affinityDamage * 100)}% obrażeń; ${PATHS[this.c.path].affinity.text}`));
    box.append(facts, el("h3", undefined, "Drzewko mistrzostwa"));
    const M = BALANCE.mastery;
    box.append(this.skillRow(w.basic, acc, "LPM · zawsze"));
    w.rmb.forEach((s, i) => box.append(this.skillRow(s, acc, `PPM · mistrzostwo ${M.rmbUnlock[i]}`, M.rmbUnlock[i] > 1)));
    w.key.forEach((s, i) => box.append(this.skillRow(s, acc, `klawisz 1 · mistrzostwo ${M.keyUnlock[i]}`, M.keyUnlock[i] > 1)));
    const pass = el("div");
    w.passives.forEach((row, i) => {
      const r = el("div", "skill-row locked");
      r.style.gridTemplateColumns = "44px 1fr";
      r.innerHTML = `<div class="sm">mistrz. ${M.passiveUnlock[i]}</div><div class="sd"><b>${escapeHtml(row[0].name)}</b> albo <b>${escapeHtml(row[1].name)}</b><div class="sm">${escapeHtml(row[0].description)} / ${escapeHtml(row[1].description)}</div></div>`;
      pass.append(r);
    });
    box.append(el("h3", undefined, "Zdolności (wybierasz jedną z pary)"), pass);
    box.append(el("p", "muted small", "Mistrzostwo rośnie od obrażeń zadanych umiejętnościami broni. Drzewko wybierasz w grze (K), poza falą."));
  }

  private renderLookTab() {
    const box = $("tab-look");
    box.replaceChildren();
    const L = this.c.look;
    const set = (patch: Partial<CharacterLook> & { body?: "male" | "female"; people?: string }) => {
      if (patch.body) this.c.body = patch.body;
      if (patch.people) this.c.people = patch.people as SavedCharacter["people"];
      const { body: _b, people: _p, ...look } = patch;
      Object.assign(this.c.look, look);
      this.hooks.sound("ui_click", 0.35);
      this.renderLookTab();
      this.updatePreview();
    };
    const row = (label: string, ...children: HTMLElement[]) => {
      const r = el("div", "look-row");
      const chips = el("div", "chips");
      chips.append(...children);
      r.append(el("div", "lbl", label), chips);
      box.append(r);
    };
    const chip = (text: string, on: boolean, fn: () => void) => {
      const b = el("button", on ? "on" : undefined, text);
      b.addEventListener("click", fn);
      return b;
    };
    const swatch = (color: string, on: boolean, name: string, fn: () => void) => {
      const b = el("button", `swatch${on ? " on" : ""}`);
      b.style.background = color;
      b.title = name;
      b.addEventListener("click", fn);
      return b;
    };
    row("Ciało", chip("kobiece", this.c.body === "female", () => set({ body: "female" })), chip("męskie", this.c.body === "male", () => set({ body: "male" })));
    row("Skóra", ...SKIN_TONES.map((t, i) => swatch(t.ramp[2], L.skin === i, t.name, () => set({ skin: i }))));
    row("Barwa stroju", ...DYES.map((d, i) => swatch(d.ramp[2], L.cloth === i, d.name, () => set({ cloth: i }))));
    row("Barwa wykończeń (skóra, okucia)", ...DYES.map((d, i) => swatch(d.ramp[2], L.trim === i, d.name, () => set({ trim: i }))));
    row("Pancerz", ...ARMOURS.map((a) => chip(a.name, L.armour === a.id, () => set({ armour: a.id }))));
    row("Głowa", ...HEADS.map((a) => chip(a.name, L.head === a.id, () => set({ head: a.id }))));
    row("Ramiona", ...SHOULDERS.map((a) => chip(a.name, L.shoulders === a.id, () => set({ shoulders: a.id }))));
    row("Płaszcz", chip("bez", L.cape < 0, () => set({ cape: -1 })), ...DYES.map((d, i) => swatch(d.ramp[1], L.cape === i, d.name, () => set({ cape: i }))));
    row("Lud", ...PEOPLES.map((pp) => chip(pp.name, this.c.people === pp.id, () => set({ people: pp.id }))));
    const reset = el("button", undefined, "Barwy ludu ścieżki");
    reset.addEventListener("click", () => {
      this.c.look = { ...DEFAULT_LOOKS[this.c.path] };
      this.renderLookTab();
      this.updatePreview();
    });
    box.append(reset);
  }

  private updatePreview() {
    $("preview-name").textContent = this.c.name;
    this.preview?.show({ path: this.c.path, body: this.c.body, weapon: this.c.weapon, look: { ...this.c.look } });
  }

  // ----------------------------------------------------------------------------- lobby

  private renderLobby() {
    const c = this.c;
    const card = $("lobby-card");
    card.replaceChildren();
    const txt = el("div");
    txt.innerHTML = `<b>${escapeHtml(c.name || "bez imienia")}</b><div class="muted">${escapeHtml(PATHS[c.path].name)} · ${escapeHtml(WEAPONS[c.weapon].name)}</div>`;
    card.append(skillIcon(PATHS[c.path].signature[0], ACCENTS[c.path]), txt);
  }

  // ----------------------------------------------------------------------------- weapon sprites

  private async loadGear() {
    try {
      const [json, img] = await Promise.all([
        fetch("assets/gear/gear.json").then((r) => r.json()),
        new Promise<HTMLImageElement>((ok, fail) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = fail;
          i.src = "assets/gear/gear.webp";
        }),
      ]);
      this.gear = { img, frames: json.frames };
      if (!$("tab-weapon").hidden) this.renderWeaponTab();
    } catch {
      // Without the sprites the cards just show names.
    }
  }

  /**
   * A weapon's icon for its card: the in-hand sprite turned to point up-right (as icons do), in the
   * look's dyes, shown at a whole-pixel scale so its pixels stay square.
   */
  private weaponCanvas(id: WeaponId): HTMLCanvasElement {
    const c = document.createElement("canvas");
    // Gear angles: 32 steps from +x, clockwise on screen; frame 28 points up-right (−45°).
    const f = this.gear?.frames[`w/${WEAPON_SPRITE[id]}/${id === "bow" ? 0 : 28}`];
    if (!this.gear || !f) {
      c.width = c.height = 1;
      return c;
    }
    const r = f.frame;
    c.width = r.w;
    c.height = r.h;
    // The biggest whole-pixel scale that fits a 64 px box (tiny talismans and knives get 4×).
    const scale = Math.max(1, Math.min(4, Math.floor(64 / Math.max(r.w, r.h))));
    c.style.width = `${r.w * scale}px`;
    c.style.height = `${r.h * scale}px`;
    c.className = "px-weapon";
    const ctx = c.getContext("2d")!;
    ctx.drawImage(this.gear.img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const d = ctx.getImageData(0, 0, r.w, r.h);
    const ramps = [...DYES[this.c.look.cloth].ramp, ...DYES[this.c.look.trim].ramp].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    for (let i = 0; i < d.data.length; i += 4) {
      if (d.data[i + 3] && d.data[i] === 255 && d.data[i + 1] === 0 && d.data[i + 2] >= 1 && d.data[i + 2] <= 8) [d.data[i], d.data[i + 1], d.data[i + 2]] = ramps[d.data[i + 2] - 1];
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }
}

/** The statuses a skill applies, in words, for its description line. */
function statusesOf(s: SkillDef): string {
  const names = new Set<string>();
  for (const e of s.effects) if (e.kind === "status" && (e.target ?? "enemy") === "enemy") names.add(STATUS_INFO[e.status].name.toLowerCase());
  return names.size ? ` · ${[...names].join(", ")}` : "";
}

export { hex, tooltip };
export type { PathDef, WeaponDef };
