/**
 * Minimal glTF (.gltf + external .bin) mesh loader. The bundled KayKit
 * pieces are all single-node, transform-free, single-buffer files — assert
 * that instead of handling the general case.
 */

export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** Per-vertex rgb multiplier; absent = white (textured meshes). */
  colors?: Float32Array;
}

const COMPONENT_ARRAYS = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array,
} as const;

const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// oxlint-disable-next-line typescript/no-explicit-any
type Json = any;

/** Injected fetch — keeps this module free of DOM globals (mobile). */
type FetchLike = (
  url: string,
) => Promise<{ json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

export async function loadMesh(url: string, fetchImpl: FetchLike): Promise<MeshData> {
  const json: Json = await (await fetchImpl(url)).json();
  const binUri: string = json.buffers[0].uri;
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  const bin = await (await fetchImpl(base + binUri)).arrayBuffer();

  const accessor = (i: number) => {
    const acc = json.accessors[i];
    const Arr = COMPONENT_ARRAYS[acc.componentType as keyof typeof COMPONENT_ARRAYS];
    const comps = TYPE_COMPONENTS[acc.type];
    const bv = json.bufferViews[acc.bufferView];
    const offset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const elemBytes = Arr.BYTES_PER_ELEMENT * comps;
    const stride = bv.byteStride ?? elemBytes;
    const total = acc.count * comps;
    if (stride === elemBytes) return new Arr(bin, offset, total);
    const out = new Arr(total);
    for (let e = 0; e < acc.count; e++) {
      out.set(new Arr(bin, offset + e * stride, comps), e * comps);
    }
    return out;
  };

  const pos: Float32Array[] = [];
  const nrm: Float32Array[] = [];
  const uv: Float32Array[] = [];
  const idx: Uint32Array[] = [];
  let vertBase = 0;
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    if (node.matrix || node.translation || node.rotation || node.scale) {
      throw new Error(`${url}: node transforms unsupported`);
    }
    for (const prim of json.meshes[node.mesh].primitives) {
      const p = accessor(prim.attributes.POSITION) as Float32Array;
      pos.push(p);
      nrm.push(accessor(prim.attributes.NORMAL) as Float32Array);
      uv.push(accessor(prim.attributes.TEXCOORD_0) as Float32Array);
      const raw = accessor(prim.indices);
      const shifted = new Uint32Array(raw.length);
      for (let i = 0; i < raw.length; i++) shifted[i] = raw[i] + vertBase;
      idx.push(shifted);
      vertBase += p.length / 3;
    }
  }

  const concat = <T extends Float32Array | Uint32Array>(parts: T[], Ctor: new (n: number) => T) => {
    const out = new Ctor(parts.reduce((s, a) => s + a.length, 0));
    let off = 0;
    for (const a of parts) {
      out.set(a as never, off);
      off += a.length;
    }
    return out;
  };
  return {
    positions: concat(pos, Float32Array),
    normals: concat(nrm, Float32Array),
    uvs: concat(uv, Float32Array),
    indices: concat(idx, Uint32Array),
  };
}

/** Axis-aligned box: x/z centered [-0.5, 0.5], y in [0, 1]. Face normals,
 * constant UV (meant for the white texture + per-instance tints). */
export function boxMesh(): MeshData {
  const faces: { n: [number, number, number]; corners: [number, number, number][] }[] = [
    { n: [0, 1, 0], corners: [[-0.5, 1, -0.5], [-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5]] },
    { n: [0, -1, 0], corners: [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]] },
    { n: [1, 0, 0], corners: [[0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5], [0.5, 0, 0.5]] },
    { n: [-1, 0, 0], corners: [[-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]] },
    { n: [0, 0, 1], corners: [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]] },
    { n: [0, 0, -1], corners: [[-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5], [0.5, 0, -0.5]] },
  ];
  const positions = new Float32Array(6 * 4 * 3);
  const normals = new Float32Array(6 * 4 * 3);
  const uvs = new Float32Array(6 * 4 * 2).fill(0.5);
  const indices = new Uint32Array(6 * 6);
  faces.forEach((f, fi) => {
    f.corners.forEach((c, ci) => {
      positions.set(c, (fi * 4 + ci) * 3);
      normals.set(f.n, (fi * 4 + ci) * 3);
    });
    indices.set(
      [fi * 4, fi * 4 + 1, fi * 4 + 2, fi * 4, fi * 4 + 2, fi * 4 + 3],
      fi * 6,
    );
  });
  return { positions, normals, uvs, indices };
}
