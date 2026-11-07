import { affixText, ITEM_BASES, itemBonuses, RARITY, SLOT_NAMES, STATUS_INFO, WEAPONS, type Bonus, type Item, type StatusId } from "@broken-ash/shared";
import { escapeHtml } from "./dom";
import { ALL_SKILLS } from "../net/loadout";

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

/** Who a bonus is for, in words. */
function target(to: string | undefined): string {
  if (!to || to === "all") return "";
  if (to === "weapon") return " (umiejętności broni)";
  if (to === "sig") return " (umiejętności ścieżki)";
  if (to === "basic") return " (atak podstawowy)";
  if (to === "rmb") return " (prawy przycisk)";
  if (to === "key") return " (klawisz 1)";
  if (to.startsWith("skill:")) return ` (${ALL_SKILLS.get(to.slice(6))?.name ?? to.slice(6)})`;
  return "";
}

/** One bonus as a line of Polish. */
export function bonusText(b: Bonus): string {
  switch (b.kind) {
    case "damage":
      return `${pct(b.pct)} obrażeń${target(b.to)}`;
    case "cooldown":
      return b.pct <= 0 ? `${Math.round(-b.pct * 100)}% szybsze odnawianie${target(b.to)}` : `${Math.round(b.pct * 100)}% wolniejsze odnawianie${target(b.to)}`;
    case "reach":
      return `${pct(b.pct)} zasięgu${target(b.to)}`;
    case "projectiles":
      return `+${b.add} pocisk${target(b.to)}`;
    case "poise":
      return `${pct(b.pct)} łamania postawy${target(b.to)}`;
    case "cost":
      return `${pct(b.pct)} kosztu umiejętności${target(b.to)}`;
    case "rider": {
      const e = b.effect;
      if (e.kind === "lifesteal") return `Leczy o ${Math.round(e.fraction * 100)}% zadanych obrażeń${target(b.to)}`;
      if (e.kind === "status") return `Trafienia nakładają: ${STATUS_INFO[e.status]?.name ?? e.status}${target(b.to)}`;
      return `Dodatkowy efekt${target(b.to)}`;
    }
    case "status":
      return `${pct(b.pct)} obrażeń od: ${STATUS_INFO[b.status as StatusId]?.name ?? b.status}`;
    case "hp":
      return [b.add ? `+${Math.round(b.add)} życia` : "", b.pct ? `${pct(b.pct)} życia` : ""].filter(Boolean).join(", ");
    case "armour":
      return b.pct >= 0 ? `${Math.round(b.pct * 100)}% mniej otrzymanych obrażeń` : `${Math.round(-b.pct * 100)}% więcej otrzymanych obrażeń`;
    case "speed":
      return `${pct(b.pct)} szybkości biegu`;
  }
}

/** Sums of the plain numbers an item set gives, for comparing two items. */
function totals(bonuses: Bonus[]): Map<string, number> {
  const m = new Map<string, number>();
  const add = (k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const b of bonuses) {
    if (b.kind === "hp") {
      if (b.add) add("życie", b.add);
      if (b.pct) add("życie %", b.pct * 100);
    } else if (b.kind === "armour") add("ochrona %", b.pct * 100);
    else if (b.kind === "speed") add("bieg %", b.pct * 100);
    else if (b.kind === "damage") add(`obrażenia %${target(b.to)}`, b.pct * 100);
    else if (b.kind === "cooldown") add(`odnawianie %${target(b.to)}`, -b.pct * 100);
    else if (b.kind === "reach") add(`zasięg %${target(b.to)}`, b.pct * 100);
    else if (b.kind === "status") add(`${STATUS_INFO[b.status as StatusId]?.name ?? b.status} %`, b.pct * 100);
  }
  return m;
}

/** The kind of thing an item is: "Pierś · Lamelka", "Broń · Glewia", with its tier. */
export function itemKind(it: Item): string {
  const b = ITEM_BASES[it.base];
  if (!b) return "";
  const slot = b.slot === "ring" ? "Pierścień" : SLOT_NAMES[b.slot as keyof typeof SLOT_NAMES] ?? b.slot;
  const what = b.weapon ? WEAPONS[b.weapon].name : "";
  return `${slot}${what ? ` · ${what}` : ""} · ${["", "zwykła robota", "dobra robota", "mistrzowska robota"][b.tier]}`;
}

/**
 * The tooltip of an item: name in its rarity's colour, what it is, its base bonuses, its affixes, a
 * line of story, and (when given) how it compares to what's worn in that slot now.
 */
export function itemTooltip(it: Item, worn?: Item | null, hint?: string): string {
  const b = ITEM_BASES[it.base];
  if (!b) return "";
  const r = RARITY[it.rarity];
  const lines = [
    `<div class="it-name" style="color:${r.color}">${escapeHtml(b.name)}</div>`,
    `<div class="it-kind">${escapeHtml(r.name)} · ${escapeHtml(itemKind(it))} · poz. ${it.level}</div>`,
  ];
  if (b.base.length) lines.push(`<div class="it-base">${b.base.map((x) => escapeHtml(bonusText(x))).join("<br>")}</div>`);
  if (it.affixes.length) lines.push(`<div class="it-aff">${it.affixes.map(([id, v]) => escapeHtml(affixText(id, v))).join("<br>")}</div>`);
  if (b.flavour) lines.push(`<div class="it-flav">${escapeHtml(b.flavour)}</div>`);
  if (b.slot === "relic") lines.push(`<div class="it-curse">Relikwia: moc ma swoją cenę.</div>`);
  if (worn && worn.uid !== it.uid) {
    const a = totals(itemBonuses(it));
    const w = totals(itemBonuses(worn));
    const keys = new Set([...a.keys(), ...w.keys()]);
    const diff = [...keys]
      .map((k) => [k, (a.get(k) ?? 0) - (w.get(k) ?? 0)] as const)
      .filter(([, d]) => Math.abs(d) >= 0.5)
      .map(([k, d]) => `<span class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(Math.round(d))} ${escapeHtml(k)}</span>`);
    lines.push(`<div class="it-cmp"><div class="muted">Zamiast: ${escapeHtml(ITEM_BASES[worn.base]?.name ?? "")}</div>${diff.join("<br>") || '<span class="muted">bez różnicy w liczbach</span>'}</div>`);
  }
  if (hint) lines.push(`<div class="it-hint">${escapeHtml(hint)}</div>`);
  return lines.join("");
}
