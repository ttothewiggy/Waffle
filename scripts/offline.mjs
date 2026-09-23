import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir) {
  const result = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) result.push(...(await walk(p)));
    else result.push(p);
  }
  return result;
}
const files = [
  ...(await walk(".next/static")),
  ...(await walk("public")).filter((p) => !p.endsWith("/sw.js")),
].filter((p) => !p.endsWith(".map"));
const version = createHash("sha256");
for (const p of files) version.update(await readFile(p));
version.update(await readFile(".next/BUILD_ID"));
const assets = files.map((p) =>
  p.startsWith(".next/")
    ? "/" + p.replace(".next/", "_next/")
    : "/" + p.slice(7),
);
assets.push("/");
await writeFile(
  "public/sw.js",
  `const CACHE='waffle-${version.digest("hex").slice(0, 12)}';
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('waffle-')||k.startsWith('daybook-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;if(event.request.mode==='navigate'&&url.pathname==='/'){event.respondWith(fetch(event.request).catch(()=>caches.match('/').then(r=>r||Response.error())));return;}if(ASSETS.includes(url.pathname)&&url.pathname!=='/')event.respondWith(caches.match(event.request).then(r=>r||fetch(event.request)));});
`,
);
console.log(`Offline shell generated: ${assets.length} assets`);
