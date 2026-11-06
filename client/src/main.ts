import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/shippori-mincho/latin-500.css";
import "@fontsource/shippori-mincho/latin-600.css";
import "./style.css";
import Phaser from "phaser";
import { ALL_SKILLS } from "./net/loadout";
import { desktop, type HostReport } from "./desktop";
import { joinWorld } from "./net";
import { BootScene } from "./scenes/BootScene";
import { WorldScene } from "./scenes/WorldScene";
import { saveSettings, settings } from "./settings";
import { $ } from "./ui/dom";
import { setupCreator } from "./ui/Creator";
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
  if (q.get("path")) saveSettings({ path: q.get("path")!, body: (q.get("body") as "male" | "female") ?? settings.body });
  if (q.get("name")) nameInput.value = q.get("name")!;
  // The effects gallery (tools/e2e/gallery.cjs) needs every skill's shape.
  if (q.toString()) (window as unknown as { __skills?: unknown }).__skills = [...ALL_SKILLS.values()];
  if (q.get("autohost")) $("host-btn").click();
  else if (q.get("autojoin")) void connect(q.get("address") ?? "localhost", q.get("name") ?? "Tester");
});

// ------------------------------------------------------------------ menu

setupCreator(() => world?.audio.play("ui_click", 0.4));
const nameInput = $<HTMLInputElement>("name");
const addressInput = $<HTMLInputElement>("address");
nameInput.value = settings.name;
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

async function connect(address: string, name: string) {
  $("error").hidden = true;
  const btn = $<HTMLButtonElement>("connect-btn");
  btn.disabled = true;
  try {
    const room = await joinWorld(address, { name, path: settings.path, body: settings.body, people: settings.people });
    saveSettings({ name, address: address === "localhost" || address.startsWith("localhost:") ? settings.address : address });
    world?.audio.play("ui_confirm", 0.6);
    $("menu").hidden = true;
    inGame = true;
    world?.join(room);
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
  void connect(address, nameInput.value);
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
      await connect(`localhost:${hostReport.port}`, nameInput.value);
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

function setPause(open: boolean) {
  $("pause").hidden = !open;
  world?.setPaused(open);
  if (open) $("host-info").replaceChildren(...(hostReport ? [renderHostLines(hostReport, true)] : []));
}
game.events.on("escape", () => {
  if (inGame) setPause($("pause").hidden);
});
$("resume").addEventListener("click", () => {
  click();
  setPause(false);
});
$("leave").addEventListener("click", () => location.reload());

(window as unknown as { __game?: () => Phaser.Game }).__game = () => game;
