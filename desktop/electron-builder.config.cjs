// electron-builder config (was the "build" key in package.json).
// Windows flags exes with stock Electron metadata and no icon as suspicious, so the exe gets our
// own icon, product name, description, company and copyright. Editing exe resources needs rcedit,
// which only runs natively on Windows: CI (windows-latest) does it; a Linux build skips it.
// The remaining SmartScreen "unknown publisher" prompt only goes away with code signing (see README).
const onWindows = process.platform === "win32";
// Putting an icon into the installer also needs Windows tools (wine elsewhere), so a Linux
// build looks for build resources in a folder that doesn't exist and ships without them.
const resources = onWindows ? "build" : "build-linux-none";

module.exports = {
  appId: "com.brokenash.game",
  productName: "Broken Ash",
  copyright: "© 2026 Kamil Sierant",
  directories: { output: "release", buildResources: resources },
  files: ["dist/**", "package.json"],
  extraResources: [{ from: "../client/dist", to: "client" }],
  npmRebuild: false,
  win: {
    // The NSIS installer needs wine off Windows; a Linux build makes only the portable exe.
    target: onWindows ? ["nsis", "portable"] : ["portable"],
    icon: onWindows ? "build/icon.png" : undefined,
    signAndEditExecutable: onWindows,
    legalTrademarks: "Broken Ash",
    requestedExecutionLevel: "asInvoker",
  },
  portable: { artifactName: "BrokenAsh-${version}-portable.exe" },
  nsis: {
    artifactName: "BrokenAsh-${version}-setup.exe",
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "Broken Ash",
    uninstallDisplayName: "Broken Ash",
  },
  linux: { executableName: "broken-ash", target: ["AppImage"], icon: "build/icon.png", category: "Game" },
};
