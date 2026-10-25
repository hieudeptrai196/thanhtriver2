import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Paint a geometry with one flat vertex colour so parts can be merged into one mesh. */
function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  geo.deleteAttribute('uv');
  return geo;
}

function part(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return paint(g, color);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  return g;
}

export function unitGeometry(type: string): THREE.BufferGeometry {
  const skin = 0xe8c39e;
  const parts = [
    part(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 6), type === 'peasant' ? 0x9c7b4b : type === 'builder' ? 0xd08a2e : type === 'spear' ? 0x3d63b8 : 0x3f8f45, 0, 0.35, 0),
    part(new THREE.IcosahedronGeometry(0.2, 0), skin, 0, 0.85, 0),
  ];
  if (type === 'peasant') parts.push(part(new THREE.ConeGeometry(0.32, 0.18, 7), 0xd8c070, 0, 1.02, 0));
  if (type === 'builder') {
    parts.push(part(new THREE.CylinderGeometry(0.21, 0.21, 0.1, 7), 0xf0c020, 0, 1.0, 0));
    parts.push(part(new THREE.BoxGeometry(0.08, 0.5, 0.08), 0x6b4a2a, 0.3, 0.5, 0, 0, 0, 0.3));
  }
  if (type === 'spear') {
    parts.push(part(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 4), 0x8a6a40, 0.3, 0.75, 0));
    parts.push(part(new THREE.ConeGeometry(0.07, 0.25, 4), 0xd0d0d8, 0.3, 1.6, 0));
    parts.push(part(new THREE.BoxGeometry(0.1, 0.45, 0.35), 0x2a4a90, -0.28, 0.45, 0));
  }
  if (type === 'archer') {
    parts.push(part(new THREE.TorusGeometry(0.32, 0.03, 4, 8, Math.PI), 0x7a5530, 0.3, 0.6, 0, 0, Math.PI / 2, Math.PI / 2));
    parts.push(part(new THREE.ConeGeometry(0.22, 0.25, 6), 0x2d6a32, 0, 1.05, 0));
  }
  return merge(parts);
}

export function monsterGeometry(type: string): THREE.BufferGeometry {
  if (type === 'fast') {
    return merge([
      part(new THREE.ConeGeometry(0.3, 0.9, 5), 0x6a1f4a, 0, 0.35, 0, Math.PI / 2, 0, 0),
      part(new THREE.IcosahedronGeometry(0.1, 0), 0xff4040, 0.12, 0.45, 0.35),
      part(new THREE.IcosahedronGeometry(0.1, 0), 0xff4040, -0.12, 0.45, 0.35),
    ]);
  }
  if (type === 'brute') {
    return merge([
      part(new THREE.DodecahedronGeometry(0.6, 0), 0x4a3a5a, 0, 0.7, 0),
      part(new THREE.BoxGeometry(0.3, 0.6, 0.3), 0x3a2a4a, 0.55, 0.5, 0.1),
      part(new THREE.BoxGeometry(0.3, 0.6, 0.3), 0x3a2a4a, -0.55, 0.5, 0.1),
      part(new THREE.IcosahedronGeometry(0.1, 0), 0xffa020, 0.2, 0.9, 0.5),
      part(new THREE.IcosahedronGeometry(0.1, 0), 0xffa020, -0.2, 0.9, 0.5),
    ]);
  }
  if (type === 'ranged') {
    return merge([
      part(new THREE.OctahedronGeometry(0.4, 0), 0x2f5a3a, 0, 0.7, 0),
      part(new THREE.CylinderGeometry(0.1, 0.2, 0.5, 5), 0x1f4a2a, 0, 0.25, 0),
      part(new THREE.IcosahedronGeometry(0.12, 0), 0x90ff60, 0, 0.8, 0.32),
    ]);
  }
  return merge([
    part(new THREE.DodecahedronGeometry(1.2, 0), 0x3a1a2a, 0, 1.4, 0),
    part(new THREE.ConeGeometry(0.25, 0.9, 5), 0xd8d0b0, 0.6, 2.4, 0, 0, 0, -0.4),
    part(new THREE.ConeGeometry(0.25, 0.9, 5), 0xd8d0b0, -0.6, 2.4, 0, 0, 0, 0.4),
    part(new THREE.BoxGeometry(0.6, 1.2, 0.6), 0x2a1020, 1.2, 0.8, 0),
    part(new THREE.BoxGeometry(0.6, 1.2, 0.6), 0x2a1020, -1.2, 0.8, 0),
    part(new THREE.IcosahedronGeometry(0.18, 0), 0xff2020, 0.35, 1.7, 1.05),
    part(new THREE.IcosahedronGeometry(0.18, 0), 0xff2020, -0.35, 1.7, 1.05),
  ]);
}

export function nodeGeometry(type: string): THREE.BufferGeometry {
  if (type === 'tree') {
    return merge([
      part(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 5), 0x6b4a2a, 0, 0.4, 0),
      part(new THREE.ConeGeometry(0.8, 1.4, 6), 0x2f7a3a, 0, 1.4, 0),
      part(new THREE.ConeGeometry(0.6, 1.1, 6), 0x3a8f45, 0, 2.0, 0),
    ]);
  }
  if (type === 'rock') {
    return merge([
      part(new THREE.DodecahedronGeometry(0.7, 0), 0x8a8a90, 0, 0.4, 0),
      part(new THREE.DodecahedronGeometry(0.4, 0), 0x9a9aa2, 0.5, 0.25, 0.3),
    ]);
  }
  return merge([
    part(new THREE.IcosahedronGeometry(0.55, 0), 0x4a8a3a, 0, 0.45, 0),
    part(new THREE.IcosahedronGeometry(0.1, 0), 0xd03050, 0.3, 0.7, 0.3),
    part(new THREE.IcosahedronGeometry(0.1, 0), 0xd03050, -0.25, 0.75, 0.2),
    part(new THREE.IcosahedronGeometry(0.1, 0), 0xd03050, 0.05, 0.85, -0.3),
  ]);
}

export function structGeometry(type: string): THREE.BufferGeometry {
  if (type === 'wall') {
    return merge([
      part(new THREE.BoxGeometry(1, 1.2, 1), 0x8a6238, 0, 0.6, 0),
      part(new THREE.ConeGeometry(0.15, 0.4, 4), 0x6b4a2a, -0.3, 1.4, 0),
      part(new THREE.ConeGeometry(0.15, 0.4, 4), 0x6b4a2a, 0.3, 1.4, 0),
      part(new THREE.ConeGeometry(0.15, 0.4, 4), 0x6b4a2a, 0, 1.4, 0.3),
      part(new THREE.ConeGeometry(0.15, 0.4, 4), 0x6b4a2a, 0, 1.4, -0.3),
    ]);
  }
  if (type === 'tower') {
    return merge([
      part(new THREE.CylinderGeometry(0.45, 0.55, 2.2, 6), 0x8a7a68, 0, 1.1, 0),
      part(new THREE.CylinderGeometry(0.65, 0.65, 0.3, 6), 0x7a5a38, 0, 2.3, 0),
      part(new THREE.ConeGeometry(0.75, 0.8, 6), 0xa03a2a, 0, 2.85, 0),
    ]);
  }
  return merge([
    part(new THREE.CylinderGeometry(0.06, 0.08, 1.4, 5), 0x5a3a20, 0, 0.7, 0),
    part(new THREE.OctahedronGeometry(0.2, 0), 0xffb030, 0, 1.55, 0),
  ]);
}

export function castleGeometry(): THREE.BufferGeometry {
  const stone = 0xa8a090;
  const dark = 0x7a7266;
  const roof = 0x9a3a2a;
  const wood = 0x6b4a2a;
  const parts: THREE.BufferGeometry[] = [
    part(new THREE.BoxGeometry(6, 0.6, 6), wood, 0, 0.9, 0),
    part(new THREE.BoxGeometry(5.6, 1.6, 5.6), stone, 0, 2.0, 0),
    part(new THREE.BoxGeometry(2.6, 2.4, 2.6), dark, 0, 3.8, 0),
    part(new THREE.ConeGeometry(2.1, 1.6, 4), roof, 0, 5.8, 0, 0, Math.PI / 4, 0),
  ];
  for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) {
    parts.push(part(new THREE.CylinderGeometry(0.6, 0.7, 3.2, 6), stone, x, 2.4, z));
    parts.push(part(new THREE.ConeGeometry(0.85, 1.1, 6), roof, x, 4.55, z));
  }
  // Crenellations.
  for (let i = -2; i <= 2; i++) {
    parts.push(part(new THREE.BoxGeometry(0.4, 0.4, 0.4), stone, i * 1.0, 3.0, -2.75));
    parts.push(part(new THREE.BoxGeometry(0.4, 0.4, 0.4), stone, i * 1.0, 3.0, 2.75));
    parts.push(part(new THREE.BoxGeometry(0.4, 0.4, 0.4), stone, -2.75, 3.0, i * 1.0));
    parts.push(part(new THREE.BoxGeometry(0.4, 0.4, 0.4), stone, 2.75, 3.0, i * 1.0));
  }
  // Gate.
  parts.push(part(new THREE.BoxGeometry(1.2, 1.3, 0.1), wood, 0, 1.85, 2.82));
  return merge(parts);
}

export function wheelGeometry(): THREE.BufferGeometry {
  return merge([
    // Axle along z: the castle rolls along x on the rails.
    part(new THREE.CylinderGeometry(0.7, 0.7, 0.22, 14), 0x4a3a2c, 0, 0, 0, Math.PI / 2),
    part(new THREE.CylinderGeometry(0.78, 0.78, 0.08, 14), 0x8a8e96, 0, 0, -0.13, Math.PI / 2),
    part(new THREE.BoxGeometry(1.2, 0.12, 0.1), 0x6a6e76, 0, 0, 0.12),
    part(new THREE.BoxGeometry(0.12, 1.2, 0.1), 0x6a6e76, 0, 0, 0.12),
    part(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 8), 0x3a3a3a, 0, 0, 0, Math.PI / 2),
  ]);
}

export function cliffGeometry(): THREE.BufferGeometry {
  return merge([
    part(new THREE.DodecahedronGeometry(1.4, 0), 0x6e6258, 0, 0.9, 0),
    part(new THREE.DodecahedronGeometry(1.0, 0), 0x7e7266, 0.9, 1.9, 0.4),
  ]);
}

/** Soft radial disc used to show lit areas on the ground. */
export function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Timber scaffold around a building site: corner posts, ledgers, cross braces and a plank deck; base at y=0, 1 tall. */
export function scaffoldGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const post = 0x7a5634;
  const beam = 0x9a7446;
  const plank = 0xb8935e;
  for (const [x, z] of [[-0.48, -0.48], [0.48, -0.48], [-0.48, 0.48], [0.48, 0.48]]) {
    parts.push(part(new THREE.BoxGeometry(0.07, 1, 0.07), post, x, 0.5, z));
  }
  for (const y of [0.34, 0.68, 0.98]) {
    for (const [x, z, ry] of [[0, -0.48, 0], [0, 0.48, 0], [-0.48, 0, Math.PI / 2], [0.48, 0, Math.PI / 2]]) {
      parts.push(part(new THREE.BoxGeometry(1.0, 0.035, 0.05), beam, x, y, z, 0, ry));
    }
  }
  // Cross braces on two faces.
  for (const [z, s] of [[-0.5, 1], [0.5, -1]]) {
    parts.push(part(new THREE.BoxGeometry(1.2, 0.03, 0.03), beam, 0, 0.5, z, 0, 0, s * Math.atan2(0.95, 0.95)));
  }
  // A plank deck halfway up and a few loose planks at the top.
  parts.push(part(new THREE.BoxGeometry(0.98, 0.025, 0.4), plank, 0, 0.68, -0.26));
  parts.push(part(new THREE.BoxGeometry(0.4, 0.025, 0.98), plank, 0.26, 0.98, 0));
  return merge(parts);
}

/** An irregular flat patch (unit radius) for ground under resource nodes. */
export function blobGeometry(): THREE.BufferGeometry {
  const n = 11;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.82 + 0.18 * Math.sin(i * 2.3) * Math.cos(i * 1.7);
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Ploughed furrows for crop plots: dark ridges and lighter troughs along one axis. */
export function furrowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 4; i++) {
    const y = i * 16;
    const grad = g.createLinearGradient(0, y, 0, y + 16);
    grad.addColorStop(0, '#6b4c2e');
    grad.addColorStop(0.5, '#9a7448');
    grad.addColorStop(1, '#6b4c2e');
    g.fillStyle = grad;
    g.fillRect(0, y, 64, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function painted(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const col = new Float32Array(n.getAttribute('position').count * 3);
  for (let i = 0; i < col.length; i += 3) col.set([c.r, c.g, c.b], i);
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  n.deleteAttribute('uv');
  return n;
}

/** A domed haystack with a darker, weathered crown; vertex-coloured, about 1.3 wide and 1.2 tall. */
export function haystackGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector2(Math.max(0.02, 0.68 * Math.cos(t * Math.PI * 0.5) ** 0.6 * (1 - t * 0.12)), t * 1.15));
  }
  const body = new THREE.LatheGeometry(pts, 9);
  const pos = body.getAttribute('position');
  // Ragged straw: jitter the surface a little.
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 + Math.sin(i * 12.9898) * 0.06 * (y > 0.05 ? 1 : 0);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  body.computeVertexNormals();
  const n = body.toNonIndexed();
  const p = n.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  const lo = new THREE.Color(0xc9a95a);
  const hi = new THREE.Color(0x8c7442);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(lo).lerp(hi, Math.min(1, Math.max(0, (p.getY(i) - 0.6) / 0.5)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  n.deleteAttribute('uv');
  const band = painted(new THREE.TorusGeometry(0.52, 0.035, 3, 10).rotateX(Math.PI / 2).translate(0, 0.62, 0), 0x6e5630);
  return mergeGeometries([n, band])!;
}

/** A crossroads waypost: a weathered post with two arrow boards and a little roof. */
export function signpostGeometry(): THREE.BufferGeometry {
  const wood = 0x6b4a2c;
  const parts = [
    painted(new THREE.BoxGeometry(0.12, 1.7, 0.12).translate(0, 0.85, 0), wood),
    painted(new THREE.BoxGeometry(0.75, 0.2, 0.05).translate(0.3, 1.35, 0.07), 0x9a7448),
    painted(new THREE.BoxGeometry(0.65, 0.18, 0.05).translate(-0.25, 1.08, -0.07).rotateY(0.5), 0x8a6640),
    painted(new THREE.ConeGeometry(0.2, 0.18, 4).rotateY(Math.PI / 4).translate(0, 1.79, 0), 0x5a3a24),
    painted(new THREE.BoxGeometry(0.34, 0.08, 0.34).translate(0, 0.04, 0), 0x6e675b),
  ];
  return mergeGeometries(parts)!;
}

/** The cold remains of a camp: a ring of stones, charred logs and an ash bed. */
export function campfireGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [painted(new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2).translate(0, 0.02, 0), 0x4a4038)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = 0.12 + (Math.sin(i * 7.1) * 0.5 + 0.5) * 0.06;
    parts.push(painted(new THREE.DodecahedronGeometry(s, 0).scale(1, 0.7, 1).translate(Math.cos(a) * 0.55, s * 0.5, Math.sin(a) * 0.55), i % 2 ? 0x7d766a : 0x928a7c));
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    parts.push(painted(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 5).rotateZ(Math.PI / 2 - 0.25).rotateY(a).translate(0, 0.12, 0), i === 1 ? 0x2a2018 : 0x3a2c20));
  }
  return mergeGeometries(parts)!;
}
