// An economical studio-light approximation for the Canvas renderer. Material
// constants are transformed once; the hot loop writes straight into its buffer.
const clamp01 = n => Math.max(0, Math.min(1, n));
const toDisplay = linear => (linear <= .0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - .055) * 255;
function band(value, midpoint, halfWidth) {
  const ramp = clamp01(1 - Math.abs(value - midpoint) / halfWidth);
  return ramp * ramp * (3 - 2 * ramp);
}
export function makeShade(material) {
  const {color, metalness = 0, roughness = .55, clearcoat = 0} = material;
  const red = toDisplay(color?.r ?? 1);
  const green = toDisplay(color?.g ?? 1);
  const blue = toDisplay(color?.b ?? 1);
  const textured = !!material.map;
  const glass = !!material.transparent && clearcoat > .5;
  const glossy = 1 - roughness;
  const highlight = (4 + 44 * metalness + 28 * clearcoat) * glossy * glossy;
  const baseGain = metalness * glossy;
  const mapGain = textured ? .6 : 0;
  return function shade(nx, ny, nz, vx, vy, vz, x, y, z, output, i) {
    const up = .5 + .5 * ny;
    const key = Math.max(0, -.41*nx + .77*ny + .49*nz);
    const fill = Math.max(0, .62*nx + .48*ny - .62*nz);
    const lower = Math.max(0, -ny) * clamp01(-vy + .23);
    // Lift the lower assembly when inspected from below, retaining relief
    // between its horizontal plates, vertical brackets and curved components.
    const lowKey = lower * (.12 + .22 * Math.max(0, -.4*nx - .8*ny + .44*nz));
    const illumination = .61 + .18*up + .37*key + .17*fill + lowKey;
    const light = illumination + mapGain*(1 - illumination);
    const dot = clamp01(nx*vx + ny*vy + nz*vz);
    const ry = 2*dot*ny - vy;
    const rx = 2*dot*nx - vx;
    const rz = 2*dot*nz - vz;
    const fringe = 1 - dot;
    const fresnel = fringe * fringe * fringe;
    // Broad overhead banks and one narrow angled strip show the compound panel
    // curvature. Their reflection coordinates remain fixed as the car is orbited.
    const ceiling = band(ry - .08*rz, .68, .34 + .14*roughness);
    const strip = band(.90*ry - .36*rx + .22*rz, .29, .10 + .13*roughness);
    const sidewall = band(.83*rx + .56*rz, .60, .26) * band(ry, .21, .54);
    const softbox = .83*ceiling + .55*strip + .23*sidewall;
    const reflection = (highlight*(.12 + softbox) + (9 + 17*baseGain + 24*clearcoat)*fresnel*glossy) * (textured ? .20 : 1);
    const contrast = 1 + baseGain*(.20*up + .20*softbox - .20);
    const gain = light * contrast;
    const sky = glass ? 3 + 7*up : 0;
    output[i] = Math.min(255, red*gain + reflection + sky*.65);
    output[i+1] = Math.min(255, green*gain + reflection + sky*.9);
    output[i+2] = Math.min(255, blue*gain + reflection*(1+.035*up) + sky);
  };
}
