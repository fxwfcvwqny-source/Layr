// Layr – Desktop-App (Electron) für Linux und Windows, früher PDF-Werkbank
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, net } = require('electron');
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
const pdfArg = argv => argv.slice(1).find(a => /\.pdf$/i.test(a) && fs.existsSync(a));
const readPdf = f => { savedPath = null; currentFile = path.resolve(f); lastDir = path.dirname(currentFile); const data = fs.readFileSync(f); addRecent(currentFile); return { name: path.basename(f), data }; };

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

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    initialFile = pdfArg(process.argv) || null;
    win = new BrowserWindow({
      width: 1400, height: 900, minWidth: 420, minHeight: 400,
      title: 'Layr', backgroundColor: '#e6eaee',
      icon: path.join(__dirname, 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.js') },
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
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('before-input-event', (_e, i) => {
      if (i.type !== 'keyDown') return;
      if (i.key === 'F11') win.setFullScreen(!win.isFullScreen());
      if (i.key === 'F12') win.webContents.toggleDevTools();
    });
  });
}

ipcMain.handle('initial-file', () => {
  if (!initialFile) return null;
  const r = readPdf(initialFile); initialFile = null; return r;
});
ipcMain.on('set-file', (_e, p) => { if (p) { savedPath = null; currentFile = path.resolve(p); lastDir = path.dirname(currentFile); addRecent(currentFile); } });
ipcMain.handle('save', async (_e, name, data, saveAs) => {
  if (!saveAs) {
    const t = quickTarget(name);
    writeSafe(t, data); savedPath = t; addRecent(t); return path.basename(t);
  }
  for (;;) {
    const r = await dialog.showSaveDialog(win, {
      title: T('Speichern unter'), defaultPath: savedPath || currentFile || path.join(lastDir, name),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return null;
    let target = r.filePath;
    if (!/\.pdf$/i.test(target)) target += '.pdf';
    writeSafe(target, data);
    lastDir = path.dirname(target);
    savedPath = path.resolve(target);
    addRecent(savedPath);
    return path.basename(target);
  }
});

// Speichern aktualisiert die geöffnete Datei selbst (wie bei Word). Die unbeschriftete Fassung steckt als
// Anhang in der PDF, Layr kann beim nächsten Öffnen also alles weiter bearbeiten oder wieder entfernen.
function quickTarget(name) { return savedPath || currentFile || path.resolve(path.join(lastDir, name)); }
// Erst in eine Hilfsdatei schreiben, dann umbenennen: so ist die Datei nie halb geschrieben
function writeSafe(t, data) { const tmp = t + '.layr-tmp'; fs.writeFileSync(tmp, Buffer.from(data)); fs.renameSync(tmp, t); }
// Fehlersuche-Protokoll nur mit LAYR_DEBUG=1 und nur im privaten Programmordner (es enthält gedrückte Tasten)
ipcMain.on('log', (_e, t) => { if (process.env.LAYR_DEBUG !== '1') return; try { fs.writeFileSync(path.join(app.getPath('userData'), 'debug-log.txt'), `${app.getVersion()}\n${t}`); } catch (e) {} });
ipcMain.on('new-doc', () => { savedPath = null; currentFile = null; });
ipcMain.handle('autosave', (_e, name, data, fresh) => {
  let t = quickTarget(name);
  if (fresh && !savedPath && !currentFile) { const b = t.replace(/\.pdf$/i, ''); let n = 2; while (fs.existsSync(t)) t = `${b} (${n++}).pdf`; }
  writeSafe(t, data); savedPath = t; addRecent(t);
  return path.basename(t);
});
ipcMain.handle('recent-list', () => {
  const r = recentLoad();
  return { on: r.on, items: r.items.map(x => ({ path: x.p, name: path.basename(x.p), dir: path.dirname(x.p), t: x.t, exists: fs.existsSync(x.p) })) };
});
// Öffnet nur Dateien, die wirklich in der Liste stehen
ipcMain.handle('recent-open', (_e, p) => {
  const r = recentLoad(); if (typeof p !== 'string' || !r.items.some(x => x.p === p)) return null;
  try { if (!fs.statSync(p).isFile()) return null; return readPdf(p); } catch (e) { return null; }
});
ipcMain.on('recent-remove', (_e, p) => { const r = recentLoad(); r.items = r.items.filter(x => x.p !== p); recentSave(); });
ipcMain.on('recent-clear', () => { const r = recentLoad(); r.items = []; recentSave(); try { app.clearRecentDocuments(); } catch (e) {} });
ipcMain.on('recent-enable', (_e, on) => { const r = recentLoad(); r.on = !!on; if (!r.on) { r.items = []; try { app.clearRecentDocuments(); } catch (e) {} } recentSave(); });

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
  return f && f.u.startsWith(`https://github.com/${REPO}/releases/download/`) ? f.u : null; };
ipcMain.handle('app-info', () => ({ version: app.getVersion(), platform: process.platform, repo: REPO, installLang: installLang() }));
ipcMain.on('set-lang', (_e, l) => { uiLang = l === 'en' ? 'en' : 'de'; try { fs.writeFileSync(langFile(), uiLang); } catch (e) {} });
ipcMain.handle('check-update', async () => {
  try {
    const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Layr-Update-Check' } });
    if (!r.ok) return { error: r.status };
    const j = await r.json(), v = String(j.tag_name || '').replace(/^v/i, '');
    if (!/^\d+\.\d+\.\d+$/.test(v)) return { error: 'keine Version' };
    return { version: v, newer: cmpVer(v, app.getVersion()) > 0, url: String(j.html_url || ''), asset: pickAsset(j.assets), name: String(j.name || ('Layr ' + v)).slice(0, 80), notes: String(j.body || '').slice(0, 600) };
  } catch (e) { return { error: String(e && e.message || e) }; }
});
// Nur Links auf die eigene GitHub-Seite öffnen
ipcMain.on('open-release', (_e, u) => {
  const ok = typeof u === 'string' && (u.startsWith(`https://github.com/${REPO}/releases/`) || u === `https://github.com/${REPO}`);
  shell.openExternal(ok ? u : `https://github.com/${REPO}/releases/latest`);
});

app.on('window-all-closed', () => app.quit());
