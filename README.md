<p align="center"><img src="build/icon.png" width="96" alt="Layr icon"></p>

<h1 align="center">Layr</h1>

<p align="center">Annotate, draw and take notes on PDFs.<br>Desktop app for <b>Windows</b> and <b>Linux</b>.</p>

<p align="center"><a href="https://github.com/fxwfcvwqny-source/Layr/releases/latest"><b>⬇ Download the latest version</b></a></p>

![Layr with a network diagram and the notes panel](docs/screenshot.png)

## Features

- **Write on any PDF** – text boxes with 16 fonts (Arial, Times New Roman, Calibri, Roboto, handwriting …), bold, underline, colours, bullet and numbered lists
- **Pen and highlighter with shape recognition** – draw freehand, hold at the end and the stroke snaps into a straight line, circle, rectangle or triangle
- **Lasso and multi-select** – move, scale, recolour, duplicate or delete several items at once
- **Org charts** – ready-made templates (line, line-and-staff, divisional, matrix, IT department, project …) plus single building blocks; remove boxes you don't need and their lines go with them
- **Big symbol library** – general shapes, UML, flowcharts (PAP), Nassi-Shneiderman, ER models, 40+ network symbols, topologies and IT-security symbols
- **Notes and to-dos per document** – a notes panel with checkable tasks, stored *inside* the PDF
- **Stays editable** – save over the original file; reopen it in Layr and every annotation can still be moved or removed
- **Pages and documents** – add blank, lined, grid or dotted pages, merge several PDFs
- **Make it yours** – light and dark themes, accent colours, desk and sheet colours, toolbar styles, notification styles, animations on or off

**Deutsch & English** – choose the language in the Windows installer or on first start, and switch any time under *Personalize*.

## Installation

Download the file for your system from the [latest release](https://github.com/fxwfcvwqny-source/Layr/releases/latest).

| System | File | How to install |
|---|---|---|
| Windows 10/11 | `Layr-Setup-<version>.exe` | Run it, pick Deutsch or English and follow the setup. No admin rights needed. |
| Ubuntu / Debian | `Layr-<version>-amd64.deb` | Double-click, or `sudo apt install ./Layr-<version>-amd64.deb` |
| Any Linux | `Layr-<version>-x86_64.AppImage` | Make it executable (`chmod +x`) and double-click. Nothing gets installed. |

**Windows SmartScreen:** the installer is not code-signed, so Windows may show *"Windows protected your PC"* the first time. Click **More info → Run anyway**.

**Updates:** Layr checks this page for a newer version (can be turned off under *Personalize → Layr & updates*) and shows a download button when one is available.

## Privacy

- Your PDFs, notes and settings stay on your computer. Layr has no account, no telemetry and no tracking.
- The only network request is the optional update check, which asks the public GitHub API for the latest version number.
- Crash reports are only written locally to Layr's own settings folder and are never uploaded.

## Building from source

Requires [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npx electron-builder --win     # Windows installer (on Linux this needs Wine)
npx electron-builder --linux   # AppImage
```

Official downloads are built by GitHub Actions directly from this repository ([`.github/workflows/release.yml`](.github/workflows/release.yml)), so every installer matches the code you see here.

The app itself is plain HTML/JavaScript in [`app/web/index.html`](app/web/index.html); [`app/main.js`](app/main.js) is the Electron main process.

## License

Copyright © 2026 Layr. All rights reserved.
Bundled third-party components keep their own licenses, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
