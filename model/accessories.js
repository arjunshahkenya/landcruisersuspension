// Roof equipment, door and fender mirrors, steps, and splash guards.
// Dimensions are in metres. The front of the vehicle points along +Z.
export function buildAccessories(THREE) {
  const parts = new THREE.Group();
  parts.name = 'Touring equipment and exterior fittings';

  const finish = (name, color, metalness, roughness) => {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    material.name = name;
    return material;
  };
  const paint = new THREE.MeshPhysicalMaterial({
    name: 'Forest teal clearcoat',
    color: '#245555', metalness: .52, roughness: .29, clearcoat: .9, clearcoatRoughness: .2,
  });
  const polymer = finish('Moulded graphite', '#272c2d', .13, .51);
  const rubber = finish('Weatherseal rubber', '#191d1e', .02, .77);
  const stepAlloy = finish('Graphite anodised aluminium', '#3d4344', .63, .39);
  const rackAlloy = finish('Satin aluminium roof equipment', '#b8bfc0', .73, .28);
  const steel = finish('Bracket steel', '#384043', .68, .45);
  const hardware = finish('Plated fasteners', '#a6a8a1', .72, .36);
  const glass = finish('Slightly blue mirror glass', '#92a8b0', .93, .105);
  const brakeLens = finish('Stop lamp lens', '#98252b', .21, .24);

  function group(name, parent = parts) {
    const result = new THREE.Group();
    result.name = name;
    parent.add(result);
    return result;
  }
  function mesh(parent, name, geom, material) {
    const m = new THREE.Mesh(geom, material);
    m.name = name;
    parent.add(m);
    return m;
  }
  function rod(parent, name, first, last, radius, material, sides = 12) {
    const a = new THREE.Vector3(...first);
    const b = new THREE.Vector3(...last);
    const direction = b.clone().sub(a);
    const geom = new THREE.CylinderGeometry(radius, radius, direction.length(), sides);
    const result = mesh(parent, name, geom, material);
    result.position.copy(a).lerp(b, .5);
    result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return result;
  }

  // Loft parallel rings with independently shaped sections. Duplicating the cap
  // vertices keeps the back surface of every mirror and extrusion perfectly flat.
  function loft(slices) {
    const n = slices[0].length;
    const coordinates = slices.flat(2);
    const indices = [];
    for (let j = 0; j < slices.length - 1; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * n + i;
        const b = j * n + (i + 1) % n;
        indices.push(a, b, b + n, a, b + n, a + n);
      }
    }
    for (const [ring, reverse] of [[slices[0], true], [slices[slices.length - 1], false]]) {
      const base = coordinates.length / 3;
      coordinates.push(...ring.flat());
      for (let i = 1; i < n - 1; i++) {
        if (reverse) indices.push(base, base + i + 1, base + i);
        else indices.push(base, base + i, base + i + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  function roundSection(cx, cy, z, width, height, exponent = .52, tilt = 0) {
    const vertices = [];
    for (let i = 0; i < 40; i++) {
      const angle = 2 * Math.PI * i / 40;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const u = Math.sign(cos) * Math.pow(Math.abs(cos), exponent);
      const v = Math.sign(sin) * Math.pow(Math.abs(sin), exponent);
      vertices.push([cx + width * u / 2, cy + height * v / 2 + tilt * u, z]);
    }
    return vertices;
  }
  function shapedBar(parent, name, material, stations, exponent = .54) {
    return mesh(parent, name, loft(stations.map(([x, y, z, w, h]) =>
      roundSection(x, y, z, w, h, exponent))), material);
  }
  // Local section is in XY, so an extrusion can follow any two endpoints.
  function bar(parent, name, a, b, width, height, material, exponent = .40) {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b);
    const direction = bv.clone().sub(av);
    const length = direction.length();
    const geom = loft([
      roundSection(0, 0, -length / 2, width, height, exponent),
      roundSection(0, 0, length / 2, width, height, exponent),
    ]);
    const m = mesh(parent, name, geom, material);
    m.position.copy(av).lerp(bv, .5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
    return m;
  }
  const sides = [-1, 1];
  const rack = group('Raised aluminium roof basket');
  const base = group('Factory longitudinal roof rails');
  // The OE towers sit lower than the top of the roof crown, near its shoulders.
  // Compress their vertical rise and the basket profile to the measured stack.
  base.scale.y = .80;
  base.position.y = .357;
  rack.scale.y = .91;
  rack.position.y = .140;
  for (const side of sides) {
    const x = side * .67;
    // OE track follows the crown; three feet hold each raised longitudinal rail.
    shapedBar(base, 'Low rubber mounting channel', rubber, [
      [x, 1.844, -2.03, .034, .014], [x, 1.855, -1.91, .068, .022],
      [x, 1.86, -.35, .069, .022], [x, 1.856, -.14, .037, .014],
    ]);
    for (const [hubZ, length] of [[-1.89,.25], [-1.08,.16], [-.28,.27]]) {
      const rear = hubZ - length / 2, nose = hubZ + length / 2;
      const pedestal = shapedBar(base, 'Contoured roof rail pedestal', polymer, [
        [x, 1.86, rear, .044, .012], [x, 1.876, rear + .038, .078, .042],
        [x, 1.901, hubZ, .087, .075], [x, 1.885, nose - .04, .075, .054],
        [x, 1.859, nose, .048, .014],
      ]);
      if (hubZ < -1.5) pedestal.position.y -= .016;
    }
    shapedBar(base, 'Elliptical factory rail', stepAlloy, [
      [x,1.87,-1.988,.054,.023], [x,1.904,-1.944,.060,.041],
      [x,1.93,-1.85,.064,.04], [x,1.938,-1.56,.066,.039],
      [x,1.938,-.48,.066,.039], [x,1.924,-.32,.061,.039],
      [x,1.886,-.213,.053,.030], [x,1.87,-.18,.045,.015],
    ]);
    // A faint bright rolled edge on the black roof rail is visible from the side.
    bar(base,'Rolled rail edge', [x + side*.029,1.94,-1.76],
      [x + side*.029,1.94,-.45],.007,.008,rackAlloy);
  }
  for (const z of [-1.48, -.75]) {
    bar(base,'Load bar', [-.704,1.953,z], [.704,1.953,z], .057,.027,stepAlloy);
    for (const side of sides) {
      const x=side*.668;
      bar(base,'Clamp saddle',[x,1.953,z-.054],[x,1.953,z+.054],.099,.042,polymer);
      rod(base,'Clamp bolt',[x,1.973,z],[x,1.98,z],.013,hardware,6);
    }
  }
  const basketBack = -1.68, basketFront = -.56;
  for (const side of sides) {
    const x = side*.636;
    bar(rack,'Aluminium lower side extrusion',[x,1.987,basketBack+.016],[x,1.987,basketFront-.018],.052,.039,rackAlloy);
    bar(rack,'Extruded upper rail', [x,2.075,basketBack+.05], [x,2.075,basketFront-.078],.048,.031,rackAlloy);
    // The basket in the references has four substantial black corner castings.
    shapedBar(rack,'Aft basket elbow',polymer,[
      [x,2.02,basketBack-.012,.041,.09],[x,2.027,basketBack,.065,.118],
      [x,2.028,basketBack+.032,.07,.120],[x,2.034,basketBack+.074,.063,.104],
      [x,2.037,basketBack+.084,.054,.088],
    ]);
    shapedBar(rack,'Swept forward basket fairing',polymer,[
      [x,2.034,basketFront-.158,.05,.09],[x,2.03,basketFront-.143,.067,.117],
      [x,2.025,basketFront-.102,.071,.105],[x,2.016,basketFront-.057,.067,.081],
      [x,2.002,basketFront-.019,.062,.061],[x,1.989,basketFront+.012,.046,.03],
    ]);
  }
  for (const z of [basketBack+.02,basketFront-.021]) {
    bar(rack,'Basket end extrusion',[-.633,1.989,z],[.633,1.989,z],.052,.038,rackAlloy);
  }
  for (const z of [basketBack+.037,basketFront-.127]) {
    bar(rack,'Raised upper end extrusion',[-.635,2.075,z],[.635,2.075,z],.048,.031,rackAlloy);
  }
  for (let i=0; i<7; i++) {
    const z=basketBack+.13+i*.143;
    bar(rack,'Hollow basket floor slat',[-.62,1.979,z],[.62,1.979,z],.041,.018,rackAlloy);
  }
  for (const x of [-.365,.365]) {
    for (const z of [-1.48,-.75]) {
      bar(rack,'Deck clamp plate',[x,1.986,z-.042],[x,1.986,z+.042],.047,.011,steel);
      for (const offset of [-.026,.026]) {
        rod(rack,'Deck bolt',[x,1.984,z+offset],[x,1.995,z+offset],.009,hardware,6);
      }
    }
  }

  const spoiler = group('Rear roof spoiler');
  // The upper hatch spoiler wraps down on each end, above the glass.
  const spoilerSlices = [];
  for (let i=0;i<=22;i++) {
    const u=(i-11)/11, edge=Math.pow(Math.abs(u),5);
    const x=u*.797, y=1.827-.066*edge, z=-2.167+.025*edge;
    // Cross sections wind CCW in the YZ plane when viewed from positive X.
    const profile = [
      [.018, .071],[.033,.057],[.043,.018],[.038,-.058],
      [.024,-.138],[.013,-.176],[-.014,-.18],[-.023,-.166],
      [-.006,-.109],[-.004,-.061],[-.014,-.015],[-.033,.066],
    ].reverse();
    spoilerSlices.push(profile.map(([dy,dz])=>[x,y+dy*(1+.43*edge),z+dz]));
  }
  mesh(spoiler,'Body-colour spoiler shell',loft(spoilerSlices),paint);
  for (const side of sides) {
    const x=side*.731;
    shapedBar(spoiler,'Hatch mounting foot',rubber,[
      [x,1.759,-2.225,.084,.03], [x,1.775,-2.18,.105,.054],
      [x,1.771,-2.123,.105,.047], [x,1.765,-2.085,.076,.025],
    ]);
  }
  bar(spoiler,'High-mounted lamp gasket',[-.321,1.826,-2.344],[.321,1.826,-2.344],.017,.022,rubber);
  bar(spoiler,'Red high-mounted brake light',[-.306,1.826,-2.354],[.306,1.826,-2.354],.01,.014,brakeLens);

  for (const side of sides) {
    const mirror = group(side<0 ? 'Right door mirror' : 'Left door mirror');
    mirror.position.set(0,-.018,-.085);
    const pivot = [side*.934,1.335,.69];
    const shellX=side*1.025, shellY=1.368, shellZ=.630;
    // Triangular base is rubber, with a narrow weatherstrip and a short folding neck.
    shapedBar(mirror,'Mirror base at front quarterlight',rubber,[
      [side*.906,1.328,.606,.048,.042], [side*.913,1.363,.629,.071,.114],
      [side*.912,1.352,.674,.076,.091], [side*.923,1.319,.756,.049,.033],
    ]);
    bar(mirror,'Folding mirror plinth', pivot, [side*.994,1.351,.67], .054,.045,polymer);
    const head=group('Door mirror head',mirror);
    head.position.set(shellX,shellY,shellZ);
    head.rotation.y=side*.165;
    head.scale.set(1.10,1.12,1.07);
    const ring=(w,h,z,dx=0,dy=0)=>roundSection(dx*side,dy,z,w,h,.50,-side*.0065);
    mesh(head,'Painted mirror housing',loft([
      ring(.204,.142,-.042),ring(.224,.149,-.033),ring(.232,.147,.006),
      ring(.216,.140,.047,-.003,.001),ring(.178,.113,.077,-.013,-.003),
      ring(.119,.079,.089,-.022,-.007), ring(.035,.032,.094,-.025,-.009),
    ]),paint);
    mesh(head,'Mirror bead and rim',loft([
      ring(.210,.145,-.048),ring(.218,.151,-.045),ring(.222,.151,-.036),
    ]),polymer);
    mesh(head,'Mirror reflector',loft([
      ring(.195,.127,-.049),ring(.200,.132,-.047),ring(.200,.132,-.046),
    ]),glass);
  }
  // A single auxiliary mirror sits on the vehicle's left wing.
  const fender=group('Left front wing mirror');
  fender.position.y = -.025; // Seat the gasket on the falling bonnet shoulder.
  const baseX=.785, baseZ=1.974;
  shapedBar(fender,'Wing mirror base gasket',rubber,[
    [baseX,1.244,baseZ-.068,.037,.014],[baseX,1.246,baseZ-.047,.077,.020],
    [baseX,1.246,baseZ+.036,.084,.020],[baseX,1.243,baseZ+.067,.048,.016],
  ]);
  shapedBar(fender,'Wing mirror pedestal',polymer,[
    [baseX,1.248,baseZ-.047,.055,.024],[baseX,1.264,baseZ-.023,.066,.044],
    [baseX,1.266,baseZ+.018,.064,.044],[baseX,1.248,baseZ+.051,.044,.022],
  ]);
  rod(fender,'Wing mirror stalk',[baseX,1.274,baseZ],[baseX+.014,1.338,baseZ-.026],.017,polymer);
  const fenderHead=group('Auxiliary convex mirror',fender);
  fenderHead.position.set(baseX+.025,1.367,baseZ-.026);
  fenderHead.rotation.set(-.16,.46,-.12);
  mesh(fenderHead,'Auxiliary mirror casing',loft([
    roundSection(0,0,-.029,.1,.118,.59),roundSection(0,0,-.022,.106,.123,.59),
    roundSection(-.001,0,.002,.104,.121,.63),roundSection(-.003,0,.022,.087,.106,.72),
    roundSection(-.004,-.002,.031,.046,.072,.77),
  ]),polymer);
  mesh(fenderHead,'Convex auxiliary glass',loft([
    roundSection(0,0,-.032,.087,.103,.62),roundSection(0,0,-.028,.091,.109,.62),
  ]),glass);

  for (const side of sides) {
    const step=group(side<0 ? 'Right running board' : 'Left running board');
    const x=side*.917;
    shapedBar(step,'Tapered side step extrusion',stepAlloy,[
      [x-.015*side,.416,-.998,.118,.029], [x-.004*side,.419,-.962,.168,.056],
      [x,.421,-.895,.192,.065], [x,.424,-.775,.194,.065],
      [x,.424,.776,.194,.065], [x,.421,.90,.192,.063],
      [x-.005*side,.418,.956,.170,.055], [x-.015*side,.412,.989,.126,.032],
    ],.36);
    bar(step,'Outer scuff moulding',[side*1.011,.42,-.908],[side*1.011,.42,.902],.011,.031,polymer);
    for (let j=0;j<6;j++) {
      const groove=x+side*(-.064+j*.025);
      bar(step,'Raised nonslip tread', [groove,.457,-.92],[groove,.457,.915],.011,.006,rubber);
    }
    for (const z of [-.72,0,.70]) {
      bar(step,'Chassis outrigger', [side*.53,.49,z],[side*.896,.395,z],.055,.034,steel);
      bar(step,'Running board anchor plate',[side*.886,.398,z-.073],[side*.886,.398,z+.073],.12,.017,steel);
      for (const dz of [-.043,.043]) {
        rod(step,'Board mounting bolt',[side*.893,.383,z+dz],[side*.893,.394,z+dz],.012,hardware,6);
      }
    }

    for (const [z,isRear] of [[.966,false],[-1.917,true]]) {
      const guard=group((side<0 ? 'Right ' : 'Left ') + (isRear?'rear':'front')+' mudflap');
      // Section tops taper to meet the flared wheel arch; the lower rubber curls aft.
      const width=isRear?.306:.287;
      const xs=side*.821, bottom=isRear?.145:.155;
      const profile=[
        [-.48,.552],[-.34,.594],[.32,.603],[.5,.551],
        [.48,.307],[.43,bottom+.013],[.33,bottom],[-.37,bottom+.009],[-.5,bottom+.041],
      ];
      const rings=[];
      for (const dz of [-.013,.013]) {
        const ring=profile.map(([u,y])=>[
          xs+side*u*width,y,z+dz-.052*Math.max(0, (.53-y)/(.53-bottom))**1.8,
        ]);
        if(side>0) ring.reverse();
        rings.push(ring);
      }
      mesh(guard,'Flexible tapered splash flap',loft(rings),rubber);
      for (const offset of [-.085,.085]) {
        rod(guard,'Retaining screw',[xs+offset,.497,z-.020],[xs+offset,.497,z-.011],.010,hardware,8);
      }
    }
  }
  return parts;
}
