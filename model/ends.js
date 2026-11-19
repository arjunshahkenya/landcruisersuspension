// Front and rear trim are built in an outward-facing coordinate system.
// At the rear, local +x is the passenger's view-right when standing behind the vehicle.
export function buildEnds(T) {
  const ends = new T.Group();
  ends.name = 'Grille, lighting, bumpers and rear carrier';
  const front = new T.Group(), rear = new T.Group();
  front.name = 'Front fascia'; rear.name = 'Tailgate and carrier';
  rear.rotation.y = Math.PI;
  ends.add(front, rear);
  const standard = (color, roughness = .4, metalness = .1, extra = {}) =>
    new T.MeshStandardMaterial({color, roughness, metalness, side:T.DoubleSide, ...extra});
  const chrome = standard(0xc6cbca,.24,.73);
  const satin = standard(0x828783,.42,.56);
  const black = standard(0x171b1b,.65,.11);
  const voidBlack = standard(0x090d0e,.83,.02);
  const steel = standard(0x2d3133,.66,.38);
  const steelEdge = standard(0x363a3c,.57,.33);
  const rubber = standard(0x252725,.86,.02);
  const leather = standard(0x373536,.79,.07);
  const rearSilver = standard(0xaaa49a,.43,.46);
  const rearPad = standard(0x424344,.69,.14);
  const body = standard(0x254c4b,.36,.46);
  const materialMaps = new Map();
  function map(file) {
    if (!materialMaps.has(file)) {
      if (typeof document === 'undefined') return null;
      const tex = new T.TextureLoader().load(new URL('./assets/'+file,import.meta.url).href);
      tex.colorSpace=T.SRGBColorSpace; tex.anisotropy=4; materialMaps.set(file,tex);
    }
    return materialMaps.get(file);
  }
  function add(parent, geometry, material, name) {
    const m=new T.Mesh(geometry,material);
    m.name=name; parent.add(m);
    return m;
  }
  function box(parent,name,w,h,d,x,y,z,mat) {
    const m=add(parent,new T.BoxGeometry(w,h,d),mat,name);
    m.position.set(x,y,z);return m;
  }
  function tube(parent,name,pts,r,mat,closed=false,smooth=false,segments=40) {
    const points=pts.map(p=>new T.Vector3(...p));
    let curve;
    if(smooth) curve=new T.CatmullRomCurve3(points,closed,'centripetal');
    else {
      curve=new T.CurvePath();
      for(let i=1;i<points.length;i++) curve.add(new T.LineCurve3(points[i-1],points[i]));
      if(closed) curve.add(new T.LineCurve3(points.at(-1),points[0]));
    }
    return add(parent,new T.TubeGeometry(curve,segments,r,7,closed),mat,name);
  }
  function patch(parent,name,fn,mat,cols,rows,reverse=false) {
    const positions=[],uvs=[],indices=[];
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
      positions.push(...fn(i/cols,j/rows));uvs.push(i/cols,j/rows);
    }
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const a=j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;
      if(reverse) indices.push(a,d,b,a,c,d); else indices.push(a,b,d,a,d,c);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
    geo.setIndex(indices);geo.computeVertexNormals();
    return add(parent,geo,mat,name);
  }
  function perimeter(fn,nx=20,ny=8) {
    const pts=[];
    for(let i=0;i<nx;i++)pts.push(fn(i/nx,0));
    for(let j=0;j<ny;j++)pts.push(fn(1,j/ny));
    for(let i=nx;i>0;i--)pts.push(fn(i/nx,1));
    for(let j=ny;j>0;j--)pts.push(fn(0,j/ny));
    return pts;
  }
  // Rolls a bumper cross section across stations. The first and last stations
  // return onto the quarters and follow the approach/departure cutbacks.
  function sections(parent,name,rings,mat) {
    const pos=[],idx=[];
    for(let i=0;i<rings.length-1;i++)for(let j=0;j<rings[0].length;j++){
      const next=(j+1)%rings[0].length,s=pos.length/3;
      pos.push(...rings[i][j],...rings[i+1][j],...rings[i+1][next],...rings[i][next]);
      idx.push(s,s+1,s+2,s,s+2,s+3);
    }
    [rings[0],rings.at(-1)].forEach((ring,end)=>{
      const s=pos.length/3;ring.forEach(p=>pos.push(...p));
      for(let j=1;j<ring.length-1;j++) {
        if(end)idx.push(s,s+j+1,s+j);else idx.push(s,s+j,s+j+1);
      }
    });
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
    return add(parent,g,mat,name);
  }
  const curvePoints=(n,fn)=>Array.from({length:n},(_,i)=>fn(i/(n-1)));
  function ellipseRing(parent,name,x,y,z,rx,ry,t,mat) {
    const pts=Array.from({length:56},(_,i)=>{
      const a=i/56*Math.PI*2;
      return [x+rx*Math.cos(a),y+ry*Math.sin(a),z];
    });
    return tube(parent,name,pts,t,mat,true,true,72);
  }
  function toyota(parent,x,y,z,width) {
    const group=new T.Group();group.name='Three-ellipse Toyota emblem';
    group.position.set(x,y,z);group.scale.setScalar(width/.13);parent.add(group);
    const pad=add(group,new T.SphereGeometry(1,32,14),black,'Enamel emblem backing');
    pad.position.z=-.005;pad.scale.set(.065,.043,.009);
    ellipseRing(group,'Chrome outer oval',0,0,0,.063,.04,.0038,chrome);
    ellipseRing(group,'Chrome vertical oval',0,-.001,.004,.0127,.037,.0033,chrome);
    ellipseRing(group,'Chrome horizontal oval',0,.018,.005,.043,.014,.0033,chrome);
  }
  function plate(parent,name,x,y,z,w,h,src) {
    const frame=box(parent,name+' surround',w+.012,h+.012,.018,x,y,z-.006,black);
    const printed=standard(0xffffff,.57,.09,{map:map(src)});
    const panel=add(parent,new T.PlaneGeometry(w,h),printed,name);
    panel.position.set(x,y,z+.005);
    return frame;
  }
  const faceZ=x=>2.346-.104*Math.pow(Math.abs(x)/.95,3.8);
  const grilleY=.867, grilleH=.314;
  function grille(u,t) {
    const topRound=.016*(1-Math.sqrt(Math.min(1,(1-t)/.06)));
    const bottomRound=.031*(1-Math.sqrt(Math.min(1,t/.12)));
    const half=.438+.060*t-topRound-bottomRound;
    const x=(2*u-1)*half;
    return [x,grilleY+t*grilleH+.008*(x*x),faceZ(x)+.009*Math.sin(Math.PI*t)];
  }
  patch(front,'Recessed grille core',grille,voidBlack,40,15);
  const lip=perimeter(grille,36,19);
  tube(front,'Chrome grille surround',lip,.012,chrome,true,true,150);
  [0.12,.26,.40,.54,.69,.83,.95].forEach(t=>{
    const pts=curvePoints(26,u=>{const p=grille(.009+u*.982,t);p[2]+=.003;return p;});
    tube(front,'Fine horizontal grille mesh',pts,.0035,steel,false,true,30);
  });
  for(let i=-10;i<=10;i++){
    const u=.5+i*.045;
    const pts=curvePoints(10,t=>{const p=grille(u,.05+.90*t);p[2]+=.002;return p;});
    tube(front,'Grille support',pts,.0028,steel,false,true,11);
  }
  [.19,.40,.61,.82].forEach(t=>{
    patch(front,'Beveled chrome grille louvre',(u,profile)=>{
      const p=grille(.012+.976*u,t);
      p[1]+=(profile-.5)*.021;
      p[2]+=.010+Math.sin(profile*Math.PI)*.007+.0015*(1-profile);
      return p;
    },chrome,36,5);
  });
  toyota(front,0,1.027,faceZ(0)+.038,.145);
  const beamLens=standard(0xffffff,.25,.21,{map:map('ends-headlight.webp')});
  const amber=standard(0xb78345,.42,.25);
  for(const side of [-1,1]){
    // Automotive lenses wrap back onto the wing. The inboard lower corners
    // follow the grille taper and the outside corners curve into the fender.
    function headlight(u,v) {
      const lower=.865+.022*(1-u),upper=1.177+.006*(1-u);
      const rounding=(v<.19 ? .026*(1-Math.sqrt(v/.19)) : v>.91 ? .012*(1-Math.sqrt((1-v)/.09)) : 0);
      const outer=.879-rounding-.040*(1-v)**2;
      const inner=.442+.060*v;
      const a=outer*(1-u)+inner*u, x=side*a;
      return [x,lower+v*(upper-lower),faceZ(x)+.002+.010*Math.sin(u*Math.PI)*Math.sin(v*Math.PI)];
    }
    patch(front,'Fluted headlamp and corner indicator',headlight,beamLens,36,16,side>0);
    const housingEdge=perimeter(headlight,24,12);
    patch(front,'Headlight housing return',(u,v)=>{
      const k=Math.round(u*housingEdge.length)%housingEdge.length;
      const p=housingEdge[k];return [p[0]*(1-.024*v),p[1],p[2]-.074*v];
    },black,housingEdge.length,1);
    tube(front,'Headlamp perimeter gasket',perimeter(headlight),.007,black,true,true,100);
    tube(front,'Outer indicator dividing fin',curvePoints(20,t=>{
      const p=headlight(.304,.02+.96*t);p[2]+=.003;return p;
    }),.0025,satin,false,true,20);
    const bulb=add(front,new T.SphereGeometry(1,12,8),amber,'Indicator bulb within corner lens');
    const p=headlight(.12,.5);
    bulb.scale.set(.017,.019,.003);bulb.position.set(p[0],p[1],p[2]-.003);
  }
  const frontStations=[
    [-.982,2.002,.664,.825],[-.969,2.237,.607,.839],[-.828,2.425,.568,.84],
    [-.422,2.494,.503,.84],[.422,2.494,.503,.84],[.828,2.425,.568,.84],
    [.969,2.237,.607,.839],[.982,2.002,.664,.825]
  ];
  const frontRings=frontStations.map(([x,z,bottom,top])=>[
    [x,bottom+.017,z-.048],[x,bottom+.046,z],[x,top-.015,z],[x,top,z-.013],
    [x*.99,top-.016,Math.min(z-.035,2.205)],[x*.99,bottom+.067,Math.min(z-.040,2.178)]
  ]);
  sections(front,'Folded powder-coated steel winch bumper',frontRings,steel);
  tube(front,'Bumper pressing along top edge',frontStations.map(([x,z,,y])=>[x,y-.013,z-.004]),.0036,steelEdge,false,false,50);
  const slope=Math.atan2(.069,.406);
  // Components installed on the angled face of each wing.
  function wing(side,a,y,name) {
    const pivot=new T.Group();pivot.name=name;front.add(pivot);
    pivot.position.set(side*a,y,2.494-(a-.422)*.069/.406+.002);
    pivot.rotation.y=side*slope;return pivot;
  }
  for(const side of [-1,1]){
    const fog=wing(side,.686,.718,'Recessed square auxiliary floodlight');
    box(fog,'Tapered LED pocket',.174,.124,.007,0,0,0,voidBlack);
    box(fog,'Lamp bezel',.077,.081,.010,side*.019,.002,.004,steelEdge);
    box(fog,'Smoked floodlight cover',.060,.063,.008,side*.019,.002,.010,black);
    const lamp=standard(0xc7caae,.33,.35);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++){
      const led=add(fog,new T.SphereGeometry(1,6,5),lamp,'Individual LED reflector');
      led.position.set(side*.019+(i-1)*.016,(j-1)*.016+.002,.014);
      led.scale.set(.006,.006,.003);
    }
    const boltMat=standard(0x777b73,.55,.50);
    for (const sx of [-1,1]) for(const sy of [-1,1]){
      const bolt=add(fog,new T.CylinderGeometry(.0033,.0033,.004,6),boltMat,'Auxiliary lamp fastener');
      bolt.rotation.x=Math.PI/2;bolt.position.set(side*.019+sx*.033,.002+sy*.034,.013);
    }
    const slots=wing(side,.366,.628,'Recovery point recess');
    slots.rotation.y=0;slots.position.z=2.495;
    box(slots,'Recessed recovery opening',.064,.071,.012,0,0,.000,voidBlack);
    [-.046,.046].forEach(dx=>{
      const well=box(front,'Vent in bumper deck',.052,.003,.030,side*(.33+dx),.837,2.343,voidBlack);
      well.rotation.y=.08*side;
    });
  }
  box(front,'Winch fairlead shadow',.278,.041,.012,0,.587,2.493,voidBlack);
  box(front,'Lower fairlead guide',.251,.009,.015,0,.573,2.501,steelEdge);
  plate(front,'Front Kenyan registration',0,.748,2.505,.468,.105,'ends-plate-front.webp');
  // A contoured wraparound rear bumper and inset rubber step protector.
  const rearStations=[
    [-.961,2.045,.535,.766],[-.957,2.204,.518,.765],[-.909,2.320,.507,.766],
    [-.823,2.387,.489,.757],[-.624,2.409,.486,.744],[-.44,2.426,.480,.733],
    [.44,2.426,.480,.733],[.624,2.409,.486,.744],[.823,2.387,.489,.757],
    [.909,2.320,.507,.766],[.957,2.204,.518,.765],[.961,2.045,.535,.766]
  ];
  const rearRings=rearStations.map(([x,z,bottom,top])=>[
    [x*.983,bottom+.022,z-.063],[x*.995,bottom,z-.032],[x,bottom+.027,z],
    [x,top-.036,z+.006],[x*.998,top-.008,z-.002],[x*.989,top,z-.025],
    [x*.977,top-.008,Math.min(z-.043,2.254)],[x*.974,bottom+.058,Math.min(z-.052,2.218)]
  ]);
  sections(rear,'Warm silver molded rear bumper',rearRings,rearSilver);
  const step=box(rear,'Tailgate sill scuff plate',1.29,.017,.081,0,.741,2.359,rearPad);
  for(let i=0;i<4;i++)box(rear,'Rear step tread ribs',1.25,.005,.005,0,.752,2.332+i*.018,rubber);
  const red=standard(0x991926,.31,.19), rearRed=standard(0xd12730,.27,.15);
  for(const side of [-1,1]){
    const reflect=new T.Group();rear.add(reflect);
    reflect.position.set(side*.746,.602,2.401);reflect.rotation.y=side*.112;
    box(reflect,'Rear reflector gasket',.159,.052,.012,0,0,0,rearPad);
    box(reflect,'Rear bumper reflector',.144,.039,.015,0,0,.004,red);
    box(reflect,'Rear reflector prismatic strip',.132,.010,.004,0,.006,.013,rearRed);
  }
  const taillens=standard(0xffffff,.27,.18,{map:map('ends-taillight.webp')});
  for(const side of [-1,1]){
    function tail(u,v){
      const a=.727-.008*(1-v);
      const topCorner=.026*Math.pow(v,3);
      let x,z;
      if(u<.52){ const f=u/.52;x=a+(.873-a)*f;z=2.345-.015*f; }
      else if(u<.80){
        const ang=(u-.52)/.28*Math.PI/2;
        x=.873+.073*Math.sin(ang);z=2.330-.076*(1-Math.cos(ang));
      }else{ const f=(u-.80)/.2;x=.946;z=2.254-.136*f;}
      x-=topCorner*Math.min(1,u*2);
      const y=.788+.423*v-.010*Math.min(1,u*2)*Math.max(0,2*v-1);
      return [side*x,y,z-topCorner*Math.min(1,u*2)+.003*Math.sin(v*Math.PI)];
    }
    patch(rear,'Wraparound amber, clear and red rear lens',tail,taillens,45,19,side<0);
    const lip=perimeter(tail,32,14);
    patch(rear,'Rear lamp sidewall',(u,v)=>{
      const p=lip[Math.round(u*lip.length)%lip.length];
      return [p[0]*(1-.079*v),p[1],p[2]-.061*v];
    },rearPad,lip.length,1);
    tube(rear,'Tail lamp rubber seal',perimeter(tail,38,8),.0065,black,true,true,128);
  }
  toyota(rear,0,1.285,2.340,.106);
  function badge(file,x,y,z,w,h,name) {
    const m=standard(0xffffff,.42,.17,{map:map(file),transparent:true,alphaTest:.18,depthWrite:false});
    const b=add(rear,new T.PlaneGeometry(w,h),m,name);b.position.set(x,y,z);
  }
  badge('ends-v8.png',-.573,1.163,2.341,.094,.038,'V8 chrome tailgate badge');
  badge('ends-nameplate.png',-.079,1.169,2.344,.405,.030,'Trim and Land Cruiser badges');
  box(rear,'Recessed rear registration surround',.443,.252,.013,-.504,.991,2.326,body);
  plate(rear,'Two-line rear Kenyan registration',-.505,.992,2.344,.282,.242,'ends-plate-rear.webp');
  // A hinged carrier stands off the split tailgate. Its tucked-in tubes and
  // hinge barrels can be inspected in profile, including the rear-facing bolts.
  for(const y of [.812,1.280]){
    box(rear,'Carrier hinge mounting flange',.115,.071,.068,.878,y,2.304,steel);
    const hinge=add(rear,new T.CylinderGeometry(.030,.030,.109,22),steel,'Swing-away hinge pin');
    hinge.position.set(.888,y,2.356);
    tube(rear,'Carrier pivot strap',[[.887,y,2.355],[.839,y,2.389],[.681,y,2.403]],.022,black,false,true,22);
  }
  tube(rear,'Swing-away spare wheel yoke',[[.865,.814,2.355],[.707,.802,2.394],[.352,.811,2.415],[.152,.879,2.425],
    [.132,1.133,2.425],[.187,1.279,2.427],[.435,1.327,2.420],[.668,1.291,2.408],[.858,1.276,2.373]],.021,black,false,true,96);
  const hub=add(rear,new T.CylinderGeometry(.121,.103,.12,32),steel,'Spare mount flange');
  hub.rotation.x=Math.PI/2;hub.position.set(.455,1.020,2.407);
  const cx=.455,cy=1.026;
  const spareProfile=[
    [.001,2.397],[.311,2.399],[.352,2.410],[.377,2.434],[.392,2.477],
    [.395,2.533],[.393,2.585],[.389,2.628],[.373,2.654],[.348,2.659]
  ];
  const sideMap=(u,v)=>{
    const t=v*(spareProfile.length-1),i=Math.min(spareProfile.length-2,Math.floor(t)),f=t-i;
    const [r0,z0]=spareProfile[i],[r1,z1]=spareProfile[i+1];
    const a=u*2*Math.PI;
    const wrinkle=(.0010*Math.cos(7*a+.35)+.0016*Math.cos(17*a+.9)+.0009*Math.cos(23*a-.27))*Math.sin(v*Math.PI);
    const r=r0*(1-f)+r1*f+wrinkle;
    return [cx+r*Math.cos(a),cy+r*Math.sin(a),z0*(1-f)+z1*f];
  };
  patch(rear,'Fitted black vinyl spare wheel cover',sideMap,leather,104,25);
  // UVs follow the reconstructed frontal photograph on a slightly domed cover.
  const coverInk=standard(0xffffff,.73,.06,{map:map('ends-spare.webp')});
  const coverGeo=new T.BufferGeometry(),coverPos=[],coverUv=[],coverIdx=[];
  const n=96,levels=14,faceR=.373;
  for(let j=0;j<=levels;j++)for(let i=0;i<=n;i++){
    const t=j/levels,a=i/n*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
    coverPos.push(cx+faceR*t*c,cy+faceR*t*s,2.656+.018*(1-t*t)+.0015*Math.sin(10*a)*Math.pow(t,5));
    coverUv.push(.5+.5*t*c,.5+.5*t*s);
    if(j<levels&&i<n){
      const k=j*(n+1)+i;coverIdx.push(k,k+n+1,k+n+2,k,k+n+2,k+1);
    }
  }
  coverGeo.setAttribute('position',new T.Float32BufferAttribute(coverPos,3));
  coverGeo.setAttribute('uv',new T.Float32BufferAttribute(coverUv,2));
  coverGeo.setIndex(coverIdx);coverGeo.computeVertexNormals();
  add(rear,coverGeo,coverInk,'Blackhawk printed spare cover');
  ellipseRing(rear,'Piped vinyl seam',cx,cy,2.653,.374,.374,.0037,rubber);
  ellipseRing(rear,'Gathered rear elastic hem',cx,cy,2.427,.372,.372,.0045,rubber);
  for(let i=0;i<18;i++){
    const a=i*2*Math.PI/18+.013*Math.sin(i*8);
    const pts=curvePoints(14,t=>{
      const v=.35+t*.49,ang=a+.032*Math.sin(t*2.1+i*.4);
      const p=sideMap(ang/(Math.PI*2),v);p[0]+=.0009*Math.cos(ang);p[1]+=.0009*Math.sin(ang);return p;
    });
    tube(rear,'Tailored vinyl side pleat',pts,.0012,rubber,false,true,18);
  }
  return ends;
}
