<div align="center">

<img src="build/icon.png" width="96" alt="Tomodachi Player icon" />

# Tomodachi Player

**Read manga and watch anime, series and movies in one desktop app.**

[![Download](https://img.shields.io/github/v/release/CaioDoc/Tomodachi_Player?include_prereleases&label=download&color=ec4899)](https://github.com/CaioDoc/Tomodachi_Player/releases/latest)
![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue)
![Status](https://img.shields.io/badge/status-beta-orange)
[![License](https://img.shields.io/github/license/CaioDoc/Tomodachi_Player)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-support-ff5e5b?logo=kofi&logoColor=white)](https://ko-fi.com/tomodachiplayer)

English · [Português](README.pt-BR.md)

</div>

---

> [!NOTE]
> **Tomodachi Player is in beta.** Things may still break here and there, and we ship improvements **every week**. If something goes wrong, please [open an issue](https://github.com/CaioDoc/Tomodachi_Player/issues). It helps a lot.

## What it is

Tomodachi Player brings the experience of [Mihon](https://mihon.app) (manga) and [Aniyomi](https://aniyomi.org) (anime) to the Windows desktop, in one app.

- **One library** for everything you read and watch.
- **One "Watch" button** that searches all your sources at once: Aniyomi-style extensions, Nuvio plugins and Stremio addons.
- **Resume where you left off**, both in the reader and in the player.

The app does not host or ship any content. You choose which sources to add.

## Download

**[⬇ Download the latest version](https://github.com/CaioDoc/Tomodachi_Player/releases/latest)**

On the release page, under **Assets**, pick one of these:

| File | What it is |
| --- | --- |
| `Tomodachi-Player-Setup-x.y.z.exe` | **Installer** (recommended). Creates Start Menu and desktop shortcuts. |
| `Tomodachi-Player-Portable-x.y.z.exe` | **Portable** version. A single file, no installation needed. |

Every executable is built automatically by GitHub Actions straight from this repository's source code. It is a clean build, with no personal data and nothing added.

> [!IMPORTANT]
> The app is not code-signed yet, so Windows may show a **"Windows protected your PC"** (SmartScreen) warning. To continue, click **More info → Run anyway**.

**Requirements:** Windows 10 or 11 (64-bit).

## Features

**Manga & Comics**
- Library with categories, filters, unread counters and update checks.
- Reader with webtoon (continuous), single page and double page modes.
- **Continue reading** reopens the exact page where you stopped.
- Sources: MangaDex, Mihon/Tachiyomi extensions (through [Suwayomi](https://github.com/Suwayomi/Suwayomi-Server)), Komga, and local folders or archives.

**Anime & Videos**
- **Discover** tab with Anime, Series and Movies catalogs, plus search.
- Full-screen title pages with seasons and episodes.
- **Where to watch** gathers links from all your sources in a single list.
- **Sources:** paste any link and the app figures out the type by itself.
  - Aniyomi extensions (`index.min.json`)
  - Nuvio plugins (`manifest.json`)
  - Stremio addons (`manifest.json` or `stremio://`)
- **Browse** the catalog of any plugin or addon you install.
- **Continue watching** resumes the same episode, from the same source, at the same second.
- Player with subtitles (embedded or external), audio tracks and HLS. Torrent links play directly inside the app.
- Local video library.

**General**
- Tabs, so you can keep several titles, readers and players open at once. Drag them to reorder (or press Ctrl+Shift+PageUp/PageDown).
- Favorite several titles at once: tap the heart on each cover, then click **Favorite** in the bar that appears.
- Built-in browser with an ad blocker.
- AniList sync.
- **Incognito mode:** watch and read without saving history or progress (button next to Donate).
- **Fast:** HLS plays straight in the player (hls.js), the next episode is prepared while you watch, and H.264 MKV files are just remuxed.
- **Pick sites in "Where to watch":** turn extensions on/off; your choice and the title found are remembered for the next episodes.
- **Everything plays inside the app:** the player finds the video on the episode page by itself; if a source fails, it offers others.
- **Search your sources:** only what your extensions, add-ons and plugins have shows up, from the closest match to the loosest.
- **MyAnimeList in search:** results get MyAnimeList scores and titles, no key needed (you can use the official API with your own Client ID in Settings → Accounts).
- **Smart search:** combine words and tags with commas (e.g. `Seinen, Monster`). It works in your library and in Discover, where genres and AniList tags become filters.
- **You might also like:** every title page shows sequels, prequels, spin-offs and similar titles, and its tags are clickable to find more like it.
- Import and export library backups compatible with Mihon and Aniyomi (`.tachibk`), so you can bring your phone library over.
- Themes.
- **Automatic updates:** the installed app downloads new versions in the background and installs them when you close it (you can turn this off in Settings → System).
- Interface in **English, Português (Brasil) and Español**.

## Roadmap

The project is moving fast. Next up:

- More polish and fixes every week, driven by your feedback.

## Support the project

Tomodachi Player is free and always will be. If it makes your day better, you can help keep it alive (and keep the coffee coming):

**[☕ Support us on Ko-fi](https://ko-fi.com/tomodachiplayer)**

You can also donate from inside the app: there is a **Donate** button at the top of each section and in Settings.

## Feedback and bug reports

Found a bug or have an idea? [Open an issue](https://github.com/CaioDoc/Tomodachi_Player/issues/new/choose). If you can, include:
- what you did;
- what you expected;
- what happened instead (a screenshot helps a lot).

## Building from source

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/CaioDoc/Tomodachi_Player.git
cd Tomodachi_Player
npm install

npm run dev            # development mode
npm run dist           # Windows installer (in release/)
npm run dist:portable  # portable .exe (in release/)
```

Built with Electron, React, TypeScript, Vite and Tailwind CSS.

## Disclaimer

Tomodachi Player is a player and reader. It is **not affiliated** with any content provider, and it does not host, store or distribute any content. Extensions, plugins and addons are made by third parties and are added by the user. You are responsible for how you use them and for respecting the laws of your country.

## License

[MIT](LICENSE) © CaioDoc
