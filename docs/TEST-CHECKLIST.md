# Layr 3.8.5: Testliste für Windows

Installiere `Layr-Setup-3.8.5.exe` (privater Entwurf `v3.8.5`). Haken setzen, bei Fehlern kurz notieren und, wenn möglich, einen Screenshot in Originalgröße anhängen.
Notiere vorab: Windows-Skalierung (Einstellungen, Anzeige) und Fenstergröße.

## 1. Start und Update
- [ ] Setup läuft durch, Layr startet, Version "3.8.5" steht unter "Layr & Updates" (Zahnrad oder Info-Knopf).
- [ ] Beim ersten Start erscheint der Sprachdialog, danach die normale Ansicht.
- [ ] "Jetzt nach Updates suchen" zeigt keinen Absturz und keine Fehlermeldung mit `spawn UNKNOWN`.
- [ ] Datei `%APPDATA%\Layr\update-log.txt`: nur ansehen, keine Fehlerzeilen? (falls es sie gibt, Inhalt schicken)

## 2. Schärfe und Aussehen (100 %, 125 %, 150 % wenn möglich)
- [ ] Werkzeugleiste: Cursor, Ellipse, Stift, Radierer und Text sind scharf, keine treppigen Kanten.
- [ ] Kopfleiste: Symbole sind scharf (Rückgängig, Zoom, Suche, Split, Speichern).
- [ ] Split-Symbol sieht nach "zwei Fenster" aus, nicht nach Pause.
- [ ] "Mehr" zeigt den Werkzeugkasten, das Menü öffnet sich, Schwärzen steht darin.
- [ ] Rechtes Panel: kein waagerechter Balken, nichts am rechten Rand abgeschnitten, nur ein senkrechter dünner Balken.
- [ ] Felder (Auswahlfelder, Segment-Schalter, Knöpfe) sind gefüllt und gut sichtbar, nicht zu blass. Hell und dunkel prüfen.
- [ ] Checkboxen (Fett, Unterstrichen, Gestrichelt): Haken ist scharf, Regler (Stärke, Größe) hat einen runden Knopf.
- [ ] Symbol-Kacheln rechts (Symbole, Startknoten, Aktion) sind nicht pixelig.
- [ ] Ändere die Fenstergröße mehrfach (etwas breiter, etwas schmaler): die Symbole in der Leiste bleiben scharf.

## 3. Schwebende Werkzeugleiste
- [ ] Einstellung "Werkzeugleiste: schwebend" an.
- [ ] Linke Seitenleiste (Seitenvorschau) und rechtes Panel reichen bis nach oben, kein leerer Streifen, nichts abgeschnitten. (wird gerade nachgebessert, bitte trotzdem anschauen)
- [ ] Seitenvorschau ein- und ausblenden, Panel ein- und ausblenden: nichts springt oder wird verdeckt.

## 4. Textauswahl im Cursor (V)
- [ ] Mit dem Auswahlwerkzeug über PDF-Text ziehen: Text wird markiert, Mauszeiger ist ein I-Balken.
- [ ] Strg+C kopiert den Text (in Notepad einfügen).
- [ ] Doppelklick markiert ein Wort, Dreifachklick eine Zeile.
- [ ] Auf leerer Fläche ziehen: Lasso wie bisher.
- [ ] Alt gedrückt halten und über Text ziehen: Lasso, keine Textauswahl.
- [ ] Auf eine eigene Beschriftung (Textfeld, Form) klicken: sie wird ausgewählt, nicht der Text darunter.
- [ ] Rechtsklick auf ein gesperrtes Objekt über Text öffnet das Menü ("Entsperren").
- [ ] Es gibt kein Werkzeug "Text auswählen" und keine Taste Y mehr. Messen ist auch weg.
- [ ] PDF mit Scan (ohne Text): Lasso geht überall.

## 5. Zeichnen und Beschriften (Kern)
- [ ] Stift, Textmarker, Radierer, Linie, Pfeil, Rechteck, Ellipse: zeichnen und verschieben klappt.
- [ ] Textfeld: tippen, Zeilenumbruch, nicht über den Seitenrand schreiben, drehen mit dem runden Griff, mit Doppelklick gerade ausrichten.
- [ ] Pfeil an Kreis/Form andocken: Ankerpunkte rundherum, nächster Punkt wird hervorgehoben.
- [ ] Symbole setzen (Netzwerk, UML), Tabelle einfügen und Text hineinschreiben.
- [ ] Rückgängig und Wiederholen (Strg+Z / Strg+Y) funktionieren.
- [ ] Datei speichern, schließen, wieder öffnen: alles ist noch da.

## 6. Weitere Funktionen
- [ ] Diktat: Mikrofon-Knopf, Windows fragt nach dem Mikrofon, Text erscheint im Textfeld.
- [ ] Notizenleiste rechts: Notiz anlegen, Aufgabe anhaken.
- [ ] Geteilte Ansicht (Split): zwei Spalten beginnen auf gleicher Höhe, Mitscrollen geht.
- [ ] Seitenübersicht (Seiten ordnen) mit vielen Seiten: kein Flackern, Seiten verschieben geht.
- [ ] Suchen (Strg+F), Zoom, Präsentationsmodus.
- [ ] Hell/Dunkel umschalten: kein Ruckeln.

## 7. Stabilität
- [ ] 10 Minuten normal arbeiten: kein Absturz, kein Hängen.
- [ ] Große PDF (viele Seiten) öffnen und durchscrollen: flüssig, Text lässt sich markieren.
- [ ] Layr schließen und neu starten: Einstellungen (Design, Leiste) sind wie vorher.

## Meldung an mich
Schicke mir pro Fehler: Punkt aus der Liste, was du gesehen hast, Screenshot, Windows-Skalierung.
