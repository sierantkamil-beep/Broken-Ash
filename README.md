# Broken Ash

A two-player online co-op dark-fantasy action RPG in a fallen elven realm, made as a **Windows desktop
game**. One of you hosts (*Hostuj grę*), the other joins by IP (*Dołącz*). All in-game text is in
Polish. For adults: violence, blood, swearing.

Design: [docs/design.md](docs/design.md) · Progress: [docs/history.md](docs/history.md) ·
Code map: [docs/catalogue.md](docs/catalogue.md) · Developer guide: [CLAUDE.md](CLAUDE.md)

## Get the game

Every push to `main` builds the Windows app on GitHub: open the **Actions** tab, pick the newest
*Windows build* run, and download **BrokenAsh-windows** from *Artifacts*. Inside are
`BrokenAsh-<version>-setup.exe` (installer, recommended) and a portable `.exe`. Both of you need it.

To build it yourself on Windows: install [Node.js 22+](https://nodejs.org), run `corepack enable`,
then `pnpm install` and `pnpm dist:win`. The files appear in `desktop/release/`.

## Play

1. The host clicks **Hostuj grę**. The app starts the server and shows the addresses the partner can
   use (same Wi-Fi, Tailscale, or the internet when the router allows it).
2. The partner types one of them and clicks **Dołącz**.

Controls: WASD to move, mouse to aim, left/right mouse button and 1–4 for skills, Space to roll,
F to finish off a staggered enemy or pick up your partner, Esc to skip a cinematic (both of you must
press it) or open the menu.

## Develop

```
pnpm install
pnpm dev        # the desktop app with hot reload (server + client + Electron window)
pnpm test
pnpm typecheck
pnpm e2e        # two real Electron windows host and join, then fight (Linux: xvfb-run -a pnpm e2e)
```
