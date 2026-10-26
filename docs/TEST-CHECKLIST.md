# Layr 3.9.0: Testliste für Windows

Installiere `Layr-Setup-3.9.0.exe` (Entwurf `v3.9.0`). Haken setzen, bei Fehlern kurz notieren und, wenn möglich, einen Screenshot in Originalgröße anhängen.
Notiere vorab: Windows-Skalierung (Einstellungen, Anzeige) und Fenstergröße. Ideal: alles bei 100 %, 125 % und 150 % prüfen (Abmelden nach Änderung nicht nötig, Layr neu starten).

## 1. Textauswahl
- [ ] Auf einer Seite mit viel Text von einer Seite über die Seitengrenze auf die nächste ziehen: nur der überstrichene Text wird markiert, nicht die ganze nächste Seite.
- [ ] Nach dem Loslassen Strg+C und in Notepad einfügen: Text passt zur Markierung.
- [ ] Nach der Markierung erscheint eine eigene Auswahlleiste mit "Kopieren": Klick kopiert den Text.
- [ ] "Markieren" in der Leiste: Farben werden angeboten, gewählte Farbe erscheint als Hervorhebung auf dem Text.
- [ ] Gedrehter Text: Hervorhebung ist ein achsenparalleles Kästchen (bekannte Grenze, kein Fehler).

## 2. Text-Schnellleiste
- [ ] Textfeld anlegen: Kursiv-Knopf ist da (nicht hinter "Löschen"). Strg+I schaltet Kursiv um.
- [ ] Texthintergrund-Farbe wählen: Hintergrund erscheint hinter dem Text. Bei gestapeltem Text fehlt er (bekannte Grenze).
- [ ] Neues Textfeld übernimmt Kursiv/Hintergrund aus der Seitenleiste nicht (bekannte Grenze).

## 3. Werkzeugleiste
- [ ] "Mehr": Knopf sieht im Ruhezustand nicht aktiv aus; nach Öffnen und Schließen des Menüs wieder normal.
- [ ] Schwebende Leiste, Ausrichtung links: Leiste sitzt links.
- [ ] Feste Leiste, Fenster mind. 1200 px breit: Leiste ist mittig über dem Blatt. Schmaler ziehen: Layout fällt zurück.
- [ ] Dichte "Groß": ab 1360 px Fensterbreite wirksam, darunter alte Anordnung.

## 4. Symbole und Topologien
- [ ] Symbolkacheln rechts: nur eine Beschriftung, alle gleich groß, Bilder werden in schmalen Kacheln kleiner statt abgeschnitten.
- [ ] Kachel "Tabelle" erscheint nur unter "Formen".
- [ ] Topologien: Stern, Ring, Bus, Baum, Masche einfügen. Alle Geräte lassen sich beschriften und verschieben, Linien bleiben angedockt.
- [ ] Bus hat eine gemeinsame Leitung (Backbone).
- [ ] Doppelklick auf ein Gerät oder dessen Beschriftung, durch das eine Linie läuft: Gerät wird bearbeitet, nicht die Linie.
- [ ] Doppelklick auf eine freie Linie bearbeitet die Linie wie bisher.
- [ ] Alte einzelne Topologie-Symbole: nicht in den Knoten bearbeitbar (bekannte Grenze).
- [ ] Dunkles Design: dunkle Symbole bleiben sichtbar.

## 5. Regression
- [ ] PDF öffnen, zeichnen (Stift, Pfeil, Textfeld), speichern, schließen, wieder öffnen: alles noch da.
- [ ] Diktat: Mikrofon-Knopf, Windows fragt, Text erscheint im Textfeld.
- [ ] Geteilte Ansicht: zwei Spalten, gleiche Höhe, Mitscrollen geht (Textauswahl hier nicht verfügbar, bekannte Grenze).
- [ ] Hell/Dunkel umschalten: kein Ruckeln, Schrift lesbar.
- [ ] "Jetzt nach Updates suchen": keine Fehlermeldung.
- [ ] Neustart: Einstellungen (Design, Leiste) wie vorher.

## Meldung an mich
Schicke mir pro Fehler: Punkt aus der Liste, was du gesehen hast, Screenshot, Windows-Skalierung.
