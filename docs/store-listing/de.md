# Microsoft Store: Eintrag Layr PDF (Deutsch)

Produktname im Store: **Layr PDF** (die App selbst heißt weiter Layr). Store-ID `9NKHS6PSNHTC`, https://apps.microsoft.com/detail/9NKHS6PSNHTC. Der reservierte Name muss `displayName` in `package.json` entsprechen (`Layr PDF`).

Alle Texte zum Einfügen in Partner Center.

## Kurzbeschreibung (max. 100 Zeichen)

PDFs beschriften, zeichnen, unterschreiben und mit Notizen versehen. Lokal, ohne Konto.

## Beschreibung

Layr ist ein Programm für PDF-Dateien: beschriften, zeichnen, markieren, unterschreiben, Formulare ausfüllen und Notizen machen. Alles bleibt auf deinem Gerät. Es gibt kein Konto, keine Werbung und keine Telemetrie.

Layr hilft auch bei Technik-Unterlagen: Organigramme und Netzwerkpläne aus fertigen Vorlagen, Rechner für Subnetze und Zahlensysteme, Codeblöcke mit Syntaxfarben und ein Diagramm-Werkzeug.

Das Diktieren funktioniert offline. Beim ersten Mal lädt Layr nach deiner Bestätigung einmalig ein Sprachmodell (ca. 490 MB) von github.com und prüft es. Danach wird deine Sprache nur auf deinem Gerät erkannt. Audio und Text verlassen den Computer nicht.

Updates kommen über den Microsoft Store.

Datenschutz: siehe PRIVACY.md im Projekt (Link im Eintrag).

## Funktionen (max. 20, je max. 200 Zeichen)

1. Diktieren offline: Sprache wird lokal in Text umgewandelt, mit Satzzeichen. Deutsch, Englisch und weitere Sprachen.
2. Mehrere PDFs in Tabs öffnen, mit Strg+Tab wechseln.
3. Texte, Pfeile, Formen und Stift direkt auf PDFs setzen, mit Schriftarten, Listen und Textfeldern.
4. Stift und Markierer mit Formerkennung: gehaltene Striche werden zu Linie, Kreis, Rechteck oder Dreieck.
5. Bilder einfügen, skalieren und verschieben (PNG, JPG, WebP, GIF, SVG).
6. Tabellen, Codeblöcke und Symbolbibliothek (UML, Flussdiagramme, Netzwerksymbole) für technische Unterlagen.
7. Organigramme und Netzwerkpläne aus fertigen Vorlagen, Verbindungslinien bleiben an den Kästen.
8. IT-Rechner (Zahlensysteme, Datengrößen, Batterielaufzeit) und Subnetzrechner für IPv4 und IPv6.
9. Formularfelder ausfüllen und eigene Formularfelder anlegen, die andere PDF-Programme ausfüllen können.
10. Unterschriften zeichnen, tippen oder einscannen und auf dem Gerät merken.
11. Rechtschreibprüfung Deutsch und Englisch mit eigenem Wörterbuch.
12. Notizen und Aufgaben, die in der PDF gespeichert werden. Export als Markdown.
13. Schwärzen, das den Inhalt wirklich aus der Datei entfernt.
14. Texterkennung (OCR) für gescannte PDFs, komplett auf dem Gerät.
15. Passwortgeschützte PDFs öffnen, speichern und mit Passwort schützen.
16. Zwei PDFs vergleichen: entfernter Text rot, neuer Text grün.
17. Seiten drehen, sortieren, zusammenführen und als neue PDF herausziehen.
18. Drucken (Strg+P), auch nur Seiten oder Auswahl, mit allen Anmerkungen, Formularen und Unterschriften.
19. Präsentationsmodus (F5) mit Laserpointer, geteilte Ansicht und Nachtmodus.
20. Eigene Tastenkürzel und eigene Werkzeugleiste. Zuletzt geöffnete Dateien auf Wunsch merken oder aus.

## Suchbegriffe (max. 7)

PDF, PDF bearbeiten, Unterschrift, Notizen, Diktieren, Diagramm, Subnetz

## Neuerungen (erste Version)

Erste Version im Microsoft Store. Updates kommen über den Store.

## Screenshots

Pflicht: mindestens 1366 x 768 Pixel, PNG oder JPG. Empfohlen: 1920 x 1080. Geplant: 6 Screenshots. Details und Aufnahmehinweise: `screenshots/README.md`.

1. Hauptansicht mit geöffnetem PDF und Werkzeugleiste. Bildunterschrift: „PDFs beschriften, zeichnen und markieren“
2. Diktieren in ein Textfeld. Bildunterschrift: „Diktieren: Sprache wird lokal in Text umgewandelt“
3. Organigramm aus einer Vorlage. Bildunterschrift: „Organigramme aus fertigen Vorlagen“
4. Netzwerkplan mit IP-Adressen. Bildunterschrift: „Netzwerkpläne mit IP-Adressen“
5. Subnetzrechner. Bildunterschrift: „Subnetze berechnen und auf die Seite setzen“
6. Formular ausfüllen und Unterschrift setzen. Bildunterschrift: „Formulare ausfüllen und unterschreiben“

## Altersfreigabe (IARC-Fragebogen)

Kategorie: Produktivität / Dienstprogramme. Erwartete Einstufung: PEGI 3, USK 0.

- Gewalt, Sexualität, Sprache, Drogen, Glücksspiel: nein
- Nutzer können miteinander interagieren oder Inhalte austauschen: nein
- Standort wird verwendet: nein
- Käufe im Programm: nein
- Zugriff auf das offene Internet (Browser, Suche): nein. Layr hat keinen Browser. Es lädt nur zwei feste Dateien, und nur nach Bestätigung durch den Nutzer.
- Persönliche Daten werden erfasst: nein

## Hinweise für die Prüfung (Zertifizierung)

- Kein Konto und kein Login nötig.
- Testablauf: Datei > Öffnen, dann eine PDF wählen. Die Datei bleibt unverändert, bis du speicherst.
- Diktieren: Strg+Umschalt+D oder das Mikrofon-Symbol. Beim ersten Mal fragt Layr, ob das Sprachmodell (ca. 490 MB, github.com/k2-fsa/sherpa-onnx) geladen werden soll. Der Download wird mit einer Prüfsumme geprüft. Danach Mikrofonzugriff erlauben. Die Erkennung läuft lokal.
- Texterkennung (OCR) läuft offline und braucht keinen Download.
- In der Store-Version gibt es keine eigene Update-Suche. Updates kommen über den Store.
- Kein Netzzugriff außer den beiden oben genannten Downloads.

## Begründung für runFullTrust

Electron desktop app (Win32) that reads and writes user-chosen PDF files, runs a local speech-recognition helper process and extracts the speech model with the built-in Windows tar.exe.

(Die Begründung ist englisch, weil das Partner-Center-Formular englisch ist.)

## Lizenz

Layr ist freie Software unter der GNU General Public License v3.0 oder neuer (GPL-3.0-or-later). Quelltext und Lizenz: https://github.com/fxwfcvwqny-source/Layr/blob/main/LICENSE

