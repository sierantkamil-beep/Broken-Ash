import { PATHS, STATUS_INFO, type PathId, type SkillDef, type StatusId } from "@broken-ash/shared";
import { $, el, escapeHtml, tooltip } from "./dom";
import { SLOT_UNLOCK, XP_FOR } from "@broken-ash/shared";
import { howToUse, shapeText, skillNumbers } from "./Book";
import { skillIcon } from "./pixelIcons";
import { ACCENTS } from "../fx/accents";

const KEYS = ["LPM", "PPM", "1", "2", "3", "4"];

export interface MeView {
  hp: number;
  hpMax: number;
  res: number;
  resMax: number;
  shield: number;
  cd: ArrayLike<number>;
  cast: string;
  st: string;
  downed: boolean;
  downT: number;
  revive: number;
  stamina: number;
  level?: number;
  xp?: number;
}

/** The DOM HUD: your bars and skill bar, your partner, the boss, being downed. */
export class Hud {
  private firstSeen: number | undefined;
  private slots: HTMLElement[] = [];
  private path: PathId | null = null;
  private skills: SkillDef[] = [];
  private barKey = "";

  /** Rebuilds the skill bar when the path, weapon, picks or mastery level change. */
  setBar(path: PathId, skills: SkillDef[], key: string) {
    if (this.barKey === key) return;
    this.barKey = key;
    this.path = path;
    this.skills = skills;
    const p = PATHS[path];
    const box = $("skills");
    box.replaceChildren();
    this.slots = skills.map((s, i) => {
      const d = el("div", "skill");
      tooltip(d, () => {
        const locked = d.classList.contains("locked");
        return `<div class="it-name">${escapeHtml(s.name)}</div><div class="it-kind">${i <= 2 ? "broń" : "ścieżka"} · ${escapeHtml(shapeText(s))}</div><div class="it-base">${escapeHtml(s.description)}</div><div class="it-aff">${skillNumbers(s, p.resource.name).map(escapeHtml).join(" · ")}</div><div class="it-hint">${locked ? `Otworzy się na poziomie ${SLOT_UNLOCK[i]}` : escapeHtml(howToUse(s, KEYS[i]))}</div>`;
      });
      d.append(skillIcon(s, ACCENTS[path]), el("span", "key", KEYS[i]), el("span", "name", s.name), el("div", "cd"), el("div", "cdt"), el("div", "lock", `poz. ${SLOT_UNLOCK[i]}`));
      box.append(d);
      return d;
    });
    const res = document.querySelector<HTMLElement>("#me .bar.res")!;
    res.className = `bar res ${p.resource.id}`;
    res.hidden = p.resource.max <= 0;
  }

  /** Makes a slot glow (a skill just learned, until it's first used). */
  glow(slot: number, on: boolean) {
    this.slots[slot]?.classList.toggle("new", on);
  }

  updateMe(v: MeView) {
    const lvl = v.level ?? 1;
    document.querySelector<HTMLElement>("#me .lvl .n")!.textContent = String(lvl);
    const a = XP_FOR[lvl] ?? 0;
    const b = XP_FOR[lvl + 1] ?? a + 1;
    document.querySelector<HTMLElement>("#me .lvl .xpbar i")!.style.width = `${lvl >= 20 ? 100 : Math.round((100 * ((v.xp ?? 0) - a)) / (b - a))}%`;
    this.slots.forEach((d, i) => d.classList.toggle("locked", lvl < SLOT_UNLOCK[i]));
    // The key hints are for the first minute; after that they only crowd the screen.
    this.firstSeen ??= performance.now();
    if (performance.now() - this.firstSeen > 60_000) $("hint").classList.add("faded");
    const p = this.path ? PATHS[this.path] : null;
    const hp = document.querySelector<HTMLElement>("#me .bar.hp")!;
    (hp.querySelector(".fill") as HTMLElement).style.width = `${(100 * v.hp) / Math.max(1, v.hpMax)}%`;
    (hp.querySelector(".shield") as HTMLElement).style.width = `${Math.min(100, (100 * v.shield) / Math.max(1, v.hpMax))}%`;
    (hp.querySelector(".val") as HTMLElement).textContent = `${Math.ceil(v.hp)} / ${v.hpMax}${v.shield ? `  (+${v.shield})` : ""}`;
    if (p && p.resource.max > 0) {
      const res = document.querySelector<HTMLElement>("#me .bar.res")!;
      (res.querySelector(".fill") as HTMLElement).style.width = `${(100 * v.res) / v.resMax}%`;
      (res.querySelector(".val") as HTMLElement).textContent = `${p.resource.name}: ${Math.floor(v.res)}`;
    }
    if (p) {
      this.skills.forEach((s, i) => {
        const d = this.slots[i];
        if (!d) return;
        const cd = v.cd[i] ?? 0;
        (d.querySelector(".cd") as HTMLElement).style.height = `${Math.min(100, (100 * cd) / s.cooldown)}%`;
        (d.querySelector(".cdt") as HTMLElement).textContent = cd > 0.6 ? String(Math.ceil(cd)) : "";
        const short = p.resource.heat ? v.res + s.cost >= p.resource.max : s.cost > 0 && v.res < s.cost;
        d.classList.toggle("cant", short || (!!s.hpCost && v.hp <= s.hpCost + 1));
        d.classList.toggle("casting", v.cast === s.id);
      });
    }
    const sts = v.st ? v.st.split(",").filter((s) => s !== "stagger") : [];
    document.querySelector<HTMLElement>("#me .statuses")!.textContent = sts.map((s) => STATUS_INFO[s as StatusId]?.name ?? s).join(" · ");
    const stamina = $("stamina");
    (stamina.querySelector(".fill") as HTMLElement).style.width = `${v.stamina}%`;
    stamina.classList.toggle("low", v.stamina < 30);

    const down = $("downed");
    down.hidden = !v.downed;
    if (v.downed) {
      (down.querySelector(".sub") as HTMLElement).textContent = v.revive > 0 ? "Partner cię podnosi…" : `Partner może cię podnieść (F) — zostało ${Math.ceil(v.downT)} s`;
      (down.querySelector(".fill") as HTMLElement).style.width = `${v.revive * 100}%`;
    }
  }

  updatePartner(v: { name: string; path: string; hp: number; hpMax: number; downed: boolean } | null) {
    const box = $("partner");
    box.hidden = !v;
    if (!v) return;
    (box.querySelector(".pname") as HTMLElement).textContent = v.name;
    (box.querySelector(".ppath") as HTMLElement).textContent = PATHS[v.path as PathId]?.name ?? "";
    (box.querySelector(".fill") as HTMLElement).style.width = `${(100 * v.hp) / Math.max(1, v.hpMax)}%`;
    box.classList.toggle("down", v.downed);
  }

  updateBoss(v: { hp: number; hpMax: number } | null) {
    const box = $("boss");
    box.hidden = !v;
    if (v) (box.querySelector(".fill") as HTMLElement).style.width = `${(100 * v.hp) / v.hpMax}%`;
  }

  banner(title: string, sub = "") {
    const t = $("area-toast");
    (t.querySelector(".name") as HTMLElement).textContent = title;
    (t.querySelector(".sub") as HTMLElement).textContent = sub;
    t.classList.add("show");
    clearTimeout((t as unknown as { timer?: number }).timer);
    (t as unknown as { timer?: number }).timer = window.setTimeout(() => t.classList.remove("show"), 3600);
  }
}
