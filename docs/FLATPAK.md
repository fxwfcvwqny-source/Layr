# Layr als Flatpak

Status: vorbereitet, noch nicht gebaut und nicht bei Flathub eingereicht.

## Was vorbereitet ist

- `packaging/flatpak/io.github.fxwfcvwqny_source.Layr.yml`: Manifest. Baut nicht aus dem Quellcode, sondern übernimmt das released `.deb` (`Layr-3.8.8-amd64.deb`) und legt es nach `/app/layr`.
- `packaging/flatpak/io.github.fxwfcvwqny_source.Layr.metainfo.xml`: AppStream-Datei (DE/EN).
- `packaging/flatpak/layr.sh`: Startskript (setzt `TMPDIR` und startet über `zypak-wrapper`).
- Die App erkennt Flatpak (`/.flatpak-info`) und verhält sich wie die Store-Version: keine eigene Update-Prüfung. Updates kommen über Flathub.

Entscheidungen des Eigentümers: `--filesystem=home`, nur `--socket=x11` (die App erzwingt X11), keine Einstellungs-Migration, Verpackung des eigenen veröffentlichten `.deb`.

Alle Pfade und Namen, die noch nicht geprüft sind, sind im Manifest mit `# (prüfen)` markiert.

## Begründung der Berechtigungen (für den Flathub-PR)

- `--filesystem=home`: Layr speichert eine geänderte PDF neben dem Original (Umbenennen, Speichern) und öffnet zuletzt benutzte Dateien erneut. PDFs können überall im Home-Verzeichnis liegen.
- `--socket=x11`: Die App erzwingt X11 (`app/main.js`, `ozone-platform=x11`), auch unter Wayland über XWayland.
- `--share=network`: Nur zwei Vorgänge, die der Nutzer auslöst: Download des Spracherkennungsmodells (Diktat) und Update-Download in der GitHub-Version. Die Flatpak-Version prüft nicht selbst auf Updates.
- `--socket=pulseaudio`: Mikrofon für das Diktat.
- `--device=dri`: Hardware-Darstellung.
- `--share=ipc`: Standard für Electron-Apps.

## Lokal testen

Voraussetzung: `flatpak`, `flatpak-builder`, `flatpak-builder-lint`.

```sh
cd /home/user/layr/packaging/flatpak
flatpak-builder --user --install --install-deps-from=flathub --force-clean build-dir io.github.fxwfcvwqny_source.Layr.yml
flatpak run io.github.fxwfcvwqny_source.Layr
flatpak-builder-lint manifest io.github.fxwfcvwqny_source.Layr.yml
flatpak-builder --repo=repo --force-clean build-dir io.github.fxwfcvwqny_source.Layr.yml
flatpak-builder-lint repo repo
```

Den SHA-256-Wert des `.deb` vorher eintragen: `sha256sum Layr-3.8.8-amd64.deb`.

## Manuelle Tests vor dem Einreichen

- [ ] Start unter X11 und unter Wayland (XWayland), Fenster und Symbolleiste sichtbar.
- [ ] Datei über „Öffnen mit“ (Dateimanager) öffnen; Dateiauswahl über das Portal.
- [ ] Speichern über das Portal-Dialog, Speichern neben dem Original.
- [ ] Diktat: Mikrofon, Modell laden, Text erscheint.
- [ ] Wörterbuch: Rechtschreibprüfung und Wörterbuch-Eintrag.
- [ ] Updater-Hinweis zeigt „Flathub“, keine Update-Suche.
- [ ] Netzwerk ruhig: ohne Benutzeraktion keine Verbindung nach außen.
- [ ] Desktop-Eintrag und Icon erscheinen; `layr %U` öffnet PDFs.

## Einreichen bei Flathub

1. Fork von https://github.com/flathub/flathub anlegen.
2. Branch `new-pr` mit dem Manifest und den Dateien aus `packaging/flatpak/` erstellen. Das Manifest als `io.github.fxwfcvwqny_source.Layr.yml` im Repo ablegen.
3. Pull Request gegen `new-pr` öffnen. Die Berechtigungen oben in die Beschreibung schreiben.
4. Auf den Bot warten und `bot, build` kommentieren.
5. App-ID-Prüfung: Die App-ID `io.github.fxwfcvwqny_source` gehört zum GitHub-Konto `fxwfcvwqny-source` (Bindestriche werden zu Unterstrichen). Flathub prüft das bei `io.github.*`-IDs (prüfen).

## Offen

- Der v3.8.8-Release ist noch ein Entwurf. Die URL im Manifest funktioniert erst, wenn du ihn veröffentlichst. Der veröffentlichte `.deb` muss byte-gleich zum geprüften Entwurf sein (SHA-256 `308f17b8…6541`); baust du neu, trage den neuen Wert ein.
- `sha256` im Manifest ist eingetragen (aus dem Entwurf `v3.8.8` berechnet). Das `.deb` enthält nur ein 512-px-Symbol, deshalb installiert das Manifest nur dieses. Flathub verlangt mindestens 128 px (prüfen).
- Laufzeit-Version (`25.08`) und Electron-BaseApp-Version sind nicht geprüft.
- Pfade im `.deb` (`opt/Layr`, `usr/share/applications/layr.desktop`, Icons) sind nicht geprüft.
- Screenshot-URL zeigt auf den Tag `v3.8.8`, der noch nicht existiert.
- Die Metainfo-Release-Notizen gelten für 3.8.8 mit Datum 2026-10-24.
