/**
 * Procedural low-poly models (Crossy-Road style: axis-aligned flat-shaded
 * blocks with baked vertex colors). The KayKit packs ship no cat or dog, so
 * the animal pieces are hand-built here; tiles get real chamfered edges
 * instead of raw boxes.
 */
import type { MeshData } from './gltf.ts';

export type Rgb = [number, number, number];

class MeshBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  /** One flat quad from 4 CCW corners with a shared normal. */
  quad(corners: [number, number, number][], n: [number, number, number], color: Rgb) {
    const base = this.pos.length / 3;
    for (const c of corners) {
      this.pos.push(...c);
      this.nrm.push(...n);
      this.col.push(...color);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Axis-aligned box centered at (cx, cy, cz) with FULL sizes sx/sy/sz. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: Rgb) {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const y0 = cy - sy / 2;
    const y1 = cy + sy / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    this.quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], color);
    this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], color);
    this.quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], color);
    this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], color);
    this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], color);
    this.quad([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1], color);
  }

  /** Square-based pyramid (cat ears): base center (cx, cy, cz), apex up. */
  pyramid(cx: number, cy: number, cz: number, sx: number, sz: number, h: number, color: Rgb) {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    const apex: [number, number, number] = [cx, cy + h, cz];
    const base: [number, number, number][] = [
      [x0, cy, z0],
      [x1, cy, z0],
      [x1, cy, z1],
      [x0, cy, z1],
    ];
    this.quad([base[3], base[2], base[1], base[0]], [0, -1, 0], color);
    const tri = (a: [number, number, number], b: [number, number, number]) => {
      const bi = this.pos.length / 3;
      // face normal from the two edges
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [apex[0] - a[0], apex[1] - a[1], apex[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / len, n[1] / len, n[2] / len];
      for (const p of [a, b, apex]) {
        this.pos.push(...p);
        this.nrm.push(...n);
        this.col.push(...color);
      }
      this.idx.push(bi, bi + 1, bi + 2);
    };
    tri(base[0], base[1]);
    tri(base[1], base[2]);
    tri(base[2], base[3]);
    tri(base[3], base[0]);
  }

  /** Box with a 45° chamfer around the top edge: footprint w×d at y=0,
   * straight sides to h-c, then slanting in to a (w-2c)×(d-2c) top at h. */
  chamferBox(w: number, h: number, d: number, c: number, color: Rgb, topColor: Rgb = color) {
    const x0 = -w / 2;
    const x1 = w / 2;
    const z0 = -d / 2;
    const z1 = d / 2;
    const y1 = h - c;
    const ix0 = x0 + c;
    const ix1 = x1 - c;
    const iz0 = z0 + c;
    const iz1 = z1 - c;
    const s = Math.SQRT1_2;
    this.quad([[ix0, h, iz0], [ix0, h, iz1], [ix1, h, iz1], [ix1, h, iz0]], [0, 1, 0], topColor);
    this.quad([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], [0, -1, 0], color);
    // sides
    this.quad([[x1, 0, z0], [x1, y1, z0], [x1, y1, z1], [x1, 0, z1]], [1, 0, 0], color);
    this.quad([[x0, 0, z0], [x0, 0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], color);
    this.quad([[x0, 0, z1], [x1, 0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], color);
    this.quad([[x0, 0, z0], [x0, y1, z0], [x1, y1, z0], [x1, 0, z0]], [0, 0, -1], color);
    // chamfer ring
    this.quad([[x1, y1, z0], [ix1, h, iz0], [ix1, h, iz1], [x1, y1, z1]], [s, s, 0], topColor);
    this.quad([[x0, y1, z0], [x0, y1, z1], [ix0, h, iz1], [ix0, h, iz0]], [-s, s, 0], topColor);
    this.quad([[x0, y1, z1], [x1, y1, z1], [ix1, h, iz1], [ix0, h, iz1]], [0, s, s], topColor);
    this.quad([[x0, y1, z0], [ix0, h, iz0], [ix1, h, iz0], [x1, y1, z0]], [0, s, -s], topColor);
  }

  build(): MeshData {
    const n = this.pos.length / 3;
    return {
      positions: Float32Array.from(this.pos),
      normals: Float32Array.from(this.nrm),
      uvs: new Float32Array(n * 2).fill(0.5),
      indices: Uint32Array.from(this.idx),
      colors: Float32Array.from(this.col),
    };
  }
}

const darken = (c: Rgb, f: number): Rgb => [c[0] * f, c[1] * f, c[2] * f];

const WHITE: Rgb = [0.96, 0.96, 0.94];
const PINK: Rgb = [1.0, 0.62, 0.72];
const DARK: Rgb = [0.16, 0.13, 0.15];

/** Sitting low-poly cat, facing +z, base at y=0, ~1.0 tall, ~0.6 wide. */
export function catMesh(body: Rgb): MeshData {
  const b = new MeshBuilder();
  const belly = darken(body, 0.88);
  // haunches + body (sitting pose: wide rump, chest rising to the head)
  b.box(0, 0.19, -0.14, 0.56, 0.38, 0.42, body); // rump/haunches
  b.box(0, 0.3, 0.1, 0.44, 0.6, 0.34, body); // upright chest
  b.box(0, 0.26, 0.28, 0.3, 0.42, 0.06, WHITE); // chest patch
  // front paws
  b.box(-0.13, 0.06, 0.26, 0.14, 0.12, 0.18, body);
  b.box(0.13, 0.06, 0.26, 0.14, 0.12, 0.18, body);
  b.box(-0.13, 0.025, 0.33, 0.14, 0.05, 0.1, WHITE); // toe tips
  b.box(0.13, 0.025, 0.33, 0.14, 0.05, 0.1, WHITE);
  // head
  b.box(0, 0.76, 0.12, 0.5, 0.4, 0.42, body);
  b.box(0, 0.68, 0.34, 0.22, 0.14, 0.08, WHITE); // muzzle
  b.box(0, 0.73, 0.36, 0.08, 0.05, 0.05, PINK); // nose
  // eyes
  b.box(-0.13, 0.8, 0.325, 0.07, 0.09, 0.02, DARK);
  b.box(0.13, 0.8, 0.325, 0.07, 0.09, 0.02, DARK);
  // ears: outer pyramid + tiny pink inner wedge in front
  b.pyramid(-0.16, 0.96, 0.11, 0.18, 0.14, 0.2, body);
  b.pyramid(0.16, 0.96, 0.11, 0.18, 0.14, 0.2, body);
  b.pyramid(-0.16, 0.96, 0.17, 0.08, 0.05, 0.1, PINK);
  b.pyramid(0.16, 0.96, 0.17, 0.08, 0.05, 0.1, PINK);
  // tail curling up beside the rump
  b.box(0.24, 0.12, -0.34, 0.12, 0.14, 0.14, belly);
  b.box(0.3, 0.3, -0.36, 0.1, 0.28, 0.1, body);
  b.box(0.3, 0.48, -0.36, 0.12, 0.12, 0.12, WHITE); // white tail tip
  return b.build();
}

/** Long low-poly dachshund spanning ~1.75 units along z, facing +z. */
export function dogMesh(): MeshData {
  const body: Rgb = [0.78, 0.54, 0.34];
  const dark: Rgb = darken(body, 0.62);
  const cream: Rgb = [0.93, 0.82, 0.64];
  const collar: Rgb = [0.94, 0.32, 0.42];
  const b = new MeshBuilder();
  // long body + cream belly strip
  b.box(0, 0.34, -0.12, 0.42, 0.3, 1.18, body);
  b.box(0, 0.2, -0.12, 0.34, 0.06, 1.1, cream);
  // legs
  for (const z of [-0.6, 0.36]) {
    b.box(-0.14, 0.1, z, 0.14, 0.2, 0.15, body);
    b.box(0.14, 0.1, z, 0.14, 0.2, 0.15, body);
    b.box(-0.14, 0.025, z + 0.03, 0.14, 0.05, 0.17, dark); // paws
    b.box(0.14, 0.025, z + 0.03, 0.14, 0.05, 0.17, dark);
  }
  // collar, head, snout
  b.box(0, 0.44, 0.5, 0.4, 0.12, 0.12, collar);
  b.box(0, 0.58, 0.66, 0.36, 0.32, 0.32, body);
  b.box(0, 0.5, 0.9, 0.2, 0.16, 0.18, cream);
  b.box(0, 0.555, 0.97, 0.09, 0.07, 0.06, DARK); // nose
  // eyes
  b.box(-0.1, 0.64, 0.815, 0.06, 0.08, 0.02, DARK);
  b.box(0.1, 0.64, 0.815, 0.06, 0.08, 0.02, DARK);
  // floppy ears hanging at the head sides
  b.box(-0.21, 0.55, 0.62, 0.06, 0.26, 0.18, dark);
  b.box(0.21, 0.55, 0.62, 0.06, 0.26, 0.18, dark);
  // perky tail
  b.box(0, 0.5, -0.76, 0.09, 0.24, 0.09, body);
  b.box(0, 0.64, -0.76, 0.11, 0.11, 0.11, dark);
  return b.build();
}

/** Potted houseplant (the cushion piece): terracotta pot + blocky foliage
 * with a single coral bloom. Base at y=0, ~0.78 tall, footprint ~0.5. */
export function plantMesh(): MeshData {
  const pot: Rgb = [0.8, 0.47, 0.34];
  const potRim: Rgb = [0.87, 0.55, 0.4];
  const soil: Rgb = [0.32, 0.24, 0.18];
  const g1: Rgb = [0.38, 0.62, 0.41];
  const g2: Rgb = [0.5, 0.74, 0.5];
  const g3: Rgb = [0.3, 0.52, 0.36];
  const bloom: Rgb = [0.95, 0.55, 0.48];
  const b = new MeshBuilder();
  b.box(0, 0.11, 0, 0.36, 0.22, 0.36, pot);
  b.box(0, 0.25, 0, 0.44, 0.08, 0.44, potRim);
  b.box(0, 0.275, 0, 0.32, 0.05, 0.32, soil);
  // blocky foliage cluster
  b.box(0, 0.44, 0, 0.36, 0.3, 0.36, g1);
  b.box(-0.11, 0.58, 0.07, 0.24, 0.2, 0.24, g2);
  b.box(0.11, 0.6, -0.07, 0.22, 0.24, 0.22, g1);
  b.box(0.04, 0.52, 0.13, 0.18, 0.16, 0.16, g3);
  b.pyramid(0, 0.72, 0, 0.18, 0.18, 0.2, g2);
  b.pyramid(-0.15, 0.66, 0.09, 0.12, 0.12, 0.15, g3);
  b.pyramid(0.16, 0.7, -0.08, 0.11, 0.11, 0.13, g2);
  // one coral bloom
  b.box(0.13, 0.76, 0.09, 0.09, 0.08, 0.09, bloom);
  b.box(0.13, 0.81, 0.09, 0.05, 0.04, 0.05, [1, 0.8, 0.55]);
  return b.build();
}

/** Flat n-gon disc (rug layers): radius 1, height h, tint-colored. */
export function discMesh(h: number, segments = 24): MeshData {
  const b = new MeshBuilder();
  const white: Rgb = [1, 1, 1];
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([Math.cos(a), Math.sin(a)]);
  }
  for (let i = 0; i < segments; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % segments];
    // side quad
    const nx = (x0 + x1) / 2;
    const nz = (z0 + z1) / 2;
    const nl = Math.hypot(nx, nz) || 1;
    b.quad(
      [
        [x0, 0, z0],
        [x0, h, z0],
        [x1, h, z1],
        [x1, 0, z1],
      ],
      [nx / nl, 0, nz / nl],
      white,
    );
    // top fan triangle (as a degenerate quad)
    b.quad(
      [
        [0, h, 0],
        [x0, h, z0],
        [x1, h, z1],
        [0, h, 0],
      ],
      [0, 1, 0],
      white,
    );
  }
  return b.build();
}

/** Voxel yarn ball with a trailing strand — white parts, tint-colored. */
export function yarnMesh(): MeshData {
  const b = new MeshBuilder();
  const full: Rgb = [1, 1, 1];
  const dim: Rgb = [0.82, 0.8, 0.8];
  b.box(0, 0.17, 0, 0.3, 0.3, 0.3, full);
  b.box(0, 0.17, 0, 0.36, 0.22, 0.22, dim);
  b.box(0, 0.17, 0, 0.22, 0.22, 0.36, dim);
  b.box(0, 0.3, 0, 0.2, 0.08, 0.2, full);
  b.box(0, 0.03, 0.3, 0.05, 0.05, 0.34, dim); // trailing strand
  b.box(0.16, 0.03, 0.52, 0.38, 0.05, 0.05, dim);
  return b.build();
}

/** Open cardboard box with four flaps folded outward-down — peak cat real
 * estate. Footprint ~0.9, walls 0.4 high, base at y=0. */
export function cardboardBoxMesh(): MeshData {
  const kraft: Rgb = [0.8, 0.6, 0.38];
  const kraftLight: Rgb = [0.87, 0.68, 0.45];
  const kraftDark: Rgb = [0.6, 0.44, 0.28];
  const floor: Rgb = [0.52, 0.38, 0.24];
  const b = new MeshBuilder();
  const half = 0.44;
  const t = 0.05; // wall thickness
  const H = 0.4; // wall height
  // floor + four walls (axis-aligned slabs)
  b.box(0, 0.03, 0, half * 2, 0.06, half * 2, floor);
  b.box(0, H / 2, half - t / 2, half * 2, H, t, kraft);
  b.box(0, H / 2, -(half - t / 2), half * 2, H, t, kraft);
  b.box(half - t / 2, H / 2, 0, t, H, half * 2 - t * 2, kraft);
  b.box(-(half - t / 2), H / 2, 0, t, H, half * 2 - t * 2, kraft);
  // flaps: thin slabs hinged at the top outer edge, drooping outward
  const L = 0.3; // flap length
  const drop = Math.sin(0.6) * L;
  const out = Math.cos(0.6) * L;
  const flap = (
    A: [number, number, number],
    B: [number, number, number],
    D: [number, number, number],
  ) => {
    const C: [number, number, number] = [B[0] + D[0] * out, B[1] - drop, B[2] + D[2] * out];
    const E: [number, number, number] = [A[0] + D[0] * out, A[1] - drop, A[2] + D[2] * out];
    // face normal ≈ outward-tilted up
    const n: [number, number, number] = [
      D[0] * Math.sin(0.6),
      Math.cos(0.6),
      D[2] * Math.sin(0.6),
    ];
    b.quad([A, B, C, E], n, kraftLight);
    const o = 0.028;
    const lower = (p: [number, number, number]): [number, number, number] => [
      p[0] - n[0] * o,
      p[1] - n[1] * o,
      p[2] - n[2] * o,
    ];
    b.quad([lower(E), lower(C), lower(B), lower(A)], [-n[0], -n[1], -n[2]], kraftDark);
  };
  flap([-half, H, half], [half, H, half], [0, 0, 1]); // front (+z)
  flap([half, H, -half], [-half, H, -half], [0, 0, -1]); // back
  flap([half, H, half], [half, H, -half], [1, 0, 0]); // right
  flap([-half, H, -half], [-half, H, half], [-1, 0, 0]); // left
  return b.build();
}

/** Chamfered board tile (white — per-instance tint colors it). */
export function tileMesh(h: number): MeshData {
  const b = new MeshBuilder();
  b.chamferBox(0.9, h, 0.9, 0.06, [1, 1, 1]);
  return b.build();
}

/** Chamfered tray: slightly darker sides so the top rim pops (tint-colored). */
export function trayMesh(): MeshData {
  const b = new MeshBuilder();
  b.chamferBox(5.75, 0.3, 5.75, 0.12, [0.8, 0.8, 0.8], [1, 1, 1]);
  return b.build();
}
