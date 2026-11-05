import { PATHS, PATH_IDS, PEOPLES, type PathId } from "@broken-ash/shared";
import { saveSettings, settings } from "../settings";
import { $, el } from "./dom";

const TYPE = { melee: "wręcz", magic: "magia", ranged: "dystans" };

/** Character creation on the title screen: body, people of origin, path. */
export function setupCreator(onHover: () => void) {
  const body = $<HTMLSelectElement>("body");
  const people = $<HTMLSelectElement>("people");
  for (const p of PEOPLES) people.append(new Option(p.name, p.id));
  body.value = settings.body;
  people.value = settings.people || PATHS[settings.path as PathId]?.people || "thorn";
  body.addEventListener("change", () => saveSettings({ body: body.value as "male" | "female" }));
  people.addEventListener("change", () => saveSettings({ people: people.value }));

  const box = $("paths");
  const info = $("path-info");
  const render = () => {
    const p = PATHS[settings.path as PathId] ?? PATHS.thorn;
    info.innerHTML = "";
    const b = el("b", undefined, `${p.name} — ${TYPE[p.type]}. `);
    info.append(b, `${p.blurb} `, el("br"), el("i", undefined, `${p.sustain} ${p.combo}`));
    for (const btn of box.querySelectorAll("button")) btn.classList.toggle("on", btn.dataset.path === p.id);
  };
  for (const id of PATH_IDS) {
    const p = PATHS[id];
    const btn = el("button");
    btn.dataset.path = id;
    btn.append(p.name.replace("Ścieżka ", ""), el("small", undefined, TYPE[p.type]));
    btn.addEventListener("click", () => {
      onHover();
      // Changing path suggests its home people (any people can walk any path).
      const wasDefault = people.value === PATHS[settings.path as PathId]?.people;
      saveSettings({ path: id });
      if (wasDefault) {
        people.value = p.people;
        saveSettings({ people: p.people });
      }
      render();
    });
    box.append(btn);
  }
  render();
}
