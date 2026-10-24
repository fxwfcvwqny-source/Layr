# Datenschutz / Privacy – Layr

Stand: Oktober 2026 · English version below.

## Deutsch

Layr ist eine Desktop-App für PDF-Dateien. Layr hat kein Konto, keine Telemetrie und keine Werbung. Layr sendet keine Nutzungsdaten.

- **Auf deinem Gerät:** Geöffnete PDFs, Notizen, Einstellungen, Unterschriften, dein eigenes Wörterbuch und die Liste „Zuletzt geöffnet“ bleiben auf deinem Gerät.
- **Automatisch gespeichert:** Neue und zusammengeführte Dokumente speichert Layr automatisch (Schalter „Automatisch speichern“, standardmäßig an) im Ordner „Dokumente“ oder im zuletzt benutzten Ordner. Der Name ist frei, vorhandene Dateien werden nie ersetzt. Geöffnete Dateien speichert Layr an ihrem Ort. Der Schalter schaltet das ab.
- **Mikrofon:** Layr nimmt nur auf, solange du das Diktieren selbst startest. Die Spracherkennung läuft lokal mit sherpa-onnx. Audio und erkannter Text verlassen das Gerät nicht.
- **Netzzugriff nur auf deine Aktion hin:** Layr verbindet sich nur in zwei Fällen, und nur wenn du sie auslöst:
  1. Deutsches Wörterbuch laden: von registry.npmjs.org (ca. 1 MB).
  2. Sprachmodell laden: von github.com, Projekt k2-fsa/sherpa-onnx (ca. 490 MB).

  Der Server sieht dabei deine IP-Adresse und die Kennung „Layr“ als User-Agent. Jede Datei wird vor der Nutzung mit einer Prüfsumme (SHA-512 bzw. SHA-256) geprüft.
- **Absturzberichte** bleiben lokal im Benutzerordner von Layr. Layr lädt sie nie hoch.
- **Löschen:** Layr speichert nichts außerhalb deines Geräts. Das Sprachmodell kannst du unter Einstellungen › Schreiben & Rechtschreibung › Diktieren entfernen. Mit dem Deinstallieren entfernst du die App. Deine PDF-Dateien bleiben unverändert.
- **Kontakt:** layrdev@outlook.de

**Hinweis zur Version von GitHub (nicht Microsoft Store):** Diese Version prüft bei Bedarf die öffentliche GitHub-API (api.github.com) auf eine neuere Versionsnummer. Dabei sieht GitHub deine IP-Adresse. Die Prüfung läuft beim Start, wenn die letzte Prüfung mehr als 6 Stunden zurückliegt, und ist standardmäßig eingeschaltet. Schlägt sie fehl, etwa ohne Verbindung, wird sie beim nächsten Start erneut versucht. Du kannst sie unter „Layr & Updates“ abschalten. Jede Prüfung fragt nur die API ab. `latest.yml` mit ihrer Signatur und die Installationsdatei lädt sie erst von github.com herunter, wenn du im Update-Hinweis auf „Jetzt installieren“ klickst oder „Updates selbst installieren“ eingeschaltet ist. Die Store-Version enthält diese Update-Prüfung nicht, und die Flatpak-Version ebenfalls nicht. Beim Deinstallieren bleiben in der GitHub-Version die Einstellungen erhalten.

## English

Layr is a desktop app for PDF files. Layr has no account, no telemetry and no ads. Layr sends no usage data.

- **On your device:** Opened PDFs, notes, settings, signatures, your own dictionary and the “Recently opened” list stay on your device.
- **Saved automatically:** New and merged documents are saved automatically by Layr (switch “Auto-save”, on by default) to the Documents folder or the last used folder. The name is free, and existing files are never replaced. Opened files are saved in their place. The switch turns this off.
- **Microphone:** Layr records only while you start dictation yourself. Speech recognition runs locally with sherpa-onnx. Audio and recognised text never leave the device.
- **Network access only when you ask for it:** Layr connects to the internet in two cases, and only if you trigger them:
  1. Download the German dictionary: from registry.npmjs.org (about 1 MB).
  2. Download the speech model: from github.com, project k2-fsa/sherpa-onnx (about 490 MB).

  The server sees your IP address and the identifier “Layr” as user agent. Every file is checked against a checksum (SHA-512 or SHA-256) before use.
- **Crash reports** stay local in Layr's user folder. Layr never uploads them.
- **Deletion:** Layr stores nothing outside your device. You can remove the speech model under Settings › Writing & Spelling › Dictation. Uninstalling removes the app. Your PDF files stay unchanged.
- **Contact:** layrdev@outlook.de

**Note on the GitHub version (not Microsoft Store):** This version checks the public GitHub API (api.github.com) for a newer version number. GitHub then sees your IP address. The check runs at startup when the last check was more than 6 hours ago, and is on by default. If the check fails, for example without a connection, it is retried at the next start. You can switch it off under “Layr & Updates”. Each check only queries the API. `latest.yml` with its signature and the installer file are downloaded from github.com only after you click “Install now” in the update notice, or when “Install updates automatically” is on. The Store version does not contain this update check, and neither does the Flatpak version. In the GitHub version, uninstalling keeps your settings.
