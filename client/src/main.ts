import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/shippori-mincho/latin-500.css";
import "@fontsource/shippori-mincho/latin-600.css";
// Polish letters (ł, ś, ż, ę, ą) live in latin-ext; without it headings fell back to another face.
import "@fontsource/shippori-mincho/latin-ext-500.css";
import "@fontsource/shippori-mincho/latin-ext-600.css";
import "./style.css";
import { skillIcon } from "./ui/pixelIcons";
import { ACCENTS } from "./fx/accents";
import Phaser from "phaser";
import { ALL_SKILLS } from "./net/loadout";
import { PATHS, type PathId } from "@broken-ash/shared";
import { desktop, type HostReport } from "./desktop";
import { joinWorld } from "./net";
import { BootScene } from "./scenes/BootScene";
import { WorldScene } from "./scenes/WorldScene";
import { saveSettings, settings } from "./settings";
import { $ } from "./ui/dom";
import { Menu } from "./ui/menu/Menu";
import { Mastery } from "./ui/Mastery";
import { Book, type Tab } from "./ui/Book";
import { renderHostLines } from "./ui/hostReport";

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: "game",
  backgroundColor: "#050406",
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true, roundPixels: false, powerPreference: "high-performance" },
  scene: [BootScene, WorldScene],
});

let world: WorldScene | null = null;
let hostReport: HostReport | undefined;
let inGame = false;
game.events.on("world-ready", (scene: WorldScene) => {
  world = scene;
  // Automated checks (tools/e2e): the desktop shell passes ?autohost=1 or ?autojoin=1&address=…
  const q = new URLSearchParams(location.search);
  if (q.get("path") && q.get("path")! in PATHS) menu.quickCharacter(q.get("path") as PathId, q.get("body") === "male" ? "male" : "female", q.get("name") ?? "Tester");
  // The effects gallery (tools/e2e/gallery.cjs) needs every skill's shape.
  if (q.toString()) {
    (window as unknown as { __skills?: unknown }).__skills = [...ALL_SKILLS.values()];
    // For the icon sheet check (tools/e2e/icons.cjs).
    (window as unknown as { __skillIcon?: unknown }).__skillIcon = skillIcon;
    (window as unknown as { __accents?: unknown }).__accents = ACCENTS;
  }
  if (q.get("autohost")) $("host-btn").click();
  else if (q.get("autojoin")) void connect(q.get("address") ?? "localhost");
});

// ------------------------------------------------------------------ menu

const menu = new Menu({
  sound: (key, volume = 0.5) => world?.audio.play(key, volume),
  settings: () => openSettings(),
  quit: () => window.close(),
  ready: () => menu.go("lobby"),
});
const addressInput = $<HTMLInputElement>("address");
addressInput.value = settings.address;

function showError(msg: string) {
  const e = $("error");
  e.textContent = msg;
  e.hidden = false;
}

function click() {
  world?.audio.play("ui_click", 0.5);
}

for (const b of document.querySelectorAll("button")) b.addEventListener("mouseenter", () => world?.audio.play("ui_hover", 0.25));

async function connect(address: string) {
  $("error").hidden = true;
  const btn = $<HTMLButtonElement>("connect-btn");
  btn.disabled = true;
  const c = menu.character;
  try {
    const room = await joinWorld(address, { name: c.name, path: c.path, body: c.body, people: c.people, weapon: c.weapon, look: c.look });
    saveSettings({ name: c.name, address: address === "localhost" || address.startsWith("localhost:") ? settings.address : address });
    world?.audio.play("ui_confirm", 0.6);
    $("menu").hidden = true;
    inGame = true;
    world?.join(room);
    mastery = new Mastery(room, (k, v) => world?.audio.play(k, v));
    book = new Book(room, mastery, (k, v) => world?.audio.play(k, v));
    room.onLeave((code) => {
      if (code !== 1000) {
        alert("Połączenie z grą zostało przerwane.");
        location.reload();
      }
    });
    (window as unknown as { __room?: unknown }).__room = room;
  } catch (e) {
    showError(`Nie udało się połączyć z ${address}. ${e instanceof Error && e.message ? `(${e.message})` : ""}`);
  } finally {
    btn.disabled = false;
  }
}

$("connect-btn").addEventListener("click", () => {
  click();
  const address = addressInput.value.trim();
  if (!address) return showError("Wpisz adres IP partnera.");
  void connect(address);
});
addressInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("connect-btn").click();
});

if (desktop) {
  $("host-btn").hidden = false;
  $("host-divider").hidden = false;
  $("host-btn").addEventListener("click", async () => {
    click();
    const btn = $<HTMLButtonElement>("host-btn");
    btn.disabled = true;
    btn.textContent = "Uruchamianie serwera…";
    try {
      hostReport = await desktop!.startHost();
      $("host-report-box").replaceChildren(renderHostLines(hostReport));
      await connect(`localhost:${hostReport.port}`);
    } catch (e) {
      showError(`Nie udało się uruchomić serwera: ${e instanceof Error ? e.message : e}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Hostuj grę na tym komputerze";
    }
  });
}

// ------------------------------------------------------------------ pause menu

const sliders = ["master", "music", "ambience", "sfx"] as const;
for (const k of sliders) {
  const input = $<HTMLInputElement>(`vol-${k}`);
  input.value = String(settings[k]);
  input.addEventListener("input", () => saveSettings({ [k]: Number(input.value) }));
}
const gore = $<HTMLSelectElement>("gore");
gore.value = settings.gore;
gore.addEventListener("change", () => saveSettings({ gore: gore.value as "full" | "reduced" }));
const raids = $<HTMLSelectElement>("raids");
raids.value = settings.raids;
raids.addEventListener("change", () => saveSettings({ raids: raids.value as "on" | "off" }));

let mastery: Mastery | null = null;
let book: Book | null = null;

/** The settings panel from the title screen (the same panel as the in-game pause menu). */
function openSettings() {
  $("pause").hidden = false;
  $("resume").hidden = true;
  $("leave").hidden = true;
  $("settings-back").hidden = false;
}
$("settings-back").addEventListener("click", () => {
  click();
  $("pause").hidden = true;
  $("resume").hidden = false;
  $("leave").hidden = false;
  $("settings-back").hidden = true;
});

function setPause(open: boolean) {
  if (open) {
    mastery?.close();
    book?.close();
  }
  $("pause").hidden = !open;
  world?.setPaused(open);
  if (open) $("host-info").replaceChildren(...(hostReport ? [renderHostLines(hostReport, true)] : []));
}
game.events.on("escape", () => {
  if (!inGame) return;
  if (mastery?.isOpen) return mastery.close();
  if (book?.isOpen) return book.close();
  setPause($("pause").hidden);
});
game.events.on("book", (tab: Tab) => {
  if (inGame && $("pause").hidden) book?.toggle(tab);
});
$("resume").addEventListener("click", () => {
  click();
  setPause(false);
});
$("leave").addEventListener("click", () => location.reload());

(window as unknown as { __game?: () => Phaser.Game }).__game = () => game;
