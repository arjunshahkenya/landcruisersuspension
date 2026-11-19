import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { buildCabin } from './model/cabin.js';
import { buildBody } from './model/body.js';
import { buildEnds } from './model/ends.js';
import { buildAccessories } from './model/accessories.js';
import { buildWheels } from './model/wheels.js';
import { buildChassis } from './model/chassis.js';

// Each rigid assembly can be batched independently, so the viewer can still
// isolate the running gear. Keep transparent surfaces separate for depth sorting.
export function batch(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse(part => {
    if (!part.isMesh || part.isInstancedMesh || !part.visible) return;
    const mat = part.material;
    if (Array.isArray(mat) || mat.transparent) return;
    const signature = [mat.uuid, part.renderOrder, ...Object.keys(part.geometry.attributes).sort()].join('/');
    if (!buckets.has(signature)) buckets.set(signature, []);
    buckets.get(signature).push(part);
  });
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const pieces = meshes.map(mesh => {
      const geom = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      if (!geom.index) geom.setIndex(Array.from({length:geom.attributes.position.count}, (_, i) => i));
      if (mesh.matrixWorld.determinant() < 0) {
        const idx = geom.index.array;
        for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      }
      return geom;
    });
    const merged = mergeGeometries(pieces);
    pieces.forEach(geometry => geometry.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, meshes[0].material);
    mesh.name = meshes[0].name;
    mesh.renderOrder = meshes[0].renderOrder;
    meshes.forEach(item => item.removeFromParent());
    group.add(mesh);
  }
  return group;
}

export function vehicle() {
  const group = new THREE.Group();
  const exterior = new THREE.Group();
  const body = buildBody(THREE);
  exterior.add(batch(body), batch(buildCabin(THREE)), batch(buildEnds(THREE)), batch(buildAccessories(THREE)));
  group.add(exterior, buildChassis(THREE), buildWheels(THREE));
  return { group, exterior };
}
