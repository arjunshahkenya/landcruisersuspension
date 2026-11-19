// The side elevation is calibrated against the photographed wheel centres,
// beltline and hubs. Photo coordinates include camera pitch and the smaller
// apparent scale of glass and panels set inboard of the outer fender.
const atlases = {
  paint: {file: 'surface-paint.webp', x: -40, y: 365, w: 1280, h: 155},
  cladding: {file: 'surface-cladding.webp', x: -40, y: 508, w: 1280, h: 104},
  'front-glass': {file: 'surface-front-glass.webp', x: -40, y: 251, w: 1280, h: 153},
  'rear-glass': {file: 'surface-privacy-glass.webp', x: -40, y: 251, w: 1280, h: 153},
  'quarter-glass': {file: 'surface-privacy-glass.webp', x: -40, y: 251, w: 1280, h: 153},
};

const textures = new Map();
const finishes = new WeakMap();

function texture(THREE, file, color) {
  if (!textures.has(file)) {
    const map = new THREE.TextureLoader().load(new URL('./assets/'+file,import.meta.url).href);
    map.name = file;
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.anisotropy = 4;
    textures.set(file, map);
  }
  return textures.get(file);
}

export function applySideSurface(THREE, mesh, kind) {
  const atlas = atlases[kind];
  if (!atlas) throw new Error('Unknown side surface ' + kind);
  const shape = mesh.geometry;
  const points = shape.getAttribute('position');
  const uv = new Float32Array(points.count * 2);
  for (let i = 0; i < points.count; i++) {
    const lateral = Math.abs(points.getX(i));
    const recess = 1 + (.932 - lateral) / 3.3;
    const px = 579.5 + (points.getZ(i) + .19) * 265.2 / recess;
    const py = 434.5 + .008 * (px - 579.5) + (1.114 - points.getY(i)) * 265.2 / recess;
    uv[i*2] = (px - atlas.x) / atlas.w;
    uv[i*2+1] = 1 - (py - atlas.y) / atlas.h;
  }
  shape.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return applyFinish(THREE, mesh, kind, atlas.file);
}

export function applyBonnetSurface(THREE, mesh) {
  // The photograph was rectified onto this metric XZ rectangle using the
  // four bonnet shut-line endpoints. The nose is at the top of the atlas.
  const shape = mesh.geometry;
  const points = shape.getAttribute('position');
  const uv = new Float32Array(points.count * 2);
  for (let i = 0; i < points.count; i++) {
    uv[i*2] = (points.getX(i) + .98) / 1.96;
    uv[i*2+1] = (points.getZ(i) - .61) / 1.77;
  }
  shape.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return applyFinish(THREE, mesh, 'bonnet', 'surface-bonnet.webp');
}

function applyFinish(THREE, mesh, kind, file) {
  if (typeof document === 'undefined') return mesh;
  const original = mesh.material;
  let cache = finishes.get(original);
  if (!cache) {
    cache = new Map();
    finishes.set(original, cache);
  }
  let material = cache.get(file);
  if (!material) {
    material = original.clone();
    material.name = 'Photo-referenced ' + kind;
    material.map = texture(THREE, file, true);
    material.color.set(0xffffff);
    if (kind === 'paint' || kind === 'bonnet') {
      // One packed finish texture carries paint texture (R), variable
      // roughness (G), and the exposed chips' reduced metal response (B).
      const finish = texture(THREE, kind === 'paint' ? 'surface-paint-finish.webp' : 'surface-bonnet-finish.webp', false);
      material.bumpMap = finish;
      material.bumpScale = .00045;
      material.roughnessMap = finish;
      material.metalnessMap = finish;
      material.roughness = .42;
      material.clearcoat = .53;
      material.clearcoatRoughness = .24;
      material.envMapIntensity = .72;
    } else if (kind === 'rear-glass' || kind === 'quarter-glass') {
      // The photographed rear-door and quarter glazing has a dark privacy tint.
      material.opacity = .94;
      material.clearcoat = .36;
      material.metalness = .11;
      material.envMapIntensity = .72;
    }
    cache.set(file, material);
  }
  mesh.material = material;
  return mesh;
}
