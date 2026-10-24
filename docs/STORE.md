# Layr PDF im Microsoft Store veröffentlichen

Produktname im Store: **Layr PDF** (die App selbst heißt weiter Layr). Store-ID `9NKHS6PSNHTC`, Store-Seite: https://apps.microsoft.com/detail/9NKHS6PSNHTC

Anleitung für dich als Herausgeber. Die Schritte in Partner Center und auf GitHub macht ihr von Hand. Nichts davon wird automatisch veröffentlicht.

## Was du noch liefern musst

- Microsoft-Entwicklerkonto (Partner Center), einmalig mit Registrierungsgebühr und Identitätsprüfung.
- Namensprüfung: ob „Layr PDF“ im Store frei ist.
- Die Identitätswerte aus Partner Center (Schritt 2).
- Support-Adresse: `layrdev@outlook.de` (steht in `PRIVACY.md` und in den Store-Texten).
- Screenshots (siehe `store-listing/screenshots/README.md`).

## 1. Partner Center: Name reservieren

Menünamen in Partner Center ändern sich ab und zu. Dann sinngemäß suchen.

1. Auf https://partner.microsoft.com/dashboard anmelden.
2. **Apps und Spiele** > **Neue Produkt-Reservierung** (Neue App).
3. Namen „Layr PDF“ eingeben und reservieren. Produkttyp: **MSIX- oder PWA-App** (nicht „EXE oder MSI“). Das Produkt wird angelegt, das Einreichen kommt erst später.
4. Der reservierte Name muss genau dem `displayName` in `package.json` (`build.appx`) entsprechen: `Layr PDF`.

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

1. Das Zertifikat muss zum Herausgeber passen. Dafür `publisher` in `package.json` lokal auf einen Testwert setzen, z. B. `CN=Layr Test`. Diese Änderung nicht committen.
2. Zertifikat erstellen, Betreff **exakt** wie `publisher` (PowerShell). Es liegt nur im Zertifikatsspeicher, nicht als Datei: `$c = New-SelfSignedCertificate -Type Codesigning -Subject "CN=Layr Test" -CertStoreLocation Cert:\CurrentUser\My`
3. Nur das öffentliche Zertifikat exportieren, kein `.pfx` und kein Passwort: `Export-Certificate -Cert $c -FilePath "$env:TEMP\layr-test.cer"`
4. Die `.cer` als Administrator in „Vertrauenswürdige Personen“ importieren: `Import-Certificate -FilePath "$env:TEMP\layr-test.cer" -CertStoreLocation Cert:\LocalMachine\TrustedPeople`
5. Mit dem Daumenabdruck signieren. Der Schlüssel bleibt im Zertifikatsspeicher: `signtool sign /fd SHA256 /sha1 <Thumbprint> Layr-<Version>-Store.appx`. Den Daumenabdruck liefert `$c.Thumbprint`. Dann mit `Add-AppxPackage` installieren.
6. Aufräumen nach dem Test (in derselben PowerShell-Sitzung):
   - `Remove-Item Cert:\CurrentUser\My\$($c.Thumbprint)`
   - `Remove-Item Cert:\LocalMachine\TrustedPeople\$($c.Thumbprint)`
   - `Remove-Item "$env:TEMP\layr-test.cer"`
   - Die lokale `publisher`-Änderung in `package.json` zurücknehmen.

Nichts Schlüsselartiges (kein `.pfx`, kein Passwort, kein Zertifikat) gehört ins Repo.

## 5. Optional: Zertifizierungstest (WACK)

Mit dem Windows App Certification Kit das Paket prüfen: `appcert.exe reset`, dann `appcert.exe test -appxpackagepath <pfad>\Layr-<Version>-Store.appx`. Der Bericht zeigt Fehler, die der Store sonst ablehnt.

## 6. Einreichung in Partner Center

1. **Preise und Verfügbarkeit:** Kostenlos. Märkte nach Wunsch.
2. **Eigenschaften:** Kategorie **Produktivität**. **Datenschutzerklärung-URL:** `https://github.com/fxwfcvwqny-source/Layr/blob/main/PRIVACY.md` (lesbare Seite). **Support-Kontakt:** `layrdev@outlook.de`.
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
