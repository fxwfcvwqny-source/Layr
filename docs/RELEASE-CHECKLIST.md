# Layr: Abschluss-Checkliste vor Microsoft Store und Flathub

Zweck: Vor jeder Einreichung prüft ein Agent oder Mensch **ohne Vorwissen** den aktuellen Stand. Jeder Punkt hat ein klares "bestanden / nicht bestanden". Ein Punkt gilt nur als bestanden, wenn er wirklich ausprobiert wurde (App starten, bedienen, Ergebnis ansehen), nicht nur im Code gelesen.

Kennzeichnung: **[auto]** lässt sich in der Cloud mit Electron, Xvfb und CDP prüfen. **[Windows]**, **[Linux]**, **[Store]** gehen nur auf dem echten System und bleiben für den Eigentümer.

## 0. Vorbereitung
- [ ] `git log --oneline` und Version in `package.json` notieren. Arbeitsbaum sauber, Branch gepusht.
- [ ] `build/smoke-test.mjs` (Rauchtest) dreimal hintereinander grün [auto].
- [ ] Dock-Baseline (`baseline.mjs check`) unverändert [auto].
- [ ] CSP-Hash stimmt (`node build/update-csp-hash.mjs` meldet "already current") [auto].
- [ ] `npm audit --package-lock-only` ohne High/Critical (Electron zählt als Laufzeit!) [auto].
- [ ] Prüfsummen der Symbol-Bibliothek (IT/UML) unverändert zu 3.8.0 [auto].

## 1. Kern (darf sich nicht verschlechtert haben)
- [ ] PDF öffnen (per Dialog, per Ziehen, per Argument), mehrere Tabs, Tab schließen, Wiederherstellen [auto].
- [ ] Zeichnen: Stift, Textmarker, Radierer, Linie, Pfeil, Rechteck, Ellipse, Tabelle, Symbol, Bild, Unterschrift [auto, Stichprobe].
- [ ] Textfeld: tippen, Umbruch, Rand nicht überschreiten, sehr lange Wörter, Drehen mit Griff, Gerade-Ausrichten [auto].
- [ ] Pfeile andocken an Rechteck, Kreis, Ellipse, Dreieck (Ankerpunkte, Hervorhebung) [auto].
- [ ] Rückgängig/Wiederholen über mindestens 20 Schritte, auch nach Seiten verschieben/löschen [auto].
- [ ] Speichern, Schließen, erneut Öffnen: alle Anmerkungen identisch (Textfelder, Tabellen, Pfeile mit Andockpunkten) [auto].
- [ ] Alte Dokumente (vor 3.8) rendern unverändert (Baseline) [auto].
- [ ] Export (Bild/PDF), Seitenzahlen, Schwärzen: Ergebnis prüfen [auto, Stichprobe].
- [ ] Formulare ausfüllen, Passwortschutz, Zusammenführen, Seiten ordnen/verschieben/löschen/drehen [auto, Stichprobe].
- [ ] Diktat und OCR starten (Modell-Download nur nach Zustimmung) [Windows/Linux].

## 2. Neu oder geändert seit 3.8.5 (gezielt prüfen)
**Layout und Aussehen**
- [ ] Schwebende Werkzeugleiste: Seitenvorschau und Panel beginnen auf Höhe der Leiste, kein Leerstreifen; unter 1200 px Breite wie früher [auto: 1440/1200/1000, hell und dunkel].
- [ ] Rechtes Panel: kein waagerechter Balken, nichts abgeschnitten [auto].
- [ ] Gefüllte Felder, Checkbox, Regler in allen Themes (hell: warm/kühl/Kontrast, dunkel: Mitternacht/OLED/Graphit/Wald/Pflaume); Felder klar vom Hintergrund abgesetzt [auto: Screenshots lesen].
- [ ] Symbole in Werkzeug- und Kopfleiste auf ganzen Pixeln (Snap) bei Fenstern 1437 bis 1903 px [auto] und scharf bei 100/125/150 % [Windows].
- [ ] Neue Symbole: Cursor, Ellipse, Split, "Mehr" (Werkzeugkasten) sichtbar und passend [auto].

**Bedienung**
- [ ] Textauswahl im normalen Cursor: Ziehen über PDF-Text markiert, Strg+C kopiert, Doppel- und Dreifachklick, I-Balken; leere Fläche = Lasso; Alt = Lasso über Text; Objekte haben Vorrang; gesperrte Objekte per Rechtsklick entsperrbar [auto + Windows].
- [ ] Scan ohne Text: Lasso überall [auto].
- [ ] Tab bewegt den Fokus durch Kopfleiste, Werkzeuge, Panel; `Strg+.` blendet die Leisten ein/aus [auto].
- [ ] Alle Dialoge: Fokus bleibt drin, Esc schließt, Fokus kehrt zurück, App dahinter ist gesperrt, `inert` bleibt nie hängen (nach Fehlern, nach schnellem Auf/Zu) [auto: alle Dialoge durchklicken].
- [ ] Seiten verschieben über die Seitenvorschau (Knöpfe und Alt+Pfeile): kein Weißflackern, Ansicht springt nicht, Undo genau 1 Schritt, Beschriftungen bleiben bei ihrer Seite; auch Duplizieren/Löschen/Drehen/Einfügen [auto].
- [ ] Anpassbare Text-Leiste (Design-Dialog): Knöpfe aus/ein, Reihenfolge, Stil Standard/Getönt/Kontrast, Zurücksetzen; wirkt beim nächsten Öffnen des Editors; Strg+B/U funktionieren auch bei ausgeblendeten Knöpfen; ältere gespeicherte Designs laden; defekte Werte in `localStorage` brechen nichts [auto].
- [ ] Messen-Werkzeug und "Text auswählen" (Y) sind weg; alte gespeicherte Leisten/Kürzel mit diesen Ids stören nicht [auto].
- [ ] "Seite leeren" ist weg [auto].

**Barrierefreiheit**
- [ ] Alle Icon-Knöpfe haben einen Namen (Accessibility-Baum) [auto].
- [ ] Kontrast >= 4,5:1 für Text in allen Themes und Leistenfarben (Kontrast, Akzent), auch "Nicht gespeichert" [auto].
- [ ] Hoher Kontrast (forced-colors): Farbfelder, Schalter, aktives Werkzeug erkennbar [auto: Emulation].
- [ ] Windows-Skalierung 200 % (960x540): Dialoge scrollen, "Erstellen/Abbrechen" erreichbar [auto: Emulation].
- [ ] Bewegung reduzieren wird beachtet [auto].
- [ ] NVDA/Narrator: Hauptfenster und ein Dialog vorlesen lassen [Windows].

## 3. Sicherheit und Datenschutz
- [ ] Fenster: contextIsolation, sandbox, kein nodeIntegration, CSP streng, Navigation/Neue Fenster blockiert [auto: Code + Laufzeit].
- [ ] Netzwerk: während 5 Minuten normaler Arbeit **keine** ausgehende Verbindung (außer den beiden Aktionen nach Klick) [Linux: `ss`/Wireshark; auto: Netzwerk-Log der App mit gesperrtem Netz].
- [ ] Update-Prüfung nur in der GitHub-Version; im Store- und Flatpak-Modus (`LAYR_STORE_TEST=1`) kein Netzzugriff, Updater-Teile ausgeblendet, `pending.json` unangetastet [auto].
- [ ] Test-Schalter (`LAYR_UPDATE_FEED`, `LAYR_ASR_URL`) wirken nur im ungepackten Build [auto].
- [ ] Mikrofon: nur bei aktivem Diktat, Berechtigung nur für die eigene Seite [Windows].
- [ ] Keine Zugangsdaten, `.env`, `*.pfx` im Repo und in der Historie (`git log -p` Suche) [auto].
- [ ] `PRIVACY.md` stimmt mit dem tatsächlichen Verhalten überein (jede Aussage gegen den Code prüfen) [auto].

## 4. Microsoft Store (nur Eigentümer)
- [ ] `package.json` `build.appx`: Identity `IsmailG.LayrPDF`, Publisher `CN=F9218EE3-…`, Anzeigename "Layr PDF", kein `REPLACE` [auto].
- [ ] Workflow "Store" gestartet, `.appx` als Artefakt da; Version `x.y.z.0` [Store].
- [ ] Optional lokal: Sideload-Test nach `docs/STORE.md`, WACK `appcert.exe` bestanden [Windows].
- [ ] Partner Center: Eigenschaften, Altersfreigabe, Preise, Texte DE/EN (`docs/store-listing`), Screenshots (>= 1366x768), Datenschutz-URL, Support `layrdev@outlook.de`, Hinweise für Tester, `runFullTrust`-Begründung [Store].
- [ ] Neue Store-Richtlinien (gültig ab 22.10.2026) gelesen: nichts, was Updater-Abschaltung, Mikrofon, Datenschutz betrifft, hat sich geändert [Store].

## 5. Flathub (nur Eigentümer, Linux)
- [ ] `.deb` der Version veröffentlicht, sha256 im Manifest [Linux].
- [ ] `flatpak-builder` baut, `flatpak run` startet unter X11 (und Wayland per XWayland) [Linux].
- [ ] Metainfo-Lint und Manifest-Lint ohne Fehler [Linux].
- [ ] Datei öffnen/speichern über Portal, Umbenennen, "Zuletzt geöffnet" [Linux].
- [ ] Diktat: Modell laden (Netz nur dafür), Mikrofon läuft [Linux].
- [ ] Updater aus, Hinweis "Updates kommen über Flathub" [Linux].
- [ ] PR an `flathub/flathub` (Branch `new-pr`), App-ID verifiziert [Linux].

## 6. Abschlussbericht des Prüfers
Pro Punkt: bestanden / nicht bestanden / nicht prüfbar (mit Grund). Zu jedem Fehlschlag: Schritte zum Nachstellen, Beleg (Screenshot-Pfad, Messwert), Vermutung zur Ursache. Am Ende: Liste "Muss vor der Einreichung behoben werden", "Kann danach", "Nur Eigentümer".
