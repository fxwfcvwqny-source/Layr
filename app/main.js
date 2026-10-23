// Layr – Desktop-App (Electron) für Linux und Windows, früher PDF-Werkbank
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, net, session, utilityProcess, protocol } = require('electron');
const { pathToFileURL, fileURLToPath } = require('url');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawn } = require('child_process');
const REPO = 'fxwfcvwqny-source/Layr';   // öffentliche Seite für Downloads und Updates
const path = require('path');
const fs = require('fs');
// Linux: Einstellungen und Zwischenspeicher immer im selben Ordner wie bisher (.deb und AppImage teilen sie sich)
if (process.platform === 'linux') { try { app.setPath('userData', path.join(app.getPath('appData'), 'PDF-Werkbank')); } catch (e) {} }

let win = null;
let currentFile = null;              // Pfad der geöffneten Originaldatei
let lastDir = app.getPath('documents');
let initialFile = null;
let savedPath = null;               // Zieldatei für Speichern/Autospeichern
let allowClose = false, closing = false;

// ---------- Sicherheit ----------
// Alle Renderer laufen in der Sandbox (außer jemand startet Layr ausdrücklich mit --no-sandbox, z. B. als root in Tests).
// Linux bleibt bei X11/XWayland (getestete Texteingabe, siehe IME-Hinweis unten).
if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();
if (process.platform === 'linux' && !process.env.LAYR_WAYLAND) app.commandLine.appendSwitch('ozone-platform', 'x11');
// Nur die eigene Seite (Hauptfenster, oberster Rahmen) darf Programmfunktionen aufrufen.
const APP_PAGE = () => pathToFileURL(path.join(__dirname, 'web', 'index.html')).href;
const samePage = u => typeof u === 'string' && u.split(/[?#]/)[0] === APP_PAGE();
// 3.6.1: Die Seite darf über file:// nur die eigenen Programmdateien (Ordner web) laden – keine anderen Dateien auf dem Rechner.
// Geöffnete PDFs kommen nie über file://, sondern als Daten vom Hauptprozess oder über die Dateiauswahl.
const WEB_DIR = path.join(__dirname, 'web');
function webFileOk(u) {
  try { const p = path.resolve(fileURLToPath(u)); const a = process.platform === 'win32' ? p.toLowerCase() : p, b = process.platform === 'win32' ? WEB_DIR.toLowerCase() : WEB_DIR;
    return a.startsWith(b + path.sep) && !/[\\/]\.\.?([\\/]|$)/.test(p); } catch (e) { return false; }
}
function okSender(e) {
  try { return !!(win && !win.isDestroyed() && e.sender === win.webContents && e.senderFrame && e.senderFrame === win.webContents.mainFrame && samePage(e.senderFrame.url)); }
  catch (x) { return false; }
}
const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => (okSender(e) ? fn(e, ...a) : null));
const listen = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (okSender(e)) fn(e, ...a); });
// Externe Links: nur https auf die eigene GitHub-Seite
const okExternal = u => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'github.com' && !x.username && !x.password && (x.pathname === '/' + REPO || x.pathname.startsWith('/' + REPO + '/')); } catch (e) { return false; } };
// Namen aus der Oberfläche sind nur Namen, nie Pfade
const safeBase = n => { let b = path.basename(String(n || '').replace(/\\/g, '/')).replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\.pdf$/i, '').replace(/^[.\s]+/, '').trim().slice(0, 200); if (!b) b = 'Dokument'; return b + '.pdf'; };
// Gespeichert werden nur echte PDF-Daten
const isPdfBytes = d => d instanceof Uint8Array && d.length >= 8 && d.length <= 2e9 && d[0] === 0x25 && d[1] === 0x50 && d[2] === 0x44 && d[3] === 0x46 && d[4] === 0x2d;
const isPdfPath = p => { try { return typeof p === 'string' && path.isAbsolute(p) && /\.pdf$/i.test(p) && fs.statSync(p).isFile(); } catch (e) { return false; } };
// Antworten aus dem Netz nur bis zu einer festen Größe lesen
async function readCapped(r, max) {
  const len = +r.headers.get('content-length'); if (len > max) throw new Error('size');
  if (!r.body) return Buffer.alloc(0);
  const rd = r.body.getReader(), parts = []; let n = 0;
  for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; if (n > max) { try { rd.cancel(); } catch (e) {} throw new Error('size'); } parts.push(Buffer.from(value)); }
  return Buffer.concat(parts);
}

// Sprache der Programm-Dialoge (Deutsch/English). Kommt aus der Oberfläche; beim allerersten Start aus dem Windows-Installer.
const DLG_EN = { 'Ohne Speichern schließen': 'Close without saving', 'Abbrechen': 'Cancel', 'Es gibt ungespeicherte Beschriftungen.': 'There are unsaved annotations.',
  'Sie bleiben im Zwischenspeicher und kommen beim nächsten Öffnen derselben Datei wieder.': 'They stay in the cache and come back the next time you open the same file.',
  'Speichern unter': 'Save as', 'Speichern': 'Save', 'Nicht speichern': "Don't save", 'Änderungen speichern?': 'Save changes?',
  'Deine Beschriftungen sind noch nicht in der PDF gespeichert.': 'Your annotations are not saved in the PDF yet.',
  'Exportieren': 'Export', 'PNG-Bild': 'PNG image', 'JPEG-Bild': 'JPEG image', 'ZIP-Archiv': 'ZIP archive', 'CSV-Tabelle': 'CSV table', 'Markdown-Text': 'Markdown text' };
const installLang = () => { try { const v = fs.readFileSync(path.join(process.resourcesPath, 'install-language.txt'), 'utf8').replace(/\0/g, '').trim(); return v === '1031' ? 'de' : v === '1033' ? 'en' : null; } catch (e) { return null; } };
let uiLang = null;
const langFile = () => path.join(app.getPath('userData'), 'lang.txt');
const getLang = () => { if (uiLang) return uiLang; try { const v = fs.readFileSync(langFile(), 'utf8').trim(); if (v === 'en' || v === 'de') return (uiLang = v); } catch (e) {} return (uiLang = installLang() || 'de'); };
const T = s => (getLang() === 'en' && DLG_EN[s]) || s;
const pdfArg = argv => argv.slice(1).find(a => !a.startsWith('-') && isPdfPath(path.resolve(a)));
// Tabs: Speicherort je Tab (Schlüssel = zufällige Tab-Kennung aus der Oberfläche). Die Oberfläche bekommt nie Pfade.
const DOCS = new Map(); let activeTab = null; const TICKETS = new Map();
const TAB_RX = /^[a-z0-9]{1,24}$/;
const samePath = (a, b) => { if (!a || !b) return false; const x = path.resolve(a), y = path.resolve(b); return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y; };
function dupOf(p) { for (const [id, d] of DOCS) if (id !== activeTab && (samePath(d.s, p) || (!d.s && samePath(d.c, p)))) return id; return null; }
const readPdf = f => { if (fs.statSync(f).size > 2e9) throw new Error('size'); savedPath = null; currentFile = path.resolve(f); lastDir = path.dirname(currentFile); const data = fs.readFileSync(f); addRecent(currentFile); return { name: path.basename(f), data }; };

// Zuletzt geöffnet: nur Dateipfade, nur auf diesem Rechner (recent.json im privaten Programmordner).
// Abschaltbar unter Personalisieren; dann wird die Liste geleert und nichts mehr gemerkt.
const RECENT_MAX = 12;
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
let recent = null;
function recentLoad() {
  if (recent) return recent;
  try { const j = JSON.parse(fs.readFileSync(recentFile(), 'utf8'));
    recent = { on: j.on !== false, items: Array.isArray(j.items) ? j.items.filter(x => x && typeof x.p === 'string' && path.isAbsolute(x.p) && /\.pdf$/i.test(x.p)).slice(0, RECENT_MAX) : [] };
  } catch (e) { recent = { on: true, items: [] }; }
  return recent;
}
function recentSave() { try { fs.writeFileSync(recentFile(), JSON.stringify(recent)); } catch (e) {} }
function addRecent(p) {
  const r = recentLoad(); if (!r.on || !p || !/\.pdf$/i.test(p)) return; p = path.resolve(p);
  if (r.items[0] && r.items[0].p === p && Date.now() - r.items[0].t < 60000) return;
  r.items = [{ p, t: Date.now() }, ...r.items.filter(x => x.p !== p)].slice(0, RECENT_MAX); recentSave();
  try { app.addRecentDocument(p); } catch (e) {}
}

// Linux: Das Eingabesystem (IBus o. ä.) für diese App umgehen und die einfache GTK-Eingabe nehmen.
// Sonst kommen Buchstaben im Textfeld nicht oder nur einzeln an. Umlaute und Tottasten (^, ´) gehen weiterhin.
// Abschalten: PDF-Werkbank mit WERKBANK_IME=1 starten.
const needImFix = process.platform === 'linux' && !process.env.WERKBANK_IME &&
  process.env.GTK_IM_MODULE !== 'gtk-im-context-simple';
if (needImFix) {
  process.env.GTK_IM_MODULE = 'gtk-im-context-simple';
  process.env.XMODIFIERS = '@im=none';
  app.relaunch();
  app.exit(0);
}
// Absturz-Schutz: Stürzt die Grafik (GPU) einmal ab, startet Layr ab dann ohne Grafikbeschleunigung.
// Das ist für eine PDF-App kaum langsamer, vermeidet aber weiße Fenster bei wackeligen Grafiktreibern.
// Zurücksetzen: Datei „no-gpu“ im Ordner ~/.config/PDF-Werkbank löschen.
const noGpuFlag = () => path.join(app.getPath('userData'), 'no-gpu');
const crashLog = msg => {
  const line = `${new Date().toISOString()} ${app.getVersion()} ${msg}\n`;
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'absturz.txt'), line); } catch (e) {}
};
if (!needImFix) { try { if (fs.existsSync(noGpuFlag())) app.disableHardwareAcceleration(); } catch (e) {} }
// Absturzberichte nur lokal sammeln (nichts wird hochgeladen), damit sich die Ursache genau finden lässt
if (!needImFix) { try { require('electron').crashReporter.start({ uploadToServer: false, compress: false }); } catch (e) {} }
// Neuesten Absturzbericht in den privaten Programmordner kopieren (nie neben die PDF, er kann Dokumentinhalt enthalten)
function copyLatestDump() {
  try {
    const base = app.getPath('crashDumps'), found = [];
    const walk = d => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (/\.dmp$/i.test(n)) found.push([st.mtimeMs, p]); } };
    walk(base); if (!found.length) { crashLog('kein Absturzbericht gefunden in ' + base); return; }
    found.sort((a, b) => b[0] - a[0]); const src = found[0][1];
    const dst = path.join(app.getPath('userData'), `absturz-${new Date().toISOString().replace(/[:.]/g, '-')}.dmp`);
    fs.copyFileSync(src, dst); crashLog('Absturzbericht gespeichert: ' + path.basename(dst));
  } catch (e) { crashLog('Absturzbericht nicht kopiert: ' + e.message); }
}

if (needImFix) {}
else if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('child-process-gone', (_e, d) => {
    crashLog(`Prozess beendet: ${d.type} (${d.reason}, Code ${d.exitCode})`);
    if (d.type === 'GPU' && d.reason !== 'clean-exit') { try { fs.writeFileSync(noGpuFlag(), 'GPU abgestürzt\n'); } catch (e) {} }
  });
  app.on('second-instance', (_e, argv) => {
    const f = pdfArg(argv);
    if (win) {
      if (f) { try { if (fs.statSync(f).size > 2e9) throw new Error('size'); const data = fs.readFileSync(f), t = crypto.randomBytes(9).toString('hex');
        TICKETS.set(t, path.resolve(f)); if (TICKETS.size > 20) TICKETS.delete(TICKETS.keys().next().value); win.webContents.send('open-file', path.basename(f), data, t); } catch (e) {} }
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on('web-contents-created', (_e, wc) => {
    wc.on('will-attach-webview', e => e.preventDefault());
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    protocol.handle('file', req => webFileOk(req.url) ? net.fetch(req.url, { bypassCustomProtocolHandlers: true }) : new Response(null, { status: 403 }));
    // Berechtigungen: nur Text in die Zwischenablage schreiben (Kopieren-Knöpfe); keine Downloads aus der Seite
    // Mikrofon: nur für die eigene Seite, nur Ton (keine Kamera, kein Bildschirm) und nur während eines Diktats
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
      if (perm === 'clipboard-sanitized-write') return cb(true);
      const d = details || {};
      cb(perm === 'media' && micArmed && !!win && !win.isDestroyed() && wc === win.webContents && samePage(d.requestingUrl) &&
        Array.isArray(d.mediaTypes) && d.mediaTypes.length > 0 && d.mediaTypes.every(t => t === 'audio'));
    });
    session.defaultSession.setPermissionCheckHandler((wc, perm, _origin, details) => perm === 'clipboard-sanitized-write' ||
      (perm === 'media' && micArmed && !!win && !win.isDestroyed() && wc === win.webContents && !!details && details.mediaType === 'audio'));
    session.defaultSession.on('will-download', e => e.preventDefault());
    // Die Rechtschreibprüfung macht Layr selbst (Hunspell, lokal). Chromiums eigene Prüfung bleibt aus und lädt nichts von Google.
    try { session.defaultSession.setSpellCheckerEnabled(false); session.defaultSession.setSpellCheckerLanguages([]); session.defaultSession.setSpellCheckerDictionaryDownloadURL('https://127.0.0.1:9/'); } catch (e) {}
    initialFile = pdfArg(process.argv) || null;
    win = new BrowserWindow({
      width: 1400, height: 900, minWidth: 420, minHeight: 400,
      title: 'Layr', backgroundColor: '#e6eaee',
      icon: path.join(__dirname, 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.js'), spellcheck: false, contextIsolation: true, nodeIntegration: false, sandbox: true,
        webSecurity: true, navigateOnDragDrop: false, safeDialogs: true, devTools: process.env.LAYR_DEBUG === '1' },
    });
    win.loadFile(path.join(__dirname, 'web', 'index.html'));
    win.on('close', e => { if (allowClose) return; e.preventDefault(); handleClose(); });
    // Ungespeicherte Änderungen: nachfragen statt das Schließen still zu blockieren
    win.webContents.on('will-prevent-unload', e => {
      const c = dialog.showMessageBoxSync(win, { type: 'question', buttons: [T('Ohne Speichern schließen'), T('Abbrechen')], defaultId: 1, cancelId: 1,
        message: T('Es gibt ungespeicherte Beschriftungen.'), detail: T('Sie bleiben im Zwischenspeicher und kommen beim nächsten Öffnen derselben Datei wieder.') });
      if (c === 0) e.preventDefault();
    });
    // Seite abgestürzt (weißes Fenster): Grund festhalten und dieselbe Datei neu laden.
    // Die Beschriftungen kommen aus dem Zwischenspeicher zurück.
    let lastCrash = 0;
    win.webContents.on('render-process-gone', (_e, d) => {
      crashLog(`Seite abgestürzt: ${d.reason} (Code ${d.exitCode})`);
      setTimeout(copyLatestDump, 2500);
      if (Date.now() - lastCrash < 15000) { crashLog('zweiter Absturz kurz hintereinander, kein automatisches Neuladen'); return; }
      lastCrash = Date.now(); initialFile = currentFile || null;
      setTimeout(() => { try { win.webContents.reload(); } catch (e) {} }, 300);
    });
    win.webContents.on('unresponsive', () => crashLog('Seite reagiert nicht mehr'));
    win.webContents.on('responsive', () => crashLog('Seite reagiert wieder'));
    win.webContents.setWindowOpenHandler(({ url }) => { if (okExternal(url)) shell.openExternal(url); return { action: 'deny' }; });
    const stayHome = (e, u) => { if (!samePage(u)) e.preventDefault(); };
    win.webContents.on('will-navigate', stayHome);
    win.webContents.on('will-redirect', stayHome);
    win.webContents.on('will-frame-navigate', e => { if (!e.isMainFrame || !samePage(e.url)) e.preventDefault(); });
    win.webContents.on('before-input-event', (_e, i) => {
      if (i.type !== 'keyDown') return;
      if (i.key === 'F11') win.setFullScreen(!win.isFullScreen());
      if (i.key === 'F12') win.webContents.toggleDevTools();
    });
  });
}

handle('initial-file', () => {
  DOCS.clear(); activeTab = null; TICKETS.clear();   // Seite neu geladen (Start oder nach Absturz): Tabs beginnen von vorn
  if (!initialFile) return null;
  const r = readPdf(initialFile); initialFile = null; return r;
});
handle('set-file', (_e, p) => { if (!isPdfPath(p)) return null; const dup = dupOf(p); if (dup) { addRecent(path.resolve(p)); return { dup }; }
  savedPath = null; currentFile = path.resolve(p); lastDir = path.dirname(currentFile); addRecent(currentFile); return { ok: true }; });
handle('tab-activate', (_e, id) => {
  if (typeof id !== 'string' || !TAB_RX.test(id)) return false;
  if (activeTab === null) { activeTab = id; return true; }          // erster Tab übernimmt den bisherigen Zustand
  if (id === activeTab) return true;
  DOCS.set(activeTab, { c: currentFile, s: savedPath });
  const d = DOCS.get(id) || { c: null, s: null }; DOCS.delete(id);
  currentFile = d.c; savedPath = d.s; activeTab = id;
  while (DOCS.size > 200) DOCS.delete(DOCS.keys().next().value);
  return true;
});
listen('tab-close', (_e, id) => { if (typeof id === 'string' && id !== activeTab) DOCS.delete(id); });
handle('tab-claim', (_e, t) => {
  const p = typeof t === 'string' ? TICKETS.get(t) : null; if (!p) return null; TICKETS.delete(t);
  const dup = dupOf(p); if (dup) { addRecent(p); return { dup }; }
  savedPath = null; currentFile = p; lastDir = path.dirname(p); addRecent(p); return { ok: true };
});
handle('save', async (_e, name, data, saveAs) => {
  if (!isPdfBytes(data)) return null;
  const known = savedPath || currentFile, base = safeBase(name);
  if (!saveAs && known) { writeSafe(known, data); savedPath = known; addRecent(known); return path.basename(known); }
  // neues Dokument oder „Speichern unter“: der Ort kommt immer aus dem Dialog des Systems
  const r = await dialog.showSaveDialog(win, { title: T('Speichern unter'), defaultPath: path.join(known ? path.dirname(known) : lastDir, base), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  let target = path.resolve(r.filePath); if (!/\.pdf$/i.test(target)) target += '.pdf';
  writeSafe(target, data); lastDir = path.dirname(target); savedPath = target; addRecent(savedPath);
  return path.basename(target);
});

// 3.5: Exportieren (Bilder, ZIP, kleinere PDF-Kopie). Ändert nie die geöffnete Datei; der Ort kommt immer aus dem Dialog des Systems.
// Nur bekannte Dateiarten anhand der ersten Bytes, die Endung passt immer dazu.
const EXPORT_KINDS = { pdf: ['PDF', 'pdf'], png: ['PNG-Bild', 'png'], jpg: ['JPEG-Bild', 'jpg'], zip: ['ZIP-Archiv', 'zip'], csv: ['CSV-Tabelle', 'csv'], md: ['Markdown-Text', 'md'] };
const exportKind = (d, name) => {
  if (!(d instanceof Uint8Array) || d.length < 8 || d.length > 2e9) return null;
  // Text (Lernkarten als CSV, Notizen als Markdown): nur mit passender Endung, ohne Nullbytes, gültiges UTF-8
  const tx = /\.(csv|md)$/i.exec(String(name || ''));
  if (tx) { if (d.length > 5e7 || d.includes(0)) return null; try { new TextDecoder('utf-8', { fatal: true }).decode(d); } catch (e) { return null; } return tx[1].toLowerCase(); }
  if (isPdfBytes(d)) return 'pdf';
  if (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47 && d[4] === 0x0d && d[5] === 0x0a && d[6] === 0x1a && d[7] === 0x0a) return 'png';
  if (d[0] === 0xff && d[1] === 0xd8 && d[2] === 0xff) return 'jpg';
  if (d[0] === 0x50 && d[1] === 0x4b && d[2] === 0x03 && d[3] === 0x04) return 'zip';
  return null;
};
handle('export', async (_e, name, data) => {
  const kind = exportKind(data, name); if (!kind) return null;
  const [label, ext] = EXPORT_KINDS[kind];
  let b = path.basename(String(name || '').replace(/\\/g, '/')).replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/^[.\s]+/, '').trim().slice(0, 200);
  b = b.replace(/\.(pdf|png|jpe?g|zip|csv|md)$/i, ''); if (!b) b = 'Export';
  const r = await dialog.showSaveDialog(win, { title: T('Exportieren'), defaultPath: path.join(lastDir, b + '.' + ext), filters: [{ name: T(label), extensions: [ext] }], properties: ['showOverwriteConfirmation', 'createDirectory'] });
  if (r.canceled || !r.filePath) return null;
  let target = path.resolve(r.filePath); if (path.extname(target).toLowerCase() !== '.' + ext && !(ext === 'jpg' && /\.jpe?g$/i.test(target))) target += '.' + ext;
  // nie eine geöffnete Datei überschreiben (auch nicht die eines anderen Tabs)
  const open = [savedPath, currentFile, ...[...DOCS.values()].flatMap(d => [d.c, d.s])].filter(Boolean);
  if (open.some(p => samePath(p, target))) return null;
  writeSafe(target, data); lastDir = path.dirname(target);
  return path.basename(target);
});
// Speichern aktualisiert die geöffnete Datei selbst (wie bei Word). Die unbeschriftete Fassung steckt als
// Anhang in der PDF, Layr kann beim nächsten Öffnen also alles weiter bearbeiten oder wieder entfernen.
// Erst in eine zufällig benannte, exklusiv angelegte Hilfsdatei schreiben (folgt keinem Symlink), dann ersetzen.
function writeSafe(t, data, noReplace) {
  const dir = path.dirname(t), tmp = path.join(dir, `.${path.basename(t)}.${crypto.randomBytes(8).toString('hex')}.layr-tmp`);
  const fd = fs.openSync(tmp, 'wx', 0o600);
  try { let off = 0; while (off < data.length) off += fs.writeSync(fd, data, off, data.length - off); fs.fsyncSync(fd); }
  catch (e) { try { fs.closeSync(fd); } catch (x) {} try { fs.unlinkSync(tmp); } catch (x) {} throw e; }
  fs.closeSync(fd);
  try {
    let mode = 0o666 & ~process.umask(); try { mode = fs.statSync(t).mode & 0o777; } catch (e) {}
    try { fs.chmodSync(tmp, mode); } catch (e) {}
    if (noReplace) {
      try { fs.linkSync(tmp, t); fs.unlinkSync(tmp); return; } catch (e) { if (e.code === 'EEXIST') throw e; }
      if (fs.existsSync(t)) { const er = new Error('exists'); er.code = 'EEXIST'; throw er; }
    }
    fs.renameSync(tmp, t);
  } catch (e) { try { fs.unlinkSync(tmp); } catch (x) {} throw e; }
}
// Fehlersuche-Protokoll nur mit LAYR_DEBUG=1 und nur im privaten Programmordner (es enthält gedrückte Tasten)
listen('log', (_e, t) => { if (process.env.LAYR_DEBUG !== '1') return; try { fs.writeFileSync(path.join(app.getPath('userData'), 'debug-log.txt'), `${app.getVersion()}\n${t}`); } catch (e) {} });
listen('new-doc', () => { savedPath = null; currentFile = null; });
handle('autosave', (_e, name, data) => {
  if (!isPdfBytes(data)) return null;
  const known = savedPath || currentFile;
  if (known) { writeSafe(known, data); savedPath = known; addRecent(known); return path.basename(known); }
  // neues Blatt: im zuletzt benutzten Ordner unter einem freien Namen anlegen, nie eine vorhandene Datei ersetzen
  const dir = path.resolve(lastDir), b = safeBase(name).replace(/\.pdf$/i, '');
  for (let n = 1; n < 1000; n++) {
    const t = path.join(dir, n === 1 ? b + '.pdf' : `${b} (${n}).pdf`); if (path.dirname(t) !== dir || fs.existsSync(t)) continue;
    try { writeSafe(t, data, true); } catch (e) { if (e.code === 'EEXIST') continue; throw e; }
    savedPath = t; addRecent(t); return path.basename(t);
  }
  return null;
});
handle('recent-list', () => {
  const r = recentLoad();
  return { on: r.on, items: r.items.map(x => ({ path: x.p, name: path.basename(x.p), dir: path.dirname(x.p), t: x.t, exists: fs.existsSync(x.p) })) };
});
// Öffnet nur Dateien, die wirklich in der Liste stehen
handle('recent-open', (_e, p) => {
  const r = recentLoad(); if (typeof p !== 'string' || !r.items.some(x => x.p === p)) return null;
  try { if (!fs.statSync(p).isFile()) return null; const dup = dupOf(p); if (dup) { addRecent(path.resolve(p)); return { dup }; } return readPdf(p); } catch (e) { return null; }
});
listen('recent-remove', (_e, p) => { const r = recentLoad(); r.items = r.items.filter(x => x.p !== p); recentSave(); });
listen('recent-clear', () => { const r = recentLoad(); r.items = []; recentSave(); try { app.clearRecentDocuments(); } catch (e) {} });
listen('recent-enable', (_e, on) => { const r = recentLoad(); r.on = !!on; if (!r.on) { r.items = []; try { app.clearRecentDocuments(); } catch (e) {} } recentSave(); });

function askRenderer(code, ms) {
  return Promise.race([win.webContents.executeJavaScript(code).catch(() => null), new Promise(r => setTimeout(() => r(null), ms))]);
}
async function handleClose() {
  if (closing) return; closing = true;
  try {
    const st = await askRenderer('window.__wbState && window.__wbState()', 1500);
    if (st && st.dirty) {
      {
        const c = await dialog.showMessageBox(win, { type: 'question', buttons: [T('Speichern'), T('Nicht speichern'), T('Abbrechen')], defaultId: 0, cancelId: 2,
          message: T('Änderungen speichern?'), detail: T('Deine Beschriftungen sind noch nicht in der PDF gespeichert.') });
        if (c.response === 2) return;
        if (c.response === 0 && !(await askRenderer('window.__wbSaveForClose()', 120000))) return;
      }
    }
    allowClose = true; win.close();
  } finally { closing = false; }
}

// Updates: fragt nur die öffentliche Release-Seite auf GitHub nach der neuesten Version. Es werden keine Daten gesendet.
const cmpVer = (a, b) => { const x = String(a).split('.').map(n => parseInt(n, 10) || 0), y = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0) ? 1 : -1; } return 0; };
const pickAsset = assets => { const L = (assets || []).map(a => ({ n: String(a.name || ''), u: String(a.browser_download_url || '') }));
  const f = process.platform === 'win32' ? L.find(a => /setup.*\.exe$/i.test(a.n)) : (L.find(a => /\.deb$/i.test(a.n)) || L.find(a => /\.appimage$/i.test(a.n)));
  return f && f.u.startsWith(DL_PREFIX) ? f.u : null; };
handle('app-info', () => ({ version: app.getVersion(), platform: process.platform, repo: REPO, installLang: installLang() }));
listen('set-lang', (_e, l) => { uiLang = l === 'en' ? 'en' : 'de'; try { fs.writeFileSync(langFile(), uiLang); } catch (e) {} });
handle('check-update', async () => {
  try {
    const r = await net.fetch(API_LATEST, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Layr-Update-Check' } });
    if (!r.ok) return { error: r.status };
    const j = JSON.parse((await readCapped(r, 2e6)).toString('utf8')), v = String(j.tag_name || '').replace(/^v/i, '');
    if (!/^\d+\.\d+\.\d+$/.test(v)) return { error: 'keine Version' };
    lastRel = { version: v, notes: String(j.body || '').slice(0, 600), assets: (Array.isArray(j.assets) ? j.assets : []).map(a => ({ name: String(a.name || ''), url: String(a.browser_download_url || '') })) };
    return { version: v, newer: cmpVer(v, app.getVersion()) > 0, url: String(j.html_url || ''), asset: pickAsset(j.assets), name: String(j.name || ('Layr ' + v)).slice(0, 80), notes: String(j.body || '').slice(0, 600), canInstall: !!pkgType() };
  } catch (e) { return { error: String(e && e.message || e) }; }
});
// Nur Links auf die eigene GitHub-Seite öffnen
listen('open-release', (_e, u) => {
  shell.openExternal(okExternal(u) && /^\/[^/]+\/[^/]+(\/releases(\/.*)?)?$/.test(new URL(u).pathname) ? u : `https://github.com/${REPO}/releases/latest`);
});

// ---------- Datei umbenennen (Klick auf den Namen oben links) ----------
handle('rename-file', (_e, base) => {
  base = safeBase(base).replace(/\.pdf$/i, '');
  if (!base) return { error: 'name' };
  const src = savedPath || currentFile;
  if (!src) return { ok: true, disk: false, name: base + '.pdf' };
  const target = path.join(path.dirname(src), base + '.pdf');
  if (path.resolve(target) === path.resolve(src)) return { ok: true, disk: true, name: path.basename(target) };
  let ss; try { ss = fs.statSync(src, { bigint: true }); } catch (e) { return { ok: true, disk: false, name: base + '.pdf' }; }
  let ts = null; try { ts = fs.statSync(target, { bigint: true }); } catch (e) {}
  const same = !!ts && ts.ino === ss.ino && ts.dev === ss.dev;   // dieselbe Datei, nur andere Schreibweise (Windows)
  if (ts && !same) return { error: 'exists' };
  try {
    if (same) fs.renameSync(src, target);
    else {
      try { fs.linkSync(src, target); fs.unlinkSync(src); }          // legt nur an, wenn das Ziel nicht existiert
      catch (e) { if (e.code === 'EEXIST' || fs.existsSync(target)) return { error: 'exists' }; fs.renameSync(src, target); }
    }
  } catch (e) { return { error: 'fs', msg: String(e && e.code || e) }; }
  if (savedPath && path.resolve(savedPath) === path.resolve(src)) savedPath = target;
  if (currentFile && path.resolve(currentFile) === path.resolve(src)) currentFile = target;
  const r = recentLoad(); r.items = r.items.filter(x => x.p !== target).map(x => x.p === path.resolve(src) ? { p: target, t: Date.now() } : x); recentSave();
  return { ok: true, disk: true, name: path.basename(target) };
});

// ---------- Rechtschreibprüfung: Wörterbücher ----------
// Deutsch: zuerst ein selbst geladenes, dann das des Systems (Linux) oder von LibreOffice (Windows). Es wird nichts mitgeliefert.
const DICT_DIR = () => path.join(app.getPath('userData'), 'dictionaries');
const DE_PKG = { url: 'https://registry.npmjs.org/dictionary-de/-/dictionary-de-3.0.0.tgz',
  sha512: '0Xbq+YpWTscAL1e18aPPaqfG4goC2o9T595L/54v2OvOPC0/TJFFlclYanxuUoK73wutM5f9EgSuWGkvQXlOXw==',
  aff: '8y+QWjEPnsmuegOacg5fi272rq+Fj9jy6JE2Db63JXYBJnquJwQf5jtKRNF/JmTz8LQegtB5BM2y2YJCxdVrJQ==',
  dic: 'UuHSlZeJkWngbVpXmwZiT0a8Ai1PyQkhL0sI2Cnsto9LYwQPb9xhQLbOVEb6CnOI7jXDugSYhRsVYJdLGZgfsA==' };
const sha512 = b => crypto.createHash('sha512').update(b).digest('base64');
function readDict(aff, dic) {
  try {
    if (!fs.statSync(aff).isFile() || !fs.statSync(dic).isFile() || fs.statSync(dic).size > 40e6 || fs.statSync(aff).size > 5e6) return null;
    let a = fs.readFileSync(aff), d = fs.readFileSync(dic);
    const set = (/^SET\s+(\S+)/m.exec(a.toString('latin1')) || [])[1] || 'ISO8859-1';
    if (/^utf-?8$/i.test(set)) return { aff: a.toString('utf8'), dic: d.toString('utf8') };
    if (/^(iso-?8859-(1|15)|latin-?1|cp1252|windows-1252)$/i.test(set)) return { aff: a.toString('latin1').replace(/^SET\s+\S+/m, 'SET UTF-8'), dic: d.toString('latin1') };
    return null;
  } catch (e) { return null; }
}
function deCandidates() {
  const L = [[path.join(DICT_DIR(), 'de_DE.aff'), path.join(DICT_DIR(), 'de_DE.dic'), 'download']];
  if (process.platform === 'linux') {
    for (const d of ['/usr/share/hunspell', '/usr/share/myspell', '/usr/share/myspell/dicts'])
      for (const n of ['de_DE', 'de_AT', 'de_CH', 'de_DE_frami']) L.push([`${d}/${n}.aff`, `${d}/${n}.dic`, 'system']);
  } else if (process.platform === 'win32') {
    for (const pf of [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean))
      for (const n of ['de_DE_frami', 'de_DE']) L.push([path.join(pf, 'LibreOffice', 'share', 'extensions', 'dict-de', n + '.aff'), path.join(pf, 'LibreOffice', 'share', 'extensions', 'dict-de', n + '.dic'), 'libreoffice']);
  }
  return L;
}
handle('spell-dict', (_e, lang) => {
  if (lang !== 'de') return null;
  for (const [a, d, src] of deCandidates()) { const r = readDict(a, d); if (r) return { ...r, src }; }
  return null;
});
// Nur auf ausdrücklichen Klick: das deutsche Wörterbuch (igerman98, GPL) einmal aus dem öffentlichen npm-Verzeichnis laden.
// Die Datei wird gegen feste Prüfsummen geprüft, bevor sie gespeichert wird.
function untar(buf) { const out = {}; let o = 0;
  while (o + 512 <= buf.length) { const name = buf.toString('utf8', o, o + 100).replace(/\0.*$/s, ''); if (!name) break;
    const size = parseInt(buf.toString('utf8', o + 124, o + 136).replace(/\0.*$/s, '').trim() || '0', 8); const type = buf[o + 156];
    if (type === 0 || type === 48) out[name] = buf.subarray(o + 512, o + 512 + size);
    o += 512 + Math.ceil(size / 512) * 512; }
  return out; }
handle('spell-download', async (_e, lang) => {
  if (lang !== 'de') return { error: 'lang' };
  try {
    const r = await net.fetch(DE_PKG.url, { headers: { 'User-Agent': 'Layr' } });
    if (!r.ok) return { error: r.status };
    const tgz = await readCapped(r, 5e6);
    if (tgz.length > 5e6 || sha512(tgz) !== DE_PKG.sha512) return { error: 'hash' };
    const files = untar(zlib.gunzipSync(tgz)), aff = files['package/index.aff'], dic = files['package/index.dic'], lic = files['package/license'];
    if (!aff || !dic || sha512(aff) !== DE_PKG.aff || sha512(dic) !== DE_PKG.dic) return { error: 'hash' };
    fs.mkdirSync(DICT_DIR(), { recursive: true });
    fs.writeFileSync(path.join(DICT_DIR(), 'de_DE.aff'), aff); fs.writeFileSync(path.join(DICT_DIR(), 'de_DE.dic'), dic);
    if (lic) fs.writeFileSync(path.join(DICT_DIR(), 'de_DE-LICENSE.txt'), lic);
    return { ok: true };
  } catch (e) { return { error: String(e && e.message || e) }; }
});

// ---------- Updates selbst installieren ----------
// Lädt den passenden Installer der neuesten Version von der eigenen GitHub-Seite, prüft ihn gegen die sha512-Summe aus
// latest.yml / latest-linux.yml (gleiche Veröffentlichung) und installiert ihn: Windows still über den Installer,
// AppImage durch Austausch der Datei, .deb über pkexec (Ubuntu fragt nach dem Passwort).
// Zum Testen kann LAYR_UPDATE_FEED auf einen Server auf diesem Rechner (127.0.0.1) zeigen; andere Adressen werden ignoriert.
const FEED = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(process.env.LAYR_UPDATE_FEED || '') ? process.env.LAYR_UPDATE_FEED : null;
const API_LATEST = FEED ? `${FEED}/repos/${REPO}/releases/latest` : `https://api.github.com/repos/${REPO}/releases/latest`;
const DL_PREFIX = FEED ? `${FEED}/${REPO}/releases/download/` : `https://github.com/${REPO}/releases/download/`;
const UPD_DIR = () => path.join(app.getPath('userData'), 'updates');
// Öffentlicher Schlüssel für Updates. Der passende geheime Schlüssel liegt nur bei GitHub (Actions-Secret) und beim Herausgeber.
// latest.yml / latest-linux.yml werden beim Bauen damit signiert; ohne gültige Signatur installiert Layr nichts selbst.
const UPDATE_PUBKEY = (FEED && process.env.LAYR_UPDATE_TESTKEY) || '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA6qXXoD0D2lT32gq/3Z/1KEG3R5/ovdySRej+zM2LQrg=\n-----END PUBLIC KEY-----\n';
function sigOk(text, sigText) {
  try { const sig = Buffer.from(String(sigText).trim(), 'base64'); if (sig.length !== 64) return false;
    return crypto.verify(null, Buffer.from(text, 'utf8'), crypto.createPublicKey(UPDATE_PUBKEY), sig); } catch (e) { return false; }
}
let lastRel = null, pending = null, dlBusy = false, installOnQuit = false, relaunchAfter = false;
function pkgType() {
  if (process.platform === 'win32') return 'nsis';
  if (process.platform === 'linux') {
    if (process.env.APPIMAGE) return 'appimage';
    try { if (fs.readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim() === 'deb') return 'deb'; } catch (e) {}
  }
  return null;
}
const ASSET_RX = { nsis: /^Layr-Setup-\d+\.\d+\.\d+\.exe$/, appimage: /^Layr-\d+\.\d+\.\d+-x86_64\.AppImage$/, deb: /^Layr-\d+\.\d+\.\d+-amd64\.deb$/ };
function ymlEntry(yml, name) {
  const re = new RegExp(`-\\s+url:\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n\\s+sha512:\\s*([A-Za-z0-9+/=]+)\\s*\\n\\s+size:\\s*(\\d+)`);
  const m = re.exec(yml); return m ? { sha512: m[1], size: +m[2] } : null;
}
function loadPending() {
  if (dlBusy) return null;
  try { const p = JSON.parse(fs.readFileSync(path.join(UPD_DIR(), 'pending.json'), 'utf8'));
    if (p && cmpVer(p.version, app.getVersion()) > 0 && p.type === pkgType() && fs.existsSync(p.file) && path.dirname(p.file) === UPD_DIR()) return p;
  } catch (e) {}
  try { fs.rmSync(UPD_DIR(), { recursive: true, force: true }); } catch (e) {}
  return null;
}
handle('upd-state', () => { if (!pending) pending = loadPending(); const t = pkgType();
  return { type: t, canInstall: !!t, pending: pending ? { version: pending.version, notes: pending.notes || '' } : null, busy: dlBusy }; });
async function fetchText(u, max) { if (!u.startsWith(DL_PREFIX)) throw new Error('url'); const r = await net.fetch(u, { headers: { 'User-Agent': 'Layr-Update' }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error('http ' + r.status);
  return (await readCapped(r, max)).toString('utf8'); }
handle('upd-download', async () => {
  const type = pkgType(); if (!type) return { error: 'unsupported' };
  if (dlBusy) return { error: 'busy' };
  if (!lastRel) return { error: 'norelease' };
  const rel = lastRel; if (cmpVer(rel.version, app.getVersion()) <= 0) return { error: 'notnewer' };
  if (pending && pending.version === rel.version) return { ok: true, version: rel.version };
  const asset = rel.assets.find(a => ASSET_RX[type].test(a.name) && a.name.includes(rel.version));
  const ymlA = rel.assets.find(a => a.name === (type === 'nsis' ? 'latest.yml' : 'latest-linux.yml'));
  const sigA = ymlA && rel.assets.find(a => a.name === ymlA.name + '.sig');
  if (!asset || !ymlA || !asset.url.startsWith(DL_PREFIX) || !ymlA.url.startsWith(DL_PREFIX)) return { error: 'asset' };
  if (!sigA || !sigA.url.startsWith(DL_PREFIX)) return { error: 'unsigned' };
  dlBusy = true;
  const dir = UPD_DIR(), part = path.join(dir, asset.name + '.part'), file = path.join(dir, asset.name);
  let idle = null;
  try {
    const yml = await fetchText(ymlA.url, 65536), sig = await fetchText(sigA.url, 4096);
    if (!sigOk(yml, sig)) throw new Error('signature');
    if (!new RegExp(`^version:\\s*${rel.version.replace(/\./g, '\\.')}\\s*$`, 'm').test(yml)) throw new Error('yml');
    const want = ymlEntry(yml, asset.name); if (!want || want.size > 400e6) throw new Error('yml');
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); try { fs.chmodSync(dir, 0o700); } catch (e) {}
    fs.writeFileSync(path.join(dir, 'release.yml'), yml, { mode: 0o600 }); fs.writeFileSync(path.join(dir, 'release.yml.sig'), sig, { mode: 0o600 });
    const ctl = new AbortController(), kick = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(), 60000); };
    kick();
    const r = await net.fetch(asset.url, { headers: { 'User-Agent': 'Layr-Update' }, signal: ctl.signal });
    if (!r.ok || !r.body) throw new Error('http ' + r.status);
    const h = crypto.createHash('sha512'), fd = fs.openSync(part, 'wx', 0o600); let got = 0, last = 0;
    try { const rd = r.body.getReader();
      for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; if (got > want.size) throw new Error('size');
        h.update(value); fs.writeSync(fd, value); kick();
        if (Date.now() - last > 150 && win && !win.isDestroyed()) { last = Date.now(); win.webContents.send('upd-progress', got, want.size); } }
    } finally { fs.closeSync(fd); }
    if (got !== want.size || h.digest('base64') !== want.sha512) throw new Error('hash');
    fs.renameSync(part, file);
    pending = { version: rel.version, file, type, sha512: want.sha512, notes: rel.notes };
    fs.writeFileSync(path.join(dir, 'pending.json'), JSON.stringify(pending), { mode: 0o600 });
    if (win && !win.isDestroyed()) win.webContents.send('upd-progress', want.size, want.size);
    return { ok: true, version: rel.version };
  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (x) {}
    return { error: String(e && e.message || e) };
  } finally { clearTimeout(idle); dlBusy = false; }
});
// Liefert die geprüften Bytes und die Prüfsumme aus derselben, gerade geprüften Beschreibung (nichts wird danach neu gelesen)
function pendingChecked() {
  try {
    if (!pending || path.dirname(pending.file) !== UPD_DIR()) return null;
    const yml = fs.readFileSync(path.join(UPD_DIR(), 'release.yml'), 'utf8'), sig = fs.readFileSync(path.join(UPD_DIR(), 'release.yml.sig'), 'utf8');
    if (!sigOk(yml, sig)) return null;
    const ver = (/^version:\s*(\d+\.\d+\.\d+)\s*$/m.exec(yml) || [])[1]; if (!ver || ver !== pending.version || cmpVer(ver, app.getVersion()) <= 0) return null;
    const want = ymlEntry(yml, path.basename(pending.file)); if (!want || !ASSET_RX[pending.type].test(path.basename(pending.file))) return null;
    const data = fs.readFileSync(pending.file); if (data.length !== want.size || sha512(data) !== want.sha512) return null;
    const hex = Buffer.from(want.sha512, 'base64').toString('hex'); if (hex.length !== 128) return null;
    return { data, hex };
  } catch (e) { return null; }
}
const pendingBytes = () => { const c = pendingChecked(); return c ? c.data : null; };
function verifyPending() { return !!pendingChecked(); }
const ROOT_SCRIPT = 'set -eu; d=$(mktemp -d); trap \'rm -rf "$d"\' EXIT; cp -- "$1" "$d/layr.deb"; echo "$2  $d/layr.deb" | sha512sum -c --status || exit 3; dpkg -i "$d/layr.deb"';
let pkChild = null, termTakeover = false;
const updLog = t => { try { fs.appendFileSync(path.join(app.getPath('userData'), 'update-log.txt'), `${new Date().toISOString()} ${app.getVersion()} ${t}\n`, { mode: 0o600 }); } catch (e) {} };
const debCmd = () => `sudo apt install "${pending.file}"`;
// Terminal öffnen, das als Benutzer läuft und nur die Installation mit sudo macht (Ubuntu fragt dort nach dem Passwort)
function openTerminal(argv) {
  const cands = [['ptyxis', ['--']], ['gnome-terminal', ['--']], ['kgx', ['--']], ['konsole', ['-e']], ['xfce4-terminal', ['-x']], ['mate-terminal', ['-x']], ['tilix', ['-e']], ['x-terminal-emulator', ['-e']], ['xterm', ['-e']]];
  for (const [bin, pre] of cands) {
    const full = ['/usr/bin/', '/bin/', '/usr/local/bin/'].map(d => d + bin).find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } });
    if (!full) continue;
    try { const p = spawn(full, [...pre, ...argv], { detached: true, stdio: 'ignore' }); p.on('error', () => {}); p.unref(); updLog('Terminal: ' + bin); return true; } catch (e) {}
  }
  return false;
}
function keepLang() { try { fs.writeFileSync(langFile(), getLang()); } catch (e) {} }
// Windows und AppImage: Installation passiert beim Beenden (auch automatisch, falls eingeschaltet)
function installNow(relaunch) {
  if (!pending || !verifyPending()) return false;
  keepLang();
  if (pending.type === 'nsis') {
    const args = ['/S', '--updated']; if (relaunch) args.push('--force-run');
    updLog('nsis start ' + pending.version);
    try { const p = spawn(pending.file, args, { detached: true, stdio: 'ignore' }); p.on('error', e => updLog('nsis spawn: ' + (e && e.code))); p.unref(); }
    catch (e) { updLog('nsis spawn: ' + (e && e.code)); return false; }
    pending = null; return true;
  }
  if (pending.type === 'appimage') {
    const target = process.env.APPIMAGE; if (!target) return false;
    try {
      const real = fs.realpathSync(target); if (!fs.statSync(real).isFile()) return false;
      const data = pendingBytes(); if (!data) return false;   // genau die geprüften Bytes schreiben
      const tmp = path.join(path.dirname(real), `.${path.basename(real)}.${crypto.randomBytes(8).toString('hex')}.layr-new`);
      const fd = fs.openSync(tmp, 'wx', 0o700);
      try { let off = 0; while (off < data.length) off += fs.writeSync(fd, data, off, data.length - off); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      try { fs.chmodSync(tmp, 0o755); fs.renameSync(tmp, real); } catch (e) { try { fs.unlinkSync(tmp); } catch (x) {} throw e; }
    } catch (e) { return false; }
    try { fs.rmSync(UPD_DIR(), { recursive: true, force: true }); } catch (e) {}
    pending = null; return true;
  }
  return false;
}
handle('upd-install', async (_e, auto) => {
  if (!pending) pending = loadPending();
  if (!pending) return { error: 'nopending' };
  const chk = pendingChecked();
  if (!chk) { pending = null; try { fs.rmSync(UPD_DIR(), { recursive: true, force: true }); } catch (e) {} return { error: 'hash' }; }
  if (auto) { installOnQuit = true; relaunchAfter = false; return { ok: true, later: true }; }
  if (pending.type === 'deb') {
    // .deb braucht Administratorrechte: pkexec zeigt die Passwortabfrage von Ubuntu.
    // Das Skript als root kopiert die Datei in einen eigenen Ordner und prüft dort genau diese (signierte) Prüfsumme.
    const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    const hex = chk.hex;
    const script = ROOT_SCRIPT;
    const sh = ['/bin/sh', '-c', script, 'layr-update', pending.file, hex];
    const cmd = asRoot ? sh[0] : '/usr/bin/pkexec', args = asRoot ? sh.slice(1) : sh;
    if (!fs.existsSync(cmd)) return { error: 'pkexec', cmd: debCmd() };
    termTakeover = false; let errText = '';
    const code = await new Promise(res => { try { const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] }); pkChild = p;
      p.stderr.on('data', d => { if (errText.length < 4000) errText += d.toString('utf8'); }); p.on('exit', c => res(c)); p.on('error', () => res(-1)); } catch (e) { res(-1); } });
    pkChild = null;
    if (termTakeover) return { error: 'takeover' };
    if (code !== 0) {
      updLog(`pkexec Ende ${code}: ${errText.replace(/\s+/g, ' ').slice(0, 600)}`);
      if (code === 126) return { error: 'cancel', code };
      if (code === 127 || code === -1) return { error: 'noauth', code, msg: errText.slice(0, 300), cmd: debCmd() };
      return { error: 'dpkg', code, msg: errText.slice(0, 300) };
    }
    keepLang(); try { fs.rmSync(UPD_DIR(), { recursive: true, force: true }); } catch (e) {} pending = null;
    app.relaunch(); relaunchAfter = false; installOnQuit = false;
    setImmediate(() => { try { win.close(); } catch (e) {} });
    return { ok: true };
  }
  installOnQuit = true; relaunchAfter = pending.type === 'nsis';
  // AppImage: Electron startet die (dann ausgetauschte) Datei erst neu, wenn diese Instanz ganz beendet ist
  if (pending.type === 'appimage') app.relaunch({ execPath: process.env.APPIMAGE });
  setImmediate(() => { try { win.close(); } catch (e) {} });
  return { ok: true };
});
handle('upd-terminal', async () => {
  if (!pending) pending = loadPending();
  if (!pending || pending.type !== 'deb') return { error: 'nopending' };
  const chk = pendingChecked(); if (!chk) return { error: 'hash' };
  const hex = chk.hex;
  if (pkChild) { termTakeover = true; try { pkChild.kill(); } catch (e) {} }
  const en = getLang() === 'en';
  const user = 'printf "%s\\n\\n" "$5"; if sudo /bin/sh -c "$3" layr-update "$1" "$2"; then printf "\\n%s\\n" "$6"; (setsid "$4" >/dev/null 2>&1 &); sleep 2; else printf "\\n%s\\n%s" "$7" "$8"; read -r _; fi';
  const ok = openTerminal(['/bin/sh', '-c', user, 'layr-update', pending.file, hex, ROOT_SCRIPT, process.execPath,
    en ? 'Layr update: Ubuntu now asks for your password.' : 'Layr-Update: Ubuntu fragt jetzt nach deinem Passwort.',
    en ? 'Done. Layr is starting again …' : 'Fertig. Layr startet neu …',
    en ? 'The installation did not work.' : 'Die Installation hat nicht geklappt.',
    en ? 'Press Enter to close …' : 'Enter drücken zum Schließen …']);
  if (!ok) return { error: 'noterm', cmd: debCmd() };
  keepLang(); installOnQuit = false; relaunchAfter = false;
  setTimeout(() => { try { win.close(); } catch (e) {} }, 400);
  return { ok: true };
});
listen('upd-auto-install', (_e, on) => { if (pending && (pending.type === 'nsis' || pending.type === 'appimage')) installOnQuit = !!on; });
app.on('will-quit', () => { if (installOnQuit && pending) { asrKill(); installNow(relaunchAfter); } });


// ---------- Diktieren (3.3) ----------
// Spracherkennung NVIDIA Parakeet TDT 0.6B v3 (CC BY 4.0) über sherpa-onnx (Apache-2.0). Läuft komplett auf diesem Rechner.
// Das Modellpaket kommt nur nach ausdrücklicher Zustimmung von der GitHub-Seite des sherpa-onnx-Projekts und wird gegen feste
// Prüfsummen geprüft (Paket und jede einzelne Datei), bevor Layr es benutzt.
const ASR_TEST = /^http:\/\/(127\.0\.0\.1|localhost):\d+\/[\w./-]+$/.test(process.env.LAYR_ASR_URL || '') ? process.env.LAYR_ASR_URL : null;
const ASR_PKG = {
  url: ASR_TEST || 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2',
  size: 487170055, sha256: '5793d0fd397c5778d2cf2126994d58e9d56b1be7c04d13c7a15bb1b4eafb16bf',
  dir: 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8',
  files: {
    'encoder.int8.onnx': [652184281, 'acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247'],
    'decoder.int8.onnx': [11845275, '179e50c43d1a9de79c8a24149a2f9bac6eb5981823f2a2ed88d655b24248db4e'],
    'joiner.int8.onnx': [6355277, '3164c13fc2821009440d20fcb5fdc78bff28b4db2f8d0f0b329101719c0948b3'],
    'tokens.txt': [93939, 'd58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d'],
  },
};
const ASR_ROOT = () => path.join(app.getPath('userData'), 'models');
const ASR_DIR = () => path.join(ASR_ROOT(), 'parakeet-tdt-0.6b-v3');
const ASR_UNPACKED = Object.values(ASR_PKG.files).reduce((a, f) => a + f[0], 0);
let micArmed = false, asrJob = null, asrW = null, asrReady = null, asrIdle = 0, asrSeq = 0;
const asrPend = new Map();
const asrSend = (...a) => { try { if (win && !win.isDestroyed()) win.webContents.send('asr-progress', ...a); } catch (e) {} };
function asrInstalled() {
  try { return Object.entries(ASR_PKG.files).every(([f, [size]]) => fs.statSync(path.join(ASR_DIR(), f)).size === size); } catch (e) { return false; }
}
const sha256File = f => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', d => h.update(d)).on('error', rej).on('end', () => res(h.digest('hex'))); });
function tarPath() {
  const c = process.platform === 'win32' ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')] : ['/usr/bin/tar', '/bin/tar'];
  return c.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}
function freeBytes(dir) { try { const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch (e) { return Infinity; } }
handle('asr-state', () => ({ installed: asrInstalled(), busy: !!asrJob, download: ASR_PKG.size, unpacked: ASR_UNPACKED, loaded: !!(asrW && asrReady) }));
handle('asr-install', async () => {
  if (asrJob) return { error: 'busy' };
  if (asrInstalled()) return { ok: true };
  const job = asrJob = { ac: new AbortController(), child: null, canceled: false };
  const root = ASR_ROOT(), part = path.join(root, '.parakeet.download'); let tmp = null;
  try {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 }); try { fs.chmodSync(root, 0o700); } catch (e) {}
    if (freeBytes(root) < ASR_PKG.size + ASR_UNPACKED + 100e6) return { error: 'space', need: ASR_PKG.size + ASR_UNPACKED };
    const tar = tarPath(); if (!tar) return { error: 'tar' };
    try { fs.rmSync(part, { force: true }); } catch (e) {}
    // 1) Laden und dabei die Prüfsumme bilden
    const r = await net.fetch(ASR_PKG.url, { headers: { 'User-Agent': 'Layr' }, signal: job.ac.signal });
    if (!r.ok || !r.body) throw new Error('http ' + r.status);
    const h = crypto.createHash('sha256'), fd = fs.openSync(part, 'wx', 0o600); let got = 0, last = 0;
    try { const rd = r.body.getReader();
      for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; if (got > ASR_PKG.size) throw new Error('size');
        h.update(value); fs.writeSync(fd, value);
        if (Date.now() - last > 200) { last = Date.now(); asrSend('dl', got, ASR_PKG.size); } }
    } finally { fs.closeSync(fd); }
    if (got !== ASR_PKG.size || h.digest('hex') !== ASR_PKG.sha256) throw new Error('hash');
    // 2) Entpacken (nur die vier benötigten Dateien) in einen privaten Hilfsordner
    asrSend('unpack', 0, ASR_UNPACKED);
    tmp = fs.mkdtempSync(path.join(root, '.unpack-')); try { fs.chmodSync(tmp, 0o700); } catch (e) {}
    const members = Object.keys(ASR_PKG.files).map(f => ASR_PKG.dir + '/' + f);
    const enc = path.join(tmp, ASR_PKG.dir, 'encoder.int8.onnx');
    const tick = setInterval(() => { let n = 0; for (const f of Object.keys(ASR_PKG.files)) { try { n += fs.statSync(path.join(tmp, ASR_PKG.dir, f)).size; } catch (e) {} } asrSend('unpack', n, ASR_UNPACKED); }, 400);
    let errText = '';
    const code = await new Promise(res => { try {
      const c = job.child = spawn(tar, ['-xjf', part, '-C', tmp, ...members], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      c.stderr.on('data', d => { if (errText.length < 2000) errText += d; }); c.on('exit', x => res(x)); c.on('error', () => res(-1)); } catch (e) { res(-1); } });
    clearInterval(tick); job.child = null;
    if (job.canceled) throw new Error('canceled');
    if (code !== 0) throw new Error(/bzip2/i.test(errText) ? 'bzip2' : 'unpack');
    // 3) Jede Datei prüfen, dann an ihren Platz
    asrSend('check', 0, 1);
    for (const [f, [size, sum]] of Object.entries(ASR_PKG.files)) {
      const p = path.join(tmp, ASR_PKG.dir, f), st = fs.lstatSync(p);
      if (!st.isFile() || st.size !== size || (await sha256File(p)) !== sum) throw new Error('hash');
    }
    try { fs.rmSync(ASR_DIR(), { recursive: true, force: true }); } catch (e) {}
    fs.renameSync(path.join(tmp, ASR_PKG.dir), ASR_DIR());
    asrSend('done', 1, 1);
    return { ok: true };
  } catch (e) {
    const m = job.canceled ? 'canceled' : String((e && e.message) || e);
    return { error: /abort/i.test(m) ? 'canceled' : m };
  } finally {
    try { fs.rmSync(part, { force: true }); } catch (e) {}
    if (tmp) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
    if (asrJob === job) asrJob = null;
  }
});
listen('asr-cancel', () => { const j = asrJob; if (!j) return; j.canceled = true; try { j.ac.abort(); } catch (e) {} try { if (j.child) j.child.kill(); } catch (e) {} });
handle('asr-remove', () => { asrKill(); if (asrJob) return { error: 'busy' }; try { fs.rmSync(ASR_DIR(), { recursive: true, force: true }); return { ok: true }; } catch (e) { return { error: 'rm' }; } });
// Hilfsprozess: wird erst beim Diktieren gestartet und nach 5 Minuten ohne Diktat wieder beendet (gibt ca. 1 GB Speicher frei)
function asrKill() { micArmed = false; const w = asrW; asrW = null; asrReady = null; clearTimeout(asrIdle);
  for (const [, p] of asrPend) p.rej(new Error('stopped')); asrPend.clear(); if (w) { try { w.kill(); } catch (e) {} } }
function asrTouch() { clearTimeout(asrIdle); asrIdle = setTimeout(() => { if (!micArmed) asrKill(); }, 5 * 60e3); }
function asrWorker() {
  if (asrW) return asrW;
  const w = asrW = utilityProcess.fork(path.join(__dirname, 'asr-worker.js'), [], { serviceName: 'Layr Diktat', stdio: 'ignore' });
  w.on('message', m => { if (!m || typeof m !== 'object' || typeof m.key !== 'string') return;
    const p = asrPend.get(m.key); if (!p) return; asrPend.delete(m.key); m.t === 'err' ? p.rej(new Error(m.msg || 'asr')) : p.res(m); });
  w.on('exit', () => { if (asrW === w) { asrW = null; asrReady = null; micArmed = false; for (const [, p] of asrPend) p.rej(new Error('exit')); asrPend.clear(); } });
  return w;
}
function asrCall(key, msg, ms) { const w = asrWorker(); return new Promise((res, rej) => {
  const t = setTimeout(() => { if (asrPend.get(key)) { asrPend.delete(key); rej(new Error('timeout')); } }, ms);
  asrPend.set(key, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } }); w.postMessage({ ...msg, key }); }); }
handle('asr-probe', async () => { try { const r = await asrCall('_probe', { t: 'probe' }, 30000); asrTouch(); return { ok: true, version: r.version, ort: r.ort }; } catch (e) { return { error: String(e.message || e) }; } });
handle('asr-start', async () => {
  if (!asrInstalled()) return { error: 'missing' };
  try {
    if (!asrReady) { const threads = Math.max(1, Math.min(8, (require('os').availableParallelism ? require('os').availableParallelism() : require('os').cpus().length) - 1));
      asrReady = asrCall('_load', { t: 'load', dir: ASR_DIR(), threads }, 120000); }
    await asrReady; micArmed = true; asrTouch(); return { ok: true };
  } catch (e) { asrKill(); return { error: String(e.message || e) }; }
});
listen('asr-stop', () => { micArmed = false; asrTouch(); });
handle('asr-decode', async (_e, samples) => {
  if (!(samples instanceof Float32Array) || samples.length < 1600 || samples.length > 16000 * 40) return { error: 'samples' };
  if (!asrW || !asrReady) return { error: 'notready' };
  try { await asrReady; const id = 'd' + (++asrSeq); const r = await asrCall(id, { t: 'dec', id, samples }, 120000); asrTouch(); return { text: String(r.text || '').slice(0, 20000) }; }
  catch (e) { return { error: String(e.message || e) }; }
});
app.on('will-quit', () => asrKill());
app.on('window-all-closed', () => app.quit());
