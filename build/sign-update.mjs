// Signiert latest.yml und latest-linux.yml im Release-Entwurf mit Ed25519 und lädt <name>.sig dazu hoch.
// Layr installiert Updates nur selbst, wenn diese Signatur zum öffentlichen Schlüssel in app/main.js passt.
// Der geheime Schlüssel kommt ausschließlich aus dem Actions-Secret LAYR_UPDATE_KEY und wird nirgends gespeichert oder ausgegeben.
import crypto from 'node:crypto';
import fs from 'node:fs';

const fail = m => { console.error('Fehler: ' + m); process.exit(1); };
const { GH_TOKEN, GITHUB_REPOSITORY, LAYR_UPDATE_KEY } = process.env;
if (!GH_TOKEN || !GITHUB_REPOSITORY) fail('GH_TOKEN/GITHUB_REPOSITORY fehlen');
if (!LAYR_UPDATE_KEY || !LAYR_UPDATE_KEY.includes('PRIVATE KEY')) fail('Secret LAYR_UPDATE_KEY fehlt (Settings → Secrets and variables → Actions)');

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const tag = 'v' + version;

// Schlüssel prüfen: Der öffentliche Teil muss genau der in der App eingebaute sein
const priv = crypto.createPrivateKey(LAYR_UPDATE_KEY);
if (priv.asymmetricKeyType !== 'ed25519') fail('LAYR_UPDATE_KEY ist kein Ed25519-Schlüssel');
const pubDer = crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }).toString('base64');
const main = fs.readFileSync('app/main.js', 'utf8');
const m = /-----BEGIN PUBLIC KEY-----\\n([A-Za-z0-9+/=]+)\\n-----END PUBLIC KEY-----/.exec(main);
if (!m) fail('öffentlicher Schlüssel in app/main.js nicht gefunden');
if (m[1] !== pubDer) fail('LAYR_UPDATE_KEY passt nicht zum öffentlichen Schlüssel in app/main.js');
const pub = crypto.createPublicKey(`-----BEGIN PUBLIC KEY-----\n${m[1]}\n-----END PUBLIC KEY-----\n`);

const api = (p, o = {}) => fetch(p.startsWith('http') ? p : `https://api.github.com/repos/${GITHUB_REPOSITORY}${p}`, {
  ...o, headers: { Authorization: `Bearer ${GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'layr-sign', Accept: 'application/vnd.github+json', ...(o.headers || {}) },
});

let rel = null;
for (let page = 1; page <= 5 && !rel; page++) {
  const r = await api(`/releases?per_page=50&page=${page}`); if (!r.ok) fail('Releases nicht lesbar: ' + r.status);
  const list = await r.json(); if (!list.length) break;
  rel = list.find(x => x.tag_name === tag && x.draft) || null;
}
if (!rel) fail(`kein Release-Entwurf ${tag} gefunden`);

for (const name of ['latest.yml', 'latest-linux.yml']) {
  const a = rel.assets.find(x => x.name === name); if (!a) fail(name + ' fehlt im Entwurf');
  const r = await api(`/releases/assets/${a.id}`, { headers: { Accept: 'application/octet-stream' } });
  if (!r.ok) fail(name + ' nicht ladbar: ' + r.status);
  const text = Buffer.from(await r.arrayBuffer()).toString('utf8');
  if (!new RegExp(`^version: ${version.replace(/\./g, '\\.')}$`, 'm').test(text)) fail(name + ' hat nicht die Version ' + version);
  const sig = crypto.sign(null, Buffer.from(text, 'utf8'), priv);
  if (!crypto.verify(null, Buffer.from(text, 'utf8'), pub, sig)) fail('Signatur lässt sich nicht prüfen');
  const old = rel.assets.find(x => x.name === name + '.sig');
  if (old) { const d = await api(`/releases/assets/${old.id}`, { method: 'DELETE' }); if (!d.ok) fail('alte Signatur nicht löschbar: ' + d.status); }
  const up = await api(`https://uploads.github.com/repos/${GITHUB_REPOSITORY}/releases/${rel.id}/assets?name=${encodeURIComponent(name + '.sig')}`,
    { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: sig.toString('base64') + '\n' });
  if (!up.ok) fail(name + '.sig nicht hochgeladen: ' + up.status);
  console.log(`${name}.sig hochgeladen (${text.length} Bytes signiert)`);
}
