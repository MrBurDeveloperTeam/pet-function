import { refineGuluGeometry } from './refinements';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

type SdfVector = readonly [number, number, number];
type SdfTransform = { position?: SdfVector; translation?: SdfVector; rotation?: SdfVector; scale?: SdfVector };
type SdfPrimitive = {
  readonly id: string;
  readonly type: 'sphere' | 'capsule' | 'box' | 'cone' | 'ellipsoid';
  readonly center?: SdfVector;
  readonly radius?: number | SdfVector;
  readonly height?: number;
  readonly size?: SdfVector;
  readonly dimensions?: SdfVector;
  readonly radii?: SdfVector;
  readonly transform?: SdfTransform;
};
type SdfOperation = {
  readonly id?: string;
  readonly output?: string;
  readonly type: 'smooth-union' | 'subtract' | 'intersect';
  readonly left: string;
  readonly right: string;
  readonly radius?: number;
};
type SdfDescriptor = {
  readonly primitives: readonly SdfPrimitive[];
  readonly operations?: readonly SdfOperation[];
  readonly resolution: number;
  readonly bounds?: { readonly min: SdfVector; readonly max: SdfVector };
};
type SdfFunction = (point: THREE.Vector3) => number;

function sdfSphere(point: THREE.Vector3, radius: number): number {
  return point.length() - radius;
}

function sdfCapsule(point: THREE.Vector3, radius: number, height: number): number {
  const halfHeight = height * 0.5;
  const y = Math.max(-halfHeight, Math.min(halfHeight, point.y));
  return point.distanceTo(new THREE.Vector3(0, y, 0)) - radius;
}

function sdfBox(point: THREE.Vector3, size: SdfVector): number {
  const q = new THREE.Vector3(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z))
    .sub(new THREE.Vector3(size[0] * 0.5, size[1] * 0.5, size[2] * 0.5));
  return q.clone().max(new THREE.Vector3()).length() + Math.min(Math.max(q.x, q.y, q.z), 0);
}

function sdfCone(point: THREE.Vector3, radius: number, height: number): number {
  const halfHeight = height * 0.5;
  const taper = radius * (1 - (point.y + halfHeight) / height);
  return Math.max(Math.hypot(point.x, point.z) - Math.max(0, taper), Math.abs(point.y) - halfHeight);
}

function sdfEllipsoid(point: THREE.Vector3, radii: SdfVector): number {
  const scaled = new THREE.Vector3(point.x / radii[0], point.y / radii[1], point.z / radii[2]);
  return (scaled.length() - 1) * Math.min(radii[0], radii[1], radii[2]);
}

function sdfRadii(primitive: SdfPrimitive): SdfVector {
  const radius = primitive.radius;
  if (primitive.radii) return primitive.radii;
  if (typeof radius === 'number') return [radius, radius, radius];
  return radius ?? [0.5, 0.5, 0.5];
}

function smin(left: number, right: number, radius: number): number {
  const blend = Math.max(radius - Math.abs(left - right), 0) / radius;
  return Math.min(left, right) - blend * blend * radius * 0.25;
}

function sdfLocalPoint(point: THREE.Vector3, primitive: SdfPrimitive): { point: THREE.Vector3; scale: number } {
  const transform = primitive.transform;
  const translation = transform?.position ?? transform?.translation ?? primitive.center ?? [0, 0, 0];
  const rotation = transform?.rotation ?? [0, 0, 0];
  const scale = transform?.scale ?? [1, 1, 1];
  const local = point.clone().sub(new THREE.Vector3(translation[0], translation[1], translation[2]));
  const inverseRotation = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2]))
    .invert();
  local.applyQuaternion(inverseRotation);
  local.set(local.x / scale[0], local.y / scale[1], local.z / scale[2]);
  return { point: local, scale: Math.min(scale[0], scale[1], scale[2]) };
}

function sdfPrimitive(point: THREE.Vector3, primitive: SdfPrimitive): number {
  const local = sdfLocalPoint(point, primitive);
  let distance: number;
  switch (primitive.type) {
    case 'sphere':
      distance = sdfSphere(local.point, typeof primitive.radius === 'number' ? primitive.radius : 0.5);
      break;
    case 'capsule':
      distance = sdfCapsule(local.point, typeof primitive.radius === 'number' ? primitive.radius : 0.25, primitive.height ?? 1);
      break;
    case 'box':
      distance = sdfBox(local.point, primitive.size ?? primitive.dimensions ?? [1, 1, 1]);
      break;
    case 'cone':
      distance = sdfCone(local.point, typeof primitive.radius === 'number' ? primitive.radius : 0.5, primitive.height ?? 1);
      break;
    case 'ellipsoid':
      distance = sdfEllipsoid(local.point, sdfRadii(primitive));
      break;
  }
  return distance * local.scale;
}

function sdfSample(descriptor: SdfDescriptor): SdfFunction {
  const nodes = new Map<string, SdfFunction>();
  for (const primitive of descriptor.primitives) nodes.set(primitive.id, (point) => sdfPrimitive(point, primitive));
  let result = descriptor.primitives.length > 0 ? nodes.get(descriptor.primitives[0].id) : undefined;
  for (let index = 0; index < (descriptor.operations?.length ?? 0); index += 1) {
    const operation = descriptor.operations?.[index];
    if (!operation) continue;
    const left = nodes.get(operation.left);
    const right = nodes.get(operation.right);
    if (!left || !right) continue;
    let combined: SdfFunction;
    switch (operation.type) {
      case 'smooth-union':
        combined = (point) => smin(left(point), right(point), operation.radius ?? 0.1);
        break;
      case 'subtract':
        combined = (point) => Math.max(left(point), -right(point));
        break;
      case 'intersect':
        combined = (point) => Math.max(left(point), right(point));
        break;
    }
    nodes.set(operation.id ?? operation.output ?? `operation-${index}`, combined);
    result = combined;
  }
  return result ?? (() => Infinity);
}

function polygonizeSdf(descriptor: SdfDescriptor): THREE.BufferGeometry {
  // SURFACE NETS, not a voxel shell.
  //
  // This used to emit one axis-aligned quad per exposed voxel face, which is a Minecraft surface:
  // every face is axis-aligned, every edge is a 90-degree step, and the result is stair-stepped at
  // exactly the scale of the sampling grid. For a subject whose whole identity is smooth blended
  // organic form -- which is the only kind of subject anyone reaches for an implicit surface to
  // build -- that is worse than the assembled primitives it was meant to replace.
  //
  // Naive surface nets places ONE vertex per sign-changing cell, at the average of the linearly
  // interpolated crossings on that cell's edges, and joins the four cells around each crossing
  // edge into a quad. It is compact, manifold, and smooth, and it is a natural fit for a field
  // that can be sampled anywhere rather than only at corners.
  //
  // Normals come from the field GRADIENT, not from face averaging: the gradient is the exact
  // surface normal of the implicit surface, so shading no longer carries the grid's imprint.
  const resolution = Math.max(4, Math.min(64, Math.floor(descriptor.resolution)));
  const defaultBounds: { readonly min: SdfVector; readonly max: SdfVector } = { min: [-2, -2, -2], max: [2, 2, 2] };
  const bounds = descriptor.bounds ?? defaultBounds;
  const min = new THREE.Vector3(bounds.min[0], bounds.min[1], bounds.min[2]);
  const step = new THREE.Vector3(
    (bounds.max[0] - bounds.min[0]) / resolution,
    (bounds.max[1] - bounds.min[1]) / resolution,
    (bounds.max[2] - bounds.min[2]) / resolution,
  );
  const sample = sdfSample(descriptor);
  const scratch = new THREE.Vector3();

  // Corner grid: one more corner than cells on each axis.
  const side = resolution + 1;
  const field = new Float32Array(side * side * side);
  const cornerAt = (x: number, y: number, z: number): number => (z * side + y) * side + x;
  for (let z = 0; z < side; z += 1) {
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        scratch.set(min.x + x * step.x, min.y + y * step.y, min.z + z * step.z);
        field[cornerAt(x, y, z)] = sample(scratch);
      }
    }
  }

  // The 12 cell edges as corner-offset pairs.
  const CUBE_EDGES: readonly (readonly [number, number, number, number, number, number])[] = [
    [0, 0, 0, 1, 0, 0], [1, 0, 0, 1, 1, 0], [0, 1, 0, 1, 1, 0], [0, 0, 0, 0, 1, 0],
    [0, 0, 1, 1, 0, 1], [1, 0, 1, 1, 1, 1], [0, 1, 1, 1, 1, 1], [0, 0, 1, 0, 1, 1],
    [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [1, 1, 0, 1, 1, 1], [0, 1, 0, 0, 1, 1],
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const cellVertex = new Int32Array(resolution * resolution * resolution).fill(-1);
  const cellAt = (x: number, y: number, z: number): number => (z * resolution + y) * resolution + x;

  // Central-difference gradient, stepped at a fraction of a cell so it follows the field rather
  // than the grid.
  const epsilon = Math.min(step.x, step.y, step.z) * 0.25;
  const gradient = (point: THREE.Vector3): THREE.Vector3 => {
    const gx = sample(scratch.set(point.x + epsilon, point.y, point.z))
      - sample(scratch.set(point.x - epsilon, point.y, point.z));
    const gy = sample(scratch.set(point.x, point.y + epsilon, point.z))
      - sample(scratch.set(point.x, point.y - epsilon, point.z));
    const gz = sample(scratch.set(point.x, point.y, point.z + epsilon))
      - sample(scratch.set(point.x, point.y, point.z - epsilon));
    const normal = new THREE.Vector3(gx, gy, gz);
    // A point where the field is flat has no defined normal; +Y is arbitrary but finite, and
    // leaving a zero vector would poison every lighting calculation downstream.
    return normal.lengthSq() < 1e-20 ? new THREE.Vector3(0, 1, 0) : normal.normalize();
  };

  for (let z = 0; z < resolution; z += 1) {
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        let crossings = 0;
        let sumX = 0;
        let sumY = 0;
        let sumZ = 0;
        for (const [ax, ay, az, bx, by, bz] of CUBE_EDGES) {
          const a = field[cornerAt(x + ax, y + ay, z + az)];
          const b = field[cornerAt(x + bx, y + by, z + bz)];
          if ((a <= 0) === (b <= 0)) continue;
          const t = a / (a - b);
          sumX += (ax + (bx - ax) * t);
          sumY += (ay + (by - ay) * t);
          sumZ += (az + (bz - az) * t);
          crossings += 1;
        }
        if (crossings === 0) continue;
        const px = min.x + (x + sumX / crossings) * step.x;
        const py = min.y + (y + sumY / crossings) * step.y;
        const pz = min.z + (z + sumZ / crossings) * step.z;
        cellVertex[cellAt(x, y, z)] = positions.length / 3;
        positions.push(px, py, pz);
        const normal = gradient(new THREE.Vector3(px, py, pz));
        normals.push(normal.x, normal.y, normal.z);
      }
    }
  }

  // One quad per sign-changing grid edge, joining the four cells that share it.
  //
  // Winding, worked out rather than guessed. For the +x edge from corner (x,y,z), the four cells
  // around it are (x, y-1, z-1), (x, y, z-1), (x, y, z), (x, y-1, z); in the (y,z) plane that
  // traversal is +y, +z, -y, whose cross product is +x. So when the corner is INSIDE and its
  // neighbour is outside, the unflipped order already faces out, and the flip belongs on the
  // opposite case. Getting this backwards is invisible in the normals -- those come from the
  // gradient and stay correct -- and shows only as back-face culling removing the front surface,
  // i.e. the model rendering as a hollow shell with its interior visible.
  const quad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) indices.push(a, c, b, a, d, c);
    else indices.push(a, b, c, a, c, d);
  };
  // Each quad joins the FOUR cells sharing one grid edge, so every one of those cells must exist.
  // Bounding only the edge axis and the lower end of the other two let y/z reach `resolution`, which
  // is a corner index, not a cell index: `cellAt` then strides into an unrelated slot (with
  // resolution 8, `cellAt(3, 8, 1)` is 131 -- the slot for cell (3, 0, 2)) or past the end of the
  // array, where a typed-array read yields `undefined`. `undefined < 0` is false, so the guard in
  // `quad` passed it through to `setIndex`, which coerces it to 0. Measured on a sphere reaching its
  // own bounds at resolution 8: 60 out-of-range reads and 108 aliased reads. A surface that touches
  // the sampling box is therefore left OPEN at that face rather than closed with wrong triangles --
  // pad `bounds` past the surface to get a closed mesh.
  for (let z = 0; z < side; z += 1) {
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const here = field[cornerAt(x, y, z)] <= 0;
        if (x + 1 < side && y > 0 && z > 0 && y < side - 1 && z < side - 1
          && here !== (field[cornerAt(x + 1, y, z)] <= 0)) {
          quad(
            cellVertex[cellAt(x, y - 1, z - 1)], cellVertex[cellAt(x, y, z - 1)],
            cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x, y - 1, z)], !here,
          );
        }
        if (y + 1 < side && x > 0 && z > 0 && x < side - 1 && z < side - 1
          && here !== (field[cornerAt(x, y + 1, z)] <= 0)) {
          quad(
            cellVertex[cellAt(x - 1, y, z - 1)], cellVertex[cellAt(x - 1, y, z)],
            cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x, y, z - 1)], !here,
          );
        }
        if (z + 1 < side && x > 0 && y > 0 && x < side - 1 && y < side - 1
          && here !== (field[cornerAt(x, y, z + 1)] <= 0)) {
          quad(
            cellVertex[cellAt(x - 1, y - 1, z)], cellVertex[cellAt(x, y - 1, z)],
            cellVertex[cellAt(x, y, z)], cellVertex[cellAt(x - 1, y, z)], !here,
          );
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function buildTubeGeometry(
  path: { points: [number, number, number][]; radius?: number; radialSegments?: number; closed?: boolean },
): THREE.TubeGeometry {
  const vectors = path.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(vectors, path.closed ?? false);
  const tubularSegments = Math.max(8, path.points.length * 6);
  return new THREE.TubeGeometry(curve, tubularSegments, path.radius ?? 0.05, path.radialSegments ?? 8, path.closed ?? false);
}

type TaperedStation = { position: [number, number, number]; rx: number; rz: number; twist?: number };

// Frames come from PARALLEL TRANSPORT, not from a Frenet frame. A Frenet frame is defined by
// the curve's normal, which flips sign wherever the path has an inflection or straightens out,
// and every flip twists the surface 180 degrees within one segment. Carrying the previous frame
// forward and removing only its along-path component keeps the twist continuous. THREE's own
// extrudePath and TubeGeometry do not expose this, which is why this is hand-built.
function buildTaperedSweepGeometry(
  sweep: { stations: TaperedStation[]; radialSegments?: number; capEnds?: boolean },
): THREE.BufferGeometry {
  const stations = sweep.stations;
  if (stations.length < 2) throw new Error('tapered-sweep needs at least two stations');
  const radial = Math.max(3, sweep.radialSegments ?? 10);
  const centres = stations.map((s) => new THREE.Vector3(...s.position));

  const tangents = centres.map((_, i) => {
    const prev = centres[Math.max(0, i - 1)];
    const next = centres[Math.min(centres.length - 1, i + 1)];
    const t = next.clone().sub(prev);
    // Coincident neighbours would normalise to NaN and poison every downstream vertex.
    return t.lengthSq() < 1e-12 ? new THREE.Vector3(0, 1, 0) : t.normalize();
  });

  // Seed a reference axis that is not parallel to the first tangent, or the first cross
  // product is degenerate and the whole sweep collapses to a line.
  let ref = new THREE.Vector3(0, 0, 1);
  if (Math.abs(tangents[0].dot(ref)) > 0.9) ref = new THREE.Vector3(1, 0, 0);

  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];
  let carried = ref.clone().sub(tangents[0].clone().multiplyScalar(ref.dot(tangents[0]))).normalize();
  for (let i = 0; i < tangents.length; i += 1) {
    const t = tangents[i];
    // Project the carried frame back onto the plane perpendicular to this tangent.
    const n = carried.clone().sub(t.clone().multiplyScalar(carried.dot(t)));
    if (n.lengthSq() < 1e-12) {
      const fallback = Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      n.copy(fallback.sub(t.clone().multiplyScalar(fallback.dot(t))));
    }
    n.normalize();
    normals.push(n);
    binormals.push(new THREE.Vector3().crossVectors(t, n).normalize());
    carried = n;
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringStart: number[] = [];
  const isPoint: boolean[] = [];

  for (let i = 0; i < stations.length; i += 1) {
    const st = stations[i];
    const v = i / (stations.length - 1);
    ringStart.push(positions.length / 3);
    // A station whose section has collapsed emits ONE vertex, not a ring of radius zero.
    // A degenerate ring still carries `radial` coincident vertices and `radial` zero-area
    // triangles, so the lock ends in a blunt cap the width of the floating-point noise
    // rather than at a point -- and a hair lock, a horn or a blade tip has to reach a point.
    if (st.rx <= 1e-6 && st.rz <= 1e-6) {
      isPoint.push(true);
      positions.push(centres[i].x, centres[i].y, centres[i].z);
      uvs.push(0.5, v);
      continue;
    }
    isPoint.push(false);
    const twist = ((st.twist ?? 0) * Math.PI) / 180;
    for (let j = 0; j <= radial; j += 1) {
      const theta = (j / radial) * Math.PI * 2 + twist;
      const offset = normals[i].clone().multiplyScalar(Math.cos(theta) * st.rx)
        .add(binormals[i].clone().multiplyScalar(Math.sin(theta) * st.rz));
      const p = centres[i].clone().add(offset);
      positions.push(p.x, p.y, p.z);
      uvs.push(j / radial, v);
    }
  }

  for (let i = 0; i < stations.length - 1; i += 1) {
    const a0 = ringStart[i];
    const b0 = ringStart[i + 1];
    if (isPoint[i] && isPoint[i + 1]) continue;   // two collapsed stations bound nothing
    for (let j = 0; j < radial; j += 1) {
      // Wound so the face normal points radially OUTWARD.
      //
      // Ring vertices advance from `normal` toward `binormal`, and binormal is
      // tangent x normal, so increasing theta runs counter-clockwise seen from the
      // far end of the segment. Taking the ring-to-ring edge first therefore puts
      // the cross product on the inside. Measured as signed volume on the built
      // mesh: every tapered-sweep came out negative -- a torso at -0.0674 and a
      // tail at -0.0044 against a positive ellipsoid head -- so every sweep this
      // generator has ever emitted rendered its back faces, with normals pointing
      // into the solid and every lighting judgement made on the wrong surface.
      if (isPoint[i]) indices.push(a0, b0 + j + 1, b0 + j);
      else if (isPoint[i + 1]) indices.push(a0 + j, a0 + j + 1, b0);
      else indices.push(a0 + j, a0 + j + 1, b0 + j, a0 + j + 1, b0 + j + 1, b0 + j);
    }
  }

  if (sweep.capEnds ?? true) {
    for (const end of [0, stations.length - 1]) {
      if (isPoint[end]) continue;   // a point end is already closed
      const centreIndex = positions.length / 3;
      positions.push(centres[end].x, centres[end].y, centres[end].z);
      uvs.push(0.5, end === 0 ? 0 : 1);
      const base = ringStart[end];
      for (let j = 0; j < radial; j += 1) {
        if (end === 0) indices.push(centreIndex, base + j + 1, base + j);
        else indices.push(centreIndex, base + j, base + j + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: Gulu seated clay kitten
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createGuluSeatedClayKittenModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "Gulu seated clay kitten";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 40.0, "aspect": 1.0, "orientation": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}, "positionHint": [0.0, 0.0, 3.0], "note": "For likeness work, solve the reference camera (forge/stage1_intake/solve_camera_pose.py) so the review render aligns with the photo and the reference can be projected. Confirm by overlay review."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["hidden"] = createSculptMaterial(
    "hidden",
    {"id": "hidden", "name": "hidden", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#000000", "color": "#000000", "albedo": {"dominant": "#000000", "secondary": ["#000000"]}, "colorVariation": {"palette": ["#000000"], "pattern": "flat", "amplitude": 0, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "roughness": {"base": 1, "variation": 0.02}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "none", "strength": 0, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "clay-finish", "region": "entire surface", "roughness": 1, "evidenceRef": "reference-front.png"}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Uniform neutral clay; coat and fur deferred by user.", "opacity": {"base": 0}},
    options
  );
  materialMap["clay"] = createSculptMaterial(
    "clay",
    {"id": "clay", "name": "clay", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#96938f", "color": "#96938f", "albedo": {"dominant": "#96938f", "secondary": ["#96938f"]}, "colorVariation": {"palette": ["#96938f"], "pattern": "flat", "amplitude": 0, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "roughness": {"base": 0.75, "variation": 0.02}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "none", "strength": 0, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "clay-finish", "region": "entire surface", "roughness": 0.75, "evidenceRef": "reference-front.png"}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Uniform neutral clay; coat and fur deferred by user."},
    options
  );
  materialMap["ocular"] = createSculptMaterial(
    "ocular",
    {"id": "ocular", "name": "ocular", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#a39e98", "color": "#a39e98", "albedo": {"dominant": "#a39e98", "secondary": ["#a39e98"]}, "colorVariation": {"palette": ["#a39e98"], "pattern": "flat", "amplitude": 0, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "roughness": {"base": 0.32, "variation": 0.02}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "none", "strength": 0, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "clay-finish", "region": "entire surface", "roughness": 0.32, "evidenceRef": "reference-front.png"}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Uniform neutral clay; coat and fur deferred by user."},
    options
  );
  materialMap["iris-clay"] = createSculptMaterial(
    "iris-clay",
    {"id": "iris-clay", "name": "iris-clay", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#77736e", "color": "#77736e", "albedo": {"dominant": "#77736e", "secondary": ["#77736e"]}, "colorVariation": {"palette": ["#77736e"], "pattern": "flat", "amplitude": 0, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "roughness": {"base": 0.55, "variation": 0.02}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "none", "strength": 0, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "clay-finish", "region": "entire surface", "roughness": 0.55, "evidenceRef": "reference-front.png"}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Uniform neutral clay; coat and fur deferred by user."},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "root__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "root", "level": "macro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": null, "attachment": null, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "origin", "name": "origin", "position": [0, 0, 0], "rotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_root_0.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "origin", "name": "origin", "position": [0, 0, 0], "rotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "root";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "root", "level": "macro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": null, "attachment": null, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [{"id": "origin", "name": "origin", "position": [0, 0, 0], "rotation": [0, 0, 0]}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_root_0);
  const socket_root_origin_0 = new THREE.Object3D();
  socket_root_origin_0.name = "origin";
  socket_root_origin_0.position.set(0.0, 0.0, 0.0);
  socket_root_origin_0.rotation.set(0.0, 0.0, 0.0);
  socket_root_origin_0.userData.socket = {"id": "origin", "name": "origin", "position": [0, 0, 0], "rotation": [0, 0, 0]};
  node_root_0.add(socket_root_origin_0);
  sockets["root:origin"] = socket_root_origin_0;

  const endpoint_head_1 = makeAttachmentEndpoint(null);
  const node_head_1 = new THREE.Group();
  node_head_1.name = "head__pivot";
  node_head_1.scale.set(1, 1, 1);
  if (endpoint_head_1) {
    node_head_1.position.copy(endpoint_head_1.start);
    node_head_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_head_1.position.set(0.0, 0.0, 0.0);
    node_head_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_head_1.userData.sculptComponent = {"id": "head", "name": "head", "level": "macro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "implicit", "topologyRationale": "Continuous blended anatomical volume measured from Gulu front/profile references.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sdf": {"primitives": [{"id": "cranium", "type": "ellipsoid", "center": [0, 0.704, 0], "radii": [0.292, 0.229, 0.228]}, {"id": "chin", "type": "ellipsoid", "center": [0, 0.539, 0.13], "radii": [0.151, 0.071, 0.131]}, {"id": "cheek-l", "type": "ellipsoid", "center": [0.136, 0.626, 0.098], "radii": [0.126, 0.111, 0.117]}, {"id": "cheek-r", "type": "ellipsoid", "center": [-0.136, 0.626, 0.098], "radii": [0.126, 0.111, 0.117]}, {"id": "muzzle-l", "type": "ellipsoid", "center": [0.042, 0.574, 0.224], "radii": [0.06, 0.044, 0.053]}, {"id": "muzzle-r", "type": "ellipsoid", "center": [-0.042, 0.574, 0.224], "radii": [0.06, 0.044, 0.053]}, {"id": "bridge", "type": "ellipsoid", "center": [0, 0.633, 0.206], "radii": [0.044, 0.079, 0.071]}, {"id": "socket-l", "type": "ellipsoid", "center": [0.124, 0.6829999999999999, 0.21], "radii": [0.069, 0.07, 0.064]}, {"id": "socket-r", "type": "ellipsoid", "center": [-0.124, 0.6829999999999999, 0.21], "radii": [0.069, 0.07, 0.064]}, {"id": "earblend-l-0", "type": "ellipsoid", "center": [0.207, 0.839, 0], "radii": [0.109, 0.112, 0.066]}, {"id": "earblend-l-1", "type": "ellipsoid", "center": [0.244, 0.911, -0.003], "radii": [0.065, 0.084, 0.054]}, {"id": "earblend-l-2", "type": "ellipsoid", "center": [0.273, 0.974, -0.009], "radii": [0.025, 0.033, 0.036]}, {"id": "earblend-r-0", "type": "ellipsoid", "center": [-0.207, 0.839, 0], "radii": [0.109, 0.112, 0.066]}, {"id": "earblend-r-1", "type": "ellipsoid", "center": [-0.244, 0.911, -0.003], "radii": [0.065, 0.084, 0.054]}, {"id": "earblend-r-2", "type": "ellipsoid", "center": [-0.273, 0.974, -0.009], "radii": [0.025, 0.033, 0.036]}, {"id": "concha-cut-l", "type": "ellipsoid", "center": [0.219, 0.867, 0.063], "radii": [0.057, 0.054, 0.052], "transform": {"position": [0.219, 0.867, 0.063], "rotation": [0, 0, -0.23]}}, {"id": "concha-cut-r", "type": "ellipsoid", "center": [-0.219, 0.867, 0.063], "radii": [0.057, 0.054, 0.052], "transform": {"position": [-0.219, 0.867, 0.063], "rotation": [0, 0, 0.23]}}, {"id": "nape-volume", "type": "ellipsoid", "center": [0, 0.704, 0], "radii": [0.001, 0.001, 0.001]}, {"id": "concha-upper-l", "type": "ellipsoid", "center": [0.247, 0.926, 0.067], "radii": [0.033, 0.042, 0.041]}, {"id": "concha-upper-r", "type": "ellipsoid", "center": [-0.247, 0.926, 0.067], "radii": [0.033, 0.042, 0.041]}, {"id": "nasal-root", "type": "ellipsoid", "center": [0, 0.607, 0.237], "radii": [0.026, 0.028, 0.051]}], "operations": [{"id": "join-chin", "type": "smooth-union", "left": "cranium", "right": "chin", "radius": 0.04}, {"id": "join-cheek-l", "type": "smooth-union", "left": "join-chin", "right": "cheek-l", "radius": 0.043}, {"id": "join-cheek-r", "type": "smooth-union", "left": "join-cheek-l", "right": "cheek-r", "radius": 0.043}, {"id": "join-muzzle-l", "type": "smooth-union", "left": "join-cheek-r", "right": "muzzle-l", "radius": 0.018}, {"id": "join-muzzle-r", "type": "smooth-union", "left": "join-muzzle-l", "right": "muzzle-r", "radius": 0.018}, {"id": "join-bridge", "type": "smooth-union", "left": "join-muzzle-r", "right": "bridge", "radius": 0.043}, {"id": "cut-socket-l", "type": "subtract", "left": "join-bridge", "right": "socket-l"}, {"id": "cut-socket-r", "type": "subtract", "left": "cut-socket-l", "right": "socket-r"}, {"id": "joined-earblend-l-0", "type": "smooth-union", "left": "cut-socket-r", "right": "earblend-l-0", "radius": 0.026}, {"id": "joined-earblend-l-1", "type": "smooth-union", "left": "joined-earblend-l-0", "right": "earblend-l-1", "radius": 0.026}, {"id": "joined-earblend-l-2", "type": "smooth-union", "left": "joined-earblend-l-1", "right": "earblend-l-2", "radius": 0.026}, {"id": "joined-earblend-r-0", "type": "smooth-union", "left": "joined-earblend-l-2", "right": "earblend-r-0", "radius": 0.026}, {"id": "joined-earblend-r-1", "type": "smooth-union", "left": "joined-earblend-r-0", "right": "earblend-r-1", "radius": 0.026}, {"id": "joined-earblend-r-2", "type": "smooth-union", "left": "joined-earblend-r-1", "right": "earblend-r-2", "radius": 0.026}, {"id": "ear-cavity-l", "type": "smooth-union", "left": "concha-cut-l", "right": "concha-upper-l", "radius": 0.02}, {"id": "concha-recess-l", "type": "subtract", "left": "joined-earblend-r-2", "right": "ear-cavity-l"}, {"id": "ear-cavity-r", "type": "smooth-union", "left": "concha-cut-r", "right": "concha-upper-r", "radius": 0.02}, {"id": "concha-recess-r", "type": "subtract", "left": "concha-recess-l", "right": "ear-cavity-r"}, {"id": "joined-nape", "type": "smooth-union", "left": "concha-recess-r", "right": "nape-volume", "radius": 0.035}, {"id": "joined-nasal-root", "type": "smooth-union", "left": "joined-nape", "right": "nasal-root", "radius": 0.023}], "resolution": 64, "bounds": {"min": [-0.36, 0.34, -0.28], "max": [0.36, 1.065, 0.4]}}, "relaxation": {"type": "Taubin", "passes": 8, "lambda": 0.22, "mu": -0.225}, "mouthRefinement": {"method": "continuous skin relief with paired whisker pads, upper lips, lip cleft and lower lip", "subdivision": 1, "padAmplitude": 0.003, "cleftDepth": 0.005, "lowerLipAmplitude": 0.0015, "noFloatingMouthCurve": true, "reference": "three user-provided head closeups; true paired muzzle masses, embedded nasal root", "cleftWidth": 0.004, "cleftOcclusion": "grey vertex shading on actual recessed surface", "cleftOcclusionStrength": 0.58}, "earRefinement": {"method": "three smoothly joined tapering ellipsoids per ear and inset concha", "roundedTipRadius": 0.029, "embeddedRoot": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "eye-sockets", "kind": "contour", "description": "subtract socket depth .073", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}, {"id": "cheek-volume", "kind": "contour", "description": "continuous smooth blend", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}, {"id": "muzzle-pads", "kind": "contour", "description": "two short pads joined to face", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}, {"id": "chin-setback", "kind": "contour", "description": "chin behind nose", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_head_1.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_head_1);
  nodes["head"] = node_head_1;
  const mesh_head_1Geometry = polygonizeSdf({"primitives": [{"id": "cranium", "type": "ellipsoid", "center": [0, 0.704, 0], "radii": [0.292, 0.229, 0.228]}, {"id": "chin", "type": "ellipsoid", "center": [0, 0.539, 0.13], "radii": [0.151, 0.071, 0.131]}, {"id": "cheek-l", "type": "ellipsoid", "center": [0.136, 0.626, 0.098], "radii": [0.126, 0.111, 0.117]}, {"id": "cheek-r", "type": "ellipsoid", "center": [-0.136, 0.626, 0.098], "radii": [0.126, 0.111, 0.117]}, {"id": "muzzle-l", "type": "ellipsoid", "center": [0.042, 0.574, 0.224], "radii": [0.06, 0.044, 0.053]}, {"id": "muzzle-r", "type": "ellipsoid", "center": [-0.042, 0.574, 0.224], "radii": [0.06, 0.044, 0.053]}, {"id": "bridge", "type": "ellipsoid", "center": [0, 0.633, 0.206], "radii": [0.044, 0.079, 0.071]}, {"id": "socket-l", "type": "ellipsoid", "center": [0.124, 0.6829999999999999, 0.21], "radii": [0.069, 0.07, 0.064]}, {"id": "socket-r", "type": "ellipsoid", "center": [-0.124, 0.6829999999999999, 0.21], "radii": [0.069, 0.07, 0.064]}, {"id": "earblend-l-0", "type": "ellipsoid", "center": [0.207, 0.839, 0], "radii": [0.109, 0.112, 0.066]}, {"id": "earblend-l-1", "type": "ellipsoid", "center": [0.244, 0.911, -0.003], "radii": [0.065, 0.084, 0.054]}, {"id": "earblend-l-2", "type": "ellipsoid", "center": [0.273, 0.974, -0.009], "radii": [0.025, 0.033, 0.036]}, {"id": "earblend-r-0", "type": "ellipsoid", "center": [-0.207, 0.839, 0], "radii": [0.109, 0.112, 0.066]}, {"id": "earblend-r-1", "type": "ellipsoid", "center": [-0.244, 0.911, -0.003], "radii": [0.065, 0.084, 0.054]}, {"id": "earblend-r-2", "type": "ellipsoid", "center": [-0.273, 0.974, -0.009], "radii": [0.025, 0.033, 0.036]}, {"id": "concha-cut-l", "type": "ellipsoid", "center": [0.219, 0.867, 0.063], "radii": [0.057, 0.054, 0.052], "transform": {"position": [0.219, 0.867, 0.063], "rotation": [0, 0, -0.23]}}, {"id": "concha-cut-r", "type": "ellipsoid", "center": [-0.219, 0.867, 0.063], "radii": [0.057, 0.054, 0.052], "transform": {"position": [-0.219, 0.867, 0.063], "rotation": [0, 0, 0.23]}}, {"id": "nape-volume", "type": "ellipsoid", "center": [0, 0.704, 0], "radii": [0.001, 0.001, 0.001]}, {"id": "concha-upper-l", "type": "ellipsoid", "center": [0.247, 0.926, 0.067], "radii": [0.033, 0.042, 0.041]}, {"id": "concha-upper-r", "type": "ellipsoid", "center": [-0.247, 0.926, 0.067], "radii": [0.033, 0.042, 0.041]}, {"id": "nasal-root", "type": "ellipsoid", "center": [0, 0.607, 0.237], "radii": [0.026, 0.028, 0.051]}], "operations": [{"id": "join-chin", "type": "smooth-union", "left": "cranium", "right": "chin", "radius": 0.04}, {"id": "join-cheek-l", "type": "smooth-union", "left": "join-chin", "right": "cheek-l", "radius": 0.043}, {"id": "join-cheek-r", "type": "smooth-union", "left": "join-cheek-l", "right": "cheek-r", "radius": 0.043}, {"id": "join-muzzle-l", "type": "smooth-union", "left": "join-cheek-r", "right": "muzzle-l", "radius": 0.018}, {"id": "join-muzzle-r", "type": "smooth-union", "left": "join-muzzle-l", "right": "muzzle-r", "radius": 0.018}, {"id": "join-bridge", "type": "smooth-union", "left": "join-muzzle-r", "right": "bridge", "radius": 0.043}, {"id": "cut-socket-l", "type": "subtract", "left": "join-bridge", "right": "socket-l"}, {"id": "cut-socket-r", "type": "subtract", "left": "cut-socket-l", "right": "socket-r"}, {"id": "joined-earblend-l-0", "type": "smooth-union", "left": "cut-socket-r", "right": "earblend-l-0", "radius": 0.026}, {"id": "joined-earblend-l-1", "type": "smooth-union", "left": "joined-earblend-l-0", "right": "earblend-l-1", "radius": 0.026}, {"id": "joined-earblend-l-2", "type": "smooth-union", "left": "joined-earblend-l-1", "right": "earblend-l-2", "radius": 0.026}, {"id": "joined-earblend-r-0", "type": "smooth-union", "left": "joined-earblend-l-2", "right": "earblend-r-0", "radius": 0.026}, {"id": "joined-earblend-r-1", "type": "smooth-union", "left": "joined-earblend-r-0", "right": "earblend-r-1", "radius": 0.026}, {"id": "joined-earblend-r-2", "type": "smooth-union", "left": "joined-earblend-r-1", "right": "earblend-r-2", "radius": 0.026}, {"id": "ear-cavity-l", "type": "smooth-union", "left": "concha-cut-l", "right": "concha-upper-l", "radius": 0.02}, {"id": "concha-recess-l", "type": "subtract", "left": "joined-earblend-r-2", "right": "ear-cavity-l"}, {"id": "ear-cavity-r", "type": "smooth-union", "left": "concha-cut-r", "right": "concha-upper-r", "radius": 0.02}, {"id": "concha-recess-r", "type": "subtract", "left": "concha-recess-l", "right": "ear-cavity-r"}, {"id": "joined-nape", "type": "smooth-union", "left": "concha-recess-r", "right": "nape-volume", "radius": 0.035}, {"id": "joined-nasal-root", "type": "smooth-union", "left": "joined-nape", "right": "nasal-root", "radius": 0.023}], "resolution": 64, "bounds": {"min": [-0.36, 0.34, -0.28], "max": [0.36, 1.065, 0.4]}});
  if (!endpoint_head_1) {
    mesh_head_1Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_head_1 = new THREE.Mesh(
    mesh_head_1Geometry,
    createSculptMaterial("clay", {"id": "clay", "name": "clay", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#96938f", "color": "#96938f", "albedo": {"dominant": "#96938f", "secondary": ["#96938f"]}, "colorVariation": {"palette": ["#96938f"], "pattern": "flat", "amplitude": 0, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "roughness": {"base": 0.75, "variation": 0.02}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "none", "strength": 0, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "clay-finish", "region": "entire surface", "roughness": 0.75, "evidenceRef": "reference-front.png"}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Uniform neutral clay; coat and fur deferred by user."}, options, true)
  );
  mesh_head_1.name = "head";
  if (endpoint_head_1) {
    mesh_head_1.position.copy(endpoint_head_1.midpoint);
    mesh_head_1.quaternion.copy(endpoint_head_1.quaternion);
  }
  mesh_head_1.castShadow = options.castShadow ?? true;
  mesh_head_1.receiveShadow = options.receiveShadow ?? true;
  mesh_head_1.userData.sculptComponent = {"id": "head", "name": "head", "level": "macro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "implicit", "topologyRationale": "Continuous blended anatomical volume measured from Gulu front/profile references.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sdf": {"primitives": [{"id": "cranium", "type": "ellipsoid", "center": [0, 0.704, 0], "radii": [0.292, 0.229, 0.228]}, {"id": "chin", "type": "ellipsoid", "center": [0, 0.539, 0.13], "radii": [0.151, 0.071, 0.131]}, {"id": "cheek-l", "type": "ellipsoid", "center": [0.136, 0.626, 0.098], "radii": [0.126, 0.111, 0.117]}, {"id": "cheek-r", "type": "ellipsoid", "center": [-0.136, 0.626, 0.098], "radii": [0.126, 0.111, 0.117]}, {"id": "muzzle-l", "type": "ellipsoid", "center": [0.042, 0.574, 0.224], "radii": [0.06, 0.044, 0.053]}, {"id": "muzzle-r", "type": "ellipsoid", "center": [-0.042, 0.574, 0.224], "radii": [0.06, 0.044, 0.053]}, {"id": "bridge", "type": "ellipsoid", "center": [0, 0.633, 0.206], "radii": [0.044, 0.079, 0.071]}, {"id": "socket-l", "type": "ellipsoid", "center": [0.124, 0.6829999999999999, 0.21], "radii": [0.069, 0.07, 0.064]}, {"id": "socket-r", "type": "ellipsoid", "center": [-0.124, 0.6829999999999999, 0.21], "radii": [0.069, 0.07, 0.064]}, {"id": "earblend-l-0", "type": "ellipsoid", "center": [0.207, 0.839, 0], "radii": [0.109, 0.112, 0.066]}, {"id": "earblend-l-1", "type": "ellipsoid", "center": [0.244, 0.911, -0.003], "radii": [0.065, 0.084, 0.054]}, {"id": "earblend-l-2", "type": "ellipsoid", "center": [0.273, 0.974, -0.009], "radii": [0.025, 0.033, 0.036]}, {"id": "earblend-r-0", "type": "ellipsoid", "center": [-0.207, 0.839, 0], "radii": [0.109, 0.112, 0.066]}, {"id": "earblend-r-1", "type": "ellipsoid", "center": [-0.244, 0.911, -0.003], "radii": [0.065, 0.084, 0.054]}, {"id": "earblend-r-2", "type": "ellipsoid", "center": [-0.273, 0.974, -0.009], "radii": [0.025, 0.033, 0.036]}, {"id": "concha-cut-l", "type": "ellipsoid", "center": [0.219, 0.867, 0.063], "radii": [0.057, 0.054, 0.052], "transform": {"position": [0.219, 0.867, 0.063], "rotation": [0, 0, -0.23]}}, {"id": "concha-cut-r", "type": "ellipsoid", "center": [-0.219, 0.867, 0.063], "radii": [0.057, 0.054, 0.052], "transform": {"position": [-0.219, 0.867, 0.063], "rotation": [0, 0, 0.23]}}, {"id": "nape-volume", "type": "ellipsoid", "center": [0, 0.704, 0], "radii": [0.001, 0.001, 0.001]}, {"id": "concha-upper-l", "type": "ellipsoid", "center": [0.247, 0.926, 0.067], "radii": [0.033, 0.042, 0.041]}, {"id": "concha-upper-r", "type": "ellipsoid", "center": [-0.247, 0.926, 0.067], "radii": [0.033, 0.042, 0.041]}, {"id": "nasal-root", "type": "ellipsoid", "center": [0, 0.607, 0.237], "radii": [0.026, 0.028, 0.051]}], "operations": [{"id": "join-chin", "type": "smooth-union", "left": "cranium", "right": "chin", "radius": 0.04}, {"id": "join-cheek-l", "type": "smooth-union", "left": "join-chin", "right": "cheek-l", "radius": 0.043}, {"id": "join-cheek-r", "type": "smooth-union", "left": "join-cheek-l", "right": "cheek-r", "radius": 0.043}, {"id": "join-muzzle-l", "type": "smooth-union", "left": "join-cheek-r", "right": "muzzle-l", "radius": 0.018}, {"id": "join-muzzle-r", "type": "smooth-union", "left": "join-muzzle-l", "right": "muzzle-r", "radius": 0.018}, {"id": "join-bridge", "type": "smooth-union", "left": "join-muzzle-r", "right": "bridge", "radius": 0.043}, {"id": "cut-socket-l", "type": "subtract", "left": "join-bridge", "right": "socket-l"}, {"id": "cut-socket-r", "type": "subtract", "left": "cut-socket-l", "right": "socket-r"}, {"id": "joined-earblend-l-0", "type": "smooth-union", "left": "cut-socket-r", "right": "earblend-l-0", "radius": 0.026}, {"id": "joined-earblend-l-1", "type": "smooth-union", "left": "joined-earblend-l-0", "right": "earblend-l-1", "radius": 0.026}, {"id": "joined-earblend-l-2", "type": "smooth-union", "left": "joined-earblend-l-1", "right": "earblend-l-2", "radius": 0.026}, {"id": "joined-earblend-r-0", "type": "smooth-union", "left": "joined-earblend-l-2", "right": "earblend-r-0", "radius": 0.026}, {"id": "joined-earblend-r-1", "type": "smooth-union", "left": "joined-earblend-r-0", "right": "earblend-r-1", "radius": 0.026}, {"id": "joined-earblend-r-2", "type": "smooth-union", "left": "joined-earblend-r-1", "right": "earblend-r-2", "radius": 0.026}, {"id": "ear-cavity-l", "type": "smooth-union", "left": "concha-cut-l", "right": "concha-upper-l", "radius": 0.02}, {"id": "concha-recess-l", "type": "subtract", "left": "joined-earblend-r-2", "right": "ear-cavity-l"}, {"id": "ear-cavity-r", "type": "smooth-union", "left": "concha-cut-r", "right": "concha-upper-r", "radius": 0.02}, {"id": "concha-recess-r", "type": "subtract", "left": "concha-recess-l", "right": "ear-cavity-r"}, {"id": "joined-nape", "type": "smooth-union", "left": "concha-recess-r", "right": "nape-volume", "radius": 0.035}, {"id": "joined-nasal-root", "type": "smooth-union", "left": "joined-nape", "right": "nasal-root", "radius": 0.023}], "resolution": 64, "bounds": {"min": [-0.36, 0.34, -0.28], "max": [0.36, 1.065, 0.4]}}, "relaxation": {"type": "Taubin", "passes": 8, "lambda": 0.22, "mu": -0.225}, "mouthRefinement": {"method": "continuous skin relief with paired whisker pads, upper lips, lip cleft and lower lip", "subdivision": 1, "padAmplitude": 0.003, "cleftDepth": 0.005, "lowerLipAmplitude": 0.0015, "noFloatingMouthCurve": true, "reference": "three user-provided head closeups; true paired muzzle masses, embedded nasal root", "cleftWidth": 0.004, "cleftOcclusion": "grey vertex shading on actual recessed surface", "cleftOcclusionStrength": 0.58}, "earRefinement": {"method": "three smoothly joined tapering ellipsoids per ear and inset concha", "roundedTipRadius": 0.029, "embeddedRoot": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "eye-sockets", "kind": "contour", "description": "subtract socket depth .073", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}, {"id": "cheek-volume", "kind": "contour", "description": "continuous smooth blend", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}, {"id": "muzzle-pads", "kind": "contour", "description": "two short pads joined to face", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}, {"id": "chin-setback", "kind": "contour", "description": "chin behind nose", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_head_1.add(mesh_head_1);
  meshes["head"] = mesh_head_1;
  colliders["head"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_head_1);

  const endpoint_body_2 = makeAttachmentEndpoint(null);
  const node_body_2 = new THREE.Group();
  node_body_2.name = "body__pivot";
  node_body_2.scale.set(1, 1, 1);
  if (endpoint_body_2) {
    node_body_2.position.copy(endpoint_body_2.start);
    node_body_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_body_2.position.set(0.0, 0.0, 0.0);
    node_body_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_body_2.userData.sculptComponent = {"id": "body", "name": "body", "level": "macro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "implicit", "topologyRationale": "Continuous blended anatomical volume measured from Gulu front/profile references.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sdf": {"primitives": [{"id": "pelvis", "type": "ellipsoid", "center": [0, 0.201, -0.11], "radii": [0.232, 0.207, 0.187]}, {"id": "chest", "type": "ellipsoid", "center": [0, 0.351, -0.037], "radii": [0.21, 0.185, 0.168]}, {"id": "neck", "type": "ellipsoid", "center": [0, 0.47, -0.005], "radii": [0.164, 0.151, 0.132]}, {"id": "haunch-l", "type": "ellipsoid", "center": [0.18655, 0.177, -0.064], "radii": [0.11592000000000001, 0.155, 0.176]}, {"id": "shoulder-l", "type": "ellipsoid", "center": [0.133, 0.302, 0.082], "radii": [0.099, 0.128, 0.1]}, {"id": "foreleg-l", "type": "ellipsoid", "center": [0.116, 0.191, 0.153], "radii": [0.076, 0.136, 0.078], "transform": {"position": [0.116, 0.191, 0.153], "rotation": [0.16, 0, 0.19]}}, {"id": "paw-l", "type": "ellipsoid", "center": [0.104, 0.055, 0.181], "radii": [0.092, 0.055, 0.097]}, {"id": "rearpaw-l", "type": "ellipsoid", "center": [0.2115, 0.04, 0.052], "radii": [0.08742000000000001, 0.042, 0.09]}, {"id": "haunch-r", "type": "ellipsoid", "center": [-0.18655, 0.177, -0.064], "radii": [0.11592000000000001, 0.155, 0.176]}, {"id": "shoulder-r", "type": "ellipsoid", "center": [-0.133, 0.302, 0.082], "radii": [0.099, 0.128, 0.1]}, {"id": "foreleg-r", "type": "ellipsoid", "center": [-0.116, 0.191, 0.153], "radii": [0.076, 0.136, 0.078], "transform": {"position": [-0.116, 0.191, 0.153], "rotation": [0.16, 0, -0.19]}}, {"id": "paw-r", "type": "ellipsoid", "center": [-0.104, 0.055, 0.181], "radii": [0.092, 0.055, 0.097]}, {"id": "rearpaw-r", "type": "ellipsoid", "center": [-0.2115, 0.04, 0.052], "radii": [0.08742000000000001, 0.042, 0.09]}, {"id": "tail-field-0", "type": "capsule", "radius": 0.067, "height": 0.025882433573691545, "transform": {"position": [-0.1727293858001503, 0.11369322877535688, -0.15165848046581518], "rotation": [2.994609468352794, 0, 1.3896137736396341]}}, {"id": "tail-field-1", "type": "capsule", "radius": 0.06699848828420257, "height": 0.02457727171411984, "transform": {"position": [-0.19770496806912097, 0.11067294327573253, -0.15058748121712995], "rotation": [2.345130834891972, 0, 1.487663454679504]}}, {"id": "tail-field-2", "type": "capsule", "radius": 0.06698790627362056, "height": 0.023579263032775136, "transform": {"position": [-0.22166486664162283, 0.11074027986476334, -0.14877408903080389], "rotation": [0.9465096946472127, 0, 1.4572421110049354]}}, {"id": "tail-field-3", "type": "capsule", "radius": 0.0669591836734694, "height": 0.022858622695718464, "transform": {"position": [-0.24451047145003754, 0.11369745492111194, -0.1462853587528174], "rotation": [0.5732054435169892, 0, 1.3421690538334543]}}, {"id": "tail-field-4", "type": "capsule", "radius": 0.06690325018896448, "height": 0.022377789414111168, "transform": {"position": [-0.2661431724267468, 0.11934668482344102, -0.14318834522915097], "rotation": [0.4534008963395336, 0, 1.2182653544014908]}}, {"id": "tail-field-5", "type": "capsule", "radius": 0.06681103552532125, "height": 0.02209448742776045, "transform": {"position": [-0.2864643595041322, 0.12749018595041323, -0.1395501033057851], "rotation": [0.3947846947767709, 0, 1.0950359283172746]}}, {"id": "tail-field-6", "type": "capsule", "radius": 0.0666734693877551, "height": 0.021965374054911065, "transform": {"position": [-0.3053754226145755, 0.13793017468069121, -0.13543768782870022], "rotation": [0.3592031942665165, 0, 0.9750460033676565]}}, {"id": "tail-field-7", "type": "capsule", "radius": 0.06648148148148149, "height": 0.02194943320388646, "transform": {"position": [-0.3227777516904583, 0.15046886739293766, -0.13091815364387677], "rotation": [0.334555755937379, 0, 0.8592388357218985]}}, {"id": "tail-field-8", "type": "capsule", "radius": 0.0662260015117158, "height": 0.022010556542853995, "transform": {"position": [-0.3385727366641622, 0.1649084804658152, -0.12605855559729523], "rotation": [0.3158325272882141, 0, 0.7477305351019096]}}, {"id": "tail-field-9", "type": "capsule", "radius": 0.06589795918367347, "height": 0.022119154057482396, "transform": {"position": [-0.35266176746806904, 0.18105123027798647, -0.1209259485349361], "rotation": [0.30057538177853144, 0, 0.6401095336781717]}}, {"id": "tail-field-10", "type": "capsule", "radius": 0.06548828420256993, "height": 0.022252935882371327, "transform": {"position": [-0.3649462340345604, 0.19869933320811417, -0.11558738730277984], "rotation": [0.2874212583474562, 0, 0.5356307219719727]}}, {"id": "tail-field-11", "type": "capsule", "radius": 0.06498790627362057, "height": 0.022397133198530345, "transform": {"position": [-0.375327526296018, 0.217655005634861, -0.11010992674680692], "rotation": [0.2755358062855907, 0, 0.43335955198731413]}}, {"id": "tail-field-12", "type": "capsule", "radius": 0.06438775510204083, "height": 0.022544416320715334, "transform": {"position": [-0.38370703418482344, 0.23772046393688956, -0.10456062171299775], "rotation": [0.26436051008282135, 0, 0.3322796950273296]}}, {"id": "tail-field-13", "type": "capsule", "radius": 0.06367876039304611, "height": 0.022694692180414668, "transform": {"position": [-0.3899861476333583, 0.2586979244928625, -0.09900652704733283], "rotation": [0.253486616946458, 0, 0.23137524604094376]}}, {"id": "tail-field-14", "type": "capsule", "radius": 0.06285185185185185, "height": 0.022854871424330295, "transform": {"position": [-0.39406625657400446, 0.2803896036814425, -0.09351469759579265], "rotation": [0.24258561388290212, 0, 0.12969917252989288]}}, {"id": "tail-field-15", "type": "capsule", "radius": 0.061897959183673475, "height": 0.02303861015153231, "transform": {"position": [-0.3958487509391435, 0.30259771788129225, -0.08815218820435763], "rotation": [0.23136642478093866, 0, 0.0264384662974917]}}, {"id": "tail-field-16", "type": "capsule", "radius": 0.06080801209372638, "height": 0.023265959711272287, "transform": {"position": [-0.395235020661157, 0.32512448347107437, -0.08298605371900827], "rotation": [0.2195451427347692, 0, -0.07901705401893028]}}, {"id": "tail-field-17", "type": "capsule", "radius": 0.059572940287226005, "height": 0.02356280435218663, "transform": {"position": [-0.39212645567242677, 0.3477721168294515, -0.07808334898572503], "rotation": [0.20681954622888052, 0, -0.18700111914932763]}}, {"id": "tail-field-18", "type": "capsule", "radius": 0.058183673469387756, "height": 0.023959942049698972, "transform": {"position": [-0.3864244459053343, 0.3703428343350864, -0.07351112885048836], "rotation": [0.19284316360514167, 0, -0.29749931165385696]}}, {"id": "tail-field-19", "type": "capsule", "radius": 0.056631141345427065, "height": 0.024491688342111857, "transform": {"position": [-0.3780303812922614, 0.39263885236664164, -0.06933644815927872], "rotation": [0.1771941175902793, 0, -0.4100947903567617]}}, {"id": "tail-field-20", "type": "capsule", "radius": 0.05490627362055934, "height": 0.02519397546363318, "transform": {"position": [-0.36684565176558975, 0.41446238730277984, -0.06562636175807662], "rotation": [0.15933289247466856, 0, -0.5239529482183023]}}, {"id": "tail-field-21", "type": "capsule", "radius": 0.053000000000000005, "height": 0.026102076290558142, "transform": {"position": [-0.35277164725770094, 0.4356156555221638, -0.06244792449286251], "rotation": [0.13854019353929223, 0, -0.6378644361396799]}}], "operations": [{"id": "join-chest", "type": "smooth-union", "left": "pelvis", "right": "chest", "radius": 0.04}, {"id": "join-neck", "type": "smooth-union", "left": "join-chest", "right": "neck", "radius": 0.04}, {"id": "join-haunch-l", "type": "smooth-union", "left": "join-neck", "right": "haunch-l", "radius": 0.04}, {"id": "join-shoulder-l", "type": "smooth-union", "left": "join-haunch-l", "right": "shoulder-l", "radius": 0.04}, {"id": "join-foreleg-l", "type": "smooth-union", "left": "join-shoulder-l", "right": "foreleg-l", "radius": 0.04}, {"id": "join-paw-l", "type": "smooth-union", "left": "join-foreleg-l", "right": "paw-l", "radius": 0.04}, {"id": "join-rearpaw-l", "type": "smooth-union", "left": "join-paw-l", "right": "rearpaw-l", "radius": 0.04}, {"id": "join-haunch-r", "type": "smooth-union", "left": "join-rearpaw-l", "right": "haunch-r", "radius": 0.04}, {"id": "join-shoulder-r", "type": "smooth-union", "left": "join-haunch-r", "right": "shoulder-r", "radius": 0.04}, {"id": "join-foreleg-r", "type": "smooth-union", "left": "join-shoulder-r", "right": "foreleg-r", "radius": 0.04}, {"id": "join-paw-r", "type": "smooth-union", "left": "join-foreleg-r", "right": "paw-r", "radius": 0.04}, {"id": "join-rearpaw-r", "type": "smooth-union", "left": "join-paw-r", "right": "rearpaw-r", "radius": 0.04}, {"id": "joined-tail-0", "type": "smooth-union", "left": "join-rearpaw-r", "right": "tail-field-0", "radius": 0.055}, {"id": "joined-tail-1", "type": "smooth-union", "left": "joined-tail-0", "right": "tail-field-1", "radius": 0.055}, {"id": "joined-tail-2", "type": "smooth-union", "left": "joined-tail-1", "right": "tail-field-2", "radius": 0.055}, {"id": "joined-tail-3", "type": "smooth-union", "left": "joined-tail-2", "right": "tail-field-3", "radius": 0.055}, {"id": "joined-tail-4", "type": "smooth-union", "left": "joined-tail-3", "right": "tail-field-4", "radius": 0.055}, {"id": "joined-tail-5", "type": "smooth-union", "left": "joined-tail-4", "right": "tail-field-5", "radius": 0.009}, {"id": "joined-tail-6", "type": "smooth-union", "left": "joined-tail-5", "right": "tail-field-6", "radius": 0.009}, {"id": "joined-tail-7", "type": "smooth-union", "left": "joined-tail-6", "right": "tail-field-7", "radius": 0.009}, {"id": "joined-tail-8", "type": "smooth-union", "left": "joined-tail-7", "right": "tail-field-8", "radius": 0.009}, {"id": "joined-tail-9", "type": "smooth-union", "left": "joined-tail-8", "right": "tail-field-9", "radius": 0.009}, {"id": "joined-tail-10", "type": "smooth-union", "left": "joined-tail-9", "right": "tail-field-10", "radius": 0.009}, {"id": "joined-tail-11", "type": "smooth-union", "left": "joined-tail-10", "right": "tail-field-11", "radius": 0.009}, {"id": "joined-tail-12", "type": "smooth-union", "left": "joined-tail-11", "right": "tail-field-12", "radius": 0.009}, {"id": "joined-tail-13", "type": "smooth-union", "left": "joined-tail-12", "right": "tail-field-13", "radius": 0.009}, {"id": "joined-tail-14", "type": "smooth-union", "left": "joined-tail-13", "right": "tail-field-14", "radius": 0.009}, {"id": "joined-tail-15", "type": "smooth-union", "left": "joined-tail-14", "right": "tail-field-15", "radius": 0.009}, {"id": "joined-tail-16", "type": "smooth-union", "left": "joined-tail-15", "right": "tail-field-16", "radius": 0.009}, {"id": "joined-tail-17", "type": "smooth-union", "left": "joined-tail-16", "right": "tail-field-17", "radius": 0.009}, {"id": "joined-tail-18", "type": "smooth-union", "left": "joined-tail-17", "right": "tail-field-18", "radius": 0.009}, {"id": "joined-tail-19", "type": "smooth-union", "left": "joined-tail-18", "right": "tail-field-19", "radius": 0.009}, {"id": "joined-tail-20", "type": "smooth-union", "left": "joined-tail-19", "right": "tail-field-20", "radius": 0.009}, {"id": "joined-tail-21", "type": "smooth-union", "left": "joined-tail-20", "right": "tail-field-21", "radius": 0.009}], "resolution": 64, "bounds": {"min": [-0.53, -0.015, -0.38], "max": [0.36, 0.665, 0.32]}}, "relaxation": {"type": "Taubin", "passes": 8, "lambda": 0.22, "mu": -0.225}, "tailFusion": {"method": "shared implicit surface with pelvis and 22 overlapping curve capsules", "rootBlendRadius": 0.055, "controlPoints": [[-0.16, 0.116, -0.152], [-0.35, 0.07, -0.15], [-0.47, 0.297, -0.08], [-0.345, 0.446, -0.061]], "noSeparateTailCap": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "foreleg-roots", "kind": "contour", "description": "embedded into chest", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}, {"id": "seated-haunches", "kind": "contour", "description": "wide pelvic support", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_body_2.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_body_2);
  nodes["body"] = node_body_2;
  const mesh_body_2Geometry = polygonizeSdf({"primitives": [{"id": "pelvis", "type": "ellipsoid", "center": [0, 0.201, -0.11], "radii": [0.232, 0.207, 0.187]}, {"id": "chest", "type": "ellipsoid", "center": [0, 0.351, -0.037], "radii": [0.21, 0.185, 0.168]}, {"id": "neck", "type": "ellipsoid", "center": [0, 0.47, -0.005], "radii": [0.164, 0.151, 0.132]}, {"id": "haunch-l", "type": "ellipsoid", "center": [0.18655, 0.177, -0.064], "radii": [0.11592000000000001, 0.155, 0.176]}, {"id": "shoulder-l", "type": "ellipsoid", "center": [0.133, 0.302, 0.082], "radii": [0.099, 0.128, 0.1]}, {"id": "foreleg-l", "type": "ellipsoid", "center": [0.116, 0.191, 0.153], "radii": [0.076, 0.136, 0.078], "transform": {"position": [0.116, 0.191, 0.153], "rotation": [0.16, 0, 0.19]}}, {"id": "paw-l", "type": "ellipsoid", "center": [0.104, 0.055, 0.181], "radii": [0.092, 0.055, 0.097]}, {"id": "rearpaw-l", "type": "ellipsoid", "center": [0.2115, 0.04, 0.052], "radii": [0.08742000000000001, 0.042, 0.09]}, {"id": "haunch-r", "type": "ellipsoid", "center": [-0.18655, 0.177, -0.064], "radii": [0.11592000000000001, 0.155, 0.176]}, {"id": "shoulder-r", "type": "ellipsoid", "center": [-0.133, 0.302, 0.082], "radii": [0.099, 0.128, 0.1]}, {"id": "foreleg-r", "type": "ellipsoid", "center": [-0.116, 0.191, 0.153], "radii": [0.076, 0.136, 0.078], "transform": {"position": [-0.116, 0.191, 0.153], "rotation": [0.16, 0, -0.19]}}, {"id": "paw-r", "type": "ellipsoid", "center": [-0.104, 0.055, 0.181], "radii": [0.092, 0.055, 0.097]}, {"id": "rearpaw-r", "type": "ellipsoid", "center": [-0.2115, 0.04, 0.052], "radii": [0.08742000000000001, 0.042, 0.09]}, {"id": "tail-field-0", "type": "capsule", "radius": 0.067, "height": 0.025882433573691545, "transform": {"position": [-0.1727293858001503, 0.11369322877535688, -0.15165848046581518], "rotation": [2.994609468352794, 0, 1.3896137736396341]}}, {"id": "tail-field-1", "type": "capsule", "radius": 0.06699848828420257, "height": 0.02457727171411984, "transform": {"position": [-0.19770496806912097, 0.11067294327573253, -0.15058748121712995], "rotation": [2.345130834891972, 0, 1.487663454679504]}}, {"id": "tail-field-2", "type": "capsule", "radius": 0.06698790627362056, "height": 0.023579263032775136, "transform": {"position": [-0.22166486664162283, 0.11074027986476334, -0.14877408903080389], "rotation": [0.9465096946472127, 0, 1.4572421110049354]}}, {"id": "tail-field-3", "type": "capsule", "radius": 0.0669591836734694, "height": 0.022858622695718464, "transform": {"position": [-0.24451047145003754, 0.11369745492111194, -0.1462853587528174], "rotation": [0.5732054435169892, 0, 1.3421690538334543]}}, {"id": "tail-field-4", "type": "capsule", "radius": 0.06690325018896448, "height": 0.022377789414111168, "transform": {"position": [-0.2661431724267468, 0.11934668482344102, -0.14318834522915097], "rotation": [0.4534008963395336, 0, 1.2182653544014908]}}, {"id": "tail-field-5", "type": "capsule", "radius": 0.06681103552532125, "height": 0.02209448742776045, "transform": {"position": [-0.2864643595041322, 0.12749018595041323, -0.1395501033057851], "rotation": [0.3947846947767709, 0, 1.0950359283172746]}}, {"id": "tail-field-6", "type": "capsule", "radius": 0.0666734693877551, "height": 0.021965374054911065, "transform": {"position": [-0.3053754226145755, 0.13793017468069121, -0.13543768782870022], "rotation": [0.3592031942665165, 0, 0.9750460033676565]}}, {"id": "tail-field-7", "type": "capsule", "radius": 0.06648148148148149, "height": 0.02194943320388646, "transform": {"position": [-0.3227777516904583, 0.15046886739293766, -0.13091815364387677], "rotation": [0.334555755937379, 0, 0.8592388357218985]}}, {"id": "tail-field-8", "type": "capsule", "radius": 0.0662260015117158, "height": 0.022010556542853995, "transform": {"position": [-0.3385727366641622, 0.1649084804658152, -0.12605855559729523], "rotation": [0.3158325272882141, 0, 0.7477305351019096]}}, {"id": "tail-field-9", "type": "capsule", "radius": 0.06589795918367347, "height": 0.022119154057482396, "transform": {"position": [-0.35266176746806904, 0.18105123027798647, -0.1209259485349361], "rotation": [0.30057538177853144, 0, 0.6401095336781717]}}, {"id": "tail-field-10", "type": "capsule", "radius": 0.06548828420256993, "height": 0.022252935882371327, "transform": {"position": [-0.3649462340345604, 0.19869933320811417, -0.11558738730277984], "rotation": [0.2874212583474562, 0, 0.5356307219719727]}}, {"id": "tail-field-11", "type": "capsule", "radius": 0.06498790627362057, "height": 0.022397133198530345, "transform": {"position": [-0.375327526296018, 0.217655005634861, -0.11010992674680692], "rotation": [0.2755358062855907, 0, 0.43335955198731413]}}, {"id": "tail-field-12", "type": "capsule", "radius": 0.06438775510204083, "height": 0.022544416320715334, "transform": {"position": [-0.38370703418482344, 0.23772046393688956, -0.10456062171299775], "rotation": [0.26436051008282135, 0, 0.3322796950273296]}}, {"id": "tail-field-13", "type": "capsule", "radius": 0.06367876039304611, "height": 0.022694692180414668, "transform": {"position": [-0.3899861476333583, 0.2586979244928625, -0.09900652704733283], "rotation": [0.253486616946458, 0, 0.23137524604094376]}}, {"id": "tail-field-14", "type": "capsule", "radius": 0.06285185185185185, "height": 0.022854871424330295, "transform": {"position": [-0.39406625657400446, 0.2803896036814425, -0.09351469759579265], "rotation": [0.24258561388290212, 0, 0.12969917252989288]}}, {"id": "tail-field-15", "type": "capsule", "radius": 0.061897959183673475, "height": 0.02303861015153231, "transform": {"position": [-0.3958487509391435, 0.30259771788129225, -0.08815218820435763], "rotation": [0.23136642478093866, 0, 0.0264384662974917]}}, {"id": "tail-field-16", "type": "capsule", "radius": 0.06080801209372638, "height": 0.023265959711272287, "transform": {"position": [-0.395235020661157, 0.32512448347107437, -0.08298605371900827], "rotation": [0.2195451427347692, 0, -0.07901705401893028]}}, {"id": "tail-field-17", "type": "capsule", "radius": 0.059572940287226005, "height": 0.02356280435218663, "transform": {"position": [-0.39212645567242677, 0.3477721168294515, -0.07808334898572503], "rotation": [0.20681954622888052, 0, -0.18700111914932763]}}, {"id": "tail-field-18", "type": "capsule", "radius": 0.058183673469387756, "height": 0.023959942049698972, "transform": {"position": [-0.3864244459053343, 0.3703428343350864, -0.07351112885048836], "rotation": [0.19284316360514167, 0, -0.29749931165385696]}}, {"id": "tail-field-19", "type": "capsule", "radius": 0.056631141345427065, "height": 0.024491688342111857, "transform": {"position": [-0.3780303812922614, 0.39263885236664164, -0.06933644815927872], "rotation": [0.1771941175902793, 0, -0.4100947903567617]}}, {"id": "tail-field-20", "type": "capsule", "radius": 0.05490627362055934, "height": 0.02519397546363318, "transform": {"position": [-0.36684565176558975, 0.41446238730277984, -0.06562636175807662], "rotation": [0.15933289247466856, 0, -0.5239529482183023]}}, {"id": "tail-field-21", "type": "capsule", "radius": 0.053000000000000005, "height": 0.026102076290558142, "transform": {"position": [-0.35277164725770094, 0.4356156555221638, -0.06244792449286251], "rotation": [0.13854019353929223, 0, -0.6378644361396799]}}], "operations": [{"id": "join-chest", "type": "smooth-union", "left": "pelvis", "right": "chest", "radius": 0.04}, {"id": "join-neck", "type": "smooth-union", "left": "join-chest", "right": "neck", "radius": 0.04}, {"id": "join-haunch-l", "type": "smooth-union", "left": "join-neck", "right": "haunch-l", "radius": 0.04}, {"id": "join-shoulder-l", "type": "smooth-union", "left": "join-haunch-l", "right": "shoulder-l", "radius": 0.04}, {"id": "join-foreleg-l", "type": "smooth-union", "left": "join-shoulder-l", "right": "foreleg-l", "radius": 0.04}, {"id": "join-paw-l", "type": "smooth-union", "left": "join-foreleg-l", "right": "paw-l", "radius": 0.04}, {"id": "join-rearpaw-l", "type": "smooth-union", "left": "join-paw-l", "right": "rearpaw-l", "radius": 0.04}, {"id": "join-haunch-r", "type": "smooth-union", "left": "join-rearpaw-l", "right": "haunch-r", "radius": 0.04}, {"id": "join-shoulder-r", "type": "smooth-union", "left": "join-haunch-r", "right": "shoulder-r", "radius": 0.04}, {"id": "join-foreleg-r", "type": "smooth-union", "left": "join-shoulder-r", "right": "foreleg-r", "radius": 0.04}, {"id": "join-paw-r", "type": "smooth-union", "left": "join-foreleg-r", "right": "paw-r", "radius": 0.04}, {"id": "join-rearpaw-r", "type": "smooth-union", "left": "join-paw-r", "right": "rearpaw-r", "radius": 0.04}, {"id": "joined-tail-0", "type": "smooth-union", "left": "join-rearpaw-r", "right": "tail-field-0", "radius": 0.055}, {"id": "joined-tail-1", "type": "smooth-union", "left": "joined-tail-0", "right": "tail-field-1", "radius": 0.055}, {"id": "joined-tail-2", "type": "smooth-union", "left": "joined-tail-1", "right": "tail-field-2", "radius": 0.055}, {"id": "joined-tail-3", "type": "smooth-union", "left": "joined-tail-2", "right": "tail-field-3", "radius": 0.055}, {"id": "joined-tail-4", "type": "smooth-union", "left": "joined-tail-3", "right": "tail-field-4", "radius": 0.055}, {"id": "joined-tail-5", "type": "smooth-union", "left": "joined-tail-4", "right": "tail-field-5", "radius": 0.009}, {"id": "joined-tail-6", "type": "smooth-union", "left": "joined-tail-5", "right": "tail-field-6", "radius": 0.009}, {"id": "joined-tail-7", "type": "smooth-union", "left": "joined-tail-6", "right": "tail-field-7", "radius": 0.009}, {"id": "joined-tail-8", "type": "smooth-union", "left": "joined-tail-7", "right": "tail-field-8", "radius": 0.009}, {"id": "joined-tail-9", "type": "smooth-union", "left": "joined-tail-8", "right": "tail-field-9", "radius": 0.009}, {"id": "joined-tail-10", "type": "smooth-union", "left": "joined-tail-9", "right": "tail-field-10", "radius": 0.009}, {"id": "joined-tail-11", "type": "smooth-union", "left": "joined-tail-10", "right": "tail-field-11", "radius": 0.009}, {"id": "joined-tail-12", "type": "smooth-union", "left": "joined-tail-11", "right": "tail-field-12", "radius": 0.009}, {"id": "joined-tail-13", "type": "smooth-union", "left": "joined-tail-12", "right": "tail-field-13", "radius": 0.009}, {"id": "joined-tail-14", "type": "smooth-union", "left": "joined-tail-13", "right": "tail-field-14", "radius": 0.009}, {"id": "joined-tail-15", "type": "smooth-union", "left": "joined-tail-14", "right": "tail-field-15", "radius": 0.009}, {"id": "joined-tail-16", "type": "smooth-union", "left": "joined-tail-15", "right": "tail-field-16", "radius": 0.009}, {"id": "joined-tail-17", "type": "smooth-union", "left": "joined-tail-16", "right": "tail-field-17", "radius": 0.009}, {"id": "joined-tail-18", "type": "smooth-union", "left": "joined-tail-17", "right": "tail-field-18", "radius": 0.009}, {"id": "joined-tail-19", "type": "smooth-union", "left": "joined-tail-18", "right": "tail-field-19", "radius": 0.009}, {"id": "joined-tail-20", "type": "smooth-union", "left": "joined-tail-19", "right": "tail-field-20", "radius": 0.009}, {"id": "joined-tail-21", "type": "smooth-union", "left": "joined-tail-20", "right": "tail-field-21", "radius": 0.009}], "resolution": 64, "bounds": {"min": [-0.53, -0.015, -0.38], "max": [0.36, 0.665, 0.32]}});
  if (!endpoint_body_2) {
    mesh_body_2Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_body_2 = new THREE.Mesh(
    mesh_body_2Geometry,
    createSculptMaterial("clay", {"id": "clay", "name": "clay", "type": "standard", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#96938f", "color": "#96938f", "albedo": {"dominant": "#96938f", "secondary": ["#96938f"]}, "colorVariation": {"palette": ["#96938f"], "pattern": "flat", "amplitude": 0, "heightCorrelation": 0.3}, "textureResolution": 1024, "textureProjection": {"mode": "uv", "repeat": [2.0, 2.0], "anisotropy": 8, "texelDensityIntent": "Preserve stable world/object-scale detail; do not stretch micro detail with component scale."}, "roughness": {"base": 0.75, "variation": 0.02}, "metalness": {"base": 0, "variation": 0}, "normal": {"pattern": "none", "strength": 0, "scale": 24.0, "space": "tangent"}, "bump": {"pattern": "none", "amplitude": 0, "scale": 1.0}, "displacement": {"pattern": "none", "amplitude": 0.0, "scale": 1.0, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0.0, "scratches": [], "chips": []}, "dirt": {"amount": 0.0, "cavityBias": 0.0, "color": "#2F2A22"}, "localOverrides": [{"id": "clay-finish", "region": "entire surface", "roughness": 0.75, "evidenceRef": "reference-front.png"}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Uniform neutral clay; coat and fur deferred by user."}, options, true)
  );
  mesh_body_2.name = "body";
  if (endpoint_body_2) {
    mesh_body_2.position.copy(endpoint_body_2.midpoint);
    mesh_body_2.quaternion.copy(endpoint_body_2.quaternion);
  }
  mesh_body_2.castShadow = options.castShadow ?? true;
  mesh_body_2.receiveShadow = options.receiveShadow ?? true;
  mesh_body_2.userData.sculptComponent = {"id": "body", "name": "body", "level": "macro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "implicit", "topologyRationale": "Continuous blended anatomical volume measured from Gulu front/profile references.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sdf": {"primitives": [{"id": "pelvis", "type": "ellipsoid", "center": [0, 0.201, -0.11], "radii": [0.232, 0.207, 0.187]}, {"id": "chest", "type": "ellipsoid", "center": [0, 0.351, -0.037], "radii": [0.21, 0.185, 0.168]}, {"id": "neck", "type": "ellipsoid", "center": [0, 0.47, -0.005], "radii": [0.164, 0.151, 0.132]}, {"id": "haunch-l", "type": "ellipsoid", "center": [0.18655, 0.177, -0.064], "radii": [0.11592000000000001, 0.155, 0.176]}, {"id": "shoulder-l", "type": "ellipsoid", "center": [0.133, 0.302, 0.082], "radii": [0.099, 0.128, 0.1]}, {"id": "foreleg-l", "type": "ellipsoid", "center": [0.116, 0.191, 0.153], "radii": [0.076, 0.136, 0.078], "transform": {"position": [0.116, 0.191, 0.153], "rotation": [0.16, 0, 0.19]}}, {"id": "paw-l", "type": "ellipsoid", "center": [0.104, 0.055, 0.181], "radii": [0.092, 0.055, 0.097]}, {"id": "rearpaw-l", "type": "ellipsoid", "center": [0.2115, 0.04, 0.052], "radii": [0.08742000000000001, 0.042, 0.09]}, {"id": "haunch-r", "type": "ellipsoid", "center": [-0.18655, 0.177, -0.064], "radii": [0.11592000000000001, 0.155, 0.176]}, {"id": "shoulder-r", "type": "ellipsoid", "center": [-0.133, 0.302, 0.082], "radii": [0.099, 0.128, 0.1]}, {"id": "foreleg-r", "type": "ellipsoid", "center": [-0.116, 0.191, 0.153], "radii": [0.076, 0.136, 0.078], "transform": {"position": [-0.116, 0.191, 0.153], "rotation": [0.16, 0, -0.19]}}, {"id": "paw-r", "type": "ellipsoid", "center": [-0.104, 0.055, 0.181], "radii": [0.092, 0.055, 0.097]}, {"id": "rearpaw-r", "type": "ellipsoid", "center": [-0.2115, 0.04, 0.052], "radii": [0.08742000000000001, 0.042, 0.09]}, {"id": "tail-field-0", "type": "capsule", "radius": 0.067, "height": 0.025882433573691545, "transform": {"position": [-0.1727293858001503, 0.11369322877535688, -0.15165848046581518], "rotation": [2.994609468352794, 0, 1.3896137736396341]}}, {"id": "tail-field-1", "type": "capsule", "radius": 0.06699848828420257, "height": 0.02457727171411984, "transform": {"position": [-0.19770496806912097, 0.11067294327573253, -0.15058748121712995], "rotation": [2.345130834891972, 0, 1.487663454679504]}}, {"id": "tail-field-2", "type": "capsule", "radius": 0.06698790627362056, "height": 0.023579263032775136, "transform": {"position": [-0.22166486664162283, 0.11074027986476334, -0.14877408903080389], "rotation": [0.9465096946472127, 0, 1.4572421110049354]}}, {"id": "tail-field-3", "type": "capsule", "radius": 0.0669591836734694, "height": 0.022858622695718464, "transform": {"position": [-0.24451047145003754, 0.11369745492111194, -0.1462853587528174], "rotation": [0.5732054435169892, 0, 1.3421690538334543]}}, {"id": "tail-field-4", "type": "capsule", "radius": 0.06690325018896448, "height": 0.022377789414111168, "transform": {"position": [-0.2661431724267468, 0.11934668482344102, -0.14318834522915097], "rotation": [0.4534008963395336, 0, 1.2182653544014908]}}, {"id": "tail-field-5", "type": "capsule", "radius": 0.06681103552532125, "height": 0.02209448742776045, "transform": {"position": [-0.2864643595041322, 0.12749018595041323, -0.1395501033057851], "rotation": [0.3947846947767709, 0, 1.0950359283172746]}}, {"id": "tail-field-6", "type": "capsule", "radius": 0.0666734693877551, "height": 0.021965374054911065, "transform": {"position": [-0.3053754226145755, 0.13793017468069121, -0.13543768782870022], "rotation": [0.3592031942665165, 0, 0.9750460033676565]}}, {"id": "tail-field-7", "type": "capsule", "radius": 0.06648148148148149, "height": 0.02194943320388646, "transform": {"position": [-0.3227777516904583, 0.15046886739293766, -0.13091815364387677], "rotation": [0.334555755937379, 0, 0.8592388357218985]}}, {"id": "tail-field-8", "type": "capsule", "radius": 0.0662260015117158, "height": 0.022010556542853995, "transform": {"position": [-0.3385727366641622, 0.1649084804658152, -0.12605855559729523], "rotation": [0.3158325272882141, 0, 0.7477305351019096]}}, {"id": "tail-field-9", "type": "capsule", "radius": 0.06589795918367347, "height": 0.022119154057482396, "transform": {"position": [-0.35266176746806904, 0.18105123027798647, -0.1209259485349361], "rotation": [0.30057538177853144, 0, 0.6401095336781717]}}, {"id": "tail-field-10", "type": "capsule", "radius": 0.06548828420256993, "height": 0.022252935882371327, "transform": {"position": [-0.3649462340345604, 0.19869933320811417, -0.11558738730277984], "rotation": [0.2874212583474562, 0, 0.5356307219719727]}}, {"id": "tail-field-11", "type": "capsule", "radius": 0.06498790627362057, "height": 0.022397133198530345, "transform": {"position": [-0.375327526296018, 0.217655005634861, -0.11010992674680692], "rotation": [0.2755358062855907, 0, 0.43335955198731413]}}, {"id": "tail-field-12", "type": "capsule", "radius": 0.06438775510204083, "height": 0.022544416320715334, "transform": {"position": [-0.38370703418482344, 0.23772046393688956, -0.10456062171299775], "rotation": [0.26436051008282135, 0, 0.3322796950273296]}}, {"id": "tail-field-13", "type": "capsule", "radius": 0.06367876039304611, "height": 0.022694692180414668, "transform": {"position": [-0.3899861476333583, 0.2586979244928625, -0.09900652704733283], "rotation": [0.253486616946458, 0, 0.23137524604094376]}}, {"id": "tail-field-14", "type": "capsule", "radius": 0.06285185185185185, "height": 0.022854871424330295, "transform": {"position": [-0.39406625657400446, 0.2803896036814425, -0.09351469759579265], "rotation": [0.24258561388290212, 0, 0.12969917252989288]}}, {"id": "tail-field-15", "type": "capsule", "radius": 0.061897959183673475, "height": 0.02303861015153231, "transform": {"position": [-0.3958487509391435, 0.30259771788129225, -0.08815218820435763], "rotation": [0.23136642478093866, 0, 0.0264384662974917]}}, {"id": "tail-field-16", "type": "capsule", "radius": 0.06080801209372638, "height": 0.023265959711272287, "transform": {"position": [-0.395235020661157, 0.32512448347107437, -0.08298605371900827], "rotation": [0.2195451427347692, 0, -0.07901705401893028]}}, {"id": "tail-field-17", "type": "capsule", "radius": 0.059572940287226005, "height": 0.02356280435218663, "transform": {"position": [-0.39212645567242677, 0.3477721168294515, -0.07808334898572503], "rotation": [0.20681954622888052, 0, -0.18700111914932763]}}, {"id": "tail-field-18", "type": "capsule", "radius": 0.058183673469387756, "height": 0.023959942049698972, "transform": {"position": [-0.3864244459053343, 0.3703428343350864, -0.07351112885048836], "rotation": [0.19284316360514167, 0, -0.29749931165385696]}}, {"id": "tail-field-19", "type": "capsule", "radius": 0.056631141345427065, "height": 0.024491688342111857, "transform": {"position": [-0.3780303812922614, 0.39263885236664164, -0.06933644815927872], "rotation": [0.1771941175902793, 0, -0.4100947903567617]}}, {"id": "tail-field-20", "type": "capsule", "radius": 0.05490627362055934, "height": 0.02519397546363318, "transform": {"position": [-0.36684565176558975, 0.41446238730277984, -0.06562636175807662], "rotation": [0.15933289247466856, 0, -0.5239529482183023]}}, {"id": "tail-field-21", "type": "capsule", "radius": 0.053000000000000005, "height": 0.026102076290558142, "transform": {"position": [-0.35277164725770094, 0.4356156555221638, -0.06244792449286251], "rotation": [0.13854019353929223, 0, -0.6378644361396799]}}], "operations": [{"id": "join-chest", "type": "smooth-union", "left": "pelvis", "right": "chest", "radius": 0.04}, {"id": "join-neck", "type": "smooth-union", "left": "join-chest", "right": "neck", "radius": 0.04}, {"id": "join-haunch-l", "type": "smooth-union", "left": "join-neck", "right": "haunch-l", "radius": 0.04}, {"id": "join-shoulder-l", "type": "smooth-union", "left": "join-haunch-l", "right": "shoulder-l", "radius": 0.04}, {"id": "join-foreleg-l", "type": "smooth-union", "left": "join-shoulder-l", "right": "foreleg-l", "radius": 0.04}, {"id": "join-paw-l", "type": "smooth-union", "left": "join-foreleg-l", "right": "paw-l", "radius": 0.04}, {"id": "join-rearpaw-l", "type": "smooth-union", "left": "join-paw-l", "right": "rearpaw-l", "radius": 0.04}, {"id": "join-haunch-r", "type": "smooth-union", "left": "join-rearpaw-l", "right": "haunch-r", "radius": 0.04}, {"id": "join-shoulder-r", "type": "smooth-union", "left": "join-haunch-r", "right": "shoulder-r", "radius": 0.04}, {"id": "join-foreleg-r", "type": "smooth-union", "left": "join-shoulder-r", "right": "foreleg-r", "radius": 0.04}, {"id": "join-paw-r", "type": "smooth-union", "left": "join-foreleg-r", "right": "paw-r", "radius": 0.04}, {"id": "join-rearpaw-r", "type": "smooth-union", "left": "join-paw-r", "right": "rearpaw-r", "radius": 0.04}, {"id": "joined-tail-0", "type": "smooth-union", "left": "join-rearpaw-r", "right": "tail-field-0", "radius": 0.055}, {"id": "joined-tail-1", "type": "smooth-union", "left": "joined-tail-0", "right": "tail-field-1", "radius": 0.055}, {"id": "joined-tail-2", "type": "smooth-union", "left": "joined-tail-1", "right": "tail-field-2", "radius": 0.055}, {"id": "joined-tail-3", "type": "smooth-union", "left": "joined-tail-2", "right": "tail-field-3", "radius": 0.055}, {"id": "joined-tail-4", "type": "smooth-union", "left": "joined-tail-3", "right": "tail-field-4", "radius": 0.055}, {"id": "joined-tail-5", "type": "smooth-union", "left": "joined-tail-4", "right": "tail-field-5", "radius": 0.009}, {"id": "joined-tail-6", "type": "smooth-union", "left": "joined-tail-5", "right": "tail-field-6", "radius": 0.009}, {"id": "joined-tail-7", "type": "smooth-union", "left": "joined-tail-6", "right": "tail-field-7", "radius": 0.009}, {"id": "joined-tail-8", "type": "smooth-union", "left": "joined-tail-7", "right": "tail-field-8", "radius": 0.009}, {"id": "joined-tail-9", "type": "smooth-union", "left": "joined-tail-8", "right": "tail-field-9", "radius": 0.009}, {"id": "joined-tail-10", "type": "smooth-union", "left": "joined-tail-9", "right": "tail-field-10", "radius": 0.009}, {"id": "joined-tail-11", "type": "smooth-union", "left": "joined-tail-10", "right": "tail-field-11", "radius": 0.009}, {"id": "joined-tail-12", "type": "smooth-union", "left": "joined-tail-11", "right": "tail-field-12", "radius": 0.009}, {"id": "joined-tail-13", "type": "smooth-union", "left": "joined-tail-12", "right": "tail-field-13", "radius": 0.009}, {"id": "joined-tail-14", "type": "smooth-union", "left": "joined-tail-13", "right": "tail-field-14", "radius": 0.009}, {"id": "joined-tail-15", "type": "smooth-union", "left": "joined-tail-14", "right": "tail-field-15", "radius": 0.009}, {"id": "joined-tail-16", "type": "smooth-union", "left": "joined-tail-15", "right": "tail-field-16", "radius": 0.009}, {"id": "joined-tail-17", "type": "smooth-union", "left": "joined-tail-16", "right": "tail-field-17", "radius": 0.009}, {"id": "joined-tail-18", "type": "smooth-union", "left": "joined-tail-17", "right": "tail-field-18", "radius": 0.009}, {"id": "joined-tail-19", "type": "smooth-union", "left": "joined-tail-18", "right": "tail-field-19", "radius": 0.009}, {"id": "joined-tail-20", "type": "smooth-union", "left": "joined-tail-19", "right": "tail-field-20", "radius": 0.009}, {"id": "joined-tail-21", "type": "smooth-union", "left": "joined-tail-20", "right": "tail-field-21", "radius": 0.009}], "resolution": 64, "bounds": {"min": [-0.53, -0.015, -0.38], "max": [0.36, 0.665, 0.32]}}, "relaxation": {"type": "Taubin", "passes": 8, "lambda": 0.22, "mu": -0.225}, "tailFusion": {"method": "shared implicit surface with pelvis and 22 overlapping curve capsules", "rootBlendRadius": 0.055, "controlPoints": [[-0.16, 0.116, -0.152], [-0.35, 0.07, -0.15], [-0.47, 0.297, -0.08], [-0.345, 0.446, -0.061]], "noSeparateTailCap": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "foreleg-roots", "kind": "contour", "description": "embedded into chest", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}, {"id": "seated-haunches", "kind": "contour", "description": "wide pelvic support", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_body_2.add(mesh_body_2);
  meshes["body"] = mesh_body_2;
  colliders["body"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_body_2);

  const endpoint_tail_3 = makeAttachmentEndpoint(null);
  const node_tail_3 = new THREE.Group();
  node_tail_3.name = "tail__pivot";
  node_tail_3.scale.set(1, 1, 1);
  if (endpoint_tail_3) {
    node_tail_3.position.copy(endpoint_tail_3.start);
    node_tail_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_tail_3.position.set(0.0, 0.0, 0.0);
    node_tail_3.rotation.set(0.0, 0.0, 0.0);
  }
  node_tail_3.userData.sculptComponent = {"id": "tail", "name": "tail", "level": "macro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "tapered-sweep", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "taperedSweep": {"stations": [{"position": [-0.12299999999999998, 0.1056, -0.2], "rx": 0.0648, "rz": 0.0648, "twist": 0}, {"position": [-0.13133613281249998, 0.102742578125, -0.19768554687500003], "rx": 0.06556816406249999, "rz": 0.06556816406249999, "twist": 0}, {"position": [-0.1425390625, 0.09841562499999999, -0.19460937500000003], "rx": 0.0666703125, "rz": 0.0666703125, "twist": 0}, {"position": [-0.1558880859375, 0.093212109375, -0.19094726562500003], "rx": 0.0679904296875, "rz": 0.0679904296875, "twist": 0}, {"position": [-0.1706625, 0.087725, -0.186875], "rx": 0.0694125, "rz": 0.0694125, "twist": 0}, {"position": [-0.18614160156249998, 0.082547265625, -0.18256835937500002], "rx": 0.0708205078125, "rz": 0.0708205078125, "twist": 0}, {"position": [-0.20160468750000002, 0.078271875, -0.17820312500000005], "rx": 0.0720984375, "rz": 0.0720984375, "twist": 0}, {"position": [-0.21633105468749997, 0.07549179687500002, -0.17395507812500005], "rx": 0.0731302734375, "rz": 0.0731302734375, "twist": 0}, {"position": [-0.2296, 0.0748, -0.17], "rx": 0.0738, "rz": 0.0738, "twist": 0}, {"position": [-0.24199609375000003, 0.076050390625, -0.166181640625], "rx": 0.07406103515625, "rz": 0.07406103515625, "twist": 0}, {"position": [-0.25445625000000005, 0.07861562500000001, -0.16226562500000002], "rx": 0.07400390625, "rz": 0.07400390625, "twist": 0}, {"position": [-0.26678828125, 0.08236679687500001, -0.158310546875], "rx": 0.07371826171875, "rz": 0.07371826171875, "twist": 0}, {"position": [-0.2788, 0.08717500000000002, -0.154375], "rx": 0.07329375, "rz": 0.07329375, "twist": 0}, {"position": [-0.29029921875000003, 0.09291132812500001, -0.15051757812500002], "rx": 0.07282001953125002, "rz": 0.07282001953125002, "twist": 0}, {"position": [-0.30109375000000005, 0.099446875, -0.14679687500000002], "rx": 0.07238671875, "rz": 0.07238671875, "twist": 0}, {"position": [-0.31099140625, 0.106652734375, -0.14327148437499998], "rx": 0.07208349609375, "rz": 0.07208349609375, "twist": 0}, {"position": [-0.3198, 0.1144, -0.14], "rx": 0.07200000000000001, "rz": 0.07200000000000001, "twist": 0}, {"position": [-0.327503515625, 0.12296367187500001, -0.13702148437500003], "rx": 0.07216523437500001, "rz": 0.07216523437500001, "twist": 0}, {"position": [-0.33427812500000004, 0.132584375, -0.13429687499999998], "rx": 0.07250625, "rz": 0.07250625, "twist": 0}, {"position": [-0.340219921875, 0.14308164062500003, -0.131767578125], "rx": 0.072959765625, "rz": 0.072959765625, "twist": 0}, {"position": [-0.3454249999999999, 0.15427500000000002, -0.12937500000000002], "rx": 0.0734625, "rz": 0.0734625, "twist": 0}, {"position": [-0.34998945312499996, 0.16598398437500003, -0.127060546875], "rx": 0.07395117187500001, "rz": 0.07395117187500001, "twist": 0}, {"position": [-0.35400937499999996, 0.178028125, -0.12476562499999999], "rx": 0.07436250000000001, "rz": 0.07436250000000001, "twist": 0}, {"position": [-0.3575808593749999, 0.19022695312500001, -0.12243164062499999], "rx": 0.07463320312499999, "rz": 0.07463320312499999, "twist": 0}, {"position": [-0.36079999999999995, 0.2024, -0.12], "rx": 0.0747, "rz": 0.0747, "twist": 0}, {"position": [-0.36356269531249996, 0.21487812500000003, -0.117431640625], "rx": 0.07457607421875, "rz": 0.07457607421875, "twist": 0}, {"position": [-0.36573281249999995, 0.22797500000000004, -0.114765625], "rx": 0.07432734375000001, "rz": 0.07432734375000001, "twist": 0}, {"position": [-0.36735839843749996, 0.241484375, -0.11206054687499999], "rx": 0.07396962890625002, "rz": 0.07396962890625002, "twist": 0}, {"position": [-0.36848749999999997, 0.2552, -0.109375], "rx": 0.07351875, "rz": 0.07351875, "twist": 0}, {"position": [-0.36916816406249997, 0.268915625, -0.106767578125], "rx": 0.07299052734375, "rz": 0.07299052734375, "twist": 0}, {"position": [-0.36944843749999995, 0.282425, -0.104296875], "rx": 0.07240078125, "rz": 0.07240078125, "twist": 0}, {"position": [-0.36937636718749994, 0.295521875, -0.102021484375], "rx": 0.07176533203125, "rz": 0.07176533203125, "twist": 0}, {"position": [-0.369, 0.308, -0.1], "rx": 0.0711, "rz": 0.0711, "twist": 0}, {"position": [-0.368183203125, 0.320203125, -0.098203125], "rx": 0.0704830078125, "rz": 0.0704830078125, "twist": 0}, {"position": [-0.36682187499999996, 0.332475, -0.0965625], "rx": 0.0699328125, "rz": 0.0699328125, "twist": 0}, {"position": [-0.36501210937499995, 0.344609375, -0.095078125], "rx": 0.0693755859375, "rz": 0.0693755859375, "twist": 0}, {"position": [-0.36285, 0.3564, -0.09375], "rx": 0.0687375, "rz": 0.0687375, "twist": 0}, {"position": [-0.36043164062499994, 0.3676406249999999, -0.09257812500000001], "rx": 0.0679447265625, "rz": 0.0679447265625, "twist": 0}, {"position": [-0.357853125, 0.37812499999999993, -0.0915625], "rx": 0.06692343749999999, "rz": 0.06692343749999999, "twist": 0}, {"position": [-0.355210546875, 0.38764687499999995, -0.09070312500000001], "rx": 0.06559980468749999, "rz": 0.06559980468749999, "twist": 0}, {"position": [-0.35259999999999997, 0.396, -0.09], "rx": 0.0639, "rz": 0.0639, "twist": 0}, {"position": [-0.349861328125, 0.403046875, -0.08952148437499999], "rx": 0.061867089843749994, "rz": 0.061867089843749994, "twist": 0}, {"position": [-0.34683437500000003, 0.40892500000000004, -0.089296875], "rx": 0.059589843749999996, "rz": 0.059589843749999996, "twist": 0}, {"position": [-0.343615234375, 0.413840625, -0.089267578125], "rx": 0.057062988281249984, "rz": 0.057062988281249984, "twist": 0}, {"position": [-0.34029999999999994, 0.418, -0.089375], "rx": 0.054281249999999996, "rz": 0.054281249999999996, "twist": 0}, {"position": [-0.33698476562499996, 0.421609375, -0.08956054687500001], "rx": 0.05123935546874999, "rz": 0.05123935546874999, "twist": 0}, {"position": [-0.333765625, 0.42487500000000006, -0.08976562500000002], "rx": 0.04793203124999999, "rz": 0.04793203124999999, "twist": 0}, {"position": [-0.33073867187499995, 0.428003125, -0.089931640625], "rx": 0.04435400390624999, "rz": 0.04435400390624999, "twist": 0}, {"position": [-0.328, 0.43119999999999997, -0.09], "rx": 0.0405, "rz": 0.0405, "twist": 0}, {"position": [-0.3254455078125, 0.43436249999999993, -0.09], "rx": 0.03597890625, "rz": 0.03597890625, "twist": 0}, {"position": [-0.3229390625, 0.43725, -0.09], "rx": 0.030628125, "rz": 0.030628125, "twist": 0}, {"position": [-0.32052871093749996, 0.4398625, -0.09], "rx": 0.024785156250000002, "rz": 0.024785156250000002, "twist": 0}, {"position": [-0.3182625, 0.4422, -0.09], "rx": 0.018787500000000002, "rz": 0.018787500000000002, "twist": 0}, {"position": [-0.3161884765625, 0.44426250000000006, -0.09], "rx": 0.012972656250000002, "rz": 0.012972656250000002, "twist": 0}, {"position": [-0.3143546875, 0.4460499999999999, -0.09000000000000001], "rx": 0.0076781250000000105, "rz": 0.0076781250000000105, "twist": 0}, {"position": [-0.31280917968750005, 0.44756249999999986, -0.09000000000000001], "rx": 0.003241406250000005, "rz": 0.003241406250000005, "twist": 0}, {"position": [-0.3116, 0.44880000000000003, -0.09], "rx": 0.0, "rz": 0.0, "twist": 0}], "radialSegments": 32, "capEnds": true}, "surfaceNormals": "weld radial seam and recompute area weighted normals", "kittenTail": {"controlPoints": [[-0.13, 0.099, -0.175], [-0.28, 0.095, -0.135], [-0.366, 0.164, -0.103], [-0.39, 0.286, -0.086], [-0.376, 0.39, -0.075], [-0.345, 0.465, -0.06]], "cap": "round hemisphere", "longitudinalSegments": 80, "radialSegments": 32}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tail-arc", "kind": "contour", "description": "thick curved sweep", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_tail_3.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_tail_3);
  nodes["tail"] = node_tail_3;
  const mesh_tail_3Geometry = endpoint_tail_3
    ? new THREE.CylinderGeometry(endpoint_tail_3.endRadius, endpoint_tail_3.baseRadius, endpoint_tail_3.length, 32, 12)
    : buildTaperedSweepGeometry({"stations": [{"position": [-0.12299999999999998, 0.1056, -0.2], "rx": 0.0648, "rz": 0.0648, "twist": 0}, {"position": [-0.13133613281249998, 0.102742578125, -0.19768554687500003], "rx": 0.06556816406249999, "rz": 0.06556816406249999, "twist": 0}, {"position": [-0.1425390625, 0.09841562499999999, -0.19460937500000003], "rx": 0.0666703125, "rz": 0.0666703125, "twist": 0}, {"position": [-0.1558880859375, 0.093212109375, -0.19094726562500003], "rx": 0.0679904296875, "rz": 0.0679904296875, "twist": 0}, {"position": [-0.1706625, 0.087725, -0.186875], "rx": 0.0694125, "rz": 0.0694125, "twist": 0}, {"position": [-0.18614160156249998, 0.082547265625, -0.18256835937500002], "rx": 0.0708205078125, "rz": 0.0708205078125, "twist": 0}, {"position": [-0.20160468750000002, 0.078271875, -0.17820312500000005], "rx": 0.0720984375, "rz": 0.0720984375, "twist": 0}, {"position": [-0.21633105468749997, 0.07549179687500002, -0.17395507812500005], "rx": 0.0731302734375, "rz": 0.0731302734375, "twist": 0}, {"position": [-0.2296, 0.0748, -0.17], "rx": 0.0738, "rz": 0.0738, "twist": 0}, {"position": [-0.24199609375000003, 0.076050390625, -0.166181640625], "rx": 0.07406103515625, "rz": 0.07406103515625, "twist": 0}, {"position": [-0.25445625000000005, 0.07861562500000001, -0.16226562500000002], "rx": 0.07400390625, "rz": 0.07400390625, "twist": 0}, {"position": [-0.26678828125, 0.08236679687500001, -0.158310546875], "rx": 0.07371826171875, "rz": 0.07371826171875, "twist": 0}, {"position": [-0.2788, 0.08717500000000002, -0.154375], "rx": 0.07329375, "rz": 0.07329375, "twist": 0}, {"position": [-0.29029921875000003, 0.09291132812500001, -0.15051757812500002], "rx": 0.07282001953125002, "rz": 0.07282001953125002, "twist": 0}, {"position": [-0.30109375000000005, 0.099446875, -0.14679687500000002], "rx": 0.07238671875, "rz": 0.07238671875, "twist": 0}, {"position": [-0.31099140625, 0.106652734375, -0.14327148437499998], "rx": 0.07208349609375, "rz": 0.07208349609375, "twist": 0}, {"position": [-0.3198, 0.1144, -0.14], "rx": 0.07200000000000001, "rz": 0.07200000000000001, "twist": 0}, {"position": [-0.327503515625, 0.12296367187500001, -0.13702148437500003], "rx": 0.07216523437500001, "rz": 0.07216523437500001, "twist": 0}, {"position": [-0.33427812500000004, 0.132584375, -0.13429687499999998], "rx": 0.07250625, "rz": 0.07250625, "twist": 0}, {"position": [-0.340219921875, 0.14308164062500003, -0.131767578125], "rx": 0.072959765625, "rz": 0.072959765625, "twist": 0}, {"position": [-0.3454249999999999, 0.15427500000000002, -0.12937500000000002], "rx": 0.0734625, "rz": 0.0734625, "twist": 0}, {"position": [-0.34998945312499996, 0.16598398437500003, -0.127060546875], "rx": 0.07395117187500001, "rz": 0.07395117187500001, "twist": 0}, {"position": [-0.35400937499999996, 0.178028125, -0.12476562499999999], "rx": 0.07436250000000001, "rz": 0.07436250000000001, "twist": 0}, {"position": [-0.3575808593749999, 0.19022695312500001, -0.12243164062499999], "rx": 0.07463320312499999, "rz": 0.07463320312499999, "twist": 0}, {"position": [-0.36079999999999995, 0.2024, -0.12], "rx": 0.0747, "rz": 0.0747, "twist": 0}, {"position": [-0.36356269531249996, 0.21487812500000003, -0.117431640625], "rx": 0.07457607421875, "rz": 0.07457607421875, "twist": 0}, {"position": [-0.36573281249999995, 0.22797500000000004, -0.114765625], "rx": 0.07432734375000001, "rz": 0.07432734375000001, "twist": 0}, {"position": [-0.36735839843749996, 0.241484375, -0.11206054687499999], "rx": 0.07396962890625002, "rz": 0.07396962890625002, "twist": 0}, {"position": [-0.36848749999999997, 0.2552, -0.109375], "rx": 0.07351875, "rz": 0.07351875, "twist": 0}, {"position": [-0.36916816406249997, 0.268915625, -0.106767578125], "rx": 0.07299052734375, "rz": 0.07299052734375, "twist": 0}, {"position": [-0.36944843749999995, 0.282425, -0.104296875], "rx": 0.07240078125, "rz": 0.07240078125, "twist": 0}, {"position": [-0.36937636718749994, 0.295521875, -0.102021484375], "rx": 0.07176533203125, "rz": 0.07176533203125, "twist": 0}, {"position": [-0.369, 0.308, -0.1], "rx": 0.0711, "rz": 0.0711, "twist": 0}, {"position": [-0.368183203125, 0.320203125, -0.098203125], "rx": 0.0704830078125, "rz": 0.0704830078125, "twist": 0}, {"position": [-0.36682187499999996, 0.332475, -0.0965625], "rx": 0.0699328125, "rz": 0.0699328125, "twist": 0}, {"position": [-0.36501210937499995, 0.344609375, -0.095078125], "rx": 0.0693755859375, "rz": 0.0693755859375, "twist": 0}, {"position": [-0.36285, 0.3564, -0.09375], "rx": 0.0687375, "rz": 0.0687375, "twist": 0}, {"position": [-0.36043164062499994, 0.3676406249999999, -0.09257812500000001], "rx": 0.0679447265625, "rz": 0.0679447265625, "twist": 0}, {"position": [-0.357853125, 0.37812499999999993, -0.0915625], "rx": 0.06692343749999999, "rz": 0.06692343749999999, "twist": 0}, {"position": [-0.355210546875, 0.38764687499999995, -0.09070312500000001], "rx": 0.06559980468749999, "rz": 0.06559980468749999, "twist": 0}, {"position": [-0.35259999999999997, 0.396, -0.09], "rx": 0.0639, "rz": 0.0639, "twist": 0}, {"position": [-0.349861328125, 0.403046875, -0.08952148437499999], "rx": 0.061867089843749994, "rz": 0.061867089843749994, "twist": 0}, {"position": [-0.34683437500000003, 0.40892500000000004, -0.089296875], "rx": 0.059589843749999996, "rz": 0.059589843749999996, "twist": 0}, {"position": [-0.343615234375, 0.413840625, -0.089267578125], "rx": 0.057062988281249984, "rz": 0.057062988281249984, "twist": 0}, {"position": [-0.34029999999999994, 0.418, -0.089375], "rx": 0.054281249999999996, "rz": 0.054281249999999996, "twist": 0}, {"position": [-0.33698476562499996, 0.421609375, -0.08956054687500001], "rx": 0.05123935546874999, "rz": 0.05123935546874999, "twist": 0}, {"position": [-0.333765625, 0.42487500000000006, -0.08976562500000002], "rx": 0.04793203124999999, "rz": 0.04793203124999999, "twist": 0}, {"position": [-0.33073867187499995, 0.428003125, -0.089931640625], "rx": 0.04435400390624999, "rz": 0.04435400390624999, "twist": 0}, {"position": [-0.328, 0.43119999999999997, -0.09], "rx": 0.0405, "rz": 0.0405, "twist": 0}, {"position": [-0.3254455078125, 0.43436249999999993, -0.09], "rx": 0.03597890625, "rz": 0.03597890625, "twist": 0}, {"position": [-0.3229390625, 0.43725, -0.09], "rx": 0.030628125, "rz": 0.030628125, "twist": 0}, {"position": [-0.32052871093749996, 0.4398625, -0.09], "rx": 0.024785156250000002, "rz": 0.024785156250000002, "twist": 0}, {"position": [-0.3182625, 0.4422, -0.09], "rx": 0.018787500000000002, "rz": 0.018787500000000002, "twist": 0}, {"position": [-0.3161884765625, 0.44426250000000006, -0.09], "rx": 0.012972656250000002, "rz": 0.012972656250000002, "twist": 0}, {"position": [-0.3143546875, 0.4460499999999999, -0.09000000000000001], "rx": 0.0076781250000000105, "rz": 0.0076781250000000105, "twist": 0}, {"position": [-0.31280917968750005, 0.44756249999999986, -0.09000000000000001], "rx": 0.003241406250000005, "rz": 0.003241406250000005, "twist": 0}, {"position": [-0.3116, 0.44880000000000003, -0.09], "rx": 0.0, "rz": 0.0, "twist": 0}], "radialSegments": 32, "capEnds": true});
  if (!endpoint_tail_3) {
    mesh_tail_3Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_tail_3 = new THREE.Mesh(
    mesh_tail_3Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_tail_3.name = "tail";
  if (endpoint_tail_3) {
    mesh_tail_3.position.copy(endpoint_tail_3.midpoint);
    mesh_tail_3.quaternion.copy(endpoint_tail_3.quaternion);
  }
  mesh_tail_3.castShadow = options.castShadow ?? true;
  mesh_tail_3.receiveShadow = options.receiveShadow ?? true;
  mesh_tail_3.userData.sculptComponent = {"id": "tail", "name": "tail", "level": "macro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "tapered-sweep", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "taperedSweep": {"stations": [{"position": [-0.12299999999999998, 0.1056, -0.2], "rx": 0.0648, "rz": 0.0648, "twist": 0}, {"position": [-0.13133613281249998, 0.102742578125, -0.19768554687500003], "rx": 0.06556816406249999, "rz": 0.06556816406249999, "twist": 0}, {"position": [-0.1425390625, 0.09841562499999999, -0.19460937500000003], "rx": 0.0666703125, "rz": 0.0666703125, "twist": 0}, {"position": [-0.1558880859375, 0.093212109375, -0.19094726562500003], "rx": 0.0679904296875, "rz": 0.0679904296875, "twist": 0}, {"position": [-0.1706625, 0.087725, -0.186875], "rx": 0.0694125, "rz": 0.0694125, "twist": 0}, {"position": [-0.18614160156249998, 0.082547265625, -0.18256835937500002], "rx": 0.0708205078125, "rz": 0.0708205078125, "twist": 0}, {"position": [-0.20160468750000002, 0.078271875, -0.17820312500000005], "rx": 0.0720984375, "rz": 0.0720984375, "twist": 0}, {"position": [-0.21633105468749997, 0.07549179687500002, -0.17395507812500005], "rx": 0.0731302734375, "rz": 0.0731302734375, "twist": 0}, {"position": [-0.2296, 0.0748, -0.17], "rx": 0.0738, "rz": 0.0738, "twist": 0}, {"position": [-0.24199609375000003, 0.076050390625, -0.166181640625], "rx": 0.07406103515625, "rz": 0.07406103515625, "twist": 0}, {"position": [-0.25445625000000005, 0.07861562500000001, -0.16226562500000002], "rx": 0.07400390625, "rz": 0.07400390625, "twist": 0}, {"position": [-0.26678828125, 0.08236679687500001, -0.158310546875], "rx": 0.07371826171875, "rz": 0.07371826171875, "twist": 0}, {"position": [-0.2788, 0.08717500000000002, -0.154375], "rx": 0.07329375, "rz": 0.07329375, "twist": 0}, {"position": [-0.29029921875000003, 0.09291132812500001, -0.15051757812500002], "rx": 0.07282001953125002, "rz": 0.07282001953125002, "twist": 0}, {"position": [-0.30109375000000005, 0.099446875, -0.14679687500000002], "rx": 0.07238671875, "rz": 0.07238671875, "twist": 0}, {"position": [-0.31099140625, 0.106652734375, -0.14327148437499998], "rx": 0.07208349609375, "rz": 0.07208349609375, "twist": 0}, {"position": [-0.3198, 0.1144, -0.14], "rx": 0.07200000000000001, "rz": 0.07200000000000001, "twist": 0}, {"position": [-0.327503515625, 0.12296367187500001, -0.13702148437500003], "rx": 0.07216523437500001, "rz": 0.07216523437500001, "twist": 0}, {"position": [-0.33427812500000004, 0.132584375, -0.13429687499999998], "rx": 0.07250625, "rz": 0.07250625, "twist": 0}, {"position": [-0.340219921875, 0.14308164062500003, -0.131767578125], "rx": 0.072959765625, "rz": 0.072959765625, "twist": 0}, {"position": [-0.3454249999999999, 0.15427500000000002, -0.12937500000000002], "rx": 0.0734625, "rz": 0.0734625, "twist": 0}, {"position": [-0.34998945312499996, 0.16598398437500003, -0.127060546875], "rx": 0.07395117187500001, "rz": 0.07395117187500001, "twist": 0}, {"position": [-0.35400937499999996, 0.178028125, -0.12476562499999999], "rx": 0.07436250000000001, "rz": 0.07436250000000001, "twist": 0}, {"position": [-0.3575808593749999, 0.19022695312500001, -0.12243164062499999], "rx": 0.07463320312499999, "rz": 0.07463320312499999, "twist": 0}, {"position": [-0.36079999999999995, 0.2024, -0.12], "rx": 0.0747, "rz": 0.0747, "twist": 0}, {"position": [-0.36356269531249996, 0.21487812500000003, -0.117431640625], "rx": 0.07457607421875, "rz": 0.07457607421875, "twist": 0}, {"position": [-0.36573281249999995, 0.22797500000000004, -0.114765625], "rx": 0.07432734375000001, "rz": 0.07432734375000001, "twist": 0}, {"position": [-0.36735839843749996, 0.241484375, -0.11206054687499999], "rx": 0.07396962890625002, "rz": 0.07396962890625002, "twist": 0}, {"position": [-0.36848749999999997, 0.2552, -0.109375], "rx": 0.07351875, "rz": 0.07351875, "twist": 0}, {"position": [-0.36916816406249997, 0.268915625, -0.106767578125], "rx": 0.07299052734375, "rz": 0.07299052734375, "twist": 0}, {"position": [-0.36944843749999995, 0.282425, -0.104296875], "rx": 0.07240078125, "rz": 0.07240078125, "twist": 0}, {"position": [-0.36937636718749994, 0.295521875, -0.102021484375], "rx": 0.07176533203125, "rz": 0.07176533203125, "twist": 0}, {"position": [-0.369, 0.308, -0.1], "rx": 0.0711, "rz": 0.0711, "twist": 0}, {"position": [-0.368183203125, 0.320203125, -0.098203125], "rx": 0.0704830078125, "rz": 0.0704830078125, "twist": 0}, {"position": [-0.36682187499999996, 0.332475, -0.0965625], "rx": 0.0699328125, "rz": 0.0699328125, "twist": 0}, {"position": [-0.36501210937499995, 0.344609375, -0.095078125], "rx": 0.0693755859375, "rz": 0.0693755859375, "twist": 0}, {"position": [-0.36285, 0.3564, -0.09375], "rx": 0.0687375, "rz": 0.0687375, "twist": 0}, {"position": [-0.36043164062499994, 0.3676406249999999, -0.09257812500000001], "rx": 0.0679447265625, "rz": 0.0679447265625, "twist": 0}, {"position": [-0.357853125, 0.37812499999999993, -0.0915625], "rx": 0.06692343749999999, "rz": 0.06692343749999999, "twist": 0}, {"position": [-0.355210546875, 0.38764687499999995, -0.09070312500000001], "rx": 0.06559980468749999, "rz": 0.06559980468749999, "twist": 0}, {"position": [-0.35259999999999997, 0.396, -0.09], "rx": 0.0639, "rz": 0.0639, "twist": 0}, {"position": [-0.349861328125, 0.403046875, -0.08952148437499999], "rx": 0.061867089843749994, "rz": 0.061867089843749994, "twist": 0}, {"position": [-0.34683437500000003, 0.40892500000000004, -0.089296875], "rx": 0.059589843749999996, "rz": 0.059589843749999996, "twist": 0}, {"position": [-0.343615234375, 0.413840625, -0.089267578125], "rx": 0.057062988281249984, "rz": 0.057062988281249984, "twist": 0}, {"position": [-0.34029999999999994, 0.418, -0.089375], "rx": 0.054281249999999996, "rz": 0.054281249999999996, "twist": 0}, {"position": [-0.33698476562499996, 0.421609375, -0.08956054687500001], "rx": 0.05123935546874999, "rz": 0.05123935546874999, "twist": 0}, {"position": [-0.333765625, 0.42487500000000006, -0.08976562500000002], "rx": 0.04793203124999999, "rz": 0.04793203124999999, "twist": 0}, {"position": [-0.33073867187499995, 0.428003125, -0.089931640625], "rx": 0.04435400390624999, "rz": 0.04435400390624999, "twist": 0}, {"position": [-0.328, 0.43119999999999997, -0.09], "rx": 0.0405, "rz": 0.0405, "twist": 0}, {"position": [-0.3254455078125, 0.43436249999999993, -0.09], "rx": 0.03597890625, "rz": 0.03597890625, "twist": 0}, {"position": [-0.3229390625, 0.43725, -0.09], "rx": 0.030628125, "rz": 0.030628125, "twist": 0}, {"position": [-0.32052871093749996, 0.4398625, -0.09], "rx": 0.024785156250000002, "rz": 0.024785156250000002, "twist": 0}, {"position": [-0.3182625, 0.4422, -0.09], "rx": 0.018787500000000002, "rz": 0.018787500000000002, "twist": 0}, {"position": [-0.3161884765625, 0.44426250000000006, -0.09], "rx": 0.012972656250000002, "rz": 0.012972656250000002, "twist": 0}, {"position": [-0.3143546875, 0.4460499999999999, -0.09000000000000001], "rx": 0.0076781250000000105, "rz": 0.0076781250000000105, "twist": 0}, {"position": [-0.31280917968750005, 0.44756249999999986, -0.09000000000000001], "rx": 0.003241406250000005, "rz": 0.003241406250000005, "twist": 0}, {"position": [-0.3116, 0.44880000000000003, -0.09], "rx": 0.0, "rz": 0.0, "twist": 0}], "radialSegments": 32, "capEnds": true}, "surfaceNormals": "weld radial seam and recompute area weighted normals", "kittenTail": {"controlPoints": [[-0.13, 0.099, -0.175], [-0.28, 0.095, -0.135], [-0.366, 0.164, -0.103], [-0.39, 0.286, -0.086], [-0.376, 0.39, -0.075], [-0.345, 0.465, -0.06]], "cap": "round hemisphere", "longitudinalSegments": 80, "radialSegments": 32}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "tail-arc", "kind": "contour", "description": "thick curved sweep", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_tail_3.add(mesh_tail_3);
  meshes["tail"] = mesh_tail_3;
  colliders["tail"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_tail_3);

  const endpoint_ear_l_4 = makeAttachmentEndpoint(null);
  const node_ear_l_4 = new THREE.Group();
  node_ear_l_4.name = "ear-l__pivot";
  node_ear_l_4.scale.set(1, 1, 1);
  if (endpoint_ear_l_4) {
    node_ear_l_4.position.copy(endpoint_ear_l_4.start);
    node_ear_l_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_ear_l_4.position.set(0.0, 0.0, 0.0);
    node_ear_l_4.rotation.set(0.0, 0.0, 0.0);
  }
  node_ear_l_4.userData.sculptComponent = {"id": "ear-l", "name": "ear-l", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "tapered-sweep", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "taperedSweep": {"stations": [{"position": [0.205, 0.82, 0.002], "rx": 0.111, "rz": 0.058, "twist": 0}, {"position": [0.233, 0.9, 0.015], "rx": 0.079, "rz": 0.04, "twist": 0}, {"position": [0.276, 1.0, 0.011], "rx": 0.012, "rz": 0.012, "twist": 0}, {"position": [0.278, 1.01, 0.012], "rx": 0, "rz": 0, "twist": 0}], "radialSegments": 24, "capEnds": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "ear-roots", "kind": "contour", "description": "root overlap .04", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_ear_l_4.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_ear_l_4);
  nodes["ear-l"] = node_ear_l_4;
  const mesh_ear_l_4Geometry = endpoint_ear_l_4
    ? new THREE.CylinderGeometry(endpoint_ear_l_4.endRadius, endpoint_ear_l_4.baseRadius, endpoint_ear_l_4.length, 32, 12)
    : buildTaperedSweepGeometry({"stations": [{"position": [0.205, 0.82, 0.002], "rx": 0.111, "rz": 0.058, "twist": 0}, {"position": [0.233, 0.9, 0.015], "rx": 0.079, "rz": 0.04, "twist": 0}, {"position": [0.276, 1.0, 0.011], "rx": 0.012, "rz": 0.012, "twist": 0}, {"position": [0.278, 1.01, 0.012], "rx": 0, "rz": 0, "twist": 0}], "radialSegments": 24, "capEnds": true});
  if (!endpoint_ear_l_4) {
    mesh_ear_l_4Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_ear_l_4 = new THREE.Mesh(
    mesh_ear_l_4Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ear_l_4.name = "ear-l";
  if (endpoint_ear_l_4) {
    mesh_ear_l_4.position.copy(endpoint_ear_l_4.midpoint);
    mesh_ear_l_4.quaternion.copy(endpoint_ear_l_4.quaternion);
  }
  mesh_ear_l_4.castShadow = options.castShadow ?? true;
  mesh_ear_l_4.receiveShadow = options.receiveShadow ?? true;
  mesh_ear_l_4.userData.sculptComponent = {"id": "ear-l", "name": "ear-l", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "tapered-sweep", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "taperedSweep": {"stations": [{"position": [0.205, 0.82, 0.002], "rx": 0.111, "rz": 0.058, "twist": 0}, {"position": [0.233, 0.9, 0.015], "rx": 0.079, "rz": 0.04, "twist": 0}, {"position": [0.276, 1.0, 0.011], "rx": 0.012, "rz": 0.012, "twist": 0}, {"position": [0.278, 1.01, 0.012], "rx": 0, "rz": 0, "twist": 0}], "radialSegments": 24, "capEnds": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "ear-roots", "kind": "contour", "description": "root overlap .04", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_ear_l_4.add(mesh_ear_l_4);
  meshes["ear-l"] = mesh_ear_l_4;
  colliders["ear-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_ear_l_4);

  const endpoint_eye_l_5 = makeAttachmentEndpoint(null);
  const node_eye_l_5 = new THREE.Group();
  node_eye_l_5.name = "eye-l__pivot";
  node_eye_l_5.scale.set(1, 1, 1);
  if (endpoint_eye_l_5) {
    node_eye_l_5.position.copy(endpoint_eye_l_5.start);
    node_eye_l_5.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eye_l_5.position.set(0.124, 0.683, 0.174);
    node_eye_l_5.rotation.set(0.0, 0.0, 0.0);
  }
  node_eye_l_5.userData.sculptComponent = {"id": "eye-l", "name": "eye-l", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sculptedEye": {"irisRadiusNormalized": 0.34, "irisGrooveDepthNormalized": 0.015, "pupilRadiusNormalized": 0.23, "pupilRecessNormalized": 0.014, "sphericalSurface": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.118, 0.718, 0.184], "localEnd": [0.118, 0.718, 0.184], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.13, "height": 0.134, "depth": 0.093, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.124, 0.683, 0.174], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.718, 0.184], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "ocular", "materialLayers": ["ocular"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_eye_l_5.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.718, 0.184], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_eye_l_5);
  nodes["eye-l"] = node_eye_l_5;
  const mesh_eye_l_5Geometry = endpoint_eye_l_5
    ? new THREE.CylinderGeometry(endpoint_eye_l_5.endRadius, endpoint_eye_l_5.baseRadius, endpoint_eye_l_5.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_eye_l_5) {
    mesh_eye_l_5Geometry.scale(0.13, 0.134, 0.093);
  }
  const mesh_eye_l_5 = new THREE.Mesh(
    mesh_eye_l_5Geometry,
    materialMap["ocular"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_eye_l_5.name = "eye-l";
  if (endpoint_eye_l_5) {
    mesh_eye_l_5.position.copy(endpoint_eye_l_5.midpoint);
    mesh_eye_l_5.quaternion.copy(endpoint_eye_l_5.quaternion);
  }
  mesh_eye_l_5.castShadow = options.castShadow ?? true;
  mesh_eye_l_5.receiveShadow = options.receiveShadow ?? true;
  mesh_eye_l_5.userData.sculptComponent = {"id": "eye-l", "name": "eye-l", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sculptedEye": {"irisRadiusNormalized": 0.34, "irisGrooveDepthNormalized": 0.015, "pupilRadiusNormalized": 0.23, "pupilRecessNormalized": 0.014, "sphericalSurface": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.118, 0.718, 0.184], "localEnd": [0.118, 0.718, 0.184], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.13, "height": 0.134, "depth": 0.093, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.124, 0.683, 0.174], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.718, 0.184], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "ocular", "materialLayers": ["ocular"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_eye_l_5.add(mesh_eye_l_5);
  meshes["eye-l"] = mesh_eye_l_5;
  colliders["eye-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_eye_l_5);

  const endpoint_iris_l_6 = makeAttachmentEndpoint(null);
  const node_iris_l_6 = new THREE.Group();
  node_iris_l_6.name = "iris-l__pivot";
  node_iris_l_6.scale.set(1, 1, 1);
  if (endpoint_iris_l_6) {
    node_iris_l_6.position.copy(endpoint_iris_l_6.start);
    node_iris_l_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_iris_l_6.position.set(0.118, 0.6809999999999999, 0.223);
    node_iris_l_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_iris_l_6.userData.sculptComponent = {"id": "iris-l", "name": "iris-l", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.118, 0.716, 0.238], "localEnd": [0.118, 0.716, 0.238], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.072, "height": 0.076, "depth": 0.01, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.118, 0.6809999999999999, 0.223], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.716, 0.238], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_iris_l_6.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.716, 0.238], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_iris_l_6);
  nodes["iris-l"] = node_iris_l_6;
  const mesh_iris_l_6Geometry = endpoint_iris_l_6
    ? new THREE.CylinderGeometry(endpoint_iris_l_6.endRadius, endpoint_iris_l_6.baseRadius, endpoint_iris_l_6.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_iris_l_6) {
    mesh_iris_l_6Geometry.scale(0.072, 0.076, 0.01);
  }
  const mesh_iris_l_6 = new THREE.Mesh(
    mesh_iris_l_6Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_iris_l_6.name = "iris-l";
  if (endpoint_iris_l_6) {
    mesh_iris_l_6.position.copy(endpoint_iris_l_6.midpoint);
    mesh_iris_l_6.quaternion.copy(endpoint_iris_l_6.quaternion);
  }
  mesh_iris_l_6.castShadow = options.castShadow ?? true;
  mesh_iris_l_6.receiveShadow = options.receiveShadow ?? true;
  mesh_iris_l_6.userData.sculptComponent = {"id": "iris-l", "name": "iris-l", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.118, 0.716, 0.238], "localEnd": [0.118, 0.716, 0.238], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.072, "height": 0.076, "depth": 0.01, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.118, 0.6809999999999999, 0.223], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.716, 0.238], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_iris_l_6.add(mesh_iris_l_6);
  meshes["iris-l"] = mesh_iris_l_6;
  colliders["iris-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_iris_l_6);

  const endpoint_pupil_l_7 = makeAttachmentEndpoint(null);
  const node_pupil_l_7 = new THREE.Group();
  node_pupil_l_7.name = "pupil-l__pivot";
  node_pupil_l_7.scale.set(1, 1, 1);
  if (endpoint_pupil_l_7) {
    node_pupil_l_7.position.copy(endpoint_pupil_l_7.start);
    node_pupil_l_7.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pupil_l_7.position.set(0.118, 0.6809999999999999, 0.229);
    node_pupil_l_7.rotation.set(0.0, 0.0, 0.0);
  }
  node_pupil_l_7.userData.sculptComponent = {"id": "pupil-l", "name": "pupil-l", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.118, 0.716, 0.245], "localEnd": [0.118, 0.716, 0.245], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.029, "height": 0.036, "depth": 0.006, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.118, 0.6809999999999999, 0.229], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.716, 0.245], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_pupil_l_7.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.716, 0.245], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_pupil_l_7);
  nodes["pupil-l"] = node_pupil_l_7;
  const mesh_pupil_l_7Geometry = endpoint_pupil_l_7
    ? new THREE.CylinderGeometry(endpoint_pupil_l_7.endRadius, endpoint_pupil_l_7.baseRadius, endpoint_pupil_l_7.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_pupil_l_7) {
    mesh_pupil_l_7Geometry.scale(0.029, 0.036, 0.006);
  }
  const mesh_pupil_l_7 = new THREE.Mesh(
    mesh_pupil_l_7Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pupil_l_7.name = "pupil-l";
  if (endpoint_pupil_l_7) {
    mesh_pupil_l_7.position.copy(endpoint_pupil_l_7.midpoint);
    mesh_pupil_l_7.quaternion.copy(endpoint_pupil_l_7.quaternion);
  }
  mesh_pupil_l_7.castShadow = options.castShadow ?? true;
  mesh_pupil_l_7.receiveShadow = options.receiveShadow ?? true;
  mesh_pupil_l_7.userData.sculptComponent = {"id": "pupil-l", "name": "pupil-l", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.118, 0.716, 0.245], "localEnd": [0.118, 0.716, 0.245], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.029, "height": 0.036, "depth": 0.006, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.118, 0.6809999999999999, 0.229], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.716, 0.245], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_pupil_l_7.add(mesh_pupil_l_7);
  meshes["pupil-l"] = mesh_pupil_l_7;
  colliders["pupil-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_pupil_l_7);

  const endpoint_eyelid_l_8 = makeAttachmentEndpoint(null);
  const node_eyelid_l_8 = new THREE.Group();
  node_eyelid_l_8.name = "eyelid-l__pivot";
  node_eyelid_l_8.scale.set(1, 1, 1);
  if (endpoint_eyelid_l_8) {
    node_eyelid_l_8.position.copy(endpoint_eyelid_l_8.start);
    node_eyelid_l_8.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eyelid_l_8.position.set(0.124, 0.683, 0.206);
    node_eyelid_l_8.rotation.set(0.0, 0.0, 0.0);
  }
  node_eyelid_l_8.userData.sculptComponent = {"id": "eyelid-l", "name": "eyelid-l", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "torusTubeRatio": 0.055}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.118, 0.718, 0.203], "localEnd": [0.118, 0.718, 0.203], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.142, "height": 0.146, "depth": 0.044, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.124, 0.683, 0.206], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.718, 0.203], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "eyelid-rim", "kind": "contour", "description": "shallow ocular lip", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_eyelid_l_8.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.718, 0.203], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_eyelid_l_8);
  nodes["eyelid-l"] = node_eyelid_l_8;
  const mesh_eyelid_l_8Geometry = endpoint_eyelid_l_8
    ? new THREE.CylinderGeometry(endpoint_eyelid_l_8.endRadius, endpoint_eyelid_l_8.baseRadius, endpoint_eyelid_l_8.length, 32, 12)
    : new THREE.TorusGeometry(0.45, 0.0248, 24, 96);
  if (!endpoint_eyelid_l_8) {
    mesh_eyelid_l_8Geometry.scale(0.142, 0.146, 0.044);
  }
  const mesh_eyelid_l_8 = new THREE.Mesh(
    mesh_eyelid_l_8Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_eyelid_l_8.name = "eyelid-l";
  if (endpoint_eyelid_l_8) {
    mesh_eyelid_l_8.position.copy(endpoint_eyelid_l_8.midpoint);
    mesh_eyelid_l_8.quaternion.copy(endpoint_eyelid_l_8.quaternion);
  }
  mesh_eyelid_l_8.castShadow = options.castShadow ?? true;
  mesh_eyelid_l_8.receiveShadow = options.receiveShadow ?? true;
  mesh_eyelid_l_8.userData.sculptComponent = {"id": "eyelid-l", "name": "eyelid-l", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "torusTubeRatio": 0.055}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.118, 0.718, 0.203], "localEnd": [0.118, 0.718, 0.203], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.142, "height": 0.146, "depth": 0.044, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.124, 0.683, 0.206], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.118, 0.718, 0.203], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "eyelid-rim", "kind": "contour", "description": "shallow ocular lip", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_eyelid_l_8.add(mesh_eyelid_l_8);
  meshes["eyelid-l"] = mesh_eyelid_l_8;
  colliders["eyelid-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_eyelid_l_8);

  const endpoint_concha_l_9 = makeAttachmentEndpoint(null);
  const node_concha_l_9 = new THREE.Group();
  node_concha_l_9.name = "concha-l__pivot";
  node_concha_l_9.scale.set(1, 1, 1);
  if (endpoint_concha_l_9) {
    node_concha_l_9.position.copy(endpoint_concha_l_9.start);
    node_concha_l_9.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_concha_l_9.position.set(0.236, 0.919, 0.02);
    node_concha_l_9.rotation.set(0.0, 0.0, 0.0);
  }
  node_concha_l_9.userData.sculptComponent = {"id": "concha-l", "name": "concha-l", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.238, 0.9, 0.04], "localEnd": [0.238, 0.9, 0.04], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.07, "height": 0.107, "depth": 0.021, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.236, 0.919, 0.02], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.238, 0.9, 0.04], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_concha_l_9.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.238, 0.9, 0.04], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_concha_l_9);
  nodes["concha-l"] = node_concha_l_9;
  const mesh_concha_l_9Geometry = endpoint_concha_l_9
    ? new THREE.CylinderGeometry(endpoint_concha_l_9.endRadius, endpoint_concha_l_9.baseRadius, endpoint_concha_l_9.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_concha_l_9) {
    mesh_concha_l_9Geometry.scale(0.07, 0.107, 0.021);
  }
  const mesh_concha_l_9 = new THREE.Mesh(
    mesh_concha_l_9Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_concha_l_9.name = "concha-l";
  if (endpoint_concha_l_9) {
    mesh_concha_l_9.position.copy(endpoint_concha_l_9.midpoint);
    mesh_concha_l_9.quaternion.copy(endpoint_concha_l_9.quaternion);
  }
  mesh_concha_l_9.castShadow = options.castShadow ?? true;
  mesh_concha_l_9.receiveShadow = options.receiveShadow ?? true;
  mesh_concha_l_9.userData.sculptComponent = {"id": "concha-l", "name": "concha-l", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.238, 0.9, 0.04], "localEnd": [0.238, 0.9, 0.04], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.07, "height": 0.107, "depth": 0.021, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.236, 0.919, 0.02], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.238, 0.9, 0.04], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_concha_l_9.add(mesh_concha_l_9);
  meshes["concha-l"] = mesh_concha_l_9;
  colliders["concha-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_concha_l_9);

  const endpoint_toe_l_0_10 = makeAttachmentEndpoint(null);
  const node_toe_l_0_10 = new THREE.Group();
  node_toe_l_0_10.name = "toe-l-0__pivot";
  node_toe_l_0_10.scale.set(1, 1, 1);
  if (endpoint_toe_l_0_10) {
    node_toe_l_0_10.position.copy(endpoint_toe_l_0_10.start);
    node_toe_l_0_10.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_toe_l_0_10.position.set(0.047, 0.057, 0.257);
    node_toe_l_0_10.rotation.set(0.0, 0.0, 0.0);
  }
  node_toe_l_0_10.userData.sculptComponent = {"id": "toe-l-0", "name": "toe-l-0", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.051500000000000004, 0.037, 0.237], "localEnd": [0.051500000000000004, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.047, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.051500000000000004, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "toe-separation", "kind": "contour", "description": "rounded toe groups", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_l_0_10.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.051500000000000004, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_toe_l_0_10);
  nodes["toe-l-0"] = node_toe_l_0_10;
  const mesh_toe_l_0_10Geometry = endpoint_toe_l_0_10
    ? new THREE.CylinderGeometry(endpoint_toe_l_0_10.endRadius, endpoint_toe_l_0_10.baseRadius, endpoint_toe_l_0_10.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_toe_l_0_10) {
    mesh_toe_l_0_10Geometry.scale(0.043, 0.072, 0.072);
  }
  const mesh_toe_l_0_10 = new THREE.Mesh(
    mesh_toe_l_0_10Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_toe_l_0_10.name = "toe-l-0";
  if (endpoint_toe_l_0_10) {
    mesh_toe_l_0_10.position.copy(endpoint_toe_l_0_10.midpoint);
    mesh_toe_l_0_10.quaternion.copy(endpoint_toe_l_0_10.quaternion);
  }
  mesh_toe_l_0_10.castShadow = options.castShadow ?? true;
  mesh_toe_l_0_10.receiveShadow = options.receiveShadow ?? true;
  mesh_toe_l_0_10.userData.sculptComponent = {"id": "toe-l-0", "name": "toe-l-0", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.051500000000000004, 0.037, 0.237], "localEnd": [0.051500000000000004, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.047, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.051500000000000004, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "toe-separation", "kind": "contour", "description": "rounded toe groups", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_l_0_10.add(mesh_toe_l_0_10);
  meshes["toe-l-0"] = mesh_toe_l_0_10;
  colliders["toe-l-0"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_toe_l_0_10);

  const endpoint_toe_l_1_11 = makeAttachmentEndpoint(null);
  const node_toe_l_1_11 = new THREE.Group();
  node_toe_l_1_11.name = "toe-l-1__pivot";
  node_toe_l_1_11.scale.set(1, 1, 1);
  if (endpoint_toe_l_1_11) {
    node_toe_l_1_11.position.copy(endpoint_toe_l_1_11.start);
    node_toe_l_1_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_toe_l_1_11.position.set(0.08499999999999999, 0.057, 0.257);
    node_toe_l_1_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_toe_l_1_11.userData.sculptComponent = {"id": "toe-l-1", "name": "toe-l-1", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.0905, 0.037, 0.237], "localEnd": [0.0905, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.08499999999999999, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.0905, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_l_1_11.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.0905, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_toe_l_1_11);
  nodes["toe-l-1"] = node_toe_l_1_11;
  const mesh_toe_l_1_11Geometry = endpoint_toe_l_1_11
    ? new THREE.CylinderGeometry(endpoint_toe_l_1_11.endRadius, endpoint_toe_l_1_11.baseRadius, endpoint_toe_l_1_11.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_toe_l_1_11) {
    mesh_toe_l_1_11Geometry.scale(0.043, 0.072, 0.072);
  }
  const mesh_toe_l_1_11 = new THREE.Mesh(
    mesh_toe_l_1_11Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_toe_l_1_11.name = "toe-l-1";
  if (endpoint_toe_l_1_11) {
    mesh_toe_l_1_11.position.copy(endpoint_toe_l_1_11.midpoint);
    mesh_toe_l_1_11.quaternion.copy(endpoint_toe_l_1_11.quaternion);
  }
  mesh_toe_l_1_11.castShadow = options.castShadow ?? true;
  mesh_toe_l_1_11.receiveShadow = options.receiveShadow ?? true;
  mesh_toe_l_1_11.userData.sculptComponent = {"id": "toe-l-1", "name": "toe-l-1", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.0905, 0.037, 0.237], "localEnd": [0.0905, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.08499999999999999, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.0905, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_l_1_11.add(mesh_toe_l_1_11);
  meshes["toe-l-1"] = mesh_toe_l_1_11;
  colliders["toe-l-1"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_toe_l_1_11);

  const endpoint_toe_l_2_12 = makeAttachmentEndpoint(null);
  const node_toe_l_2_12 = new THREE.Group();
  node_toe_l_2_12.name = "toe-l-2__pivot";
  node_toe_l_2_12.scale.set(1, 1, 1);
  if (endpoint_toe_l_2_12) {
    node_toe_l_2_12.position.copy(endpoint_toe_l_2_12.start);
    node_toe_l_2_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_toe_l_2_12.position.set(0.123, 0.057, 0.257);
    node_toe_l_2_12.rotation.set(0.0, 0.0, 0.0);
  }
  node_toe_l_2_12.userData.sculptComponent = {"id": "toe-l-2", "name": "toe-l-2", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.1295, 0.037, 0.237], "localEnd": [0.1295, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.123, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.1295, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_l_2_12.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.1295, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_toe_l_2_12);
  nodes["toe-l-2"] = node_toe_l_2_12;
  const mesh_toe_l_2_12Geometry = endpoint_toe_l_2_12
    ? new THREE.CylinderGeometry(endpoint_toe_l_2_12.endRadius, endpoint_toe_l_2_12.baseRadius, endpoint_toe_l_2_12.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_toe_l_2_12) {
    mesh_toe_l_2_12Geometry.scale(0.043, 0.072, 0.072);
  }
  const mesh_toe_l_2_12 = new THREE.Mesh(
    mesh_toe_l_2_12Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_toe_l_2_12.name = "toe-l-2";
  if (endpoint_toe_l_2_12) {
    mesh_toe_l_2_12.position.copy(endpoint_toe_l_2_12.midpoint);
    mesh_toe_l_2_12.quaternion.copy(endpoint_toe_l_2_12.quaternion);
  }
  mesh_toe_l_2_12.castShadow = options.castShadow ?? true;
  mesh_toe_l_2_12.receiveShadow = options.receiveShadow ?? true;
  mesh_toe_l_2_12.userData.sculptComponent = {"id": "toe-l-2", "name": "toe-l-2", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.1295, 0.037, 0.237], "localEnd": [0.1295, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.123, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.1295, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_l_2_12.add(mesh_toe_l_2_12);
  meshes["toe-l-2"] = mesh_toe_l_2_12;
  colliders["toe-l-2"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_toe_l_2_12);

  const endpoint_toe_l_3_13 = makeAttachmentEndpoint(null);
  const node_toe_l_3_13 = new THREE.Group();
  node_toe_l_3_13.name = "toe-l-3__pivot";
  node_toe_l_3_13.scale.set(1, 1, 1);
  if (endpoint_toe_l_3_13) {
    node_toe_l_3_13.position.copy(endpoint_toe_l_3_13.start);
    node_toe_l_3_13.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_toe_l_3_13.position.set(0.16099999999999998, 0.057, 0.257);
    node_toe_l_3_13.rotation.set(0.0, 0.0, 0.0);
  }
  node_toe_l_3_13.userData.sculptComponent = {"id": "toe-l-3", "name": "toe-l-3", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.16849999999999998, 0.037, 0.237], "localEnd": [0.16849999999999998, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.16099999999999998, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.16849999999999998, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_l_3_13.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.16849999999999998, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_toe_l_3_13);
  nodes["toe-l-3"] = node_toe_l_3_13;
  const mesh_toe_l_3_13Geometry = endpoint_toe_l_3_13
    ? new THREE.CylinderGeometry(endpoint_toe_l_3_13.endRadius, endpoint_toe_l_3_13.baseRadius, endpoint_toe_l_3_13.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_toe_l_3_13) {
    mesh_toe_l_3_13Geometry.scale(0.043, 0.072, 0.072);
  }
  const mesh_toe_l_3_13 = new THREE.Mesh(
    mesh_toe_l_3_13Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_toe_l_3_13.name = "toe-l-3";
  if (endpoint_toe_l_3_13) {
    mesh_toe_l_3_13.position.copy(endpoint_toe_l_3_13.midpoint);
    mesh_toe_l_3_13.quaternion.copy(endpoint_toe_l_3_13.quaternion);
  }
  mesh_toe_l_3_13.castShadow = options.castShadow ?? true;
  mesh_toe_l_3_13.receiveShadow = options.receiveShadow ?? true;
  mesh_toe_l_3_13.userData.sculptComponent = {"id": "toe-l-3", "name": "toe-l-3", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.16849999999999998, 0.037, 0.237], "localEnd": [0.16849999999999998, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.16099999999999998, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.16849999999999998, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_l_3_13.add(mesh_toe_l_3_13);
  meshes["toe-l-3"] = mesh_toe_l_3_13;
  colliders["toe-l-3"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_toe_l_3_13);

  const endpoint_ear_r_14 = makeAttachmentEndpoint(null);
  const node_ear_r_14 = new THREE.Group();
  node_ear_r_14.name = "ear-r__pivot";
  node_ear_r_14.scale.set(1, 1, 1);
  if (endpoint_ear_r_14) {
    node_ear_r_14.position.copy(endpoint_ear_r_14.start);
    node_ear_r_14.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_ear_r_14.position.set(0.0, 0.0, 0.0);
    node_ear_r_14.rotation.set(0.0, 0.0, 0.0);
  }
  node_ear_r_14.userData.sculptComponent = {"id": "ear-r", "name": "ear-r", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "tapered-sweep", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "taperedSweep": {"stations": [{"position": [-0.205, 0.82, 0.002], "rx": 0.111, "rz": 0.058, "twist": 0}, {"position": [-0.233, 0.9, 0.015], "rx": 0.079, "rz": 0.04, "twist": 0}, {"position": [-0.276, 1.0, 0.011], "rx": 0.012, "rz": 0.012, "twist": 0}, {"position": [-0.278, 1.01, 0.012], "rx": 0, "rz": 0, "twist": 0}], "radialSegments": 24, "capEnds": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_ear_r_14.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_ear_r_14);
  nodes["ear-r"] = node_ear_r_14;
  const mesh_ear_r_14Geometry = endpoint_ear_r_14
    ? new THREE.CylinderGeometry(endpoint_ear_r_14.endRadius, endpoint_ear_r_14.baseRadius, endpoint_ear_r_14.length, 32, 12)
    : buildTaperedSweepGeometry({"stations": [{"position": [-0.205, 0.82, 0.002], "rx": 0.111, "rz": 0.058, "twist": 0}, {"position": [-0.233, 0.9, 0.015], "rx": 0.079, "rz": 0.04, "twist": 0}, {"position": [-0.276, 1.0, 0.011], "rx": 0.012, "rz": 0.012, "twist": 0}, {"position": [-0.278, 1.01, 0.012], "rx": 0, "rz": 0, "twist": 0}], "radialSegments": 24, "capEnds": true});
  if (!endpoint_ear_r_14) {
    mesh_ear_r_14Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_ear_r_14 = new THREE.Mesh(
    mesh_ear_r_14Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_ear_r_14.name = "ear-r";
  if (endpoint_ear_r_14) {
    mesh_ear_r_14.position.copy(endpoint_ear_r_14.midpoint);
    mesh_ear_r_14.quaternion.copy(endpoint_ear_r_14.quaternion);
  }
  mesh_ear_r_14.castShadow = options.castShadow ?? true;
  mesh_ear_r_14.receiveShadow = options.receiveShadow ?? true;
  mesh_ear_r_14.userData.sculptComponent = {"id": "ear-r", "name": "ear-r", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "tapered-sweep", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "taperedSweep": {"stations": [{"position": [-0.205, 0.82, 0.002], "rx": 0.111, "rz": 0.058, "twist": 0}, {"position": [-0.233, 0.9, 0.015], "rx": 0.079, "rz": 0.04, "twist": 0}, {"position": [-0.276, 1.0, 0.011], "rx": 0.012, "rz": 0.012, "twist": 0}, {"position": [-0.278, 1.01, 0.012], "rx": 0, "rz": 0, "twist": 0}], "radialSegments": 24, "capEnds": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_ear_r_14.add(mesh_ear_r_14);
  meshes["ear-r"] = mesh_ear_r_14;
  colliders["ear-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_ear_r_14);

  const endpoint_eye_r_15 = makeAttachmentEndpoint(null);
  const node_eye_r_15 = new THREE.Group();
  node_eye_r_15.name = "eye-r__pivot";
  node_eye_r_15.scale.set(1, 1, 1);
  if (endpoint_eye_r_15) {
    node_eye_r_15.position.copy(endpoint_eye_r_15.start);
    node_eye_r_15.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eye_r_15.position.set(-0.124, 0.683, 0.174);
    node_eye_r_15.rotation.set(0.0, 0.0, 0.0);
  }
  node_eye_r_15.userData.sculptComponent = {"id": "eye-r", "name": "eye-r", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sculptedEye": {"irisRadiusNormalized": 0.34, "irisGrooveDepthNormalized": 0.015, "pupilRadiusNormalized": 0.23, "pupilRecessNormalized": 0.014, "sphericalSurface": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.118, 0.718, 0.184], "localEnd": [-0.118, 0.718, 0.184], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.13, "height": 0.134, "depth": 0.093, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.124, 0.683, 0.174], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.718, 0.184], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "ocular", "materialLayers": ["ocular"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_eye_r_15.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.718, 0.184], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_eye_r_15);
  nodes["eye-r"] = node_eye_r_15;
  const mesh_eye_r_15Geometry = endpoint_eye_r_15
    ? new THREE.CylinderGeometry(endpoint_eye_r_15.endRadius, endpoint_eye_r_15.baseRadius, endpoint_eye_r_15.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_eye_r_15) {
    mesh_eye_r_15Geometry.scale(0.13, 0.134, 0.093);
  }
  const mesh_eye_r_15 = new THREE.Mesh(
    mesh_eye_r_15Geometry,
    materialMap["ocular"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_eye_r_15.name = "eye-r";
  if (endpoint_eye_r_15) {
    mesh_eye_r_15.position.copy(endpoint_eye_r_15.midpoint);
    mesh_eye_r_15.quaternion.copy(endpoint_eye_r_15.quaternion);
  }
  mesh_eye_r_15.castShadow = options.castShadow ?? true;
  mesh_eye_r_15.receiveShadow = options.receiveShadow ?? true;
  mesh_eye_r_15.userData.sculptComponent = {"id": "eye-r", "name": "eye-r", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "sculptedEye": {"irisRadiusNormalized": 0.34, "irisGrooveDepthNormalized": 0.015, "pupilRadiusNormalized": 0.23, "pupilRecessNormalized": 0.014, "sphericalSurface": true}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.118, 0.718, 0.184], "localEnd": [-0.118, 0.718, 0.184], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.13, "height": 0.134, "depth": 0.093, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.124, 0.683, 0.174], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.718, 0.184], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "ocular", "materialLayers": ["ocular"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_eye_r_15.add(mesh_eye_r_15);
  meshes["eye-r"] = mesh_eye_r_15;
  colliders["eye-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_eye_r_15);

  const endpoint_iris_r_16 = makeAttachmentEndpoint(null);
  const node_iris_r_16 = new THREE.Group();
  node_iris_r_16.name = "iris-r__pivot";
  node_iris_r_16.scale.set(1, 1, 1);
  if (endpoint_iris_r_16) {
    node_iris_r_16.position.copy(endpoint_iris_r_16.start);
    node_iris_r_16.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_iris_r_16.position.set(-0.118, 0.6809999999999999, 0.223);
    node_iris_r_16.rotation.set(0.0, 0.0, 0.0);
  }
  node_iris_r_16.userData.sculptComponent = {"id": "iris-r", "name": "iris-r", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.118, 0.716, 0.238], "localEnd": [-0.118, 0.716, 0.238], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.072, "height": 0.076, "depth": 0.01, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.118, 0.6809999999999999, 0.223], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.716, 0.238], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_iris_r_16.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.716, 0.238], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_iris_r_16);
  nodes["iris-r"] = node_iris_r_16;
  const mesh_iris_r_16Geometry = endpoint_iris_r_16
    ? new THREE.CylinderGeometry(endpoint_iris_r_16.endRadius, endpoint_iris_r_16.baseRadius, endpoint_iris_r_16.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_iris_r_16) {
    mesh_iris_r_16Geometry.scale(0.072, 0.076, 0.01);
  }
  const mesh_iris_r_16 = new THREE.Mesh(
    mesh_iris_r_16Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_iris_r_16.name = "iris-r";
  if (endpoint_iris_r_16) {
    mesh_iris_r_16.position.copy(endpoint_iris_r_16.midpoint);
    mesh_iris_r_16.quaternion.copy(endpoint_iris_r_16.quaternion);
  }
  mesh_iris_r_16.castShadow = options.castShadow ?? true;
  mesh_iris_r_16.receiveShadow = options.receiveShadow ?? true;
  mesh_iris_r_16.userData.sculptComponent = {"id": "iris-r", "name": "iris-r", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.118, 0.716, 0.238], "localEnd": [-0.118, 0.716, 0.238], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.072, "height": 0.076, "depth": 0.01, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.118, 0.6809999999999999, 0.223], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.716, 0.238], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_iris_r_16.add(mesh_iris_r_16);
  meshes["iris-r"] = mesh_iris_r_16;
  colliders["iris-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_iris_r_16);

  const endpoint_pupil_r_17 = makeAttachmentEndpoint(null);
  const node_pupil_r_17 = new THREE.Group();
  node_pupil_r_17.name = "pupil-r__pivot";
  node_pupil_r_17.scale.set(1, 1, 1);
  if (endpoint_pupil_r_17) {
    node_pupil_r_17.position.copy(endpoint_pupil_r_17.start);
    node_pupil_r_17.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_pupil_r_17.position.set(-0.118, 0.6809999999999999, 0.229);
    node_pupil_r_17.rotation.set(0.0, 0.0, 0.0);
  }
  node_pupil_r_17.userData.sculptComponent = {"id": "pupil-r", "name": "pupil-r", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.118, 0.716, 0.245], "localEnd": [-0.118, 0.716, 0.245], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.029, "height": 0.036, "depth": 0.006, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.118, 0.6809999999999999, 0.229], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.716, 0.245], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_pupil_r_17.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.716, 0.245], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_pupil_r_17);
  nodes["pupil-r"] = node_pupil_r_17;
  const mesh_pupil_r_17Geometry = endpoint_pupil_r_17
    ? new THREE.CylinderGeometry(endpoint_pupil_r_17.endRadius, endpoint_pupil_r_17.baseRadius, endpoint_pupil_r_17.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_pupil_r_17) {
    mesh_pupil_r_17Geometry.scale(0.029, 0.036, 0.006);
  }
  const mesh_pupil_r_17 = new THREE.Mesh(
    mesh_pupil_r_17Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_pupil_r_17.name = "pupil-r";
  if (endpoint_pupil_r_17) {
    mesh_pupil_r_17.position.copy(endpoint_pupil_r_17.midpoint);
    mesh_pupil_r_17.quaternion.copy(endpoint_pupil_r_17.quaternion);
  }
  mesh_pupil_r_17.castShadow = options.castShadow ?? true;
  mesh_pupil_r_17.receiveShadow = options.receiveShadow ?? true;
  mesh_pupil_r_17.userData.sculptComponent = {"id": "pupil-r", "name": "pupil-r", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.118, 0.716, 0.245], "localEnd": [-0.118, 0.716, 0.245], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.029, "height": 0.036, "depth": 0.006, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.118, 0.6809999999999999, 0.229], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.716, 0.245], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_pupil_r_17.add(mesh_pupil_r_17);
  meshes["pupil-r"] = mesh_pupil_r_17;
  colliders["pupil-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_pupil_r_17);

  const endpoint_eyelid_r_18 = makeAttachmentEndpoint(null);
  const node_eyelid_r_18 = new THREE.Group();
  node_eyelid_r_18.name = "eyelid-r__pivot";
  node_eyelid_r_18.scale.set(1, 1, 1);
  if (endpoint_eyelid_r_18) {
    node_eyelid_r_18.position.copy(endpoint_eyelid_r_18.start);
    node_eyelid_r_18.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_eyelid_r_18.position.set(-0.124, 0.683, 0.206);
    node_eyelid_r_18.rotation.set(0.0, 0.0, 0.0);
  }
  node_eyelid_r_18.userData.sculptComponent = {"id": "eyelid-r", "name": "eyelid-r", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "torusTubeRatio": 0.055}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.118, 0.718, 0.203], "localEnd": [-0.118, 0.718, 0.203], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.142, "height": 0.146, "depth": 0.044, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.124, 0.683, 0.206], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.718, 0.203], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_eyelid_r_18.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.718, 0.203], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_eyelid_r_18);
  nodes["eyelid-r"] = node_eyelid_r_18;
  const mesh_eyelid_r_18Geometry = endpoint_eyelid_r_18
    ? new THREE.CylinderGeometry(endpoint_eyelid_r_18.endRadius, endpoint_eyelid_r_18.baseRadius, endpoint_eyelid_r_18.length, 32, 12)
    : new THREE.TorusGeometry(0.45, 0.0248, 24, 96);
  if (!endpoint_eyelid_r_18) {
    mesh_eyelid_r_18Geometry.scale(0.142, 0.146, 0.044);
  }
  const mesh_eyelid_r_18 = new THREE.Mesh(
    mesh_eyelid_r_18Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_eyelid_r_18.name = "eyelid-r";
  if (endpoint_eyelid_r_18) {
    mesh_eyelid_r_18.position.copy(endpoint_eyelid_r_18.midpoint);
    mesh_eyelid_r_18.quaternion.copy(endpoint_eyelid_r_18.quaternion);
  }
  mesh_eyelid_r_18.castShadow = options.castShadow ?? true;
  mesh_eyelid_r_18.receiveShadow = options.receiveShadow ?? true;
  mesh_eyelid_r_18.userData.sculptComponent = {"id": "eyelid-r", "name": "eyelid-r", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "torus", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "torusTubeRatio": 0.055}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.118, 0.718, 0.203], "localEnd": [-0.118, 0.718, 0.203], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.142, "height": 0.146, "depth": 0.044, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.124, 0.683, 0.206], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.118, 0.718, 0.203], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_eyelid_r_18.add(mesh_eyelid_r_18);
  meshes["eyelid-r"] = mesh_eyelid_r_18;
  colliders["eyelid-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_eyelid_r_18);

  const endpoint_concha_r_19 = makeAttachmentEndpoint(null);
  const node_concha_r_19 = new THREE.Group();
  node_concha_r_19.name = "concha-r__pivot";
  node_concha_r_19.scale.set(1, 1, 1);
  if (endpoint_concha_r_19) {
    node_concha_r_19.position.copy(endpoint_concha_r_19.start);
    node_concha_r_19.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_concha_r_19.position.set(-0.236, 0.919, 0.02);
    node_concha_r_19.rotation.set(0.0, 0.0, 0.0);
  }
  node_concha_r_19.userData.sculptComponent = {"id": "concha-r", "name": "concha-r", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.238, 0.9, 0.04], "localEnd": [-0.238, 0.9, 0.04], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.07, "height": 0.107, "depth": 0.021, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.236, 0.919, 0.02], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.238, 0.9, 0.04], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_concha_r_19.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.238, 0.9, 0.04], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_concha_r_19);
  nodes["concha-r"] = node_concha_r_19;
  const mesh_concha_r_19Geometry = endpoint_concha_r_19
    ? new THREE.CylinderGeometry(endpoint_concha_r_19.endRadius, endpoint_concha_r_19.baseRadius, endpoint_concha_r_19.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_concha_r_19) {
    mesh_concha_r_19Geometry.scale(0.07, 0.107, 0.021);
  }
  const mesh_concha_r_19 = new THREE.Mesh(
    mesh_concha_r_19Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_concha_r_19.name = "concha-r";
  if (endpoint_concha_r_19) {
    mesh_concha_r_19.position.copy(endpoint_concha_r_19.midpoint);
    mesh_concha_r_19.quaternion.copy(endpoint_concha_r_19.quaternion);
  }
  mesh_concha_r_19.castShadow = options.castShadow ?? true;
  mesh_concha_r_19.receiveShadow = options.receiveShadow ?? true;
  mesh_concha_r_19.userData.sculptComponent = {"id": "concha-r", "name": "concha-r", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.238, 0.9, 0.04], "localEnd": [-0.238, 0.9, 0.04], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.07, "height": 0.107, "depth": 0.021, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.236, 0.919, 0.02], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.238, 0.9, 0.04], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_concha_r_19.add(mesh_concha_r_19);
  meshes["concha-r"] = mesh_concha_r_19;
  colliders["concha-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_concha_r_19);

  const endpoint_toe_r_0_20 = makeAttachmentEndpoint(null);
  const node_toe_r_0_20 = new THREE.Group();
  node_toe_r_0_20.name = "toe-r-0__pivot";
  node_toe_r_0_20.scale.set(1, 1, 1);
  if (endpoint_toe_r_0_20) {
    node_toe_r_0_20.position.copy(endpoint_toe_r_0_20.start);
    node_toe_r_0_20.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_toe_r_0_20.position.set(-0.16099999999999998, 0.057, 0.257);
    node_toe_r_0_20.rotation.set(0.0, 0.0, 0.0);
  }
  node_toe_r_0_20.userData.sculptComponent = {"id": "toe-r-0", "name": "toe-r-0", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.16849999999999998, 0.037, 0.237], "localEnd": [-0.16849999999999998, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.16099999999999998, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.16849999999999998, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_r_0_20.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.16849999999999998, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_toe_r_0_20);
  nodes["toe-r-0"] = node_toe_r_0_20;
  const mesh_toe_r_0_20Geometry = endpoint_toe_r_0_20
    ? new THREE.CylinderGeometry(endpoint_toe_r_0_20.endRadius, endpoint_toe_r_0_20.baseRadius, endpoint_toe_r_0_20.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_toe_r_0_20) {
    mesh_toe_r_0_20Geometry.scale(0.043, 0.072, 0.072);
  }
  const mesh_toe_r_0_20 = new THREE.Mesh(
    mesh_toe_r_0_20Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_toe_r_0_20.name = "toe-r-0";
  if (endpoint_toe_r_0_20) {
    mesh_toe_r_0_20.position.copy(endpoint_toe_r_0_20.midpoint);
    mesh_toe_r_0_20.quaternion.copy(endpoint_toe_r_0_20.quaternion);
  }
  mesh_toe_r_0_20.castShadow = options.castShadow ?? true;
  mesh_toe_r_0_20.receiveShadow = options.receiveShadow ?? true;
  mesh_toe_r_0_20.userData.sculptComponent = {"id": "toe-r-0", "name": "toe-r-0", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.16849999999999998, 0.037, 0.237], "localEnd": [-0.16849999999999998, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.16099999999999998, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.16849999999999998, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_r_0_20.add(mesh_toe_r_0_20);
  meshes["toe-r-0"] = mesh_toe_r_0_20;
  colliders["toe-r-0"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_toe_r_0_20);

  const endpoint_toe_r_1_21 = makeAttachmentEndpoint(null);
  const node_toe_r_1_21 = new THREE.Group();
  node_toe_r_1_21.name = "toe-r-1__pivot";
  node_toe_r_1_21.scale.set(1, 1, 1);
  if (endpoint_toe_r_1_21) {
    node_toe_r_1_21.position.copy(endpoint_toe_r_1_21.start);
    node_toe_r_1_21.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_toe_r_1_21.position.set(-0.123, 0.057, 0.257);
    node_toe_r_1_21.rotation.set(0.0, 0.0, 0.0);
  }
  node_toe_r_1_21.userData.sculptComponent = {"id": "toe-r-1", "name": "toe-r-1", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.1295, 0.037, 0.237], "localEnd": [-0.1295, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.123, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.1295, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_r_1_21.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.1295, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_toe_r_1_21);
  nodes["toe-r-1"] = node_toe_r_1_21;
  const mesh_toe_r_1_21Geometry = endpoint_toe_r_1_21
    ? new THREE.CylinderGeometry(endpoint_toe_r_1_21.endRadius, endpoint_toe_r_1_21.baseRadius, endpoint_toe_r_1_21.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_toe_r_1_21) {
    mesh_toe_r_1_21Geometry.scale(0.043, 0.072, 0.072);
  }
  const mesh_toe_r_1_21 = new THREE.Mesh(
    mesh_toe_r_1_21Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_toe_r_1_21.name = "toe-r-1";
  if (endpoint_toe_r_1_21) {
    mesh_toe_r_1_21.position.copy(endpoint_toe_r_1_21.midpoint);
    mesh_toe_r_1_21.quaternion.copy(endpoint_toe_r_1_21.quaternion);
  }
  mesh_toe_r_1_21.castShadow = options.castShadow ?? true;
  mesh_toe_r_1_21.receiveShadow = options.receiveShadow ?? true;
  mesh_toe_r_1_21.userData.sculptComponent = {"id": "toe-r-1", "name": "toe-r-1", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.1295, 0.037, 0.237], "localEnd": [-0.1295, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.123, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.1295, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_r_1_21.add(mesh_toe_r_1_21);
  meshes["toe-r-1"] = mesh_toe_r_1_21;
  colliders["toe-r-1"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_toe_r_1_21);

  const endpoint_toe_r_2_22 = makeAttachmentEndpoint(null);
  const node_toe_r_2_22 = new THREE.Group();
  node_toe_r_2_22.name = "toe-r-2__pivot";
  node_toe_r_2_22.scale.set(1, 1, 1);
  if (endpoint_toe_r_2_22) {
    node_toe_r_2_22.position.copy(endpoint_toe_r_2_22.start);
    node_toe_r_2_22.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_toe_r_2_22.position.set(-0.08499999999999999, 0.057, 0.257);
    node_toe_r_2_22.rotation.set(0.0, 0.0, 0.0);
  }
  node_toe_r_2_22.userData.sculptComponent = {"id": "toe-r-2", "name": "toe-r-2", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.0905, 0.037, 0.237], "localEnd": [-0.0905, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.08499999999999999, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.0905, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_r_2_22.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.0905, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_toe_r_2_22);
  nodes["toe-r-2"] = node_toe_r_2_22;
  const mesh_toe_r_2_22Geometry = endpoint_toe_r_2_22
    ? new THREE.CylinderGeometry(endpoint_toe_r_2_22.endRadius, endpoint_toe_r_2_22.baseRadius, endpoint_toe_r_2_22.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_toe_r_2_22) {
    mesh_toe_r_2_22Geometry.scale(0.043, 0.072, 0.072);
  }
  const mesh_toe_r_2_22 = new THREE.Mesh(
    mesh_toe_r_2_22Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_toe_r_2_22.name = "toe-r-2";
  if (endpoint_toe_r_2_22) {
    mesh_toe_r_2_22.position.copy(endpoint_toe_r_2_22.midpoint);
    mesh_toe_r_2_22.quaternion.copy(endpoint_toe_r_2_22.quaternion);
  }
  mesh_toe_r_2_22.castShadow = options.castShadow ?? true;
  mesh_toe_r_2_22.receiveShadow = options.receiveShadow ?? true;
  mesh_toe_r_2_22.userData.sculptComponent = {"id": "toe-r-2", "name": "toe-r-2", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.0905, 0.037, 0.237], "localEnd": [-0.0905, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.08499999999999999, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.0905, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_r_2_22.add(mesh_toe_r_2_22);
  meshes["toe-r-2"] = mesh_toe_r_2_22;
  colliders["toe-r-2"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_toe_r_2_22);

  const endpoint_toe_r_3_23 = makeAttachmentEndpoint(null);
  const node_toe_r_3_23 = new THREE.Group();
  node_toe_r_3_23.name = "toe-r-3__pivot";
  node_toe_r_3_23.scale.set(1, 1, 1);
  if (endpoint_toe_r_3_23) {
    node_toe_r_3_23.position.copy(endpoint_toe_r_3_23.start);
    node_toe_r_3_23.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_toe_r_3_23.position.set(-0.047, 0.057, 0.257);
    node_toe_r_3_23.rotation.set(0.0, 0.0, 0.0);
  }
  node_toe_r_3_23.userData.sculptComponent = {"id": "toe-r-3", "name": "toe-r-3", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.051500000000000004, 0.037, 0.237], "localEnd": [-0.051500000000000004, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.047, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.051500000000000004, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_r_3_23.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.051500000000000004, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_toe_r_3_23);
  nodes["toe-r-3"] = node_toe_r_3_23;
  const mesh_toe_r_3_23Geometry = endpoint_toe_r_3_23
    ? new THREE.CylinderGeometry(endpoint_toe_r_3_23.endRadius, endpoint_toe_r_3_23.baseRadius, endpoint_toe_r_3_23.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_toe_r_3_23) {
    mesh_toe_r_3_23Geometry.scale(0.043, 0.072, 0.072);
  }
  const mesh_toe_r_3_23 = new THREE.Mesh(
    mesh_toe_r_3_23Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_toe_r_3_23.name = "toe-r-3";
  if (endpoint_toe_r_3_23) {
    mesh_toe_r_3_23.position.copy(endpoint_toe_r_3_23.midpoint);
    mesh_toe_r_3_23.quaternion.copy(endpoint_toe_r_3_23.quaternion);
  }
  mesh_toe_r_3_23.castShadow = options.castShadow ?? true;
  mesh_toe_r_3_23.receiveShadow = options.receiveShadow ?? true;
  mesh_toe_r_3_23.userData.sculptComponent = {"id": "toe-r-3", "name": "toe-r-3", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.051500000000000004, 0.037, 0.237], "localEnd": [-0.051500000000000004, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.043, "height": 0.072, "depth": 0.072, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.047, 0.057, 0.257], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.051500000000000004, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_toe_r_3_23.add(mesh_toe_r_3_23);
  meshes["toe-r-3"] = mesh_toe_r_3_23;
  colliders["toe-r-3"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_toe_r_3_23);

  const endpoint_nose_24 = makeAttachmentEndpoint(null);
  const node_nose_24 = new THREE.Group();
  node_nose_24.name = "nose__pivot";
  node_nose_24.scale.set(1, 1, 1);
  if (endpoint_nose_24) {
    node_nose_24.position.copy(endpoint_nose_24.start);
    node_nose_24.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_nose_24.position.set(0.0, 0.6, 0.289);
    node_nose_24.rotation.set(0.0, 0.0, 0.0);
  }
  node_nose_24.userData.sculptComponent = {"id": "nose", "name": "nose", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "kittenNose": {"roundedTriangularPad": true, "nostrils": "paired shallow concave recesses", "profileDepth": 0.024}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0.64, 0.262], "localEnd": [0, 0.64, 0.262], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.049, "height": 0.031, "depth": 0.033, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0.6, 0.289], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.64, 0.262], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "nose-pad", "kind": "contour", "description": "short nasal pad", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_nose_24.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.64, 0.262], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_nose_24);
  nodes["nose"] = node_nose_24;
  const mesh_nose_24Geometry = endpoint_nose_24
    ? new THREE.CylinderGeometry(endpoint_nose_24.endRadius, endpoint_nose_24.baseRadius, endpoint_nose_24.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_nose_24) {
    mesh_nose_24Geometry.scale(0.049, 0.031, 0.033);
  }
  const mesh_nose_24 = new THREE.Mesh(
    mesh_nose_24Geometry,
    materialMap["clay"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_nose_24.name = "nose";
  if (endpoint_nose_24) {
    mesh_nose_24.position.copy(endpoint_nose_24.midpoint);
    mesh_nose_24.quaternion.copy(endpoint_nose_24.quaternion);
  }
  mesh_nose_24.castShadow = options.castShadow ?? true;
  mesh_nose_24.receiveShadow = options.receiveShadow ?? true;
  mesh_nose_24.userData.sculptComponent = {"id": "nose", "name": "nose", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "kittenNose": {"roundedTriangularPad": true, "nostrils": "paired shallow concave recesses", "profileDepth": 0.024}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0.64, 0.262], "localEnd": [0, 0.64, 0.262], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.049, "height": 0.031, "depth": 0.033, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0.6, 0.289], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.64, 0.262], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "clay", "materialLayers": ["clay"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "nose-pad", "kind": "contour", "description": "short nasal pad", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_nose_24.add(mesh_nose_24);
  meshes["nose"] = mesh_nose_24;
  colliders["nose"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_nose_24);

  const endpoint_philtrum_25 = makeAttachmentEndpoint(null);
  const node_philtrum_25 = new THREE.Group();
  node_philtrum_25.name = "philtrum__pivot";
  node_philtrum_25.scale.set(1, 1, 1);
  if (endpoint_philtrum_25) {
    node_philtrum_25.position.copy(endpoint_philtrum_25.start);
    node_philtrum_25.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_philtrum_25.position.set(0.0, 0.579, 0.286);
    node_philtrum_25.rotation.set(0.0, 0.0, 0.0);
  }
  node_philtrum_25.userData.sculptComponent = {"id": "philtrum", "name": "philtrum", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0.613, 0.282], "localEnd": [0, 0.613, 0.282], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.0025, "height": 0.025, "depth": 0.0025, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0.579, 0.286], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.613, 0.282], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "philtrum-groove", "kind": "contour", "description": "nasal to oral central line", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_philtrum_25.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.613, 0.282], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_philtrum_25);
  nodes["philtrum"] = node_philtrum_25;
  const mesh_philtrum_25Geometry = endpoint_philtrum_25
    ? new THREE.CylinderGeometry(endpoint_philtrum_25.endRadius, endpoint_philtrum_25.baseRadius, endpoint_philtrum_25.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_philtrum_25) {
    mesh_philtrum_25Geometry.scale(0.0025, 0.025, 0.0025);
  }
  const mesh_philtrum_25 = new THREE.Mesh(
    mesh_philtrum_25Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_philtrum_25.name = "philtrum";
  if (endpoint_philtrum_25) {
    mesh_philtrum_25.position.copy(endpoint_philtrum_25.midpoint);
    mesh_philtrum_25.quaternion.copy(endpoint_philtrum_25.quaternion);
  }
  mesh_philtrum_25.castShadow = options.castShadow ?? true;
  mesh_philtrum_25.receiveShadow = options.receiveShadow ?? true;
  mesh_philtrum_25.userData.sculptComponent = {"id": "philtrum", "name": "philtrum", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0.613, 0.282], "localEnd": [0, 0.613, 0.282], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.0025, "height": 0.025, "depth": 0.0025, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0.579, 0.286], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0.613, 0.282], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "philtrum-groove", "kind": "contour", "description": "nasal to oral central line", "evidenceRefs": ["reference-front.png"], "geometryEffect": {"type": "sculpted-relief", "amplitude": 0.005}}], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_philtrum_25.add(mesh_philtrum_25);
  meshes["philtrum"] = mesh_philtrum_25;
  colliders["philtrum"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_philtrum_25);

  const attachment_mouth_l_26 = {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005};
  const endpoint_mouth_l_26 = makeAttachmentEndpoint(attachment_mouth_l_26);
  const node_mouth_l_26 = new THREE.Group();
  node_mouth_l_26.name = "mouth-l__pivot";
  node_mouth_l_26.scale.set(1, 1, 1);
  if (endpoint_mouth_l_26) {
    node_mouth_l_26.position.copy(endpoint_mouth_l_26.start);
    node_mouth_l_26.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_mouth_l_26.position.set(0.0, 0.0, 0.0);
    node_mouth_l_26.rotation.set(0.0, 0.0, 0.0);
  }
  node_mouth_l_26.userData.sculptComponent = {"id": "mouth-l", "name": "mouth-l", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "tube", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "tubePath": {"points": [[0, 0.559, 0.26], [0.013, 0.55, 0.26], [0.03, 0.554, 0.26]], "radius": 0.0008, "tubularSegments": 24, "radialSegments": 6, "closed": false}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_mouth_l_26.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_mouth_l_26);
  nodes["mouth-l"] = node_mouth_l_26;
  const mesh_mouth_l_26Geometry = endpoint_mouth_l_26
    ? new THREE.CylinderGeometry(endpoint_mouth_l_26.endRadius, endpoint_mouth_l_26.baseRadius, endpoint_mouth_l_26.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0.559, 0.26], [0.013, 0.55, 0.26], [0.03, 0.554, 0.26]], "radius": 0.0008, "tubularSegments": 24, "radialSegments": 6, "closed": false});
  if (!endpoint_mouth_l_26) {
    mesh_mouth_l_26Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_mouth_l_26 = new THREE.Mesh(
    mesh_mouth_l_26Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_mouth_l_26.name = "mouth-l";
  if (endpoint_mouth_l_26) {
    mesh_mouth_l_26.position.copy(endpoint_mouth_l_26.midpoint);
    mesh_mouth_l_26.quaternion.copy(endpoint_mouth_l_26.quaternion);
  }
  mesh_mouth_l_26.castShadow = options.castShadow ?? true;
  mesh_mouth_l_26.receiveShadow = options.receiveShadow ?? true;
  mesh_mouth_l_26.userData.sculptComponent = {"id": "mouth-l", "name": "mouth-l", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "tube", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "tubePath": {"points": [[0, 0.559, 0.26], [0.013, 0.55, 0.26], [0.03, 0.554, 0.26]], "radius": 0.0008, "tubularSegments": 24, "radialSegments": 6, "closed": false}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_mouth_l_26.add(mesh_mouth_l_26);
  meshes["mouth-l"] = mesh_mouth_l_26;
  colliders["mouth-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_mouth_l_26);

  const attachment_mouth_r_27 = {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005};
  const endpoint_mouth_r_27 = makeAttachmentEndpoint(attachment_mouth_r_27);
  const node_mouth_r_27 = new THREE.Group();
  node_mouth_r_27.name = "mouth-r__pivot";
  node_mouth_r_27.scale.set(1, 1, 1);
  if (endpoint_mouth_r_27) {
    node_mouth_r_27.position.copy(endpoint_mouth_r_27.start);
    node_mouth_r_27.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_mouth_r_27.position.set(0.0, 0.0, 0.0);
    node_mouth_r_27.rotation.set(0.0, 0.0, 0.0);
  }
  node_mouth_r_27.userData.sculptComponent = {"id": "mouth-r", "name": "mouth-r", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "tube", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "tubePath": {"points": [[0, 0.559, 0.26], [-0.013, 0.55, 0.26], [-0.03, 0.554, 0.26]], "radius": 0.0008, "tubularSegments": 24, "radialSegments": 6, "closed": false}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_mouth_r_27.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_mouth_r_27);
  nodes["mouth-r"] = node_mouth_r_27;
  const mesh_mouth_r_27Geometry = endpoint_mouth_r_27
    ? new THREE.CylinderGeometry(endpoint_mouth_r_27.endRadius, endpoint_mouth_r_27.baseRadius, endpoint_mouth_r_27.length, 32, 12)
    : buildTubeGeometry({"points": [[0, 0.559, 0.26], [-0.013, 0.55, 0.26], [-0.03, 0.554, 0.26]], "radius": 0.0008, "tubularSegments": 24, "radialSegments": 6, "closed": false});
  if (!endpoint_mouth_r_27) {
    mesh_mouth_r_27Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_mouth_r_27 = new THREE.Mesh(
    mesh_mouth_r_27Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_mouth_r_27.name = "mouth-r";
  if (endpoint_mouth_r_27) {
    mesh_mouth_r_27.position.copy(endpoint_mouth_r_27.midpoint);
    mesh_mouth_r_27.quaternion.copy(endpoint_mouth_r_27.quaternion);
  }
  mesh_mouth_r_27.castShadow = options.castShadow ?? true;
  mesh_mouth_r_27.receiveShadow = options.receiveShadow ?? true;
  mesh_mouth_r_27.userData.sculptComponent = {"id": "mouth-r", "name": "mouth-r", "level": "micro", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "tube", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "stylized character part", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals", "tubePath": {"points": [[0, 0.559, 0.26], [-0.013, 0.55, 0.26], [-0.03, 0.554, 0.26]], "radius": 0.0008, "tubularSegments": 24, "radialSegments": 6, "closed": false}}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "relative", "confidence": 0.85}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_mouth_r_27.add(mesh_mouth_r_27);
  meshes["mouth-r"] = mesh_mouth_r_27;
  colliders["mouth-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_mouth_r_27);

  const endpoint_muzzle_pad_l_28 = makeAttachmentEndpoint(null);
  const node_muzzle_pad_l_28 = new THREE.Group();
  node_muzzle_pad_l_28.name = "muzzle-pad-l__pivot";
  node_muzzle_pad_l_28.scale.set(1, 1, 1);
  if (endpoint_muzzle_pad_l_28) {
    node_muzzle_pad_l_28.position.copy(endpoint_muzzle_pad_l_28.start);
    node_muzzle_pad_l_28.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_muzzle_pad_l_28.position.set(0.054, 0.566, 0.239);
    node_muzzle_pad_l_28.rotation.set(0.0, 0.0, 0.0);
  }
  node_muzzle_pad_l_28.userData.sculptComponent = {"id": "muzzle-pad-l", "name": "muzzle-pad-l", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "Short rounded muzzle pad embedded in face; paired feline whisker pads", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.051500000000000004, 0.037, 0.237], "localEnd": [0.051500000000000004, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.138, "height": 0.097, "depth": 0.083, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.054, 0.566, 0.239], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.051500000000000004, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_muzzle_pad_l_28.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.051500000000000004, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_muzzle_pad_l_28);
  nodes["muzzle-pad-l"] = node_muzzle_pad_l_28;
  const mesh_muzzle_pad_l_28Geometry = endpoint_muzzle_pad_l_28
    ? new THREE.CylinderGeometry(endpoint_muzzle_pad_l_28.endRadius, endpoint_muzzle_pad_l_28.baseRadius, endpoint_muzzle_pad_l_28.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_muzzle_pad_l_28) {
    mesh_muzzle_pad_l_28Geometry.scale(0.138, 0.097, 0.083);
  }
  const mesh_muzzle_pad_l_28 = new THREE.Mesh(
    mesh_muzzle_pad_l_28Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_muzzle_pad_l_28.name = "muzzle-pad-l";
  if (endpoint_muzzle_pad_l_28) {
    mesh_muzzle_pad_l_28.position.copy(endpoint_muzzle_pad_l_28.midpoint);
    mesh_muzzle_pad_l_28.quaternion.copy(endpoint_muzzle_pad_l_28.quaternion);
  }
  mesh_muzzle_pad_l_28.castShadow = options.castShadow ?? true;
  mesh_muzzle_pad_l_28.receiveShadow = options.receiveShadow ?? true;
  mesh_muzzle_pad_l_28.userData.sculptComponent = {"id": "muzzle-pad-l", "name": "muzzle-pad-l", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "Short rounded muzzle pad embedded in face; paired feline whisker pads", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [0.051500000000000004, 0.037, 0.237], "localEnd": [0.051500000000000004, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.138, "height": 0.097, "depth": 0.083, "units": "relative", "confidence": 0.85}, "transform": {"position": [0.054, 0.566, 0.239], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [0.051500000000000004, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_muzzle_pad_l_28.add(mesh_muzzle_pad_l_28);
  meshes["muzzle-pad-l"] = mesh_muzzle_pad_l_28;
  colliders["muzzle-pad-l"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_muzzle_pad_l_28);

  const endpoint_muzzle_pad_r_29 = makeAttachmentEndpoint(null);
  const node_muzzle_pad_r_29 = new THREE.Group();
  node_muzzle_pad_r_29.name = "muzzle-pad-r__pivot";
  node_muzzle_pad_r_29.scale.set(1, 1, 1);
  if (endpoint_muzzle_pad_r_29) {
    node_muzzle_pad_r_29.position.copy(endpoint_muzzle_pad_r_29.start);
    node_muzzle_pad_r_29.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_muzzle_pad_r_29.position.set(-0.054, 0.566, 0.239);
    node_muzzle_pad_r_29.rotation.set(0.0, 0.0, 0.0);
  }
  node_muzzle_pad_r_29.userData.sculptComponent = {"id": "muzzle-pad-r", "name": "muzzle-pad-r", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "Short rounded muzzle pad embedded in face; paired feline whisker pads", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.16849999999999998, 0.037, 0.237], "localEnd": [-0.16849999999999998, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.138, "height": 0.097, "depth": 0.083, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.054, 0.566, 0.239], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.16849999999999998, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_muzzle_pad_r_29.userData.actionProfile = {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.16849999999999998, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}};
  (nodes["root"] ?? root).add(node_muzzle_pad_r_29);
  nodes["muzzle-pad-r"] = node_muzzle_pad_r_29;
  const mesh_muzzle_pad_r_29Geometry = endpoint_muzzle_pad_r_29
    ? new THREE.CylinderGeometry(endpoint_muzzle_pad_r_29.endRadius, endpoint_muzzle_pad_r_29.baseRadius, endpoint_muzzle_pad_r_29.length, 32, 12)
    : new THREE.SphereGeometry(0.5, 32, 20);
  if (!endpoint_muzzle_pad_r_29) {
    mesh_muzzle_pad_r_29Geometry.scale(0.138, 0.097, 0.083);
  }
  const mesh_muzzle_pad_r_29 = new THREE.Mesh(
    mesh_muzzle_pad_r_29Geometry,
    materialMap["hidden"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_muzzle_pad_r_29.name = "muzzle-pad-r";
  if (endpoint_muzzle_pad_r_29) {
    mesh_muzzle_pad_r_29.position.copy(endpoint_muzzle_pad_r_29.midpoint);
    mesh_muzzle_pad_r_29.quaternion.copy(endpoint_muzzle_pad_r_29.quaternion);
  }
  mesh_muzzle_pad_r_29.castShadow = options.castShadow ?? true;
  mesh_muzzle_pad_r_29.receiveShadow = options.receiveShadow ?? true;
  mesh_muzzle_pad_r_29.userData.sculptComponent = {"id": "muzzle-pad-r", "name": "muzzle-pad-r", "level": "meso", "role": "body", "importance": 0.9, "confidence": 0.85, "primitive": "ellipsoid", "topologyClass": "assembled-solid", "topologyRationale": "Embedded ocular or relief subpart with real volume, not a projected image.", "geometryDescriptor": {"topologyIntent": "Short rounded muzzle pad embedded in face; paired feline whisker pads", "edgeTreatment": {"type": "none", "bevelRadius": 0.0, "segments": 1}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "smooth vertex normals"}, "parent": "root", "attachment": {"parent": "root", "parentSocket": "origin", "localStart": [-0.16849999999999998, 0.037, 0.237], "localEnd": [-0.16849999999999998, 0.037, 0.237], "contactType": "embedded", "embedDepth": 0.025, "overlap": 0.025, "gapTolerance": 0.005}, "dimensions": {"width": 0.138, "height": 0.097, "depth": 0.083, "units": "relative", "confidence": 0.85}, "transform": {"position": [-0.054, 0.566, 0.239], "rotation": [0, 0, 0]}, "actionProfile": {"animationRole": "static", "pivot": {"mode": "center", "localPosition": [-0.16849999999999998, 0.037, 0.237], "axis": [0, 1, 0], "confidence": 0.7}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": false}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "pelvis", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0.0, "debrisMaterial": "pants"}}, "material": "hidden", "materialLayers": ["hidden"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0.0, "microRoughness": 0.0, "bumpAmplitude": 0, "normalPattern": "none", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": "Smooth grey shape study."}, "evidenceRefs": ["reference-front.png", "reference-left.png"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(150, 147, 143, 1)", "secondaryAlbedo": "rgba(150, 147, 143, 1)", "materialClass": "ceramic", "materialClassConfidence": 0.8, "evidenceRefs": ["reference-front.png"]}};
  node_muzzle_pad_r_29.add(mesh_muzzle_pad_r_29);
  meshes["muzzle-pad-r"] = mesh_muzzle_pad_r_29;
  colliders["muzzle-pad-r"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "box proxy"};
  destructionGroups["pelvis"] ??= [];
  destructionGroups["pelvis"].push(node_muzzle_pad_r_29);

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "geometry-study", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  refineGuluGeometry(root);
  return root;
}

export function createGuluSeatedClayKittenLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "Gulu seated clay kitten look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = ["Key area light above front left; soft shadows, exposure 1.0 and ACES tone mapping.", "Fill area light front right .4 key intensity.", "Rear rim light .5 key intensity; contact shadow on neutral ground."];
  lights.userData.lookDevTargets = {"qualityPriority": "geometry-study", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createGuluSeatedClayKittenEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameGuluSeatedClayKittenCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createGuluSeatedClayKittenPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureGuluSeatedClayKittenRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createGuluSeatedClayKittenInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
