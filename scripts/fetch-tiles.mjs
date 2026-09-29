// Downloads the GTA V satellite map tiles (z0-z5, 256px WebP) into public/tiles/{z}/{x}-{y}.webp.
// Source: https://github.com/VIRUXE/gtav-map-tiles (cut from an 8192x8192 master image).
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/VIRUXE/gtav-map-tiles/master/satelite';
const OUT = join(process.cwd(), 'public', 'tiles');
const CONCURRENCY = 8;

const jobs = [];
for (let z = 0; z <= 5; z++) {
  const n = 2 ** z;
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) jobs.push({ z, x, y });
}

const exists = (p) => access(p).then(() => true, () => false);

async function fetchOne({ z, x, y }) {
  const file = join(OUT, String(z), `${x}-${y}.webp`);
  if (await exists(file)) return 'skip';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${BASE}/${z}/${x}-${y}.webp`);
    if (res.status === 404) return 'missing';
    if (res.ok) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      return 'ok';
    }
  }
  return 'failed';
}

const counts = { ok: 0, skip: 0, missing: 0, failed: 0 };
const problems = [];
let next = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    const result = await fetchOne(job);
    counts[result]++;
    if (result === 'missing' || result === 'failed') problems.push(`${result} ${job.z}/${job.x}-${job.y}`);
  }
}));
console.log(counts);
if (problems.length) console.log(problems.join('\n'));
