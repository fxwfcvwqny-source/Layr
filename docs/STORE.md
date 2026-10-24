# Layr im Microsoft Store veröffentlichen

Anleitung für dich als Herausgeber. Die Schritte in Partner Center und auf GitHub macht ihr von Hand. Nichts davon wird automatisch veröffentlicht.

## Was du noch liefern musst

- Microsoft-Entwicklerkonto (Partner Center), einmalig mit Registrierungsgebühr und Identitätsprüfung.
- Namensprüfung: ob „Layr“ im Store frei ist.
- Die Identitätswerte aus Partner Center (Schritt 2).
- Eine Support-Adresse. Sie steht als Platzhalter `<SUPPORT-CONTACT-PLACEHOLDER>` in `PRIVACY.md` und in den Store-Texten.
- Screenshots (siehe `store-listing/screenshots/README.md`).

## 1. Partner Center: Name reservieren

Menünamen in Partner Center ändern sich ab und zu. Dann sinngemäß suchen.

1. Auf https://partner.microsoft.com/dashboard anmelden.
2. **Apps und Spiele** > **Neue Produkt-Reservierung** (Neue App).
3. Namen „Layr“ eingeben und reservieren. Das Produkt wird angelegt, das Einreichen kommt erst später.

## 2. Partner Center: Paket-Identität kopieren

1. Im Produkt **Produktidentität** (Product identity, in der Paketverwaltung/Identität) öffnen.
2. Drei Werte kopieren: **Paketidentitätsname** (Identity Name), **Herausgeber** (Publisher, beginnt mit `CN=`), **Anzeigename des Herausgebers** (Publisher display name).
3. In `package.json` im Abschnitt `build.appx` die Platzhalter ersetzen:
   - `identityName` ← Paketidentitätsname
   - `publisher` ← Herausgeber (mit `CN=`)
   - `publisherDisplayName` ← Anzeigename des Herausgebers
4. Committen und pushen. Die Werte sind keine Geheimnisse, sie gehören ins Repo. Die Platzhalter `REPLACE_WITH…` dürfen nicht mehr vorkommen. Sonst bricht der Workflow mit einer Meldung ab.

## 3. GitHub: AppX-Paket bauen

1. Auf GitHub im Repo **Actions** > **Store** öffnen.
2. **Run workflow** wählen, den Branch auswählen (z. B. `main`).
3. Der Lauf dauert einige Minuten: Rauchtest im Store-Modus, dann Bau des Pakets.
4. Nach dem Lauf unter **Artifacts** die Datei `Layr-Store-appx` herunterladen. Sie enthält `Layr-<Version>-Store.appx`. Sie ist unsigniert, der Store signiert sie beim Hochladen.
5. Der Workflow braucht keine Geheimnisse und hat nur Leserechte auf das Repo.

## 4. Optional: lokal testen

Ein unsigniertes Paket lässt sich nicht einfach installieren. Zwei Wege, beide nur unter Windows:

**a) Entwicklermodus (ohne Zertifikat):**

1. Windows-Einstellungen > Entwickler > **Entwicklermodus** einschalten.
2. Mit dem Windows SDK (`makeappx.exe`) das Paket entpacken: `makeappx unpack /p Layr-<Version>-Store.appx /d out`
3. In PowerShell: `Add-AppxPackage -Register out\AppxManifest.xml`

**b) Selbstsigniertes Testzertifikat:**

1. Das Zertifikat muss zum Herausgeber passen. Dafür `publisher` in `package.json` lokal auf den Betreff des Zertifikats setzen. Diese Änderung nicht committen.
2. Zertifikat erstellen (PowerShell): `New-SelfSignedCertificate -Type Codesigning -Subject "CN=…" -CertStoreLocation Cert:\CurrentUser\My`
3. Das `.pfx` **außerhalb des Repos** speichern (z. B. `C:\Users\<du>\Documents\layr-testcert\`). Niemals ins Repo kopieren oder committen.
4. Das Zertifikat in „Vertrauenswürdige Personen“ importieren.
5. Mit `signtool sign /fd SHA256 /a /f <pfad>\test.pfx /p <passwort> Layr-<Version>-Store.appx` signieren und mit `Add-AppxPackage` installieren.

## 5. Optional: Zertifizierungstest (WACK)

Mit dem Windows App Certification Kit das Paket prüfen: `appcert.exe reset`, dann `appcert.exe test -appxpackagepath <pfad>\Layr-<Version>-Store.appx`. Der Bericht zeigt Fehler, die der Store sonst ablehnt.

## 6. Einreichung in Partner Center

1. **Preise und Verfügbarkeit:** Kostenlos. Märkte nach Wunsch.
2. **Eigenschaften:** Kategorie **Produktivität**. **Datenschutzerklärung-URL:** `https://raw.githubusercontent.com/fxwfcvwqny-source/Layr/main/PRIVACY.md` (alternativ die GitHub-Seite mit `/blob/main/PRIVACY.md`). **Support-Kontakt:** deine Support-Adresse.
3. **Altersfreigabe:** Fragebogen nach den Antworten in `docs/store-listing/de.md` bzw. `en.md` (Abschnitt Altersfreigabe). Erwartet: PEGI 3, USK 0.
4. **Pakete:** Die Datei `Layr-<Version>-Store.appx` hochladen.
5. **Store-Einträge:** Deutsch und Englisch aus `docs/store-listing/de.md` und `en.md` eintragen (Kurz- und Langbeschreibung, Funktionen, Suchbegriffe, Neuerungen, Bildunterschriften). Screenshots hochladen.
6. **Hinweise für die Zertifizierung:** Abschnitt „Hinweise für die Prüfung“ aus `en.md` einfügen. Dazu die Begründung für `runFullTrust` (Abschnitt „runFullTrust justification“).
7. **Lizenzbedingungen:** GPL-3.0-or-later, Link siehe Listing.
8. **Zur Zertifizierung senden.** Die Prüfung dauert meist einige Tage.

## Bekannte Grenzen

- Die Store-Version übernimmt beim ersten Start einmalig Einstellungen und die Liste der zuletzt geöffneten Dateien aus einer bestehenden Installation von der GitHub-Seite (MSIX-Copy-on-write von `%APPDATA%\Layr`). Danach bleiben ihre Änderungen im Paket. Das Deinstallieren der Store-Version entfernt nur ihre eigenen Daten.
- Die Store-Version hat keine eigene Update-Suche. Updates kommen nur über den Store.
- Die GitHub-Version (NSIS-Installer, AppImage, .deb) bleibt unverändert und behält ihre Updates.
- Windows fragt beim ersten Start nicht nach der PDF-Zuordnung. Layr erscheint unter „Öffnen mit“ bzw. in den Einstellungen unter „Standard-Apps“. Oder Windows fragt, wenn der Nutzer das nächste Mal eine PDF öffnet.
- Das Paket entsteht nur auf Windows (Workflow). Auf Linux lässt es sich nicht bauen.
- Logos sind aus `build/icon.png` erzeugt (`build/make-appx-assets.mjs`). Eine Prüfung durch den Store steht noch aus.

## Neue Version ausliefern

1. Version in `package.json` erhöhen (und die Versionsnummer in den Store-Texten, falls nötig).
2. Committen und pushen.
3. Workflow **Store** starten und die Datei `Layr-<Version>-Store.appx` herunterladen.
4. In Partner Center eine **neue Einreichung** anlegen, das neue Paket hochladen und einreichen. Die neue Version muss höher sein als die letzte.
