/**
 * TypeGPU renderer: one instanced, textured, sun-lit mesh pipeline drawn
 * into a single MSAA pass that resolves straight to the canvas. The canvas
 * clears to transparent so the page's candy-gradient CSS backdrop shows
 * through. Batches = (mesh, texture) pairs with a fixed-capacity instance
 * storage array rewritten each frame (piece counts are tiny).
 */
import tgpu, { d, std, type TgpuRoot } from 'typegpu';
import { mat4, vec3 } from 'wgpu-matrix';
import { boxMesh, loadMesh, type MeshData } from './gltf.ts';

export interface InstanceSpec {
  pos: [number, number, number];
  /** Yaw in radians. */
  rot: number;
  scl: [number, number, number];
  tint: [number, number, number];
  /** 0..1 — pulsing white-hot highlight add. */
  glow: number;
}

const CameraData = d.struct({
  viewProj: d.mat4x4f,
  camPos: d.vec3f,
  time: d.f32,
});

const Instance = d.struct({
  pos: d.vec3f,
  rotCS: d.vec2f,
  scl: d.vec3f,
  tint: d.vec3f,
  glow: d.f32,
});

const Vertex = d.unstruct({
  position: d.float32x3,
  normal: d.snorm16x4,
  uv: d.unorm16x2,
  color: d.unorm8x4,
});

const MSAA = 4;
const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';

const packSnorm16 = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
const packUnorm16 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 65535);

export type Renderer = Awaited<ReturnType<typeof createRenderer>>;

export async function createRenderer(canvas: HTMLCanvasElement) {
  const root: TgpuRoot = await tgpu.init();
  const device = root.device;
  const context = canvas.getContext('webgpu');
  if (!context) throw new Error('WebGPU canvas context unavailable');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const camera = root.createUniform(CameraData);
  const sampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
  });

  const batchLayout = tgpu.bindGroupLayout({
    instances: { storage: d.arrayOf(Instance), access: 'readonly' },
    tex: { texture: d.texture2d(d.f32) },
  });

  const vert = tgpu.vertexFn({
    in: {
      position: d.vec3f,
      normal: d.vec4f,
      uv: d.vec2f,
      color: d.vec4f,
      iid: d.builtin.instanceIndex,
    },
    out: {
      position: d.builtin.position,
      wNormal: d.vec3f,
      fragUv: d.vec2f,
      tint: d.vec3f,
      glow: d.f32,
      localY: d.f32,
    },
  })((input) => {
    'use gpu';
    const inst = batchLayout.$.instances[input.iid];
    const c = inst.rotCS.x;
    const s = inst.rotCS.y;
    const p = input.position * inst.scl;
    const wPos = d.vec3f(
      inst.pos.x + p.x * c + p.z * s,
      inst.pos.y + p.y,
      inst.pos.z - p.x * s + p.z * c,
    );
    const n = input.normal;
    return {
      position: camera.$.viewProj * d.vec4f(wPos, 1),
      wNormal: d.vec3f(n.x * c + n.z * s, n.y, -n.x * s + n.z * c),
      fragUv: input.uv,
      tint: inst.tint * input.color.rgb,
      glow: inst.glow,
      localY: input.position.y,
    };
  });

  const frag = tgpu.fragmentFn({
    in: { wNormal: d.vec3f, fragUv: d.vec2f, tint: d.vec3f, glow: d.f32, localY: d.f32 },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    const albedo = std.textureSample(batchLayout.$.tex, sampler.$, input.fragUv);
    const n = std.normalize(input.wNormal);
    const sun = std.normalize(d.vec3f(0.45, 1.0, 0.3));
    const diff = std.max(std.dot(n, sun), 0);
    // cozy lamp-light: warm golden key over a soft rosy ambient
    const ao = 0.82 + 0.18 * std.clamp(input.localY * 2.2, 0, 1);
    const light = d.vec3f(0.64, 0.6, 0.57) * ao + d.vec3f(0.56, 0.5, 0.4) * diff;
    let color = albedo.rgb * input.tint * light;
    // warm specular pop so pieces read glossy like molded plastic
    const view = std.normalize(camera.$.camPos);
    const h = std.normalize(sun + view);
    color += d.vec3f(1, 0.9, 0.72) * (std.pow(std.max(std.dot(n, h), 0), 42) * 0.32);
    // pulsing highlight for selection / legal-target tiles
    const pulse = 0.72 + 0.28 * std.sin(camera.$.time * 5.5);
    color = std.mix(color, d.vec3f(1.35, 1.24, 0.85), input.glow * pulse * 0.85);
    return d.vec4f(color, 1);
  });

  const vertLayout = tgpu.vertexLayout(d.disarrayOf(Vertex));
  const pipeline = root.createRenderPipeline({
    attribs: { ...vertLayout.attrib },
    vertex: vert,
    fragment: frag,
    targets: { format },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    multisample: { count: MSAA },
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
  });
  root.unwrap(pipeline); // compile at boot, not first frame

  // --- meshes & textures -------------------------------------------------------

  function uploadMesh(mesh: MeshData) {
    const vertexCount = mesh.positions.length / 3;
    if (vertexCount > 0xffff) throw new Error('mesh too large for u16 indices');
    // pos f32x3 + normal snorm16x4 + uv unorm16x2 + color unorm8x4 = 28 B
    const STRIDE = 28;
    const packed = new ArrayBuffer(vertexCount * STRIDE);
    const pF32 = new Float32Array(packed);
    const pI16 = new Int16Array(packed);
    const pU16 = new Uint16Array(packed);
    const pU8 = new Uint8Array(packed);
    for (let i = 0; i < vertexCount; i++) {
      pF32[i * 7] = mesh.positions[i * 3];
      pF32[i * 7 + 1] = mesh.positions[i * 3 + 1];
      pF32[i * 7 + 2] = mesh.positions[i * 3 + 2];
      pI16[i * 14 + 6] = packSnorm16(mesh.normals[i * 3]);
      pI16[i * 14 + 7] = packSnorm16(mesh.normals[i * 3 + 1]);
      pI16[i * 14 + 8] = packSnorm16(mesh.normals[i * 3 + 2]);
      pI16[i * 14 + 9] = 0;
      pU16[i * 14 + 10] = packUnorm16(mesh.uvs[i * 2]);
      pU16[i * 14 + 11] = packUnorm16(mesh.uvs[i * 2 + 1]);
      const r = mesh.colors ? mesh.colors[i * 3] : 1;
      const g = mesh.colors ? mesh.colors[i * 3 + 1] : 1;
      const b = mesh.colors ? mesh.colors[i * 3 + 2] : 1;
      pU8[i * STRIDE + 24] = Math.round(Math.max(0, Math.min(1, r)) * 255);
      pU8[i * STRIDE + 25] = Math.round(Math.max(0, Math.min(1, g)) * 255);
      pU8[i * STRIDE + 26] = Math.round(Math.max(0, Math.min(1, b)) * 255);
      pU8[i * STRIDE + 27] = 255;
    }
    const vertexBuf = root.createBuffer(d.disarrayOf(Vertex, vertexCount)).$usage('vertex');
    device.queue.writeBuffer(vertexBuf.buffer, 0, packed);
    const padded = new Uint16Array((mesh.indices.length + 1) & ~1);
    padded.set(mesh.indices);
    const indexBuf = root.createBuffer(d.arrayOf(d.u16, padded.length)).$usage('index');
    device.queue.writeBuffer(indexBuf.buffer, 0, padded);
    return { vertexBuf, indexBuf, indexCount: mesh.indices.length };
  }

  async function uploadTexture(bitmap: ImageBitmap) {
    const mips = Math.floor(Math.log2(Math.max(bitmap.width, bitmap.height))) + 1;
    const tex = root
      .createTexture({
        size: [bitmap.width, bitmap.height],
        format: 'rgba8unorm',
        mipLevelCount: mips,
      })
      .$usage('sampled', 'render');
    tex.write(bitmap);
    tex.generateMipmaps();
    return tex;
  }

  async function loadTexture(url: string) {
    const blob = await (await fetch(url)).blob();
    return uploadTexture(await createImageBitmap(blob, { colorSpaceConversion: 'none' }));
  }

  async function whiteTexture() {
    const cnv = new OffscreenCanvas(2, 2);
    const ctx = cnv.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 2, 2);
    return uploadTexture(await createImageBitmap(cnv));
  }

  type Texture = Awaited<ReturnType<typeof loadTexture>>;

  const HIDDEN: d.Infer<typeof Instance> = {
    pos: d.vec3f(0, -100, 0),
    rotCS: d.vec2f(1, 0),
    scl: d.vec3f(),
    tint: d.vec3f(1, 1, 1),
    glow: 0,
  };

  interface Batch {
    draw: ReturnType<typeof makeDrawChain>;
    buf: ReturnType<typeof makeInstanceBuf>;
    capacity: number;
    specs: InstanceSpec[];
    indexCount: number;
  }
  const makeInstanceBuf = (capacity: number) =>
    root.createBuffer(d.arrayOf(Instance, capacity)).$usage('storage');
  const makeDrawChain = (
    mesh: ReturnType<typeof uploadMesh>,
    buf: ReturnType<typeof makeInstanceBuf>,
    tex: Texture,
  ) =>
    pipeline
      .with(vertLayout, mesh.vertexBuf)
      .with(root.createBindGroup(batchLayout, { instances: buf, tex }))
      .withIndexBuffer(mesh.indexBuf);

  const batches = new Map<string, Batch>();

  function addBatch(name: string, mesh: MeshData, tex: Texture, capacity: number) {
    const gpuMesh = uploadMesh(mesh);
    const buf = makeInstanceBuf(capacity);
    batches.set(name, {
      draw: makeDrawChain(gpuMesh, buf, tex),
      buf,
      capacity,
      specs: [],
      indexCount: gpuMesh.indexCount,
    });
  }

  // --- frame targets (recreated on resize) -------------------------------------

  let msaaView: GPUTextureView | null = null;
  let depthView: GPUTextureView | null = null;
  let targetW = 0;
  let targetH = 0;
  let msaaTex: GPUTexture | null = null;
  let depthTex: GPUTexture | null = null;

  function ensureTargets() {
    const w = canvas.width;
    const h = canvas.height;
    if (w === targetW && h === targetH && msaaView) return;
    msaaTex?.destroy();
    depthTex?.destroy();
    msaaTex = device.createTexture({
      size: [w, h],
      format,
      sampleCount: MSAA,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    depthTex = device.createTexture({
      size: [w, h],
      format: DEPTH_FORMAT,
      sampleCount: MSAA,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    msaaView = msaaTex.createView();
    depthView = depthTex.createView();
    targetW = w;
    targetH = h;
  }

  // --- camera ------------------------------------------------------------------

  const proj = mat4.create();
  const view = mat4.create();
  const viewProj = mat4.create();
  const invViewProj = mat4.create();
  const eyeBase = vec3.fromValues(0.6, 7.9, 6.1);
  const target = vec3.fromValues(0, 0, 0.35);
  const eye = vec3.create();

  function updateCamera(time: number) {
    const aspect = canvas.width / Math.max(1, canvas.height);
    // narrow (portrait) screens dolly the camera straight back until the
    // whole board fits the horizontal FOV
    const fit = Math.max(1, 0.92 / aspect);
    for (let i = 0; i < 3; i++) eye[i] = target[i] + (eyeBase[i] - target[i]) * fit;
    mat4.perspective((38 * Math.PI) / 180, aspect, 0.1, 80, proj);
    mat4.lookAt(eye, target, vec3.fromValues(0, 1, 0), view);
    mat4.multiply(proj, view, viewProj);
    mat4.invert(viewProj, invViewProj);
    camera.write({
      viewProj: viewProj as Float32Array,
      camPos: [eye[0], eye[1], eye[2]],
      time,
    });
  }

  /** Mouse (css px) -> world-space ray/plane hit at height `planeY`. */
  function pickGround(px: number, py: number, planeY: number): [number, number] | null {
    const ndcX = (px / canvas.clientWidth) * 2 - 1;
    const ndcY = 1 - (py / canvas.clientHeight) * 2;
    const near = vec3.create();
    const far = vec3.create();
    vec3.transformMat4(vec3.fromValues(ndcX, ndcY, 0), invViewProj, near);
    vec3.transformMat4(vec3.fromValues(ndcX, ndcY, 1), invViewProj, far);
    const dy = far[1] - near[1];
    if (Math.abs(dy) < 1e-6) return null;
    const t = (planeY - near[1]) / dy;
    if (t < 0 || t > 1) return null;
    return [near[0] + (far[0] - near[0]) * t, near[2] + (far[2] - near[2]) * t];
  }

  /** World point -> normalized [0,1] viewport coords (QA/debug bridge). */
  function project(x: number, y: number, z: number): [number, number] {
    const p = vec3.create();
    vec3.transformMat4(vec3.fromValues(x, y, z), viewProj, p);
    return [p[0] * 0.5 + 0.5, 0.5 - p[1] * 0.5];
  }

  const scratch: d.Infer<typeof Instance>[] = [];

  return {
    root,
    project,
    addBatch,
    loadMesh,
    loadTexture,
    whiteTexture,
    boxMesh,
    pickGround,
    /** Clear + refill this frame's instances for a batch. */
    instances(name: string): InstanceSpec[] {
      const b = batches.get(name);
      if (!b) throw new Error(`unknown batch ${name}`);
      return b.specs;
    },
    frame(time: number) {
      ensureTargets();
      updateCamera(time);
      for (const b of batches.values()) {
        scratch.length = 0;
        for (const spec of b.specs.slice(0, b.capacity)) {
          scratch.push({
            pos: d.vec3f(...spec.pos),
            rotCS: d.vec2f(Math.cos(spec.rot), Math.sin(spec.rot)),
            scl: d.vec3f(...spec.scl),
            tint: d.vec3f(...spec.tint),
            glow: spec.glow,
          });
        }
        while (scratch.length < b.capacity) scratch.push(HIDDEN);
        b.buf.write(scratch);
      }
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: msaaView as GPUTextureView,
            resolveTarget: context.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'discard',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
        depthStencilAttachment: {
          view: depthView as GPUTextureView,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard',
          depthClearValue: 1,
        },
      });
      for (const b of batches.values()) {
        const n = Math.min(b.specs.length, b.capacity);
        if (n === 0) continue;
        b.draw.with(pass).drawIndexed(b.indexCount, n);
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
  };
}
