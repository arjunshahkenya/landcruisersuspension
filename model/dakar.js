// Gerard de Rooy's no. 500 IVECO Powerstar sleeper, Dakar 2013.
// IVECO's 2013 press dossier gives 6.80 x 2.55 x 3.00 m and a 4.40 m wheelbase.
// The bonneted cab, floating wheel wings and service box are the sprung assembly.
// The common simulator mounts the SISU axles and 14.00 R20 tires at z = ±2.20.
export function buildDakar(T) {
  const truck = new T.Group();
  truck.name = '2013 PETRONAS Team De Rooy IVECO Powerstar • Dakar 500';

  const vec = (x, y, z) => new T.Vector3(x, y, z);
  const toVec = p => vec(...p);
  const mix = (a, b, u) => a + (b - a) * u;
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const curve = (stations, t) => {
    for (let j = 1; j < stations.length; j++) {
      if (t <= stations[j][0]) {
        const [a, v] = stations[j - 1], [b, w] = stations[j];
        return mix(v, w, clamp((t - a) / (b - a)));
      }
    }
    return stations[stations.length - 1][1];
  };

  // Group surfaces by finish: fine lettering and grille details cost no extra draw calls.
  const finishes = new Map();
  function finish(name, color, roughness, metalness) {
    const material = new T.MeshStandardMaterial({color, roughness, metalness, side:T.DoubleSide});
    material.name = name;
    const batch = {material, xyz:[], faces:[]};
    finishes.set(name, batch);
    return batch;
  }
  const teal = finish('Turquoise rally paint',0x05a38d,.35,.22);
  const bright = finish('Painted fender shoulders',0x25b29a,.34,.21);
  const emerald = finish('Forest green lower livery',0x086957,.54,.18);
  const navy = finish('Midnight service livery',0x173d53,.48,.15);
  const white = finish('Warm white lettering',0xf5f4df,.53,.10);
  const dark = finish('Grille mesh, seals and rub rails',0x19262b,.79,.11);
  const carbon = finish('Inner wheelhouses and steps',0x343a3b,.73,.14);
  const silver = finish('Brushed aluminium and reflectors',0xbecaca,.34,.72);
  const chrome = finish('Polished guard and brightwork',0xe0e7de,.21,.75);
  const glass = finish('Smoked blue-grey rally glazing',0x456478,.23,.36);
  const skyGlass = finish('Sky reflected in the front windscreen',0x71929e,.23,.38);
  const tint = finish('Cab brow and side glass',0x283e4a,.30,.35);
  for (const [pane, opacity] of [[glass,.65],[skyGlass,.49]]) {
    pane.material.transparent=true;
    pane.material.opacity=opacity;
    pane.material.depthWrite=false;
  }
  const yellow = finish('Yellow rally sunstrip and helmet',0xf7d23d,.42,.05);
  const red = finish('Race plate header, winch eyes and tail lamps',0xbc3d31,.45,.19);
  const amber = finish('Amber direction indicators',0xe69d41,.29,.17);
  const lamp = finish('Hella clear headlight optics',0xdde9dc,.20,.37);

  function vertex(b, p) { b.xyz.push(...p); return b.xyz.length / 3 - 1; }
  function surface(b, nu, nv, point, wanted) {
    // Shallow stamped curves need fewer intermediate samples than the arch silhouette.
    if(nu>8)nu=Math.ceil(nu*.64);
    if(nv>5)nv=Math.ceil(nv*.61);
    const first = b.xyz.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++)
      vertex(b, point(i / nu, j / nv));
    const triNormal = toVec(point(.52,.51)).sub(toVec(point(.51,.51)))
      .cross(toVec(point(.51,.52)).sub(toVec(point(.51,.51))));
    const rev = triNormal.dot(toVec(wanted)) < 0;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = first + j*(nu+1)+i, c = a + nu+1;
      if (rev) b.faces.push(a,c,a+1,a+1,c,c+1);
      else b.faces.push(a,a+1,c,a+1,c+1,c);
    }
  }
  function panel(b, pts, normal) {
    const n = toVec(normal), an = [Math.abs(n.x),Math.abs(n.y),Math.abs(n.z)];
    const axis = an.indexOf(Math.max(...an));
    const flat = pts.map(([x,y,z]) => axis===0 ? new T.Vector2(z,y) : axis===1 ? new T.Vector2(x,z) : new T.Vector2(x,y));
    const base = b.xyz.length/3; pts.forEach(p=>vertex(b,p));
    for (const [i,j,k] of T.ShapeUtils.triangulateShape(flat,[])) {
      const outward = toVec(pts[j]).sub(toVec(pts[i])).cross(toVec(pts[k]).sub(toVec(pts[i]))).dot(n)>0;
      b.faces.push(base+i,base+(outward?j:k),base+(outward?k:j));
    }
  }
  function box(b,x,y,z,w,h,d) {
    const p = (i,j,k) => [x+i*w/2,y+j*h/2,z+k*d/2];
    for (const s of [-1,1]) {
      panel(b,[p(s,-1,-1),p(s,1,-1),p(s,1,1),p(s,-1,1)],[s,0,0]);
      panel(b,[p(-1,s,-1),p(1,s,-1),p(1,s,1),p(-1,s,1)],[0,s,0]);
      panel(b,[p(-1,-1,s),p(1,-1,s),p(1,1,s),p(-1,1,s)],[0,0,s]);
    }
  }
  function rod(b, a, c, radius, sides=6) {
    const start=toVec(a), end=toVec(c), axis=end.clone().sub(start).normalize();
    const u=axis.clone().cross(Math.abs(axis.y)<.8 ? vec(0,1,0):vec(1,0,0)).normalize().multiplyScalar(radius);
    const v=axis.clone().cross(u);
    const ring=(p,i)=>p.clone().addScaledVector(u,Math.cos(i*2*Math.PI/sides)).addScaledVector(v,Math.sin(i*2*Math.PI/sides)).toArray();
    const begin=b.xyz.length/3;
    for(const p of [start,end])for(let i=0;i<sides;i++)vertex(b,ring(p,i));
    for(let i=0;i<sides;i++) {
      const j=(i+1)%sides; b.faces.push(begin+i,begin+j,begin+i+sides,begin+j,begin+j+sides,begin+i+sides);
    }
  }
  const trail=(b,pts,r)=>pts.slice(1).forEach((p,i)=>rod(b,pts[i],p,r));
  // Small vector alphabet, rendered as actual surface triangles in both renderers.
  // Runs of ink in each line share a quad and remain readable in a paused close-up.
  const letters={
    A:['01110','10001','10001','11111','10001','10001','10001'],
    C:['01111','10000','10000','10000','10000','10000','01111'],
    D:['11110','10001','10001','10001','10001','10001','11110'],
    E:['11111','10000','10000','11110','10000','10000','11111'],
    F:['11111','10000','10000','11110','10000','10000','10000'],
    G:['01111','10000','10000','10111','10001','10001','01111'],
    I:['111','010','010','010','010','010','111'],
    K:['10001','10010','10100','11000','10100','10010','10001'],
    L:['10000','10000','10000','10000','10000','10000','11111'],
    M:['10001','11011','10101','10101','10001','10001','10001'],
    N:['10001','11001','11001','10101','10011','10011','10001'],
    O:['01110','10001','10001','10001','10001','10001','01110'],
    P:['11110','10001','10001','11110','10000','10000','10000'],
    R:['11110','10001','10001','11110','10100','10010','10001'],
    S:['01111','10000','10000','01110','00001','00001','11110'],
    T:['11111','00100','00100','00100','00100','00100','00100'],
    U:['10001','10001','10001','10001','10001','10001','01110'],
    V:['10001','10001','10001','10001','10001','01010','00100'],
    Y:['10001','10001','01010','00100','00100','00100','00100'],
    0:['01110','10011','10101','10101','10101','11001','01110'],
    5:['11111','10000','10000','11110','00001','00001','11110'],
    ' ':['00','00','00','00','00','00','00']
  };
  function legend(b,txt,w,h,point,normal,lean=0) {
    const glyphs=[...txt].map(c=>letters[c]||letters[' ']);
    const columns=glyphs.reduce((total,g)=>total+g[0].length+1,0)-1;
    let col=0;
    for(const glyph of glyphs){
      for(let row=0;row<7;row++){
        const line=glyph[row], top=1-row/7, base=1-(row+1)/7;
        for(const run of line.matchAll(/1+/g)){
          const x1=(col+run.index)/columns-.5,x2=x1+run[0].length/columns;
          const at=(x,v)=>point(w*x+lean*h*(v-.5),h*(v-.5));
          panel(b,[at(x1,base),at(x2,base),at(x2,top),at(x1,top)],normal);
        }
      }
      col+=glyph[0].length+1;
    }
  }
  const faceZ=3.15;
  const bonnetStart=1.50;
  const hoodWidth=z=>curve([[1.50,.90],[1.69,.85],[2.02,.76],[2.60,.666],[2.99,.636],[3.15,.602]],z);
  const hoodY=z=>curve([[1.50,2.018],[1.76,1.989],[2.10,1.934],[2.72,1.833],[3.03,1.782],[3.15,1.726]],z);
  const hood=(a,z)=>{
    const t=Math.abs(a);
    return [a*hoodWidth(z),hoodY(z)-.077*t**2-.052*t**8,z];
  };
  surface(teal,28,26,(u,v)=>hood(2*u-1,mix(bonnetStart,faceZ,v)),[0,1,0]);
  for(const side of [-1,1]){
    const zAt=u=>mix(bonnetStart,faceZ,u);
    surface(emerald,28,5,(u,v)=>{const z=zAt(u),p=hood(side,z);return [p[0]+side*.014*Math.sin(Math.PI*v),mix(p[1],1.17,v),z];},[side,0,0]);
    const hline=Array.from({length:18},(_,i)=>{const p=hood(side*.856,zAt(i/17));return [p[0],p[1]+.004,p[2]];});
    trail(bright,hline,.009);
  }
  // Black recessed, rounded trapezoidal radiator, silver horizontal grille
  // divisions, wrapped turquoise nose surround and the high IVECO wordmark.
  // Small moulded side vents on either side of the bonnet are recessed in
  // raised black intake lips behind the leading fenders.
  for(const s of [-1,1]){
    for(let j=0;j<5;j++){
      const z=1.685+j*.080, width=hoodWidth(z);
      const lipY=hoodY(z)-.171;
      rod(dark,[s*(width+.012),lipY-.069,z],[s*(width+.013),lipY,z+.028],.014);
    }
  }
  const grillePoint=(a,t)=>{
    const half=mix(.525,.572,t)-.027*Math.abs(2*t-1)**9;
    return [a*half,mix(1.055,1.602,t)+.018*(1-a*a),3.168-.055*a*a-.031*(1-t)];
  };
  surface(dark,24,10,(u,v)=>grillePoint(2*u-1,v),[0,0,1]);
  for(let i=0;i<7;i++){
    const y=.08+i*.125;
    surface(silver,23,1,(u,v)=>{const p=grillePoint(2*u-1,y+v*.018);return [p[0],p[1],p[2]+.008];},[0,0,1]);
  }
  for(let i=-10;i<=10;i++){
    const a=i*.090;
    surface(carbon,1,5,(u,v)=>{const p=grillePoint(a+u*.014,v);return [p[0],p[1],p[2]+.003];},[0,0,1]);
  }
  for(const s of [-1,1]) {
    const grd=[];for(let i=0;i<=10;i++)grd.push(grillePoint(s,i/10));
    trail(bright,grd,.026);
  }
  surface(teal,28,4,(u,v)=>{const a=u*2-1,high=hood(a,faceZ),low=grillePoint(a,1);
    return [mix(low[0],high[0],v),mix(low[1],high[1],v),mix(low[2],high[2],v)+.016*Math.sin(v*Math.PI)];
  },[0,0,1]);
  legend(white,'IVECO',.61,.090,(x,y)=>[x,1.654+y,3.197-.032*(x/.62)**2],[0,0,1]);
  const arch=(z,axle,lower,rise,half)=>{
    const u=(z-axle)/half;
    return lower+rise*Math.sqrt(Math.max(0,1-Math.min(1,Math.abs(u))**2));
  };
  // Front fenders rise over the tires independently of the high torpedo bonnet.
  for(const s of [-1,1]){
    const fz=u=>mix(1.24,3.125,u);
    const low=z=>arch(z,2.20,.835,.722,.845);
    const crown=z=>Math.max(low(z)+.091,curve([[1.24,1.48],[1.53,1.565],[2.1,1.633],[2.58,1.606],[2.93,1.512],[3.12,1.45]],z));
    const outer=z=>1.266-.09*clamp((z-2.91)/.216)**1.8;
    surface(teal,60,10,(u,v)=>{const z=fz(u),w=outer(z);return [s*(w-.032*v**2),mix(low(z),crown(z),v),z];},[s,0,0]);
    surface(bright,60,11,(u,v)=>{const z=fz(u);return [s*mix(outer(z)-.032,.55,v),crown(z)+.04*Math.sin(Math.PI*v)-.055*v,z];},[0,1,0]);
    surface(carbon,60,4,(u,v)=>{const z=fz(u);return [s*mix(outer(z),.85,v),low(z)-.012*v,z];},[0,-1,0]);
    const fenderLip=Array.from({length:50},(_,i)=>{const z=mix(1.351,3.045,i/49);return [s*(outer(z)+.003),low(z)+.011,z];});trail(dark,fenderLip,.014);
    // Turquoise side mounts for the black lamp masks under the shoulder.
    const lampPanel=(u,v)=>[s*mix(.578,1.157,u),mix(1.011,1.463,v)-.018*u,3.152-.152*u*u+.016*v];
    surface(teal,15,7,lampPanel,[0,0,1]);
    surface(dark,13,5,(u,v)=>{const a=.12+u*.76,p=lampPanel(a,.16+.52*v);return [p[0],p[1],p[2]+.019];},[0,0,1]);
    for(const a of [.317,.662]){
      surface(lamp,5,3,(u,v)=>{const p=lampPanel(a+(u-.5)*.244,.244+.332*v);return [p[0],p[1],p[2]+.027+.008*Math.sin(Math.PI*u)*Math.sin(Math.PI*v)];},[0,0,1]);
      for(let i=0;i<4;i++) {
        const p=lampPanel(a+(i-1.5)*.045,.30),q=lampPanel(a+(i-1.5)*.045,.515);
        rod(silver,[p[0],p[1],p[2]+.034],[q[0],q[1],q[2]+.034],.0025,4);
      }
    }
    const signal=lampPanel(.94,.38);box(amber,signal[0],signal[1],signal[2]+.008,.034,.078,.023);
  }
  const bumper=(x,v)=>[x,mix(.786,.988,v)+.075*(Math.abs(x)/1.14)**3,
    3.184-.172*(Math.abs(x)/1.15)**3+.044*v];
  // The cross-member is visible below the floating black radiator; its deep
  // returns conceal the engine bay without closing the approach angle.
  surface(emerald,22,4,(u,v)=>{
    const a=u*2-1, x=a*.652, lower=bumper(x,1);
    return [x,mix(lower[1]-.014,1.100+.042*(1-a*a),v),
      mix(lower[2]-.014,3.10-.055*a*a,v)];
  },[0,0,1]);
  surface(teal,40,6,(u,v)=>bumper(mix(-1.17,1.17,u),v),[0,0,1]);
  surface(carbon,26,3,(u,v)=>{const p=bumper(mix(-1.15,1.15,u),0);
    // The rear fold narrows at the wings for the rising front tires.
    const depth=.22-.172*clamp((Math.abs(p[0])-.72)/.40);
    return [p[0],p[1]+.034*v,p[2]-depth*v];},[0,-1,0]);
  for(const s of [-1,1]) {
    box(dark,s*.435,.865,3.221,.24,.053,.024);
    trail(red,[[s*.63,.830,3.178],[s*.65,.765,3.201],[s*.697,.768,3.198],[s*.70,.827,3.172]],.014);
  }

  // Sleeper cab. The side window and windscreen cut between different faces so
  // the trapezoidal A-pillars and the bent forward cowl remain legible on orbit.
  const cabX=y=>curve([[1.08,1.068],[1.67,1.141],[2.03,1.156],[2.57,1.126],[2.85,1.079],[2.94,1.033]],y);
  const cabFront=y=>curve([[1.07,1.375],[1.68,1.548],[2.01,1.62],[2.20,1.536],[2.59,1.345],[2.81,1.233],[2.94,1.045]],y);
  const cabBack=y=>-.535+.084*clamp((y-2.60)/.34)**1.6;
  const sidePoint=(s,z,y,d=0)=>[s*(cabX(y)+d),y,z];
  const windPoint=(a,v,d=0)=>{const y=mix(2.023,2.813,v);return [a*(cabX(y)-.025),y+.027*(1-a*a),cabFront(y)+.062*(1-a*a)+d];};
  surface(teal,24,10,(u,v)=>{const a=2*u-1,y=mix(1.09,2.026,v);return [a*cabX(y),y,cabFront(y)+.058*(1-a*a)];},[0,0,1]);
  for(const sign of [-1,1]){
    surface(teal,4,13,(u,v)=>windPoint(sign*mix(.942,1,u),v),[0,0,1]);
    surface(dark,3,13,(u,v)=>windPoint(sign*mix(.925,.947,u),v,.002),[0,0,1]);
  }
  for(const [lo,hi] of [[0,.052],[.946,1]])
    surface(dark,26,2,(u,v)=>windPoint(u*2-1,mix(lo,hi,v),.001),[0,0,1]);
  surface(skyGlass,26,12,(u,v)=>windPoint((2*u-1)*.938,.042+.865*v,.006),[0,0,1]);
  // Inside the glass a dark blue lower reflection hints at the racing dashboard.
  surface(glass,24,4,(u,v)=>windPoint((2*u-1)*.939,mix(.044,.159+.027*Math.sin(u*Math.PI),v),.007),[0,0,1]);
  surface(yellow,26,3,(u,v)=>windPoint((2*u-1)*.942,.852+.097*v,.013),[0,0,1]);
  legend(navy,'DE ROOY',.69,.041,(x,y)=>windPoint(x/(cabX(2.73)-.025),.903+y/.79,.020),[0,0,1]);
  for(const s of [-1,1]){
    const wiper=(a,v)=>windPoint(a,v,.028);
    const p=wiper(s*.40,.062),q=wiper(s*.17,.174);
    rod(dark,p,q,.010);rod(dark,wiper(s*.04,.181),wiper(s*.51,.153),.012);
    rod(silver,wiper(s*.403,.056),wiper(s*.22,.146),.005);
  }
  for(const s of [-1,1]){
    const drawing=(b,zy,off)=>panel(b,zy.map(([z,y])=>sidePoint(s,z,y,off)),[s,0,0]);
    const win=[[.016,2.047],[.024,2.60],[.092,2.752],[1.177,2.752],[1.466,2.195],[1.447,2.076],[.413,1.969]];
    const clear=[[.065,2.083],[.080,2.61],[.127,2.705],[1.135,2.705],[1.414,2.19],[1.404,2.126],[.419,2.021]];
    const sideRing=(material,outer,inner,offset)=>{
      const pts=outer.concat(inner),first=material.xyz.length/3;
      const flat=path=>path.map(([z,y])=>new T.Vector2(z,y));
      pts.forEach(([z,y])=>vertex(material,sidePoint(s,z,y,offset)));
      for(const [a,b,c] of T.ShapeUtils.triangulateShape(flat(outer),[flat(inner)])){
        const normal=(pts[b][1]-pts[a][1])*(pts[c][0]-pts[a][0])-(pts[b][0]-pts[a][0])*(pts[c][1]-pts[a][1]);
        material.faces.push(first+a,first+(s*normal>0?b:c),first+(s*normal>0?c:b));
      }
    };
    const cabHeights=[1.065,1.678,2.013,2.193,2.590,2.813,2.885];
    const cabOutline=[...cabHeights.map(y=>[cabBack(y),y]),...cabHeights.slice().reverse().map(y=>[cabFront(y),y])];
    sideRing(teal,cabOutline,win,0);
    sideRing(dark,win,clear,.007);
    drawing(glass,clear,.016);
    drawing(tint,[[1.173,2.111],[1.16,2.591],[1.372,2.195],[1.362,2.135]],.020);
    drawing(emerald,[[-.452,1.091],[-.452,1.33],[1.21,1.534],[1.325,1.159]],.006);
    const outline=[[-.034,1.192],[-.052,2.536],[.032,2.791],[1.187,2.799],[1.50,2.198],[1.463,1.61],[1.235,1.219],[-.034,1.192]];
    trail(emerald,outline.map(([z,y])=>sidePoint(s,z,y,.020)),.009);
    const handle=sidePoint(s,.14,1.945,.04);
    box(dark,handle[0],handle[1],handle[2],.048,.071,.168);
    rod(chrome,sidePoint(s,.082,1.951,.068),sidePoint(s,.195,1.951,.068),.010);
    // Two-piece mirror on pinned tubular arms. Total body width excludes mirrors.
    const m=1.333;
    trail(dark,[sidePoint(s,1.406,2.07,.005),[s*m,2.11,1.54],[s*m,2.621,1.53],sidePoint(s,1.266,2.691,.016)],.017);
    box(dark,s*m,2.404,1.525,.173,.255,.133);
    box(teal,s*m,2.417,1.560,.169,.219,.090);
    box(silver,s*m,2.402,1.451,.146,.211,.013);
    box(dark,s*m,2.208,1.526,.155,.103,.116);
    // Door decal is built in local screen reading direction on either side.
    const writing=(z,y,d=0)=>(x,dy)=>sidePoint(s,z-s*x,y+dy,d);
    const card=writing(.672,1.711,.033);
    panel(white,[card(-.34,-.191),card(.34,-.191),card(.34,.191),card(-.34,.191)],[s,0,0]);
    const header=writing(.672,1.869,.035);
    panel(red,[header(-.339,-.032),header(.339,-.032),header(.339,.032),header(-.339,.032)],[s,0,0]);
    legend(dark,'500',.470,.230,writing(.672,1.685,.039),[s,0,0],.06);
    legend(white,'DAKAR',.285,.04,writing(.672,1.869,.040),[s,0,0]);
    for(let k=0;k<2;k++) {
      const z=.51+(k?-.40:0);
      box(carbon,s*1.115,1.012,z,.266,.067,.313);
      for(let i=0;i<3;i++) box(silver,s*1.205,1.052,z+(i-1)*.078,.073,.012,.038);
    }
    box(carbon,s*1.116,1.243,.54,.252,.049,.744);
    for(let y=1.381;y<1.930;y+=.122){
      box(dark,s*(cabX(y)+.012),y,-.296,.030,.051,.310);
    }
  }
  // Three FIA-style bucket seats, six-point straps and the internal roll cage
  // are visible through the unobstructed window apertures.
  box(carbon,0,1.093,.365,2.12,.10,1.69);
  const seat=(x)=>{
    box(carbon,x,1.535,.381,.374,.12,.351);
    panel(dark,[[x-.177,1.510,.244],[x+.177,1.510,.244],[x+.16,2.246,.135],
      [x+.121,2.363,.128],[x-.121,2.363,.128],[x-.16,2.246,.135]],[0,0,1]);
    for(const s of [-1,1]){
      trail(carbon,[[x+s*.186,1.570,.430],[x+s*.197,1.73,.338],[x+s*.166,2.179,.200],
        [x+s*.122,2.342,.167]],.032);
      trail(red,[[x+s*.091,2.176,.184],[x+s*.069,1.928,.247],[x+s*.026,1.671,.284]],.015);
    }
  };
  for(const x of [-.634,0,.634])seat(x);
  for(const s of [-1,1]){
    trail(carbon,[[s*.97,1.23,.99],[s*1.008,1.952,1.445],[s*.934,2.713,1.092],
      [s*.929,2.752,-.322],[s*.956,1.265,-.354]],.037);
    rod(carbon,[s*.925,1.292,-.349],[-s*.909,2.743,-.324],.030);
  }
  rod(carbon,[-.929,2.752,-.322],[.929,2.752,-.322],.037);
  box(carbon,0,1.897,1.285,2.026,.173,.372);
  const steering=[];for(let i=0;i<=18;i++){
    const a=i*Math.PI/9;steering.push([.635+.157*Math.cos(a),2.003+.112*Math.sin(a),.97-.095*Math.sin(a)]);
  }
  trail(dark,steering,.020);
  // Roof cap mildly crowned across its breadth. A flared front cap conceals
  // the windshield header; the low roof is a hallmark of the Powerstar.
  const roof=(a,v)=>{
    const t=Math.abs(a);
    return [a*(1.131-.025*Math.abs(v*2-1)**4),2.914+.057*(1-t*t)-.030*Math.abs(v*2-1)**6,
      mix(-.493+.062*t**3,1.208-.102*t**4,v)];
  };
  surface(white,24,16,(u,v)=>roof(2*u-1,v),[0,1,0]);
  for(const s of [-1,1]){
    surface(teal,18,4,(u,v)=>{const p=roof(s,u);return [mix(s*cabX(2.875),p[0],v),mix(2.875,p[1],v),p[2]];},[s,0,0]);
  }
  surface(teal,24,4,(u,v)=>{const a=2*u-1,p=roof(a,1),q=windPoint(a,1);
    return [mix(q[0],p[0],v),mix(q[1],p[1],v),mix(q[2],p[2],v)];},[0,0,1]);
  panel(carbon,[[-1.075,1.195,-.501],[1.075,1.195,-.501],[1.053,2.777,-.451],[-1.053,2.777,-.451]],[0,0,1]);
  panel(teal,[[-1.12,1.086,-.526],[1.12,1.086,-.526],[1.09,2.851,-.469],[-1.09,2.851,-.469]],[0,0,-1]);
  for(const x of [-.90,-.64,0,.64,.90]){
    const p=roof(x/1.10,.90);
    box(dark,x,p[1]+.011,p[2],.088,.024,.133);
    box(amber,x,p[1]+.031,p[2]+.012,.073,.030,.081);
  }
  box(white,0,2.979,.18,.52,.038,.436);
  // Two visible sections of cab protection / external air plumbing behind cab.
  for(const s of [-1,1]){
    trail(dark,[[s*1.025,1.051,-.654],[s*1.08,2.46,-.643],[s*.96,2.792,-.617]],.063,7);
    trail(silver,[[s*.951,1.154,-.621],[s*.973,2.41,-.604]],.030);
    box(dark,s*1.064,2.281,-.639,.16,.050,.16);
    box(dark,s*1.064,1.740,-.643,.16,.050,.16);
  }

  // Enclosed spares / workshop superstructure. The thin side skirts are
  // genuinely cut away over the rear tyres all the way through to the liner.
  const back=-3.520, fore=-.714, rearAxle=-2.20;
  const bedRoof=z=>curve([[back,2.667],[-3.39,2.807],[-3.20,2.898],[-.93,2.909],[fore,2.823]],z);
  const bedX=y=>1.230-.052*clamp((y-2.65)/.25)**1.75;
  const bottom=z=>arch(z,rearAxle,1.013,.548,.829);
  for(const s of [-1,1]){
    const side=(z,y,d=0)=>[s*(bedX(y)+d),y,z];
    surface(teal,72,15,(u,v)=>{const z=mix(back,fore,u);return side(z,mix(bottom(z),bedRoof(z),v));},[s,0,0]);
    surface(carbon,72,4,(u,v)=>{const z=mix(back,fore,u);return [s*mix(bedX(bottom(z)),.781,v),bottom(z)+.026*v,z];},[0,-1,0]);
    const archPts=Array.from({length:43},(_,i)=>{const z=mix(-3.042,-1.355,i/42);return side(z,bottom(z)+.017,.005);});
    trail(emerald,archPts,.024);
    const polygon=(b,pts,off=.008)=>panel(b,pts.map(([z,y])=>side(z,y,off)),[s,0,0]);
    // Period Petronas livery has a white diagonal sponsor band over a dark
    // lower service hatch, with two thinner turquoise / navy speedlines.
    polygon(white,[[back+.02,2.382],[fore-.055,1.724],[fore-.055,2.037],[back+.02,2.665]]);
    polygon(navy,[[back+.025,2.333],[fore-.050,1.650],[fore-.050,1.723],[back+.025,2.384]],.011);
    polygon(emerald,[[back+.025,2.632],[fore-.050,2.018],[fore-.050,2.089],[back+.025,2.697]],.011);
    const sideText=(z,y,d=0)=>(x,dy)=>side(z-s*x,y+dy,d);
    legend(white,'PETRONAS',1.68,.192,sideText(-2.129,2.664,.022),[s,0,0],.13);
    legend(white,'URANIA',1.12,.109,sideText(-1.845,2.471,.024),[s,0,0],.20);
    // The white PETRONAS drop is a two-part stencil with a turquoise cutout.
    const logo=(x,y,d)=>sideText(-3.18,2.634,d)(x,y);
    const drop=[[0,.138],[.105,.002],[.116,-.048],[.098,-.100],[.05,-.128],[-.047,-.128],[-.09,-.089],[-.102,-.034],[-.080,.034]];
    panel(white,drop.map(([x,y])=>logo(x,y,.024)),[s,0,0]);
    panel(teal,drop.map(([x,y])=>logo(x*.65,y*.64-.012,.027)),[s,0,0]);
    // A standalone team signature occupies the back of the service box.
    legend(navy,'DE ROOY',.736,.104,sideText(-2.932,2.354,.027),[s,0,0],.10);
    legend(white,'IVECO',.563,.105,sideText(-1.168,1.425,.023),[s,0,0]);
    legend(white,'FPT',.419,.102,sideText(-3.232,1.443,.024),[s,0,0]);
    for(const z of [-3.31,-2.57,-1.56,-.876]) {
      const base=bottom(z)+.06,top=bedRoof(z)-.13;
      rod(emerald,side(z,base,.012),side(z,top,.012),.006,5);
      for(const y of [base+.10,top-.16])box(silver,s*(bedX(y)+.018),y,z,.023,.059,.056);
    }
    // Recess, wind slots, pins and amber side marker set into lower service panel.
    for(const z of [-3.318,-1.03]){
      for(let j=0;j<4;j++) {
        const y=1.188+j*.049;
        rod(dark,side(z-.132,y,.018),side(z+.132,y,.018),.0095);
      }
      box(amber,s*1.247,1.083,z,.023,.049,.118);
    }
    panel(dark,[[s*.946,.353,-3.03],[s*1.248,.357,-3.04],[s*1.248,1.090,-3.052],[s*.946,1.086,-3.043]],[0,0,-1]);
  }
  surface(emerald,20,28,(u,v)=>{const z=mix(back,fore,v),a=2*u-1;return [a*bedX(bedRoof(z)),bedRoof(z)+.017*(1-a*a),z];},[0,1,0]);
  // The alloy load floor bridges the chassis rails. Vertical inboard wheel
  // tubs close the sides of the box, leaving the full suspension openings.
  box(carbon,0,1.057,(back+fore)/2,1.566,.054,fore-back);
  for(const s of [-1,1]){
    surface(carbon,47,2,(u,v)=>{
      const z=mix(back,fore,u),upper=Math.max(1.064,bottom(z)+.026);
      return [s*.783,mix(1.045,upper,v),z];
    },[s,0,0]);
  }
  for(const z of [-3.22,-2.81,-2.24,-1.69,-1.14]){
    box(emerald,0,1.020,z,1.61,.046,.073);
  }
  for(const z of [back,fore]){
    const sign=z===back?-1:1;
    surface(teal,24,15,(u,v)=>{const y=mix(1.027,bedRoof(z),v);return [(2*u-1)*bedX(y),y,z];},[0,0,sign]);
  }
  const rearPoint=(x,y,d=0)=>[x,y,back-d];
  const rearWrite=(y,d)=>(x,dy)=>rearPoint(-x,y+dy,d);
  legend(white,'DE ROOY',1.23,.152,rearWrite(2.40,.014),[0,0,-1],.08);
  legend(white,'IVECO',.69,.116,rearWrite(1.281,.015),[0,0,-1]);
  for(const s of [-1,1]){
    const tailRect=(b,x,y,w,h,d)=>box(b,s*x,y,back-d,w,h,.026);
    tailRect(dark,.987,1.141,.382,.152,.017);
    tailRect(red,1.030,1.145,.154,.093,.034);
    tailRect(amber,.868,1.145,.104,.091,.034);
    for(let i=0;i<6;i++)rod(carbon,rearPoint(s*.11,1.490+i*.078,.012),rearPoint(s*.726,1.490+i*.078,.012),.021);
    trail(silver,[rearPoint(s*.924,1.347,.014),rearPoint(s*.924,2.443,.014)],.009);
    for(const y of [1.49,2.25])tailRect(silver,.927,y,.122,.057,.018);
  }
  const rearCard=(x,y)=>rearPoint(-x,1.976+y,.026);
  panel(white,[rearCard(-.229,-.136),rearCard(.229,-.136),rearCard(.229,.136),rearCard(-.229,.136)],[0,0,-1]);
  legend(dark,'500',.33,.172,rearWrite(1.977,.031),[0,0,-1]);
  box(carbon,0,.962,back+.06,2.32,.096,.126);
  for(const s of [-1,1]) {
    trail(silver,[[s*.82,.945,-3.46],[s*.82,.805,-3.449],[s*.69,.768,-3.430]],.035);
    rod(navy,[s*.40,1.041,-3.49],[s*.49,.907,-3.39],.046);
  }
  // Finite triangulated geometry needed for the CPU renderer and cutaway rig.
  for(const batch of finishes.values()){
    if(!batch.faces.length)continue;
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(batch.xyz,3));
    geometry.setIndex(batch.faces);geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const mesh=new T.Mesh(geometry,batch.material);
    mesh.name='Powerstar • '+batch.material.name;
    mesh.castShadow=true;mesh.receiveShadow=true;truck.add(mesh);
  }
  return truck;
}
