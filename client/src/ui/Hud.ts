import { PATHS, STATUS_INFO, type PathId, type StatusId } from "@broken-ash/shared";
import { $, el } from "./dom";

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
}

/** The DOM HUD: your bars and skill bar, your partner, the boss, being downed. */
export class Hud {
  private slots: HTMLElement[] = [];
  private path: PathId | null = null;

  setPath(path: PathId) {
    if (this.path === path) return;
    this.path = path;
    const p = PATHS[path];
    const box = $("skills");
    box.replaceChildren();
    this.slots = p.skills.map((s, i) => {
      const d = el("div", "skill");
      d.title = `${s.name}\n${s.description}${s.cost > 0 ? `\nKoszt: ${s.cost} (${p.resource.name})` : ""}${s.hpCost ? `\nKoszt: ${s.hpCost} życia` : ""}\nOdnowienie: ${s.cooldown} s`;
      d.append(el("span", "key", KEYS[i]), el("span", "name", s.name), el("div", "cd"), el("div", "cdt"));
      box.append(d);
      return d;
    });
    const res = document.querySelector<HTMLElement>("#me .bar.res")!;
    res.className = `bar res ${p.resource.id}`;
    res.hidden = p.resource.max <= 0;
  }

  updateMe(v: MeView) {
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
      p.skills.forEach((s, i) => {
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
