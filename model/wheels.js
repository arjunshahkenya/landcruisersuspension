// All dimensions are in metres. Each wheel is assembled facing local +Z.
export function buildWheels(THREE) {
  const assembly = new THREE.Group();
  assembly.name = 'Five-spoke alloy wheels and all-terrain tires';
  const wheel = new THREE.Group();
  const tau = Math.PI * 2;
  const surface = (color, roughness, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  const rubber = surface(0x292826, .92);
  const tread = surface(0x302f2b, .94);
  const blocks = surface(0x33312e, .92);
  const alloy = surface(0xbdafa0, .35, .66);
  const spokeInlay = surface(0x625f5e, .4, .56);
  const barrel = surface(0x4d4c48, .53, .58);
  barrel.side = THREE.DoubleSide;
  const brakeSteel = surface(0x81807a, .49, .65);
  const brakeDark = surface(0x484642, .7, .47);
  const agedSteel = surface(0x504740, .66, .37);
  const cap = surface(0x363535, .63, .27);

  function add(geometry, material, name) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    wheel.add(mesh);
    return mesh;
  }

  // Revolve a radial/axial section around the wheel spindle.
  function ring(profile, segments = 96) {
    const vertices = [], indices = [], uvs = [];
    for (const [radius, z] of profile) {
      for (let j = 0; j <= segments; j++) {
        const a = tau * j / segments, x = radius * Math.cos(a), y = radius * Math.sin(a);
        vertices.push(x, y, z);
        uvs.push(.5 + x / .81, .5 + y / .81);
      }
    }
    for (let i = 0; i < profile.length - 1; i++) {
      for (let j = 0; j < segments; j++) {
        const k = i * (segments + 1) + j;
        indices.push(k, k + 1, k + segments + 2, k, k + segments + 2, k + segments + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    const normals = g.attributes.normal;
    for (let i = 0; i < profile.length; i++) {
      const l = i * (segments + 1), r = l + segments;
      const normal = new THREE.Vector3(normals.getX(l) + normals.getX(r), normals.getY(l) + normals.getY(r), normals.getZ(l) + normals.getZ(r)).normalize();
      normals.setXYZ(l, normal.x, normal.y, normal.z);
      normals.setXYZ(r, normal.x, normal.y, normal.z);
    }
    return g;
  }

  const halfProfile = [
    [.204, .088], [.208, .108], [.216, .116], [.224, .120],
    [.230, .125], [.247, .132], [.267, .1375], [.285, .140],
    [.310, .1415], [.332, .1405], [.349, .138], [.362, .134],
    [.372, .128], [.382, .118], [.389, .104], [.393, .085],
    [.394, .058], [.395, .031], [.3955, 0],
  ];
  function interpolate(points, value) {
    if (value <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      if (value > points[i][0]) continue;
      const [a, va] = points[i - 1], [b, vb] = points[i];
      return va + (vb - va) * (value - a) / (b - a);
    }
    return points.at(-1)[1];
  }
  const sideDepth = r => interpolate(halfProfile, r);
  const crown = halfProfile.slice(9).map(([r, z]) => [z, r]).reverse();
  const treadRadius = z => interpolate(crown, Math.abs(z));

  const casing = halfProfile.map(([r, z]) => [r, -z]).concat(halfProfile.slice(0, -1).reverse());
  add(ring(casing), rubber, 'Radial tire casing');
  for (const side of [-1, 1]) {
    for (const r of [.224, .229, .323, .328]) {
      const z = sideDepth(r);
      const shape = [[r + .001, z - .0002], [r + .00065, z + .0005], [r, z + .0007], [r - .0007, z + .0003], [r - .001, z - .0003]];
      const oriented = side > 0 ? shape : shape.reverse();
      add(ring(oriented.map(([radius, depth]) => [radius, depth * side])), rubber, 'Molded tire bead');
    }
  }

  // A crowned tread with physical center blocks, alternating split sipes
  // and lugs that wrap over the shoulder and down onto both sidewalls.
  const tireParts = [[], []];
  function tri(out, a, b, c) { out.push(...a, ...b, ...c); }
  function block(out, outline, pointAt, rise) {
    const cx = outline.reduce((a, p) => a + p[0], 0) / outline.length;
    const cy = outline.reduce((a, p) => a + p[1], 0) / outline.length;
    const lower = outline.map(([x, y]) => pointAt(x, y, -.00035));
    const crest = outline.map(([x, y]) => pointAt(x, y, rise * .72));
    const face = outline.map(([x, y]) => pointAt(cx + (x - cx) * .93, cy + (y - cy) * .955, rise));
    const middle = pointAt(cx, cy, rise);
    for (let i = 0; i < outline.length; i++) {
      const j = (i + 1) % outline.length;
      tri(out, middle, face[i], face[j]);
      tri(out, lower[i], lower[j], crest[j]); tri(out, lower[i], crest[j], crest[i]);
      tri(out, crest[i], crest[j], face[j]); tri(out, crest[i], face[j], face[i]);
    }
  }
  function clip(poly, direction, offset) {
    const result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = direction * (a[0] + a[1] * .3) - offset, db = direction * (b[0] + b[1] * .3) - offset;
      if (da >= 0) result.push(a);
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return result;
  }

  const pitches = 46;
  for (let i = 0; i < pitches; i++) {
    const a = tau * i / pitches;
    for (let row = 0; row < 4; row++) {
      const z = (row - 1.5) * .046;
      const lean = row % 2 ? 1 : -1;
      const phase = a + (row % 2 ? .05 : 0) + Math.cos(row + i * 1.8) * .002;
      const poly = [[-.021,-.016], [-.012,-.022], [.017,-.020], [.021,-.012], [.022,.010], [.014,.020], [-.016,.022], [-.022,.015]]
        .map(([u, v]) => [u + lean * v * .40, v]);
      const pt = (u, v, h) => {
        const angle = phase + u / .399, radius = treadRadius(z + v) + h;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius, z + v];
      };
      for (const d of [-1, 1]) block(tireParts[(i+row)%2], clip(poly, d, .00085), pt, .009);
    }
    for (const side of [-1, 1]) {
      const phase = a + (side > 0 ? .060 : .012);
      const long = (i + (side > 0 ? 1 : 0)) % 2 === 0;
      // Tangential and axial coordinates, CCW as viewed from above the tread.
      const poly = [[-.021,.091], [.013,.088], [.021,.096], [.021,.116], [.016,.129], [.005,.136], [-.013,.135], [-.016,.126], [-.023,.117]]
        .map(([u, v]) => [u + (v - .11) * (long ? .20 : -.32), v * side]);
      if (side < 0) poly.reverse();
      block(tireParts[i%2], poly, (u, v, h) => {
        const angle = phase + u / .393, radius = treadRadius(v) + h;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius, v];
      }, .0091);
      const minR = long ? .327 : .342;
      const lugs = [[-.018,.374], [-.020,.361], [-.013,minR + .009], [-.002,minR], [.017,minR + .007], [.014,.348], [.021,.361], [.016,.375]];
      // In (tangent,radius) space CCW gives the -Z face.
      if (side > 0) lugs.reverse();
      block(tireParts[(i+1)%2], lugs, (u,r,h) => {
        const angle = phase + u / r;
        return [r*Math.cos(angle), r*Math.sin(angle), side*(sideDepth(r)+h)];
      }, .0035);
    }
  }
  function triangles(points) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    g.computeVertexNormals();
    return g;
  }
  tireParts.forEach((p, i) => add(triangles(p), i ? tread : blocks, 'Interlocking all-terrain tread'));

  // White raised lettering sits on the curved face of the outer sidewall.
  if (typeof document !== 'undefined' || typeof OffscreenCanvas !== 'undefined') {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1024, 1024);
    canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(512, 512); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      function arcText(txt, theta, radius, font, spacing, color) {
        ctx.fillStyle = color; ctx.font = font;
        const widths = [...txt].map(ch => ctx.measureText(ch).width + spacing);
        let t = theta - widths.reduce((a, b) => a + b, 0) / (2 * radius);
        [...txt].forEach((ch, i) => {
          const w = widths[i], angle = t + w / (2 * radius);
          ctx.save(); ctx.rotate(angle); ctx.translate(0, -radius); ctx.fillText(ch, 0, 0); ctx.restore();
          t += w / radius;
        });
      }
      arcText('BFGoodrich', -.18, 324, 'italic 900 40px Arial, sans-serif', 3.7, '#e2d9cb');
      arcText('All-Terrain T/A', Math.PI - .11, 324, 'italic 900 36px Arial, sans-serif', 3.3, '#dfd6c9');
      arcText('RADIAL  TUBELESS', 1.56, 326, 'bold 11px Arial, sans-serif', 1.2, '#494641');
      arcText('B A J A   C H A M P I O N', -1.57, 322, 'bold 9px Arial, sans-serif', .6, '#484541');
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const ink = new THREE.MeshStandardMaterial({ map: tex, alphaTest: .18, roughness: .91, metalness: 0 });
      const band = [.297,.282,.266,.249,.239,.231].map(r => [r, sideDepth(r) + .00075]);
      add(ring(band), ink, 'BFGoodrich All-Terrain T/A sidewall lettering');
    }
  }

  // The brake rotor is visible through the five openings and from underneath.
  add(ring([[.057,-.048],[.149,-.048],[.150,-.044],[.150,-.039],[.144,-.038],[.144,-.034],[.150,-.033],[.150,-.027],[.149,-.025],[.060,-.025],[.053,-.020]]), brakeSteel, 'Vented brake rotor');
  add(ring([[.047,-.054],[.125,-.054],[.133,-.052],[.133,-.049],[.049,-.049]]), brakeDark, 'Rotor backing plate');
  add(ring([[.046,-.076],[.057,-.073],[.064,-.047],[.074,-.041],[.074,.022],[.065,.036],[.047,.036]]), agedSteel, 'Brake bell and hub');
  const caliper = new THREE.Shape();
  caliper.moveTo(-.036,.096); caliper.quadraticCurveTo(-.051,.1,-.054,.119);
  caliper.lineTo(-.05,.146); caliper.quadraticCurveTo(-.045,.159,-.018,.166);
  caliper.quadraticCurveTo(.021,.173,.038,.155); caliper.lineTo(.047,.124);
  caliper.quadraticCurveTo(.048,.107,.032,.100); caliper.closePath();
  const caliperGeo = new THREE.ExtrudeGeometry(caliper,{ depth:.038,bevelEnabled:true,bevelSegments:2,bevelSize:.005,bevelThickness:.005,curveSegments:6 });
  caliperGeo.rotateZ(-.99); caliperGeo.translate(0,0,-.065);
  add(caliperGeo,brakeDark,'Cast brake caliper');
  add(ring([[.190,-.100],[.204,-.105],[.209,-.102],[.209,-.097],[.201,-.092],[.196,-.080],[.186,-.020],[.182,.042],[.190,.086],[.198,.099],[.204,.099]]), barrel, 'Inner alloy barrel');

  add(ring([[.192,.081],[.205,.089],[.210,.104],[.213,.111],[.212,.116],[.209,.120],[.204,.121],[.199,.118],[.197,.115],[.195,.111],[.191,.108]]), alloy, 'Machined rim lip');
  add(ring([[.031,.027],[.072,.033],[.082,.052],[.090,.071],[.094,.083],[.089,.093],[.075,.100],[.052,.095],[.037,.082]]), barrel, 'Cast wheel centre');

  // Five scalloped spokes have bright cut edges and a recessed graphite flute.
  const sections = [
    [.057,.034,.090],[.077,.044,.093],[.095,.044,.091],[.113,.038,.094],
    [.137,.033,.100],[.160,.034,.105],[.181,.036,.109],[.193,.042,.112],[.203,.052,.112],
  ];
  const strips = [-1,-.73,-.66,-.55,0,.55,.66,.73,1];
  const drop = [0,0,.004,.009,.011,.009,.004,0,0];
  const silver = [], dark = [], sides = [];
  for (let i = 0; i < 5; i++) {
    const a = Math.PI/2 + .08 + i*tau/5, cs=Math.cos(a), sn=Math.sin(a);
    const at = (j,k) => {
      const [r,w,d] = sections[j], t = w * strips[k];
      const recess = Math.min(1,(r-.052)/.031,Math.max(.06,(.205-r)/.026));
      return [cs*r-sn*t, sn*r+cs*t,d-drop[k]*recess];
    };
    for (let j=0;j<sections.length-1;j++) {
      for (let k=0;k<strips.length-1;k++) {
        const out = k === 0 || k === strips.length-2 ? silver : dark;
        const a=at(j,k), b=at(j+1,k), c=at(j+1,k+1), d=at(j,k+1);
        tri(out,a,b,c); tri(out,a,c,d);
      }
      const back = (row, column) => { const p=at(row,column); return [p[0],p[1],p[2]-.029]; };
      const bl=back(j,0), br=back(j,8), tl=back(j+1,0), tr=back(j+1,8);
      tri(sides,bl,br,tr); tri(sides,bl,tr,tl);
      for (const k of [0, strips.length-1]) {
        const a=at(j,k), b=at(j+1,k), c=[b[0],b[1],b[2]-.029], d=[a[0],a[1],a[2]-.029];
        if (k===0) { tri(sides,a,d,c); tri(sides,a,c,b); }
        else { tri(sides,a,b,c); tri(sides,a,c,d); }
      }
    }
  }
  add(triangles(silver),alloy,'Five machined spoke faces');
  add(triangles(dark),spokeInlay,'Recessed spoke flutes');
  add(triangles(sides),barrel,'Cast spoke edges');

  add(ring([[.032,.074],[.047,.077],[.051,.085],[.050,.097],[.044,.103],[.036,.104],[.004,.104],[.0001,.104]]), cap, 'Dust cap');
  const lugSocket = ring([[.007,.088],[.016,.089],[.019,.096],[.017,.101],[.013,.099],[.010,.093]],24);
  const lug = ring([[.0001,.096],[.009,.096],[.011,.101],[.010,.110],[.008,.112],[.0001,.112]],6);
  for (let i=0;i<5;i++) {
    const a=Math.PI/2+.08+i*tau/5, x=Math.cos(a)*.069, y=Math.sin(a)*.069;
    add(lugSocket.clone().translate(x,y,0),agedSteel,'Lug seat');
    add(lug.clone().rotateZ(i*.45).translate(x,y,0),alloy,'Hex wheel nut');
  }
  const valveAngle=-.32;
  const valve=ring([[.003,.092],[.005,.098],[.0035,.114],[.003,.120],[.0001,.120]],12);
  add(valve.translate(Math.cos(valveAngle)*.187,Math.sin(valveAngle)*.187,0),rubber,'Tire valve');

  // Batch small physically separate details by finish. All four wheels share
  // their immutable geometry and materials.
  const byMaterial = new Map();
  for (const mesh of wheel.children) {
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
    byMaterial.get(mesh.material).push(mesh);
  }
  const prototype = new THREE.Group();
  for (const [mat, meshes] of byMaterial) {
    let count = 0, indexCount = 0;
    const hasUV = meshes.some(m => m.geometry.attributes.uv);
    for (const {geometry:g} of meshes) { count += g.attributes.position.count; indexCount += g.index?.count ?? g.attributes.position.count; }
    const positions = new Float32Array(count*3), normals = new Float32Array(count*3);
    const uvs = hasUV ? new Float32Array(count*2) : null;
    const indices = new (count > 65535 ? Uint32Array : Uint16Array)(indexCount);
    let start = 0, idx = 0;
    for (const {geometry:g} of meshes) {
      const p=g.attributes.position;
      positions.set(p.array, start*3); normals.set(g.attributes.normal.array,start*3);
      if (uvs && g.attributes.uv) uvs.set(g.attributes.uv.array,start*2);
      const n=g.index?.count??p.count;
      for(let k=0;k<n;k++) indices[idx++]=start+(g.index ? g.index.getX(k) : k);
      start+=p.count;
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(positions,3));
    g.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    if (uvs) g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
    g.setIndex(new THREE.BufferAttribute(indices,1));
    const m=new THREE.Mesh(g,mat);
    m.name=meshes[0].name;
    prototype.add(m);
  }
  for (const side of [-1,1]) {
    for (const z of [-1.43,1.42]) {
      const item=prototype.clone();
      item.name=(z>0?'Front':'Rear')+(side<0?' right':' left')+' wheel';
      item.position.set(side*.80,.405,z);
      item.rotation.set(0,side*Math.PI/2,0);
      item.rotateZ(z>0 ? -.18 : .08);
      assembly.add(item);
    }
  }
  return assembly;
}
