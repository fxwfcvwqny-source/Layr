// Layr – Desktop-App (Electron) für Linux und Windows, früher PDF-Werkbank
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, net, session } = require('electron');
const { pathToFileURL } = require('url');
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
  'Deine Beschriftungen sind noch nicht in der PDF gespeichert.': 'Your annotations are not saved in the PDF yet.' };
const installLang = () => { try { const v = fs.readFileSync(path.join(process.resourcesPath, 'install-language.txt'), 'utf8').replace(/\0/g, '').trim(); return v === '1031' ? 'de' : v === '1033' ? 'en' : null; } catch (e) { return null; } };
let uiLang = null;
const langFile = () => path.join(app.getPath('userData'), 'lang.txt');
const getLang = () => { if (uiLang) return uiLang; try { const v = fs.readFileSync(langFile(), 'utf8').trim(); if (v === 'en' || v === 'de') return (uiLang = v); } catch (e) {} return (uiLang = installLang() || 'de'); };
const T = s => (getLang() === 'en' && DLG_EN[s]) || s;
const pdfArg = argv => argv.slice(1).find(a => !a.startsWith('-') && isPdfPath(path.resolve(a)));
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
      if (f) { const r = readPdf(f); win.webContents.send('open-file', r.name, r.data); }
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
    // Berechtigungen: nur Text in die Zwischenablage schreiben (Kopieren-Knöpfe); keine Downloads aus der Seite
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'clipboard-sanitized-write');
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
  if (!initialFile) return null;
  const r = readPdf(initialFile); initialFile = null; return r;
});
listen('set-file', (_e, p) => { if (!isPdfPath(p)) return; savedPath = null; currentFile = path.resolve(p); lastDir = path.dirname(currentFile); addRecent(currentFile); });
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
  try { if (!fs.statSync(p).isFile()) return null; return readPdf(p); } catch (e) { return null; }
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
  try { const p = JSON.parse(fs.readFileSync(path.join(UPD_DIR(), 'pending.json'), 'utf8'));
    if (p && cmpVer(p.version, app.getVersion()) > 0 && p.type === pkgType() && fs.existsSync(p.file) && path.dirname(p.file) === UPD_DIR()) return p;
  } catch (e) {}
  try { fs.rmSync(UPD_DIR(), { recursive: true, force: true }); } catch (e) {}
  return null;
}
handle('upd-state', () => { if (!pending) pending = loadPending(); const t = pkgType();
  return { type: t, canInstall: !!t, pending: pending ? { version: pending.version, notes: pending.notes || '' } : null, busy: dlBusy }; });
async function fetchText(u, max) { if (!u.startsWith(DL_PREFIX)) throw new Error('url'); const r = await net.fetch(u, { headers: { 'User-Agent': 'Layr-Update' } }); if (!r.ok) throw new Error('http ' + r.status);
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
  try {
    const yml = await fetchText(ymlA.url, 65536), sig = await fetchText(sigA.url, 4096);
    if (!sigOk(yml, sig)) throw new Error('signature');
    if (!new RegExp(`^version:\\s*${rel.version.replace(/\./g, '\\.')}\\s*$`, 'm').test(yml)) throw new Error('yml');
    const want = ymlEntry(yml, asset.name); if (!want || want.size > 400e6) throw new Error('yml');
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); try { fs.chmodSync(dir, 0o700); } catch (e) {}
    fs.writeFileSync(path.join(dir, 'release.yml'), yml, { mode: 0o600 }); fs.writeFileSync(path.join(dir, 'release.yml.sig'), sig, { mode: 0o600 });
    const r = await net.fetch(asset.url, { headers: { 'User-Agent': 'Layr-Update' } });
    if (!r.ok || !r.body) throw new Error('http ' + r.status);
    const h = crypto.createHash('sha512'), fd = fs.openSync(part, 'wx', 0o600); let got = 0, last = 0;
    try { const rd = r.body.getReader();
      for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; if (got > want.size) throw new Error('size');
        h.update(value); fs.writeSync(fd, value);
        if (Date.now() - last > 150 && win) { last = Date.now(); win.webContents.send('upd-progress', got, want.size); } }
    } finally { fs.closeSync(fd); }
    if (got !== want.size || h.digest('base64') !== want.sha512) throw new Error('hash');
    fs.renameSync(part, file);
    pending = { version: rel.version, file, type, sha512: want.sha512, notes: rel.notes };
    fs.writeFileSync(path.join(dir, 'pending.json'), JSON.stringify(pending), { mode: 0o600 });
    if (win) win.webContents.send('upd-progress', want.size, want.size);
    return { ok: true, version: rel.version };
  } catch (e) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (x) {}
    return { error: String(e && e.message || e) };
  } finally { dlBusy = false; }
});
function pendingBytes() {
  try {
    if (!pending || path.dirname(pending.file) !== UPD_DIR()) return null;
    const yml = fs.readFileSync(path.join(UPD_DIR(), 'release.yml'), 'utf8'), sig = fs.readFileSync(path.join(UPD_DIR(), 'release.yml.sig'), 'utf8');
    if (!sigOk(yml, sig)) return null;
    const ver = (/^version:\s*(\d+\.\d+\.\d+)\s*$/m.exec(yml) || [])[1]; if (!ver || ver !== pending.version || cmpVer(ver, app.getVersion()) <= 0) return null;
    const want = ymlEntry(yml, path.basename(pending.file)); if (!want || !ASSET_RX[pending.type].test(path.basename(pending.file))) return null;
    const data = fs.readFileSync(pending.file); if (data.length !== want.size || sha512(data) !== want.sha512) return null;
    return data;
  } catch (e) { return null; }
}
function verifyPending() { return !!pendingBytes(); }
function keepLang() { try { fs.writeFileSync(langFile(), getLang()); } catch (e) {} }
// Windows und AppImage: Installation passiert beim Beenden (auch automatisch, falls eingeschaltet)
function installNow(relaunch) {
  if (!pending || !verifyPending()) return false;
  keepLang();
  if (pending.type === 'nsis') {
    const args = ['/S', '--updated']; if (relaunch) args.push('--force-run');
    spawn(pending.file, args, { detached: true, stdio: 'ignore' }).unref(); pending = null; return true;
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
  if (!verifyPending()) { pending = null; try { fs.rmSync(UPD_DIR(), { recursive: true, force: true }); } catch (e) {} return { error: 'hash' }; }
  if (auto) { installOnQuit = true; relaunchAfter = false; return { ok: true, later: true }; }
  if (pending.type === 'deb') {
    // .deb braucht Administratorrechte: pkexec zeigt die Passwortabfrage von Ubuntu
    const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    const want = ymlEntry(fs.readFileSync(path.join(UPD_DIR(), 'release.yml'), 'utf8'), path.basename(pending.file));
    const hex = want && Buffer.from(want.sha512, 'base64').toString('hex'); if (!hex || hex.length !== 128) return { error: 'hash' };
    const script = 'set -eu; d=$(mktemp -d); trap \'rm -rf "$d"\' EXIT; cp -- "$1" "$d/layr.deb"; echo "$2  $d/layr.deb" | sha512sum -c --status || exit 3; dpkg -i "$d/layr.deb"';
    const sh = ['/bin/sh', '-c', script, 'layr-update', pending.file, hex];
    const cmd = asRoot ? sh[0] : '/usr/bin/pkexec', args = asRoot ? sh.slice(1) : sh;
    if (!fs.existsSync(cmd)) return { error: 'pkexec' };
    const code = await new Promise(res => { try { const p = spawn(cmd, args, { stdio: 'ignore' }); p.on('exit', c => res(c)); p.on('error', () => res(-1)); } catch (e) { res(-1); } });
    if (code !== 0) return { error: code === 126 || code === 127 ? 'cancel' : 'dpkg', code };
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
listen('upd-auto-install', (_e, on) => { if (pending && (pending.type === 'nsis' || pending.type === 'appimage')) installOnQuit = !!on; });
app.on('will-quit', () => { if (installOnQuit && pending) installNow(relaunchAfter); });

app.on('window-all-closed', () => app.quit());
