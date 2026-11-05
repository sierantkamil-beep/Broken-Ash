import { app, BrowserWindow, ipcMain, net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_PORT } from "@broken-ash/shared";
import { startServer, type RunningServer } from "@broken-ash/server";
import { localAddresses, PortOpener, type HostReport } from "./network";

let server: RunningServer | null = null;
let opener: PortOpener | null = null;
let report: HostReport | null = null;

// A fixed name keeps saves in %APPDATA%/Broken Ash no matter how the app was launched.
app.setName("Broken Ash");
// Groups the taskbar button and notifications under our own app id instead of "Electron".
if (process.platform === "win32") app.setAppUserModelId("com.brokenash.game");

// Laptops with an RTX GPU often default browsers to the integrated chip; ask for the fast one.
app.commandLine.appendSwitch("force_high_performance_gpu");

// Serve the game from a custom scheme instead of file:// so fetch, module scripts and the asset
// loader behave exactly like on a web server.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const clientDir = app.isPackaged ? path.join(process.resourcesPath, "client") : path.join(__dirname, "../../client/dist");

ipcMain.handle("host:start", async () => {
  const port = Number(process.env.ASH_PORT) || DEFAULT_PORT;
  // In `pnpm dev` a separate hot-reloading server is already running; don't start a second one.
  if (!server && process.env.ASH_EXTERNAL_SERVER !== "1") {
    // Saves arrive with persistence (B2); they will live in %APPDATA%/Broken Ash on the host.
    server = await startServer({ port });
    console.log(`[broken-ash] hosting on port ${port}`);
  }
  // Ask the router to forward the port (UPnP) and work out which addresses the partner can use.
  if (!report) {
    opener = new PortOpener(port);
    report = await opener.open().catch(() => ({ port, ...localAddresses(), upnp: "none" as const, pinhole: false, cgnat: false }));
    console.log("[broken-ash] network", JSON.stringify(report));
  }
  return report;
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    title: "Broken Ash",
    icon: path.join(clientDir, "favicon.png"),
    backgroundColor: "#0c0a08",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ASH_DEV_URL points at the Vite dev server for hot reload during development.
  const devUrl = process.env.ASH_DEV_URL;
  const target = devUrl ?? "app://game/index.html";
  void win.loadURL(target);
  if (devUrl) {
    // Vite may still be starting when Electron opens; keep retrying until it answers.
    win.webContents.on("did-fail-load", () => setTimeout(() => void win.loadURL(target), 700));
  }
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type === "keyDown" && input.key === "F11") win.setFullScreen(!win.isFullScreen());
    if (input.type === "keyDown" && input.key === "F12" && input.control) win.webContents.toggleDevTools();
  });
}

app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.normalize(path.join(clientDir, rel));
    // Never serve anything outside the game folder.
    if (!file.startsWith(clientDir)) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});

app.on("window-all-closed", async () => {
  // Close the router port again so it isn't left open after we stop hosting.
  await opener?.close().catch(() => {});
  await server?.stop().catch(() => {});
  app.quit();
});
