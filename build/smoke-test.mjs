// Rauchtest für den fertigen Build (läuft in GitHub Actions vor dem Hochladen):
// Startet Layr, verbindet sich über die Fernsteuerung (nur 127.0.0.1) und prüft Kernfunktionen.
// Aufruf: node build/smoke-test.mjs <Pfad zur Layr-Programmdatei>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';

const exe = process.argv[2];
if (!exe || !fs.existsSync(exe)) { console.error('Programmdatei fehlt: ' + exe); process.exit(2); }
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const PORT = 9339;
const args = [`--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1'];
if (process.platform === 'linux') args.push('--no-sandbox');
const env = { ...process.env, GTK_IM_MODULE: 'gtk-im-context-simple', XMODIFIERS: '@im=none' };
// Linux: fresh profile per run so objects stored by earlier runs (localStorage) cannot leak in; Windows keeps its profile (unverified, CI runs once)
const profile = process.platform === 'linux' ? fs.mkdtempSync(os.tmpdir() + '/layr-smoke-') : null;
if (profile) env.XDG_CONFIG_HOME = profile;
const proc = spawn(exe, args, { env, stdio: 'ignore' });
let failed = 0;
const ok = (name, cond, extra) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra !== undefined ? ' ' + JSON.stringify(extra) : ''}`); if (!cond) { failed++; if (process.env.GITHUB_ACTIONS) console.log(`::error title=Rauchtest::${String(name).replace(/[\r\n]/g, ' ')}${extra !== undefined ? ' ' + JSON.stringify(extra).replace(/[\r\n]/g, ' ') : ''}`); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const done = code => { try { proc.kill(); } catch (e) {} if (profile) setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }, 300); setTimeout(() => process.exit(code), 500); };
setTimeout(() => { console.error('Zeitüberschreitung'); done(1); }, 400000);

let target = null;
for (let i = 0; i < 90 && !target; i++) {
  await sleep(1000);
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); target = l.find(t => t.type === 'page' && /index\.html/.test(t.url)) || null; } catch (e) {}
}
if (!target) { ok('Layr startet und lädt die Oberfläche', false); done(1); }
else {
  ok('Layr startet und lädt die Oberfläche', true);
  const ws = new WebSocket(target.webSocketDebuggerUrl); let id = 0; const pend = new Map();
  ws.onmessage = m => { const j = JSON.parse(m.data); const r = pend.get(j.id); if (r) { pend.delete(j.id); r(j); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const ev = async (expr, timeout = 30000) => {
    const j = await Promise.race([new Promise(r => { pend.set(++id, r); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })); }), sleep(timeout).then(() => ({ timeout: true }))]);
    if (j.timeout) return { error: 'timeout' };
    if (j.result && j.result.exceptionDetails) return { error: (j.result.exceptionDetails.exception || {}).description || j.result.exceptionDetails.text };
    return j.result && j.result.result ? j.result.result.value : undefined;
  };
  const cdp = (method, params) => new Promise(r => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  // Wartet, bis der Ausdruck true ergibt (max. ms); Ausdruck muss boolesch sein
  const waitFor = async (expr, ms = 5000) => {
    for (let t = 0; t < ms; t += 50) { if (await ev(expr) === true) return true; await sleep(50); }
    return false;
  };
  for (let i = 0; i < 30; i++) { if (await ev("typeof S==='object'&&typeof openPdf==='function'&&typeof PDFLib==='object'") === true) break; await sleep(500); }
  const info = await ev('werkbank.appInfo()');
  ok('Version', info && info.version === version, info);
  // LAYR_STORE_TEST=1: Store-Modus. Ohne Variable muss die Store-Sperre aus sein; mit ihr greift keine Update-Abfrage.
  const store = process.env.LAYR_STORE_TEST === '1';
  ok(`Store-Modus ${store ? 'an' : 'aus'}`, info && info.store === store, info && info.store);
  ok('app-info liefert die Plattform', !!info && info.platform === process.platform, info && info.platform);
  if (store) {
    const upd = await ev('werkbank.checkUpdate()');
    ok('Store: Update-Abfrage ohne Netz abgelehnt', !!upd && upd.error === 'store' && Object.keys(upd).length === 1, upd);
    const st = await ev('werkbank.updState()');
    ok('Store: kein Selbst-Update', !!st && st.canInstall === false, st);
    ok('Store: Update-Knöpfe im Dialog ausgeblendet', await ev("document.getElementById('upAuto').closest('label').hidden&&['upNow','abGh','upHint'].every(i=>document.getElementById(i).hidden)") === true);
  }
  ok('pdf.js 6 geladen', String(await ev('pdfjsLib.version')).startsWith('6.'));
  ok('Content-Security-Policy aktiv', /wasm-unsafe-eval/.test(String(await ev("(document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')||{}).content"))));
  ok('Fremder Inline-Code gesperrt', await ev("new Promise(r=>{const s=document.createElement('script');s.textContent='window.__inl=1';document.head.appendChild(s);setTimeout(()=>r(window.__inl===undefined),300)})") === true);
  // Automatisch speichern aus: der Test schreibt keine Dateien in den Benutzerordner (Dokumente, zuletzt genutzter Ordner)
  await ev("localStorage.setItem('pdfwerkbank:autosave','0');S.autoSave=false");
  ok('Rauchtest: automatisches Speichern ist aus', await ev('S.autoSave===false') === true);
  const open = await ev("(async()=>{const d=await PDFLib.PDFDocument.create();const f=await d.embedFont(PDFLib.StandardFonts.Helvetica);d.addPage([595,842]).drawText('Rauchtest Router 10.0.0.1',{x:72,y:700,size:18,font:f});await openPdf(await d.save(),'Rauchtest.pdf');await new Promise(r=>setTimeout(r,1500));return [S.pages.length,!!S.pages[0].pdf]})()");
  ok('PDF öffnen und zeichnen', Array.isArray(open) && open[0] === 1, open);
  // Werkzeug- und Kopfzeilen-Icons liegen nach dem Laden und nach Größenänderung auf ganzen Pixeln
  const snapOk = "(async()=>{await new Promise(r=>setTimeout(r,300));return [...document.querySelectorAll('#tools svg.ph,header svg.ph')].map(e=>e.getBoundingClientRect()).filter(b=>b.width>0).every(b=>Math.abs(b.left-Math.round(b.left))<.01&&Math.abs(b.top-Math.round(b.top))<.01)})()";
  ok('Werkzeug- und Kopfzeilen-Icons auf ganzen Pixeln (geladen)', await ev(snapOk) === true);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1438, height: 900, deviceScaleFactor: 1, mobile: false });
  ok('Werkzeug- und Kopfzeilen-Icons auf ganzen Pixeln (1438 px)', await ev(snapOk) === true);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1901, height: 900, deviceScaleFactor: 1, mobile: false });
  ok('Werkzeug- und Kopfzeilen-Icons auf ganzen Pixeln (1901 px)', await ev(snapOk) === true);
  await cdp('Emulation.clearDeviceMetricsOverride', {});
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); // das neue Layout gilt erst ab 1200 px, das CI-Fenster kann kleiner sein
  ok('Schwebende Werkzeugleiste: Seitenleisten beginnen nicht unter der Leiste', await ev("(()=>{const r=document.documentElement,old=r.dataset.tbstyle;r.dataset.tbstyle='float';const t=document.querySelector('.tools').getBoundingClientRect().top,a=document.querySelector('.thumbs').getBoundingClientRect().top,b=document.querySelector('.panel').getBoundingClientRect().top;old===undefined?delete r.dataset.tbstyle:r.dataset.tbstyle=old;return a<=t+1&&b<=t+1})()") === true);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  ok('Fixed toolbar is centred over the viewer at 1440 px (panel/thumbs open and closed)', (await ev("(async()=>{const a=$('#app'),c=e=>{const b=e.getBoundingClientRect();return (b.left+b.right)/2},res=[],st=[a.classList.contains('no-panel'),a.classList.contains('show-thumbs')];for(const np of [0,1])for(const th of [0,1]){a.classList.toggle('no-panel',!!np);a.classList.toggle('show-thumbs',!!th);await new Promise(r=>setTimeout(r,700));{const bt=[...document.querySelectorAll('#tools>button')].map(e=>e.getBoundingClientRect()).filter(b=>b.width>0),v=viewer.getBoundingClientRect();res.push(Math.abs((bt[0].left+bt[bt.length-1].right)/2-(v.left+viewer.clientWidth/2))<=8)}}a.classList.toggle('no-panel',st[0]);a.classList.toggle('show-thumbs',st[1]);return res})()", 10000)).every(Boolean));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 900, deviceScaleFactor: 1, mobile: false });
  ok('Fixed toolbar is centred over the viewer at 1920 px (panel/thumbs open and closed)', (await ev("(async()=>{const a=$('#app'),c=e=>{const b=e.getBoundingClientRect();return (b.left+b.right)/2},res=[],st=[a.classList.contains('no-panel'),a.classList.contains('show-thumbs')];for(const np of [0,1])for(const th of [0,1]){a.classList.toggle('no-panel',!!np);a.classList.toggle('show-thumbs',!!th);await new Promise(r=>setTimeout(r,700));{const bt=[...document.querySelectorAll('#tools>button')].map(e=>e.getBoundingClientRect()).filter(b=>b.width>0),v=viewer.getBoundingClientRect();res.push(Math.abs((bt[0].left+bt[bt.length-1].right)/2-(v.left+viewer.clientWidth/2))<=8)}}a.classList.toggle('no-panel',st[0]);a.classList.toggle('show-thumbs',st[1]);return res})()", 10000)).every(Boolean));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  ok('Large density: toolbar does not overflow at 1200 px with thumbs and panel open', await ev("(async()=>{const r=document.documentElement,a=$('#app'),old=r.dataset.density,s0=[a.classList.contains('no-panel'),a.classList.contains('show-thumbs')];r.dataset.density='large';a.classList.remove('no-panel');a.classList.add('show-thumbs');await new Promise(r=>setTimeout(r,700));const t=$('.tools'),o=t.scrollWidth-t.clientWidth;a.classList.toggle('no-panel',s0[0]);a.classList.toggle('show-thumbs',s0[1]);old===undefined?delete r.dataset.density:r.dataset.density=old;return o})()", 10000) <= 0);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  ok('Large density: toolbar does not overflow at 1280 px with thumbs and panel open', await ev("(async()=>{const r=document.documentElement,a=$('#app'),old=r.dataset.density,s0=[a.classList.contains('no-panel'),a.classList.contains('show-thumbs')];r.dataset.density='large';a.classList.remove('no-panel');a.classList.add('show-thumbs');await new Promise(r=>setTimeout(r,700));const t=$('.tools'),o=t.scrollWidth-t.clientWidth;a.classList.toggle('no-panel',s0[0]);a.classList.toggle('show-thumbs',s0[1]);old===undefined?delete r.dataset.density:r.dataset.density=old;return o})()", 10000) <= 0);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 2, mobile: false });
  ok('Symbol tile images stay inside their tiles at 960 px (panel and Netzwerk popover)', JSON.stringify(await ev("(async()=>{const old=S.cat,bad=[];const chk=tag=>{for(const b of document.querySelectorAll('.symgrid .sym')){const t=b.getBoundingClientRect();if(!t.width)continue;const c=b.querySelector('canvas,svg').getBoundingClientRect();if(c.left<t.left-.5||c.right>t.right+.5)bad.push(tag+':'+(b.dataset.s||b.title))}};for(const c of ['Formen','Netzwerk','Topologien']){S.cat=c;buildCats();await new Promise(r=>setTimeout(r,80));chk('panel '+c)}S.cat='Netzwerk';openSymPop($('#tools'));await new Promise(r=>setTimeout(r,500));chk('pop');closeSymPop();S.cat=old;buildCats();return bad})()", 15000)) === '[]');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  ok('Symbol tile images stay inside their tiles at 1440 px (panel and Netzwerk popover)', JSON.stringify(await ev("(async()=>{const old=S.cat,bad=[];const chk=tag=>{for(const b of document.querySelectorAll('.symgrid .sym')){const t=b.getBoundingClientRect();if(!t.width)continue;const c=b.querySelector('canvas,svg').getBoundingClientRect();if(c.left<t.left-.5||c.right>t.right+.5)bad.push(tag+':'+(b.dataset.s||b.title))}};for(const c of ['Formen','Netzwerk','Topologien']){S.cat=c;buildCats();await new Promise(r=>setTimeout(r,80));chk('panel '+c)}S.cat='Netzwerk';openSymPop($('#tools'));await new Promise(r=>setTimeout(r,500));chk('pop');closeSymPop();S.cat=old;buildCats();return bad})()", 15000)) === '[]');
  ok('Symbol tiles: uniform 72x48 icon, name at most 2 lines', JSON.stringify(await ev("(async()=>{const old=S.cat;let bad=[];for(const c of CATS){S.cat=c;buildCats();await new Promise(r=>setTimeout(r,50));for(const b of document.querySelectorAll('#symgrid .sym:not(.tpl):not(.symtbl)')){const cv=b.querySelector('canvas').getBoundingClientRect(),sp=b.querySelector('span'),lh=parseFloat(getComputedStyle(sp).lineHeight);if(Math.round(cv.width)!==72||Math.round(cv.height)!==48||sp.getBoundingClientRect().height>2*lh+1)bad.push(c+':'+b.dataset.s)}}S.cat=old;buildCats();return bad})()", 15000)) === '[]');
  ok('Table tile only under Formen', JSON.stringify(await ev("(()=>{const old=S.cat,n=c=>{S.cat=c;buildCats();return document.querySelectorAll('#symgrid .symtbl').length},r=[n('Formen'),n('Topologien')];S.cat=old;buildCats();return r})()")) === '[1,0]');
  await cdp('Emulation.clearDeviceMetricsOverride', {});
  ok('PDF-Text aus dem Worker',await ev('S.doc.getPage(1).then(p=>p.getTextContent()).then(t=>t.items.map(x=>x.str).join(" "))').then(t => /Rauchtest Router/.test(String(t))));
  await ev("document.getElementById('langDlg').hidden=true"); // Erststart-Sprachdialog ist modal und sperrt die App; der Test arbeitet ohne ihn
  ok('Text auswählen: Textebene vorhanden', await ev("(async()=>{setTool('select');let s=[];for(let k=0;k<50&&!s.length;k++){await new Promise(r=>setTimeout(r,200));s=[...S.pages[0].el.querySelectorAll('.textLayer span')]}const hit=s.some(x=>x.textContent.includes('Router'));const under=S.pages[0].tl.nextSibling===S.pages[0].ink;getSelection().selectAllChildren(S.pages[0].el.querySelector('.textLayer'));const sel=String(getSelection()).includes('Router');setTool('pen');const gone=!document.querySelector('.textLayer');setTool('select');return hit&&under&&sel&&gone})()", 20000));
  ok('Text auswählen: Textebene nach Drehen wieder da', await ev("(async()=>{rotatePages([0],90);let s=[];for(let k=0;k<50&&!s.length;k++){await new Promise(r=>setTimeout(r,200));s=[...S.pages[0].el.querySelectorAll('.textLayer span')]}const hit=s.some(x=>x.textContent.includes('Router'));for(let k=0;k<50&&rbBusy;k++)await new Promise(r=>setTimeout(r,100));rotatePages([0],-90);for(let k=0;k<50&&(rbBusy||!S.pages[0].tl);k++)await new Promise(r=>setTimeout(r,100));for(let k=0;k<50&&!S.pages[0].el.querySelector('.textLayer span');k++)await new Promise(r=>setTimeout(r,200));const b=[...S.pages[0].el.querySelectorAll('.textLayer span')].find(x=>x.textContent.includes('Router')).getBoundingClientRect();return hit&&b.width>b.height})()", 20000));
  // Hover-Umschaltung im Auswählen-Werkzeug: Text nimmt die Maus, freie Fläche und Objekte bleiben bedienbar
  const hv = await ev("(()=>{const P=S.pages[0],r=P.el.getBoundingClientRect(),s=[...P.el.querySelectorAll('.textLayer span')].find(x=>x.textContent.includes('Router'));if(!s)return null;const b=s.getBoundingClientRect(),vb=Math.min(r.bottom,innerHeight);return {sp:[b.left,b.top,b.right,b.bottom],emp:[r.left+r.width*0.5,r.top+(vb-r.top)*0.8],pg:[r.left,r.top,r.width,r.height],z:S.zoom}})()");
  const mv = (x, y, b = 0) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: b ? 'left' : 'none', buttons: b });
  const pressAt = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  const dragTo = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
  const releaseAt = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  const inkNone = () => ev("S.pages[0].ink.style.pointerEvents");
  // Maus wie ein Nutzer: Bewegung mit 1 px Zittern, bis der Ink-Layer den gewünschten Zustand hat (max. 5 s)
  const pointUntil = async (x, y, want, extra = {}) => { const t0 = Date.now(); for (let k = 0; Date.now() - t0 < 5000; k++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + (k % 2), y, button: 'none', buttons: 0, ...extra }); if (await ev(`S.pages[0].ink.style.pointerEvents===${JSON.stringify(want)}`) === true) return true; await sleep(50); } return false; };
  const hoverText = (x, y, want = 'none') => pointUntil(x, y, want);
  // Zustand vor jedem Textauswahl-Test zurücksetzen: Auswahl, Editor, Textauswahl; Maus in die Ecke, Textebene wieder da
  const resetText = async () => { await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));getSelection().removeAllRanges();closeEditor();setSel(null);setTool('select')"); await mv(5, 5); await waitFor("!!(S.pages[0].tl&&S.pages[0].tl.querySelector('span'))"); };
  const sp = hv.sp, mid = [(sp[0] + sp[2]) / 2, (sp[1] + sp[3]) / 2];
  await hoverText(mid[0], mid[1]);
  const n1 = await inkNone();
  ok('Hover über Text: Ink lässt die Maus zum Text durch', n1 === 'none', n1);
  await pressAt(sp[0] + 2, mid[1]); await dragTo(sp[2] - 2, mid[1]); await releaseAt(sp[2] - 2, mid[1]);
  await waitFor("String(getSelection()).includes('Router')");
  ok('Ziehen über Text markiert Text, Auswahl enthält Router', await ev("String(getSelection()).includes('Router')") === true);
  await hoverText(hv.emp[0], hv.emp[1], '');
  const n2 = await inkNone();
  ok('Leere Seitenfläche: Ink wieder aktiv', n2 === '', n2);
  await ev("S.pages[0].objs.push({type:'rect',x:300,y:500,w:150,h:100,color:'#000000',lw:1,fill:'none',oid:'hvR'});redraw(0)");
  const Z = hv.z, pg = hv.pg;
  await pressAt(pg[0] + 280 * Z, pg[1] + 480 * Z); await dragTo(pg[0] + 470 * Z, pg[1] + 630 * Z); await releaseAt(pg[0] + 470 * Z, pg[1] + 630 * Z);
  await waitFor("(()=>{const R=S.pages[0].objs.find(o=>o.oid==='hvR');return !!S.sel&&selItems().includes(R)})()");
  ok('Lasso auf freier Fläche wählt Objekt aus', await ev("(()=>{const R=S.pages[0].objs.find(o=>o.oid==='hvR');return !!S.sel&&selItems().includes(R)})()") === true);
  await hoverText(mid[0], mid[1]);
  await ev("S.pages[0].objs.push({type:'rect',x:50,y:120,w:400,h:60,color:'#000000',lw:1,fill:'white',oid:'hvW'});redraw(0)");
  await hoverText(mid[0] + 1, mid[1], '');
  ok('Objekt über Text: Ink bleibt aktiv', await inkNone() === '', await inkNone());
  await pressAt(mid[0], mid[1]); await releaseAt(mid[0], mid[1]);
  await waitFor("(()=>{const W=S.pages[0].objs.find(o=>o.oid==='hvW');return !!S.sel&&selItems().includes(W)})()");
  ok('Klick auf Objekt über Text wählt es aus', await ev("(()=>{const W=S.pages[0].objs.find(o=>o.oid==='hvW');return !!S.sel&&selItems().includes(W)})()") === true);
  await hoverText(mid[0], mid[1], '');
  await ev("setTool('pen')");
  const pb = await ev("S.pages[0].objs.length");
  await pressAt(hv.emp[0], hv.emp[1]); await dragTo(hv.emp[0] + 40, hv.emp[1] + 20); await releaseAt(hv.emp[0] + 40, hv.emp[1] + 20);
  await waitFor(`S.pages[0].objs.length===${pb}+1&&S.pages[0].objs[S.pages[0].objs.length-1].type==='pen'`);
  ok('Stift nach Hover über Text zeichnet', await ev(`S.pages[0].objs.length===${pb}+1&&S.pages[0].objs[S.pages[0].objs.length-1].type==='pen'`) === true);
  await ev(`setTool('select');S.pages[0].objs.length=${pb};S.pages[0].objs=S.pages[0].objs.filter(o=>!['hvR','hvW'].includes(o.oid));redraw(0)`);
  await waitFor("!!(S.pages[0].tl&&S.pages[0].tl.querySelector('span'))");
  await hoverText(mid[0], mid[1]);
  await ev("S.pages[0].el.dispatchEvent(new PointerEvent('pointerleave',{buttons:0}))");
  await waitFor("S.pages[0].ink.style.pointerEvents===''");
  ok('Seite verlassen: Ink wieder aktiv', await inkNone() === '', await inkNone());
  // Objekt und Textauswahl schließen sich aus; Esc und Strg+A arbeiten auf der Textauswahl
  await resetText();
  await ev("S.pages[0].objs.push({type:'rect',x:300,y:500,w:150,h:100,color:'#000000',lw:1,fill:'none',oid:'hvR'});redraw(0);setSel({p:0,o:S.pages[0].objs.find(o=>o.oid==='hvR')})");
  await hoverText(mid[0], mid[1]);
  await pressAt(sp[0] + 2, mid[1]); await dragTo(sp[2] - 2, mid[1]); await releaseAt(sp[2] - 2, mid[1]);
  await waitFor("S.sel===null&&String(getSelection()).includes('Router')");
  ok('Textauswahl hebt Objektauswahl auf', await ev("S.sel===null&&String(getSelection()).includes('Router')") === true);
  await ev("setSel({p:0,o:S.pages[0].objs.find(o=>o.oid==='hvR')})");
  ok('Objektauswahl hebt Textauswahl auf', await ev("String(getSelection())===''") === true);
  await hoverText(mid[0], mid[1]);
  await pressAt(sp[0] + 2, mid[1]); await dragTo(sp[2] - 2, mid[1]); await releaseAt(sp[2] - 2, mid[1]);
  await waitFor("String(getSelection()).includes('Router')");
  await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
  ok('Esc hebt Textauswahl auf', await ev("String(getSelection())===''") === true);
  await ev("getSelection().selectAllChildren(S.pages[0].tl)");
  await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true}))");
  ok('Strg+A in Textauswahl wählt Text, nicht Objekte', await ev("String(getSelection()).includes('Router')&&S.sel===null") === true);
  await ev("getSelection().removeAllRanges();setTool('pen');setTool('select');S.pages[0].objs=S.pages[0].objs.filter(o=>o.oid!=='hvR');setSel(null);redraw(0)");
  await waitFor("!!(S.pages[0].tl&&S.pages[0].tl.querySelector('span'))");
  ok('Text auswählen: Drehregel für gedrehte Seiten', await ev("(()=>{const d=document.createElement('div');d.className='textLayer';d.dataset.mainRotation='90';document.body.appendChild(d);const t=getComputedStyle(d).transform;d.remove();return t.startsWith('matrix')})()") === true);
  const out = await ev("(async()=>{S.pages[0].objs.push({type:'text',x:72,y:300,text:'Kopierbarer Text',fs:16,color:'#1b1f24',orient:'h',lw:0,spans:[{a:0,b:9,color:'#d62828'}]});redraw(0);const out=await buildOutput();const d=await pdfOpen(out.slice());const t=await (await d.getPage(1)).getTextContent();return t.items.map(x=>x.str).join('|')})()", 60000);
  ok('Speichern mit kopierbarem Text', /Kopierbarer Text/.test(String(out)), String(out).slice(-80));
  ok('Tabelle wird als Text kopiert', await ev("(()=>{const t={type:'table',x:50,y:50,w:200,h:60,rows:1,cols:2,cw:[.5,.5],rh:[1],cells:[['Zelle A','Zelle B']],fs:12,color:'#000000',lw:1,head:false,fill:'none'};S.pages[0].objs.push(t);selectItems(0,[t]);const r=copySel()&&JSON.parse(CLIP.objs).some(o=>o.type==='table')&&clipText()==='Zelle A\\tZelle B';S.pages[0].objs=S.pages[0].objs.filter(o=>o!==t);setSel(null);return r})()") === true);
  ok('Tabellenzelle mit Tab und Zeilenumbruch wird in Anführungszeichen kopiert', await ev("(()=>{const t={type:'table',x:50,y:50,w:200,h:60,rows:1,cols:2,cw:[.5,.5],rh:[1],cells:[['a\\tb','c\\nd']],fs:12,color:'#000000',lw:1,head:false,fill:'none'};S.pages[0].objs.push(t);selectItems(0,[t]);const r=copySel()&&clipText()==='\"a\\tb\"\\t\"c\\nd\"';S.pages[0].objs=S.pages[0].objs.filter(o=>o!==t);setSel(null);return r})()") === true);
  ok('Tabellentext: eine Zeile zentriert, mehrere Zeilen oben bündig', await ev("cellY0(100,14,16,1)===107&&cellY0(100,14,16,5)===110&&cellY0(100,60,16,1)===130&&cellY0(100,60,16,2)===122") === true);
  ok('Textbox bleibt auf der Seite', await ev("(()=>{newText(0,560,830);ED.eng.put('Wort '.repeat(20));const o=ED.o,P=S.pages[0],b=bbox(o);closeEditor();return b.x>=0&&b.y>=0&&b.x+b.w<=P.w+.5&&b.y+b.h<=P.h+.5})()") === true);
  ok('Neue Textbox bleibt nur mit Einstellung ausgewählt', await ev("(()=>{const s=keepSelOn,P=S.pages[0];keepSelOn=false;setSel(null);newText(0,300,400);ED.eng.put('Test');ED.esc();const a=!S.sel;keepSelOn=true;newText(0,300,400);ED.eng.put('Test');ED.esc();const b=!!S.sel&&S.sel.o===P.objs[P.objs.length-1];keepSelOn=s;setSel(null);return a&&b})()") === true);
  ok('Sperr-Flag bleibt nur bei echtem true erhalten', await ev("sanObj({type:'rect',x:0,y:0,w:9,h:9,color:'#000000',locked:'x'}).locked===undefined&&sanObj({type:'rect',x:0,y:0,w:9,h:9,color:'#000000',locked:true}).locked===true") === true);
  ok('Gesperrte Objekte bleiben beim Verschieben, ohne Griffe und beim Löschen stehen', await ev("(()=>{const P=S.pages[0];const a={type:'rect',x:10,y:10,w:20,h:20,color:'#000000',lw:1,fill:'none',locked:true},b={type:'rect',x:100,y:100,w:20,h:20,color:'#000000',lw:1,fill:'none'};P.objs.push(a,b);moveObj({type:'group',items:[a,b],lw:0,color:'#000000'},5,5);const r1=a.x===10&&b.x===105;const r2=handles(a).length===0;setSel({p:0,o:a});delSel();const r3=P.objs.includes(a);P.objs=P.objs.filter(o=>o!==a&&o!==b);setSel(null);return r1&&r2&&r3})()") === true);
  ok('Gesperrtes Objekt: Klicks gehen durch, wenn die Einstellung an ist', await ev("(()=>{const o={type:'rect',x:0,y:0,w:50,h:50,color:'#000000',lw:1,fill:'white',locked:true};const s=lockPassOn;lockPassOn=true;const a=hit(o,25,25,1);lockPassOn=false;const b=hit(o,25,25,1);lockPassOn=s;return !a&&b})()") === true);
  ok('Langes Wort in Tabellenzelle bricht um', await ev("(()=>{const o={type:'table',x:50,y:50,w:200,h:60,rows:1,cols:2,cw:[.5,.5],rh:[1],cells:[['g'.repeat(80),'']],fs:12,color:'#000000',lw:1,head:false,fill:'none'};const cw=tblCols(o)[1]-tblCols(o)[0];mctx.font=`12px ${famOf(o)}`;const L=wrapLines(mctx,o.cells[0][0],Math.max(10,cw-8));return L.length>1&&L.every(l=>mctx.measureText(l).width<=cw-8+.5)})()") === true);
  ok('Langes Wort bricht um', await ev("(()=>{newText(0,300,400);ED.eng.put('f'.repeat(300));const o=ED.o,P=S.pages[0];if(o.wrapW===undefined)o.wrapW=200;const g=hGeo(o);mctx.font=tfont(o);const fit=g.b.lines.every(l=>mctx.measureText(l).width<=o.wrapW+.5);let rt=true;for(let i=0;i<=o.text.length;i++){const p=idxPos(o,g,i);if(posIdx(o,g,p.x,p.y+g.b.lh/2)!==i)rt=false}const b=bbox(o);closeEditor();return g.b.lines.length>1&&fit&&rt&&b.x+b.w<=P.w+.5})()") === true);
  ok('Langes Wort bricht verlustfrei um', await ev("(()=>{newText(0,300,400);ED.eng.put('ab '+'f'.repeat(300)+' cd');const o=ED.o;if(o.wrapW===undefined)o.wrapW=200;const L=hGeo(o).b.lines;let s='';L.forEach((l,k)=>{s+=l;if(k<L.length-1&&wrapGap(L,k))s+=' '});closeEditor();return s===o.text&&L.some(l=>/f cd$/.test(l))})()") === true);
  const wrapSpeed = await ev("(()=>{newText(0,300,400);ED.eng.put('x'.repeat(200000));const o=ED.o;if(o.wrapW===undefined)o.wrapW=200;const t0=performance.now();const L=hGeo(o).b.lines;const ms=performance.now()-t0;closeEditor();return {ms:Math.round(ms),lines:L.length}})()", 60000);
  ok('Sehr langes Wort wird in unter 1,5 s umgebrochen', wrapSpeed.ms < 1500 && wrapSpeed.lines > 1, wrapSpeed);
  ok('IT-Rechner', await ev("(()=>{openCalcDlg('num');const r=CALC.res&&CALC.res.rows[1][1];closeCalcDlg();return r})()") === '1100 1010');
  const asr = await ev('werkbank.asrProbe()', 60000);
  ok('Spracherkennung (sherpa-onnx) lädt im Hilfsprozess', asr && asr.ok === true && /^1\./.test(String(asr.version)), asr);
  ok('Diktier-Knopf vorhanden, Modell nicht mitgeliefert', await ev("(async()=>!document.getElementById('bMic').hidden&&!(await werkbank.asrState()).installed)()") === true);
  ok('Nur eigene Programmfunktionen', await ev("typeof require==='undefined'&&typeof process==='undefined'") === true);
  ok('Linienbeschriftung zählt zu Rahmen und Treffer', await ev("(()=>{const o={type:'line',x1:0,y1:0,x2:100,y2:0,color:'#000000',lw:1,label:'«include»'};return bbox(o).h>5&&hit(o,50,-6,1)})()") === true);
  ok('Linie ohne Beschriftung hat keinen Beschriftungskasten', await ev("lineLblBox({type:'line',x1:0,y1:0,x2:1,y2:0})===null") === true);
  ok('Linienbeschriftung wird auf 200 Zeichen gekürzt', await ev("sanObj({type:'line',x1:0,y1:0,x2:1,y2:1,color:'#000000',label:'x'.repeat(500)}).label.length===200") === true);
  ok('Mehrere Linien an einer Seite werden verteilt, eine Linie bleibt in der Mitte', await ev("(()=>{const mk=(oid,x,y)=>({type:'rect',oid,x,y,w:100,h:40});const A=mk('tA',100,0),B=mk('tB',0,200),C=mk('tC',200,200);const L1={type:'line',x1:150,y1:40,x2:50,y2:200,link:{a:'tA',b:'tB',ta:'auto',tb:'auto'}},L2={type:'line',x1:150,y1:40,x2:250,y2:200,link:{a:'tA',b:'tC',ta:'auto',tb:'auto'}};orgRelink({objs:[A,B,C,L1,L2]});const S1={type:'line',x1:0,y1:0,x2:50,y2:200,link:{a:'tA',b:'tB',ta:'auto',tb:'auto'}};orgRelink({objs:[mk('tA',100,0),mk('tB',0,200),S1]});return L1.x1!==L2.x1&&L1.y1===40&&L2.y1===40&&L1.x1>100&&L2.x1<200&&S1.x1===150&&S1.y1===40})()") === true);
  ok('Organigramm-Vorlage: Linien mit fester Seite bleiben am Wurzelkasten unverändert', await ev("(()=>{const o=ORG_TPL.find(t=>t.k==='einlinie').b();const r=o.find(x=>x.sym==='org_lead');orgRelink({objs:o});const q=orgAnchor(r,'b');const ls=o.filter(x=>x.type==='line'&&x.link.a===r.oid);return ls.length===3&&ls.every(l=>l.x1===q[0]&&l.y1===q[1])})()") === true);
  ok('Gekreuzte Linien zwischen zwei Kästen springen beim Neuzeichnen nicht', await ev("(()=>{const A={type:'rect',oid:'dA',x:100,y:0,w:100,h:40},B={type:'rect',oid:'dB',x:50,y:200,w:200,h:40};const L1={type:'line',x1:180,y1:40,x2:80,y2:200,link:{a:'dA',b:'dB',ta:'auto',tb:'auto'}},L2={type:'line',x1:120,y1:40,x2:220,y2:200,link:{a:'dA',b:'dB',ta:'auto',tb:'auto'}};const P={objs:[A,B,L1,L2]};const s=[];for(let i=0;i<6;i++){orgRelink(P);s.push(JSON.stringify([L1.x1,L1.y1,L1.x2,L1.y2,L2.x1,L2.y1,L2.x2,L2.y2]))}return s[4]===s[5]&&(L1.x1<L2.x1)===(L1.x2<L2.x2)})()") === true);
  ok('Festpunkte t1, t und r3 liegen an der richtigen Stelle', await ev("JSON.stringify([orgAnchor({type:'rect',x:0,y:0,w:100,h:40},'t1'),orgAnchor({type:'rect',x:0,y:0,w:100,h:40},'t'),orgAnchor({type:'rect',x:0,y:0,w:100,h:40},'r3')])") === '[[25,0],[50,0],[100,30]]');
  ok('Ellipsen bekommen keine Festpunkte auf Dritteln, eckige Symbole schon', await ev("(()=>{const E={type:'sym',sym:'usecase',x:0,y:0,w:100,h:40},R={type:'sym',sym:'org_unit',x:0,y:0,w:100,h:40};return anchorRect(E)===false&&anchorRect(R)===true&&JSON.stringify(orgAnchor(E,'t1'))===JSON.stringify(orgAnchor(E,'t'))&&orgAnchor(R,'t1')[0]===25})()") === true);
  ok('Ablegen an der Seitenmitte bleibt automatisch, Ecken-Drittel werden Festpunkt', await ev("(()=>{const R={type:'rect',x:0,y:0,w:100,h:40};return pickAnchor(R,50,0)==='auto'&&pickAnchor(R,25,0)==='t1'&&pickAnchor(R,100,30)==='r3'})()") === true);
  ok('Andock-Hinweis zeigt auf kleinen Kästen nur die Seitenmitten', await ev("(()=>{let n=0;const c={save(){},restore(){},strokeRect(){},setLineDash(){},beginPath(){},arc(){n++},fill(){},stroke(){}};const d=(w,h)=>{n=0;drawDockHint(c,{type:'rect',x:0,y:0,w,h});return n};return d(30,30)===4&&d(100,100)===12})()") === true);
  ok('Festpunkt wird auf schmalen Kästen nicht gefangen', await ev("(()=>{const R={type:'rect',x:0,y:0,w:30,h:100};return pickAnchor(R,7.5,0)==='auto'})()") === true);
  ok('Gedrehter Text: Hülle tauscht Breite und Höhe, ohne Drehung unverändert', await ev("(()=>{const o={type:'text',x:10,y:20,text:'Abc',fs:16,color:'#000000',orient:'h',lw:0};const a=bbox(o),l=boxOf(o);o.rot=90;const b=bbox(o);return Math.abs(b.w-a.h)<0.01&&Math.abs(b.h-a.w)<0.01&&Math.abs(b.x+b.w/2-(a.x+a.w/2))<0.01&&l.w===a.w&&l.h===a.h&&boxOf(o).w===a.w})()") === true);
  ok('Gedrehter Text trifft in seinen eigenen Achsen, nicht in der Hülle', await ev("(()=>{const o={type:'text',x:100,y:100,text:'Ein langer Text',fs:16,color:'#000000',orient:'h',lw:0,rot:45};const t=textBox(o),cx=o.x+t.w/2,cy=o.y+t.h/2,b=bbox(o);return hit(o,cx,cy,2)&&!hit(o,b.x+0.5,b.y+0.5,2)})()") === true);
  ok('Gedrehtes Textfeld: Drehgriff oben, am gedrehten Ort, gesperrt ohne Griffe', await ev("(()=>{const o={type:'text',x:100,y:100,text:'Ein langer Text',fs:16,color:'#000000',orient:'h',lw:0};const t=textBox(o),cx=o.x+t.w/2,cy=o.y+t.h/2,r=handles(o).find(h=>h.k==='rot');const u=!!r&&Math.abs(r.x-cx)<0.01&&Math.abs(r.y-(o.y-22/S.zoom))<0.01;o.rot=90;const q=handles(o).find(h=>h.k==='rot');return u&&!!q&&Math.abs(q.x-(cx+t.h/2+22/S.zoom))<0.01&&Math.abs(q.y-cy)<0.01&&handles({...o,locked:true}).length===0})()") === true);
  ok('Gedrehter Text bleibt mit seiner Hülle auf der Seite', await ev("(()=>{const P={w:300,h:200};const o={type:'text',x:250,y:150,text:'Ein langer Text',fs:16,color:'#000000',orient:'h',lw:0,rot:45};textClamp(o,P,false);const b=bbox(o);return b.x>=-0.01&&b.y>=-0.01&&b.x+b.w<=P.w+0.01&&b.y+b.h<=P.h+0.01})()") === true);
  ok('Drehwinkel wird beim Laden geprüft: ungültig fällt weg, zu groß wird begrenzt', await ev("(()=>{const T=rot=>sanObj({type:'text',x:1,y:2,text:'A',fs:14,orient:'h',rot});return T('x').rot===undefined&&T(999).rot===360&&T(0).rot===undefined&&T(-45).rot===-45})()") === true);
  ok('Drehgriff: Winkel aus dem Zeiger um die Mitte, Shift rastet auf 15 Grad ein', await ev("(()=>{const o={type:'text',x:0,y:0,text:'Ein',fs:16,color:'#000000',orient:'h',lw:0};const t=textBox(o);o.x=100-t.w/2;o.y=100-t.h/2;const R=(x,y,s)=>rotFromPointer(o,x,y,s),p=deg=>[100+100*Math.cos(deg*Math.PI/180),100+100*Math.sin(deg*Math.PI/180)];const q=p(-53);return R(200,100)===90&&R(100,0)===0&&R(0,100)===-90&&R(100,200)===-180&&R(q[0],q[1],true)===30})()") === true);
  ok('Drehgriff: weicher Einrast bei 3 Grad neben 90, nicht bei 8 Grad, Alt (frei) schaltet alles ab', await ev("(()=>{const o={type:'text',x:0,y:0,text:'Ein',fs:16,color:'#000000',orient:'h',lw:0};const t=textBox(o);o.x=100-t.w/2;o.y=100-t.h/2;const R=(x,y,s,f)=>rotFromPointer(o,x,y,s,f),p=deg=>[100+100*Math.cos((deg-90)*Math.PI/180),100+100*Math.sin((deg-90)*Math.PI/180)];const a=p(93),b=p(98);return R(a[0],a[1])===90&&R(b[0],b[1])===98&&R(a[0],a[1],false,true)===93&&R(a[0],a[1],true)===90&&R(p(97)[0],p(97)[1],true)===90})()") === true);
  ok('Gedrehter Text: Resize an der Mittelkante lässt die gegenüberliegende Kante fest', await ev("(()=>{const o={type:'text',x:0,y:0,text:'Ein langer Text',fs:16,color:'#000000',orient:'h',lw:0,rot:90};const t=textBox(o);o.x=100-t.w/2;o.y=100-t.h/2;const st={orig:JSON.parse(JSON.stringify(o)),mode:'mr',ob:boxOf(o)};const G=(x,y)=>{const c=tCtr(o);return rotP(x,y,c[0],c[1],o.rot)};const L0=G(o.x,o.y+textBox(o).h/2);const t0=textBox(o);const P=G(o.x+t0.w+20,o.y+t0.h/2);resizeRotated(o,st,P[0],P[1],false);const L1=G(o.x,o.y+textBox(o).h/2);return Math.abs(L0[0]-L1[0])<0.01&&Math.abs(L0[1]-L1[1])<0.01&&Math.abs(textBox(o).w-(t0.w+20))<0.01})()") === true);
  ok('Verbindung behält gültige Festpunkte und setzt unbekannte auf auto', await ev("(()=>{const r=sanObj({type:'line',x1:0,y1:0,x2:1,y2:1,color:'#000000',link:{a:'x',b:'y',ta:'t2',tb:'junk'}});return r.link.ta==='t2'&&r.link.tb==='auto'})()") === true);
  ok('Gespeicherte Linien: Winkelanker a0..a359 bleiben, ungültige Winkel fallen auf auto', await ev("(()=>{const T=t=>sanObj({type:'line',x1:0,y1:0,x2:1,y2:1,color:'#000000',link:{a:'x',b:'y',ta:t,tb:'auto'}}).link.ta;return T('a120')==='a120'&&T('a359')==='a359'&&T('a360')==='auto'&&T('a1200')==='auto'&&T('x')==='auto'})()") === true);
  ok('Winkelanker am Ellipsenrand: a30 liegt auf der Kurve', await ev("(()=>{const o={type:'ellipse',x:100,y:100,w:100,h:52};const q=orgAnchor(o,'a30');return Math.abs(((q[0]-150)/50)**2+((q[1]-126)/26)**2-1)<0.02})()") === true);
  ok('Einrasten: Pfeilende nah am Winkelanker nimmt a30, Seitenmitte wird auto', await ev("(()=>{const o={type:'ellipse',x:100,y:100,w:100,h:52};const S0=S.zoom;S.zoom=1;const q=orgAnchor(o,'a30');const r=[pickAnchor(o,q[0]+2,q[1]-2),pickAnchor(o,...orgAnchor(o,'a270'))];S.zoom=S0;return r[0]==='a30'&&r[1]==='auto'})()") === true);
  ok('Jede Phosphor-Icon-Referenz zeigt auf ein vorhandenes Symbol', await ev("(()=>{const u=[...document.querySelectorAll('use')].map(e=>e.getAttribute('href')||'').filter(h=>h.startsWith('#ph-'));return u.length>0&&u.every(h=>document.querySelector(h)?.tagName.toLowerCase()==='symbol')})()") === true);
  ok('Werkzeugleiste: sichtbare Werkzeuge zeigen Icons mit Fläche', await ev("(()=>{const v=[...document.querySelectorAll('#tools .tool')].filter(b=>b.offsetWidth>0).map(b=>b.querySelector('svg')).filter(Boolean);return v.length>0&&v.every(e=>e.getBBox().width>0)})()") === true);
  ok('Alle Icon-Namen aus HM_IC, TB_HDR und TOOLS haben ein Symbol im Sprite', await ev("(()=>{const t=[...Object.values(HM_IC),...TB_HDR.map(x=>x.ic),...TOOLS.filter(x=>x!=='-').flatMap(x=>[...String(x.i).matchAll(/#((?:ph|ly)-[a-z0-9-]+)/g)].map(m=>m[1]))];return t.length>0&&t.every(n=>!!document.getElementById(/^(ph|ly)-/.test(n)?n:'ph-'+n))})()") === true);
  ok('Messen-Werkzeug entfernt, Werkzeugleiste baut sich auf', await ev("(()=>!TOOLS.some(t=>t&&t.id==='measure')&&!document.querySelector('.tool[data-t=measure]')&&document.querySelectorAll('#tools .tool').length>5)()") === true);
  // Textebene: schneller Werkzeugwechsel darf keinen doppelten Text erzeugen
  await ev("setTool('pen');setTool('select');setTool('pen');setTool('select')");
  await waitFor("!!(S.pages[0].tl&&S.pages[0].tl.querySelector('span'))");
  await sleep(1500);
  ok('Textebene nach schnellem Werkzeugwechsel: Text genau einmal', await ev("(S.pages[0].tl.textContent.match(/Router/g)||[]).length===1") === true);
  // Seite ohne Ink-Layer (PDF lädt noch) darf Werkzeugwechsel und Esc nicht stören
  ok('Werkzeugwechsel und Esc mit Seite ohne Ink-Layer werfen nicht', await ev("(()=>{S.pages.push({objs:[],w:1,h:1});try{setTool('pen');setTool('select');window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return true}finally{S.pages.pop()}})()") === true);
  await resetText();
  // Alt gedrückt: Ink bleibt aktiv, Lasso über Text möglich
  await hoverText(mid[0], mid[1]);
  await pointUntil(mid[0] + 1, mid[1], '', { modifiers: 1 });
  ok('Alt über Text: Ink bleibt aktiv', await inkNone() === '', await inkNone());
  // Alt allein (ohne Mausbewegung) über Text: Ink wird wieder frei, sonst markiert Ziehen Text statt Lasso
  await hoverText(mid[0], mid[1]);
  const altPre = await inkNone();
  await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Alt'}))");
  const altPost = await inkNone();
  ok('Alt-Taste ohne Mausbewegung über Text: Ink wieder aktiv', altPre === 'none' && altPost === '', { altPre, altPost });
  // Rechtsklick auf gesperrtes Objekt über Text öffnet das Objektmenü (Klicks gehen durch)
  await resetText();
  await ev("S.pages[0].objs.push({type:'rect',x:50,y:120,w:400,h:60,color:'#000000',lw:1,fill:'white',locked:true,oid:'hvL'});redraw(0);lockPassOn=true;window.__om=0;window.__omOrig=objMenu;objMenu=()=>{window.__om++}");
  await hoverText(mid[0], mid[1]);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: mid[0], y: mid[1], button: 'right', buttons: 2, clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mid[0], y: mid[1], button: 'right', buttons: 0, clickCount: 1 });
  await waitFor("window.__om>0");
  ok('Rechtsklick auf gesperrtes Objekt über Text öffnet Objektmenü', await ev("window.__om>0") === true);
  await ev("objMenu=window.__omOrig;lockPassOn=false;S.pages[0].objs=S.pages[0].objs.filter(o=>o.oid!=='hvL');setSel(null);redraw(0)");
  ok('Werkzeug Text auswählen (Y) entfernt', await ev("!TOOLS.some(t=>t&&t.id==='textsel')&&!document.querySelector('.tool[data-t=textsel]')&&!('y' in KEYS)") === true);
  // Seitenleiste: Seite verschieben baut die Vorschau ohne leere Bilder und ohne Verlust der Bilder neu auf
  const thWas = await ev('thumbsOn');
  await ev("(async()=>{const d=await PDFLib.PDFDocument.create();const f=await d.embedFont(PDFLib.StandardFonts.Helvetica);for(let k=1;k<=6;k++)d.addPage([595,842]).drawText('P'+k,{x:72,y:700,size:40,font:f});await openPdf(await d.save(),'Blaettern.pdf');S.pages[2].objs.push({type:'rect',x:100,y:300,w:150,h:100,color:'#000000',lw:1,fill:'none',oid:'mv'});redraw(2);return S.pages.length})()");
  await ev("(async()=>{if(thumbsOn)toggleThumbs(false);await new Promise(r=>setTimeout(r,400));toggleThumbs(true);return true})()");
  ok('Seitenleiste: Vorschau fertig', await waitFor("S.pages.length===6&&S.pages.every(P=>P.thumbBase)", 8000));
  const mo = await ev('motionOff()');
  ok('Seitenleiste: Einblend-Klasse nach der Animation entfernt', mo === true || await waitFor("!$('#thumbs').classList.contains('bar-in')", 2500), mo);
  ok('Seitenleiste: alle Seiten gerendert', await waitFor("[...document.querySelectorAll('#pages canvas.pdf')].every(c=>c.width!==300||c.height!==150)", 8000));
  await ev("(()=>{window.__smp={on:true,blank:0,nob:0};const f=()=>{const n=[...document.querySelectorAll('#pages canvas.pdf')].filter(c=>c.width===300&&c.height===150).length,m=S.pages.filter(P=>P.el&&!P.thumbBase).length;window.__smp.blank=Math.max(window.__smp.blank,n);window.__smp.nob=Math.max(window.__smp.nob,m);if(window.__smp.on)requestAnimationFrame(f)};requestAnimationFrame(f);return true})()");
  const mvU = await ev("(async()=>{const u=H.u.length;TM.sel=2;thMove(1);await thFlush();await new Promise(r=>setTimeout(r,500));return [u,H.u.length]})()");
  const sm = await ev("(()=>{window.__smp.on=false;return {blank:window.__smp.blank,nob:window.__smp.nob}})()");
  ok('Seitenleiste: Verschieben zeigt keine leeren Seitenbilder', sm.blank === 0, sm);
  ok('Seitenleiste: keine Vorschau verliert ihr Bild beim Verschieben', sm.nob === 0, sm);
  ok('Seitenleiste: verschobene Seite steht auf Position 4', await ev("S.doc.getPage(4).then(p=>p.getTextContent()).then(t=>t.items.map(x=>x.str).join(' ').includes('P3'))") === true);
  ok('Seitenleiste: Objekt wandert mit seiner Seite', await ev("S.pages[3].objs.some(o=>o.oid==='mv')") === true);
  ok('Seitenleiste: Verschieben ist genau ein Rückgängig-Schritt', mvU[1] - mvU[0] === 1, mvU);
  await ev("undo()");
  ok('Seitenleiste: Rückgängig stellt Seite 3 mit Objekt wieder her', await waitFor("(async()=>{const t=await (await S.doc.getPage(3)).getTextContent();return t.items.map(x=>x.str).join(' ').includes('P3')&&S.pages[2].objs.some(o=>o.oid==='mv')})()", 8000));
  await ev(`toggleThumbs(${thWas})`);
  // Gespeicherte Einstellungen mit dem alten Werkzeug dürfen nicht stören
  await ev("localStorage.setItem('pdfwerkbank:toolbar',JSON.stringify({hidden:['textsel'],known:['textsel']}));localStorage.setItem('pdfwerkbank:keys',JSON.stringify({'tool:textsel':'Y'}));location.reload()");
  await sleep(4000);
  for (let i = 0; i < 30; i++) { if (await ev("typeof S==='object'&&typeof openPdf==='function'") === true) break; await sleep(500); }
  ok('Alte Werkzeug-Einstellung (textsel) stört nicht: Werkzeugleiste baut sich auf', await ev("document.querySelectorAll('#tools .tool').length>5&&!document.querySelector('.tool[data-t=textsel]')&&typeof setTool==='function'") === true);
  // Text-Leiste: Standard wie früher; ausgeblendeter Knopf bleibt funktionsfähig
  ok('Text-Leiste: Standard zeigt 11 Knöpfe in Standardreihenfolge mit 3 Trennern', await ev("(()=>{design.qbarOrder=QB_IDS.slice();design.qbarHide=[];newText(0,120,200);ED.eng.put('Hallo');const bar=document.querySelector('.edbar');const r=[bar.querySelectorAll(':scope>.edsep').length,[...bar.querySelectorAll('[data-a]')].filter(b=>!b.closest('.edoff')).map(b=>b.dataset.a).join()];closeEditor();return r[0]===3&&r[1]==='font,dn,up,bold,it,ul,lb,ln,out,in,col,bg,chars,del'})()") === true);
  ok('Text-Leiste: ausgeblendeter Fett-Knopf ist unsichtbar, Fett und Strg+B wirken trotzdem', await ev("(()=>{design.qbarHide=['bold'];newText(0,120,200);ED.eng.put('Hallo');const vis=document.querySelector('.edbar [data-a=bold]').getClientRects().length>0;ED.set({bold:true});const a=ED.o.bold===true;ED.set({bold:false});document.querySelector('.tbx-in').dispatchEvent(new KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true}));const c=ED.o.bold===true;closeEditor();design.qbarHide=[];return !vis&&a&&c})()") === true);
  ok('Kursiv: Knopf und Strg+I schalten um (auch ausgeblendet), Strg+B/U bleiben, tfont/sanObj/Verlauf stimmen', await ev("(()=>{const n0=S.pages[0].objs.length;design.qbarHide=['it','bold','ul'];newText(0,120,200);ED.eng.put('Hallo');const ta=document.querySelector('.tbx-in'),kd=(k)=>ta.dispatchEvent(new KeyboardEvent('keydown',{key:k,ctrlKey:true,bubbles:true}));const vis=document.querySelector('.edbar [data-a=it]').getClientRects().length>0;const b0=!!ED.o.bold,u0=!!ED.o.underline;kd('i');const a=ED.o.italic===true&&/^italic /.test(tfont(ED.o));kd('b');kd('u');const b=!!ED.o.bold===!b0&&!!ED.o.underline===!u0;kd('i');const c=!ED.o.italic;design.qbarHide=[];ED.set({bold:false,underline:false});closeEditor();S.pages[0].objs.length=n0;return !vis&&a&&b&&c&&sanObj({type:'text',x:1,y:1,text:'a',italic:true}).italic===true&&!('italic' in sanObj({type:'text',x:1,y:1,text:'a',italic:'yes'}))&&tfont({fs:14})==='14px '+famOf({fs:14})})()") === true);
  ok('Kursiv: Knopf wirkt, aria-pressed folgt, zweiter Klick schaltet zurück', await ev("(()=>{const n0=S.pages[0].objs.length;design.qbarHide=[];newText(0,120,200);ED.eng.put('Hallo');const bt=document.querySelector('.edbar [data-a=it]');bt.click();const a=ED.o.italic===true&&bt.getAttribute('aria-pressed')==='true';bt.click();const b=!ED.o.italic&&bt.getAttribute('aria-pressed')==='false';closeEditor();S.pages[0].objs.length=n0;return a&&b})()") === true);
  // Text-Leiste im Design-Dialog: Tastatur verschiebt Knöpfe, Fokus bleibt am Pfeil
  const key = async (k, code, vk, text) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); };
  // Stärke-Regler: die Wertanzeige hält die Breite (sonst springt der Regler unter dem Zeiger), Pfeiltasten gehören dem Regler
  await ev("S.pages[0].objs.push({type:'rect',x:300,y:620,w:120,h:60,color:'#000000',lw:1,fill:'none',oid:'lwR'});redraw(0);setSel({p:0,o:S.pages[0].objs.find(o=>o.oid==='lwR')})");
  const lwWidths = await ev("(()=>{const el=document.getElementById('lw'),w=new Set();for(const v of [2,2.5,10.5,16,0.5,3]){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));w.add(Math.round(el.getBoundingClientRect().width*10))}return [...w]})()");
  ok('Stärke-Regler: Breite bleibt bei jedem Wert gleich', Array.isArray(lwWidths) && lwWidths.length === 1, lwWidths);
  await ev("(()=>{const d=document.getElementById('langDlg');if(d&&!d.hidden)d.hidden=true})()"); // der Erststart-Sprachdialog kann auf langsamen Läufern spät erscheinen und den Fokus sperren
  await waitFor("!document.querySelector('#app').inert");
  await ev("(()=>{const el=document.getElementById('lw');el.value=2;el.dispatchEvent(new Event('input',{bubbles:true}));window.__lwx=S.sel.o.x;el.focus()})()");
  const lwFocus = await waitFor("document.activeElement===document.getElementById('lw')");
  await key('ArrowRight', 'ArrowRight', 39);
  const lwOk = await waitFor("document.getElementById('lw').value==='2.5'&&S.sel.o.x===window.__lwx", 2000);
  ok('Stärke-Regler: Pfeiltaste ändert den Wert, nicht die Objektposition', lwOk === true, lwOk ? undefined : await ev("JSON.stringify({focus:document.activeElement&&document.activeElement.id,val:document.getElementById('lw').value,x:S.sel&&S.sel.o.x,x0:window.__lwx,inert:!!document.querySelector('#app').inert})"));
  await ev("setSel(null);document.activeElement&&document.activeElement.blur()");
  await ev("studioOpen(true)");
  await sleep(400);
  await ev("document.querySelector('#dQbar [data-v=l]').focus()");
  const isDown = "document.activeElement===document.querySelector('#dQbItems [data-id=\"font\"][data-d=\"1\"]')";
  for (let i = 0; i < 6 && (await ev(isDown)) !== true; i++) await key('Tab', 'Tab', 9);
  ok('Text-Leiste: Tab erreicht „Nach unten“ der Schriftart-Zeile', await ev(isDown) === true);
  await key('Enter', 'Enter', 13, '\r');
  await sleep(300);
  ok('Text-Leiste: Enter verschiebt die Schriftart um eine Stelle', await ev("design.qbarOrder[1]==='font'") === true);
  ok('Text-Leiste: Fokus bleibt am Pfeil der verschobenen Zeile', await ev("document.activeElement.dataset.id==='font'&&document.activeElement.dataset.d==='1'") === true);
  ok('Text-Leiste: neue Reihenfolge ist gespeichert', await ev("JSON.parse(localStorage.getItem('pdfwerkbank:design')).qbarOrder[1]==='font'") === true);
  await ev("document.querySelector('#dQbStyle [data-v=contrast]').click()");
  ok('Text-Leiste: Stil Kontrast wirkt sofort und wird gespeichert', await ev("document.documentElement.dataset.qbstyle==='contrast'&&JSON.parse(localStorage.getItem('pdfwerkbank:design')).qbarStyle==='contrast'") === true);
  // Echter Mausklick auf den Schalter eines Text-Leisten-Knopfs (Schalter ist ein <label>, nicht nur ein Span)
  const qbSw = "document.querySelector('#dQbItems input[data-id=\"bold\"]').closest('label').querySelector('.knob')";
  const clickSw = async () => { await ev(`${qbSw}.scrollIntoView({block:'center',behavior:'instant'})`); await sleep(500); const p = await ev(`(()=>{const b=${qbSw}.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()`); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1] }); await sleep(100); for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); await sleep(300); };
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1024, height: 700, deviceScaleFactor: 1, mobile: false }); // kleines CI-Fenster nachstellen
  await ev("(()=>{const d=document.getElementById('langDlg');if(d&&!d.hidden)d.hidden=true})()"); // auf langsamen Läufern erscheint der Erststart-Sprachdialog erst spät und deckt die Seite ab
  await waitFor("!document.querySelector('#app').inert");
  await sleep(300);
  await clickSw();
  const hidOk = await waitFor("design.qbarHide.includes('bold')&&document.querySelector('#dQbItems input[data-id=\"bold\"]').checked===false");
  ok('Text-Leiste: echter Mausklick auf Schalter blendet Knopf aus', hidOk === true, hidOk ? undefined : await ev("JSON.stringify({hide:design.qbarHide,checked:document.querySelector('#dQbItems input[data-id=\"bold\"]').checked,inert:!!document.querySelector('#app').inert,vw:innerWidth,vh:innerHeight,at:(()=>{const k=document.querySelector('#dQbItems input[data-id=\"bold\"]').closest('label').querySelector('.knob').getBoundingClientRect();const e=document.elementFromPoint(k.left+k.width/2,k.top+k.height/2);return [Math.round(k.left),Math.round(k.top),e&&e.tagName+'.'+e.className]})()})"));
  await clickSw();
  ok('Text-Leiste: zweiter Mausklick blendet Knopf wieder ein', await waitFor("!design.qbarHide.includes('bold')&&document.querySelector('#dQbItems input[data-id=\"bold\"]').checked===true") === true);
  await cdp('Emulation.clearDeviceMetricsOverride', {});
  await ev("document.querySelector('#dQbItems input[data-id=\"bold\"]').focus()");
  await key(' ', 'Space', 32, ' ');
  await sleep(300);
  ok('Text-Leiste: Leertaste am Schalter blendet Knopf aus', await ev("design.qbarHide.includes('bold')") === true);
  await key(' ', 'Space', 32, ' ');
  await sleep(300);
  ok('Text-Leiste: Leertaste blendet Knopf wieder ein', await ev("!design.qbarHide.includes('bold')") === true);
  await ev("setLang('en')");
  ok('Text-Leiste im Design-Dialog: englische Beschriftung ohne deutsche Reste', await ev("(()=>{const els=[...new Set(['#dQbItems','#dQbItems *','.qbprev','.qbprev *','#dQbStyle','#dQbStyle *','#dQbReset'].flatMap(s=>[...document.querySelectorAll(s)]))];return els.every(e=>[e.childNodes.length===1&&e.childNodes[0].nodeType===3?e.textContent:'',e.getAttribute('aria-label')||'',e.title||''].every(t=>!/[äöüß]|Schriftart|Schriftgröße|Fett|Unterstreichen|Listen|Einrücken|Schriftfarbe|Löschen|Nach |Knöpfe|Stil|zurücksetzen|Standard|Getönt|Kontrast|Klein|Mittel|Groß|Aufz|Nummer|Unterpunkt|Ebene|Textfeld/.test(t)))})()") === true);
  await ev("setLang('de')");
  await ev("document.querySelector('#dQbReset').click();studioOpen(false)");
  // Text-Leiste: Einstellungen werden bereinigt, alte Design-Daten laden ohne Fehler
  ok('Text-Leiste: ungültige Einstellungen werden bereinigt', await ev("(()=>{const d=qbSan({qbarOrder:['x','bold','bold'],qbarHide:QB_IDS.slice(),qbar:'zz',qbarStyle:'zz'});return d.qbarOrder.join()===QB_IDS.join()&&d.qbarHide.length===0&&d.qbar==='m'&&d.qbarStyle==='panel'})()") === true);
  ok('Text-Leiste: Knöpfe aus altem Design stehen an Standardposition (Kursiv nach Fett, Hintergrund nach Farbe), Rest bleibt', await ev("(()=>{const old=['font','size','bold','ul','lists','indent','col','del'];const a=qbSan({qbarOrder:old,qbarHide:['ul']});const b=qbSan({qbarOrder:['del','col','bold','font'],qbarHide:[]});const c=qbSan({qbarOrder:'x',qbarHide:5});return a.qbarOrder.join()==='font,size,bold,it,ul,lists,indent,col,bg,chars,del'&&a.qbarHide.join()==='ul'&&b.qbarOrder.join()==='del,col,bg,chars,bold,it,ul,lists,indent,font,size'&&c.qbarOrder.join()===QB_IDS.join()&&b.qbarOrder.length===QB_IDS.length})()") === true);
  ok('Text-Leiste: kaputte gespeicherte Design-Werte brechen nichts', await ev("(()=>{const bad=[null,5,'abc',[1],{qbarOrder:{a:1},qbarHide:'it'},{qbarOrder:[null,{},'it','it'],qbarHide:[3,'zz']}];return bad.every(v=>{const d=dSan(qbSan({...DDEF,...(v&&typeof v==='object'?v:{})}));return Array.isArray(d.qbarOrder)&&d.qbarOrder.length===QB_IDS.length&&new Set(d.qbarOrder).size===QB_IDS.length&&Array.isArray(d.qbarHide)&&d.qbarHide.every(x=>QB_IDS.includes(x))})})()") === true);
  // Gespeicherte Design-Werte: unbekannte Werte fallen auf den Standard, gültige bleiben
  ok('Design: unbekannte gespeicherte Werte fallen auf Standard', await ev("(()=>{const g=Object.fromEntries(DKEYS.map(([,k])=>[k,'zz']));Object.assign(g,{accent:'nope',accentC:'red',barsC:null,toastC:'#12'});const d=dSan({...DDEF,...g});return DKEYS.every(([,k])=>d[k]===DDEF[k])&&d.accent===DDEF.accent&&d.accentC===''&&d.barsC===''&&d.toastC===''})()") === true);
  ok('Design: gültige Werte bleiben', await ev("(()=>{const d=dSan({...DDEF,theme:'dark',accent:'custom',accentC:'#0b6570',bars:'custom',barsC:'#1b2129',corners:'pill'});return d.theme==='dark'&&d.accent==='custom'&&d.accentC==='#0b6570'&&d.bars==='custom'&&d.barsC==='#1b2129'&&d.corners==='pill'})()") === true);
  await ev("localStorage.setItem('pdfwerkbank:design',JSON.stringify({qbar:'l'}));location.reload()");
  await sleep(4000);
  for (let i = 0; i < 30; i++) { if (await ev("typeof S==='object'&&typeof applyDesign==='function'") === true) break; await sleep(500); }
  ok('Altes Design ohne Text-Leisten-Schlüssel lädt mit Standardreihenfolge', await ev("design.qbar==='l'&&design.qbarOrder.join()===QB_IDS.join()&&design.qbarHide.length===0&&design.qbarStyle==='panel'") === true);
  // Seite ohne DOM (P.el fehlt) bringt Layout und Zoom nicht zum Absturz
  ok('Layout mit Seite ohne DOM stürzt nicht ab', await ev("(()=>{const n=S.pages.length;S.pages.push({w:100,h:100,objs:[]});let ok=true;try{layout()}catch(e){ok=false}S.pages.length=n;return ok})()") === true);
  // Bei <= 1060 px sind Schalter-Beschriftungen ausgeblendet; die Schalter behalten einen Namen (aria-label)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  ok('Schalter: Beschriftung bei 1000 px ausgeblendet', await ev("getComputedStyle(document.querySelector('#autoHdr .tl')).display==='none'") === true);
  ok('Schalter in Dialogen und Bedienfeld behalten ihre Beschriftung bei 1000 px', await ev("['#exMarks','#qShape'].every(s=>getComputedStyle(document.querySelector(s).closest('.tgl').querySelector('.tl')).display!=='none')") === true);
  ok('Schalter: alle haben einen Namen bei 1000 px', await ev("[...document.querySelectorAll('input[role=switch]')].every(i=>(i.getAttribute('aria-label')||'').trim().length>0)") === true);
  const axNodes = (await cdp('Accessibility.getFullAXTree', {})).result.nodes;
  ok('Schalter im Barrierefreiheitsbaum bei 1000 px: „Auto“ benannt', axNodes.some(n => n.role && n.role.value === 'switch' && n.name && n.name.value === 'Auto'));
  await cdp('Emulation.clearDeviceMetricsOverride', {});
  await sleep(300);
  // Seitenleiste: kein horizontaler Scrollbalken bei 1000 px, hell und dunkel
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false });
  await ev("toggleThumbs(true)");
  await sleep(800);
  for (const th of ['light', 'dark']) {
    await ev(`document.documentElement.dataset.theme='${th}'`);
    await sleep(200);
    ok(`Seitenleiste 1000 px ${th}: kein horizontaler Scrollbalken`, await ev("(()=>{const t=document.querySelector('.thumbs');return t.offsetHeight-t.clientHeight<=0})()") === true);
  }
  await ev("applyDesign(true)");
  await cdp('Emulation.clearDeviceMetricsOverride', {});
  await sleep(300);
  // Datei-Menü ist in niedrigen Fenstern nicht abgeschnitten: Mausrad und Pfeiltasten erreichen „Drucken“
  const ctxBox = "(()=>{const c=document.getElementById('ctx'),r=c.getBoundingClientRect();return [r.top,r.bottom,innerHeight,c.scrollHeight>c.clientHeight]})()";
  const lastIn = "(()=>{const c=document.getElementById('ctx').getBoundingClientRect(),b=[...document.querySelectorAll('#ctx button')].pop().getBoundingClientRect();return b.top>=c.top&&b.bottom<=c.bottom&&b.bottom<=innerHeight})()";
  for (const [w, h] of [[1280, 720], [1366, 705]]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    await ev("document.getElementById('bFileMenu').click()");
    await sleep(500);
    const box = await ev(ctxBox);
    ok(`Datei-Menü ${w}x${h}: passt ins Fenster und scrollt`, Array.isArray(box) && box[0] >= 0 && box[1] <= box[2] && box[3] === true, box);
    const p = await ev("(()=>{const c=document.getElementById('ctx').getBoundingClientRect();return [c.left+c.width/2,c.top+c.height/2]})()");
    await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: p[0], y: p[1], deltaX: 0, deltaY: 3000 });
    await sleep(500);
    ok(`Datei-Menü ${w}x${h}: Mausrad erreicht letzten Eintrag`, await ev(lastIn) === true);
    await ev("document.getElementById('ctx').scrollTop=0;[...document.querySelectorAll('#ctx button')][0].focus()");
    await key('End', 'End', 35);
    await sleep(200);
    ok(`Datei-Menü ${w}x${h}: Ende-Taste erreicht letzten Eintrag`, await ev(lastIn) === true);
    await ev("closeMenu()");
    await sleep(500);
  }
  // „Mehr“-Knopf der Werkzeugleiste: nach dem Schließen des Menüs nicht mehr expanded
  const mehr = await ev("(async()=>{const b=document.querySelector('.tb-more');b.click();await new Promise(r=>setTimeout(r,400));const open=b.getAttribute('aria-expanded');closeMenu();await new Promise(r=>setTimeout(r,500));return [open,b.getAttribute('aria-expanded')]})()");
  ok('Mehr nach Schließen nicht expanded', Array.isArray(mehr) && mehr[0] === 'true' && mehr[1] === 'false', mehr);
  // Schwebende Werkzeugleiste + „links“: Leiste sitzt links, nicht mittig (auch unter 1200 px)
  for (const w of [1440, 1100]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
    const fl = await ev("(async()=>{const r=document.documentElement,t=document.querySelector('.tools'),o=[r.dataset.tbstyle,r.dataset.toolbar];const w=()=>new Promise(x=>setTimeout(x,300));r.dataset.tbstyle='float';r.dataset.toolbar='center';await w();const c=t.getBoundingClientRect().left;r.dataset.toolbar='left';await w();const l=t.getBoundingClientRect().left;r.dataset.tbstyle=o[0];r.dataset.toolbar=o[1];return [c,l,document.getElementById('viewer').getBoundingClientRect().left]})()");
    ok(`Schwebende Leiste links ${w}px: ganz links`, Array.isArray(fl) && Math.abs(fl[1] - ((w >= 1200 ? fl[2] : 0) + 12)) < 4 && fl[0] > fl[1] + 40, fl);
  }
  // Objektmenü: echter Rechtsklick nahe am unteren Fensterrand bleibt beim ersten Öffnen ganz im Fenster
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await ev("setTool('select')");
  const [mx, my] = await ev("(()=>{const P=S.pages[0],b=P.ink.getBoundingClientRect(),z=S.zoom;P.objs.push({type:'rect',x:100/z,y:(innerHeight-120-b.top)/z,w:200/z,h:80/z,color:'#000000',lw:1,fill:'none',oid:'mnR'});redraw(0);return [b.left+200,innerHeight-40]})()");
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mx, y: my, button: 'none', buttons: 0 });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: 'right', buttons: 2, clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: 'right', buttons: 0, clickCount: 1 });
  await sleep(500);
  ok('Objektmenü 1280x720: beim ersten Öffnen ganz im Fenster', await ev("(()=>{const c=document.getElementById('ctx');if(c.hidden)return false;const r=c.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()") === true);
  await ev("closeMenu();S.pages[0].objs=S.pages[0].objs.filter(o=>o.oid!=='mnR');redraw(0)");
  await sleep(400);
  // Seitenmenü „Beschriftungen dieser Seite entfernen“ lässt gesperrte Objekte stehen und meldet ihre Zahl
  ok('Seitenmenü: Beschriftungen entfernen lässt gesperrtes Objekt stehen', await ev("(async()=>{const P=S.pages[0],base={color:'#000000',lw:1,fill:'none'};P.objs.length=0;P.objs.push({type:'rect',x:50,y:50,w:40,h:40,...base,oid:'tLk',locked:true},{type:'rect',x:150,y:50,w:40,h:40,...base,oid:'tFr'});pageMenu(0,100,100);[...document.querySelectorAll('#ctx button')].find(x=>x.textContent==='Beschriftungen dieser Seite entfernen').click();await new Promise(r=>setTimeout(r,400));const left=P.objs.map(o=>o.oid).join();const t=document.querySelector('.toast').textContent;P.objs.length=0;return left==='tLk'&&/1 gesperrte/.test(t)})()") === true);
  // Textebene: dichte Seite öffnen, jede Textebene hat ein endOfContent
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await ev("(async()=>{for(const k of Object.keys(localStorage))if(k.startsWith('pdfwerkbank:dense.pdf:'))localStorage.removeItem(k);const d=await PDFLib.PDFDocument.create();const f=await d.embedFont(PDFLib.StandardFonts.Helvetica);const W='lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim minim veniam quis nostrud'.split(' ');let k=0;for(let p=0;p<2;p++){const pg=d.addPage([595,842]);for(let ln=0;ln<68;ln++){if(ln%9===8)continue;let s='';while(f.widthOfTextAtSize(s,9)<440)s+=W[(k++*7)%W.length]+' ';pg.drawText(s.trim(),{x:72,y:800-ln*11,size:9,font:f})}}await openPdf(await d.save(),'dense.pdf');setTool('select');return 1})()");
  const eoc = await ev("(async()=>{let L=[];for(let k=0;k<50;k++){await new Promise(r=>setTimeout(r,200));L=[...document.querySelectorAll('.textLayer')];if(L.length&&L[0].querySelector('span'))break}return [L.length,L.filter(l=>l.querySelectorAll(':scope>.endOfContent').length===1).length]})()");
  ok('endOfContent in every text layer', Array.isArray(eoc) && eoc[0] > 1 && eoc[0] === eoc[1], eoc);
  // Echter Maus-Zug von Wort-Mitte (Zeile 11) in den rechten Rand von Zeile 13 wählt wenig Text, springt nicht ans Ende der Ebene
  const dr = await ev("(()=>{const tl=document.querySelector('.textLayer'),sp=[...tl.querySelectorAll('span')].filter(s=>!s.classList.contains('markedContent')&&s.textContent.trim()).map(s=>s.getBoundingClientRect());return [sp[10],sp[12],tl.getBoundingClientRect()].map(r=>r.toJSON())})()");
  const [d1, d2, dtl] = dr, dy1 = (d1.top + d1.bottom) / 2, dy2 = (d2.top + d2.bottom) / 2, dx1 = (d1.left + d1.right) / 2;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dx1, y: dy1, button: 'none', buttons: 0 });
  await sleep(250);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: dx1, y: dy1, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 12; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dx1 + (dtl.right - 20 - dx1) * i / 12, y: dy1 + (dy2 - dy1) * i / 12, button: 'left', buttons: 1 }); await sleep(20); }
  await sleep(150);
  const dlen = await ev("getSelection().toString().length");
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dtl.right - 20, y: dy2, button: 'left', buttons: 0, clickCount: 1 });
  const geo = await ev("(()=>{const sp=[...document.querySelector('.textLayer').querySelectorAll('span')].filter(s=>!s.classList.contains('markedContent')&&s.textContent.trim()),s=getSelection();return [s.containsNode(sp[11],false),s.containsNode(sp[13],true),s.anchorNode&&s.anchorNode.parentElement===sp[10],sp.slice(10,13).reduce((n,x)=>n+x.textContent.length,0)]})()");
  ok('synthetic drag selects less than 200 characters on a dense page', Array.isArray(geo) && dlen > 0 && dlen <= geo[3] + 8 && geo[0] === true && geo[1] === false && geo[2] === true, [dlen, geo]); // bound = text of the three spans the drag touches (font independent), far below the whole layer
  // Zug über die Seitengrenze: von Mitte letzter Zeile Seite 1 in Zeile 3 von Seite 2 wählt nicht die ganze Seite 2
  await ev("getSelection().removeAllRanges();viewer.scrollTop=0");
  await sleep(300);
  await ev("viewer.scrollTop+=S.pages[1].el.getBoundingClientRect().top-450");
  await sleep(1500);
  const xp = await ev("(()=>{const f=P=>[...P.tl.querySelectorAll('span')].filter(s=>!s.classList.contains('markedContent')&&s.textContent.trim()).map(s=>s.getBoundingClientRect().toJSON());const a=f(S.pages[0]),b=f(S.pages[1]);return [a[a.length-1],b[2]]})()");
  const [xa, xb] = xp, xx1 = (xa.left + xa.right) / 2, xy1 = (xa.top + xa.bottom) / 2, xx2 = (xb.left + xb.right) / 2, xy2 = (xb.top + xb.bottom) / 2;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: xx1, y: xy1, button: 'none', buttons: 0 });
  await sleep(250);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: xx1, y: xy1, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 12; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: xx1 + (xx2 - xx1) * i / 12, y: xy1 + (xy2 - xy1) * i / 12, button: 'left', buttons: 1 }); await sleep(20); }
  await sleep(150);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: xx2, y: xy2, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(100);
  const xg = await ev("(()=>{const sp=[...S.pages[1].tl.querySelectorAll('span')].filter(s=>!s.classList.contains('markedContent')&&s.textContent.trim()),s=getSelection();return [s.toString().length,s.containsNode(sp[sp.length-1],true),s.containsNode(sp[1],false),sp.reduce((n,x)=>n+x.textContent.length,0)]})()");
  ok('Zug über die Seitengrenze wählt nicht die ganze nächste Seite', Array.isArray(xg) && xg[0] > 0 && xg[0] < xg[3] / 2 && xg[1] === false && xg[2] === true, xg);
  // Selection bar: real double-click on a word shows #tsBar, Copy writes the word to the clipboard, Esc hides it
  await ev("getSelection().removeAllRanges();viewer.scrollTop=0;setTool('select')");
  await sleep(600);
  const tw = await ev("(()=>{const s=[...S.pages[0].tl.querySelectorAll('span')].filter(s=>!s.classList.contains('markedContent')&&s.textContent.trim())[10].getBoundingClientRect();return [s.left+3,(s.top+s.bottom)/2,s.right-3]})()");
  await cdp('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tw[0], y: tw[1], button: 'none', buttons: 0 });
  await sleep(250);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: tw[0], y: tw[1], button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 8; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tw[0] + (tw[2] - tw[0]) * i / 8, y: tw[1], button: 'left', buttons: 1 }); await sleep(20); }
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tw[2], y: tw[1], button: 'left', buttons: 0, clickCount: 1 });
  await sleep(300);
  const tb = await ev("(()=>{const b=$('#tsBar'),r=b.getBoundingClientRect(),q=getSelection().getRangeAt(0).getBoundingClientRect();return {vis:!b.hidden,role:b.getAttribute('role'),lbl:b.getAttribute('aria-label'),sel:String(getSelection()).trim(),inView:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,gap:Math.round(q.top-r.bottom)}})()");
  ok('tsBar appears after a real drag selection', tb && tb.vis && tb.role === 'toolbar' && tb.lbl === 'Textauswahl' && tb.sel.length > 1 && tb.inView && tb.gap >= 0, tb);
  const tc = await ev("(()=>{const b=$('#tsCopy').getBoundingClientRect();return [(b.left+b.right)/2,(b.top+b.bottom)/2]})()");
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tc[0], y: tc[1], button: 'none', buttons: 0 });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: tc[0], y: tc[1], button: 'left', buttons: 1, clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tc[0], y: tc[1], button: 'left', buttons: 0, clickCount: 1 });
  await sleep(300);
  const tcp = await ev("(async()=>{let c='';try{c=await navigator.clipboard.readText()}catch(e){c='ERR '+e.message}return {c,sel:String(getSelection()).trim(),vis:!$('#tsBar').hidden}})()");
  ok('tsBar Copy puts the selected text on the clipboard and keeps the selection', tcp && tcp.c.trim() === tb.sel && tcp.sel === tb.sel && tcp.vis, tcp);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
  ok('tsBar hides on Esc', await ev("$('#tsBar').hidden"));
  // Selection bar Highlight: one hl object with the selected word, one undo step, colour swatch, save + reopen
  const mouse = async (type, x, y, buttons = 0, clickCount = 1) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount });
  const clickAt = async ([x, y]) => { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y, 1); await mouse('mouseReleased', x, y); await sleep(250); };
  const dragWord = async k => {
    await ev("getSelection().removeAllRanges();viewer.scrollTop=0;setTool('select')"); await sleep(400);
    const w = await ev(`(()=>{const s=[...S.pages[0].tl.querySelectorAll('span')].filter(s=>!s.classList.contains('markedContent')&&s.textContent.trim())[${k}].getBoundingClientRect();return [s.left+3,(s.top+s.bottom)/2,s.right-3]})()`);
    await mouse('mouseMoved', w[0], w[1]); await sleep(200); await mouse('mousePressed', w[0], w[1], 1);
    for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', w[0] + (w[2] - w[0]) * i / 8, w[1], 1); await sleep(20); }
    await mouse('mouseReleased', w[2], w[1]); await sleep(300);
  };
  const hlN = () => ev("S.pages.reduce((n,P)=>n+P.objs.filter(o=>o.type==='hl').length,0)");
  const btn = id => ev(`(()=>{const b=$('${id}').getBoundingClientRect();return [(b.left+b.right)/2,(b.top+b.bottom)/2]})()`);
  await ev("(async()=>{await findIndex()})()");
  const h0 = await hlN(), u0 = await ev('H.u.length');
  await dragWord(10);
  const w1 = await ev("String(getSelection()).trim()");
  await clickAt(await btn('#tsHl'));
  const h1 = await ev("(()=>{const l=S.pages[0].objs.filter(o=>o.type==='hl');const o=l[l.length-1];return {n:l.length,t:o&&hlText(0,o),a:o&&o.alpha,c:o&&o.color,q:o&&o.q.length,hist:H.u.length,vis:!$('#tsBar').hidden,sel:String(getSelection()),dirty:S.dirty}})()");
  ok('tsBar Highlight creates exactly one hl object with the selected word and hides the bar', h1 && await hlN() === h0 + 1 && h1.t === w1 && h1.a === .38 && h1.c === '#ffd60a' && h1.hist === u0 + 1 && !h1.vis && h1.sel === '' && h1.dirty, [w1, h1]);
  await ev('undo()');
  ok('Highlight from tsBar is undone in one step', await hlN() === h0 && await ev('H.u.length') === u0);
  // Swatch click highlights the selection at once in that colour (one hl, pixel sampled), and the Highlight button then reuses it
  const hlPix = () => ev("(()=>{const l=S.pages[0].objs.filter(o=>o.type==='hl'),o=l[l.length-1];if(!o)return null;const k=S.pages[0].ink,z=S.zoom,sx=k.width/(k.getBoundingClientRect().width/z)/z,d=k.getContext('2d').getImageData(Math.round((o.x+o.w/2)*z*sx),Math.round((o.y+o.h/2)*z*sx),1,1).data;return [d[0],d[1],d[2],d[3]]})()");
  const near = (p, c) => p && Math.abs(p[0] - parseInt(c.slice(1, 3), 16)) < 90 && Math.abs(p[1] - parseInt(c.slice(3, 5), 16)) < 90 && Math.abs(p[2] - parseInt(c.slice(5, 7), 16)) < 90 && p[3] > 0;
  await dragWord(12);
  await clickAt(await ev("(()=>{const b=$('#tsBar .tsw[data-c=\"#4ade80\"]').getBoundingClientRect();return [(b.left+b.right)/2,(b.top+b.bottom)/2]})()"));
  const h2 = await ev("(()=>{const l=S.pages[0].objs.filter(o=>o.type==='hl');return l[l.length-1].color})()");
  const px2 = await hlPix();
  ok('tsBar swatch click creates exactly one hl in that colour at once', h2 === '#4ade80' && await hlN() === h0 + 1 && await ev("$('#tsBar').hidden") && near(px2, '#4ade80'), [h2, px2]);
  await dragWord(14);
  await clickAt(await btn('#tsHl'));
  const h2b = await ev("(()=>{const l=S.pages[0].objs.filter(o=>o.type==='hl');return l[l.length-1].color})()");
  ok('tsBar Highlight button after a swatch uses the remembered colour', h2b === '#4ade80' && await hlN() === h0 + 2, h2b);
  await ev('undo()');
  // Custom colour: window blur + collapsed selection between picker open and confirm must not lose the selection
  await dragWord(16);
  await ev("(()=>{const c=$('#tsColor');c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));c.focus();window.dispatchEvent(new Event('blur'));getSelection().removeAllRanges();c.value='#ff0000';c.dispatchEvent(new Event('input',{bubbles:true}));c.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await sleep(250);
  const px3 = await hlPix();
  ok('tsBar custom colour survives blur and a collapsed selection: one hl in that colour', await hlN() === h0 + 2 && await ev("S.pages[0].objs.filter(o=>o.type==='hl').pop().color") === '#ff0000' && near(px3, '#ff0000'), px3);
  await ev('undo()');
  await ev("tsSetCol('#ffd60a')");
  const rt = await ev("(async()=>{const q0=JSON.stringify(S.pages[0].objs.filter(o=>o.type==='hl').map(o=>o.q));await openPdf(await buildOutput(),'rt.pdf');const l=S.pages[0].objs.filter(o=>o.type==='hl');const same=JSON.stringify(l.map(o=>o.q))===q0&&l.length>=1;const o=l[l.length-1];const n=l.length;S.pages[0].objs=S.pages[0].objs.filter(x=>x!==o);return {same,n,c:o.color,left:S.pages[0].objs.filter(x=>x.type==='hl').length}})()", 60000);
  ok('Saved highlight from tsBar reopens as editable hl object and can be deleted', rt && rt.same && rt.c === '#4ade80' && rt.left === rt.n - 1, rt);
  await dragWord(14);
  await key('Tab', 'Tab', 9); await sleep(150);
  ok('tsBar: Tab from the page focuses the first bar button', await ev("document.activeElement&&document.activeElement.id==='tsHl'&&!$('#tsBar').hidden") === true);
  await key('ArrowRight', 'ArrowRight', 39); await sleep(100);
  ok('tsBar: ArrowRight moves to the next bar button', await ev("document.activeElement&&document.activeElement.id==='tsCopy'") === true);
  await key('Escape', 'Escape', 27); await sleep(200);
  ok('tsBar: Esc hides the bar and returns focus to the viewer', await ev("$('#tsBar').hidden&&document.activeElement===viewer") === true);
  // A line taller than half the text layer (long line on a /Rotate 90 page) must still be highlighted
  await ev("getSelection().removeAllRanges();viewer.scrollTop=0;setTool('select')"); await sleep(400);
  await ev("(()=>{const t=S.pages[0].tl,s=document.createElement('span');s.id='tallProbe';s.textContent='TallProbe';s.style.cssText='position:absolute;left:10px;top:0;white-space:nowrap;line-height:1;font-size:'+Math.round(t.getBoundingClientRect().height*.6)+'px';t.insertBefore(s,t.firstChild);const r=document.createRange();r.selectNodeContents(s);const g=getSelection();g.removeAllRanges();g.addRange(r);tsShow()})()");
  const tallN = await hlN();
  await clickAt(await btn('#tsHl'));
  ok('tsBar Highlight also works for a line taller than half the text layer', await hlN() === tallN + 1, [tallN, await hlN()]);
  await ev("document.getElementById('tallProbe').remove();undo()");
  const itR = await ev("(async()=>{const o={type:'text',x:72,y:400,text:'Kursivtest Suche',fs:18,color:'#1b1f24',orient:'h',lw:0,italic:true};S.pages[0].objs.push(o);redraw(0);const out=await buildOutput();const d=await pdfOpen(out.slice());const t=(await (await d.getPage(1)).getTextContent()).items.map(x=>x.str).join('|');S.pages[0].objs=S.pages[0].objs.filter(x=>x!==o);await openPdf(out,'it.pdf');const l=S.pages[0].objs.filter(x=>x.type==='text'&&x.text==='Kursivtest Suche');const r={t:/Kursivtest Suche/.test(t),n:l.length,it:l[0]&&l[0].italic===true};S.pages[0].objs=S.pages[0].objs.filter(x=>!l.includes(x));return r})()", 60000);
  ok('Kursiv: gespeichert, durchsuchbar, wieder bearbeitbar', itR && itR.t && itR.n === 1 && itR.it === true, itR);
  ok('Kursiv: txtCapture liest Schriftgröße aus kursiver Schrift', await ev("(()=>{const cv=document.createElement('canvas');cv.width=cv.height=200;const c=cv.getContext('2d');const T=txtCapture(c,1);drawText(c,{type:'text',x:5,y:5,text:'Abc',fs:14,color:'#000',orient:'h',italic:true,bold:true});T.stop();return T.runs.length===1&&T.runs[0].fs===14&&T.runs[0].t==='Abc'})()") === true);
  ok('Hintergrund: sanObj nimmt Farben an, lehnt url(x) und Nicht-Strings ab', await ev("(()=>{const f=h=>sanObj({type:'text',x:1,y:1,text:'a',hbg:h});return f('#ffd60a').hbg==='#ffd60a'&&f('rgb(1,2,3)').hbg==='rgb(1,2,3)'&&!('hbg' in f('url(x)'))&&!('hbg' in f(5))&&!('hbg' in f(''))})()") === true);
  ok('Hintergrund: Zeichnen füllt die Zeilen hinter dem Text (Pixelprobe), ohne Hintergrund bleibt es leer', await ev("(()=>{const px=(o)=>{const cv=document.createElement('canvas');cv.width=cv.height=200;const c=cv.getContext('2d');drawText(c,o);return[...c.getImageData(o.x+1,o.y+1,1,1).data]};const base={type:'text',x:20,y:20,text:'Hallo\\nWelt',fs:20,color:'#000000',orient:'h',lw:0};const a=px({...base,hbg:'#ffd60a'}),b=px(base);const v=px({...base,orient:'v',hbg:'#ffd60a'});return a.join()==='255,214,10,255'&&b[3]===0&&v.join()==='255,214,10,255'})()") === true);
  ok('Hintergrund: ungültige Farbe zzz macht den Text nicht unsichtbar, sanObj entfernt sie, bei gestapeltem Text gibt es keinen Hintergrund', await ev("(()=>{const cv=document.createElement('canvas');cv.width=cv.height=100;const c=cv.getContext('2d');drawText(c,{type:'text',x:5,y:5,text:'HHH',fs:30,color:'#000000',orient:'h',lw:0,hbg:'zzz'});const d=c.getImageData(0,0,100,100).data;let dark=0;for(let i=3;i<d.length;i+=4)if(d[i]>200)dark++;const f=o=>sanObj({type:'text',x:1,y:1,text:'a',...o});return dark>50&&!('hbg' in f({hbg:'zzz'}))&&!('hbg' in f({hbg:'#ffd60a',orient:'stack'}))&&f({hbg:'#ffd60a'}).hbg==='#ffd60a'})()") === true);
  ok('Hintergrund: Palette der Schriftfarbe und des Hintergrunds überlappen nie, Knopf bei gestapeltem Text gesperrt', await ev("(()=>{const n0=S.pages[0].objs.length;design.qbarHide=[];newText(0,120,200);ED.eng.put('Hallo');const bar=document.querySelector('.edbar'),pc=bar.querySelector('[data-a=col]').parentNode.querySelector('.edpal'),pb=bar.querySelector('.edbgp');bar.querySelector('[data-a=col]').click();bar.querySelector('[data-a=bg]').click();const a=pc.hidden||!!pc._ah;const b=!pb.hidden;bar.querySelector('[data-a=col]').click();const c=pb.hidden||!!pb._ah;ED.o.orient='stack';ED.set({});const d=bar.querySelector('[data-a=bg]').disabled;closeEditor();S.pages[0].objs.length=n0;return a&&b&&c&&d})()") === true);
  ok('Hintergrund: Knopf, Farbfeld, Keine, Rückgängig und Esc; Palette der Schriftfarbe bleibt unabhängig', await ev("(()=>{const n0=S.pages[0].objs.length;design.qbarHide=[];newText(0,120,200);ED.eng.put('Hallo');const bar=document.querySelector('.edbar'),bt=bar.querySelector('[data-a=bg]');bt.click();const open=!bar.querySelectorAll('.edpal')[1].hidden||!bar.querySelector('.edbgp').hidden;const sw=bar.querySelector('.edbgp .edsw[data-c=\"#ffd60a\"]');sw.click();const a=ED.o.hbg==='#ffd60a'&&sw.getAttribute('aria-pressed')==='true'&&ED.o.color===S.color;bar.querySelector('.edbgp .edsw-none').click();const b=!('hbg' in ED.o);const colOk=bar.querySelector('.edpal:not(.edbgp)').querySelectorAll('.edsw').length===8;closeEditor();S.pages[0].objs.length=n0;return open&&a&&b&&colOk})()") === true);
  const bgR = await ev("(async()=>{const o={type:'text',x:72,y:430,text:'Hintergrundtest',fs:18,color:'#1b1f24',orient:'h',lw:0,italic:true,hbg:'#ffd60a'};S.pages[0].objs.push(o);redraw(0);const out=await buildOutput();const d=await pdfOpen(out.slice());const pg=await d.getPage(1);const vp=pg.getViewport({scale:1});const cv=document.createElement('canvas');cv.width=Math.ceil(vp.width);cv.height=Math.ceil(vp.height);await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;const pxl=(x,y)=>[...cv.getContext('2d').getImageData(x,y,1,1).data];const pdfPx=pxl(72+2,430+2);S.pages[0].objs=S.pages[0].objs.filter(x=>x!==o);await openPdf(out,'bg.pdf');const l=S.pages[0].objs.filter(x=>x.type==='text'&&x.text==='Hintergrundtest');const r={pdfPx,n:l.length,hbg:l[0]&&l[0].hbg,it:l[0]&&l[0].italic};const cv2=document.createElement('canvas');cv2.width=cv2.height=600;if(l[0]){const c2=cv2.getContext('2d');drawText(c2,l[0]);r.objPx=[...c2.getImageData(l[0].x+2,l[0].y+2,1,1).data]}S.pages[0].objs=S.pages[0].objs.filter(x=>!l.includes(x));return r})()", 60000);
  ok('Hintergrund: gespeichert und neu geöffnet: Gelb sichtbar, Objekt bearbeitbar mit Kursiv und Hintergrund', bgR && bgR.n === 1 && bgR.hbg === '#ffd60a' && bgR.it === true && bgR.objPx && bgR.objPx.join() === '255,214,10,255' && Math.abs(bgR.pdfPx[0] - 255) < 6 && Math.abs(bgR.pdfPx[1] - 214) < 6 && bgR.pdfPx[2] < 20, bgR);
  // Topology templates: every device carries its own editable label; a device wins over a line crossing its caption
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const TPJS = `window.tpPt=o=>{const s=SYM[o.sym],fs=o.fs||11;return[o.x+o.w/2,s.below?o.y+o.h+2+fs*.7:o.y+o.h/2]};
  window.tpScr=p=>{const P=S.pages[0];P.el.scrollIntoView({block:'start'});viewer.scrollTop+=P.el.getBoundingClientRect().top+p[1]*S.zoom-450;const r=P.el.getBoundingClientRect();return[r.left+p[0]*S.zoom,r.top+p[1]*S.zoom]};
  window.tpSet=objs=>{const P=S.pages[0];P.objs.length=0;P.objs.push(...objs);setTool('select');redraw(0);return objs.length};
  window.tpEsc=()=>{closeEditor();setSel(null)}`;
  await ev(TPJS);
  const tpDbl = async o => { const p = await ev(`tpScr(tpPt(S.pages[0].objs[${o}]))`); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1], button: 'none', buttons: 0 }); await sleep(60);
    for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: n }); await sleep(150); };
  const tpSave = await ev("(window.tpOld=S.pages[0].objs.slice(),1)");
  const tpKeys = await ev('TOPO_TPL.map(t=>t.k)');
  ok('Topologien: five templates (star, ring, bus, tree, mesh) shown in fillSym', JSON.stringify(tpKeys) === '["topo_star","topo_ring","topo_bus","topo_tree","topo_mesh"]' && await ev("(()=>{const o=S.cat;S.cat='Topologien';buildCats();const n=document.querySelectorAll('#symgrid .sym.tpl').length,s=document.querySelectorAll('#symgrid .sym:not(.tpl)').length;S.cat='Netzwerk';buildCats();const m=document.querySelectorAll('#symgrid .sym.tpl').length;S.cat=o;buildCats();return n===5&&s>=8&&m===5})()") === true);
  for (const k of tpKeys) {
    await ev(`tpSet(orgFit(TOPO_TPL.find(t=>t.k==='${k}').b(),S.pages[0],40,1.5))`); await sleep(200);
    const idx = await ev("S.pages[0].objs.map((o,i)=>o.type==='sym'&&o.label?i:-1).filter(i=>i>=0)");
    let good = 0;
    for (const i of idx) { await tpDbl(i); if (await ev(`!!editorEl&&editingObj===S.pages[0].objs[${i}]`) === true) good++; await ev('tpEsc()'); await sleep(80); }
    ok(`Topologien ${k}: all ${idx.length} labelled devices open the label editor by double-click`, idx.length >= 5 && good === idx.length, { n: idx.length, good });
  }
  ok('Topologien: Bus has one long backbone with four drop lines docked to it', await ev("(()=>{const o=TOPO_TPL.find(t=>t.k==='topo_bus').b(),bb=o.find(x=>x.sym==='hub'),ls=o.filter(x=>x.type==='line');return bb.w>=400&&ls.length===4&&ls.every(l=>l.link.a===bb.oid||l.link.b===bb.oid)})()") === true);
  await ev(`tpSet(orgFit(TOPO_TPL[0].b(),S.pages[0],40,1.5))`); await sleep(200);
  await tpDbl(0); await key('End', 'End', 35); await key('Z', 'KeyZ', 90, 'Z'); await ev('tpEsc()'); await sleep(100);
  ok('Topologien: typing into a device label is saved in the object', await ev("S.pages[0].objs[0].label.endsWith('Z')") === true, await ev('S.pages[0].objs[0].label'));
  // priority: a docked line across a device caption must not steal the double-click; free lines and label-less symbols keep their own editing
  const mkRect = "const R=(id,x,y)=>({type:'rect',oid:id,x,y,w:30,h:20,color:'#1b2a3a',lw:1,fill:'none',dash:false});const L=(a,b,y,x1,x2,extra)=>Object.assign({type:'line',x1,y1:y,x2,y2:y,color:'#1b2a3a',lw:1.2,dash:false,elbow:false,start:'none',end:'none'},extra||{});";
  const dblAt = async pt => { const p = await ev(`tpScr(${JSON.stringify(pt)})`); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p[0], y: p[1], button: 'none', buttons: 0 }); await sleep(60);
    for (const n of [1, 2]) for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: n }); await sleep(150); };
  const nObj = await ev('S.pages[0].objs.length');
  const cut = () => ev(`(S.pages[0].objs.length=${nObj},redraw(0),1)`);
  await ev(`(()=>{${mkRect}const P=S.pages[0],d=P.objs[0],p=tpPt(d);P.objs.push(R('tA',d.x-80,p[1]-10),R('tB',d.x+d.w+50,p[1]-10),L(0,0,p[1],0,0,{link:{a:'tA',b:'tB'}}));redraw(0)})()`);
  await tpDbl(0);
  ok('Topologien: double-click on a device caption crossed by a docked line edits the device label', await ev('!!editorEl&&editingObj===S.pages[0].objs[0]') === true);
  await ev('tpEsc()'); await cut();
  await ev(`(()=>{${mkRect}const P=S.pages[0],d=P.objs[0],p=tpPt(d);P.objs.push(L(0,0,p[1],d.x-30,d.x+d.w+30,{label:'Notiz',end:'arrow'}));redraw(0)})()`);
  await tpDbl(0);
  ok('Topologien: a free arrow with its own label over a device still edits the arrow label', await ev('!!editorEl&&editingObj===S.pages[0].objs[S.pages[0].objs.length-1]') === true);
  await ev('tpEsc()'); await cut();
  await ev(`(()=>{${mkRect}const P=S.pages[0],q={type:'sym',sym:'question',label:'?',x:10,y:10,w:20,h:20,color:'#1b2a3a',lw:1.2,fill:'none',fs:11};P.objs.push(q,R('qA',-60,12),R('qB',70,12),L(0,0,20,0,0,{link:{a:'qA',b:'qB'}}));redraw(0)})()`);
  await dblAt(await ev('[20,20]'));
  ok('Topologien: a docked line crossing a question mark is still editable', await ev('!!editorEl&&editingObj===S.pages[0].objs[S.pages[0].objs.length-1]&&editingObj.type===\'line\'') === true);
  await ev('tpEsc()'); await cut();
  await ev(`(()=>{${mkRect}const P=S.pages[0],d=P.objs[0],p=tpPt(d);P.objs.push(L(0,0,p[1],d.x-30,d.x+d.w+30))})()`);
  const lp = await ev("(()=>{const P=S.pages[0],d=P.objs[0],l=P.objs[P.objs.length-1];return[d.x-20,l.y1]})()");
  await dblAt(lp);
  ok('Topologien: double-click on the line itself still edits the line label', await ev('!!editorEl&&editingObj===S.pages[0].objs[S.pages[0].objs.length-1]') === true);
  await ev('tpEsc()');
  await ev("(S.pages[0].objs.length=0,S.pages[0].objs.push(...window.tpOld),redraw(0),1)");
  // Sheet colour: the rendered sheet pixel must match the chosen option, in both app themes, with page night mode off, and after reload
  {
    const sheetPx = async () => {
      const r = await ev("(()=>{const b=document.querySelector('.page').getBoundingClientRect();return [Math.round(b.left+12),Math.round(b.top+12)]})()");
      const shot = await cdp('Page.captureScreenshot', { format: 'png' });
      return ev(`(async()=>{const bin=atob("${shot.result.data}");const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);const bm=await createImageBitmap(new Blob([u]));const c=document.createElement('canvas');c.width=bm.width;c.height=bm.height;const x=c.getContext('2d');x.drawImage(bm,0,0);return Array.from(x.getImageData(${r[0]},${r[1]},1,1).data).slice(0,3)})()`);
    };
    const lum = p => (p[0] + p[1] + p[2]) / 3;
    const want = { white: p => lum(p) > 235, paper: p => lum(p) > 225 && p[2] < p[0], gray: p => lum(p) > 225 && p[2] > p[0], mint: p => lum(p) > 225 && p[1] > p[0], night: p => lum(p) < 60 };
    await ev("(document.documentElement.classList.remove('night'),1)");
    for (const theme of ['light', 'dark']) {
      await ev(`document.querySelector('#dTheme [data-v=${theme}]').click()`);
      for (const v of Object.keys(want)) {
        await ev(`document.querySelector('#dSheet [data-v=${v}]').click()`); await sleep(400);
        const px = await sheetPx();
        ok(`Sheet colour "${v}" matches its label (${theme} app)`, want[v](px) && await ev(`document.querySelector('#dSheet [aria-pressed=true]').dataset.v==='${v}'`) === true, px);
      }
    }
    // page night mode on: sheet "Nacht" must stay dark (was inverted twice = light)
    await ev("(document.documentElement.classList.add('night'),1)"); await sleep(300);
    await ev("document.querySelector('#dSheet [data-v=night]').click()"); await sleep(400);
    const npx = await sheetPx();
    ok('Sheet colour "night" stays dark with page night mode on', lum(npx) < 60, npx);
    await ev("(document.documentElement.classList.remove('night'),1)");
    // persistence after reload (startup path)
    await ev("document.querySelector('#dSheet [data-v=paper]').click()");
    await ev('location.reload()'); await sleep(2500);
    for (let i = 0; i < 30; i++) { if (await ev("typeof S==='object'&&typeof openPdf==='function'&&typeof PDFLib==='object'") === true) break; await sleep(500); }
    await ev("(async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);await openPdf(await d.save(),'sheet.pdf');return 1})()"); await sleep(1200);
    const rpx = await sheetPx();
    ok('Sheet colour persists after reload', want.paper(rpx) && await ev("document.querySelector('#dSheet [aria-pressed=true]').dataset.v==='paper'") === true, rpx);
  }
  // Text box typing must not move the sheet: with the page height just under the viewer height, the editor frame/toolbar overflow
  // adds a horizontal bar, which then adds a vertical bar and shifted the centred sheet sideways (scrollbar-gutter:stable on #viewer)
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await ev("(async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([420,500]);await openPdf(await d.save(),'wobble.pdf');await new Promise(r=>setTimeout(r,1200));setTool('text')})()");
  const wobH = await ev("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),sh=async z=>{zoomTo(z);await w(250);return viewer.scrollHeight};await sh(.5);const ch=viewer.clientHeight,a=await sh(2),c=await sh(3);await sh(2+(ch-8-a)/(c-a));return viewer.scrollHeight<=ch})()");
  const wp = await ev("(()=>{const r=S.pages[0].el.getBoundingClientRect();return [r.left+r.width-60,r.top+40]})()");
  const wl = () => ev("(()=>({l:S.pages[0].el.getBoundingClientRect().left,sx:viewer.scrollLeft,sy:viewer.scrollTop}))()");
  const wl0 = await wl();
  await mv(wp[0], wp[1]); await pressAt(wp[0], wp[1]); await releaseAt(wp[0], wp[1]); await sleep(300);
  let wmin = 1e9, wmax = -1e9, wsc = 0;
  for (let k = 0; k < 200; k++) { await key(k % 20 === 19 ? 'Enter' : 'w', k % 20 === 19 ? 'Enter' : 'KeyW', k % 20 === 19 ? 13 : 87, k % 20 === 19 ? '\r' : 'w'); const q = await wl(); wmin = Math.min(wmin, q.l); wmax = Math.max(wmax, q.l); wsc = Math.max(wsc, Math.abs(q.sx - wl0.sx)); }
  ok('Typing 200 characters in a text box does not move the sheet sideways', wobH === true && await ev('editingObj&&editingObj.text.length') > 150 && Math.min(wmin, wl0.l) > 0 && wmax - wmin <= .5 && Math.abs(wmin - wl0.l) <= .5 && wsc === 0, { wobH, before: wl0.l, wmin, wmax, wsc });
  await ev('closeEditor()');
  // Lost pointer events (cancel, missing pointerup) must not leave the ink layer transparent, the page stuck in a drag, or objects lost
  await ev("(async()=>{const d=await PDFLib.PDFDocument.create();const f=await d.embedFont(PDFLib.StandardFonts.Helvetica);d.addPage([595,842]).drawText('Rauchtest Router 10.0.0.1',{x:72,y:700,size:18,font:f});await openPdf(await d.save(),'lost.pdf');await new Promise(r=>setTimeout(r,1500));setTool('select');insertOrgTemplate('einlinie');await new Promise(r=>setTimeout(r,600));setSel(null);S.pages[0].objs.forEach(o=>{if(o.type==='sym')o.y+=300});redraw(0)})()");
  await waitFor("!!(S.pages[0].tl&&S.pages[0].tl.querySelector('span'))");
  const lostSt = () => ev("(()=>{const P=S.pages[0];return {n:P.objs.length,pe:P.ink.style.pointerEvents,cur:P.ink.style.cursor,sel:!!document.querySelector('.textLayer.selecting'),drag:!!(typeof DRAG!=='undefined'&&DRAG),td:!!tlDrag}})()");
  const lsp = await ev("(()=>{const P=S.pages[0],s=[...P.tl.querySelectorAll('span')].find(x=>x.textContent.includes('Router')),b=s.getBoundingClientRect(),r=P.el.getBoundingClientRect(),d=P.objs.filter(o=>o.type==='sym')[1];return {sp:[b.left+4,(b.top+b.bottom)/2],dev:[r.left+(d.x+d.w/2)*S.zoom,r.top+(d.y+d.h/2)*S.zoom]}})()");
  const lostN0 = (await lostSt()).n;
  // text drag interrupted by pointercancel
  await pointUntil(lsp.sp[0], lsp.sp[1], 'none');
  await pressAt(lsp.sp[0], lsp.sp[1]); await dragTo(lsp.sp[0] + 40, lsp.sp[1]);
  await ev("document.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true}))");
  const lc = await lostSt();
  await releaseAt(lsp.sp[0] + 40, lsp.sp[1]);
  ok('Text drag cancelled by pointercancel: ink restored, no stuck selecting/drag state', lc.pe === '' && !lc.sel && !lc.td && lc.n === lostN0 && lc.cur !== 'none', lc);
  // object drag whose pointerup is lost: the next move without a button must not keep dragging
  await ev("setSel(null);S.pages[0].ink.style.pointerEvents=''");
  await mv(lsp.dev[0], lsp.dev[1]); await pressAt(lsp.dev[0], lsp.dev[1]); await dragTo(lsp.dev[0] + 30, lsp.dev[1] + 20);
  const lp0 = await ev("JSON.stringify(S.pages[0].objs.filter(o=>o.type==='sym').map(o=>[o.x,o.y]))");
  await ev(`(()=>{const k=S.pages[0].ink;for(const d of [[120,90],[200,90]])k.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:${lsp.dev[0]}+d[0],clientY:${lsp.dev[1]}+d[1],buttons:0,pointerType:'mouse',pointerId:1,isPrimary:true}))})()`);
  const lp1 = await ev("JSON.stringify(S.pages[0].objs.filter(o=>o.type==='sym').map(o=>[o.x,o.y]))"), lo = await lostSt();
  ok('Object drag with lost pointerup stops following the mouse; objects intact, no stale DRAG', lp0 === lp1 && lo.n === lostN0 && !lo.drag && lo.cur !== 'none', { lo, same: lp0 === lp1 });
  await releaseAt(lsp.dev[0] + 200, lsp.dev[1] + 90);
  await ev("setSel(null)"); await mv(lsp.dev[0], lsp.dev[1] + 20); await sleep(100);
  const ld = await ev("(()=>{const P=S.pages[0],r=P.el.getBoundingClientRect(),d=P.objs.filter(o=>o.type==='sym')[1];return [r.left+(d.x+d.w/2)*S.zoom,r.top+(d.y+d.h/2)*S.zoom]})()");
  await mv(ld[0], ld[1]); await pressAt(ld[0], ld[1]); await releaseAt(ld[0], ld[1]); await sleep(150);
  // stale state while a press arrives (read before the release, which would also clean up): cached drag layers are dropped, transparent ink is made clickable again
  await ev("setSel(null);{const P=S.pages[0];while(P.objs.length<12)P.objs.push({type:'rect',x:20+P.objs.length*3,y:700,w:20,h:10,color:'#000000',lw:1,fill:'none'});dragBegin(0,P.objs[0]);S.pages[0].ink.style.pointerEvents='none'}");
  const stPre = await ev("!!DRAG&&S.pages[0].ink.style.pointerEvents==='none'");
  await mv(5, 5); await pressAt(5, 5);
  const stDown = await ev("JSON.stringify({drag:!!DRAG,pe:S.pages[0].ink.style.pointerEvents})"); await releaseAt(5, 5);
  ok('A press drops stale drag layers and resets stale transparent ink before anything else', stPre === true && stDown === '{"drag":false,"pe":""}', { stPre, stDown });
  // Notes and to-dos survive save + reopen + second save at full length (old caps: 2e6 characters, 5000 to-dos)
  const nrt = await ev("(async()=>{const mk=n=>{let s='';const u='Ärger ß 😀 Zeile\\n';while(s.length<n)s+=u;return s.slice(0,n)},tasks=Array.from({length:6000},(_,i)=>({t:'Aufgabe '+i+' 😀 ä',d:i%3===0})),res=[];await openPdf(await (async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);return d.save()})(),'notes.pdf');await new Promise(r=>setTimeout(r,500));"
    + "for(const n of [5e3,5e4,5e5,2.5e6]){const notes=mk(n);notesSet(notes);tasksSet(n>1e6?tasks:[]);let out=await buildOutput();let okk=true;for(let k=0;k<2;k++){await openPdf(out,'notes.pdf');okk=okk&&S.notes===notes&&S.tasks.length===(n>1e6?6000:0)&&(n<=1e6||S.tasks[5999].t===tasks[5999].t);out=await buildOutput()}res.push([n,okk])}return JSON.stringify(res)})()", 150000);
  ok('Long notes and 6000 to-dos round-trip exactly (5k, 50k, 500k, 2.5M characters, saved twice)', typeof nrt === 'string' && JSON.parse(nrt).every(r => r[1] === true), nrt);
  // Merging Layr-saved PDFs keeps their objects editable, remaps ids (same file twice) and joins the notes
  const mg = await ev("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),mkDoc=async(n)=>{const d=await PDFLib.PDFDocument.create();for(let k=0;k<n;k++)d.addPage([595,842]);await openPdf(await d.save(),'m.pdf');await w(400)};"
    + "await mkDoc(2);setTool('select');insertOrgTemplate('topo_star');S.pages[0].objs.push({type:'text',x:60,y:60,text:'Merge Hallo',fs:20,color:'#000000',lw:0,orient:'h'});S.pages[1].objs.push({type:'text',x:60,y:60,text:'Seite zwei',fs:20,color:'#000000',lw:0,orient:'h'});notesSet('Notiz A');tasksSet([{t:'Aufgabe A',d:false}]);markDirty();"
    + "const A=await buildOutput(),snapA=JSON.parse(JSON.stringify(S.pages.map(P=>P.objs)));await mkDoc(1);S.pages[0].objs=JSON.parse(JSON.stringify(snapA[0]));notesSet('Notiz B');tasksSet([]);markDirty();const B=await buildOutput();"
    + "await mkDoc(1);mItems=[{name:'a.pdf',bytes:A,pages:2},{name:'b.pdf',bytes:B,pages:1}];await $('#mOk').onclick();await w(1200);"
    + "const cnt=S.pages.map(P=>P.objs.length),oids=S.pages.flatMap(P=>P.objs.map(o=>o.oid).filter(Boolean)),dock=S.pages.map(P=>{const ids=new Set(P.objs.map(o=>o.oid));const L=P.objs.filter(o=>o.type==='line'&&o.link);return L.length>0&&L.every(o=>ids.has(o.link.a)&&ids.has(o.link.b))});"
    + "return JSON.stringify({n:S.pages.length,cnt,srcCnt:[snapA[0].length,snapA[1].length,snapA[0].length],uniq:new Set(oids).size===oids.length,dock,notes:S.notes,tasks:S.tasks.length,txt:S.pages[0].objs.some(o=>o.type==='text'&&o.text==='Merge Hallo')})})()", 90000);
  const mgj = JSON.parse(mg || '{}');
  ok('Merge keeps objects per page (counts match the sources), ids unique, docked lines stay docked, notes joined', mgj.n === 3 && JSON.stringify(mgj.cnt) === JSON.stringify(mgj.srcCnt) && mgj.uniq && mgj.dock[0] && mgj.dock[2] && /Notiz A/.test(mgj.notes) && /Notiz B/.test(mgj.notes) && mgj.tasks === 1 && mgj.txt, mgj);
  const mtp = await ev("(()=>{const P=S.pages[0],r=P.el.getBoundingClientRect(),o=P.objs.find(o=>o.type==='text');return [r.left+(o.x+20)*S.zoom,r.top+(o.y+10)*S.zoom]})()");
  await ev("setTool('select');setSel(null)"); await mv(mtp[0], mtp[1]); await sleep(100);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: mtp[0], y: mtp[1], button: 'left', buttons: 1, clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mtp[0], y: mtp[1], button: 'left', buttons: 0, clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: mtp[0], y: mtp[1], button: 'left', buttons: 1, clickCount: 2 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mtp[0], y: mtp[1], button: 'left', buttons: 0, clickCount: 2 }); await sleep(300);
  ok('Merged text box opens the editor on double-click', await ev("!!editorEl&&!!editingObj&&editingObj.type==='text'&&editingObj.text==='Merge Hallo'") === true);
  await ev('closeEditor()');
  // Merging a Layr-saved PDF with a filled form keeps the typed values (the embedded original has none) and says so
  const mf = await ev("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);d.getForm().createTextField('fname').addToPage(d.getPage(0),{x:50,y:700,width:200,height:24});"
    + "await openPdf(await d.save(),'f.pdf');await w(600);fmSet('fname','Anna Merge');S.pages[0].objs.push({type:'text',x:60,y:60,text:'Form Merge',fs:20,color:'#000000',lw:0,orient:'h'});markDirty();const A=await buildOutput();"
    + "const e=await PDFLib.PDFDocument.create();e.addPage([595,842]);const B=await e.save();await openPdf(B,'e.pdf');await w(400);mItems=[{name:'f.pdf',bytes:A,pages:1},{name:'e.pdf',bytes:B,pages:1}];const T=[],t0=window.toast;window.toast=m=>{T.push(m);t0(m)};await $('#mOk').onclick();await w(1200);window.toast=t0;"
    + "return JSON.stringify({n:S.pages.length,v:S.form.fname,toast:T.join(' | ')})})()", 60000);
  const mfj = JSON.parse(mf || '{}');
  ok('Merge of a Layr-saved PDF with a filled form keeps the form value and shows the notice', mfj.n === 2 && mfj.v === 'Anna Merge' && /Formular|form values/.test(mfj.toast), mfj);
  // Embedded original that pdf.js opens but pdf-lib rejects: the merge falls back to the saved pages instead of aborting (pdf-lib load patched to reject the original's bytes)
  const mb = await ev("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms));const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);d.addPage([595,842]);await openPdf(await d.save(),'g.pdf');await w(400);const L=S.bytes.length;S.pages[0].objs.push({type:'text',x:60,y:60,text:'Broken Orig',fs:20,color:'#000000',lw:0,orient:'h'});markDirty();const A=await buildOutput();"
    + "const e=await PDFLib.PDFDocument.create();e.addPage([595,842]);const B=await e.save();await openPdf(B,'e.pdf');await w(400);mItems=[{name:'g.pdf',bytes:A,pages:2},{name:'e.pdf',bytes:B,pages:1}];const l0=PDFLib.PDFDocument.load;PDFLib.PDFDocument.load=function(b,o){if(b&&b.length===L)return Promise.reject(new Error('garbled'));return l0.call(this,b,o)};"
    + "try{await $('#mOk').onclick();await w(1200)}finally{PDFLib.PDFDocument.load=l0}return S.pages.length})()", 60000);
  ok('Merge with an embedded original pdf-lib cannot load falls back to the saved pages', mb === 3, mb);
  // Recovery storage: a Layr-saved PDF (opens with objects) still adopts old-format keys and drops them; crForget leaves nothing of the file behind
  const sa = await ev("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),LS=localStorage,mine=()=>Object.keys(LS).filter(k=>k.includes('adopt.pdf'));const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);await openPdf(await d.save(),'adopt.pdf');await w(400);"
    + "S.pages[0].objs.push({type:'text',x:60,y:60,text:'Adopt',fs:20,color:'#000000',lw:0,orient:'h'});markDirty();const A=await buildOutput(),ko=storeKeyOld();await w(600);mine().forEach(k=>LS.removeItem(k));"
    + "LS.setItem(ko,'[[]]');LS.setItem(ko+':notes','Alte Notiz');LS.setItem(ko+':tasks','[]');LS.setItem('pdfwerkbank:cardsdue',JSON.stringify({[ko]:{name:'adopt.pdf',n:1,due:1,next:'2000-01-01',day:'2000-01-01',t:1}}));"
    + "await openPdf(A,'adopt.pdf');await w(500);const I=JSON.parse(LS.getItem('pdfwerkbank:cardsdue')||'{}'),kn=storeKey();const adopted=ko!==kn&&LS.getItem(ko)==null&&LS.getItem(ko+':notes')==null&&LS.getItem(ko+':tasks')==null&&!(ko in I)&&LS.getItem(kn+':notes')==='Alte Notiz';"
    + "LS.setItem(ko,'x');LS.setItem(ko+':notes','x');LS.setItem(ko+':tasks','x');LS.setItem(kn,'x');LS.setItem(kn+':notes','x');LS.setItem(kn+':tasks','x');LS.setItem('pdfwerkbank:cardsdue',JSON.stringify({[ko]:{n:1},[kn]:{n:1},other:{n:1}}));crForget();"
    + "const gone=mine().length===0&&Object.keys(JSON.parse(LS.getItem('pdfwerkbank:cardsdue'))).join()==='other';return JSON.stringify({adopted,gone,left:mine()})})()", 60000);
  const saj = JSON.parse(sa || '{}');
  ok('Layr-saved PDF adopts old recovery keys (cards index too) and crForget removes both key formats', saj.adopted === true && saj.gone === true, saj);
  // Storage full while adopting old-format data: the restore still works from the old key
  const sq = await ev("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),LS=localStorage;const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);const B=await d.save();await openPdf(B,'quota.pdf');await w(400);const ko=storeKeyOld();await w(600);Object.keys(LS).filter(k=>k.includes('quota.pdf')).forEach(k=>LS.removeItem(k));"
    + "LS.setItem(ko,JSON.stringify([[{type:'text',x:40,y:40,text:'Quota Rest',fs:20,color:'#000000',lw:0,orient:'h'}]]));LS.setItem(ko+':notes','Quota Notiz');const si=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(String(k).includes('quota.pdf:'))throw new DOMException('full','QuotaExceededError');return si.call(this,k,v)};"
    + "try{await openPdf(B,'quota.pdf');await w(500)}finally{Storage.prototype.setItem=si}return JSON.stringify({t:S.pages[0].objs.some(o=>o.text==='Quota Rest'),n:S.notes})})()", 60000);
  const sqj = JSON.parse(sq || '{}');
  ok('Restore still works when the recovery key cannot be written (storage full)', sqj.t === true && sqj.n === 'Quota Notiz', sqj);
  // Tables grow downward when a committed cell text needs more rows; empty/short cells keep the old height; Undo restores
  const tg = await ev("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),P=S.pages[0];P.objs.length=0;H.u.length=0;const o={type:'table',x:60,y:100,w:240,h:90,rows:3,cols:2,cw:[.5,.5],rh:[1/3,1/3,1/3],cells:[['a','b'],['',''],['','']],fs:11,color:'#000000',lw:1,head:true,fill:'white'};P.objs.push(o);redraw(0);"
    + "const rows=()=>o.rh.map(f=>f*o.h),h0=o.h,r0=rows();const cm=t=>{editCell(0,o,1,0);const d=editorDone;editorDone=null;closeEditor();d(t)};cm('short');const shortSame=Math.abs(o.h-h0)<1e-6;"
    + "cm('This is a rather long text that cannot fit into one line of this narrow cell at all '.repeat(3));await w(100);const r1=rows(),grown=o.h>h0+10&&r1[1]>r0[1]+10&&Math.abs(r1[0]-r0[0])<1e-6&&Math.abs(r1[2]-r0[2])<1e-6&&Math.abs(o.y-100)<1e-6;"
    + "undo();await w(100);const back=Math.abs(o.h-h0)<1e-6||(P.objs[0]&&Math.abs(P.objs[0].h-h0)<1e-6);return JSON.stringify({shortSame,grown,back,h0,h1:o.h})})()");
  const tgj = JSON.parse(tg || '{}');
  ok('Table rows grow with long cell text, short text keeps the height, Undo restores', tgj.shortSame === true && tgj.grown === true && tgj.back === true, tgj);
  // Table growth bounds and triggers: shifts up at the page end, notice when taller than the page, font size and column drag refit, Settings switch off = old behaviour
  const tgb = await ev("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),P=S.pages[0],LONG='This is a rather long text that cannot fit into one line of this narrow cell at all '.repeat(3);const out={};"
    + "const mk=(y,fs)=>{const o={type:'table',x:60,y,w:240,h:60,rows:2,cols:2,cw:[.5,.5],rh:[.5,.5],cells:[['a','b'],['','']],fs:fs||11,color:'#000000',lw:1,head:true,fill:'white'};P.objs.length=0;P.objs.push(o);redraw(0);return o};"
    + "const cm=(o,t)=>{editCell(0,o,1,0);const d=editorDone;editorDone=null;closeEditor();d(t)};"
    + "let o=mk(P.h-70);cm(o,LONG);out.shift=o.h>70&&o.y+o.h<=P.h+1e-6&&o.y<P.h-70;"
    + "o=mk(10);const T=[],t0=window.toast;window.toast=m=>{T.push(m);t0(m)};cm(o,('Zeile\\n').repeat(120));window.toast=t0;out.tall=o.h>P.h&&o.y===0&&T.some(m=>/ragt/.test(m));"
    + "o=mk(100,11);o.cells[1][0]='Ein Text der in einer Zelle bei grosser Schrift umbrechen muss';setSel({p:0,o});const h0=o.h;applySel({fs:30},false);out.fsGrow=o.h>h0+10;"
    + "o=mk(100,11);o.cells[1][1]='Ein Text der nach dem Ziehen der Spaltentrennlinie umbrechen muss';out.dragSetup=[o.x,o.y,o.w,o.h];setSel({p:0,o});"
    + "const q=$('#tGrow');q.checked=false;q.onchange();o=mk(100,11);cm(o,LONG);out.offSame=Math.abs(o.h-60)<1e-6;o.h=60;o.cells[1][0]='';applySel({fs:30},false);out.offFs=Math.abs(o.h-60)<1e-6;q.checked=true;q.onchange();out.persist=localStorage.getItem('pdfwerkbank:tblgrow')==='1';return JSON.stringify(out)})()", 60000);
  const tbj = typeof tgb === 'string' ? JSON.parse(tgb) : { err: tgb };
  ok('Table grow: shifts up at the page end, notice when taller than the page, font size refits, Settings switch off keeps the old height', tbj.shift === true && tbj.tall === true && tbj.fsGrow === true && tbj.offSame === true && tbj.offFs === true && tbj.persist === true, tbj);
  {
    const [tx, ty, tw, th] = tbj.dragSetup || [0, 0, 0, 0];
    await ev("(()=>{const P=S.pages[0];P.objs.length=0;const o={type:'table',x:60,y:100,w:240,h:60,rows:2,cols:2,cw:[.5,.5],rh:[.5,.5],cells:[['a','b'],['','Ein Text der nach dem Ziehen der Spaltentrennlinie umbrechen muss']],fs:11,color:'#000000',lw:1,head:true,fill:'white'};P.objs.push(o);redraw(0);setTool('select');setSel({p:0,o})})()");
    const gp = await ev("(()=>{const P=S.pages[0],r=P.el.getBoundingClientRect(),o=P.objs[0];return [r.left+(o.x+o.w*.5)*S.zoom,r.top+(o.y+o.h*.75)*S.zoom,r.left+(o.x+o.w-20)*S.zoom]})()");
    await mv(gp[0], gp[1]); await pressAt(gp[0], gp[1]); await dragTo(gp[0] + 20, gp[1]); await dragTo(gp[2], gp[1]); await releaseAt(gp[2], gp[1]); await sleep(150);
    ok('Table column drag that makes a cell wrap refits the rows', await ev("(()=>{const o=S.pages[0].objs[0];return o.cw[1]<.2&&o.h>75})()") === true, await ev("JSON.stringify(S.pages[0].objs[0].cw)+' '+S.pages[0].objs[0].h"));
  }
  // Window/taskbar icon: transparent variant exists (png corners alpha 0, ico has 16..256), wired in main.js and package.json; installer and Store keep the black icon
  const icoOk = (() => { try { const b = fs.readFileSync('build/icon-transparent.ico'), n = b.readUInt16LE(4), s = []; for (let i = 0; i < n; i++) s.push(b[6 + 16 * i] || 256); return [16, 24, 32, 48, 64, 128, 256].every(x => s.includes(x)); } catch (e) { return false; } })();
  const pngCorners = f => { try { const b = fs.readFileSync(f); let o = 8, w = 0, d = []; while (o < b.length) { const n = b.readUInt32BE(o), t = b.toString('latin1', o + 4, o + 8); if (t === 'IHDR') { w = b.readUInt32BE(o + 8); if (b[o + 17] !== 6) return null; } if (t === 'IDAT') d.push(b.subarray(o + 8, o + 8 + n)); o += 12 + n; } const r = zlib.inflateSync(Buffer.concat(d)), row = Buffer.alloc(w * 4); for (let i = 0; i < w * 4; i++) { const a = i >= 4 ? row[i - 4] : 0, f = r[0]; row[i] = (r[1 + i] + (f === 1 || f === 4 ? a : f === 3 ? a >> 1 : 0)) & 255; } return [row[3], row[w * 4 - 1]]; } catch (e) { return null; } };
  const pj = JSON.parse(fs.readFileSync('package.json', 'utf8')).build, mainJs = fs.readFileSync('app/main.js', 'utf8');
  const winIcon = /new BrowserWindow\(\{[^]*?icon:\s*path\.join\(__dirname,\s*'icon-transparent\.png'\)/.test(mainJs);
  ok('Transparent window icon: files exist, png corners alpha 0, ico 16..256, BrowserWindow + win.icon wired, installer/Store/linux package icons untouched',
    icoOk && fs.existsSync('app/icon-transparent.png') && JSON.stringify(pngCorners('build/icon-transparent.png')) === '[0,0]' && JSON.stringify(pngCorners('app/icon-transparent.png')) === '[0,0]' && winIcon
    && pj.win.icon === 'build/icon-transparent.ico' && pj.nsis.installerIcon === 'build/icon.ico' && [pj.win.icon, pj.nsis.installerIcon, pj.nsis.uninstallerIcon, pj.linux.icon].every(f => fs.existsSync(f)) && fs.existsSync('build/appx/Square44x44Logo.png'));
  // Ruler rotates around its centre: the angle field and the handle (Shift = 15 degree steps) keep the centre fixed
  const rz = await ev("(()=>{toggleRuler(true);R.x=300;R.y=250;R.a=0;drawRuler();const c=()=>{const r=ruler.getBoundingClientRect();return[r.left+r.width/2,r.top+r.height/2]},c0=c(),inp=$('#rulerAngIn');inp.value='30';inp.dispatchEvent(new Event('input'));const c1=c(),a1=R.a,sec=!$('#rulerSec').hidden;const h=$('#rulerRot').getBoundingClientRect();return JSON.stringify({c0,c1,a1,sec,hx:h.left+h.width/2,hy:h.top+h.height/2})})()");
  const rzj = JSON.parse(rz || '{}');
  ok('Ruler angle field rotates around the centre (centre fixed, angle set, panel section visible)', rzj.c0 && Math.hypot(rzj.c0[0] - rzj.c1[0], rzj.c0[1] - rzj.c1[1]) < 0.6 && Math.abs(rzj.a1 + Math.PI / 6) < 1e-6 && rzj.sec === true, rzj);
  const rotDrag = async (dAng, mod) => {
    await ev("(()=>{R.x=Math.round(innerWidth/2-parseFloat(ruler.style.width)/2);R.y=Math.round(innerHeight/2-R.H/2);R.a=0;placeRuler()})()"); await sleep(50); // start from a visible position
    const st = JSON.parse(await ev("(()=>{const r=ruler.getBoundingClientRect(),h=$('#rulerRot').getBoundingClientRect();return JSON.stringify({c:[r.left+r.width/2,r.top+r.height/2],h:[h.left+h.width/2,h.top+h.height/2]})})()"));
    const a = Math.atan2(st.h[1] - st.c[1], st.h[0] - st.c[0]) + dAng, d = Math.hypot(st.h[0] - st.c[0], st.h[1] - st.c[1]);
    await mv(st.h[0], st.h[1]); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: st.h[0], y: st.h[1], button: 'left', buttons: 1, clickCount: 1, modifiers: mod });
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: st.c[0] + d * Math.cos(a), y: st.c[1] + d * Math.sin(a), button: 'left', buttons: 1, modifiers: mod }); await sleep(50);
    const r = JSON.parse(await ev("(()=>{const r=ruler.getBoundingClientRect();return JSON.stringify({c:[r.left+r.width/2,r.top+r.height/2],a:R.a})})()"));
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: st.c[0], y: st.c[1], button: 'left', buttons: 0, clickCount: 1 });
    return { drift: Math.hypot(r.c[0] - st.c[0], r.c[1] - st.c[1]), a: r.a, want: Math.atan2(st.h[1] - st.c[1], st.h[0] - st.c[0]) + dAng };
  };
  const rd1 = await rotDrag(0.62, 0), rd2 = await rotDrag(0.31, 8);
  ok('Ruler handle drag rotates around the centre (centre fixed, angle follows the pointer, Shift snaps to 15 degrees)',
    rd1.drift < 0.6 && Math.abs(rd1.a - rd1.want) < 0.01 && rd2.drift < 0.6 && Math.abs(rd2.a / (Math.PI / 12) - Math.round(rd2.a / (Math.PI / 12))) < 1e-6, { rd1, rd2 });
  await ev("toggleRuler(false)");
  // Recovery store: equal name + size but different content must not share annotations; old-key data is adopted by the fingerprint key
  const rk = await ev("(async()=>{window.__errs=[];addEventListener('error',e=>__errs.push(String(e.message)));addEventListener('unhandledrejection',e=>__errs.push(String(e.reason)));const w=ms=>new Promise(r=>setTimeout(r,ms)),mk=async t=>{const d=await PDFLib.PDFDocument.create();d.setTitle(t);d.setCreationDate(new Date(0));d.setModificationDate(new Date(0));d.setProducer('p');d.setCreator('c');d.addPage([300,300]);return await d.save({useObjectStreams:false})};"
    + "const A=await mk('AAAAAAAA'),B=await mk('BBBBBBBB'),sameSize=A.length===B.length,differ=A.some((x,i)=>x!==B[i]);const obj=()=>({type:'text',x:40,y:40,text:'Rec',fs:20,color:'#000000',lw:0,orient:'h'});const n=()=>S.pages[0].objs.length;"
    + "await openPdf(A.slice(),'same.pdf');await w(300);S.pages[0].objs.push(obj());markDirty();await w(700);await openPdf(B.slice(),'same.pdf');await w(300);const nB=n();await openPdf(A.slice(),'same.pdf');await w(300);const nA=n();"
    + "const C=await mk('CCCCCCCC');await openPdf(C.slice(),'old.pdf');await w(300);S.pages[0].objs.push(obj());const snap=snapshot();const nk=storeKey(),ok0=storeKeyOld();[nk,nk+':notes',nk+':tasks'].forEach(k=>localStorage.removeItem(k));localStorage.setItem(ok0,snap);localStorage.setItem(ok0+':notes','old note');"
    + "await openPdf(C.slice(),'old.pdf');await w(300);const old={n:n(),moved:localStorage.getItem(nk)!=null&&localStorage.getItem(ok0)===null,note:S.notes==='old note',noteMoved:localStorage.getItem(nk+':notes')==='old note'&&localStorage.getItem(ok0+':notes')===null,key:/:[0-9a-f]{20}$/.test(nk)};"
    + "return JSON.stringify({sameSize,differ,nA,nB,old,errs:__errs})})()", 60000);
  const rkj = JSON.parse(rk || '{}');
  ok('Recovery store: same name and size but different content do not share annotations; old-key data is adopted and the old key removed; no errors',
    rkj.sameSize && rkj.differ && rkj.nA === 1 && rkj.nB === 0 && rkj.old && rkj.old.n === 1 && rkj.old.moved && rkj.old.note && rkj.old.noteMoved && rkj.old.key && rkj.errs.length === 0, rkj);
  // Sidebar text format toggles (A8)
  const tf = await ev("(()=>{const q=k=>document.querySelector('#tfmt [data-k='+k+']'),pr=k=>q(k).getAttribute('aria-pressed'),r={};setSel(null);S.bold=S.italic=S.underline=false;S.hbg='';S.orient='h';syncFmt();"
    + "q('bold').click();r.on=S.bold===true&&pr('bold')==='true';q('bold').click();r.off=S.bold===false&&pr('bold')==='false';"
    + "q('italic').click();document.querySelector('#tfbg [data-a=bg]').click();document.querySelector('#tfpw .edsw[data-c=\"#ffd60a\"]').click();"
    + "newText(0,120,200);ED.eng.put('Neu');const o=ED.o;r.inh=o.italic===true&&o.hbg==='#ffd60a'&&!o.bold;closeEditor();"
    + "const t={type:'text',x:100,y:300,text:'Sel',fs:14,color:'#000000',lw:0,orient:'h'};S.pages[0].objs.push(t);setSel({p:0,o:t});q('bold').click();r.selB=t.bold===true&&pr('bold')==='true';"
    + "document.querySelector('#tfpw .edsw-none').click();r.selBg=!('hbg' in t);q('italic').click();r.selIt=t.italic===true&&pr('italic')==='true';q('italic').click();r.selIt=r.selIt&&!('italic' in t)&&pr('italic')==='false';"
    + "setSel(null);S.hbg='#ffd60a';S.orient='stack';syncFmt();r.stack=document.querySelector('#tfbg [data-a=bg]').disabled;newText(0,120,200);ED.eng.put('St');r.noBg=!('hbg' in ED.o);closeEditor();"
    + "S.orient='h';S.bold=S.italic=S.underline=false;S.hbg='';setSel(null);syncFmt();S.pages[0].objs=S.pages[0].objs.filter(x=>x!==t&&x.text!=='Neu'&&x.text!=='St');return JSON.stringify(r)})()");
  const tfj = JSON.parse(tf || '{}');
  ok('Sidebar format toggles: bold switches on and off, new text inherits italic/background, selected text follows, no background for stacked text',
    tfj.on && tfj.off && tfj.inh && tfj.selB && tfj.selBg && tfj.selIt && tfj.stack && tfj.noBg, tfj);
  // Numbers use the UI font with tabular figures (C2)
  ok('UI numbers (page, zoom, value labels) use the UI font with tabular figures, not the mono font',
    await ev("['.status .pg','.zoomv','.val','.page .pno'].every(q=>{const e=document.querySelector(q);if(!e)return false;const c=getComputedStyle(e);return c.fontFamily===getComputedStyle(document.body).fontFamily&&c.fontVariantNumeric.includes('tabular-nums')})") === true);
  // Save indicator (B11): states, aria, setting, sanitiser, contrast
  const sv1 = await ev("(()=>{const h=document.querySelector('#hdrSave'),d0=S.dirty,st0=design.saveStyle,r={};r.live=h.getAttribute('role')==='status'&&h.getAttribute('aria-live')==='polite';"
    + "const get=()=>[h.dataset.st,h.getAttribute('aria-label'),h.textContent,!!h.querySelector('svg')];"
    + "for(const sty of ['icon','text']){design.saveStyle=sty;applyDesign(false);h._k=null;"
    + "S.dirty=false;setSaveState();const a=get();S.dirty=true;setSaveState();const b=get();setSaveState('Speichert …');const c=get();setSaveState('Automatisches Speichern fehlgeschlagen.');const e=get();"
    + "r[sty]=a[0]==='saved'&&b[0]==='dirty'&&c[0]==='busy'&&e[0]==='error'&&new Set([a[1],b[1],c[1],e[1]]).size===4&&a[2]==='Gespeichert'&&b[2]==='Nicht gespeichert'&&c[2]==='Speichert …'&&e[2]==='Speichern fehlgeschlagen'&&a[3]&&b[3]&&c[3]&&e[3]&&getComputedStyle(document.documentElement).getPropertyValue('--x')==='';"
    + "S.dirty=true;setSaveState();r['cls'+sty]=h.classList.contains('unsaved')}"
    + "r.sr=(()=>{design.saveStyle='icon';h._k=null;setSaveState();return h.querySelector('.sv-sr')&&getComputedStyle(h.querySelector('.sv-sr')).width==='1px'})();"
    + "design.saveStyle='text';applyDesign(true);r.persist=JSON.parse(localStorage.getItem('pdfwerkbank:design')).saveStyle==='text'&&document.documentElement.dataset.savestyle==='text';"
    + "r.san=dSan({...design,saveStyle:'x'}).saveStyle==='icon'&&dSan({...design,saveStyle:'text'}).saveStyle==='text'&&DDEF.saveStyle==='icon';"
    + "design.saveStyle=st0;applyDesign(true);S.dirty=d0;setSaveState();return JSON.stringify(r)})()");
  const sv1j = JSON.parse(sv1 || '{}');
  ok('Save indicator: state, text and aria-label for saved/unsaved/saving/error in both styles, live region, setting persists, invalid value rejected',
    sv1j.live && sv1j.icon && sv1j.text && sv1j.clsicon && sv1j.clstext && sv1j.sr && sv1j.persist && sv1j.san, sv1j);
  const sv2 = await ev("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),h=document.querySelector('#hdrSave'),hd=document.querySelector('header'),d0={...design};"
    + "const rgb=c=>{let m=c.match(/color\\(srgb ([\\d.e-]+) ([\\d.e-]+) ([\\d.e-]+)/);if(m)return m.slice(1,4).map(x=>x*255);m=c.match(/rgba?\\(([\\d.]+)[, ]+([\\d.]+)[, ]+([\\d.]+)/);return m.slice(1,4).map(Number)};"
    + "const L=c=>{const [r,g,b]=rgb(c).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*b},cr=(a,b)=>{const x=L(a),y=L(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};"
    + "design.saveStyle='text';const res=[];let min=99;"
    + "for(const th of ['light','dark'])for(const bars of ['standard','tint','contrast','accent'])for(const dirty of [true,false]){design.theme=th;design.bars=bars;design.motion='off';applyDesign(false);S.dirty=dirty;h._k=null;setSaveState();await w(120);"
    + "const bg=getComputedStyle(h).backgroundColor,bgc=/\\(.*,\\s*0\\)$|\\/ 0\\)/.test(bg)||bg==='rgba(0, 0, 0, 0)'?getComputedStyle(hd).backgroundColor:bg;"
    + "for(const q of ['.sv-i','.sv-t']){const e=h.querySelector(q),c=getComputedStyle(e).color,k=cr(c,bgc);min=Math.min(min,k);if(k<4.5)res.push([th,bars,dirty,q,Math.round(k*100)/100])}}"
    + "Object.assign(design,d0);applyDesign(true);S.dirty=false;setSaveState();return JSON.stringify({min:Math.round(min*100)/100,bad:res})})()", 60000);
  const sv2j = JSON.parse(sv2 || '{}');
  ok('Save indicator: icon and text contrast >= 4.5:1 in light/dark with standard, tint, contrast and accent bars (saved and unsaved)', sv2j.bad && sv2j.bad.length === 0 && sv2j.min >= 4.5, sv2j);
  // Sidebar tips (B10, variant S3): overlay on focus, panel layout unchanged
  const spt = await ev("(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),P=document.querySelector('#panel'),c=document.querySelector('#qShape'),row=c.closest('[data-sph]'),r={};"
    + "const rgb=x=>{let m=x.match(/color\\(srgb ([\\d.e-]+) ([\\d.e-]+) ([\\d.e-]+)/);if(m)return m.slice(1,4).map(v=>v*255);return x.match(/[\\d.]+/g).slice(0,3).map(Number)};"
    + "const L=x=>{const [a,b,d]=rgb(x).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*a+.7152*b+.0722*d},cr=(x,y)=>{const p=L(x),q=L(y);return (Math.max(p,q)+.05)/(Math.min(p,q)+.05)};"
    + "const t=()=>document.querySelector('#spTip'),shown=()=>!!t()&&!t().hidden&&t().classList.contains('on');const h0=P.scrollHeight,top0=row.getBoundingClientRect().top;"
    + "design.hints='on';applyDesign(true);document.activeElement&&document.activeElement.blur();r.none=!shown();"
    + "c.focus();await w(600);r.show=shown()&&/Strichs/.test(t().textContent)&&c.getAttribute('aria-describedby')===row.dataset.sph.replace(/^/,'spd')&&document.getElementById(c.getAttribute('aria-describedby')).textContent===t().textContent;"
    + "r.same=P.scrollHeight===h0&&Math.abs(row.getBoundingClientRect().top-top0)<0.5;const tr0=t().getBoundingClientRect(),pl=P.getBoundingClientRect().left;r.beside=tr0.right<=pl&&tr0.left>=0&&tr0.top>=0&&tr0.bottom<=innerHeight;"
    + "r.size=parseFloat(getComputedStyle(t()).fontSize)>=12.5;r.contrast=cr(getComputedStyle(t()).color,getComputedStyle(t()).backgroundColor)>=4.5;"
    + "c.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));r.esc=!shown();"
    + "await w(600);r.noReshow=!shown();c.blur();await w(100);c.focus();await w(600);r.again=shown();"
    + "c.blur();await w(100);design.hints='off';applyDesign(true);c.focus();await w(600);r.off=!shown()&&!c.hasAttribute('aria-describedby');c.blur();"
    + "r.san=dSan({...design,hints:'x'}).hints==='on'&&DDEF.hints==='on'&&JSON.parse(localStorage.getItem('pdfwerkbank:design')).hints==='off';"
    + "r.noOld=[...document.querySelectorAll('#pProps .hint')].every(h=>h.id==='saveState'||h.id==='alHint');"
    + "design.hints='on';applyDesign(true);return JSON.stringify(r)})()", 30000);
  const spj = JSON.parse(spt || '{}');
  ok('Sidebar tips: shown on focus beside the panel without layout change, readable, Esc and the setting hide them, old hint paragraphs gone',
    spj.none && spj.show && spj.same && spj.beside && spj.size && spj.contrast && spj.esc && spj.noReshow && spj.again && spj.off && spj.san && spj.noOld, spj);
  // Templates: click-to-place (B1). Real mouse; geometry relative to the page, not font-based.
  {
    await ev("design.pager='off';applyDesign(true)"); // the floating page selector would sit on the test click points
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev("(async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);d.addPage([595,842]);await openPdf(await d.save(),'tpl.pdf');await new Promise(r=>setTimeout(r,500));tplClickOn=true;setTool('select');setSel(null)})()");
    const click = async (x, y) => { await mv(x, y); await pressAt(x, y); await releaseAt(x, y); await sleep(60); };
    const pagePt = async (i, fy) => { await ev(`S.pages[${i}].el.scrollIntoView({block:'start'})`); await sleep(300); return ev(`(()=>{const P=S.pages[${i}],r=P.el.getBoundingClientRect();return {l:r.left,t:r.top,z:S.zoom,w:P.w,h:P.h,cx:r.left+P.w*S.zoom/2,cy:r.top+P.h*S.zoom*${fy}}})()`); };
    const tileXY = cat => ev(`(()=>{S.cat=${JSON.stringify(cat)};buildCats();const b=document.querySelector('#symgrid .sym.tpl[data-k="'+window.__tk+'"]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    const run = async (cat, k, pi, fy) => {
      await ev(`window.__tk=${JSON.stringify(k)};S.pages.forEach(P=>P.objs=[]);setSel(null);H.u=[];H.r=[];updUndo()`);
      const t = await tileXY(cat); await click(t[0], t[1]);
      const r = { armed: await ev(`!!ARM&&ARM.k===${JSON.stringify(k)}&&document.querySelector('#symgrid .sym.tpl[data-k="${k}"]').getAttribute('aria-pressed')==='true'&&document.getElementById('app').classList.contains('armed')&&document.querySelector('.armhint').textContent.length>3`), noInsert: await ev("S.pages.every(P=>P.objs.length===0)") };
      const g = await pagePt(pi, fy); await mv(g.cx - 40, g.cy); await mv(g.cx, g.cy); await sleep(60);
      const gh = await ev("(()=>{const e=document.querySelector('.armghost');if(!e||e.hidden)return null;const r=e.getBoundingClientRect();return {l:r.left,t:r.top,w:r.width,h:r.height}})()");
      r.ghost = !!gh && Math.abs(gh.t + gh.h / 2 - g.cy) < 2 && gh.l >= g.l - 1 && gh.l + gh.w <= g.l + g.w * g.z + 1;
      await pressAt(g.cx, g.cy); await releaseAt(g.cx, g.cy); await sleep(150);
      const pl = await ev(`(()=>{const o=S.pages[${pi}].objs.filter(o=>o.type==='sym'),bb=orgBBox(o);return {n:S.pages[${pi}].objs.length,other:S.pages.filter((_,i)=>i!==${pi}).reduce((a,P)=>a+P.objs.length,0),arm:ARM,gh:!!document.querySelector('.armghost'),x:bb.x,y:bb.y,w:bb.w,h:bb.h,hu:H.u.length,sel:selItems().length}})()`);
      r.placed = !!gh && pl.n > 2 && pl.other === 0 && Math.abs(g.l + pl.x * g.z - gh.l) < 2 && Math.abs(g.t + pl.y * g.z - gh.t) < 2 && Math.abs(pl.w * g.z - gh.w) < 2 && Math.abs(pl.h * g.z - gh.h) < 2;
      r.once = pl.arm === null && !pl.gh && pl.hu === 1 && pl.sel === pl.n;
      r.undo = await ev("(()=>{undo();return S.pages.every(P=>P.objs.length===0)})()");
      return { r, pl, g };
    };
    for (const [cat, k, pi] of [['Organigramm', 'einlinie', 0], ['Netzwerk', 'net_home', 0], ['Topologien', 'topo_star', 1]]) {
      const { r } = await run(cat, k, pi, 0.5);
      ok(`Vorlage ${k}: armed (Kachel gedrückt, Hinweis), Vorschau folgt dem Zeiger, Klick platziert dort auf Seite ${pi + 1}, danach nicht mehr armed, Rückgängig = 1 Schritt`,
        r.armed && r.noInsert && r.ghost && r.placed && r.once && r.undo, r);
    }
    // two pointer positions on the same page differ by exactly the pointer offset (not placed at the centre)
    {
      const a = await run('Netzwerk', 'net_home', 0, 0.35), b = await run('Netzwerk', 'net_home', 0, 0.6);
      const dy = (b.pl.y - a.pl.y) * a.g.z, want = (b.g.cy - a.g.cy);
      ok('Vorlage: Platz folgt dem Klickpunkt (Versatz = Zeigerversatz)', Math.abs(dy - want) < 3, { dy, want });
    }
    // Esc and right click cancel, nothing inserted
    {
      await ev("window.__tk='net_home';S.pages.forEach(P=>P.objs=[])");
      let t = await tileXY('Netzwerk'); await click(t[0], t[1]);
      const armed0 = await ev('!!ARM');
      const g = await pagePt(0, 0.5); await mv(g.cx, g.cy);
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      const esc = armed0 && await ev("ARM===null&&!document.querySelector('.armghost')&&S.pages.every(P=>P.objs.length===0)");
      t = await tileXY('Netzwerk'); await click(t[0], t[1]); const armed1 = await ev('!!ARM'); await mv(g.cx, g.cy);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.cx, y: g.cy, button: 'right', buttons: 2, clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.cx, y: g.cy, button: 'right', buttons: 0, clickCount: 1 });
      const rc = armed1 && await ev("ARM===null&&S.pages.every(P=>P.objs.length===0)");
      // Shift keeps it armed for another placement; click on the other tile re-arms
      t = await tileXY('Netzwerk'); await click(t[0], t[1]); await mv(g.cx, g.cy);
      await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 });
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.cx, y: g.cy, button: 'left', buttons: 1, clickCount: 1, modifiers: 8 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.cx, y: g.cy, button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 }); await sleep(100);
      const sh = await ev("!!ARM&&S.pages[0].objs.length>2");
      await ev("armOff()");
      ok('Vorlage: Esc und Rechtsklick brechen ab (nichts eingefügt), Umschalt hält die Platzierung aktiv', esc && rc && sh, { esc, rc, sh });
    }
    // drag sizes uniformly
    {
      await ev("window.__tk='net_home';S.pages.forEach(P=>P.objs=[]);setSel(null)");
      const t = await tileXY('Netzwerk'); await click(t[0], t[1]);
      const g = await pagePt(0, 0.3);
      await mv(g.cx - 100, g.cy); await pressAt(g.cx - 100, g.cy); for (let i = 1; i <= 6; i++) await dragTo(g.cx - 100 + 25 * i, g.cy + 20 * i); await releaseAt(g.cx + 50, g.cy + 120); await sleep(150);
      const d = await ev("(()=>{const o=S.pages[0].objs.filter(o=>o.type==='sym'),bb=orgBBox(o);return {w:bb.w,h:bb.h,x:bb.x,y:bb.y,z:S.zoom}})()");
      const nat = await ev("(()=>{const bb=orgBBox(NET_TPL.find(t=>t.k==='net_home').b());return bb.w/bb.h})()");
      ok('Vorlage: Ziehen bestimmt die Größe (Seitenverhältnis bleibt, Ecke am Startpunkt)', d.w > 0 && Math.abs(d.w / d.h - nat) < 0.02 && Math.abs(g.l + d.x * d.z - (g.cx - 100)) < 3 && Math.abs(g.t + d.y * d.z - g.cy) < 3 && d.w * d.z < 520, { d, nat });
    }
    // setting OFF: old behaviour, centre insertion without arming
    {
      await ev("window.__tk='net_home';S.pages.forEach(P=>P.objs=[]);setSel(null);tplClickOn=false");
      const t = await tileXY('Netzwerk'); await click(t[0], t[1]);
      const off = await ev("ARM===null&&S.pages[0].objs.length>2&&Math.abs((()=>{const bb=orgBBox(S.pages[0].objs.filter(o=>o.type==='sym'));return bb.x+bb.w/2-S.pages[0].w/2})())<2");
      await ev("tplClickOn=true;S.pages.forEach(P=>P.objs=[]);setSel(null)");
      ok('Vorlage: Einstellung aus platziert wie früher sofort in der Mitte', off === true, off);
    }
    // keyboard: first Enter arms, second Enter places at the viewer centre
    {
      await ev("window.__tk='net_home';S.pages.forEach(P=>P.objs=[])");
      await tileXY('Netzwerk');
      const kb = await ev("(()=>{const b=document.querySelector('#symgrid .sym.tpl[data-k=\"net_home\"]');b.click();const a=!!ARM&&S.pages[0].objs.length===0;b.click();return a&&ARM===null&&S.pages.reduce((n,P)=>n+P.objs.length,0)>2})()");
      ok('Vorlage: Tastatur (Enter, Enter) platziert wie bisher in der Mitte', kb === true, kb);
      await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);redrawAll()");
    }
  }
  // B3: the 8 old single topology tiles create grouped, real, editable nodes (setting topoEditOn); OFF keeps the single symbol
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(TPJS); // helpers are gone after the openPdf of the previous block
    await ev("tplClickOn=true;topoEditOn=true;tplGroupOn=true;setTool('select');S.pages.forEach(P=>P.objs=[]);setSel(null);H.u=[];H.r=[];updUndo()");
    const click3 = async (x, y) => { await mv(x, y); await pressAt(x, y); await releaseAt(x, y); await sleep(80); };
    const tile3 = s => ev(`(()=>{S.cat='Topologien';buildCats();const b=document.querySelector('#symgrid .sym[data-s="${s}"]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    const res = {};
    for (const sy of ['t_star', 't_ring', 't_bus', 't_line', 't_mesh', 't_partmesh', 't_tree', 't_xstar']) {
      await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);H.u=[];H.r=[];updUndo()");
      const t = await tile3(sy); await click3(t[0], t[1]);
      const armed = await ev("!!ARM&&S.pages.every(P=>P.objs.length===0)");
      await ev("S.pages[0].el.scrollIntoView({block:'start'})"); await sleep(250);
      const g = await ev("(()=>{const r=S.pages[0].el.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height*.4]})()");
      await mv(g[0], g[1]); await click3(g[0], g[1]); await sleep(120);
      const st = await ev("(()=>{const o=S.pages[0].objs,sy=o.filter(q=>q.type==='sym'),ln=o.filter(q=>q.type==='line');return {sym:sy.length,ln:ln.length,oneGid:new Set(o.map(q=>q.gid)).size===1&&!!o[0].gid,linked:ln.every(l=>l.link&&sy.some(q=>q.oid===l.link.a)&&sy.some(q=>q.oid===l.link.b)),old:sy.some(q=>/^t_/.test(q.sym)),hu:H.u.length,arm:ARM}})()");
      let good = 0;
      const idx = await ev("S.pages[0].objs.map((o,i)=>o.type==='sym'&&o.label?i:-1).filter(i=>i>=0)");
      for (const i of idx) { await tpDbl(i); if (await ev(`!!editorEl&&editingObj===S.pages[0].objs[${i}]`) === true) good++;; await ev('tpEsc()'); await sleep(60); }
      await ev("setSel(null)");
      const un = await ev("(()=>{undo();return S.pages.every(P=>P.objs.length===0)})()");
      res[sy] = { armed, ...st, lab: idx.length, good, un };
      ok(`Topologie-Baustein ${sy}: Gruppe aus echten Knoten, Linien angedockt, Doppelklick je Knoten, Undo = 1 Schritt`,
        armed && st.sym >= 4 && st.ln >= st.sym - 1 && st.oneGid && st.linked && !st.old && st.hu === 1 && st.arm === null && idx.length === st.sym && good === idx.length && un, res[sy]);
    }
    // setting OFF: the single symbol as before
    await ev("topoEditOn=false;S.pages.forEach(P=>P.objs=[]);setSel(null);setTool('select')");
    const t = await tile3('t_star'); await click3(t[0], t[1]);
    const off = await ev("({arm:ARM,tool:S.tool,sym:S.sym})");
    await ev("topoEditOn=true;setTool('select')");
    ok('Topologie-Baustein: Einstellung aus wählt wie früher das Einzelsymbol (nicht armiert)', off.arm === null && off.tool === 'symbol' && off.sym === 't_star', off);
    // old documents: single symbols still select, move and resize with the mouse
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);zoomTo(1);S.pages[0].objs.push(sanObj({type:'sym',sym:'t_ring',x:200,y:200,w:120,h:90,color:'#1b2a3a',lw:1.2,fill:'white',fs:10,label:'X'}));redraw(0);S.pages[0].el.scrollIntoView({block:'start'})");
    await sleep(300);
    const sc3 = await ev("(()=>{const r=S.pages[0].el.getBoundingClientRect();return [r.left,r.top,S.zoom]})()");
    const P3 = (x, y) => [sc3[0] + x * sc3[2], sc3[1] + y * sc3[2]];
    let c = P3(260, 245); await click3(c[0], c[1]);
    const sel3 = await ev("!!S.sel&&S.sel.o.sym==='t_ring'");
    await mv(c[0], c[1]); await pressAt(c[0], c[1]); for (let i = 1; i <= 6; i++) await dragTo(c[0] + 10 * i, c[1] + 5 * i); await releaseAt(c[0] + 60, c[1] + 30); await sleep(100);
    const mvd = await ev("(()=>{const o=S.pages[0].objs[0];return [o.x,o.y]})()");
    const br = await ev("(()=>{const h=handles(S.sel.o).find(h=>h.k==='br');return [h.x,h.y]})()"); c = P3(br[0], br[1]);
    await mv(c[0], c[1]); await pressAt(c[0], c[1]); for (let i = 1; i <= 6; i++) await dragTo(c[0] + 8 * i, c[1] + 6 * i); await releaseAt(c[0] + 48, c[1] + 36); await sleep(100);
    const rsz = await ev("(()=>{const o=S.pages[0].objs[0];return [o.w,o.h]})()");
    ok('Alte Topologie-Symbole (Altdokument): Auswahl, Verschieben und Größe ziehen funktionieren', sel3 && Math.abs(mvd[0] - 260) < 1 && Math.abs(mvd[1] - 230) < 1 && Math.abs(rsz[0] - 168) < 1 && Math.abs(rsz[1] - 126) < 1, { sel3, mvd, rsz });
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);redrawAll()");
  }
  // B4a: double-click edits an existing object in every placement/shape tool without leaving an extra object (setting dblAllOn)
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev(TPJS);
    await ev("dblAllOn=true;tplClickOn=true;S.pages.forEach(P=>P.objs=[]);zoomTo(1);S.pages[0].objs.push(sanObj({type:'sym',sym:'pc',x:260,y:200,w:40,h:30,color:'#1b2a3a',lw:1.2,fill:'white',fs:10,label:'Eins'}));redraw(0);setSel(null);H.u=[];H.r=[];updUndo()");
    const dbl4 = async (ix = 0) => { await sleep(700); const p = await ev(`tpScr(tpPt(S.pages[0].objs[${ix}]))`); await mv(p[0], p[1]); for (const n of [1, 2]) { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', buttons: 1, clickCount: n }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', buttons: 0, clickCount: n }); } await sleep(250); };
    const state4 = () => ev("({n:S.pages[0].objs.length,hu:H.u.length,edit:!!editorEl&&editingObj===S.pages[0].objs[0],armed:!!ARM,txt:!!editorEl&&editingObj==null})");
    const res4 = {};
    for (const tool of ['symbol', 'rect', 'ellipse', 'line', 'arrow', 'pen', 'marker', 'text', 'armed']) {
      await ev(`closeEditor();setSel(null);${tool === 'armed' ? "setTool('select');armOn('net_home')" : `S.sym='server';setTool('${tool}')`};H.u=[];H.r=[];updUndo();S.pages[0].objs.length=1`);
      await dbl4(); const r = await state4(); await ev("closeEditor();armOff();setSel(null)");
      res4[tool] = r;
      ok(`Doppelklick im Werkzeug ${tool}: bearbeitet das Objekt, kein zusätzliches Objekt, kein Verlauf-Eintrag`, r.n === 1 && r.edit && r.hu === 0, r);
    }
    // an open edit that gets saved by the first click must not be undone by the dblclick (data loss, cases A text tool, B pen tool)
    await ev("closeEditor();setSel(null);S.pages[0].objs.length=1;setTool('text');newText(0,420,520);ED.eng.put('Hallo Welt');H.u=[];H.r=[];updUndo()");
    await dbl4(); const lossA = await ev("({n:S.pages[0].objs.length,txt:S.pages[0].objs.some(o=>o.type==='text'&&o.text==='Hallo Welt'),edit:!!editorEl&&editingObj===S.pages[0].objs[0]})"); await ev("closeEditor();setSel(null)");
    ok('Doppelklick im Textwerkzeug: ein offener Text bleibt erhalten (kein Datenverlust)', lossA.txt && lossA.edit && lossA.n === 2, lossA);
    await ev("closeEditor();setSel(null);S.pages[0].objs.length=1;S.pages[0].objs.push(sanObj({type:'sym',sym:'pc',x:420,y:300,w:40,h:30,color:'#1b2a3a',lw:1.2,fill:'white',fs:10,label:'Zwei'}));redraw(0);setTool('pen');H.u=[];H.r=[];updUndo()");
    await dbl4(0); await ev("ED.eng.put('NEU')"); await dbl4(1);
    const lossB = await ev("({l0:S.pages[0].objs[0].label,n:S.pages[0].objs.length,edit:!!editorEl&&editingObj===S.pages[0].objs[1]})"); await ev("closeEditor();setSel(null);setTool('select');S.pages[0].objs.length=1;S.pages[0].objs[0].label='Eins';H.u=[];H.r=[];updUndo()");
    ok('Doppelklick im Stiftwerkzeug: die Änderung am ersten Symbol bleibt, zweites Symbol wird bearbeitet', /NEU/.test(lossB.l0) && lossB.n === 2 && lossB.edit, lossB);
    // typing right after a click over an object in the text tool: the character lands in the new text box, no shortcut fires
    await ev("closeEditor();setSel(null);S.pages[0].objs.length=1;setTool('text');H.u=[];H.r=[];updUndo()");
    { await sleep(700); const p = await ev("tpScr(tpPt(S.pages[0].objs[0]))"); await mv(p[0], p[1]); await pressAt(p[0], p[1]); await releaseAt(p[0], p[1]); await sleep(60);
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77, text: 'm' }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'm', code: 'KeyM', windowsVirtualKeyCode: 77 }); await sleep(100); }
    const tk = await ev("({tool:S.tool,ed:!!editorEl&&ED&&ED.eng.value})"); await ev("closeEditor();setTool('select');setSel(null);S.pages[0].objs.length=1;H.u=[];H.r=[];updUndo()");
    ok('Textwerkzeug über einem Objekt: sofortiges Tippen (m) landet im Textfeld, Werkzeug bleibt', tk.tool === 'text' && tk.ed === 'm', tk);
    // full (capped) history: the dblclick still takes back the dots and opens the editor
    await ev("closeEditor();setSel(null);S.pages[0].objs.length=1;for(let q=0;q<160;q++)pushHist();setTool('pen')");
    await dbl4(); const cap4 = await state4(); await ev("closeEditor();setTool('select');setSel(null);S.pages[0].objs.length=1;H.u=[];H.r=[];updUndo()");
    ok('Doppelklick im Stiftwerkzeug bei vollem Verlauf (150): keine Punkte, Editor offen', cap4.n === 1 && cap4.edit, cap4);
    // a pen stroke that starts on the symbol and is followed by a quick click: the stroke stays (no dblclick undo)
    await ev("closeEditor();setSel(null);S.pages[0].objs.length=1;setTool('pen');H.u=[];H.r=[];updUndo()");
    { await sleep(700); const p = await ev("tpScr(tpPt(S.pages[0].objs[0]))"); await mv(p[0], p[1]); await pressAt(p[0], p[1]); for (let i = 1; i <= 5; i++) await dragTo(p[0] + 12 * i, p[1] + 3 * i); await releaseAt(p[0] + 60, p[1] + 15);
      await mv(p[0], p[1]); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: p[0], y: p[1], button: 'left', buttons: 1, clickCount: 2 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p[0], y: p[1], button: 'left', buttons: 0, clickCount: 2 }); await sleep(250); }
    const strk = await ev("({pens:S.pages[0].objs.filter(o=>o.type==='pen'&&o.pts.length>2).length,edit:!!editorEl&&editingObj!=null})"); await ev("closeEditor();setTool('select');S.pages[0].objs.length=1;setSel(null);H.u=[];H.r=[];updUndo()");
    ok('Stift: ein gezogener Strich bleibt, wenn direkt danach geklickt wird', strk.pens === 1 && !strk.edit, strk);
    // setting OFF: pen tool keeps the old behaviour (draws dots, no editor), proves the check is sensitive
    await ev("dblAllOn=false;closeEditor();setSel(null);setTool('pen');H.u=[];H.r=[];updUndo();S.pages[0].objs.length=1");
    await dbl4(); const off4 = await state4(); await ev("dblAllOn=true;closeEditor();setTool('select');S.pages[0].objs.length=1;setSel(null);H.u=[];H.r=[];updUndo()");
    ok('Doppelklick im Werkzeug: Einstellung aus verhält sich wie früher (Stift zeichnet, kein Editor)', off4.n > 1 && !off4.edit, off4);
    // double-click on empty paper in the pen tool still draws (nothing taken back)
    await ev("setTool('pen');H.u=[];H.r=[];updUndo();S.pages[0].objs.length=1");
    { const g = await ev("(()=>{S.pages[0].el.scrollIntoView({block:'start'});const r=S.pages[0].el.getBoundingClientRect();return [r.left+r.width*.8,r.top+r.height*.5]})()");
      await mv(g[0], g[1]); for (const n of [1, 2]) { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: g[0], y: g[1], button: 'left', buttons: 1, clickCount: n }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g[0], y: g[1], button: 'left', buttons: 0, clickCount: n }); } await sleep(250); }
    const emp = await state4(); await ev("setTool('select')");
    ok('Doppelklick im Stiftwerkzeug auf leerem Papier: Striche bleiben', emp.n > 1 && !emp.edit, emp);
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);H.u=[];H.r=[];updUndo()");
  }
  // B4b: «include»/«extend» buttons arm the arrow tool with a preset; with a selected line they label it as before
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev("zoomTo(1);S.pages.forEach(P=>P.objs=[]);setSel(null);setTool('select');H.u=[];H.r=[];updUndo();S.pages[0].el.scrollIntoView({block:'start'})");
    await sleep(300);
    const btn = id => ev(`(()=>{const b=document.getElementById('${id}');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    const c4 = async id => { const b = await btn(id); await mv(b[0], b[1]); await pressAt(b[0], b[1]); await releaseAt(b[0], b[1]); await sleep(100); };
    for (const [id, lab] of [['lnInc', '«include»'], ['lnExt', '«extend»']]) {
      await c4(id);
      const a0 = await ev("({tool:S.tool,pre:LNPRE&&LNPRE.label,n:S.pages[0].objs.length})");
      const g = await ev("(()=>{S.pages[0].el.scrollIntoView({block:'start'});const r=S.pages[0].el.getBoundingClientRect();return [r.left+r.width*.3,r.top+r.height*.3,S.zoom]})()");
      await mv(g[0], g[1]); await pressAt(g[0], g[1]); for (let i = 1; i <= 6; i++) await dragTo(g[0] + 20 * i, g[1] + 10 * i); await releaseAt(g[0] + 120, g[1] + 60); await sleep(120);
      const l = await ev("(()=>{const o=S.pages[0].objs;return {n:o.length,o:o[o.length-1],pre:LNPRE,hu:H.u.length}})()");
      ok(`${lab}-Knopf ohne Auswahl: Pfeilwerkzeug mit Voreinstellung, der nächste Pfeil ist gestrichelt, offen und beschriftet, genau ein Objekt`,
        a0.tool === 'arrow' && a0.pre === lab && a0.n === 0 && l.n === 1 && l.o.label === lab && l.o.dash === true && l.o.end === 'arrow' && l.o.start === 'none' && Math.abs((l.o.x2 - l.o.x1) * g[2] - 120) < 2 && Math.abs((l.o.y2 - l.o.y1) * g[2] - 60) < 2 && l.pre === null && l.hu === 1, { a0, l: { n: l.n, lab: l.o.label, dash: l.o.dash, end: l.o.end, pre: l.pre, hu: l.hu } });
      // the preset is one-shot: the next arrow is plain
      await mv(g[0], g[1] + 150); await pressAt(g[0], g[1] + 150); for (let i = 1; i <= 4; i++) await dragTo(g[0] + 20 * i, g[1] + 150); await releaseAt(g[0] + 80, g[1] + 150); await sleep(100);
      const p2 = await ev("(()=>{const o=S.pages[0].objs;return [o.length,o[o.length-1].label||null]})()");
      ok(`${lab}: Voreinstellung gilt nur für einen Pfeil`, p2[0] === 2 && p2[1] === null, p2);
      await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);setTool('select');H.u=[];H.r=[];updUndo()");
    }
    await c4('lnExt'); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    ok('«extend»-Voreinstellung: Esc bricht ab', await ev("LNPRE===null&&!document.querySelector('.armhint').textContent") === true);
    // selected line: old behaviour
    await ev("S.pages[0].objs.push({type:'line',x1:100,y1:100,x2:200,y2:100,color:'#000000',lw:1,dash:false,elbow:false,start:'none',end:'none'});setTool('select');setSel({p:0,o:S.pages[0].objs[0]});redraw(0)");
    await c4('lnInc');
    const sl = await ev("({lab:S.pages[0].objs[0].label,dash:S.pages[0].objs[0].dash,pre:LNPRE,tool:S.tool,n:S.pages[0].objs.length})");
    ok('«include»-Knopf mit gewählter Linie: beschriftet sie wie früher, keine Voreinstellung', sl.lab === '«include»' && sl.dash === true && sl.pre === null && sl.tool === 'select' && sl.n === 1, sl);
    ok('«include»/«extend»: Tooltip und aria-label vorhanden (de/en)', await ev("(()=>{const b=document.getElementById('lnInc');const d=b.title&&b.getAttribute('aria-label'),L0=LANG;LANG='en';const e=tr(b.title)!==b.title&&tr(b.getAttribute('aria-label'))!==b.getAttribute('aria-label');LANG='de';return !!d&&e})()") === true);
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);setTool('select')");
  }
  // Esc with a modal dialog open belongs to the dialog: an armed template / «include» preset stays, without dialog it is cancelled
  {
    const esc = async () => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(80); };
    await ev("armOn('net_home');LNPRE={label:'«include»'};document.getElementById('langDlg').hidden=false");
    await esc(); const withDlg = await ev("!!ARM&&!!LNPRE");
    await ev("document.getElementById('langDlg').hidden=true"); await esc(); await esc(); const without = await ev("ARM===null&&LNPRE===null");
    ok('Esc bei offenem Dialog bricht Vorlage/«include» nicht ab, ohne Dialog schon', withDlg === true && without === true, { withDlg, without });
    await ev("armOff();lnPreOff();setTool('select')");
  }
  // B1 ghost: follows scrolling without mouse move; clamped like the result (drag too, captions inside the page)
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);setTool('select');zoomTo(1)"); await sleep(300);
    await ev("S.pages[0].el.scrollIntoView({block:'end'})"); await sleep(250);
    const pg = await ev("(()=>{const r=S.pages[0].el.getBoundingClientRect();return [r.left+r.width/2,r.bottom-4,r.top]})()");
    await ev("armOn('net_home')"); await mv(pg[0], pg[1]); await sleep(80);
    const click3 = async (x, y) => { await mv(x, y); await pressAt(x, y); await releaseAt(x, y); await sleep(80); };
    const gh = () => ev("(()=>{const e=document.querySelector('.armghost');const r=e.getBoundingClientRect();return {t:r.top,h:r.height,b:r.bottom}})()");
    const g0 = await gh();
    await click3(pg[0], pg[1]); await sleep(150);
    const pl = await ev("(()=>{const P=S.pages[0],sy=P.objs.filter(o=>o.type==='sym'),bb=orgBBox(sy),fs=sy[0].fs;return {bottom:bb.y+bb.h+1.5*fs,ph:P.h,y:bb.y,z:S.zoom,top:P.el.getBoundingClientRect().top}})()");
    ok('Vorlage am unteren Seitenrand: Beschriftungen bleiben auf der Seite, Vorschau = Ergebnis', pl.bottom <= pl.ph + 0.5 && Math.abs(pl.top + pl.y * pl.z - g0.t) < 2, { pl, g0 });
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);S.pages[0].el.scrollIntoView({block:'end'})"); await sleep(250);
    const pg2 = await ev("(()=>{const r=S.pages[0].el.getBoundingClientRect();return [r.left+r.width/2,r.bottom-4]})()");
    await ev("armOn('net_home')"); await mv(pg2[0], pg2[1]); await sleep(80);
    const a0 = await gh(), pt0 = await ev("S.pages[0].el.getBoundingClientRect().top"); await ev("viewer.scrollTop-=60"); await sleep(250);
    const a1 = await gh(), pt1 = await ev("S.pages[0].el.getBoundingClientRect().top");
    // the page moved by d; the clamped ghost sits at the same page position, so it moved by d as well (a stale ghost would stay put)
    ok('Vorlage: Vorschau folgt dem Scrollen ohne Mausbewegung (neu berechnet)', Math.abs(pt1 - pt0) > 20 && Math.abs((a1.t - a0.t) - (pt1 - pt0)) < 3, { d: pt1 - pt0, g: a1.t - a0.t });
    await ev("armOff();S.pages.forEach(P=>P.objs=[]);setSel(null)");
  }
  // ARM drag: pointerup of another pointer is ignored, window blur ends a hanging drag
  {
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);S.pages[0].el.scrollIntoView({block:'start'})"); await sleep(250);
    const g = await ev("(()=>{const r=S.pages[0].el.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height*.4]})()");
    await ev("armOn('net_home')"); await mv(g[0], g[1]); await pressAt(g[0], g[1]); await sleep(60);
    const o1 = await ev(`(()=>{const had=!!ARM.drag;window.dispatchEvent(new PointerEvent('pointerup',{pointerId:99,clientX:${g[0]},clientY:${g[1]},bubbles:true}));return {had,still:!!ARM&&!!ARM.drag,n:S.pages[0].objs.length}})()`);
    await releaseAt(g[0], g[1]); await sleep(150);
    const placed = await ev("S.pages[0].objs.length>2");
    await ev("S.pages.forEach(P=>P.objs=[]);armOn('net_home')"); await mv(g[0], g[1]); await pressAt(g[0], g[1]); await sleep(60);
    const hang = await ev("(()=>{window.dispatchEvent(new Event('blur'));return ARM&&ARM.drag===null})()"); await releaseAt(g[0], g[1]);
    await ev("armOff();S.pages.forEach(P=>P.objs=[]);setSel(null)");
    ok('Vorlage: pointerup eines anderen Zeigers wird ignoriert, Fenster-blur beendet ein hängendes Ziehen', o1.had && o1.still && o1.n === 0 && placed && hang === true, { o1, placed, hang });
  }
  // a11y: old topology tiles show the armed state, live region with keyboard hint
  {
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);setTool('select');S.cat='Topologien';buildCats()");
    const a = await ev("(()=>{const b=document.querySelector('#symgrid .sym[data-s=\"t_ring\"]'),o=document.querySelector('#symgrid .sym[data-s=\"t_star\"]');const p0=b.getAttribute('aria-pressed');b.click();const h=document.querySelector('.armhint');return {p0,p1:b.getAttribute('aria-pressed'),other:o.getAttribute('aria-pressed'),role:h.getAttribute('role'),txt:/Enter/.test(h.textContent),en:(()=>{const L0=LANG;LANG='en';const t=tr('Klicken zum Platzieren, Enter: in der Mitte platzieren, Esc bricht ab');LANG=L0;return /centre/.test(t)})()}})()");
    await ev("armOff()"); const p2 = await ev("document.querySelector('#symgrid .sym[data-s=\"t_ring\"]').getAttribute('aria-pressed')");
    ok('Alte Topologie-Kachel: aria-pressed zeigt die armierte Vorlage, Hinweis (role=status) nennt Enter, de/en', a.p0 === 'false' && a.p1 === 'true' && a.other === 'false' && p2 === 'false' && a.role === 'status' && a.txt && a.en, { a, p2 });
  }
  // armed template / «include» preset do not survive a tab switch
  {
    const r = await ev("(async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([300,300]);const b=await d.save();const t0=TAB;armOn('net_home');LNPRE={label:'«include»'};const ok=await tabOpenWith(()=>tabLoad(b,'tabB.pdf'));const afterOpen=[ARM===null,LNPRE===null];armOn('net_home');LNPRE={label:'«extend»'};await tabSwitch_(t0);return JSON.stringify({ok,afterOpen,afterSwitch:[ARM===null,LNPRE===null],tabs:TABS.length})})()", 40000);
    const rj = JSON.parse(r || '{}');
    ok('Tabwechsel/neuer Tab: armierte Vorlage und «include»-Voreinstellung werden verworfen', rj.ok === true && rj.afterOpen.every(Boolean) && rj.afterSwitch.every(Boolean), rj);
    await ev("armOff();lnPreOff()");
  }
  // Templates as groups (B2): gid on all parts, click selects all, move/scale keep proportions, Alt selects one
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev("(async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);await openPdf(await d.save(),'grp.pdf');await new Promise(r=>setTimeout(r,500));tplClickOn=true;tplGroupOn=true;setTool('select');setSel(null);zoomTo(1);await new Promise(r=>setTimeout(r,300));S.pages[0].el.scrollIntoView({block:'start'});S.pages[0].objs.push({type:'rect',x:20,y:700,w:80,h:50,color:'#000000',lw:1,fill:'none'});insertOrgTemplate('net_home',{i:0,x:300,y:200,tl:false});insertOrgTemplate('net_office',{i:0,x:300,y:560,sc:.5,tl:false});setSel(null);redraw(0)})()", 20000);
    await sleep(500);
    const scr = () => ev("(()=>{S.pages[0].el.scrollIntoView({block:'start'});const r=S.pages[0].el.getBoundingClientRect();return [r.left,r.top,S.zoom]})()");
    let sc = await scr();
    const geo = () => ev("JSON.stringify(S.pages[0].objs.filter(o=>o.gid).map(o=>o.type==='sym'?[o.gid,o.x,o.y,o.w,o.h,o.fs]:[o.gid,o.x1,o.y1,o.x2,o.y2]))").then(JSON.parse);
    const first = await ev("(()=>{const o=S.pages[0].objs.find(o=>o.sym==='cloud'&&o.gid);return {gid:o.gid,c:[o.x+o.w/2,o.y+o.h/2],n:S.pages[0].objs.filter(q=>q.gid===o.gid).length}})()");
    const cloud = () => ev("(()=>{const o=S.pages[0].objs.find(o=>o.sym==='cloud'&&o.gid==="+JSON.stringify(first.gid)+");return [o.x+o.w/2,o.y+o.h/2]})()");
    const cl = (pt) => [sc[0] + pt[0] * sc[2], sc[1] + pt[1] * sc[2]];
    const gids = await ev("JSON.stringify([...new Set(S.pages[0].objs.filter(o=>o.gid).map(o=>o.gid))])").then(JSON.parse);
    const san = await ev("JSON.stringify([sanObj({type:'rect',x:0,y:0,w:5,h:5,color:'#000',gid:'a b!c_-9'}).gid,sanObj({type:'rect',x:0,y:0,w:5,h:5,color:'#000',gid:'x'.repeat(80)}).gid.length,'gid' in sanObj({type:'rect',x:0,y:0,w:5,h:5,color:'#000',gid:7}),'gid' in sanObj({type:'rect',x:0,y:0,w:5,h:5,color:'#000'})])").then(JSON.parse);
    ok('Gruppen: jede Vorlage hat eine eigene gid auf allen Teilen, sanObj bereinigt gid (Zeichen, Länge 40, Typ)', gids.length === 2 && first.n > 6 && san[0] === 'abc_-9' && san[1] === 40 && san[2] === false && san[3] === false, { gids, n: first.n, san });
    const clickAt = async (pt, mod = 0, cc = 1) => { const c = cl(pt); await mv(c[0], c[1]); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: c[0], y: c[1], button: 'left', buttons: 1, clickCount: cc, modifiers: mod }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c[0], y: c[1], button: 'left', buttons: 0, clickCount: cc, modifiers: mod }); await sleep(120); };
    await clickAt(first.c);
    const s1 = await ev("JSON.stringify([selItems().length,S.sel&&S.sel.o.type,new Set(selItems().map(o=>o.gid)).size])").then(JSON.parse);
    ok('Gruppen: Klick auf ein Teil wählt alle Teile der Vorlage (Gruppenrahmen), nicht die zweite Vorlage', s1[0] === first.n && s1[1] === 'group' && s1[2] === 1, s1);
    // drag moves all members by the same amount
    const g0 = (await geo()).filter(a => a[0] === first.gid), other0 = (await geo()).filter(a => a[0] !== first.gid), HU = await ev('H.u.length');
    { const c = cl(first.c); await mv(c[0], c[1]); await pressAt(c[0], c[1]); for (let i = 1; i <= 8; i++) await dragTo(c[0] - 6 * i, c[1] + 4 * i); await releaseAt(c[0] - 48, c[1] + 32); await sleep(150); }
    const g1 = (await geo()).filter(a => a[0] === first.gid), other1 = (await geo()).filter(a => a[0] !== first.gid);
    const dd = g1.map((a, k) => [a[1] - g0[k][1], a[2] - g0[k][2]]);
    ok('Gruppen: Ziehen verschiebt alle Teile gleich (Abstände bleiben), die andere Vorlage bleibt', dd.every(d => Math.abs(d[0] + 48 / sc[2]) < 1 && Math.abs(d[1] - 32 / sc[2]) < 1) && JSON.stringify(other0) === JSON.stringify(other1) && await ev('H.u.length') === HU + 1, { d0: dd[0], n: dd.length });
    // scale with the corner handle keeps proportions
    const gs0 = (await geo()).filter(a => a[0] === first.gid);
    const br = await ev("(()=>{const h=handles(S.sel.o).find(h=>h.k==='br');return [h.x,h.y]})()");
    { const c = cl(br); await mv(c[0], c[1]); await pressAt(c[0], c[1]); for (let i = 1; i <= 8; i++) await dragTo(c[0] - 6 * i, c[1] - 3 * i); await releaseAt(c[0] - 48, c[1] - 24); await sleep(150); }
    
    const gs1 = (await geo()).filter(a => a[0] === first.gid);
    const syms = gs0.map((a, k) => [a, gs1[k]]).filter(([a]) => a.length === 6);
    const fx = syms.map(([a, b]) => b[3] / a[3]), fy = syms.map(([a, b]) => b[4] / a[4]);
    const xs = syms.map(([a, b]) => [(b[1] - syms[0][1][1]) / (a[1] - syms[0][0][1] || 1), 0]);
    ok('Gruppen: Eckgriff skaliert alle Teile gleichmäßig (Breite, Höhe, Abstände, Schrift)', fx.every(f => Math.abs(f - fx[0]) < 0.01) && fy.every(f => Math.abs(f - fx[0]) < 0.01) && fx[0] < 0.97 && syms.every(([a, b]) => Math.abs(b[5] / a[5] - fx[0]) < 0.1) && syms.slice(1).every(([a, b]) => Math.abs((b[1] - syms[0][1][1]) - fx[0] * (a[1] - syms[0][0][1])) < 0.6), { f: fx[0], fy: fy[0] });
    // Alt+click selects one part
    const second = await ev("(()=>{const o=S.pages[0].objs.find(o=>o.sym==='router'&&o.gid);return [o.x+o.w/2,o.y+o.h/2]})()");
    await clickAt(second, 1);
    const alt = await ev("JSON.stringify([selItems().length,S.sel.o.sym])").then(JSON.parse);
    ok('Gruppen: Alt+Klick wählt nur das Teil', alt[0] === 1 && alt[1] === 'router', alt);
    // double click on a member edits just that member (label editor), selection single
    await clickAt(await cloud()); // group again
    const c0 = cl(await ev("(()=>{const o=S.pages[0].objs.find(o=>o.sym==='router'&&o.gid);return [o.x+o.w/2,o.y+o.h/2]})()"));
    await mv(c0[0], c0[1]); for (const cc of [1, 2]) { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: c0[0], y: c0[1], button: 'left', buttons: 1, clickCount: cc }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c0[0], y: c0[1], button: 'left', buttons: 0, clickCount: cc }); }
    await sleep(250);
    const dbl = await ev("JSON.stringify([selItems().length,!!editorEl||!!editingObj])").then(JSON.parse);
    await ev("closeEditor()");
    ok('Gruppen: Doppelklick auf ein Teil bearbeitet nur dieses Teil', dbl[0] === 1 && dbl[1] === true, dbl);
    // copy/paste keeps the group with a new gid; Delete removes the group in one undo step
    await clickAt(await cloud());
    const cp = await ev("(()=>{const n0=S.pages[0].objs.length;copySel();pasteClip();const added=S.pages[0].objs.slice(n0),ids=new Set(added.map(o=>o.gid));return JSON.stringify([added.length,ids.size,ids.has(undefined),[...ids][0]!==undefined&&!S.pages[0].objs.slice(0,n0).some(o=>o.gid===[...ids][0]),selItems().length===added.length])})()").then(JSON.parse);
    ok('Gruppen: Kopieren und Einfügen behält die Gruppe mit neuer gid', cp[0] > 6 && cp[1] === 1 && !cp[2] && cp[3] && cp[4], cp);
    const del = await ev("(()=>{const n=S.pages[0].objs.length,h=H.u.length,k=selItems().length;delSel();const a=S.pages[0].objs.length;undo();return JSON.stringify([n-a===k,H.u.length===h,S.pages[0].objs.length===n])})()").then(JSON.parse);
    ok('Gruppen: Entf löscht die ganze Gruppe, Rückgängig = 1 Schritt', del.every(Boolean), del);
    // save and reopen keeps the groups
    const rt = await ev("(async()=>{const before=JSON.stringify(S.pages[0].objs.map(o=>o.gid||null));const b=await buildOutput();await openPdf(b,'grp2.pdf');await new Promise(r=>setTimeout(r,800));return JSON.stringify([before===JSON.stringify(S.pages[0].objs.map(o=>o.gid||null)),new Set(S.pages[0].objs.filter(o=>o.gid).map(o=>o.gid)).size])})()", 30000).then(JSON.parse);
    ok('Gruppen: Speichern und Wiederöffnen behält die gid-Gruppen', rt[0] === true && rt[1] === 3, rt);
    // old behaviour: objects without gid select alone; setting off selects single members
    await ev('zoomTo(1)'); await sleep(500); sc = await scr();
    await clickAt([20, 725]);
    const old1 = await ev("JSON.stringify([selItems().length,S.sel&&S.sel.o.type])").then(JSON.parse);
    await ev("tplGroupOn=false;setSel(null)");
    const f2 = await ev("(()=>{const o=S.pages[0].objs.find(o=>o.sym==='cloud'&&o.gid);return [o.x+o.w/2,o.y+o.h/2]})()");
    await clickAt(f2);
    const off = await ev("selItems().length");
    await ev("tplGroupOn=true;setSel(null)");
    ok('Gruppen: Objekte ohne gid und Einstellung aus wählen wie früher einzeln', old1[0] === 1 && old1[1] === 'rect' && off === 1, { old1, off });
    // click on empty page clears the group selection
    await clickAt(f2);
    await clickAt([560, 100]);
    ok('Gruppen: Klick auf leere Fläche hebt die Auswahl auf', await ev("!S.sel") === true);
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);redrawAll()");
  }
  // C1: category 'Speicher & Backup' (13 symbols), drawn, placed by click and by drag, docking, de/en, old categories intact
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev("(async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);await openPdf(await d.save(),'st.pdf');await new Promise(r=>setTimeout(r,500));setTool('select');S.pages.forEach(P=>P.objs=[]);setSel(null);zoomTo(1);await new Promise(r=>setTimeout(r,300));S.pages[0].el.scrollIntoView({block:'start'});return 1})()");
    await sleep(500);
    const ids = await ev("JSON.stringify(Object.values(SYM).filter(s=>s.cat==='Speicher & Backup').map(s=>s.id))").then(JSON.parse);
    const cats = await ev("JSON.stringify(CATS)").then(JSON.parse);
    ok('Speicher & Backup: Gruppe mit 13 Symbolen, alte Gruppen unverändert vorhanden', ids.length === 13 && cats.includes('Speicher & Backup') && ['Formen', 'Netzwerk', 'Topologien', 'IT-Sicherheit', 'Markierung'].every(c => cats.includes(c)) && ids.every(i => /^st_/.test(i)), { ids, cats });
    const px = await ev("JSON.stringify(Object.values(SYM).filter(s=>s.cat==='Speicher & Backup').map(s=>{const cv=document.createElement('canvas');cv.width=220;cv.height=180;const c=cv.getContext('2d');c.strokeStyle=c.fillStyle='#000';c.lineWidth=1.2;s.draw(c,{type:'sym',sym:s.id,color:'#000',lw:1.2,fill:'white',fs:11,label:s.label},20,20,s.w,s.h);const d=c.getImageData(0,0,220,180).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n}))").then(JSON.parse);
    ok('Speicher & Backup: jedes Symbol zeichnet Pixel', px.length === 13 && px.every(n => n > 300), px);
    const tile = id => ev(`(()=>{S.cat='Speicher & Backup';buildCats();const b=document.querySelector('#symgrid .sym[data-s="${id}"]');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    const pg = (u, v) => ev(`(()=>{S.pages[0].el.scrollIntoView({block:'start'});const r=S.pages[0].el.getBoundingClientRect();return [r.left+${u}*S.zoom,r.top+${v}*S.zoom]})()`);
    // by click (tile, then click on the page)
    let t = await tile('st_raid5'); await mv(t[0], t[1]); await pressAt(t[0], t[1]); await releaseAt(t[0], t[1]); await sleep(150);
    let g = await pg(150, 150); await mv(g[0], g[1]); await pressAt(g[0], g[1]); await releaseAt(g[0], g[1]); await sleep(200);
    const c1 = await ev("(()=>{const o=S.pages[0].objs.filter(o=>o.sym==='st_raid5');return JSON.stringify([o.length,o[0]&&Math.abs(o[0].x+o[0].w/2-150)<6,o[0]&&o[0].w===SYM.st_raid5.w,o[0]&&o[0].label])})()").then(JSON.parse);
    ok('Speicher & Backup: Platzieren per Klick (zentriert, Standardgröße, Beschriftung)', c1[0] === 1 && c1[1] === true && c1[2] === true && c1[3] === 'RAID 5', c1);
    // by drag
    t = await tile('st_cloud'); await mv(t[0], t[1]); await pressAt(t[0], t[1]); await releaseAt(t[0], t[1]); await sleep(150);
    const a = await pg(300, 100), b = await pg(420, 160); await mv(a[0], a[1]); await pressAt(a[0], a[1]); await dragTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); await dragTo(b[0], b[1]); await releaseAt(b[0], b[1]); await sleep(200);
    const d1 = await ev("(()=>{const o=S.pages[0].objs.find(o=>o.sym==='st_cloud');return JSON.stringify(o?[o.w,o.h]:null)})()").then(JSON.parse);
    ok('Speicher & Backup: Platzieren per Ziehen bestimmt die Größe', d1 && Math.abs(d1[0] - 120) < 6 && Math.abs(d1[1] - 60) < 6, d1);
    // docking: anchors exist and a docked line follows a moved symbol
    const dk = await ev(`(()=>{const P=S.pages[0],out={};for(const id of ${JSON.stringify(ids)}){const s=SYM[id],o={type:'sym',sym:id,x:50,y:50,w:s.w,h:s.h,label:s.label};const ids2=dockIds(o),pts=ids2.map(t=>orgAnchor(o,t));out[id]=ids2.length>=4&&pts.every(p=>isFinite(p[0])&&isFinite(p[1]))}
      const A={type:'sym',sym:'st_nas',oid:'a1',x:50,y:300,w:50,h:42,label:'NAS',color:'#000',lw:1.2,fill:'white',fs:11},B={type:'sym',sym:'st_repl',oid:'b1',x:300,y:300,w:104,h:44,label:'Replikation',color:'#000',lw:1.2,fill:'white',fs:11};
      const before=orgAnchor(A,'r2')[0];A.x+=40;return JSON.stringify({all:Object.values(out).every(Boolean),moved:orgAnchor(A,'r2')[0]-before,rect:anchorRect(A)})})()`).then(JSON.parse);
    ok('Speicher & Backup: Andockpunkte für alle Symbole vorhanden und folgen dem Symbol', dk.all === true && Math.abs(dk.moved - 40) < 0.01 && dk.rect === true, dk);
    const en = await ev("(()=>{setLang('en');const r=[tr('Speicher & Backup'),tr('Bandlaufwerk'),tr('Replikation'),tr('Backup-Server'),SYM.st_tape.label,SYM.st_repl.label,1];setLang('de');return JSON.stringify([r,SYM.st_tape.label])})()").then(JSON.parse);
    ok('Speicher & Backup: englische Namen und Beschriftungen', en[0][0] === 'Storage & backup' && en[0][1] === 'Tape drive' && en[0][4] === 'Tape drive' && en[0][5] === 'Replication' && en[0][3] === 'Backup server' && en[1] === 'Bandlaufwerk', en);
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);setTool('select');redrawAll()");
  }
  // B9: character autocorrect (rules, undo by Backspace/Ctrl+Z, switch, not in code blocks), special character picker, quick bar id, PDF text layer
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev("(async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);await openPdf(await d.save(),'ac.pdf');await new Promise(r=>setTimeout(r,500));setTool('select');S.pages.forEach(P=>P.objs=[]);setSel(null);S.autoChar=true;zoomTo(1);await new Promise(r=>setTimeout(r,300));S.pages[0].el.scrollIntoView({block:'start'});return 1})()");
    await sleep(400);
    await ev("(()=>{const o={type:'text',x:72,y:200,text:'',fs:16,color:'#1b1f24',orient:'h',lw:0};S.pages[0].objs.push(o);redraw(0);openTextEditor(0,o,false);return 1})()");
    await sleep(300);
    await ev("window.acKey=(k,o={})=>ED.eng.sink.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...o}));window.acType=s=>{for(const ch of s)acKey(ch)};window.acSet=()=>{const st=ED.eng.st;st.v='';st.c=st.a=0};window.acV=()=>ED.eng.st.v");
    const cases = [['->', '→'], ['<- ', '← '], ['<->', '↔'], ['=>', '⇒'], ['1 -- 2', '1 – 2'], ['1...', '1…'], ['(c)', '©'], ['(R)', '®'], ['(tm)', '™'], ['+-5', '±5'], ['!=', '≠']];
    const got = [];
    for (const [i, o] of cases) { await ev(`acSet();acType(${JSON.stringify(i)})`); got.push(await ev('acV()')); }
    ok('Autokorrektur: alle Regeln lösen beim letzten Zeichen aus', JSON.stringify(got) === JSON.stringify(cases.map(c => c[1])), got);
    await ev("acSet();acType('1-b 3 - 4 2*3')");
    ok('Autokorrektur: einzelner Bindestrich und normaler Text bleiben unverändert', await ev('acV()') === '1-b 3 - 4 2*3');
    await ev("acSet();acType('->');acKey('Backspace')");
    const bs = await ev('acV()');
    await ev("acSet();acType('...');acKey('z',{ctrlKey:true})");
    const uz = await ev('acV()');
    await ev("acSet();acType('->');acKey('Backspace');acType('x');acKey('Backspace')");
    const bs2 = await ev('acV()');
    await ev("acSet();acType('->x');acKey('Backspace');acKey('Backspace')");
    const bs3 = await ev('acV()');
    ok('Autokorrektur: Rückschritt oder Strg+Z direkt danach bringt die getippten Zeichen zurück', bs === '->' && uz === '...' && bs2 === '->' && bs3 === '', { bs, uz, bs2, bs3 });
    await ev("S.autoChar=false;acSet();acType('-> => (c)')");
    const off = await ev('acV()'); await ev('S.autoChar=true');
    ok('Autokorrektur: ausgeschaltet bleibt der Text wie getippt', off === '-> => (c)', off);
    // switch in settings and default
    const sw = await ev("JSON.stringify([!!document.getElementById('dAutoChar'),document.querySelector('#dAutoChar button[data-v=on]').getAttribute('aria-pressed'),/->/.test(document.querySelector('#dAutoChar').parentNode.textContent)])").then(JSON.parse);
    ok('Autokorrektur: Schalter in den Einstellungen, standardmäßig an, Regeln in der Beschreibung', sw[0] && sw[1] === 'true' && sw[2], sw);
    // picker: quick bar button, keyboard, insert
    await ev("acSet();acType('A')");
    const pk = await ev("(async()=>{const b=ED.eng.sink.closest('.tbx').querySelector('[data-a=chars]');b.click();await new Promise(r=>setTimeout(r,200));const P=document.querySelector('.charPop');const n=P&&P.querySelectorAll('.cp-b').length;const al=P&&[...P.querySelectorAll('.cp-b')].every(x=>x.getAttribute('aria-label'));const lbl=P&&P.getAttribute('aria-label');"
      + "const first=P.querySelector('.cp-b');first.focus();first.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));const moved=document.activeElement!==first;const cur=document.activeElement;cur.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));const down=document.activeElement!==cur;"
      + "const ch=document.activeElement.textContent;document.activeElement.click();await new Promise(r=>setTimeout(r,300));return JSON.stringify({n,al,lbl,moved,down,ch,v:acV(),closed:P.hidden||P.classList.contains('closing'),ed:!!editorEl})})()").then(JSON.parse);
    ok('Sonderzeichen-Auswahl: Schnellleiste öffnet, Pfeiltasten wandern, Klick/Enter fügt ein, Beschriftungen vorhanden', pk.n >= 50 && pk.al && pk.moved && pk.down && pk.ch && pk.v === 'A' + pk.ch && pk.closed && pk.ed, pk);
    await ev("acKey('K',{ctrlKey:true,shiftKey:true})"); await sleep(250);
    const sc = await ev("(()=>{const P=document.querySelector('.charPop');return JSON.stringify([!P.hidden,document.activeElement.classList.contains('cp-b')])})()").then(JSON.parse);
    await key('Escape', 'Escape', 27); await sleep(300);
    const sc2 = await ev("JSON.stringify([!!editorEl,document.querySelector('.charPop').hidden||document.querySelector('.charPop').classList.contains('closing')])").then(JSON.parse);
    ok('Sonderzeichen-Auswahl: Strg+Umschalt+K öffnet mit Fokus im Raster, Esc schließt nur die Auswahl', sc[0] && sc[1] && sc2[0] && sc2[1], { sc, sc2 });
    // quick bar: new id in the default order, old saved design (without 'chars') gets it after the background button; hide/order via the existing customisation
    const qb = await ev("JSON.stringify([QB_IDS.includes('chars'),DDEF.qbarOrder.join()===QB_IDS.join(),qbSan({qbarOrder:['font','size','bold','it','ul','lists','indent','col','bg','del'],qbarHide:['indent']}),qbSan({qbarOrder:['del','font'],qbarHide:[]}).qbarOrder,QB_NAME.chars,!!QB_ICON.chars,!!QB_HTML.chars])").then(JSON.parse);
    ok('Schnellleiste: Sonderzeichen-Knopf in Standardfolge, alte Designs bekommen ihn nach dem Hintergrund-Knopf, Name und Symbol vorhanden', qb[0] && qb[1] && qb[2].qbarOrder.join() === 'font,size,bold,it,ul,lists,indent,col,bg,chars,del' && qb[2].qbarHide.join() === 'indent' && qb[3].includes('chars') && qb[4] && qb[5] && qb[6], qb);
    // saved PDF carries the characters in the invisible text layer
    await ev("closeEditor();acSet()");
    const tl = await ev("(async()=>{const o=S.pages[0].objs.find(o=>o.type==='text');o.text='Pfad A → B – fertig … ©';redraw(0);const out=await buildOutput();const d=await pdfOpen(out.slice());const t=await (await d.getPage(1)).getTextContent();return t.items.map(x=>x.str).join('|')})()", 60000);
    ok('Gespeichertes PDF enthält → – … © in der Textebene', /→/.test(String(tl)) && /–/.test(String(tl)) && /…/.test(String(tl)) && /©/.test(String(tl)), String(tl).slice(-80));
    // code block dialog and notes
    await ev("S.pages.forEach(P=>P.objs=[]);cdOpen(null)"); await sleep(400);
    await ev("document.getElementById('cdText').focus()");
    for (const ch of '->(c)') await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
    ok('Autokorrektur: im Codeblock-Dialog wird nichts ersetzt', await ev("document.getElementById('cdText').value") === '->(c)', await ev("document.getElementById('cdText').value"));
    await ev("document.getElementById('cdDlg').hidden=true");
    const nt = await ev("(()=>{notesOpen(true);const t=document.getElementById('ntText');t.value='';t.scrollIntoView();t.focus();return document.activeElement===t})()");
    if (nt) {
      await sleep(300);
      for (const ch of '1 -> 2') await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
      const n1 = await ev("document.getElementById('ntText').value");
      ok('Autokorrektur: Notizen ersetzen -> beim Tippen', n1 === '1 → 2', n1);
    } else ok('Autokorrektur: Notizenfeld nicht fokussierbar (Prüfung übersprungen)', true);
    await ev("document.getElementById('ntText').value='';notesOpen(false);S.pages.forEach(P=>P.objs=[]);setSel(null);redrawAll()");
  }
  // B8: bold/italic/underline/background for the selection only (o.sty runs), mixed state, rendering, wrapping, round trip, undo, sanitiser
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev("(async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);await openPdf(await d.save(),'sty.pdf');await new Promise(r=>setTimeout(r,500));setTool('select');S.pages.forEach(P=>P.objs=[]);setSel(null);S.autoChar=true;zoomTo(1);await new Promise(r=>setTimeout(r,300));S.pages[0].el.scrollIntoView({block:'start'});return 1})()");
    await sleep(400);
    await ev("(()=>{const o={type:'text',x:72,y:200,text:'Hello bold world',fs:16,color:'#1b1f24',orient:'h',lw:0};S.pages[0].objs.push(o);redraw(0);openTextEditor(0,o,false);window.stO=o;window.stK=(k,m={})=>ED.eng.sink.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...m}));window.stP=k=>document.querySelector('.tbx [data-a='+k+']').getAttribute('aria-pressed');return 1})()");
    await sleep(300);
    const J = e => ev(`JSON.stringify(${e})`).then(JSON.parse);
    await ev("ED.eng.select(6,10);stK('b',{ctrlKey:true})");
    const s1 = await J("[stO.sty,!!stO.bold,stP('bold')]");
    ok('Teilformat: Strg+B formatiert nur die Auswahl (Bereich in sty, Feld bleibt unfett), Knopf zeigt gedrückt', JSON.stringify(s1[0]) === '[{"a":6,"b":10,"bold":true}]' && s1[1] === false && s1[2] === 'true', s1);
    await ev("ED.eng.select(3,10)");
    const s2 = await J("[stP('bold'),document.querySelector('#tfmt [data-k=bold]').getAttribute('aria-pressed')]");
    ok("Teilformat: gemischte Auswahl zeigt aria-pressed='mixed' (Leiste und Seitenleiste)", s2[0] === 'mixed' && s2[1] === 'mixed', s2);
    await ev("stK('b',{ctrlKey:true})");
    const s3 = await J("[stO.sty,stP('bold')]");
    ok('Teilformat: gemischt wird zuerst ganz fett, nochmal schaltet aus (kein sty übrig)', JSON.stringify(s3[0]) === '[{"a":3,"b":10,"bold":true}]' && s3[1] === 'true', s3);
    await ev("stK('b',{ctrlKey:true})");
    ok('Teilformat: aus, wenn alles schon fett ist', await J("[stO.sty===undefined,stP('bold')]").then(a => a[0] === true && a[1] === 'false'));
    await ev("ED.eng.select(0,5);stK('i',{ctrlKey:true});ED.eng.select(11,16);stK('u',{ctrlKey:true});ED.set({hbg:'#ffd60a'})");
    const s4 = await J("stO.sty");
    ok('Teilformat: Kursiv, Unterstrichen, Hintergrund je Bereich', JSON.stringify(s4) === '[{"a":0,"b":5,"italic":true},{"a":11,"b":16,"underline":true,"hbg":"#ffd60a"}]', s4);
    // ohne Auswahl wirkt der Knopf auf das ganze Feld wie früher
    await ev("ED.eng.select(2,2);document.querySelector('.tbx [data-a=bold]').click()");
    const s5 = await J("[!!stO.bold,stO.sty.length]");
    ok('Teilformat: ohne Auswahl gilt der Knopf für das ganze Feld (wie früher)', s5[0] === true && s5[1] >= 1, s5);
    await ev("document.querySelector('.tbx [data-a=bold]').click()");
    // Tippen an der Bereichsgrenze erbt das Format davor
    await ev("stO.sty=[{a:6,b:10,bold:true}];ED.eng.select(6,10);ED.eng.select(10,10);stK('X')");
    const s6 = await J("[stO.text,stO.sty]");
    ok('Teilformat: Tippen am Ende eines Bereichs erbt das Format, Rest verschiebt sich', s6[0] === 'Hello boldXworld'.slice(0, 10) + 'X' + ' world' && JSON.stringify(s6[1]) === '[{"a":6,"b":11,"bold":true}]', s6);
    // Breite und Umbruch
    const w = await J("(()=>{const o={...stO,text:'Hello bold world',sty:undefined,bold:false};const pl=textBox(o).w;const bo=textBox({...o,sty:[{a:0,b:16,bold:true}]}).w;const part=textBox({...o,sty:[{a:6,b:10,bold:true}]}).w;"
      + "const wrapP=textBox({...o,wrapW:Math.ceil(pl)+1}),wrapB=textBox({...o,sty:[{a:0,b:16,bold:true}],wrapW:Math.ceil(pl)+1});const lh=[wrapP.lines.length,wrapB.lines.length,wrapB.lines.join(' ')===o.text,new Set([wrapB.lh,wrapP.lh]).size];return [pl,bo,part,...lh]})()");
    ok('Teilformat: fetter Bereich ist breiter, Umbruch misst je Bereich, Zeilenhöhe bleibt gleich', w[1] > w[0] + 3 && w[2] > w[0] && w[2] < w[1] && w[3] === 1 && w[4] >= 2 && w[5] === true && w[6] === 1, w);
    const px = await J("(()=>{const ink=o=>{const cv=document.createElement('canvas');cv.width=400;cv.height=60;const c=cv.getContext('2d');drawText(c,{...o,x:10,y:10});const d=c.getImageData(0,0,400,60).data;let n=0,mx=0;for(let y=0;y<60;y++)for(let x=0;x<400;x++)if(d[(y*400+x)*4+3]>40){n++;if(x>mx)mx=x}return[n,mx]};const o={type:'text',x:0,y:0,text:'Hello bold world',fs:16,color:'#000000',orient:'h',lw:0};return[ink(o),ink({...o,sty:[{a:6,b:10,bold:true}]}),ink({...o,sty:[{a:6,b:10,bold:true,underline:true,hbg:'#ffd60a'}]})]})()");
    ok('Teilformat: Zeichnen: fetter Bereich bringt mehr Pixel und ragt weiter, Unterstreichung/Hintergrund zeichnen', px[1][0] > px[0][0] && px[1][1] > px[0][1] && px[2][0] > px[1][0], px);
    // Rundreise: Speichern, Öffnen, Textebene vollständig
    const rt = await ev("(async()=>{stO.sty=[{a:0,b:5,italic:true},{a:6,b:10,bold:true,hbg:'#ffd60a'}];stO.text=ED.eng.st.v='Hello bold world';closeEditor();const out=await buildOutput();const d=await pdfOpen(out.slice());const t=(await (await d.getPage(1)).getTextContent()).items.map(x=>x.str).join('').replace(/\\s+/g,'');await openPdf(out,'sty2.pdf');await new Promise(r=>setTimeout(r,800));const o=S.pages[0].objs.find(o=>o.type==='text');return JSON.stringify([t.includes('Helloboldworld')||t,o&&o.sty])})()", 60000).then(JSON.parse);
    ok('Teilformat: Speichern und Wiederöffnen behält die Bereiche, Textebene im PDF vollständig', rt[0] === true && JSON.stringify(rt[1]) === '[{"a":0,"b":5,"italic":true},{"a":6,"b":10,"bold":true,"hbg":"#ffd60a"}]', rt);
    // Rückgängig: ein Schritt für die Formatierung beim Bearbeiten
    const un = await J("(()=>{const o=S.pages[0].objs.find(o=>o.type==='text');const n=H.u.length;openTextEditor(0,o,false);ED.eng.select(12,16);ED.eng.sink.dispatchEvent(new KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true,cancelable:true}));closeEditor();const added=H.u.length-n;const sty=JSON.stringify(o.sty);undo();return [added,sty.includes('12'),JSON.stringify(S.pages[0].objs.find(o=>o.type==='text').sty).includes('12')]})()");
    ok('Teilformat: Formatieren und Schließen ist ein Rückgängig-Schritt', un[0] === 1 && un[1] === true && un[2] === false, un);
    // Altdokumente und Bereinigung
    const sn = await J("(()=>{const b={type:'text',x:1,y:1,text:'abcdef',fs:14,color:'#000000',orient:'h'};const t=s=>sanObj({...b,sty:s});return [t('x').sty,t([{a:0,b:3,bold:'yes'}]).sty,t([{a:2,b:9,bold:true},{a:0,b:4,italic:true}]).sty,t(Array.from({length:3000},(_,i)=>({a:0,b:1,bold:true}))).sty.length<=1,t([{a:0,b:3,bold:true,hbg:'javascript:x'}]).sty,sanObj({...b,orient:'stack',sty:[{a:0,b:2,bold:true}]}).sty,sanObj(b).sty,sanObj({...b,sty:[{a:0,b:2,hbg:'#ff0000'}]}).sty]})()");
    ok('Teilformat: sanObj prüft Bereiche (Typen, Überlappung, Zahl, stack), Altdokumente ohne sty bleiben gleich', sn[0] == null && sn[1] == null && JSON.stringify(sn[2]) === '[{"a":0,"b":4,"italic":true},{"a":4,"b":6,"bold":true}]' && sn[3] === true && JSON.stringify(sn[4]) === '[{"a":0,"b":3,"bold":true}]' && sn[5] == null && sn[6] == null && JSON.stringify(sn[7]) === '[{"a":0,"b":2,"hbg":"#ff0000"}]', sn);
    await ev("S.pages.forEach(P=>P.objs=[]);setSel(null);redrawAll()");
  }
  // B6: page sidebar (add page, drag reorder, arrows setting), page selector (pager) with its placements and shortcut, big documents
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const J = e => ev(`JSON.stringify(${e})`).then(JSON.parse);
    await ev("(async()=>{design.motion='off';design.pager=DDEF.pager;applyDesign(true);const d=await PDFLib.PDFDocument.create();for(let i=0;i<5;i++)d.addPage([595,842]);await openPdf(await d.save(),'pg5.pdf');await new Promise(r=>setTimeout(r,600));S.pages.forEach((P,i)=>P.objs.push({type:'text',x:60,y:80,text:'P'+(i+1),fs:20,color:'#000000',orient:'h',lw:0}));setSel(null);redrawAll();zoomTo(.5);if(!thumbsOn)toggleThumbs(true);await new Promise(r=>setTimeout(r,900));return 1})()", 60000);
    const order = () => J("S.pages.map(P=>(P.objs.find(o=>o.type==='text')||{}).text||'-').join()");
    const wait = async (c, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(c) === true) return true; await sleep(150); } return false; };
    // arrows: off by default, on with the setting
    const a0 = await ev("!document.querySelector('#thumbs .th-bar')&&thArrows===false");
    await ev("document.querySelector('#dThArrows button[data-v=on]').click()"); await sleep(300);
    const a1 = await J("[!!document.querySelector('#thumbs .th-bar'),document.querySelector('#thumbs .th-bar button').title,localStorage.getItem('pdfwerkbank:tharrows')]");
    await ev("document.querySelector('#dThArrows button[data-v=off]').click()"); await sleep(300);
    const a2 = await ev("!document.querySelector('#thumbs .th-bar')");
    ok('Seitenvorschau: Verschiebe-Pfeile standardmäßig aus, mit Einstellung an (Tooltip „Seite nach oben verschieben“), wieder aus', a0 === true && a1[0] === true && /^Seite nach oben verschieben/.test(a1[1]) && a1[2] === '1' && a2 === true, { a0, a1, a2 });
    // add page with the + button at the end (menu)
    const ctr = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
    let p = await ctr('#thAdd'); await mv(p[0], p[1]); await pressAt(p[0], p[1]); await releaseAt(p[0], p[1]); await sleep(300);
    const item = await ev("(()=>{const b=[...document.querySelectorAll('#ctx button')].find(b=>/Größe der letzten/.test(b.textContent));if(!b)return null;const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()");
    if (item) { await mv(item[0], item[1]); await pressAt(item[0], item[1]); await releaseAt(item[0], item[1]); }
    const added = await wait("S.pages.length===6&&!rbBusy");
    const o1 = await order();
    ok('Seitenvorschau: „+“ am Ende fügt eine leere Seite hinzu, Beschriftungen bleiben bei ihren Seiten', added && o1 === 'P1,P2,P3,P4,P5,-', o1);
    const hu = await ev("H.u.length"); await ev("undo()"); const un1 = await wait("S.pages.length===5"); const o2 = await order();
    ok('Seitenvorschau: Seite hinzufügen ist ein Rückgängig-Schritt', un1 && o2 === 'P1,P2,P3,P4,P5', o2);
    await ev("if(thumbsOn)buildThumbs()"); await sleep(600);
    // insertion line between two thumbnails
    const gap = await ev("(()=>{const t=[...document.querySelectorAll('#thumbs .th')],a=t[1].getBoundingClientRect(),b=t[2].getBoundingClientRect();return [(a.left+a.right)/2,(a.bottom+b.top)/2]})()");
    await mv(gap[0] - 30, gap[1] - 20); await mv(gap[0] - 30, gap[1]); await sleep(150);
    const insv = await J("(()=>{const i=document.querySelector('#thumbs .th-ins');if(!i||i.hidden)return null;const b=i.querySelector('button').getBoundingClientRect();return [+i.dataset.at,b.left+b.width/2,b.top+b.height/2]})()");
    if (insv) { await mv(insv[1], insv[2]); await pressAt(insv[1], insv[2]); await releaseAt(insv[1], insv[2]); }
    const ins = await wait("S.pages.length===6&&!rbBusy"); const o3 = await order();
    ok('Seitenvorschau: Einfügestreifen zwischen zwei Seiten fügt dort eine leere Seite ein', !!insv && insv[0] === 2 && ins && o3 === 'P1,P2,-,P3,P4,P5', { insv, o3 });
    await ev("undo()"); await wait("S.pages.length===5"); await ev("buildThumbs()"); await sleep(600);
    // drag reorder with the mouse: page 1 to between 3 and 4
    const dragTh = async (k, toY, steps = 8) => { const t = await ev(`(()=>{const e=document.querySelectorAll('#thumbs .th')[${k}];e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
      await mv(t[0], t[1]); await pressAt(t[0], t[1]); for (let s = 1; s <= steps; s++) await dragTo(t[0], t[1] + (toY(t) - t[1]) * s / steps); return t };
    const nFirst = await ev("H.u.length");
    let t0 = await dragTh(0, t => t[1]); // placeholder to measure geometry
    await releaseAt(t0[0], t0[1]); await sleep(200);
    const tgt = await ev("(()=>{const t=document.querySelectorAll('#thumbs .th'),a=t[2].getBoundingClientRect(),b=t[3].getBoundingClientRect();return (a.bottom+b.top)/2})()");
    t0 = await dragTh(0, () => tgt);
    const line = await ev("!!document.querySelector('#thumbs .th-drop')&&document.querySelector('#thumbs').classList.contains('th-drag-on')");
    await releaseAt(t0[0], tgt);
    const dr = await wait("!rbBusy&&S.pages.length===5&&(S.pages[0].objs.find(o=>o.type==='text')||{}).text==='P2'"); const o4 = await order();
    const cp = await ev("curPage()===2||TM.sel===2");
    ok('Seitenvorschau: Ziehen verschiebt die Seite (Linie sichtbar, Beschriftung folgt), die Seite bleibt gewählt', line && dr && o4 === 'P2,P3,P1,P4,P5' && cp, { line, o4, cp });
    const h2 = await ev("H.u.length"); await ev("undo()"); await wait("(S.pages[0].objs.find(o=>o.type==='text')||{}).text==='P1'"); const o5 = await order();
    ok('Seitenvorschau: Ziehen ist ein Rückgängig-Schritt', o5 === 'P1,P2,P3,P4,P5' && h2 - nFirst === 1, { o5, d: h2 - nFirst });
    await ev("buildThumbs()"); await sleep(600);
    t0 = await dragTh(1, () => tgt + 10);
    const ln2 = await ev("!!document.querySelector('#thumbs .th-drop')");
    await key('Escape', 'Escape', 27); await releaseAt(t0[0], tgt); await sleep(500);
    const o6 = await order(); const st = await ev("[!!document.querySelector('#thumbs .th-drop'),document.querySelector('#thumbs').classList.contains('th-drag-on'),rbBusy]");
    ok('Seitenvorschau: Esc bricht das Ziehen ab (Reihenfolge unverändert, Linie weg)', ln2 && o6 === 'P1,P2,P3,P4,P5' && st[0] === false && st[1] === false, { o6, st });
    // page selector: default floating, jump, clamp, Esc, arrows, shortcut
    const pg0 = await J("[design.pager,document.getElementById('pager').parentNode.tagName,getComputedStyle(document.getElementById('pgInfo')).display,document.getElementById('pgNum').value,document.getElementById('pgTot').textContent,getComputedStyle(document.getElementById('pgNum')).fontVariantNumeric]");
    ok('Seitenwahl: standardmäßig unten schwebend, ersetzt die Anzeige „Seite x / y“ (kein Doppel), Zahlen tabellarisch', pg0[0] === 'float' && pg0[1] === 'MAIN' && pg0[2] === 'none' && +pg0[3] >= 1 && /5/.test(pg0[4]) && /tabular/.test(pg0[5]), pg0);
    const typeNum = async s => { await ev("(()=>{const i=document.getElementById('pgNum');i.focus();i.select()})()"); for (const ch of s) await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code: 'Digit' + ch, windowsVirtualKeyCode: 48 + +ch, text: ch }); };
    await typeNum('4'); await key('Enter', 'Enter', 13);
    const j4 = await wait("curPage()===3");
    await typeNum('99'); await key('Enter', 'Enter', 13); const j5 = await wait("curPage()===4");
    const v5 = await ev("document.getElementById('pgNum').value");
    await typeNum('2'); const mid = await ev("document.getElementById('pgNum').value"); await key('Escape', 'Escape', 27); await sleep(200);
    const rev = await J("[document.getElementById('pgNum').value,document.activeElement===document.getElementById('pgNum'),curPage()]");
    await ev("document.getElementById('pgNum').focus()"); await key('ArrowUp', 'ArrowUp', 38); const up = await wait("curPage()===3");
    ok('Seitenwahl: Zahl + Enter springt (4), zu große Zahl wird begrenzt (5), Esc stellt zurück, Pfeil hoch blättert zurück', j4 && j5 && v5 === '5' && mid === '2' && rev[0] === '5' && rev[1] === false && rev[2] === 4 && up, { j4, j5, v5, mid, rev, up });
    await ev("document.getElementById('pgNum').blur();document.body.focus()");
    await ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'g',code:'KeyG',ctrlKey:true,altKey:true,bubbles:true,cancelable:true}))"); await sleep(200);
    const sc = await J("[document.activeElement===document.getElementById('pgNum'),!!KB_DEF.find(a=>a.id==='gotoPage'&&a.def==='Ctrl+Alt+G')]").catch(() => null);
    ok('Seitenwahl: Strg+Alt+G fokussiert das Seitenfeld, Eintrag in der Tastenkürzel-Tabelle', sc && sc[0] === true && sc[1] === true, sc);
    await ev("document.getElementById('pgNum').blur()");
    // placements
    const pl = {};
    for (const v of ['side', 'off', 'float']) { await ev(`design.pager='${v}';applyDesign(true)`); await sleep(250);
      pl[v] = await J("[document.getElementById('pager').parentNode.id,getComputedStyle(document.getElementById('pager')).display,getComputedStyle(document.getElementById('pgInfo')).display,document.getElementById('pager').classList.contains('in-thumbs')]"); }
    await ev("toggleThumbs(false)"); await ev("design.pager='side';applyDesign(true)"); await sleep(300);
    const sc2 = await J("[document.getElementById('pager').parentNode.tagName,getComputedStyle(document.getElementById('pager')).display]"); await ev("design.pager='float';applyDesign(true);toggleThumbs(true)");
    const san = await J("[dSan({...design,pager:'x'}).pager,dSan({...design,pager:'side'}).pager,document.querySelectorAll('#dPager button').length]");
    ok('Seitenwahl: Platzierung unten / in der Vorschau / aus (dann nur die Anzeige), bei geschlossener Vorschau schwebend, ungültiger Wert wird bereinigt',
      pl.side[0] === 'thumbs' && pl.side[1] !== 'none' && pl.side[2] === 'none' && pl.side[3] && pl.off[1] === 'none' && pl.off[2] !== 'none' && pl.float[0] === 'wrap' && pl.float[1] !== 'none' && pl.float[2] === 'none'
      && sc2[0] === 'MAIN' && sc2[1] !== 'none' && san[0] === 'float' && san[1] === 'side' && san[2] === 3, { pl, sc2, san });
    // big document: thumbnails are drawn lazily
    const big = await ev("(async()=>{const d=await PDFLib.PDFDocument.create();for(let i=0;i<220;i++)d.addPage([595,842]);const b=await d.save();const t0=performance.now();await openPdf(b,'big.pdf');await new Promise(r=>setTimeout(r,1500));const n=document.querySelectorAll('#thumbs .th').length,done=S.pages.filter(P=>P.thumbBase).length;return JSON.stringify({n,done,ms:Math.round(performance.now()-t0),val:document.getElementById('pgTot').textContent})})()", 90000).then(JSON.parse);
    ok('Seitenvorschau: 220 Seiten, Vorschaubilder werden nur für den sichtbaren Bereich gezeichnet', big.n === 220 && big.done > 0 && big.done < 120 && /220/.test(big.val), big);
    const en = await J("(()=>{setLang('en');const r=[tr('Seitenwahl'),tr('Seite hinzufügen'),tr('Leere A4-Seite'),tr('Seite nach oben verschieben'),document.querySelector('#thAdd')&&document.querySelector('#thAdd').title];setLang('de');return r})()");
    ok('Seitenwahl und Seitenvorschau: englische Texte', en[0] === 'Page selector' && en[1] === 'Add page' && en[2] === 'Blank A4 page' && en[3] === 'Move page up' && en[4] === 'Add page at the end', en);
    await ev("design.motion='on';applyDesign(true);S.pages.forEach(P=>P.objs=[]);setSel(null)");
  }
  // Review fix 1: undo/redo inside the open text editor also restores sty/spans; Ctrl+B in the editor is undoable
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev("(async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);await openPdf(await d.save(),'sty3.pdf');await new Promise(r=>setTimeout(r,500));setTool('select');S.pages.forEach(P=>P.objs=[]);setSel(null);S.autoChar=true;zoomTo(1);await new Promise(r=>setTimeout(r,300));S.pages[0].el.scrollIntoView({block:'start'});const o={type:'text',x:72,y:200,text:'Hello bold world',fs:16,color:'#1b1f24',orient:'h',lw:0,sty:[{a:6,b:10,bold:true}]};S.pages[0].objs.push(o);redraw(0);openTextEditor(0,o,false);window.u1=o;window.u1K=(k,m={})=>ED.eng.sink.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true,...m}));return 1})()");
    await sleep(300);
    const J = e => ev(`JSON.stringify(${e})`).then(JSON.parse);
    await ev("ED.eng.select(2,2);u1K('x');ED.eng.select(4,12);u1K('Delete')");
    const mid = await J("[u1.text,u1.sty]");
    await ev("for(let i=0;i<6;i++)u1K('z',{ctrlKey:true})");
    const back = await J("[u1.text,u1.sty]");
    await ev("for(let i=0;i<6;i++)u1K('y',{ctrlKey:true})");
    const fwd = await J("[u1.text,u1.sty]");
    ok('Review 1: Strg+Z/Strg+Y im Editor stellen Text und Teilformat (sty) zusammen wieder her', back[0] === 'Hello bold world' && JSON.stringify(back[1]) === '[{"a":6,"b":10,"bold":true}]' && fwd[0] === mid[0] && JSON.stringify(fwd[1]) === JSON.stringify(mid[1]), { mid, back, fwd });
    await ev("for(let i=0;i<6;i++)u1K('z',{ctrlKey:true});ED.eng.select(0,5);u1K('b',{ctrlKey:true})");
    const f1 = await J("u1.sty"); await ev("u1K('z',{ctrlKey:true})"); const f2 = await J("u1.sty"); await ev("u1K('y',{ctrlKey:true})"); const f3 = await J("u1.sty");
    ok('Review 1: Strg+B im Editor ist mit Strg+Z rücknehmbar (und Strg+Y)', JSON.stringify(f1) === '[{"a":0,"b":5,"bold":true},{"a":6,"b":10,"bold":true}]' && JSON.stringify(f2) === '[{"a":6,"b":10,"bold":true}]' && JSON.stringify(f3) === JSON.stringify(f1), { f1, f2, f3 });
    await ev("closeEditor();S.pages.forEach(P=>P.objs=[]);setSel(null);redrawAll()");
  }
  // Review fix 2 and 7: only weight/slant changes re-wrap; underline/background keep the plain wrapping; speed at 20k characters
  {
    const J = e => ev(`JSON.stringify(${e})`).then(JSON.parse);
    const w2 = await J("(()=>{const T=Array.from({length:70},(_,i)=>'wort'+i).join(' '),o={type:'text',x:0,y:0,text:T,fs:16,color:'#000000',orient:'h',lw:0,wrapW:300};const plain=textBox(o).lines,ul=textBox({...o,sty:[{a:40,b:90,underline:true,hbg:'#ffd60a'}]}).lines,bo=textBox({...o,sty:[{a:300,b:340,bold:true}]}).lines;"
      + "let same=0;while(same<plain.length&&same<bo.length&&plain[same]===bo[same])same++;const first=plain.join('|').indexOf(T.slice(300,310));return [JSON.stringify(plain)===JSON.stringify(ul),plain.length,bo.length,same,plain.slice(0,same).join(' ').length>=200,bo.join(' ')===T.replace(/\\s+/g,' ')]})()");
    ok('Review 2: Unterstreichen/Hintergrund lassen den Umbruch unverändert, ein fetter Bereich ändert nur die Zeilen ab dort', w2[0] === true && w2[3] >= 5 && w2[4] === true && w2[5] === true, w2);
    const sp = await ev("(()=>{const T=Array.from({length:3300},(_,i)=>'wor'+(i%10)).join(' ').slice(0,20000),sty=[];for(let k=0;k<200;k++)sty.push({a:k*90+5,b:k*90+30,bold:k%2===0,underline:true});const o={type:'text',x:0,y:0,text:T,fs:14,color:'#000000',orient:'h',lw:0,wrapW:500,sty};const cv=document.createElement('canvas');cv.width=600;cv.height=200;const c=cv.getContext('2d');const t0=performance.now();for(let i=0;i<20;i++){o.text=T+'x'.repeat(i);textBox(o);drawText(c,o)}return JSON.stringify([Math.round((performance.now()-t0)/20),T.length])})()", 60000).then(JSON.parse);
    ok('Review 7: 20000 Zeichen mit 200 Bereichen: Messen und Zeichnen je Tastendruck unter 80 ms', sp[0] < 80 && sp[1] === 20000, sp);
  }
  // Review fix 3: after Backspace undoes an autocorrect in the notes field the caret is collapsed (next character does not overwrite)
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev("S.autoChar=true;S.autoCap=false;notesOpen(true);const t=document.getElementById('ntText');t.value='';t.scrollIntoView();t.focus()"); await sleep(400);
    for (const ch of 'a ->') await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
    await key('Backspace', 'Backspace', 8);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'X', text: 'X', unmodifiedText: 'X' });
    const nv = await ev("document.getElementById('ntText').value");
    ok("Review 3: Notizen: 'a ->', Rückschritt, 'X' ergibt 'a ->X'", nv === 'a ->X', nv);
    await ev("document.getElementById('ntText').value='';notesOpen(false);S.autoCap=true");
  }
  // Review fix 4: conservative autocorrect: IT text, options, URLs and enumerations stay as typed; real dash/arrow/symbol uses still convert
  {
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await ev("(async()=>{const d=await PDFLib.PDFDocument.create();d.addPage([595,842]);await openPdf(await d.save(),'ac2.pdf');await new Promise(r=>setTimeout(r,500));setTool('select');S.pages.forEach(P=>P.objs=[]);setSel(null);S.autoChar=true;S.autoCap=false;zoomTo(1);await new Promise(r=>setTimeout(r,300));S.pages[0].el.scrollIntoView({block:'start'});const o={type:'text',x:72,y:200,text:'',fs:16,color:'#1b1f24',orient:'h',lw:0};S.pages[0].objs.push(o);redraw(0);openTextEditor(0,o,false);window.a4K=k=>ED.eng.sink.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));window.a4=s=>{const st=ED.eng.st;st.v='';st.c=st.a=0;for(const ch of s)a4K(ch);return ED.eng.st.v};return 1})()");
    await sleep(300);
    const same = ['git push --force', 'x<-1', 'f(c)', '(a) (b) (c)', '<=>', '+---+', 'i++--', 'http://a.b/c--d', 'user@mail--x', '1--2', 'a<->b', '"zitat" und \'x\'', 'a-b', 'wait.. ok', 'x --y', '1+-'];
    const conv = [['a -- b', 'a – b'], ['-- x', '– x'], ['a <- b', 'a ← b'], ['x <-> y', 'x ↔ y'], ['+-5', '±5'], ['Copyright (c) 2026', 'Copyright © 2026'], ['a->b', 'a→b'], ['wait...', 'wait…'], ['a != b', 'a ≠ b'], ['a => b', 'a ⇒ b'], ['x (tm)', 'x ™'], ['(R) y', '® y']];
    const bad = [], badc = [];
    for (const i of same) { const r = await ev(`a4(${JSON.stringify(i)})`); if (r !== i) bad.push([i, r]); }
    for (const [i, e] of conv) { const r = await ev(`a4(${JSON.stringify(i)})`); if (r !== e) badc.push([i, r, e]); }
    ok('Review 4: Autokorrektur lässt IT-Text, Optionen, URLs, Aufzählungen und Operatoren unverändert', bad.length === 0, bad);
    ok('Review 4: Autokorrektur wandelt echte Gedankenstriche, Pfeile und Zeichen weiterhin um', badc.length === 0, badc);
    await ev("closeEditor();S.autoCap=true;S.pages.forEach(P=>P.objs=[]);setSel(null);redrawAll()");
  }
  await cdp('Emulation.clearDeviceMetricsOverride', {});
  ws.close();
  console.log(failed ?`${failed} Prüfung(en) fehlgeschlagen` : 'Alles in Ordnung');
  done(failed ? 1 : 0);
}
