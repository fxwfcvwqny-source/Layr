# Layr 3.10.0: Testliste für Windows und Linux

Installiere den Entwurf 3.10.0 (Windows: `Layr-Setup-3.10.0.exe`, Linux: `.deb`/AppImage). Haken setzen, bei Fehlern kurz notieren und, wenn möglich, einen Screenshot in Originalgröße anhängen.
Format je Zeile: Was tun, dann "→" was du sehen sollst. [Linux] / [Windows] = nur dort prüfen. Alle Schalter stehen im Menü Einstellungen (Zahnrad) bzw. unter "Design anpassen" / "Schreiben & Rechtschreibung".
Windows-Skalierung: vorab notieren (Einstellungen, Anzeige) und möglichst bei 100 %, 125 % und 150 % prüfen (Layr danach neu starten). Schwerpunkt dort: scharfe Symbole, Icons, Speicheranzeige, Zahlen unten, Objektleiste.

## 1. Installation und Update von 3.9.0
- [ ] Über eine vorhandene 3.9.0 installieren → Einstellungen (Design, Leiste, Tastenkürzel) wie vorher.
- [ ] Datei öffnen, die in 3.9.0 ungespeichert bearbeitet und nicht gespeichert wurde → Wiederherstellung bietet die Anmerkungen weiter an.
- [ ] Alte, in 3.9.0 gespeicherte PDF öffnen → sieht unverändert aus, Objekte bearbeitbar.
- [ ] [Windows] Fenster-, Taskleisten- und Exe-Symbol → transparenter Hintergrund, kein schwarzes Quadrat (Installer darf es haben).
- [ ] [Linux] Fenstersymbol unter GNOME/Wayland bleibt schwarz → bekannte Grenze.

## 2. Vorlagen und Symbole
- [ ] Vorlage (z. B. Organigramm) wählen, aufs Blatt klicken → sie erscheint dort, vorher folgt ihr eine Vorschau.
- [ ] Beim Klicken ziehen → Vorlage wird auf die Ziehgröße skaliert.
- [ ] Esc oder Rechtsklick vor dem Platzieren → Vorschau verschwindet, nichts wird gesetzt.
- [ ] Umschalt gedrückt platzieren → Vorlage bleibt bereit, mehrfach setzbar.
- [ ] [Linux] Vorlage platzieren und sofort anklicken → bleibt sichtbar, Zeiger bleibt sichtbar, Auswahl möglich.
- [ ] Platzierte Vorlage anklicken → ganze Vorlage ausgewählt; verschieben, skalieren, kopieren (Strg+C/V) → bleibt zusammen.
- [ ] Alt+Klick oder Doppelklick auf ein Teil → nur dieses Teil gewählt und bearbeitbar. [Linux] Alt kann vom Fenstermanager belegt sein.
- [ ] Symbolgruppe "Speicher & Backup": RAID 0/1/5/6/10, NAS, Backupserver, Band, Cloud-Backup, Snapshot, Replikation, externe Platte, SAN-Switch → alle sichtbar, RAID-Buchstaben gleich groß.
- [ ] Dunkles Design → dunkle Symbole bleiben sichtbar.
- [ ] «include» / «extend» ohne gewählte Linie klicken → Pfeilwerkzeug mit gestricheltem offenem Pfeil und Beschriftung; Esc bricht ab.
- [ ] «include» / «extend» mit gewählter Linie → Linie bekommt die Beschriftung.

## 3. Auswahlwerkzeug
- [ ] Umschalt+Klick auf mehrere Objekte, auch eine Vorlage → Gruppe zählt als ein Objekt; Statuszeile "N Objekte gewählt".
- [ ] Strg+G mit mehreren Objekten → gemeinsam verschiebbar (Benutzergruppe). Strg+Umschalt+G → wieder einzeln.
- [ ] Rechtsklick-Menü → Einträge Gruppieren / Gruppierung aufheben / Ausrichten / Reihenfolge vorhanden.
- [ ] Objekte ausrichten und gleichmäßig verteilen → Kanten exakt, angedockte Linien folgen, Strg+Z macht es in einem Schritt rückgängig.
- [ ] Objekt verschieben → Hilfslinien an Kanten und Mitten, Einrasten an den Seitenrändern; Alt kurz → keine Hilfslinien.
- [ ] Ecke skalieren → Hilfslinien auch hier.
- [ ] Schalter "Hilfslinien (beim Verschieben und Größe ändern)" (Standard AN) AUS → keine Linien, kein Einrasten.
- [ ] Objekt wählen → kleine Objektleiste darüber (Duplizieren, Löschen, Sperren, Farbe, Reihenfolge, Ausrichten); jeder Knopf wirkt.
- [ ] F6 → Fokus springt in die Objektleiste, Pfeile/Tab/Enter bedienen sie, Esc zurück.
- [ ] Schalter "Objektleiste am gewählten Objekt" (Standard AN) AUS → keine Leiste.
- [ ] Objekt gewählt, Dialog öffnen (z. B. Drucken) → Objektleiste nicht über dem Dialog.
- [ ] Alt auf einer Eckgriff-Skalierung → Größe ändert sich von der Mitte aus. [Linux] kann vom Fenstermanager abgefangen werden.
- [ ] Strg+] / Strg+[ → Objekt eine Ebene nach vorn/hinten; Strg+Umschalt+] / [ → ganz nach vorn/hinten.
- [ ] Deutsche Tastatur, Alternativen: Strg+Umschalt+Hoch/Runter (eine Ebene), Strg+Alt+Umschalt+Hoch/Runter (ganz) → gleiche Wirkung.
- [ ] Gruppe in der Reihenfolge verschieben → springt als Block. Speichern, neu öffnen → Reihenfolge bleibt.
- [ ] Tab / Umschalt+Tab mit Auswahlwerkzeug → nächstes/voriges Objekt der Seite, Gruppen als ein Halt, Ansage durch Screenreader.
- [ ] Esc nach Tab → normales Tab durch die Oberfläche wieder möglich.
- [ ] Schalter "Tab wechselt zwischen Objekten" (Standard AN) AUS → Tab läuft nur durch die Oberfläche.
- [ ] Doppelklick auf Gerät mit durchlaufender Linie → Gerät wird bearbeitet, nicht die Linie.

## 4. Text
- [ ] Wörter im Textfeld markieren, Fett/Kursiv/Unterstrichen/Hervorgehoben → nur die Wörter ändern sich; Mischzustand in den Knöpfen sichtbar.
- [ ] Strg+Z / Strg+Y im Textfeld → Formatierung wird mit dem Text zurückgesetzt/wiederholt.
- [ ] Sehr langer Text (viele tausend Zeichen) mit Formatierung → Tippen bleibt flüssig, Umbrüche springen nicht.
- [ ] Rechte Seitenleiste, Textabschnitt: Fett, Kursiv, Unterstrichen, Hintergrund → Knöpfe zeigen den Zustand, lassen sich auch AUSschalten, wirken auf die Auswahl.
- [ ] Neues Textfeld nach gesetztem Kursiv/Hintergrund → übernimmt beides.
- [ ] Tippen von `->` `<-` `<->` `=>` `...` `(c)` `(tm)` `+-` `!=` mit Leerzeichen → werden ersetzt; Rückschritt direkt danach bringt die Zeichen zurück.
- [ ] `--` zwischen Leerzeichen → Gedankenstrich. In URL, Optionen (`--help`) und Aufzählung → keine Ersetzung.
- [ ] Autokorrektur auch in Tabellenzellen, Beschriftungen und Notizen → funktioniert; in Notizen nach Rückschritt kein Rest-Auswahlbereich.
- [ ] Einstellung "Autokorrektur für Zeichen (→, –, …)" (Standard: "Zeichen ersetzen") auf "Aus" → nichts wird ersetzt.
- [ ] Strg+Umschalt+K → Sonderzeichen-Auswahl (Aufzählungszeichen, Pfeile); Zeichen einfügen. Auch über den Knopf in der Schnellleiste.
- [ ] Tastenkürzel-Liste (auch ohne gewähltes Objekt) → "Sonderzeichen-Auswahl", Gruppieren und die Reihenfolge-Einträge sind dort, umbelegbar, Konflikte werden gemeldet.
- [ ] Lineal: drehen, Winkel im Feld eintippen, Umschalt rastet in 15° → Drehung um die Mitte.
- [ ] Tabelle mit viel Zellentext → Zeile wächst nach unten, Tabelle bleibt auf der Seite; Schriftgröße/Spalte ändern → passt neu.
- [ ] Großes Textfeld, viel tippen → Blatt wackelt nicht seitwärts. [Windows] besonders prüfen.
- [ ] Lange Notizen speichern, schließen, öffnen → nichts abgeschnitten.

## 5. Bilder
- [ ] Bild wählen, mittlerer Seitengriff ziehen → nur Breite oder Höhe ändert sich (verzerrt).
- [ ] Doppelklick auf einen Seitengriff → Seitenverhältnis wieder wie Original.
- [ ] Eckgriff → bleibt proportional; Umschalt/Alt wie in der Seitenleisten-Info beschrieben.
- [ ] Zuschneiden-Knopf, Doppelklick oder Umschalt+C → Zuschneidemodus; Rand ziehen, Maße in mm sichtbar.
- [ ] Zuschneidemodus per Tastatur: Tab wählt die Kante, Pfeile bewegen, Umschalt = 10 pt → Ansage.
- [ ] Zuschneiden speichern, neu öffnen → bleibt, Zuschnitt änderbar; einmaliger Hinweis, dass das ganze Bild in der Datei bleibt.
- [ ] Dokument wechseln im Zuschneidemodus → Modus endet, Abbruch macht nur den eigenen Schritt rückgängig.

## 6. Seiten und Navigation
- [ ] Seitenvorschau: "+" und Einfügeleisten zwischen den Miniaturen → neue Seite an der Stelle.
- [ ] Miniatur ziehen → Reihenfolge ändert sich; Lesezeichen-Warnung erscheint, wenn das Dokument welche hat (bekannte Grenze).
- [ ] Keine Verschiebe-Pfeile an den Miniaturen; Ziehen, Alt+Hoch/Runter und Rechtsklick-Menü verschieben Seiten.
- [ ] Topologie-Kacheln (Stern, Ring, Bus, Linie, Mesh, Teilvermascht, Baum, Erweiterter Stern) setzen wie in 3.9 ein einzelnes Symbol; keine Topologie-Vorlagen.
- [ ] Kopfmenüs Datei, Ansicht, Einstellungen: Abschnittsüberschriften, höchstens ca. 560 px hoch (sonst Scrollen), Pfeiltasten, Pos1/Ende, Esc gibt den Fokus an den Knopf zurück; jeder Eintrag hat ein eigenes Symbol.
- [ ] Viele Seiten: Miniaturen laden beim Scrollen, kein Ruckeln.
- [ ] Feld "Seite 3 / 12": Zahl tippen, Enter → Sprung; zu große Zahl wird begrenzt; Esc stellt zurück.
- [ ] Strg+Alt+G → Fokus im Seitenfeld, auch wenn es transparent war.
- [ ] Design "Seitenwahl": Unten schwebend (Standard) / In der Seitenvorschau / Aus → entsprechend; bei "Aus" nur Anzeige unten links.
- [ ] Zeichenwerkzeug oder bereitgehaltene Vorlage aktiv → schwebende Seitenwahl ist blass und lässt Klicks durch.
- [ ] Präsentation und schmale geteilte Ansicht → Seitenwahl ausgeblendet.
- [ ] Zwei PDFs zusammenführen (eine mit Layr-Textfeldern) → Textfelder bleiben bearbeitbar, Notizen und Aufgaben beider werden zusammengeführt.
- [ ] Zusammenführen mit ausgefülltem Formular → eingetragene Werte bleiben (ggf. mit Hinweis).

## 7. Einstellungen und Design
- [ ] Speicheranzeige oben links: gespeichert / ungespeichert (ROT) / speichert (Kreisel) / Fehler → Zustände unterscheidbar, auch in Hell, Dunkel, kontrastreich.
- [ ] Design "Speicheranzeige" Symbol (Standard) / Text → beide Varianten.
- [ ] Rechte Seitenleiste: Regler oder Schalter fokussieren/benutzen → Hinweis erscheint daneben, Seitenleiste springt nicht.
- [ ] Design "Tipps in der Seitenleiste" (Standard AN) AUS → keine Hinweise mehr.
- [ ] Seitenzahl, Zoom, Wertangaben im Panel, Zähler → Oberflächenschrift mit gleich breiten Ziffern, die "1" ist normal.
- [ ] Hell, Dunkel, kontrastreiche Farben → neue Schalter und Hinweise lesbar.
- [ ] Neustart → alle Schalter behalten ihren Zustand.

## 8. Tastenkürzel (Kurzübersicht)
- [ ] Strg+G / Strg+Umschalt+G → gruppieren / lösen.
- [ ] Strg+] / Strg+[ und mit Umschalt → Reihenfolge; Alternativen Strg+Umschalt+Hoch/Runter, Strg+Alt+Umschalt+Hoch/Runter.
- [ ] Strg+Alt+G → Seitenfeld. Strg+Umschalt+K → Sonderzeichen.
- [ ] Umschalt+C → Zuschneiden (Bild gewählt). Tab / Umschalt+Tab → Objekte. F6 → Objektleiste. Strg+I → Kursiv.

## 9. Barrierefreiheit
- [ ] Alles mit der Tastatur erreichbar: Schalter, Objektleiste, Zuschneiden, Seitenwahl; sichtbarer Fokus.
- [ ] Screenreader/Live-Ansagen: Auswahlzahl, Tab-Halt, Zuschneidekante, bereitgehaltene Vorlage.
- [ ] Kontrast der neuen Elemente in Hell/Dunkel lesbar (mind. 4,5:1).

## 10. Regression
- [ ] PDF öffnen, zeichnen (Stift, Pfeil, Textfeld, Symbol), speichern, schließen, wieder öffnen → alles noch da, bearbeitbar.
- [ ] Zusammenführen und Exportieren (PDF, Bild) → Ergebnis öffnet, Anmerkungen vorhanden.
- [ ] Diktat: Mikrofon-Knopf, System fragt, Text erscheint im Textfeld.
- [ ] "Jetzt nach Updates suchen" → keine Fehlermeldung.
- [ ] Hell/Dunkel/System umschalten → kein Ruckeln, Schrift lesbar.
- [ ] Geteilte Ansicht → zwei Spalten, Mitscrollen.
- [ ] Rückgängig/Wiederholen über mehrere Schritte (Vorlage, Gruppe, Formatierung, Zuschnitt).

## Bekannte Grenzen (bitte nicht melden)
- Gedrehter Text hat achsenparallele Hervorhebung; Texthintergrund und Wortformatierung fehlen bei gestapeltem Text.
- Zuschneiden blendet nur aus, das ganze Bild bleibt in der Datei (Schwärzen entfernt endgültig).
- Lesezeichen gehen beim Neuaufbau und Umsortieren der Seiten verloren (Warnung erscheint).
- Textebene fehlt in geteilter Ansicht und Präsentation.
- Alt+Klick/Alt+Ziehen kann unter KDE/Xfce vom Fenstermanager belegt sein.
- Mit "Nachtmodus für Seiten" wird die Blattfarbe "Weiß" dunkel gezeigt.
- Neue Speicher-&-Backup-Symbole fehlen in älteren Versionen und gehen verloren, wenn die Datei dort erneut gespeichert wird.
- Ältere Layr-Versionen ignorieren Wortformatierung, Zuschnitt und Gruppen; Teile einer Vorlage, die in älteren Versionen dupliziert wurden, bilden in 3.10 mit dem Original eine Gruppe.
- [Linux] Fenstersymbol unter GNOME/Wayland bleibt schwarz.

## Meldung an mich
Pro Fehler: Punkt aus der Liste, was du gesehen hast, Screenshot, Betriebssystem, Windows-Skalierung.
