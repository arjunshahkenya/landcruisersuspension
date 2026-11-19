import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as three from 'three';
import { buildBody } from '../model/body.js';
import { buildEnds } from '../model/ends.js';
import { buildAccessories } from '../model/accessories.js';
import { buildCabin } from '../model/cabin.js';

// Run with node scripts/bake-driving-body.mjs after changing the bodywork.
// Blender 4.x performs the offline reduction. The published site requires only JS.
const project = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'cruiser-body-'));
const parts = [];
// Texture data is sampled at runtime. Only the original UVs and filenames are
// needed for baking. Small round fittings can start from fewer subdivisions.
const T = {
  ...three,
  TextureLoader: class {
    load(uri) {
      const texture = new three.Texture();
      texture.userData.source = basename(fileURLToPath(uri));
      return texture;
    }
  },
  TubeGeometry: class extends three.TubeGeometry {
    constructor(curve, length, radius, radial, closed) {
      super(curve, Math.max(4, Math.min(40, Math.ceil(length * .42))), radius, Math.min(6, radial), closed);
    }
  }
};
globalThis.document = {};
const minor = /bolt|washer|fastener|drain|permit|scuttle slot|seal screws|rubber tread rib|tread-groove|weld line|tiny|stitch|secondary reflector|moulded vertical prisms|small diode|socket wall|LED chip|individual optical|defroster|heater (line|wire)|printed v8|VX limited|etched|pleat|perforation|pedal|console|footwell|cupholder|seat belt|seatbelt|seam welt|vertical ribs|hatch handle pocket|doorlock|pin cap/i;
const cabinAtDistance = /headrest|seatback|seat cushion|dashboard|front squab|steering wheel rim/i;
function capture(part, group) {
  group.updateMatrixWorld(true);
  group.traverse(mesh => {
    if (!mesh.isMesh || minor.test(mesh.name) || (part === 'cabin' && !cabinAtDistance.test(mesh.name))) return;
    const size = new T.Box3().setFromObject(mesh).getSize(new T.Vector3());
    if (Math.max(size.x, size.y, size.z) < .06) return;
    const geometry = mesh.geometry, material = mesh.material;
    const { position, normal, uv } = geometry.attributes;
    const point = new T.Vector3(), direction = new T.Vector3();
    const orientation = new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const verts = [], normals = [], uvs = [];
    for (let i = 0; i < position.count; ++i) {
      verts.push(...point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).toArray());
      normals.push(...direction.fromBufferAttribute(normal, i).applyMatrix3(orientation).normalize().toArray());
      uvs.push(uv?.getX(i) ?? 0, uv?.getY(i) ?? 0);
    }
    parts.push({
      name:mesh.name, part, color:material.color.clone().convertLinearToSRGB().toArray().map(c => Math.round(c * 255)),
      m:material.metalness ?? 0, r:material.roughness ?? .6, alpha:material.opacity,
      glass:material.transparent, tex:material.map?.userData.source ?? '',
      verts, norm:normals, uvs, index:geometry.index ? Array.from(geometry.index.array) :
        Array.from({length: position.count}, (_, i) => i)
    });
  });
}
try {
  for (const [name, make] of [['body',buildBody], ['ends',buildEnds], ['accessories',buildAccessories], ['cabin',buildCabin]]) {
    capture(name, make(T));
  }
  const draft = join(temporary, 'body.json');
  await writeFile(draft, JSON.stringify(parts));
  const child = spawnSync('blender', ['-b', '--factory-startup', '-t', '2', '--python-exit-code', '1',
    '-P', join(project, 'scripts/reduce-driving-body.py'), '--', draft, join(project, 'model/sim-driving-mesh.js')],
    {stdio:'inherit'});
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error('Blender did not complete the driving mesh.');
} finally {
  await rm(temporary, {recursive:true, force:true});
}
