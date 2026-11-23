// FollowVerse layout rules — shared by the 3D world (index.html) and the add tool (tools/add.html).
// A follower's place is stored in followers.json as plot coordinates {x, z}.
// Plots are grouped 2x2 into city blocks; roads run between blocks.
// Block (0,0) is the central plaza (owner tower). Some blocks are fixed landmarks
// (temples, parks, lakes, markets) — they never change, so stored plots stay valid forever.

export const PLOT = 12;                 // plot size (world units)
export const ROAD = 9;                  // road width
export const PITCH = PLOT * 2 + ROAD;   // distance between block centres (33)
export const FLOOR_H = 3.2;

export const TYPES = ['house', 'villa', 'apartment', 'cottage', 'shop', 'office'];

export function hash(str) {
  str = String(str);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ring = (bx, bz) => Math.max(Math.abs(bx), Math.abs(bz));
export const plotBlock = (x, z) => [Math.floor(x / 2), Math.floor(z / 2)];

export function plotToWorld(x, z) {
  const [bx, bz] = plotBlock(x, z);
  return {
    x: bx * PITCH + (x - bx * 2 ? PLOT / 2 : -PLOT / 2),
    z: bz * PITCH + (z - bz * 2 ? PLOT / 2 : -PLOT / 2),
  };
}

const FIXED = { '-1,-1': 'temple', '1,1': 'park' };
const LANDMARKS = ['temple', 'park', 'lake', 'temple', 'market', 'park', 'lake', 'temple'];

/** Landmark type of a block, or null if the block holds follower plots. Never changes. */
export function landmarkAt(bx, bz) {
  if (bx === 0 && bz === 0) return 'plaza';
  const k = bx + ',' + bz;
  if (FIXED[k]) return FIXED[k];
  if (ring(bx, bz) < 2) return null;
  const h = hash('block:' + k);
  if (h % 9 >= 2) return null;
  return LANDMARKS[(h >>> 4) % LANDMARKS.length];
}

export function blocksOfRing(r) {
  if (r === 0) return [[0, 0]];
  const out = [];
  for (let bx = -r; bx <= r; bx++) for (let bz = -r; bz <= r; bz++) if (ring(bx, bz) === r) out.push([bx, bz]);
  return out.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
}

export const blockPlots = (bx, bz) => [[2 * bx, 2 * bz], [2 * bx + 1, 2 * bz], [2 * bx, 2 * bz + 1], [2 * bx + 1, 2 * bz + 1]];

export function* plotOrder() {
  for (let r = 1; ; r++) for (const [bx, bz] of blocksOfRing(r)) {
    if (landmarkAt(bx, bz)) continue;
    yield* blockPlots(bx, bz);
  }
}

export function isValidPlot(x, z) {
  if (!Number.isInteger(x) || !Number.isInteger(z)) return false;
  const [bx, bz] = plotBlock(x, z);
  return !landmarkAt(bx, bz);
}

export function nextFreePlot(used) {
  for (const [x, z] of plotOrder()) if (!used.has(x + ',' + z)) return [x, z];
}

const TECH = /(tech|erp|infotech|systems|labs|solution|webspire|digi|pixel|growth|secure|microprocessor|dotworld|\.online)/;
const BIZ = /(textile|jewel|enterprise|sourcing|collection|design|frame|water|craft|originals|store|shop|mart|studio|photography|vlogs|nursery|savings|juniors)/;

const PALETTE = {
  house: ['#f4d6a0', '#e8a87c', '#f6e7c1', '#a8d5ba', '#f7b2ad', '#c9d6ea', '#ffd166', '#e5989b', '#b5ead7', '#ffdac1', '#cdb4db', '#9ad1d4'],
  villa: ['#fff4e0', '#f3e9dc', '#e9f5db', '#fde2e4', '#e2ece9', '#fad2a8', '#dfe7fd', '#f8edeb'],
  apartment: ['#d6ccc2', '#e3d5ca', '#c7d3dd', '#e9c46a', '#f4a261', '#b8c0ff', '#d8e2dc', '#ffcdb2'],
  cottage: ['#c49a6c', '#b88b5a', '#d2a679', '#a47551'],
  shop: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'],
  office: ['#8fb3d9', '#9fc5e8', '#7aa5c9', '#a7c7c5', '#b4c5e4', '#88a9c3'],
};
const FLOORS = { house: [1, 2], villa: [2, 3], apartment: [4, 8], cottage: [1, 1], shop: [1, 2], office: [5, 11] };

export function typeFor(id) {
  if (TECH.test(id)) return 'office';
  if (BIZ.test(id)) return 'shop';
  const p = hash('type:' + id) % 100;
  return p < 42 ? 'house' : p < 66 ? 'villa' : p < 86 ? 'apartment' : 'cottage';
}

/** Default look for an id (type, colour, floors) — deterministic. */
export function defaults(id, type) {
  type = TYPES.includes(type) ? type : typeFor(id);
  const h = hash(id);
  const pal = PALETTE[type];
  const [a, b] = FLOORS[type];
  return { type, color: pal[h % pal.length], floors: a + ((h >>> 8) % (b - a + 1)) };
}

export function makeResident(id, used, since) {
  const [x, z] = nextFreePlot(used);
  used.add(x + ',' + z);
  return { id, x, z, ...defaults(id), since };
}

export function normalizeId(s) {
  s = String(s || '').trim();
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  return s.replace(/^@+/, '').trim().toLowerCase();
}

export function parseIds(text) {
  const seen = new Set();
  return String(text).split(/[\s,;]+/).map(normalizeId)
    .filter((v) => /^[a-z0-9._]{1,30}$/.test(v) && !seen.has(v) && seen.add(v));
}

/** Pretty JSON with one follower per line (easy to read and edit by hand). */
export function toJSON(d) {
  const keys = ['id', 'x', 'z', 'type', 'color', 'floors', 'since', 'note'];
  const lines = d.followers.map((f) => {
    const o = {};
    for (const k of keys) if (f[k] !== undefined && f[k] !== '') o[k] = f[k];
    return '    ' + JSON.stringify(o);
  });
  return `{\n  "owner": ${JSON.stringify(d.owner)},\n  "updated": ${JSON.stringify(d.updated)},\n  "followers": [\n${lines.join(',\n')}\n  ]\n}\n`;
}
