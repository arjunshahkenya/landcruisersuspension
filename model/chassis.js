// Representative UZJ100 running gear. Coordinates are in metres.
// Toyota New Car Features NCF147E: independent torsion-bar front suspension,
// four-link coil-sprung live rear axle and lateral locating rod.
export function buildChassis(THREE, { articulate = false } = {}) {
  const group = new THREE.Group();
  group.name = 'Land Cruiser • chassis and running gear';
  const material = (name, color, roughness, metalness) =>
    new THREE.MeshStandardMaterial({ name, color, roughness, metalness });
  const frame = material('Graphite chassis enamel', 0x373e40, .66, .38);
  const bracket = material('Pressed and welded steel', 0x494d49, .73, .36);
  const floor = material('Undersealed floor pan', 0x454746, .86, .19);
  const cast = material('Cast axle and case iron', 0x514e48, .85, .30);
  const caseMetal = material('Oxidised alloy', 0x878784, .72, .50);
  const fastener = material('Zinc-plated fasteners', 0x95958c, .52, .65);
  const stainless = material('Brushed stainless', 0xaba79b, .43, .77);
  const exhaust = material('Heat-stained exhaust', 0x827161, .76, .54);
  const damper = material('Satin damper casing', 0x54594d, .56, .47);
  const rubber = material('Bushings and boots', 0x282b29, .90, .06);
  const spring = material('Tempered spring steel', 0x454c4b, .47, .67);
  const fuel = material('Coated fuel tank', 0x5e625c, .76, .32);
  const dark = material('Recesses and ports', 0x1b1c1b, .94, .06);
  const v = (p) => new THREE.Vector3(...p);
  const up = new THREE.Vector3(0, 1, 0);

  // Accumulate transformed static geometry by material. The wheel wells have
  // many visible pieces (clips, joints and hardware), with one draw per finish.
  const assemblies = new Map();
  let batches;
  // The static viewer retains one batch per finish. The ride simulator can
  // request the same meshes split at real pivots and attachment points.
  function member(name) {
    const key=articulate ? name : 'fixed';
    if(!assemblies.has(key))assemblies.set(key,new Map());
    batches=assemblies.get(key);
  }
  member('sprung');
  function place(geometry, surface, centre = [0, 0, 0], quaternion, scale) {
    const matrix = new THREE.Matrix4().compose(v(centre), quaternion || new THREE.Quaternion(), v(scale || [1, 1, 1]));
    geometry.applyMatrix4(matrix);
    const parts = batches.get(surface) || [];
    parts.push(geometry);
    batches.set(surface, parts);
  }
  const box = (p, dimensions, m) => place(new THREE.BoxGeometry(...dimensions), m, p);
  const oval = (p, radii, m) => place(new THREE.SphereGeometry(1, 20, 12), m, p, null, radii);
  function shaft(from, to, radius, m, sides = 14, endRadius = radius) {
    const direction = v(to).sub(v(from));
    const length = direction.length();
    if (length < .0001) return;
    const mid = v(from).lerp(v(to), .5).toArray();
    const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.normalize());
    place(new THREE.CylinderGeometry(endRadius, radius, length, sides), m, mid, quat);
  }
  function pipe(points, radius, m, sections = points.length * 4, detail = 8) {
    const curve = new THREE.CatmullRomCurve3(points.map(v), false, 'centripetal');
    place(new THREE.TubeGeometry(curve, sections, radius, detail, false), m);
  }
  function at(a, b, t) { return v(a).lerp(v(b), t).toArray(); }
  // A beveled rectangular section running along z. Each station can shift
  // independently in three axes, including the kick-up over the rear axle.
  function stamping(stations, m, bevel = .018) {
    const positions = [];
    const rings = stations.map(([x, y, z, w, h]) => {
      const a = w / 2, b = h / 2, c = Math.min(bevel, a * .75, b * .75);
      return [[-a+c,-b],[a-c,-b],[a,-b+c],[a,b-c],[a-c,b],[-a+c,b],[-a,b-c],[-a,-b+c]]
        .map(([u, t]) => [x + u, y + t, z]);
    });
    const triangle = (a,b,c) => positions.push(...a,...b,...c);
    for (let n = 1; n < rings.length; n++) {
      for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8;
        triangle(rings[n-1][i], rings[n-1][j], rings[n][i]);
        triangle(rings[n-1][j], rings[n][j], rings[n][i]);
      }
    }
    for (let i = 1; i < 7; i++) {
      triangle(rings[0][0], rings[0][i+1], rings[0][i]);
      triangle(rings.at(-1)[0], rings.at(-1)[i], rings.at(-1)[i+1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    place(g, m);
  }
  function section(points, m, x=0, y=0) {
    const outline = points.map(([z,r])=>new THREE.Vector2(r,z));
    const geo = new THREE.LatheGeometry(outline, 24);
    geo.rotateX(Math.PI/2);
    place(geo, m, [x,y,0]);
  }
  function footBolt(x, y, z, size=.011) {
    shaft([x,y-.004,z],[x,y+.003,z],size*1.40, bracket, 12);
    shaft([x,y-.013,z],[x,y-.003,z],size, fastener, 6);
  }
  function bush(p, axis, radius, width) {
    const a=v(axis);
    const end=(d)=>v(p).addScaledVector(a,d).toArray();
    shaft(end(-width*.5),end(width*.5),radius,rubber);
    shaft(end(-width*.57),end(width*.57),radius*.41,fastener, 8);
    shaft(end(-width*.65),end(-width*.57),radius*.58,fastener, 6);
  }
  function shock(a,b,prefix) {
    member(prefix+'-rod');
    shaft(at(a,b,.08),at(a,b,.9),.013,stainless);
    member(prefix+'-case');
    shaft(at(a,b,.26),at(a,b,.88),.028,damper,16);
    shaft(at(a,b,.82),at(a,b,.91),.030,frame,16);
    shaft(at(a,b,.20),at(a,b,.28),.031,rubber,16);
    for (const point of [a,b]) {
      member(prefix+(point===a?'-rod':'-case'));
      shaft([point[0]-.038,point[1],point[2]],[point[0]+.038,point[1],point[2]],.032,damper);
      bush(point, [1,0,0], .021,.085);
    }
  }

  // Stamped floor with a raised transmission tunnel. Rear and front floors
  // narrow between the inner wheel housings; scalloped side footwells fill the sills.
  member('floor');
  stamping([
    [0,.768,-2.24,1.56,.07],[0,.768,-1.94,1.56,.09],[0,.827,-1.77,1.13,.07],
    [0,.827,-1.14,1.13,.07],[0,.752,-.94,1.55,.07],[0,.736,-.41,1.56,.07],
    [0,.737,.65,1.56,.07],[0,.780,.97,1.24,.06],[0,.85,1.08,1.03,.06]
  ],floor,.026);
  for(const s of [-1,1]) {
    member('floor');
    for (const x of [.35,.43,.51,.59,.67]) {
      stamping([[x*s,.707,-.87,.028,.020],[x*s,.691,-.72,.044,.024],
        [x*s,.691,.57,.044,.024],[x*s,.707,.68,.027,.019]],bracket,.009);
    }
    for (const x of [.2,.29,.38,.47]) {
      stamping([[s*x,.727,-2.17,.026,.016],[s*x,.715,-2.10,.04,.02],
        [s*x,.715,-1.99,.04,.02],[s*x,.726,-1.94,.025,.016]],bracket,.008);
    }
    member('sprung');
    stamping([[-2.25,.505,.554,.108,.134],[-2.04,.505,.56,.115,.152],[-1.78,.52,.636,.117,.155],
      [-1.53,.52,.675,.117,.156],[-1.29,.53,.668,.12,.159],[-1.01,.543,.58,.122,.165],
      [-.76,.548,.504,.122,.170],[.36,.544,.497,.122,.169],[.73,.499,.494,.123,.168],
      [1.05,.437,.524,.125,.157],[1.35,.403,.567,.124,.151],[1.62,.408,.583,.12,.148],
      [1.86,.441,.568,.113,.136],[2.23,.464,.555,.108,.128]].map(
        ([z,x,y,w,h])=>[s*x,y,z,w,h]),frame);
    // Body mounts have pressed outriggers and a resilient biscuit sandwiched above.
    for (const [z,x,y] of [[-.95,.54,.58],[-.44,.55,.52],[.53,.52,.53],[1.96,.45,.56],[-1.99,.51,.57]]) {
      const outer = (Math.abs(z)<1 ? .70 : .65)*s;
      box([(outer+x*s)/2,y+.015,z],[Math.abs(outer-x*s)+.03,.067,.104],bracket);
      shaft([outer,y+.038,z],[outer,y+.11,z],.041,rubber);
      shaft([outer,y+.105,z],[outer,.738,z],.034,bracket);
      footBolt(outer,y-.018,z,.014);
    }
    // Hard lines are clipped to the inner face of the frame and curve up over the axle.
    for (const [i,r] of [[0,.006],[1,.004]]) {
      const f=i*.016;
      pipe([[s*(.445-f),.57,-2.15],[s*(.442-f),.63,-1.68],[s*(.463-f),.625,-1.25],
        [s*(.47-f),.495,-.81],[s*(.47-f),.467,0],[s*(.443-f),.475,.64],
        [s*(.366-f),.519,1.07],[s*(.353-f),.562,1.63]],r,caseMetal,38,6);
    }
  }

  // The frame crossmembers carry the gearbox, torsion reaction anchors and axle links.
  const crossMember=(z,w,y,h,d,m=frame)=>stamping([[0,y,z-d/2,w*.97,h*.91],
    [0,y-.004,z-d*.32,w,h],[0,y-.004,z+d*.32,w,h],[0,y,z+d/2,w*.97,h*.91]],m);
  crossMember(2.06,1.03,.55,.092,.125);
  crossMember(1.54,.94,.355,.095,.145);
  crossMember(.99,.99,.413,.094,.114);
  crossMember(.09,1.15,.432,.068,.122);
  crossMember(-.89,1.14,.535,.09,.11);
  crossMember(-1.71,1.08,.651,.102,.13);
  crossMember(-2.16,1.09,.546,.113,.135);
  for (const s of [-1,1]) {
    for (const z of [-2.16,-.89,.09,.99,2.06]) footBolt(s*(z>.8?.38:.49),z===.09?.397:z>.8?.48:.48,z,.012);
  }

  // Differential assembly and half-shafts finish at the hub carriers.
  oval([.145,.443,1.42],[.145,.119,.137],cast);
  section([[1.245,0],[1.245,.068],[1.262,.082],[1.32,.09],[1.36,.12],
    [1.42,.122],[1.47,.098],[1.47,0]],bracket,.145,.435);
  shaft([-.34,.423,1.42],[.41,.423,1.42],.055,cast);
  for (const s of [-1,1]) {
    const joint=[s*.729,.405,1.42],inner=[s*.342,.423,1.42];
    member('cv'+s);
    shaft(inner,joint,.022,stainless);
    for (const t of [.03,.88]) {
      const centre=at(inner,joint,t);
      shaft([centre[0]-.044,centre[1],centre[2]],[centre[0]+.044,centre[1],centre[2]],.04,rubber);
      for(let i=0;i<5;i++) {
        const xx=centre[0]+(i-2)*.016;
        shaft([xx-.004,centre[1],centre[2]],[xx+.004,centre[1],centre[2]],.047-i*.0013,rubber,16);
      }
    }
    member('upright'+s);
    shaft([s*.704,.332,1.42],[s*.719,.556,1.41],.039,cast);
    // Both wishbones have widely spaced inboard pivots.
    for(const k of [0,1]) {
      const yy=k?.582:.347, endY=k?.554:.328, spread=k?.146:.206;
      const innerX=s*(k?.476:.354),endX=s*(k?.713:.705);
      const ends=[[innerX,yy,1.42-spread],[innerX,yy,1.42+spread]];
      member('wishbone'+s+'-'+k);
      pipe([ends[0],[s*.562,yy-.009,1.42-spread*.68],[endX,endY,1.42],
        [s*.564,yy-.009,1.42+spread*.68],ends[1]],k?.022:.036,bracket,16);
      shaft([endX,endY-.012,1.42],[endX,endY+.018,1.42],k?.032:.046,rubber);
      member('sprung');
      for (const p of ends) bush(p,[0,0,1],.036,.077);
      if(!k) {
        member('wishbone'+s+'-0');
        shaft([s*.52,.34,1.30],[s*.52,.34,1.54],.022,bracket);
        // A splined torsion-bar socket rotates with the lower arm, with a
        // metal witness on the sleeve that exposes the angular movement.
        shaft([innerX,.347,1.193],[innerX,.347,1.244],.033,cast,8);
        shaft([innerX+s*.024,.363,1.200],[innerX+s*.024,.363,1.234],.0038,fastener,7);
        member('sprung');
        shaft([innerX,.347,1.22],[s*.39,.428,.088],.018,spring,16);
        box([s*.39,.432,.09],[.11,.062,.10],bracket);
        footBolt(s*.405,.401,.09,.011);
      }
    }
    shock([s*.601,.345,1.474],[s*.47,.755,1.505],'front-damper'+s);
    member('sprung');
    // Upper shock tower, chassis-mounted bump stop and steering outer joint.
    box([s*.465,.681,1.50],[.086,.169,.084],bracket);
    shaft([s*.56,.499,1.482],[s*.56,.549,1.482],.032,rubber);
    member('tie'+s);
    shaft([s*.349,.474,1.241],[s*.698,.418,1.317],.014,caseMetal);
    oval([s*.698,.418,1.317],[.027,.027,.027],cast);
  }
  member('sprung');
  shaft([-.354,.473,1.241],[.354,.473,1.241],.033,caseMetal);
  for(const s of [-1,1]) {
    for(let i=0;i<6;i++) {
      const x=s*(.287+i*.012);
      shaft([x-.003,.474,1.241],[x+.003,.474,1.241],.038,rubber);
    }
  }
  member('stabilizer');
  pipe([[-.636,.341,1.527],[-.606,.378,1.687],[-.438,.417,1.719],[-.25,.4,1.731],
    [.25,.4,1.731],[.438,.417,1.719],[.606,.378,1.687],[.636,.341,1.527]],.015,spring,33);

  member('rear-axle');
  // The rear differential and tapered axle tubes form a single beam below the springs.
  for (const s of [-1,1]) {
    shaft([s*.085,.409,-1.43],[s*.635,.405,-1.43],.069,bracket,18,.046);
    shaft([s*.61,.405,-1.43],[s*.735,.405,-1.43],.051,cast,18);
  }
  oval([.045,.397,-1.43],[.168,.155,.138],cast);
  section([[-1.582,0],[-1.582,.067],[-1.567,.108],[-1.544,.137],[-1.526,.146],
    [-1.501,.147],[-1.489,.128],[-1.489,0]],bracket,.045,.404);
  section([[-1.38,.145],[-1.31,.119],[-1.27,.084],[-1.225,.064],[-1.20,.065],
    [-1.197,.073],[-1.181,.073],[-1.181,0]],cast,.045,.40);
  for(let i=0;i<11;i++) {
    const t=i*Math.PI*2/11;
    const x=.045+.133*Math.cos(t),y=.404+.133*Math.sin(t);
    shaft([x,y,-1.554],[x,y,-1.542],.0085,fastener,6);
  }
  for (const s of [-1,1]) {
    const x=s*.48,z=-1.445;
    member('rear-axle');
    shaft([x,.424,z],[x,.455,z],.10,bracket,22);
    member('sprung');
    shaft([x,.783,z],[x,.811,z],.10,bracket,22);
    box([s*.506,.765,z],[.112,.056,.113],bracket);
    const coils=[];
    for (let i=0; i<=100; i++) {
      const t=i/100,a=t*5.9*Math.PI*2;
      const r=.078-.012*Math.pow(Math.abs(t*2-1),4);
      coils.push([x+Math.cos(a)*r,.460+t*.322,z+Math.sin(a)*r]);
    }
    member('rear-coil'+s);
    pipe(coils,.0090,spring,120,7);
    member('sprung');
    shaft([x,.781,z],[x,.697,z],.029,rubber);
    const mount=[s*.59,.64,-1.659],eye=[s*.585,.359,-1.377];
    shock(eye,mount,'rear-damper'+s);
    member('sprung');
    box([s*.563,.647,-1.661],[.115,.063,.068],bracket);
    // Two lower trailing links and two shorter upper links with bushed eyes.
    for (const [a,b,r] of [
      [[s*.56,.415,-.747],[s*.588,.343,-1.433],.028],
      [[s*.431,.524,-1.007],[s*.382,.482,-1.426],.023]
    ]) {
      member((r===.028?'lower-link':'upper-link')+s);
      shaft(a,b,r,frame);
      for(const p of [a,b]) {
        member(p===a?'sprung':'rear-axle');
        bush(p,[1,0,0],r*1.42,.084);
        for(const dx of [-.047,.047]) box([p[0]+dx,p[1]+.021,p[2]],[.009,.088,.075],bracket);
      }
    }
    member('rear-axle');
    pipe([[s*.71,.427,-1.443],[s*.579,.471,-1.457],[s*.468,.471,-1.453],
      [s*.30,.479,-1.446],[s*.145,.48,-1.441]],.005,caseMetal,16,6);
  }
  const lateralA=[-.533,.536,-1.56],lateralB=[.557,.39,-1.532];
  member('panhard');
  shaft(lateralA,lateralB,.020,frame);
  for (const p of [lateralA,lateralB]) {
    member(p===lateralA?'sprung':'rear-axle');
    bush(p,[0,0,1],.03,.073);
  }
  member('rear-axle');
  pipe([[-.599,.407,-1.31],[-.60,.413,-1.51],[-.55,.40,-1.654],[-.27,.403,-1.67],
    [.27,.403,-1.67],[.55,.40,-1.654],[.60,.413,-1.51],[.599,.407,-1.31]],.012,spring,30);

  member('sprung');
  // Sump, bellhousing, transmission and offset-output transfer case.
  stamping([[0,.638,1.03,.39,.247],[0,.631,1.09,.49,.248],[0,.631,1.62,.48,.25],
    [0,.643,1.70,.39,.21]],cast);
  stamping([[0,.442,1.11,.298,.068],[0,.438,1.145,.362,.085],
    [0,.438,1.565,.362,.085],[0,.448,1.598,.29,.06]],bracket);
  for(let i=0;i<7;i++) {
    const z=1.16+i*.059;
    box([0,.393,z],[.269,.011,.009],cast);
    for(const s of [-1,1]) footBolt(s*.158,.409,z,.007);
  }
  section([[.05,.077],[.09,.086],[.104,.104],[.14,.105],[.22,.105],[.25,.118],
    [.43,.122],[.49,.137],[.57,.135],[.66,.15],[.74,.162],[.81,.185],[.9,.205],
    [1.008,.218],[1.035,.232],[1.053,.229],[1.053,.01]],caseMetal,0,.584);
  for(const [z,r] of [[.19,.106],[.246,.118],[.452,.132],[.523,.143],[.742,.169],[.995,.22]]) {
    section([[z-.01,r-.01],[z-.005,r+.003],[z+.006,r+.004],[z+.011,r-.004]],cast,0,.584);
  }
  stamping([[0,.448,.25,.175,.062],[0,.444,.28,.223,.064],[0,.442,.59,.227,.069],
    [0,.452,.65,.197,.061]],bracket);
  for(const s of [-1,1]) for(let i=0;i<5;i++) footBolt(s*.103,.415,.29+i*.069,.0058);
  oval([.084,.552,.003],[.182,.117,.171],caseMetal);
  oval([.152,.537,.052],[.091,.094,.139],cast);
  section([[-.208,0],[-.208,.057],[-.165,.066],[-.137,.072],[-.073,.09],[-.045,.097]],
    caseMetal,.038,.53);
  // Yokes, flange bolts, sliding splines and universal-joint crosses.
  function propeller(a,b,r) {
    shaft(at(a,b,.05),at(a,b,.955),r,frame,18);
    shaft(at(a,b,.15),at(a,b,.258),r*1.12,bracket,18);
    for(const reverse of [false,true]) {
      const left=reverse?b:a,right=reverse?a:b;
      const p=at(left,right,.055);
      shaft(left,at(left,right,.018),r*1.58,cast,18);
      shaft(at(left,right,.017),at(left,right,.09),r*.66,caseMetal,12);
      shaft([p[0]-r,p[1],p[2]],[p[0]+r,p[1],p[2]],r*.59,cast,12);
      shaft(at(left,right,.092),at(left,right,.112),r*1.08,bracket,16);
    }
  }
  member('rear-prop');
  propeller([.038,.528,-.196],[.045,.4,-1.191],.038);
  member('sprung');
  propeller([.184,.526,.063],[.145,.435,1.25],.027);

  // Formed tank and two transverse straps. Recessed ribs and flanges catch
  // light separately from the painted chassis when viewed from directly below.
  stamping([[.332,.519,-.986,.221,.09],[.347,.523,-.947,.307,.159],
    [.345,.532,-.87,.333,.192],[.337,.528,-.32,.31,.176],
    [.347,.546,-.18,.283,.149],[.36,.553,-.148,.228,.106]],fuel,.04);
  for (const z of [-.79,-.39]) {
    pipe([[.192,.565,z],[.194,.473,z],[.227,.438,z],[.304,.429,z],[.446,.434,z],
      [.484,.455,z],[.507,.532,z]],.011,bracket,18);
    footBolt(.507,.512,z,.009);
  }
  for (const z of [-.87,-.69,-.60,-.51,-.29]) box([.347,.44,z],[.20,.013,.020],bracket);

  // Twin engine-bank downpipes and converters merge at the exhaust centre section.
  for (const s of [-1,1]) {
    pipe([[s*.244,.656,1.38],[s*.268,.595,1.13],[s*.302,.485,.903],
      [s*.318,.465,.776]],.027,exhaust,22,12);
    const a=[s*.318,.465,.776],b=[s*.31,.469,.515];
    shaft(a,at(a,b,.17),.032,caseMetal,20,.060);
    shaft(at(a,b,.17),at(a,b,.82),.060,exhaust,20);
    shaft(at(a,b,.82),b,.060,caseMetal,20,.031);
    shaft(at(a,b,.20),at(a,b,.24),.062,bracket,20);
    shaft(at(a,b,.74),at(a,b,.78),.062,bracket,20);
  }
  pipe([[.31,.469,.515],[.30,.473,.432],[.222,.456,.363],[-.14,.425,.293],
    [-.261,.448,.206],[-.299,.469,.098]],.026,exhaust,22,12);
  pipe([[-.31,.469,.515],[-.311,.463,.33],[-.299,.469,.098],[-.302,.485,-.063]],
    .033,exhaust,19,12);
  stamping([[-.305,.495,-.72,.12,.078],[-.309,.495,-.688,.229,.123],
    [-.309,.495,-.62,.248,.141],[-.309,.495,-.13,.248,.141],
    [-.309,.495,-.085,.218,.122],[-.302,.491,-.055,.105,.065]],exhaust,.045);
  for (const z of [-.679,-.573,-.207,-.097]) {
    stamping([[-.309,.494,z-.006,.240,.135],[-.309,.494,z+.006,.240,.135]],caseMetal,.037);
  }
  pipe([[-.305,.494,-.70],[-.318,.496,-.89],[-.346,.511,-1.03],[-.337,.646,-1.311],
    [-.319,.66,-1.48],[-.318,.597,-1.61],[-.373,.524,-1.78],[-.457,.485,-1.94],
    [-.508,.441,-2.14],[-.534,.422,-2.26]],.034,exhaust,50,12);
  const tipA=[-.532,.423,-2.252],tipB=[-.548,.415,-2.302];
  shaft(tipA,tipB,.037,caseMetal,20);
  shaft(at(tipA,tipB,.99),at(tipA,tipB,1.006),.0305,dark,20);
  for (const [x,y,z] of [[-.312,.54,-.705],[-.325,.639,-1.55],[-.46,.49,-1.96]]) {
    pipe([[x,y,z],[x-.038,y+.027,z],[x-.056,y+.094,z]],.007,caseMetal,9);
    oval([x-.053,y+.085,z],[.016,.026,.013],rubber);
  }

  // Rear stowage hoist, with the second spare visible under the bumper in the rear photograph.
  box([0,.672,-1.99],[.12,.082,.175],bracket);
  for(const s of [-1,1]) {
    pipe([[s*.44,.633,-1.745],[s*.22,.656,-1.872],[0,.647,-1.97]],.021,bracket,12);
    shaft([s*.09,.62,-1.98],[s*.26,.643,-2.12],.012,bracket);
  }
  shaft([0,.616,-1.99],[0,.644,-1.99],.045,caseMetal,16);

  const spareCentre=[.03,.514,-1.979];
  function stowedRing(profile, m) {
    const rings=profile.map(([radius,height])=>new THREE.Vector2(radius,height));
    place(new THREE.LatheGeometry(rings,64),m,spareCentre);
  }
  stowedRing([[.212,-.094],[.229,-.105],[.296,-.118],[.345,-.116],
    [.379,-.092],[.393,-.059],[.395,.058],[.379,.091],[.345,.114],
    [.293,.117],[.228,.104],[.211,.093],[.211,-.093]],rubber);
  stowedRing([[.165,-.082],[.183,-.101],[.205,-.1],[.217,-.088],
    [.218,-.077],[.205,-.067],[.202,.077],[.215,.084],[.213,.097],[.183,.084]],bracket);
  stowedRing([[.08,-.047],[.119,-.052],[.147,-.068],[.176,-.08]],cast);
  const discY=spareCentre[1]-.044, discZ=spareCentre[2], discX=spareCentre[0];
  shaft([discX,discY-.005,discZ],[discX,discY+.012,discZ],.083,bracket,25);
  for(let i=0;i<8;i++) {
    const angle=i*Math.PI/4;
    const pos=[discX+.145*Math.cos(angle),discY-.024,discZ+.145*Math.sin(angle)];
    oval(pos,[.019,.004,.019],dark);
  }
  for(let i=0;i<53;i++) {
    for(const sign of [-1,1]) {
      const theta=(i+sign*.16)*2*Math.PI/53;
      const lug=new THREE.BoxGeometry(.011,.071,.037);
      lug.rotateX(sign*.32);
      lug.rotateY(-theta);
      place(lug,rubber,[discX+.395*Math.cos(theta),spareCentre[1]+sign*.041,discZ+.395*Math.sin(theta)]);
    }
  }
  shaft([discX,discY-.042,discZ],[discX,.639,discZ],.015,caseMetal,12);
  box([discX,discY-.038,discZ],[.129,.017,.032],fastener);

  // Open-sided pressed front guard and tow eyes. Much of the running gear
  // remains visible through the openings ahead of the front axle.
  for(const s of [-1,1]) {
    stamping([[s*.25,.332,1.572,.115,.028],[s*.26,.344,1.73,.116,.029],
      [s*.265,.40,1.93,.119,.03],[s*.27,.484,2.054,.11,.03]],bracket,.009);
    for(const [y,z] of [[.32,1.62],[.471,2.05]]) footBolt(s*.26,y,z,.011);
    pipe([[s*.378,.469,2.058],[s*.378,.408,2.105],[s*.378,.381,2.141],
      [s*.378,.413,2.175],[s*.378,.472,2.154]],.015,exhaust,16,8);
  }
  for(const [y,z] of [[.352,1.757],[.379,1.845],[.42,1.944]]) {
    box([0,y,z],[.56,.021,.031],bracket);
  }
  // The radiator core is visible through the lower gaps around the recovery
  // bumper. Its rear shroud faces the axle, beneath the bonnet.
  box([0,.905,1.965],[1.03,.505,.048],dark);
  for (const side of [-1,1]){
    stamping([[side*.535,.908,1.925,.060,.482],[side*.537,.908,1.946,.078,.520],
      [side*.536,.908,1.994,.066,.498]],frame,.014);
    footBolt(side*.523,.648,1.966,.013);
  }
  for(let i=0;i<42;i++){
    const y=.665+i*.0115;
    box([0,y,1.990],[1.016,.0024,.0045],bracket);
  }
  // Stamped heat shield, with upturned ends spaced above the exhaust silencer.
  stamping([[-.29,.606,-.794,.16,.016],[-.29,.59,-.747,.308,.013],
    [-.29,.584,-.687,.322,.018],[-.29,.580,-.108,.342,.018],
    [-.29,.586,-.04,.321,.014],[-.29,.604,.018,.205,.014]],caseMetal,.006);
  for(const x of [-.42,-.16]) for(const z of [-.685,-.112]) footBolt(x,.58,z,.008);
  // Drain/filler plugs and stamped retaining clips on the service lines.
  member('rear-axle');
  shaft([.049,.244,-1.433],[.049,.252,-1.433],.018,fastener,6);
  shaft([.063,.397,-1.590],[.063,.397,-1.580],.0175,fastener,6);
  member('sprung');
  footBolt(-.103,.396,1.49,.0125);
  for(const s of [-1,1]){
    member('sprung');
    for(const [z,x,y] of [[-1.63,.449,.621],[-1.28,.456,.622],[-.76,.478,.481],[-.30,.475,.461],[.19,.466,.459],[.62,.444,.472],[1.19,.359,.524]]){
      box([s*x,y,z],[.036,.017,.024],rubber);
      shaft([s*(x+.011),y-.007,z],[s*(x+.011),y+.008,z],.0074,fastener,6);
    }
    // Spring-retaining pad and fasteners for the small brake-backing plate.
    const cx=s*.48;
    member('rear-axle');
    for(const off of [-.073,.073]) footBolt(cx+off,.449,-1.445,.009);
  }
  let underseal = null;
  if (typeof document !== 'undefined') {
    underseal = new THREE.TextureLoader().load(new URL('./assets/underseal-grain.webp',import.meta.url).href);
    underseal.colorSpace=THREE.SRGBColorSpace;
    underseal.wrapS=underseal.wrapT=THREE.RepeatWrapping;
    underseal.anisotropy=4;
  }
  for (const [label, materials] of assemblies) {
    const assembly=articulate?new THREE.Group():group;
    if(articulate){assembly.name=label;group.add(assembly);}
    for (const [surface, parts] of materials) {
      const position = [], normal = [], indices = [];
      let vertexOffset = 0;
      for (const geom of parts) {
        const p=geom.getAttribute('position'), n=geom.getAttribute('normal'), idx=geom.index;
        for(let i=0;i<p.count;i++) {
          position.push(p.getX(i),p.getY(i),p.getZ(i));
          normal.push(n.getX(i),n.getY(i),n.getZ(i));
        }
        for(let i=0;i<(idx?idx.count:p.count);i++) indices.push(vertexOffset+(idx?idx.getX(i):i));
        vertexOffset+=p.count;
        geom.dispose();
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
      geo.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
      if (underseal && surface !== fastener && surface !== dark && surface !== stainless) {
        const uv = new Float32Array(vertexOffset*2);
        // Project the same physical grain scale onto rails, castings and brackets.
        for (let i=0;i<vertexOffset;i++) {
          const k=i*3, x=position[k],y=position[k+1],z=position[k+2];
          const ax=Math.abs(normal[k]), ay=Math.abs(normal[k+1]), az=Math.abs(normal[k+2]);
          if (ay>=ax && ay>=az) { uv[i*2]=x*2.7;uv[i*2+1]=z*2.7; }
          else if (ax>=az) { uv[i*2]=z*2.7;uv[i*2+1]=y*2.7; }
          else { uv[i*2]=x*2.7;uv[i*2+1]=y*2.7; }
        }
        geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
        if (!surface.map) {
          surface.map=underseal;
          surface.color.multiplyScalar(1.38);
        }
      }
      geo.setIndex(indices);
      geo.computeBoundingSphere();
      const mesh=new THREE.Mesh(geo,surface);
      mesh.name=surface.name;
      mesh.castShadow=true;
      mesh.receiveShadow=true;
      assembly.add(mesh);
    }
  }
  return group;
}
