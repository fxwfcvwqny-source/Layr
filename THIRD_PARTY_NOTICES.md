# Third-party notices

Layr bundles the following open-source components. Their full license texts are in the [`licenses/`](licenses) folder.

| Component | Used for | License |
|---|---|---|
| [PDF.js](https://github.com/mozilla/pdf.js) 3.11.174 (Mozilla Foundation) | Rendering PDF pages (`app/web/pdf.min.js`, `app/web/pdf.worker.min.js`) | Apache License 2.0 – [`licenses/pdf.js-Apache-2.0.txt`](licenses/pdf.js-Apache-2.0.txt) |
| [pdf-lib](https://github.com/Hopding/pdf-lib) (Andrew Dillon) | Writing annotations, notes and pages into PDFs (`app/web/pdf-lib.min.js`) | MIT – [`licenses/pdf-lib-MIT.txt`](licenses/pdf-lib-MIT.txt) |
| [IBM Plex Sans](https://github.com/IBM/plex) (IBM Corp.) | User interface font | SIL Open Font License 1.1 – [`licenses/IBM-Plex-Sans-OFL-1.1.txt`](licenses/IBM-Plex-Sans-OFL-1.1.txt) |
| [IBM Plex Mono](https://github.com/IBM/plex) (IBM Corp.) | Numbers and measurements | SIL Open Font License 1.1 – [`licenses/IBM-Plex-Mono-OFL-1.1.txt`](licenses/IBM-Plex-Mono-OFL-1.1.txt) |
| [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) (The Bricolage Grotesque Project Authors) | Logo wordmark | SIL Open Font License 1.1 – [`licenses/Bricolage-Grotesque-OFL-1.1.txt`](licenses/Bricolage-Grotesque-OFL-1.1.txt) |
| Arimo, Tinos, Cousine (The Arimo/Tinos/Cousine Project Authors) | Metric-compatible stand-ins for Arial, Times New Roman and Courier New | SIL Open Font License 1.1 – `licenses/Arimo-…`, `licenses/Tinos-…`, `licenses/Cousine-OFL-1.1.txt` |
| Carlito, Caladea, Gelasio (The Carlito/Caladea/Gelasio Project Authors) | Metric-compatible stand-ins for Calibri, Cambria and Georgia | SIL Open Font License 1.1 – `licenses/Carlito-…`, `licenses/Caladea-…`, `licenses/Gelasio-OFL-1.1.txt` |
| Roboto, Open Sans, Lato, Montserrat, Merriweather | Text box fonts | SIL Open Font License 1.1 – files in [`licenses/`](licenses) |
| Caveat, Comic Neue | Handwriting fonts (Comic Neue stands in for Comic Sans MS) | SIL Open Font License 1.1 – files in [`licenses/`](licenses) |
| [Electron](https://www.electronjs.org/) | Desktop runtime (included in the installers, not in this repository) | MIT; Chromium components under their own licenses (`LICENSE.electron.txt` and `LICENSES.chromium.html` ship with every install) |

The font names Arial, Times New Roman, Courier New, Calibri, Cambria, Georgia, Verdana and Comic Sans MS are only used to pick the matching installed system font. Those fonts are not included; when they are missing, Layr uses the open stand-ins listed above.
