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
  for (let i = 0; i < 30; i++) { if (await ev("typeof S==='object'&&typeof openPdf==='function'&&typeof PDFLib==='object'") === true) break; await sleep(500); }
  const info = await ev('werkbank.appInfo()');
  ok('Version', info && info.version === version, info);
  ok('pdf.js 6 geladen', String(await ev('pdfjsLib.version')).startsWith('6.'));
  ok('Content-Security-Policy aktiv', /wasm-unsafe-eval/.test(String(await ev("(document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')||{}).content"))));
  ok('Fremder Inline-Code gesperrt', await ev("new Promise(r=>{const s=document.createElement('script');s.textContent='window.__inl=1';document.head.appendChild(s);setTimeout(()=>r(window.__inl===undefined),300)})") === true);
  const open = await ev("(async()=>{const d=await PDFLib.PDFDocument.create();const f=await d.embedFont(PDFLib.StandardFonts.Helvetica);d.addPage([595,842]).drawText('Rauchtest Router 10.0.0.1',{x:72,y:700,size:18,font:f});await openPdf(await d.save(),'Rauchtest.pdf');await new Promise(r=>setTimeout(r,1500));return [S.pages.length,!!S.pages[0].pdf]})()");
  ok('PDF öffnen und zeichnen', Array.isArray(open) && open[0] === 1, open);
  ok('PDF-Text aus dem Worker', await ev('S.doc.getPage(1).then(p=>p.getTextContent()).then(t=>t.items.map(x=>x.str).join(" "))').then(t => /Rauchtest Router/.test(String(t))));
  ok('Text auswählen: Textebene vorhanden', await ev("(async()=>{setTool('textsel');let s=[];for(let k=0;k<50&&!s.length;k++){await new Promise(r=>setTimeout(r,200));s=[...S.pages[0].el.querySelectorAll('.textLayer span')]}const hit=s.some(x=>x.textContent.includes('Router'));getSelection().selectAllChildren(S.pages[0].el.querySelector('.textLayer'));const sel=String(getSelection()).includes('Router');setTool('select');return hit&&sel})()", 20000));
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
  ok('Verbindung behält gültige Festpunkte und setzt unbekannte auf auto', await ev("(()=>{const r=sanObj({type:'line',x1:0,y1:0,x2:1,y2:1,color:'#000000',link:{a:'x',b:'y',ta:'t2',tb:'junk'}});return r.link.ta==='t2'&&r.link.tb==='auto'})()") === true);
  ws.close();
  console.log(failed ? `${failed} Prüfung(en) fehlgeschlagen` : 'Alles in Ordnung');
  done(failed ? 1 : 0);
}
