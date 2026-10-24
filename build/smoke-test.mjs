// Rauchtest für den fertigen Build (läuft in GitHub Actions vor dem Hochladen):
// Startet Layr, verbindet sich über die Fernsteuerung (nur 127.0.0.1) und prüft Kernfunktionen.
// Aufruf: node build/smoke-test.mjs <Pfad zur Layr-Programmdatei>
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const exe = process.argv[2];
if (!exe || !fs.existsSync(exe)) { console.error('Programmdatei fehlt: ' + exe); process.exit(2); }
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const PORT = 9339;
const args = [`--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1'];
if (process.platform === 'linux') args.push('--no-sandbox');
const env = { ...process.env, GTK_IM_MODULE: 'gtk-im-context-simple', XMODIFIERS: '@im=none' };
const proc = spawn(exe, args, { env, stdio: 'ignore' });
let failed = 0;
const ok = (name, cond, extra) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra !== undefined ? ' ' + JSON.stringify(extra) : ''}`); if (!cond) failed++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const done = code => { try { proc.kill(); } catch (e) {} setTimeout(() => process.exit(code), 500); };
setTimeout(() => { console.error('Zeitüberschreitung'); done(1); }, 180000);

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
  ok('Schwebende Werkzeugleiste: Seitenleisten beginnen nicht unter der Leiste', await ev("(()=>{const r=document.documentElement,old=r.dataset.tbstyle;r.dataset.tbstyle='float';const t=document.querySelector('.tools').getBoundingClientRect().top,a=document.querySelector('.thumbs').getBoundingClientRect().top,b=document.querySelector('.panel').getBoundingClientRect().top;old===undefined?delete r.dataset.tbstyle:r.dataset.tbstyle=old;return a<=t+1&&b<=t+1})()") === true);
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
  ok('Text-Leiste: Standard zeigt 8 Knöpfe in alter Reihenfolge mit 3 Trennern', await ev("(()=>{design.qbarOrder=QB_IDS.slice();design.qbarHide=[];newText(0,120,200);ED.eng.put('Hallo');const bar=document.querySelector('.edbar');const r=[bar.querySelectorAll(':scope>.edsep').length,[...bar.querySelectorAll('[data-a]')].filter(b=>!b.closest('.edoff')).map(b=>b.dataset.a).join()];closeEditor();return r[0]===3&&r[1]==='font,dn,up,bold,ul,lb,ln,out,in,col,del'})()") === true);
  ok('Text-Leiste: ausgeblendeter Fett-Knopf ist unsichtbar, Fett und Strg+B wirken trotzdem', await ev("(()=>{design.qbarHide=['bold'];newText(0,120,200);ED.eng.put('Hallo');const vis=document.querySelector('.edbar [data-a=bold]').getClientRects().length>0;ED.set({bold:true});const a=ED.o.bold===true;ED.set({bold:false});document.querySelector('.tbx-in').dispatchEvent(new KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true}));const c=ED.o.bold===true;closeEditor();design.qbarHide=[];return !vis&&a&&c})()") === true);
  // Text-Leiste: Einstellungen werden bereinigt, alte Design-Daten laden ohne Fehler
  ok('Text-Leiste: ungültige Einstellungen werden bereinigt', await ev("(()=>{const d=qbSan({qbarOrder:['x','bold','bold'],qbarHide:QB_IDS.slice(),qbar:'zz',qbarStyle:'zz'});return d.qbarOrder.join()==='bold,font,size,ul,lists,indent,col,del'&&d.qbarHide.length===0&&d.qbar==='m'&&d.qbarStyle==='panel'})()") === true);
  await ev("localStorage.setItem('pdfwerkbank:design',JSON.stringify({qbar:'l'}));location.reload()");
  await sleep(4000);
  for (let i = 0; i < 30; i++) { if (await ev("typeof S==='object'&&typeof applyDesign==='function'") === true) break; await sleep(500); }
  ok('Altes Design ohne Text-Leisten-Schlüssel lädt mit Standardreihenfolge', await ev("design.qbar==='l'&&design.qbarOrder.join()===QB_IDS.join()&&design.qbarHide.length===0&&design.qbarStyle==='panel'") === true);
  ws.close();
  console.log(failed ?`${failed} Prüfung(en) fehlgeschlagen` : 'Alles in Ordnung');
  done(failed ? 1 : 0);
}
