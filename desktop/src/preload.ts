import { contextBridge, ipcRenderer } from "electron";

// Keep this surface tiny: the game page can only ask the app to start hosting.
contextBridge.exposeInMainWorld("brokenAsh", {
  startHost: () => ipcRenderer.invoke("host:start"),
});
