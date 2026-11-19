// All dimensions are in metres. Each wheel is assembled facing local +Z.
export function buildWheels(THREE) {
  const assembly = new THREE.Group();
  assembly.name = 'Five-spoke alloy wheels and all-terrain tires';
  const wheel = new THREE.Group();
  const tau = Math.PI * 2;
  const surface = (color, roughness, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  const photo = file => {
    if (typeof document === 'undefined') return null;
    const map = new THREE.TextureLoader().load(new URL('./assets/'+file,import.meta.url).href);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return map;
  };
  const sidePhotos = [photo('wheel-rear-surface.webp'),photo('wheel-front-surface.webp')];
  const grain = photo('wheel-tread-grain.webp');
  const finish = (color,roughness,metalness,map) => {
    const mat=surface(map ? 0xffffff : color,roughness,metalness);
    if (map) mat.map=map;
    return mat;
  };
  const rubber = surface(0x292826, .89);
  const sidewall = finish(0x353331,.92,.012,sidePhotos[0]);
  const tread = finish(0x302f2b,.88,.013,grain);
  const blocks = finish(0x37332e,.91,.01,grain);
  const alloy = surface(0xc7bda6, .30, .71);
  const machined = finish(0xc5bcaa,.33,.54,sidePhotos[0]);
  const spokeInlay = finish(0x665e59,.52,.37,sidePhotos[0]);
  const hubFace = finish(0x564b42,.66,.34,sidePhotos[0]);
  const barrel = surface(0x4d4c48, .53, .58);
  barrel.side = THREE.DoubleSide;
  const brakeSteel = surface(0x77756b, .51, .64);
  const brakeDark = surface(0x484642, .7, .47);
  const agedSteel = surface(0x504740, .66, .37);

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
  // Keep the real sidewall printing attached to the curved rubber. The inner
  // face uses unprinted rubber, as on a white-letter tire mounted lettering-out.
  const outerBead = halfProfile.findIndex(([radius])=>radius>=.372);
  const foot = halfProfile.slice(0,outerBead+1).reverse();
  const split = casing.length-foot.length;
  add(ring(casing.slice(0,split+1)),rubber,'Inner radial casing and tread channels');
  add(ring(foot),sidewall,'Photographed rubber, mouldings and raised white lettering');
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
  const tireParts = [[], []], outerSideLugs = [];
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

  const pitches = 50;
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
      block(side>0 ? outerSideLugs : tireParts[i%2], poly, (u, v, h) => {
        const angle = phase + u / .393, radius = treadRadius(v) + h;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius, v];
      }, .0091);
      const minR = long ? .327 : .342;
      const lugs = [[-.018,.374], [-.020,.361], [-.013,minR + .009], [-.002,minR], [.017,minR + .007], [.014,.348], [.021,.361], [.016,.375]];
      // In (tangent,radius) space CCW gives the -Z face.
      if (side > 0) lugs.reverse();
      block(side>0 ? outerSideLugs : tireParts[(i+1)%2], lugs, (u,r,h) => {
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
  tireParts.forEach((points,i) => {
    const g=triangles(points), uv=new Float32Array(points.length/3*2);
    for(let k=0,j=0;k<points.length;k+=3,j+=2) {
      uv[j]=.5+Math.atan2(points[k+1],points[k])/tau;
      uv[j+1]=.5+points[k+2]/.295;
    }
    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    add(g,i?tread:blocks,'Individually bevelled, siped all-terrain tread');
  });

  add(frontUV(outerSideLugs),sidewall,'Moulded shoulder lugs with photographed flank rubber');

  // The brake rotor is visible through the five openings and from underneath.
  add(ring([[.057,-.048],[.156,-.048],[.157,-.044],[.157,-.039],[.151,-.038],[.151,-.034],[.157,-.033],[.157,-.027],[.156,-.025],[.060,-.025],[.053,-.020]]), brakeSteel, 'Vented brake rotor');
  add(ring([[.047,-.064],[.148,-.064],[.163,-.061],[.166,-.058],[.166,-.055],[.161,-.056],[.146,-.06],[.049,-.06]]), brakeDark, 'Rotor backing plate');
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

  const lip=.2107;
  add(ring([[.193,.082],[.204,.091],[.209,.102],[.2107,.111],[.2097,.1165],[.2076,.1185],[.2042,.1178],[.2014,.114],[.201,.111]]),machined,'Rounded polished outer lip');
  add(ring([[.035,.026],[.070,.032],[.079,.047],[.085,.066],[.081,.082],[.060,.088],[.041,.079]]),barrel,'Cast centre register');
  // Traced from both rim ellipses in the reference photograph. Each station
  // describes a radial section through one of the five rounded triangular
  // apertures: radius/lip radius, opening edges in degrees, and flute width.
  const sections=[
    [.185,36,36,0],[.245,36,36,0],[.31,36,36,0],[.37,36,36,10],
    [.405,36,36,17],[.440,36,36,16],[.462,36,36,15.2],
    [.470,32.5,41.9,14.8],[.482,28.4,46.4,14.5],[.497,25.0,49.4,14],
    [.522,22.2,51.8,13.4],[.552,20.9,52.8,12.8],[.595,19.8,53.8,11.8],
    [.645,19.0,54.8,11],[.695,18.4,55.4,10.2],[.746,18.0,55.9,9.6],
    [.773,17.8,56.0,9.3],[.80,18.1,55.9,8.8],[.845,18.7,55.6,8.1],
    [.875,18.9,55.3,7.7],[.9,19.4,54.6,7],[.914,20.1,53.8,6.7],
    [.923,21.8,52.2,6.0],[.929,25.5,49.6,5.2],[.934,31.3,43.0,3.1],
    [.936,36,36,1.7],[.94,36,36,0],[.962,36,36,0],[.977,36,36,0],
  ];
  const bright=[],flutes=[],rearWeb=[],throats=[];
  const rad=Math.PI/180, divisions=36;
  const surfaceZ = (r,a,channel) => {
    const t=Math.max(0,Math.min(1,(r-.22)/.74));
    const dish=.0825+.031*t*t*(3-2*t);
    if(channel===0) return dish;
    const position=Math.abs((a-.8)/channel);
    const edge=Math.max(0,Math.min(1,(1-position)*4.0));
    const step=edge*edge*(3-2*edge);
    const fade=Math.max(0,Math.min(1,(r-.35)/.15,(.943-r)/.048));
    return dish-step*fade*(.0056+.0040*Math.max(0,1-position*position));
  };
  for (let i=0;i<5;i++) {
    const phi=i*tau/5;
    const point = (section,fraction) => {
      const [r,left,right,channel]=section;
      const local=(right-72)+(left-right+72)*fraction;
      const a=phi+local*rad,physical=r*lip;
      return [physical*Math.cos(a),physical*Math.sin(a),surfaceZ(r,local,channel)];
    };
    const shifted=(p,z)=>[p[0],p[1],p[2]+z];
    for(let j=0;j<sections.length-1;j++) {
      const s0=sections[j],s1=sections[j+1];
      for(let k=0;k<divisions;k++) {
        const l=k/divisions,h=(k+1)/divisions;
        const p0=point(s0,l),p1=point(s1,l),p2=point(s1,h),p3=point(s0,h);
        const angle=s0[2]-72+(s0[1]-s0[2]+72)*(l+h)/2;
        const material=s0[3]>0&&Math.abs(angle-.8)<s0[3]?flutes:bright;
        tri(material,p0,p1,p2);tri(material,p0,p2,p3);
        const z=-.0265;
        tri(rearWeb,shifted(p0,z),shifted(p2,z),shifted(p1,z));
        tri(rearWeb,shifted(p0,z),shifted(p3,z),shifted(p2,z));
      }
      // The vent walls continue to the back of the spoke. Recessed dark
      // apertures still let the independently modelled rotor and caliper show.
      if(s0[1]!==s0[2]||s1[1]!==s1[2]) for(const edge of [0,1]) {
        const a=point(s0,edge), b=point(s1,edge);
        const toward=(p,d)=>{
          const angle=Math.atan2(p[1],p[0])+d*(edge?1:-1),r=Math.hypot(p[0],p[1]);
          return [r*Math.cos(angle),r*Math.sin(angle),p[2]-.004];
        };
        const aa=toward(a,.006),bb=toward(b,.006),az=shifted(aa,-.0225),bz=shifted(bb,-.0225);
        if(edge) {tri(throats,a,b,bb);tri(throats,a,bb,aa);tri(throats,aa,bb,bz);tri(throats,aa,bz,az);}
        else {tri(throats,a,bb,b);tri(throats,a,aa,bb);tri(throats,aa,bz,bb);tri(throats,aa,az,bz);}
      }
    }
  }
  // Generate a single continuous photographic UV projection. The source was
  // rectified separately for each axle, using its measured rim ellipse.
  function frontUV(pts) {
    const g=triangles(pts), uvs=new Float32Array(pts.length/3*2);
    for(let i=0,k=0;i<pts.length;i+=3,k+=2){uvs[k]=.5+pts[i]/.81;uvs[k+1]=.5+pts[i+1]/.81;}
    g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
    return g;
  }
  function castSurface(points,projectTexture) {
    // The casting is smooth across neighbouring grid cells, while separate
    // vent walls and flute faces keep the machined boundaries crisp.
    const vertices=[],uvs=[],indices=[],seen=new Map();
    for(let i=0;i<points.length;i+=3){
      const x=points[i],y=points[i+1],z=points[i+2];
      const key=Math.round(x*100000)+','+Math.round(y*100000)+','+Math.round(z*100000);
      let index=seen.get(key);
      if(index===undefined){
        index=vertices.length/3;seen.set(key,index);
        vertices.push(x,y,z);
        if(projectTexture)uvs.push(.5+x/.81,.5+y/.81);
      }
      indices.push(index);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    if(projectTexture)g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    g.setIndex(indices);g.computeVertexNormals();
    return g;
  }
  add(castSurface(bright,true),machined,'Continuous machined face around five rounded apertures');
  add(castSurface(flutes,true),spokeInlay,'Curved graphite spoke channels');
  add(castSurface(rearWeb,false),barrel,'Cast rear wheel web');
  add(castSurface(throats,false),barrel,'Deep bevels along five open spoke apertures');
  add(ring([[.036,.076],[.051,.079],[.052,.087],[.049,.0935],[.044,.096],[.039,.100],[.029,.101],[.0001,.101]]),hubFace,'Weathered central hub register');
  const lugSocket=ring([[.006,.084],[.0145,.084],[.018,.086],[.017,.092],[.0135,.095],[.009,.091]],36);
  const lug=ring([[.0001,.092],[.009,.092],[.011,.095],[.011,.102],[.008,.104],[.0001,.104]],6);
  const seatRing=surface(0x514940,.55,.53);
  for(let i=0;i<5;i++){
    const a=i*tau/5, x=Math.cos(a)*.075, y=Math.sin(a)*.075;
    add(lugSocket.clone().translate(x,y,0),seatRing,'Recessed 150 mm bolt-circle lug seat');
    add(lug.clone().rotateZ(i*.68+.1).translate(x,y,0),alloy,'Machined hex nut');
  }
  const valveAngle=-.10;
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
  const axlePhotoMaterials=new Map();
  if (sidePhotos[1]) {
    for(const old of [sidewall,machined,spokeInlay,hubFace]) {
      const changed=old.clone();changed.map=sidePhotos[1];axlePhotoMaterials.set(old,changed);
    }
  }
  const tireFinishes=new Set([rubber,sidewall,tread,blocks]);
  function loadTire(geometry,roll) {
    const changed=geometry.clone(),p=changed.attributes.position,n=changed.attributes.normal;
    const sin=Math.sin(roll),cos=Math.cos(roll);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const vertical=x*sin+y*cos;
      if(vertical>-.32)continue;
      let t=Math.min(1,(-vertical-.32)/.084);
      t=t*t*(3-2*t);
      const h=Math.max(-.405,vertical-.0084*t),dy=h-vertical;
      p.setXYZ(i,x+sin*dy,y+cos*dy,z*(1+.022*t*t));
      if(h<-.40499&&Math.abs(n.getZ(i))<.55) n.setXYZ(i,-sin,-cos,0);
    }
    changed.computeBoundingSphere();
    return changed;
  }
  const loaded=[new Map(),new Map()];
  for (const side of [-1,1]) {
    for (const z of [-1.43,1.42]) {
      const front=z>0, axle=front?1:0, roll=front?0:23*rad, item=prototype.clone();
      for(const m of item.children) {
        if(!tireFinishes.has(m.material)) continue;
        if(!loaded[axle].has(m.geometry)) loaded[axle].set(m.geometry,loadTire(m.geometry,roll));
        m.geometry=loaded[axle].get(m.geometry);
      }
      item.name=(front?'Front':'Rear')+(side<0?' right':' left')+' wheel';
      if(front) {
        for (const m of item.children) if(axlePhotoMaterials.has(m.material)) m.material=axlePhotoMaterials.get(m.material);
        // The front wheel in the reference has an exposed bronze-coloured
        // central spindle, while the photographed rear cap is dark and closed.
        const hubNose=new THREE.Mesh(ring([[.011,.097],[.024,.100],[.023,.106],[.016,.112],[.013,.114],[.0001,.114]],40),surface(0x9e885e,.53,.43));
        hubNose.name='Front hub nose';item.add(hubNose);
      }
      item.position.set(side*(front ? .810 : .8075),.405,z);
      item.rotation.set(0,side*Math.PI/2,0);
      item.rotateZ(roll);
      assembly.add(item);
    }
  }
  return assembly;
}
