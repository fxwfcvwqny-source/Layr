// Legt den Release-Entwurf v<version> an, bevor electron-builder hochlädt. Sonst können parallele Uploads
// zwei Entwürfe mit demselben Namen erzeugen (passiert mit electron-builder 26.15).
import fs from 'node:fs';
const { GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA } = process.env;
const fail = m => { console.error('::error::' + m); process.exit(1); };
if (!GH_TOKEN || !GITHUB_REPOSITORY) fail('GH_TOKEN/GITHUB_REPOSITORY fehlen');
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version, tag = 'v' + version;
const api = (p, o = {}) => fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}${p}`, { ...o,
  headers: { Authorization: `Bearer ${GH_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'layr-draft', Accept: 'application/vnd.github+json', ...(o.headers || {}) } });
const r = await api('/releases?per_page=50'); if (!r.ok) fail('Releases nicht lesbar: ' + r.status);
const list = await r.json(), same = list.filter(x => x.tag_name === tag);
if (same.some(x => !x.draft)) fail(`${tag} ist schon veröffentlicht`);
if (same.length) { console.log(`Entwurf ${tag} gibt es schon (${same.map(x => x.id).join(', ')})`); process.exit(0); }
const c = await api('/releases', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag_name: tag, name: version, draft: true, target_commitish: GITHUB_SHA || 'main', body: '' }) });
if (!c.ok) fail('Entwurf nicht angelegt: ' + c.status);
console.log(`Entwurf ${tag} angelegt (${(await c.json()).id})`);
