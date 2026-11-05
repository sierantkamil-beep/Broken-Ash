# Broken Ash

A two-player online co-op dark-fantasy action RPG in a fallen elven realm. One of you hosts
(*Hostuj grę*), the other joins by IP (*Dołącz*). All in-game text is in Polish. For adults: violence,
blood, swearing.

Design: [docs/design.md](docs/design.md) · Progress: [docs/history.md](docs/history.md) ·
Developer guide: [CLAUDE.md](CLAUDE.md)

## Run it (development)

Needs Node 22+ and pnpm (`corepack enable`).

```
pnpm install
pnpm dev:web
```

Open http://localhost:5173 in two browser windows, type a name, enter `localhost` as the address and
click *Dołącz* in both. Controls: WASD to move, Space to roll, Esc to skip a cinematic (both of you
must press it) or open the menu.

`pnpm dev` does the same with the desktop window, where *Hostuj grę* starts the server for you.

## Windows app

`pnpm dist:win` builds `desktop/release/BrokenAsh-<version>-portable.exe` and an installer. Pushing to
`main` builds both on GitHub Actions (Actions tab → *Windows build* → Artifacts).
