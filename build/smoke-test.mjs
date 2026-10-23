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
  const out = await ev("(async()=>{S.pages[0].objs.push({type:'text',x:72,y:300,text:'Kopierbarer Text',fs:16,color:'#1b1f24',orient:'h',lw:0,spans:[{a:0,b:9,color:'#d62828'}]});redraw(0);const out=await buildOutput();const d=await pdfOpen(out.slice());const t=await (await d.getPage(1)).getTextContent();return t.items.map(x=>x.str).join('|')})()", 60000);
  ok('Speichern mit kopierbarem Text', /Kopierbarer Text/.test(String(out)), String(out).slice(-80));
  ok('Textbox bleibt auf der Seite', await ev("(()=>{newText(0,560,830);ED.eng.put('Wort '.repeat(20));const o=ED.o,P=S.pages[0],b=bbox(o);closeEditor();return b.x>=0&&b.y>=0&&b.x+b.w<=P.w+.5&&b.y+b.h<=P.h+.5})()") === true);
  ok('IT-Rechner', await ev("(()=>{openCalcDlg('num');const r=CALC.res&&CALC.res.rows[1][1];closeCalcDlg();return r})()") === '1100 1010');
  const asr = await ev('werkbank.asrProbe()', 60000);
  ok('Spracherkennung (sherpa-onnx) lädt im Hilfsprozess', asr && asr.ok === true && /^1\./.test(String(asr.version)), asr);
  ok('Diktier-Knopf vorhanden, Modell nicht mitgeliefert', await ev("(async()=>!document.getElementById('bMic').hidden&&!(await werkbank.asrState()).installed)()") === true);
  ok('Nur eigene Programmfunktionen', await ev("typeof require==='undefined'&&typeof process==='undefined'") === true);
  ws.close();
  console.log(failed ? `${failed} Prüfung(en) fehlgeschlagen` : 'Alles in Ordnung');
  done(failed ? 1 : 0);
}
