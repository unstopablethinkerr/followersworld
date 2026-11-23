// FollowVerse — a 3D city where every Instagram follower owns a plot.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from './layout.js';

const MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const $ = (s) => document.querySelector(s);
const FH = L.FLOOR_H;
const INFO = {
  house: ['🏠', 'House'], villa: ['🏡', 'Villa'], apartment: ['🏢', 'Apartment'], cottage: ['🛖', 'Cottage'],
  shop: ['🏪', 'Shop'], office: ['🏬', 'Office'], temple: ['🛕', 'Temple'], park: ['🌳', 'Park'],
  lake: ['🏞️', 'Lake'], market: ['🛍️', 'Market'], plaza: ['🗼', 'HQ Tower'], empty: ['🪧', 'Empty plot'],
};

/* ---------------------------------------------------------------- loading */
const loader = { bar: $('#ldbar'), text: $('#ldtext') };
const progress = (p, t) => { loader.bar.style.width = (p * 100).toFixed(0) + '%'; if (t) loader.text.textContent = t; };
const tick = () => new Promise((r) => setTimeout(r, 0));

async function loadData() {
  let raw;
  try {
    const res = await fetch('followers.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    raw = await res.json();
  } catch (e) {
    loader.text.innerHTML = 'Could not load <b>followers.json</b>.<br>Open the site from GitHub Pages or a local server (see README).<br><small>' + e.message + '</small>';
    throw e;
  }
  const used = new Set(), seen = new Set(), out = [], pending = [];
  for (const item of raw.followers || []) {
    const f = typeof item === 'string' ? { id: item } : { ...item };
    f.id = L.normalizeId(f.id);
    if (!f.id || seen.has(f.id)) continue;
    seen.add(f.id);
    const d = L.defaults(f.id, f.type);
    f.type = d.type; f.color = /^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color : d.color;
    f.floors = Math.max(1, Math.min(30, parseInt(f.floors) || d.floors));
    const key = f.x + ',' + f.z;
    if (L.isValidPlot(f.x, f.z) && !used.has(key)) { used.add(key); out.push(f); } else pending.push(f);
  }
  for (const f of pending) {
    const [x, z] = L.nextFreePlot(used); used.add(x + ',' + z);
    console.warn(`[FollowVerse] @${f.id} had no valid/unique plot — shown at (${x}, ${z}). Use tools/add.html to save it.`);
    out.push({ ...f, x, z, since: f.since || raw.updated });
  }
  out.forEach((f, i) => { f.n = i + 1; });
  return { owner: L.normalizeId(raw.owner || 'owner'), updated: raw.updated || '', followers: out };
}

/* ---------------------------------------------------------------- geometry helpers */
function colorize(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** box with its base at y */
function box(w, h, d, x, y, z, color, rx = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return colorize(g, color);
}
function cyl(rt, rb, h, x, y, z, color, seg = 10) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.translate(x, y + h / 2, z); return colorize(g, color);
}
function cone(r, h, x, y, z, color, seg = 8) {
  const g = new THREE.ConeGeometry(r, h, seg); g.translate(x, y + h / 2, z); return colorize(g, color);
}
function sphere(r, x, y, z, color) {
  const g = new THREE.SphereGeometry(r, 12, 8); g.translate(x, y, z); return colorize(g, color);
}
/** walls with a tiled window texture; UVs scaled so windows keep real-world size */
function wallBox(w, h, d, x, y, z, color, floors, r) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, ou = Math.floor(r() * 4) * 0.25, ov = Math.floor(r() * 4) * 0.25;
  for (let i = 0; i < 24; i++) {
    let u = uv.getX(i), v = uv.getY(i);
    if (i >= 8 && i < 16) { u = 0.02; v = 0.48; }           // top/bottom: plain wall
    else { u = u * ((i < 8 ? d : w) / 16) + ou; v = v * (floors / 4) + ov; }
    uv.setXY(i, u, v);
  }
  g.translate(x, y + h / 2, z);
  return colorize(g, color);
}
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

/* ---------------------------------------------------------------- textures */
function windowTextures() {
  const N = 4, T = 64, S = N * T;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const c = mk(), e = mk(), g = c.getContext('2d'), ge = e.getContext('2d'), r = L.rng(7);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = i * T, y = j * T;
    g.fillStyle = '#d9d3c8'; g.fillRect(x, y + T - 4, T, 4);
    g.fillStyle = '#26384a'; g.fillRect(x + 17, y + 14, 30, 30);
    g.fillStyle = '#3d5770'; g.fillRect(x + 17, y + 14, 30, 8);
    g.fillStyle = '#f2efe9'; g.fillRect(x + 14, y + 44, 36, 3); g.fillRect(x + 31, y + 14, 2, 30);
    if (r() < 0.55) { ge.fillStyle = r() < 0.5 ? '#ffcf73' : '#ffe8b5'; ge.fillRect(x + 17, y + 14, 30, 30); }
  }
  const tex = (cv, srgb) => {
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  return { map: tex(c, true), emissive: tex(e, true) };
}
function noiseTexture(base, vary, size = 128, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), col = new THREE.Color(base), r = L.rng(3);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const k = 1 + (r() - 0.5) * vary;
    img.data[i * 4] = Math.min(255, col.r * 255 * k); img.data[i * 4 + 1] = Math.min(255, col.g * 255 * k);
    img.data[i * 4 + 2] = Math.min(255, col.b * 255 * k); img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

/* ---------------------------------------------------------------- building builders (local space, front = +z) */
const ROOF = ['#b5523b', '#a0422f', '#8b5a3c', '#c1663f', '#9a3b2b'];
const TEMPLE = ['#e8b04a', '#d9534f', '#3fa7c9', '#f08a4b', '#9b59b6', '#4caf7a'];

function fence(S, r) {
  const c = '#ddd6c6', e = 5.5, t = 0.35, h = 0.9;
  S.push(box(11, h, t, 0, 0, -e, c), box(t, h, 11, -e, 0, 0, c), box(t, h, 11, e, 0, 0, c));
  S.push(box(4, h, t, -3.5, 0, e, c), box(4, h, t, 3.5, 0, e, c));
  S.push(box(0.6, 1.4, 0.6, -1.5, 0, e, '#c8bfae'), box(0.6, 1.4, 0.6, 1.5, 0, e, '#c8bfae'));
}
function tank(S, x, y, z) { S.push(cyl(0.75, 0.75, 1.3, x, y, z, '#2c2c2c', 10), cyl(0.5, 0.75, 0.25, x, y + 1.3, z, '#3a3a3a', 10)); }

const builders = {
  house(f, r, W, S, T) {
    const w = 6.6 + r() * 1.2, d = 5.8 + r(), h = f.floors * FH;
    S.push(box(w + 0.4, 0.4, d + 0.4, 0, 0, 0, '#9c9282'));
    W.push(wallBox(w, h, d, 0, 0.4, 0, f.color, f.floors, r));
    S.push(box(1.3, 2.3, 0.15, 0, 0.4, d / 2, '#6b3e26'));
    const rh = 2.2 + r() * 0.9, roof = new THREE.ConeGeometry(1, rh, 4);
    roof.rotateY(Math.PI / 4); roof.scale((w / 2 + 0.6) * Math.SQRT2, 1, (d / 2 + 0.6) * Math.SQRT2);
    roof.translate(0, h + 0.4 + rh / 2, 0); S.push(colorize(roof, ROOF[Math.floor(r() * ROOF.length)]));
    fence(S, r); T.push([3.8, 3.6, 0.8]);
    return h + 0.4 + rh;
  },
  villa(f, r, W, S, T) {
    const w = 8, d = 7.6, h = f.floors * FH, wc = '#f1ece2';
    S.push(box(w + 0.4, 0.4, d + 0.4, 0, 0, 0, '#a59a88'));
    W.push(wallBox(w, h, d, 0, 0.4, 0, f.color, f.floors, r));
    S.push(box(w + 0.7, 0.35, d + 0.7, 0, h + 0.4, 0, wc));
    const y = h + 0.75, e = w / 2 + 0.2, ez = d / 2 + 0.2;
    S.push(box(w + 0.7, 0.8, 0.2, 0, y, -ez, wc), box(w + 0.7, 0.8, 0.2, 0, y, ez, wc), box(0.2, 0.8, d + 0.7, -e, y, 0, wc), box(0.2, 0.8, d + 0.7, e, y, 0, wc));
    S.push(box(w * 0.6, 0.25, 1.5, 0, FH + 0.4, d / 2 + 0.75, wc), box(w * 0.6, 0.8, 0.1, 0, FH + 0.65, d / 2 + 1.45, '#3b3b3b'));
    S.push(box(1.4, 2.4, 0.15, -1.6, 0.4, d / 2, '#5a3a22'));
    tank(S, w / 2 - 1.2, y, -d / 2 + 1.2);
    if (r() < 0.6) S.push(box(3.2, 0.12, 3.6, 2.4, 2.6, d / 2 + 1.6, '#7d7468'), cyl(0.1, 0.1, 2.6, 3.8, 0, d / 2 + 3.2, '#7d7468'));
    fence(S, r); T.push([-4, 3.8, 0.7]);
    return y + 1.5;
  },
  apartment(f, r, W, S) {
    const w = 9.2, d = 8.6, h = f.floors * FH, acc = shade(f.color, 0.72);
    S.push(box(w + 0.6, 0.5, d + 0.6, 0, 0, 0, '#8f877a'));
    W.push(wallBox(w, h, d, 0, 0.5, 0, f.color, f.floors, r));
    S.push(box(1.4, h, 0.25, w / 2 - 1.2, 0.5, d / 2 + 0.05, acc), box(1.4, h, 0.25, -w / 2 + 1.2, 0.5, d / 2 + 0.05, acc));
    S.push(box(w + 0.5, 0.4, d + 0.5, 0, h + 0.5, 0, '#e8e2d6'), box(2.6, 2.6, 2.6, -2, h + 0.9, -1.5, '#d8d0c2'));
    tank(S, 2.4, h + 0.9, -2.2); tank(S, 2.4, h + 0.9, 0.2);
    S.push(box(2.2, 2.6, 0.2, 0, 0.5, d / 2 + 0.05, '#4a3b2e'));
    return h + 3.6;
  },
  cottage(f, r, W, S, T) {
    S.push(cyl(3.4, 3.4, 0.35, 0, 0, 0, '#9c8a6c', 14), cyl(3, 3, 3, 0, 0.35, 0, f.color, 14));
    S.push(cone(4.3, 3.4, 0, 3.3, 0, '#8d6e3f', 14), cone(1, 1.2, 0, 6.4, 0, '#6e5430', 8));
    S.push(box(1.2, 2.1, 0.2, 0, 0.35, 2.95, '#4b3420'));
    S.push(cone(1.3, 1.8, 3.8, 0, -3.8, '#d9b45a', 10), cone(1, 1.4, -4, 0, -3.6, '#cfa94e', 10));
    T.push([-3.6, 3.8, 1.1]);
    return 8;
  },
  shop(f, r, W, S) {
    const w = 9.4, d = 7, fl = f.floors, h = fl * FH + 0.6, sign = ['#d62976', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#e53935'][Math.floor(r() * 6)];
    S.push(box(w + 0.6, 0.4, d + 1.8, 0, 0, 0.6, '#b9b2a4'));
    W.push(wallBox(w, h, d, 0, 0.4, 0, f.color, fl, r));
    S.push(box(w - 1.2, 2.3, 0.15, 0, 0.4, d / 2, '#2f4858'));
    const n = 6;
    for (let i = 0; i < n; i++) S.push(box(w / n, 0.12, 2, -w / 2 + w / n * (i + 0.5), 2.9, d / 2 + 0.9, i % 2 ? '#ffffff' : sign, -0.35));
    S.push(box(w * 0.92, 1.2, 0.3, 0, h - 0.2, d / 2 + 0.15, sign), box(w + 0.4, 0.35, d + 0.4, 0, h + 0.4, 0, '#e3ddd1'));
    return h + 1;
  },
  office(f, r, W, S) {
    const w = 8.8, d = 8.8, fl = f.floors, lo = Math.ceil(fl * 0.65), hi = fl - lo, h1 = lo * FH, h2 = hi * FH;
    S.push(box(w + 1.2, 0.6, d + 1.2, 0, 0, 0, '#7f8a93'));
    W.push(wallBox(w, h1, d, 0, 0.6, 0, f.color, lo, r));
    S.push(box(w + 0.3, 0.3, d + 0.3, 0, h1 + 0.6, 0, '#cfd8dc'));
    let top = h1 + 0.9;
    if (hi > 0) { W.push(wallBox(w * 0.7, h2, d * 0.7, 0, top, 0, shade(f.color, 1.08), hi, r)); top += h2; }
    S.push(box(w * 0.72, 0.4, d * 0.72, 0, top, 0, '#455a64'), cyl(0.08, 0.12, 5, 1.6, top + 0.4, 1.6, '#b0bec5', 6), sphere(0.3, 1.6, top + 5.5, 1.6, '#ff5252'));
    S.push(box(3, 2.6, 0.2, 0, 0.6, d / 2 + 0.05, '#263238'));
    return top + 5.5;
  },
};

function bTemple(r, S, T) {
  S.push(box(23.4, 0.6, 23.4, 0, 0, 0, '#d9c9a6'));
  const e = 11.1, wh = 2.4;
  const wall = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.6)), horiz = z0 === z1;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, c = i % 2 ? '#f3efe6' : '#b83b2e';
      S.push(horiz ? box(len / n, wh, 0.6, x, 0.6, z, c) : box(0.6, wh, len / n, x, 0.6, z, c));
    }
  };
  wall(-e, -e, e, -e); wall(-e, -e, -e, e); wall(e, -e, e, e); wall(-e, e, -4.2, e); wall(4.2, e, e, e);
  // gopuram (tower gate)
  let gw = 8.4, gd = 4.4, y = 0.6;
  S.push(box(gw, 4.2, gd, 0, y, e, '#e9dcc4'), box(2.4, 3.4, gd + 0.1, 0, y, e, '#3a2a1e')); y += 4.2;
  for (let i = 0; i < 6; i++) {
    gw *= 0.86; gd *= 0.9;
    S.push(box(gw, 2, gd, 0, y, e, TEMPLE[i % TEMPLE.length]), box(gw + 0.4, 0.28, gd + 0.4, 0, y + 1.8, e, '#f6e7c8'));
    for (let k = -1; k <= 1; k += 2) S.push(box(0.5, 1.3, 0.5, k * gw / 2.6, y + 0.4, e + gd / 2 + 0.1, '#fff2cc'));
    y += 2;
  }
  const barrel = new THREE.CylinderGeometry(1, 1, gw, 12); barrel.rotateZ(Math.PI / 2); barrel.translate(0, y + 0.6, e);
  S.push(colorize(barrel, '#e8b04a'));
  for (let i = 0; i < 5; i++) S.push(cone(0.28, 1.2, -gw / 2 + gw * (i + 0.5) / 5, y + 1.4, e, '#f1c40f', 8));
  const top = y + 2.6;
  // vimana (sanctum)
  let vw = 7, vy = 0.6;
  S.push(box(vw, 3.6, vw, 0, vy, -4, '#efe4cc')); vy += 3.6;
  for (let i = 0; i < 3; i++) { vw *= 0.78; S.push(box(vw, 1.6, vw, 0, vy, -4, TEMPLE[(i + 2) % 6])); vy += 1.6; }
  S.push(sphere(1.5, 0, vy + 0.9, -4, '#f1c40f'), cone(0.3, 1.2, 0, vy + 2.1, -4, '#f1c40f'));
  // mandapam (pillared hall)
  for (let i = -1; i <= 1; i++) for (let j = 0; j < 3; j++) S.push(cyl(0.25, 0.25, 3, i * 2.6, 0.6, 1 + j * 2.2, '#e9dcc4', 8));
  S.push(box(7, 0.5, 7.4, 0, 3.6, 3.2, '#d9a441'));
  S.push(cyl(0.18, 0.22, 7, 0, 0.6, 8.2, '#f1c40f', 8));
  T.push([-8, -8, 1], [8, -8, 1.1], [-8.5, 7.5, 0.8]);
  return top;
}

function bPark(r, S, T, water) {
  S.push(box(23.4, 0.45, 23.4, 0, 0, 0, '#5c9b45'));
  S.push(box(23.4, 0.5, 2.2, 0, 0, 0, '#d8cfb8'), box(2.2, 0.5, 23.4, 0, 0, 0, '#d8cfb8'));
  S.push(cyl(3.6, 3.6, 0.7, 0, 0, 0, '#bfb6a3', 20), cyl(0.5, 0.7, 1.8, 0, 0.7, 0, '#d0c8b8', 10));
  water.push({ r: 3.1, x: 0, y: 0.72, z: 0 });
  for (const [x, z] of [[-6, -3], [6, 3], [-3, 6], [3, -6]]) S.push(box(2, 0.5, 0.6, x, 0.5, z, '#8b5a2b'));
  S.push(box(1.2, 2.2, 3, 7.5, 0.45, -7.5, '#e53935'), box(1, 0.2, 4, 7.5, 1.4, -5.3, '#fdd835', -0.5));
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2 + r() * 0.3, d = 7 + r() * 3.5;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) < 1.8 || Math.abs(z) < 1.8) continue;
    T.push([x, z, 0.8 + r() * 0.6]);
  }
  return 9;
}

function bLake(r, S, T, water) {
  S.push(box(23.4, 0.3, 23.4, 0, 0, 0, '#d9c79a'));
  water.push({ r: 10.4, x: 0, y: 0.33, z: 0, sx: 1, sz: 0.85 });
  S.push(box(2.6, 0.5, 1.2, -3, 0.3, 2, '#e65100'), box(2.2, 0.5, 1, 4, 0.3, -3, '#1565c0'));
  S.push(box(1.4, 0.8, 9, 9.2, 0.2, 0, '#8d6e63'));
  for (const [x, z] of [[-10, -10], [10, 10], [-10, 9], [9, -10]]) T.push([x, z, 1]);
  return 4;
}

function bMarket(r, S, T) {
  S.push(box(23.4, 0.4, 23.4, 0, 0, 0, '#c9b99c'));
  S.push(box(2.6, 11, 2.6, 0, 0.4, 0, '#e8dcc5'), box(3.2, 0.4, 3.2, 0, 11.4, 0, '#b5523b'), cone(2.2, 3, 0, 11.8, 0, '#b5523b', 4));
  for (const s of [1, -1]) S.push(cyl(1, 1, 0.1, 0, 9, s * 1.32, '#ffffff', 16));
  const cols = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa', '#00acc1', '#d81b60'];
  let k = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    if (!i && !j) continue;
    const x = i * 7.2, z = j * 7.2;
    S.push(box(4, 1, 2.4, x, 0.4, z, '#8d6e63'));
    for (const [px, pz] of [[-1.9, -1.3], [1.9, -1.3], [-1.9, 1.3], [1.9, 1.3]]) S.push(box(0.15, 2.6, 0.15, x + px, 0.4, z + pz, '#5d4037'));
    S.push(box(4.6, 0.15, 3.2, x, 3, z, cols[k++ % cols.length], 0.12));
    S.push(box(3.4, 0.4, 1.8, x, 1.4, z, ['#ff7043', '#ffca28', '#9ccc65', '#ef5350'][k % 4]));
  }
  return 15;
}

function bPlaza(count, S, W, r) {
  S.push(cyl(11.8, 12, 0.5, 0, 0, 0, '#d6d0c4', 32), cyl(8.6, 8.6, 0.55, 0, 0, 0, '#5c9b45', 32), cyl(7.6, 7.6, 0.6, 0, 0, 0, '#cfc7b8', 32));
  const H = 26 + Math.min(70, count * 0.18), fl = Math.floor(H / FH);
  W.push(wallBox(8.4, fl * FH, 8.4, 0, 0.6, 0, '#86aed6', fl, r));
  let y = fl * FH + 0.6;
  S.push(box(9.4, 0.6, 9.4, 0, y, 0, '#eceff1'), box(6, 3, 6, 0, y + 0.6, 0, '#d62976'), box(6.6, 0.4, 6.6, 0, y + 3.6, 0, '#eceff1'));
  S.push(cyl(0.15, 0.4, 9, 0, y + 4, 0, '#cfd8dc', 8));
  for (const [x, z] of [[-9.5, -9.5], [9.5, 9.5], [9.5, -9.5], [-9.5, 9.5]]) S.push(cyl(0.12, 0.12, 8, x, 0.5, z, '#eceff1', 6), box(2.4, 1.4, 0.06, x + 1.2, 6.8, z, ['#feda75', '#fa7e1e', '#d62976', '#4f5bd5'][(x > 0) + 2 * (z > 0)]));
  return { top: y + 13, H };
}

/* ---------------------------------------------------------------- label sprites */
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function makeLabel(text, kind) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 40, font = `700 ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.font = font;
  const pad = kind === 'user' ? 64 : 34, w = Math.ceil(g.measureText(text).width) + pad + 26, h = 68;
  c.width = w; c.height = h + 14;
  g.font = font;
  roundRect(g, 3, 3, w - 6, h - 6, 30);
  g.fillStyle = kind === 'owner' ? 'rgba(214,41,118,.92)' : kind === 'user' ? 'rgba(12,16,30,.82)' : 'rgba(255,255,255,.9)'; g.fill();
  g.lineWidth = 3; g.strokeStyle = kind === 'user' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.12)'; g.stroke();
  g.beginPath(); g.moveTo(w / 2 - 9, h - 4); g.lineTo(w / 2 + 9, h - 4); g.lineTo(w / 2, h + 10); g.closePath(); g.fill();
  if (kind === 'user') {
    const gr = g.createLinearGradient(16, 50, 52, 14);
    gr.addColorStop(0, '#feda75'); gr.addColorStop(0.35, '#fa7e1e'); gr.addColorStop(0.65, '#d62976'); gr.addColorStop(1, '#4f5bd5');
    g.fillStyle = gr; g.beginPath(); g.arc(34, h / 2, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(34, h / 2, 6.5, 0, Math.PI * 2); g.lineWidth = 3.5; g.strokeStyle = '#fff'; g.stroke();
  }
  g.fillStyle = kind === 'landmark' ? '#1d2433' : '#fff'; g.textBaseline = 'middle';
  g.fillText(text, kind === 'user' ? 60 : 30, h / 2 + 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true, fog: false });
  const s = new THREE.Sprite(m); s.center.set(0.5, 0); s.renderOrder = 10;
  s.userData.aspect = c.width / c.height;
  return s;
}

/* ---------------------------------------------------------------- moods */
const MOODS = {
  day:   { top: '#3d7fd6', bot: '#cfe6ff', fog: '#cfe2f5', fogD: 0.0011, sun: '#fff1d6', sunI: 2.7, el: 0.95, az: 0.7, hS: '#cfe7ff', hG: '#6b7f4a', hI: 0.75, win: 0, lamp: 0, stars: 0, exp: 1.0, cloud: '#ffffff', disk: '#fff6d5' },
  dusk:  { top: '#26355f', bot: '#ff9a5a', fog: '#e8a27c', fogD: 0.0014, sun: '#ffb070', sunI: 1.7, el: 0.18, az: 2.3, hS: '#ffb38a', hG: '#3d3550', hI: 0.55, win: 0.75, lamp: 0.7, stars: 0.25, exp: 1.0, cloud: '#ffc8a8', disk: '#ffb36b' },
  night: { top: '#030713', bot: '#17264a', fog: '#121c36', fogD: 0.0016, sun: '#a8c4ff', sunI: 0.55, el: 0.8, az: 4.0, hS: '#3a4f85', hG: '#0c0f18', hI: 0.32, win: 1.5, lamp: 1.6, stars: 1, exp: 1.05, cloud: '#2d3a5c', disk: '#e8f0ff' },
};
const RAINY = (m) => {
  const o = { ...m }, grey = new THREE.Color('#8a949e');
  for (const k of ['top', 'bot', 'fog', 'hS', 'cloud']) o[k] = '#' + new THREE.Color(m[k]).lerp(grey, m === MOODS.night ? 0.25 : 0.65).getHexString();
  o.fogD = m.fogD * 2.6; o.sunI = m.sunI * 0.35; o.hI = m.hI * 0.9; o.win = Math.max(m.win, 0.35); o.lamp = Math.max(m.lamp, 0.4); o.stars = 0; o.disk = o.fog;
  return o;
};

/* ================================================================ MAIN */
async function main() {
  progress(0.05, 'Reading followers.json…');
  const data = await loadData();
  const people = data.followers, owner = data.owner;
  progress(0.15, `Building ${people.length} homes…`);
  await tick();

  // ---------- extent: city grows with followers
  let R = 1;
  for (const f of people) R = Math.max(R, L.ring(...L.plotBlock(f.x, f.z)));
  const E = (R + 0.5) * L.PITCH, half = E + L.ROAD / 2;

  // ---------- renderer / scene / camera
  const canvas = $('#scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE || devicePixelRatio < 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.6 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#cfe2f5', 0.0011);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 7000);

  const controls = new MapControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: 0.08, screenSpacePanning: false, zoomToCursor: true,
    minDistance: 14, maxDistance: Math.max(420, E * 3.2), maxPolarAngle: Math.PI * 0.46, minPolarAngle: 0.12,
    panSpeed: 1.1, rotateSpeed: 0.6, zoomSpeed: 1.2, autoRotateSpeed: 0.5,
  });
  controls.listenToKeyEvents(window);
  controls.keyPanSpeed = 25;

  // ---------- lights
  const hemi = new THREE.HemisphereLight('#cfe7ff', '#6b7f4a', 0.75);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.7);
  sun.castShadow = true;
  const sm = MOBILE ? 1024 : 2048, sr = MOBILE ? 110 : 160;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr, near: 10, far: 900 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  scene.add(hemi, sun, sun.target);

  // ---------- sky dome, stars, sun disk
  const skyU = { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.08,0.0,1.0); gl_FragColor = vec4(mix(bot, top, pow(h,0.7)),1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }));
  sky.renderOrder = -1; scene.add(sky);

  const starG = new THREE.BufferGeometry(), sp = [], srn = L.rng(11);
  for (let i = 0; i < 1800; i++) {
    const a = srn() * Math.PI * 2, y = 0.08 + srn() * 0.92, rr = Math.sqrt(1 - y * y);
    sp.push(Math.cos(a) * rr * 4500, y * 4500, Math.sin(a) * rr * 4500);
  }
  starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starM = new THREE.PointsMaterial({ color: '#ffffff', size: 2.1, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  scene.add(new THREE.Points(starG, starM));

  const glowTex = glowTexture();
  const disk = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fff6d5', fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  disk.scale.set(420, 420, 1); scene.add(disk);

  // ---------- materials
  const wt = windowTextures();
  const wallMat = new THREE.MeshStandardMaterial({ map: wt.map, emissiveMap: wt.emissive, emissive: '#ffffff', emissiveIntensity: 0, vertexColors: true, roughness: 0.85 });
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 });
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2f86b3', roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.88 });

  // ---------- ground
  const ground = new THREE.Mesh(new THREE.CircleGeometry(6000, 64), new THREE.MeshStandardMaterial({ map: noiseTexture('#6d9a4b', 0.22, 128, 260), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; scene.add(ground);
  const asphaltMat = new THREE.MeshStandardMaterial({ map: noiseTexture('#3c4047', 0.18, 128, Math.round(half / 6)), roughness: 0.92, metalness: 0 });
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), asphaltMat);
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = 0.02; asphalt.receiveShadow = true; scene.add(asphalt);

  // ---------- build city geometry
  const WG = [], SG = [], waters = [], trees = { round: [], pine: [], palm: [] }, labels = [], picks = [];
  const occupied = new Map(people.map((f) => [f.x + ',' + f.z, f]));
  const place = (geos, ry, x, z) => { for (const g of geos) { if (ry) g.rotateY(ry); g.translate(x, 0, z); } return geos; };
  const placeTrees = (T, ry, x, z, kind = 'round') => {
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const [lx, lz, sc] of T) trees[kind].push([x + lx * c + lz * s, z - lx * s + lz * c, sc]);
  };
  const lampPos = [];

  // blocks
  for (let bx = -R; bx <= R; bx++) for (let bz = -R; bz <= R; bz++) {
    const cx = bx * L.PITCH, cz = bz * L.PITCH, lm = L.landmarkAt(bx, bz), r = L.rng(L.hash('b' + bx + ':' + bz));
    SG.push(box(25.6, 0.3, 25.6, cx, 0, cz, '#bdb6a8'));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lampPos.push([cx + sx * 13.4, cz + sz * 13.4]);
    if (lm) {
      const S = [], W = [], T = [], wl = [], ry = [0, Math.PI / 2, Math.PI, -Math.PI / 2][L.hash('o' + bx + bz) % 4];
      let top;
      if (lm === 'plaza') { const p = bPlaza(people.length, S, W, r); top = p.top; }
      else if (lm === 'temple') top = bTemple(r, S, T);
      else if (lm === 'park') top = bPark(r, S, T, wl);
      else if (lm === 'lake') top = bLake(r, S, T, wl);
      else top = bMarket(r, S, T);
      SG.push(...place(S, lm === 'plaza' ? 0 : ry, cx, cz)); WG.push(...place(W, 0, cx, cz));
      placeTrees(T, ry, cx, cz, lm === 'temple' ? 'palm' : 'round');
      waters.push(...wl.map((w) => ({ ...w, x: cx + w.x, z: cz + w.z })));
      const name = lm === 'plaza' ? '@' + owner : `${INFO[lm][0]} ${INFO[lm][1]}`;
      const entry = { kind: lm === 'plaza' ? 'owner' : 'landmark', type: lm, id: lm === 'plaza' ? owner : null, name, pos: new THREE.Vector3(cx, top, cz), w: 22, d: 22, top };
      picks.push(entry); labels.push(entry);
      continue;
    }
    for (const [px, pz] of L.blockPlots(bx, bz)) {
      const wp = L.plotToWorld(px, pz), f = occupied.get(px + ',' + pz), pr = L.rng(L.hash((f ? f.id : 'e') + px + ':' + pz));
      SG.push(box(11.6, 0.42, 11.6, wp.x, 0, wp.z, f ? '#6aa64f' : '#79a85a'));
      const subx = px - bx * 2, subz = pz - bz * 2;
      const faceX = L.hash('f' + px + ':' + pz) & 1;
      const ry = faceX ? (subx ? Math.PI / 2 : -Math.PI / 2) : (subz ? 0 : Math.PI);
      if (f) {
        const W = [], S = [], T = [];
        const top = builders[f.type](f, pr, W, S, T) + 0.42;
        for (const g of [...W, ...S]) g.translate(0, 0.42, 0);
        WG.push(...place(W, ry, wp.x, wp.z)); SG.push(...place(S, ry, wp.x, wp.z));
        placeTrees(T, ry, wp.x, wp.z, f.type === 'cottage' ? 'palm' : 'round');
        const entry = { kind: 'user', type: f.type, id: f.id, f, name: '@' + f.id, pos: new THREE.Vector3(wp.x, top, wp.z), w: 10, d: 10, top };
        f.entry = entry; picks.push(entry); labels.push(entry);
      } else {
        const S = [box(0.15, 2, 0.15, 0, 0.42, 4.6, '#6d4c41'), box(2.6, 1.3, 0.12, 0, 1.6, 4.6, '#fff8e1')];
        SG.push(...place(S, ry, wp.x, wp.z));
        placeTrees([[-2.5, -2, 0.7 + pr() * 0.5], [2.8, -3, 0.6 + pr() * 0.5]], ry, wp.x, wp.z);
        picks.push({ kind: 'empty', type: 'empty', name: 'Empty plot', plot: [px, pz], pos: new THREE.Vector3(wp.x, 3, wp.z), w: 10, d: 10, top: 3 });
      }
    }
  }
  progress(0.45, 'Painting roads…');
  await tick();

  const merge = (geos, mat) => {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = m.receiveShadow = true; scene.add(m); geos.forEach((g) => g.dispose()); return m;
  };
  merge(SG, solidMat); merge(WG, wallMat);

  // water
  for (const w of waters) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(w.r, 40), waterMat);
    m.rotation.x = -Math.PI / 2; m.scale.set(w.sx || 1, w.sz || 1, 1); m.position.set(w.x, w.y, w.z); m.receiveShadow = true; scene.add(m);
  }

  // road markings
  const lines = [];
  for (let k = -R - 1; k <= R; k++) lines.push((k + 0.5) * L.PITCH);
  const dashes = [];
  for (const c of lines) for (let t = -E; t < E; t += 5) {
    const near = lines.some((o) => Math.abs(t + 1.2 - o) < 6);
    if (!near) { dashes.push([t + 1.2, c, 0]); dashes.push([c, t + 1.2, 1]); }
  }
  const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.04, 0.28), new THREE.MeshStandardMaterial({ color: '#f2efe4', roughness: 0.7 }), dashes.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  dashes.forEach(([x, z, rot], i) => { Q.setFromAxisAngle(UP, rot ? Math.PI / 2 : 0); M.compose(V.set(x, 0.06, z), Q, SC); dashMesh.setMatrixAt(i, M); });
  scene.add(dashMesh);

  // street lamps + light pools
  const n = lampPos.length;
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 6, 6).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: '#4b5563', roughness: 0.6 }), n);
  const lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0 });
  const headMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.3, 0.9).translate(0, 6.1, 0), lampMat, n);
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffc46b', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const poolMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(11, 11).rotateX(-Math.PI / 2), poolMat, n);
  lampPos.forEach(([x, z], i) => { M.makeTranslation(x, 0, z); poleMesh.setMatrixAt(i, M); headMesh.setMatrixAt(i, M); M.makeTranslation(x, 0.12, z); poolMesh.setMatrixAt(i, M); });
  poleMesh.castShadow = true; poolMesh.renderOrder = 2;
  scene.add(poleMesh, headMesh, poolMesh);

  // ---------- countryside, wind turbines & mountains
  progress(0.6, 'Raising mountains…');
  await tick();
  const cr = L.rng(42), RM = half + 260;
  const farm = [], farmCols = ['#8fbf4d', '#a6c95a', '#d4c26a', '#7aa84a', '#c9b458', '#9cc56a'];
  for (let i = 0; i < 160; i++) {
    const a = cr() * Math.PI * 2, d = half * 1.15 + 30 + cr() * (RM - half * 1.15 - 90);
    const x = Math.cos(a) * d, z = Math.sin(a) * d, w = 18 + cr() * 26, dd = 14 + cr() * 22;
    if (Math.max(Math.abs(x), Math.abs(z)) < half + 20) continue;
    farm.push(box(w, 0.12, dd, x, 0, z, farmCols[Math.floor(cr() * farmCols.length)], 0, cr() * Math.PI));
    for (let k = 0; k < 2; k++) trees.palm.push([x + (cr() - 0.5) * w, z + (cr() - 0.5) * dd, 0.9 + cr() * 0.5]);
  }
  for (let i = 0; i < 220; i++) {
    const a = cr() * Math.PI * 2, d = half + 25 + cr() * (RM - half - 40), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.max(Math.abs(x), Math.abs(z)) > half + 14) trees[cr() < 0.55 ? 'palm' : 'round'].push([x, z, 0.8 + cr() * 0.8]);
  }
  const fm = new THREE.Mesh(mergeGeometries(farm), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  fm.receiveShadow = true; scene.add(fm);

  const turbines = [], bladeMat = new THREE.MeshStandardMaterial({ color: '#f5f7fa', roughness: 0.5 });
  const towerGeo = new THREE.CylinderGeometry(0.5, 1, 34, 10).translate(0, 17, 0), bladeGeo = new THREE.BoxGeometry(0.8, 14, 0.25).translate(0, 7, 0);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, d = RM - 110 + cr() * 30;
    const g = new THREE.Group(); g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); g.rotation.y = -a + Math.PI / 2;
    const t = new THREE.Mesh(towerGeo, bladeMat); t.castShadow = true;
    const nac = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 4), bladeMat); nac.position.set(0, 34, 0.5);
    const hub = new THREE.Group(); hub.position.set(0, 34, 2.6);
    for (let b = 0; b < 3; b++) { const bl = new THREE.Mesh(bladeGeo, bladeMat); bl.rotation.z = b * Math.PI * 2 / 3; hub.add(bl); }
    g.add(t, nac, hub); scene.add(g); turbines.push({ hub, speed: 0.6 + cr() * 0.5 });
  }

  const mGeos = [], mc = { low: new THREE.Color('#4f7f3a'), mid: new THREE.Color('#3b6a33'), rock: new THREE.Color('#7d7468'), peak: new THREE.Color('#ece8de') };
  const mountain = (x, z, rad, hgt, seed, rocky) => {
    const g = new THREE.ConeGeometry(rad, hgt, 10, 5), p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      let vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      if (vy < hgt / 2 - 0.01) {
        const k = L.hash(seed + ':' + vx.toFixed(2) + ':' + vy.toFixed(2) + ':' + vz.toFixed(2)) / 4294967296, k2 = (L.hash('y' + k) / 4294967296);
        vx *= 0.8 + k * 0.4; vz *= 0.8 + k * 0.4; vy += (k2 - 0.5) * hgt * 0.1;
      }
      p.setXYZ(i, vx, vy, vz);
      const t = (vy + hgt / 2) / hgt;
      if (t < 0.4) c.copy(mc.low); else if (t < 0.66) c.copy(mc.mid); else if (t < 0.86 || !rocky) c.copy(rocky ? mc.rock : mc.mid); else c.copy(mc.peak);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv');
    g.translate(x, hgt / 2 - 3, z); g.computeVertexNormals(); mGeos.push(g);
  };
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + cr() * 0.08, d = RM + cr() * 160;
    const rad = 80 + cr() * 110, hgt = 70 + cr() * 160;
    mountain(Math.cos(a) * d, Math.sin(a) * d, rad, hgt, 'm' + i, hgt > 150);
    for (let k = 0; k < 6; k++) { const aa = a + (cr() - 0.5) * 0.12, dd = d - rad * (0.75 + cr() * 0.35); trees.pine.push([Math.cos(aa) * dd, Math.sin(aa) * dd, 1.3 + cr()]); }
  }
  for (let i = 0; i < 26; i++) {
    const a = cr() * Math.PI * 2, d = RM - 150 + cr() * 90;
    mountain(Math.cos(a) * d, Math.sin(a) * d, 30 + cr() * 35, 18 + cr() * 30, 'h' + i, false);
  }
  const mm = new THREE.Mesh(mergeGeometries(mGeos), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  mm.receiveShadow = true; scene.add(mm);

  // ---------- instanced trees
  const treeMats = { trunk: new THREE.MeshStandardMaterial({ color: '#6d4c33', roughness: 1 }), leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }) };
  const TREE = {
    round: { trunk: new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6).translate(0, 1.2, 0), crown: new THREE.IcosahedronGeometry(1.9, 0).translate(0, 3.6, 0), cols: ['#3f8f3a', '#4c9a3f', '#2f7d32', '#5aa245'] },
    pine: { trunk: new THREE.CylinderGeometry(0.3, 0.4, 3, 6).translate(0, 1.5, 0), crown: new THREE.ConeGeometry(2.6, 8, 7).translate(0, 6.5, 0), cols: ['#2e5d34', '#335f2c', '#284f2a'] },
    palm: { trunk: new THREE.CylinderGeometry(0.16, 0.26, 7, 6).translate(0, 3.5, 0), crown: new THREE.ConeGeometry(2.4, 1.2, 7).rotateX(Math.PI).translate(0, 7.4, 0), cols: ['#3f8a2e', '#4f9a36', '#2f7a28'] },
  };
  const tCol = new THREE.Color();
  for (const [kind, list] of Object.entries(trees)) {
    if (!list.length) continue;
    const T = TREE[kind], a = new THREE.InstancedMesh(T.trunk, treeMats.trunk, list.length), b = new THREE.InstancedMesh(T.crown, treeMats.leaf, list.length);
    list.forEach(([x, z, s], i) => {
      Q.setFromAxisAngle(UP, (x * 7 + z * 3) % 6.28); M.compose(V.set(x, 0.3, z), Q, SC.set(s, s * (0.9 + ((i * 37) % 10) / 30), s));
      a.setMatrixAt(i, M); b.setMatrixAt(i, M); b.setColorAt(i, tCol.set(T.cols[i % T.cols.length]));
    });
    a.castShadow = b.castShadow = true; b.receiveShadow = true; scene.add(a, b);
  }
  SC.set(1, 1, 1);

  // ---------- cars (incl. yellow autos)
  progress(0.75, 'Starting traffic…');
  const carGeo = mergeGeometries([box(3.6, 1.0, 1.8, 0, 0.35, 0, '#ffffff'), box(2, 0.8, 1.6, -0.2, 1.35, 0, '#3a4652'), box(0.4, 0.35, 1.9, 1.8, 0.4, 0, '#222')]);
  const nCars = Math.min(MOBILE ? 40 : 80, lines.length * 6);
  const carMesh = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }), nCars);
  const headMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3c0', emissiveIntensity: 0 });
  const lightMesh = new THREE.InstancedMesh(mergeGeometries([box(0.1, 0.3, 0.4, 1.82, 0.6, 0.55, '#fff'), box(0.1, 0.3, 0.4, 1.82, 0.6, -0.55, '#fff')]), headMat, nCars);
  const carCols = ['#f4c430', '#e53935', '#ffffff', '#1e88e5', '#212121', '#9e9e9e', '#43a047', '#f4c430', '#ff7043'];
  const cars = [];
  for (let i = 0; i < nCars; i++) {
    const axis = i % 2, line = lines[Math.floor(cr() * lines.length)], dir = cr() < 0.5 ? 1 : -1;
    cars.push({ axis, line: line + dir * 2.1 * (axis ? -1 : 1), dir, t: (cr() * 2 - 1) * E, v: 9 + cr() * 9 });
    carMesh.setColorAt(i, tCol.set(carCols[i % carCols.length]));
  }
  carMesh.castShadow = true; scene.add(carMesh, lightMesh);

  // ---------- clouds
  const clouds = [], cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
  for (let i = 0; i < (MOBILE ? 10 : 18); i++) {
    const parts = [];
    for (let k = 0; k < 5; k++) { const g = new THREE.IcosahedronGeometry(8 + cr() * 8, 1); g.translate((k - 2) * 9 + cr() * 4, cr() * 4, cr() * 8); parts.push(g); }
    const m = new THREE.Mesh(mergeGeometries(parts), cloudMat);
    m.position.set((cr() * 2 - 1) * RM, 120 + cr() * 70, (cr() * 2 - 1) * RM); m.scale.y = 0.55;
    scene.add(m); clouds.push({ m, v: 3 + cr() * 4 });
  }

  // ---------- rain
  const DROPS = MOBILE ? 2600 : 6000, rainBox = 260, rainH = 150;
  const rainPos = new Float32Array(DROPS * 6), rainG = new THREE.BufferGeometry();
  for (let i = 0; i < DROPS; i++) {
    const x = (cr() - 0.5) * rainBox, y = cr() * rainH, z = (cr() - 0.5) * rainBox;
    rainPos.set([x, y, z, x + 0.25, y - 2.2, z + 0.2], i * 6);
  }
  rainG.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainM = new THREE.LineBasicMaterial({ color: '#b9cde0', transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(rainG, rainM); rain.frustumCulled = false; rain.visible = false; scene.add(rain);

  // ---------- selection marker
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ff3d8b', transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 160, 16, 1, true).translate(0, 80, 0), beamMat);
  const ringM = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.4, 48).rotateX(-Math.PI / 2), beamMat);
  ringM.position.y = 0.7;
  const pin = new THREE.Group();
  const pinMat = new THREE.MeshStandardMaterial({ color: '#ff3d8b', emissive: '#d62976', emissiveIntensity: 0.6 });
  pin.add(new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 16).rotateX(Math.PI), pinMat), new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12).translate(0, 1.4, 0), pinMat));
  const marker = new THREE.Group(); marker.add(beam, ringM, pin); marker.visible = false; scene.add(marker);

  // ---------- labels
  progress(0.85, 'Writing name tags…');
  await tick();
  for (const e of labels) {
    e.sprite = makeLabel(e.name, e.kind === 'user' ? 'user' : e.kind === 'owner' ? 'owner' : 'landmark');
    e.sprite.position.copy(e.pos).add(V.set(0, 1.2, 0));
    e.sprite.material.opacity = 0;
    scene.add(e.sprite);
  }

  // ---------- picking
  const pickMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), picks.length);
  picks.forEach((p, i) => { M.compose(V.set(p.pos.x, p.top / 2, p.pos.z), Q.identity(), SC.set(p.w, p.top, p.d)); pickMesh.setMatrixAt(i, M); });
  SC.set(1, 1, 1);
  pickMesh.visible = false; pickMesh.computeBoundingSphere(); scene.add(pickMesh);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pickAt = (cx, cy) => {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(pickMesh)[0]; return hit ? picks[hit.instanceId] : null;
  };

  /* ================================================================ UI */
  const ui = { selected: null, labelsOn: true, mood: 'day', rain: false, auto: true, tour: false };
  $('#ownerName').textContent = '@' + owner;
  $('#count').textContent = people.length;
  $('#updated').textContent = data.updated ? 'updated ' + new Date(data.updated + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const fl = $('#followLink'); fl.textContent = '@' + owner; fl.href = 'https://instagram.com/' + owner;
  document.title = `@${owner}'s FollowVerse — ${people.length} followers in 3D`;

  const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2200); };
  const fmtDate = (s) => s ? new Date(s + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const initials = (id) => id.replace(/[^a-z0-9]/g, '').slice(0, 2).toUpperCase() || '@';

  // ----- search list
  const list = $('#list'), q = $('#q');
  let filter = 'all';
  const renderList = () => {
    const s = L.normalizeId(q.value);
    let items = people.filter((f) => !s || f.id.includes(s));
    if (filter === 'home') items = items.filter((f) => !['shop', 'office'].includes(f.type));
    if (filter === 'biz') items = items.filter((f) => ['shop', 'office'].includes(f.type));
    if (filter === 'new') items = [...items].sort((a, b) => (b.since || '').localeCompare(a.since || '') || b.n - a.n);
    if (s) items.sort((a, b) => (b.id.startsWith(s) - a.id.startsWith(s)) || a.id.length - b.id.length);
    $('#meta').textContent = s ? `${items.length} match${items.length === 1 ? '' : 'es'} for “${s}”` : `${items.length} residents · tap to fly there`;
    const frag = document.createDocumentFragment();
    for (const f of items.slice(0, 250)) {
      const li = document.createElement('li');
      li.className = ui.selected === f.entry ? 'on' : '';
      li.innerHTML = `<span class="av" style="--c:${f.color}">${initials(f.id)}</span><span class="nm"><b></b><small>${INFO[f.type][0]} ${INFO[f.type][1]} · #${f.n}</small></span><span class="go">›</span>`;
      li.querySelector('b').textContent = '@' + f.id;
      li.onclick = () => { select(f.entry); if (MOBILE) sheet(false); };
      frag.appendChild(li);
    }
    if (!items.length) {
      const li = document.createElement('li'); li.className = 'empty';
      li.innerHTML = `Not here yet? Follow <a href="https://instagram.com/${owner}" target="_blank" rel="noopener">@${owner}</a> — your plot is waiting 🏗️`;
      frag.appendChild(li);
    }
    list.replaceChildren(frag);
  };
  q.addEventListener('input', renderList);
  q.addEventListener('focus', () => MOBILE && sheet(true));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const li = list.querySelector('li:not(.empty)'); li?.click(); q.blur(); } });
  $('#qclear').onclick = () => { q.value = ''; renderList(); q.focus(); };
  $('#chips').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    filter = b.dataset.f; $('#chips').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); renderList();
  };
  const panel = $('#panel');
  const sheet = (open) => panel.classList.toggle('open', open ?? !panel.classList.contains('open'));
  $('#handle').onclick = () => sheet();

  // ----- selection card
  const card = $('#card');
  const select = (e, fly = true) => {
    ui.selected = e;
    if (!e) { card.hidden = true; marker.visible = false; history.replaceState(null, '', location.pathname + location.search); renderList(); return; }
    marker.visible = true; marker.position.set(e.pos.x, 0, e.pos.z);
    pin.position.y = e.top + 4;
    beam.visible = e.kind === 'user';
    ringM.scale.setScalar(e.kind === 'user' ? 1 : 2);
    const [icon, tname] = INFO[e.type];
    let html;
    if (e.kind === 'user') {
      const f = e.f;
      html = `<div class="ch"><span class="av big" style="--c:${f.color}">${initials(f.id)}</span><div><h3></h3><p>${icon} ${tname}${f.floors > 1 ? ` · ${f.floors} floors` : ''}</p></div></div>
        <div class="kv"><span>Resident</span><b>#${f.n} of ${people.length}</b><span>Plot</span><b>(${f.x}, ${f.z})</b><span>Since</span><b>${fmtDate(f.since)}</b></div>
        ${f.note ? '<p class="note"></p>' : ''}
        <div class="acts"><a class="btn ig" target="_blank" rel="noopener" href="https://instagram.com/${encodeURIComponent(f.id)}">Open Instagram ↗</a><button class="btn" data-act="share">🔗 Share</button><button class="btn" data-act="shot">📸</button></div>`;
      history.replaceState(null, '', '#@' + f.id);
    } else if (e.kind === 'owner') {
      html = `<div class="ch"><span class="av big" style="--c:#d62976">★</span><div><h3>@${owner}</h3><p>🗼 HQ Tower · grows with every follower</p></div></div>
        <div class="kv"><span>Followers</span><b>${people.length}</b><span>Tower height</span><b>${Math.round(e.top)} m</b></div>
        <div class="acts"><a class="btn ig" target="_blank" rel="noopener" href="https://instagram.com/${owner}">Follow @${owner} ↗</a><button class="btn" data-act="shot">📸</button></div>`;
    } else if (e.kind === 'empty') {
      html = `<div class="ch"><span class="av big" style="--c:#9ccc65">🪧</span><div><h3>Plot for a future follower</h3><p>Plot (${e.plot[0]}, ${e.plot[1]})</p></div></div>
        <p class="note">Follow @${owner} and a home gets built here for you.</p>
        <div class="acts"><a class="btn ig" target="_blank" rel="noopener" href="https://instagram.com/${owner}">Follow @${owner} ↗</a></div>`;
    } else {
      html = `<div class="ch"><span class="av big" style="--c:#ffd166">${icon}</span><div><h3>${tname}</h3><p>A landmark of @${owner}'s city</p></div></div>`;
    }
    card.querySelector('.body').innerHTML = html;
    if (e.kind === 'user') { card.querySelector('h3').textContent = '@' + e.f.id; const nt = card.querySelector('.note'); if (nt) nt.textContent = e.f.note; }
    card.hidden = false;
    if (fly) flyTo(e.pos, e.kind === 'user' ? 62 + e.top * 1.2 : 110 + e.top);
    renderList();
  };
  card.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'share') {
      const url = location.href;
      if (navigator.share) navigator.share({ title: `My home in @${owner}'s FollowVerse`, url }).catch(() => {});
      else navigator.clipboard?.writeText(url).then(() => toast('Link copied ✓'));
    }
    if (a.dataset.act === 'shot') screenshot();
  });
  $('#cardClose').onclick = () => select(null);

  // ----- camera fly
  let anim = null;
  const flyTo = (target, dist = 70, dur = 1500) => {
    const dir = camera.position.clone().sub(controls.target); dir.y = 0;
    if (dir.lengthSq() < 1) dir.set(1, 0, 1);
    dir.normalize();
    const endT = new THREE.Vector3(target.x, Math.min(target.y * 0.5, 20), target.z);
    const endP = endT.clone().addScaledVector(dir, dist * 0.78); endP.y = endT.y + dist * 0.72;
    anim = { t0: performance.now(), dur, sT: controls.target.clone(), sP: camera.position.clone(), endT, endP };
  };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ----- pointer interactions
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
    if (moved < 7 && dt < 600) { const p = pickAt(e.clientX, e.clientY); if (p) select(p); }
  });
  const tip = $('#tip');
  let hoverT = 0;
  if (!MOBILE) canvas.addEventListener('pointermove', (e) => {
    const now = performance.now(); if (now - hoverT < 60 || e.buttons) return; hoverT = now;
    const p = pickAt(e.clientX, e.clientY);
    canvas.style.cursor = p ? 'pointer' : '';
    if (p) { tip.textContent = p.kind === 'user' ? `@${p.id} · ${INFO[p.type][1]}` : p.name; tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`; tip.classList.add('show'); }
    else tip.classList.remove('show');
  });
  canvas.addEventListener('pointerleave', () => tip.classList.remove('show'));
  controls.addEventListener('start', () => { anim = null; if (ui.tour) setTour(false); $('#hint').classList.add('gone'); });

  // ----- moods
  const cur = {}, target = {};
  const C = (h) => new THREE.Color(h);
  const setTargets = () => {
    let mood = ui.mood;
    if (ui.auto) { const h = new Date().getHours() + new Date().getMinutes() / 60; mood = h >= 6.5 && h < 17.3 ? 'day' : (h >= 17.3 && h < 19) || (h >= 5.5 && h < 6.5) ? 'dusk' : 'night'; ui.autoMood = mood; }
    const m = ui.rain ? RAINY(MOODS[mood]) : MOODS[mood];
    for (const [k, v] of Object.entries(m)) target[k] = typeof v === 'string' ? C(v) : v;
    target.rainAmt = ui.rain ? 1 : 0;
    if (!cur.top) for (const [k, v] of Object.entries(target)) cur[k] = v.clone ? v.clone() : v;
    document.querySelectorAll('[data-mood]').forEach((b) => b.classList.toggle('on', !ui.auto && b.dataset.mood === ui.mood));
    $('#btnAuto').classList.toggle('on', ui.auto);
    $('#btnRain').classList.toggle('on', ui.rain);
    document.body.dataset.mood = mood;
  };
  document.querySelectorAll('[data-mood]').forEach((b) => (b.onclick = () => { ui.mood = b.dataset.mood; ui.auto = false; setTargets(); toast(`${b.title} mode`); }));
  $('#btnAuto').onclick = () => { ui.auto = !ui.auto; setTargets(); toast(ui.auto ? 'Auto: follows your clock' : 'Auto off'); };
  $('#btnRain').onclick = () => { ui.rain = !ui.rain; setTargets(); toast(ui.rain ? 'It’s raining 🌧️' : 'Rain stopped'); };
  $('#btnLabels').onclick = () => { ui.labelsOn = !ui.labelsOn; $('#btnLabels').classList.toggle('on', ui.labelsOn); };
  $('#btnMap').onclick = () => document.body.classList.toggle('nomap');
  $('#btnFull').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
  $('#btnShot').onclick = () => screenshot();
  const setTour = (on) => {
    ui.tour = on; controls.autoRotate = on; $('#btnTour').classList.toggle('on', on);
    clearInterval(setTour.h);
    if (on) { const hop = () => select(people[Math.floor(Math.random() * people.length)].entry); hop(); setTour.h = setInterval(hop, 7000); toast('Drone tour 🚁 — touch to stop'); }
  };
  $('#btnTour').onclick = () => setTour(!ui.tour);
  setTimeout(() => !MOBILE || $('#hint').classList.add('gone'), 9000);

  function screenshot() {
    renderer.render(scene, camera);
    const a = document.createElement('a');
    a.download = `followverse-${ui.selected?.id || owner}.png`; a.href = canvas.toDataURL('image/png'); a.click();
    toast('Screenshot saved 📸');
  }

  // ----- minimap
  const mini = $('#minimap'), mg = mini.getContext('2d'), MW = 180, span = half + 40;
  mini.width = mini.height = MW * 2;
  const toMini = (x, z) => [(x / span * 0.5 + 0.5) * MW * 2, (z / span * 0.5 + 0.5) * MW * 2];
  const base = document.createElement('canvas'); base.width = base.height = MW * 2;
  {
    const g = base.getContext('2d'); g.fillStyle = '#5f8f45'; g.fillRect(0, 0, MW * 2, MW * 2);
    const [a0] = toMini(-half, 0), [a1] = toMini(half, 0); g.fillStyle = '#3c4047'; g.fillRect(a0, a0, a1 - a0, a1 - a0);
    const k = (MW * 2) / (span * 2);
    for (let bx = -R; bx <= R; bx++) for (let bz = -R; bz <= R; bz++) {
      const [x, y] = toMini(bx * L.PITCH, bz * L.PITCH), s = 25 * k, lm = L.landmarkAt(bx, bz);
      g.fillStyle = { temple: '#f0a73a', park: '#4caf50', lake: '#2f86b3', market: '#e57373', plaza: '#d62976' }[lm] || '#bdb6a8';
      g.fillRect(x - s / 2, y - s / 2, s, s);
    }
    for (const f of people) { const p = L.plotToWorld(f.x, f.z), [x, y] = toMini(p.x, p.z); g.fillStyle = f.color; g.fillRect(x - 3.5, y - 3.5, 7, 7); }
  }
  const drawMini = () => {
    mg.drawImage(base, 0, 0);
    const [tx, ty] = toMini(controls.target.x, controls.target.z), ang = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    if (ui.selected) { const [sx, sy] = toMini(ui.selected.pos.x, ui.selected.pos.z); mg.fillStyle = '#ff3d8b'; mg.beginPath(); mg.arc(sx, sy, 8, 0, 7); mg.fill(); mg.strokeStyle = '#fff'; mg.lineWidth = 3; mg.stroke(); }
    mg.save(); mg.translate(tx, ty); mg.rotate(-ang + Math.PI);
    mg.fillStyle = 'rgba(255,255,255,.28)'; mg.beginPath(); mg.moveTo(0, 0); mg.lineTo(-30, -52); mg.lineTo(30, -52); mg.closePath(); mg.fill();
    mg.fillStyle = '#fff'; mg.beginPath(); mg.arc(0, 0, 6, 0, 7); mg.fill(); mg.restore();
  };
  mini.addEventListener('click', (e) => {
    const r = mini.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width - 0.5) * 2 * span, z = ((e.clientY - r.top) / r.height - 0.5) * 2 * span;
    flyTo(new THREE.Vector3(x, 0, z), 120);
  });

  // ----- resize
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  /* ================================================================ LOOP */
  const clock = new THREE.Clock();
  let frame = 0, flash = 0, nextFlash = 6;
  const sunDir = new THREE.Vector3(), tmp = new THREE.Vector3();
  const updateLabels = () => {
    const maxD = MOBILE ? 170 : 260, cap = MOBILE ? 14 : 30;
    for (const e of labels) e._d = camera.position.distanceTo(e.sprite.position);
    const near = new Set(labels.filter((e) => e.kind === 'user' && e._d < maxD).sort((a, b) => a._d - b._d).slice(0, cap));
    for (const e of labels) {
      const s = e.sprite, d = e._d, sel = ui.selected === e, big = e.kind !== 'user';
      let o = sel ? 1 : !ui.labelsOn ? 0 : big ? THREE.MathUtils.clamp(1.6 - d / 700, 0, 1) : near.has(e) ? THREE.MathUtils.clamp(1.6 - d / maxD, 0, 1) : 0;
      s.material.opacity += (o - s.material.opacity) * 0.3;
      s.visible = s.material.opacity > 0.02;
      const hgt = THREE.MathUtils.clamp(d * (big ? 0.042 : 0.03), big ? 2.6 : 1.3, big ? 22 : 7) * (sel ? 1.35 : 1);
      s.scale.set(hgt * s.userData.aspect, hgt, 1);
    }
  };

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    frame++;

    if (anim) {
      const k = THREE.MathUtils.clamp((performance.now() - anim.t0) / anim.dur, 0, 1), e = ease(k);
      controls.target.lerpVectors(anim.sT, anim.endT, e); camera.position.lerpVectors(anim.sP, anim.endP, e);
      if (k >= 1) anim = null;
    }
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -half - 80, half + 80);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -half - 80, half + 80);
    controls.update();

    // mood blending
    if (frame % 120 === 0 && ui.auto) setTargets();
    const a = 1 - Math.exp(-dt * 2.2);
    for (const k in target) { if (cur[k].isColor) cur[k].lerp(target[k], a); else cur[k] += (target[k] - cur[k]) * a; }
    skyU.top.value.copy(cur.top); skyU.bot.value.copy(cur.bot);
    scene.fog.color.copy(cur.fog); scene.fog.density = cur.fogD;
    hemi.color.copy(cur.hS); hemi.groundColor.copy(cur.hG); hemi.intensity = cur.hI;
    sun.color.copy(cur.sun); sun.intensity = cur.sunI + flash * 3;
    sunDir.set(Math.cos(cur.az) * Math.cos(cur.el), Math.sin(cur.el), Math.sin(cur.az) * Math.cos(cur.el));
    sun.position.copy(controls.target).addScaledVector(sunDir, 400); sun.target.position.copy(controls.target);
    disk.position.copy(camera.position).addScaledVector(sunDir, 3800); disk.material.color.copy(cur.disk);
    disk.material.opacity = 1 - cur.rainAmt * 0.9;
    wallMat.emissiveIntensity = cur.win; lampMat.emissiveIntensity = cur.lamp * 2; headMat.emissiveIntensity = cur.lamp * 2.5;
    poolMat.opacity = cur.lamp * 0.42; starM.opacity = cur.stars; cloudMat.color.copy(cur.cloud);
    renderer.toneMappingExposure = cur.exp + flash * 0.8;
    asphaltMat.roughness = 0.92 - cur.rainAmt * 0.55; asphaltMat.metalness = cur.rainAmt * 0.25;
    waterMat.color.setRGB(0.18 - cur.rainAmt * 0.05, 0.52 - cur.rainAmt * 0.15, 0.7 - cur.rainAmt * 0.15);

    // rain + lightning
    rain.visible = cur.rainAmt > 0.02; rainM.opacity = cur.rainAmt * 0.55;
    if (rain.visible) {
      rain.position.set(controls.target.x, 0, controls.target.z);
      const p = rainG.attributes.position.array, fall = 95 * dt;
      for (let i = 0; i < DROPS; i++) {
        const o = i * 6; p[o + 1] -= fall; p[o + 4] -= fall;
        if (p[o + 4] < 0) { const y = rainH + Math.random() * 20; p[o + 1] = y; p[o + 4] = y - 2.2; }
      }
      rainG.attributes.position.needsUpdate = true;
      nextFlash -= dt;
      if (nextFlash < 0 && ui.rain) { flash = 1; nextFlash = 7 + Math.random() * 12; }
    }
    flash = Math.max(0, flash - dt * 3.5);

    // traffic
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]; c.t += c.dir * c.v * dt;
      if (c.t > E) c.t = -E; if (c.t < -E) c.t = E;
      const rot = c.axis ? (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      Q.setFromAxisAngle(UP, rot);
      if (c.axis) V.set(c.line, 0.05, c.t); else V.set(c.t, 0.05, c.line);
      M.compose(V, Q, SC); carMesh.setMatrixAt(i, M); lightMesh.setMatrixAt(i, M);
    }
    carMesh.instanceMatrix.needsUpdate = lightMesh.instanceMatrix.needsUpdate = true;

    for (const c of clouds) { c.m.position.x += c.v * dt; if (c.m.position.x > RM * 1.2) c.m.position.x = -RM * 1.2; }
    for (const tb of turbines) tb.hub.rotation.z += tb.speed * dt;
    if (marker.visible) { pin.rotation.y += dt * 1.6; pin.position.y = ui.selected.top + 4 + Math.sin(t * 2.4) * 0.8; ringM.material.opacity = 0.25 + Math.sin(t * 3) * 0.08; }

    if (frame % 3 === 0) updateLabels();
    if (frame % 6 === 0 && !document.body.classList.contains('nomap')) drawMini();
    renderer.render(scene, camera);
  });

  /* ================================================================ START */
  setTargets();
  renderList();
  if (MOBILE) document.body.classList.add('nomap');
  progress(1, 'Welcome to the city!');
  camera.position.set(E * 0.2, E * 3, E * 2.4); controls.target.set(0, 0, 0);
  updateLabels();
  setTimeout(() => $('#loader').classList.add('done'), 250);

  const fromUrl = L.normalizeId(decodeURIComponent((location.hash.match(/^#@?(.+)$/) || [])[1] || new URLSearchParams(location.search).get('u') || ''));
  const who = fromUrl && people.find((f) => f.id === fromUrl);
  const startDist = MOBILE ? 1.55 : 1.15;
  anim = { t0: performance.now() + 300, dur: 2600, sT: controls.target.clone(), sP: camera.position.clone(), endT: new THREE.Vector3(0, 0, 0), endP: new THREE.Vector3(E * 0.55 * startDist, E * 0.75 * startDist, E * 0.8 * startDist) };
  if (who) setTimeout(() => select(who.entry), 2300);
  else if (fromUrl) toast(`@${fromUrl} isn't in the city yet`);
  window.__fv = { people, select, flyTo };
}

main().catch((e) => console.error(e));
