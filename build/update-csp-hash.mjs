// Re-pins the sha256 of the inline script in app/web/index.html's Content-Security-Policy.
// Every edit of the inline script changes the hash; without this the CSP blocks the whole page script.
// Usage: node build/update-csp-hash.mjs   (run after editing the script, before committing)
import fs from 'node:fs';
import crypto from 'node:crypto';
const f = new URL('../app/web/index.html', import.meta.url);
const html = fs.readFileSync(f, 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1) { console.error('expected exactly one inline script, found ' + scripts.length); process.exit(1); }
const hash = 'sha256-' + crypto.createHash('sha256').update(scripts[0][1], 'utf8').digest('base64');
const pinned = html.match(/script-src[^;]*'(sha256-[A-Za-z0-9+/=]+)'/);
if (!pinned) { console.error('no sha256 in script-src'); process.exit(1); }
if (pinned[1] === hash) { console.log('CSP hash already current'); process.exit(0); }
fs.writeFileSync(f, html.replace(pinned[1], hash));
console.log('CSP hash updated: ' + hash);
