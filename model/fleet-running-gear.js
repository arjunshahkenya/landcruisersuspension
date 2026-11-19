// Dimensions are metres. X spans the track, Y is up, +Z is the nose. The
// physics supplies axle heights and the sprung body pose; all hardpoints
// below are illustrative suspension packaging, not factory pickup geometry.
const TAU = 2 * Math.PI;

function workshop(T) {
  const v = (x, y, z) => new T.Vector3(x, y, z);
  const up = v(0, 1, 0), identity = new T.Quaternion(), unit = v(1, 1, 1);
  const boxGeo = new T.BoxGeometry(1, 1, 1), tubes = new Map();
  const material = (name, color, metalness, roughness) =>
    Object.assign(new T.MeshStandardMaterial({color, metalness, roughness}), {name});
  const paint = {
    tire:material('Carbon black sidewall', 0x272729,.03,.82), tread:material('Tread faces',0x323230,.03,.89),
    dark:material('Graphite wheel wells and seals',0x222625,.1,.77),
    frame:material('E-coated structural steel',0x414849,.58,.48),
    iron:material('Cast iron housings',0x53575a,.6,.66), 
    arm:material('Cast suspension alloy',0x959c99,.67,.40), steel:material('Machined steel',0xb7c2bf,.77,.27),
    disc:material('Brake rotor swept surface',0x89918f,.78,.32),
    alloy:material('Porsche satin alloy',0xa1a6a6,.78,.30), rim:material('Competition wheel',0x787d7a,.71,.43),
    wheelDark:material('Wheel barrel and pockets',0x373e40,.65,.5),
    exhaust:material('Exposed exhaust stainless',0x827d71,.73,.52),
    truckSpring:material('Powder-coated competition spring',0x65aac7,.29,.38),
    leafSteel:material('Tempered leaf spring steel',0x78919e,.42,.48),
    coil:material('Blue inspection finish on coil springs',0x429fb2,.30,.34),
    damper:material('Anodised damper cylinder',0xe0a34b,.41,.36),
    red:material('Dust cap',0x9a4537,.3,.54)
  };
  function group(name, parent) {
    const g = new T.Group(); g.name=name; parent?.add(g); return g;
  }
  function mesh(parent, name, geom, mat) {
    const m = new T.Mesh(geom,mat); m.name=name; m.castShadow=true; m.receiveShadow=true; parent.add(m); return m;
  }
  // Batch geometry only within a rigid assembly. Rotors, calipers, carriers,
  // links and telescopic struts must keep separate transforms at runtime.
  function builder(parent, name) {
    const buckets = new Map(), normalMatrix = new T.Matrix3(), p=v(0,0,0), n=p.clone();
    function part(geom, mat, position, rotation=identity, scale=unit) {
      const matrix=new T.Matrix4().compose(position,rotation,scale);
      normalMatrix.getNormalMatrix(matrix);
      let buf=buckets.get(mat);
      if (!buf) { buf={pos:[],norm:[],idx:[]}; buckets.set(mat,buf); }
      const pos=geom.getAttribute('position'), norm=geom.getAttribute('normal'), index=geom.index;
      const offset=buf.pos.length/3;
      for(let i=0;i<pos.count;i++) {
        p.fromBufferAttribute(pos,i).applyMatrix4(matrix); n.fromBufferAttribute(norm,i).applyNormalMatrix(normalMatrix);
        buf.pos.push(p.x,p.y,p.z); buf.norm.push(n.x,n.y,n.z);
      }
      for(let i=0;i<(index?.count ?? pos.count);i++) buf.idx.push(offset+(index?index.getX(i):i));
    }
    function box(center, size, mat, quaternion=identity) { part(boxGeo,mat,center,quaternion,size); }
    function axis(a,b) { return new T.Quaternion().setFromUnitVectors(up,b.clone().sub(a).normalize()); }
    function cylinderGeo(sides) {
      if(!tubes.has(sides)) tubes.set(sides,new T.CylinderGeometry(1,1,1,sides));
      return tubes.get(sides);
    }
    function rod(a,b,r,mat,sides=8) {
      part(cylinderGeo(sides),mat,a.clone().lerp(b,.5),axis(a,b),v(r,a.distanceTo(b),r));
    }
    function bar(a,b,width,depth,mat) {
      box(a.clone().lerp(b,.5),v(width,a.distanceTo(b),depth),mat,axis(a,b));
    }
    function finish() {
      for (const [mat,b] of buckets) {
        const g=new T.BufferGeometry();
        g.setAttribute('position',new T.Float32BufferAttribute(b.pos,3));
        g.setAttribute('normal',new T.Float32BufferAttribute(b.norm,3)); g.setIndex(b.idx);
        g.computeBoundingSphere(); mesh(parent,name+' · '+mat.name,g,mat);
      }
      buckets.clear();
    }
    return {part,box,bar,rod,finish,cylinderGeo};
  }
  return {v,up,paint,group,mesh,builder};
}

// Revolved section around X. In profile order, sidewall runs inward -> out
// across the crown so its radial face points out; inner aperture stays open.
function revolved(T, profile, n) {
  const pos=[],idx=[];
  for(const [x,r] of profile) {
    for(let i=0;i<n;i++){const a=i/n*TAU;pos.push(x,r*Math.cos(a),r*Math.sin(a));}
  }
  for(let j=0;j<profile.length-1;j++) for(let i=0;i<n;i++) {
    const a=j*n+i,b=j*n+(i+1)%n,c=a+n,d=b+n;idx.push(a,b,c,b,d,c);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}

function wheelParts(T, w, car, front, radius, width, parent) {
  const {v,group,paint:p,builder}=w, h=width*.5, origin=v(0,0,0);
  const truck=car==='dakar', rally=car==='rally';
  const rim=truck?.254:rally?.1905:front?.2413:.254;
  const outerRim=rim+.009, steps=truck?40:48;
  const wheel=group('Tire and road wheel',parent), b=builder(wheel,'Wheel');
  const section=[[-h*.82,rim],[-h*.98,rim+(radius-rim)*.30],[-h,radius*.9],[-h*.92,radius*.973],[-h*.77,radius]];
  if(!rally&&!truck) for(const groove of [-.5,-.19,.17,.48]) {
    const x=groove*h;section.push([x-.006,radius],[x-.003,radius-.006],[x+.003,radius-.006],[x+.006,radius]);
  }
  section.push([h*.77,radius],[h*.92,radius*.973],[h,radius*.90],[h*.99,rim+(radius-rim)*.30],[h*.82,rim]);
  const treadH=truck?.017:rally?.009:0;
  const casing = section.map(([x,r])=>[x,r>outerRim ? r-treadH*Math.max(0,(r-radius*.82)/(radius*.18)):r]);
  b.part(revolved(T,casing,steps),p.tire,origin);
  // Raised mould line around the bead and around the shoulder on the outside.
  const bead=rim+(radius-rim)*.28;
  b.part(revolved(T,[[h*.987,bead+.004],[h*1.006,bead+.003],[h*1.006,bead-.002],[h*.986,bead-.003]],steps),p.tread,origin);
  const lip=h*.90;
  b.part(revolved(T,[[-lip,outerRim],[-lip+.007,outerRim+.001],[lip-.012,outerRim+.001],[lip+.002,outerRim],[lip+.004,rim-.004],[lip-.004,rim-.012],[lip-.018,rim-.012]],steps),truck?p.rim:p.alloy,origin);
  b.part(revolved(T,[[lip-.018,rim-.012],[-lip+.015,rim-.013],[-lip,rim-.001]],steps),p.wheelDark,origin);
  if(treadH) {
    // Chevron shoulder blocks follow the tyre crown; opposing halves have
    // stagger and handedness, as on open gravel and XZL-pattern treads.
    const count=truck?27:36;
    for(let i=0;i<count;i++) for(const side of [-1,1]) {
      const a=TAU*(i+(side>0?.34:0))/count, base=new T.Quaternion().setFromAxisAngle(v(1,0,0),a);
      const skew=new T.Quaternion().setFromAxisAngle(v(0,1,0),side*.45);
      b.box(v(side*h*.50,(radius-treadH*.65)*Math.cos(a),(radius-treadH*.65)*Math.sin(a)),
        v(width*.49,treadH*1.18,radius*TAU/count*.45),p.tread,base.multiply(skew));
    }
  }
  const faceX=lip*.82;
  const spokes=truck?10:rally?15:5;
  for(let i=0;i<spokes;i++) {
    const a=TAU*(i+.1)/spokes, radial=(x,r,ang=a)=>v(x,r*Math.cos(ang),r*Math.sin(ang));
    if(!truck&&!rally) {
      // Five split spokes, recessed at the hub and sweeping out to the lip.
      b.bar(radial(faceX-.038,rim*.25),radial(faceX-.016,rim*.57),.028,.038,p.alloy);
      for(const s of [-1,1]) b.bar(radial(faceX-.017,rim*.54),radial(faceX+.004,rim*.966,a+s*.125),.025,.025,p.alloy);
    } else {
      b.bar(radial(faceX-(truck?.065:.037),rim*(truck?.40:.23)),radial(faceX,rim*.966,a+(truck?.0:.075)),
        truck?.072:.018,truck?.044:.020,truck?p.rim:p.alloy);
    }
  }
  const hubX=faceX-(truck?.061:.035), hubR=rim*(truck?.48:.27);
  b.rod(v(hubX-.023,0,0),v(hubX+.014,0,0),hubR,truck?p.rim:p.alloy,24);
  b.rod(v(hubX+.014,0,0),v(hubX+(truck?.089:.027),0,0),hubR*(truck?.55:.39),truck?p.iron:p.wheelDark,16);
  for(let i=0;i<(truck?10:5);i++) {
    const a=i/(truck?10:5)*TAU, y=Math.cos(a)*hubR*.79,z=Math.sin(a)*hubR*.79;
    b.rod(v(hubX+.013,y,z),v(hubX+.013+(truck?.025:.009),y,z),truck?.012:.009,truck?p.steel:p.wheelDark,6);
  }
  b.finish();
  return wheel;
}

// A helix whose endpoints are on local Y=0 and 1. Y is scaled between two
// physical spring seats on each update. The radius and wire gauge retain
// their size in the radial plane even under deep jounce.
function springGeometry(T,r,wire,turns,referenceLength) {
  const pos=[],nor=[],idx=[], seg=Math.ceil(turns*11), sides=5;
  for(let i=0;i<=seg;i++) {
    const u=i/seg,a=u*turns*TAU, axial=referenceLength/(turns*TAU*r);
    const ny=1/Math.hypot(1,axial);
    for(let j=0;j<sides;j++){
      const t=TAU*j/sides, c=Math.cos(t),s=Math.sin(t);
      const nx=Math.cos(a)*c+Math.sin(a)*s*axial*ny;
      const nz=Math.sin(a)*c-Math.cos(a)*s*axial*ny;
      pos.push(r*Math.cos(a)+wire*nx,u+wire*s*ny/referenceLength,r*Math.sin(a)+wire*nz);
      nor.push(nx,s*ny*referenceLength,nz);
    }
  }
  for(let i=0;i<seg;i++) for(let j=0;j<sides;j++) {
    const a=i*sides+j,b=i*sides+(j+1)%sides;idx.push(a,b,a+sides,b,b+sides,a+sides);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));g.setIndex(idx);return g;
}

export function buildFleetRig(T,spec) {
  const car=spec.id, porsche=car==='porsche', rally=car==='rally', truck=car==='dakar';
  if(!porsche&&!rally&&!truck) throw new Error('Unknown fleet running gear: '+car);
  const geom=spec.geometry, w=workshop(T), {v,up,paint:p,group,mesh,builder}=w;
  const root=group('Running gear · '+car), chassis=group('Sprung chassis',root);
  const gear=group('Suspension, axles and wheels',root), wheelGroups=group('Road wheels and brakes',gear);
  const mountList=[], wheels=[], links=[], struts=[], leaves=[], solidAxles=[];
  const wheelbase=geom.wheelbase, zF=geom.frontAxleZ??wheelbase*.5,zR=geom.rearAxleZ??-wheelbase*.5;
  const bodyPivot=geom.cgHeight, frameY=truck?.95:rally?.35:.26;
  const unitRod=new T.CylinderGeometry(1,1,1,8), unitBar=new T.BoxGeometry(1,1,1);
  const origin=v(0,0,0), unitDir=v(0,0,0);
  const staticParts=builder(chassis,'Chassis hardware'), removable=group('Undertray',chassis);
  const skins=builder(removable,'Floor panels');
  const bodyAnchor=pt=>({host:chassis,pt}), localAnchor=(host,pt)=>({host,pt});
  const armTip=v(0,0,0);
  function endpoint(anchor,result) {
    if(anchor.inboard){
      result.copy(anchor.inboard.pt).applyMatrix4(anchor.inboard.host.matrix);
      armTip.copy(anchor.outboard.pt).applyMatrix4(anchor.outboard.host.matrix);
      return result.lerp(armTip,anchor.fraction);
    }
    return result.copy(anchor.pt).applyMatrix4(anchor.host.matrix);
  }
  function poseRod(m,a,b,sx,sz) {
    unitDir.copy(b).sub(a);const len=unitDir.length();
    if(len<.00001){m.scale.y=.00001;return;}
    m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(up,unitDir.multiplyScalar(1/len));m.scale.set(sx,len,sz);
  }
  function link(name,from,to,r,mat=p.arm,sizeZ=0) {
    const rod=mesh(gear,name,sizeZ?unitBar:unitRod,mat);
    links.push({rod,from,to,r,sizeZ:sizeZ||r});
  }
  function coilover(name,from,to,kind) {
    // Sleeve bolts to the upright; polished rod and upper eye attach to body.
    const truckDamper=kind==='truck', radius=truckDamper?.032:rally?.025:.022;
    const springR=truckDamper?.070:rally?.054:.057;
    const lower=group(name+' lower sleeve',gear), hardware=builder(lower,name+' lower hardware');
    const installed=endpoint(from,v(0,0,0)).distanceTo(endpoint(to,v(0,0,0)));
    const sleeve=installed*(truckDamper?.53:.55);
    hardware.rod(origin,v(0,sleeve,0),radius,p.damper,12);
    hardware.rod(v(0,sleeve*.08,0),v(0,sleeve*.15,0),radius*1.38,p.dark,12);
    hardware.rod(v(0,sleeve-.015,0),v(0,sleeve+.005,0),radius*1.16,p.steel,12);
    if(truckDamper||rally){
      hardware.rod(v(radius*1.68,sleeve*.18,0),v(radius*1.68,sleeve*.82,0),radius*.66,p.frame,8);
      hardware.bar(v(0,sleeve*.36,0),v(radius*1.68,sleeve*.36,0),.015,.019,p.steel);
    }
    const seatOffset=sleeve*(truckDamper?.39:.44);
    hardware.rod(v(0,seatOffset-.008,0),v(0,seatOffset+.008,0),springR*1.15,p.iron,14);
    hardware.rod(v(-radius*1.65,0,0),v(radius*1.65,0,0),radius*.85,p.iron,10);
    hardware.finish();
    const upper=group(name+' upper mounting cup',gear), top=builder(upper,name+' cap');
    const upperSeat=truckDamper?.055:.032;
    top.rod(v(0,-upperSeat-.006,0),v(0,-upperSeat+.009,0),springR*1.12,p.frame,12);
    top.rod(v(0,-upperSeat,0),v(0,-.001,0),radius*1.15,p.dark,10);
    top.finish();
    const spring=mesh(gear,name+' live coil',springGeometry(T,springR,truckDamper?.009:rally?.008:.0075,
      truckDamper?5.15:rally?5.6:5.25,Math.max(.1,installed-seatOffset-upperSeat)),truckDamper?p.truckSpring:p.coil);
    const piston=mesh(gear,name+' polished piston',unitRod,p.steel);
    struts.push({from,to,sleeve,lower,upper,seatOffset,upperSeat,spring,piston,radius:radius*.44});
  }
  // Form the cast engine and transmission cases as a series of chamfered
  // sections, with belly, lid and bellhousing at distinct widths.
  function casting(center,size,mat,shape) {
    const pos=[],idx=[], cross=[[-.68,-1],[.68,-1],[1,-.53],[.90,.74],[.62,1],[-.62,1],[-.90,.74],[-1,-.53]];
    for(const [z,width,height,lift] of shape) for(const [x,y] of cross)
      pos.push(x*.5*size.x*width,y*.5*size.y*height+lift*size.y,z*size.z);
    for(let j=0;j<shape.length-1;j++)for(let i=0;i<8;i++){
      let a=8*j+i,b=8*j+(i+1)%8;idx.push(a,b,a+8,b,b+8,a+8);
    }
    const back=(shape.length-1)*8;
    for(let i=1;i<7;i++){idx.push(0,i+1,i,back,back+i,back+i+1);}
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();
    staticParts.part(g,mat,center);
  }
  const engineShape=[[-.5,.74,.78,-.04],[-.42,1,1,0],[.38,1,1,0],[.50,.81,.79,-.04]];
  const transShape=[[-.5,.63,.66,.03],[-.34,.70,.86,0],[-.18,.79,.94,0],[.30,1,1,0],[.37,1.06,1.04,.01],[.50,.90,.94,.01]];
  const railX=truck?.46:rally?.43:.46;
  for(const s of [-1,1]) {
    if(truck) {
      staticParts.box(v(s*railX,frameY,(zF+zR)*.5),v(.088,.22,wheelbase+1.22),p.frame);
      for(const h of [-.112,.112]) staticParts.box(v(s*(railX+.009),frameY+h,0),v(.112,.022,wheelbase+1.22),p.iron);
    } else {
      // Wide 911 sills and underseat stamping, or the triangulated welded
      // lower spaceframe of the Rally1. Each connects to its own subframes.
      const sillX=porsche?.715:.691, sillY=frameY+.035;
      const fore=zF-.40,aft=zR+.40;
      const shape=[[aft,.35,.46,-.14],[aft+.19,.88,.84,0],[-.37,1,1,0],[.48,1,1,0],[fore-.14,.91,.84,0],[fore,.48,.62,-.12]];
      if(porsche) {
        casting(v(s*sillX,sillY,0),v(.14,.12,1),p.frame,shape);
        casting(v(s*.349,sillY-.004,-.04),v(.58,.045,1),p.iron,shape);
        for(const dz of [-.39,-.19,.16,.39])staticParts.box(v(s*.346,sillY+.021,dz),v(.47,.011,.018),p.frame);
        staticParts.bar(v(s*.13,sillY+.020,aft+.09),v(s*.63,sillY+.023,fore-.10),.04,.012,p.arm);
      } else {
        staticParts.rod(v(s*sillX,sillY,aft),v(s*sillX,sillY,fore),.030,p.frame,9);
        staticParts.rod(v(s*sillX,sillY,aft),v(s*.13,sillY,0),.022,p.frame);
        staticParts.rod(v(s*.13,sillY,0),v(s*sillX,sillY,fore),.022,p.frame);
        for(const zz of [aft,fore]) staticParts.rod(v(s*sillX,sillY,zz),v(s*.56,sillY+.20,zz),.024,p.frame);
      }
      for(const [end,axleZ] of [[fore,zF],[aft,zR]]){
        staticParts.bar(v(s*sillX,sillY,end),v(s*railX,frameY,axleZ),.060,.062,p.frame);
        staticParts.bar(v(s*railX,frameY,end),v(s*railX,frameY,axleZ),.055,.060,p.frame);
      }
    }
  }
  for(const z of truck?[zR-.11,zR+.33,0,zF-.33,zF+.13]:[zR+.18,zR+.46,zF-.44,zF+.13])
    staticParts.box(v(0,frameY+.015,z),v(2*railX+.07,truck?.13:.055,truck?.13:.072),p.frame);
  if(!truck) {
    const underY=rally?.246:.142;
    for(const [a,b] of [[zR+.28,-.04],[.04,zF-.27]]) {
      skins.box(v(0,underY,(a+b)*.5),v(rally?1.24:1.4,.024,b-a),rally?p.arm:p.dark);
      for(const sx of [-.48,.48]) for(const z of [a+.12,b-.12])
        skins.rod(v(sx,underY-.019,z),v(sx,underY-.014,z),.012,p.steel,6);
    }
  }
  function gearbox(x,y,z,size) {
    casting(v(x,y,z),size,p.iron,transShape);
    for(let i=-2;i<=2;i++){
      const scale=.78+i*.04;
      staticParts.box(v(x,y-size.y*.39,z+size.z*i*.14),v(size.x*scale,.031,.016),p.arm);
    }
  }
  if(porsche) {
    // Rear flat-six: the opposed banks sit either side of the crankcase;
    // pairs of rising intake plenums and three primaries identify each bank.
    casting(v(0,.349,zR-.20),v(.38,.295,.48),p.iron,engineShape);
    gearbox(0,.318,zR+.27,v(.38,.26,.59));
    for(const s of [-1,1]){
      casting(v(s*.298,.362,zR-.20),v(.32,.215,.48),p.arm,engineShape);
      casting(v(s*.410,.369,zR-.20),v(.115,.171,.42),p.iron,engineShape);
      for(const d of [-.13,0,.13]){
        staticParts.rod(v(s*.29,.45,zR-.20+d),v(s*.18,.532,zR-.2+d),.040,p.dark,10);
        staticParts.rod(v(s*.38,.300,zR-.2+d),v(s*.47,.191,zR-.16+d),.031,p.exhaust,8);
        staticParts.rod(v(s*.47,.191,zR-.16+d),v(s*.43,.202,zR-.48),.028,p.exhaust,8);
      }
      staticParts.rod(v(s*.17,.532,zR-.39),v(s*.17,.532,zR+.002),.061,p.dark,12);
      staticParts.rod(v(s*.47,.205,zR-.22),v(s*.47,.21,zR-.56),.042,p.exhaust);
      casting(v(s*.32,.236,zR-.54),v(.37,.15,.23),p.exhaust,engineShape);
      staticParts.rod(v(s*.37,.223,zR-.58),v(s*.37,.228,zR-.70),.048,p.exhaust,12);
    }
  } else if(rally) {
    casting(v(.080,.477,zF-.04),v(.55,.32,.34),p.iron,engineShape);
    gearbox(-.285,.395,zF-.065,v(.285,.27,.33));gearbox(0,.36,zR,v(.29,.22,.27));
    casting(v(.093,.638,zF-.052),v(.49,.077,.245),p.frame,engineShape);
    for(const x of [-.096,.015,.126,.237]){
      staticParts.rod(v(x,.645,zF-.11),v(x,.662,zF-.11),.023,p.dark,8);
      staticParts.rod(v(x,.51,zF-.17),v(x,.445,zF-.25),.031,p.exhaust,9);
    }
    staticParts.rod(v(-.17,.47,zF+.13),v(.30,.47,zF+.13),.053,p.iron);
    staticParts.rod(v(0,.35,zF-.18),v(0,.35,zR+.13),.033,p.frame);
    staticParts.rod(v(.28,.31,zF-.22),v(.29,.28,zR-.42),.041,p.exhaust);
    skins.box(v(0,.259,zF+.13),v(.9,.042,.54),p.arm);
  } else {
    casting(v(0,1.335,zF-.55),v(.70,.65,1.10),p.iron,engineShape);
    gearbox(0,1.08,zF-1.34,v(.54,.47,.66));gearbox(0,.94,.11,v(.55,.43,.46));
    for(let i=0;i<6;i++){
      const dz=-.93+i*.152;
      casting(v(0,1.659,zF+dz),v(.51,.104,.139),p.frame,engineShape);
      staticParts.rod(v(.31,1.43,zF+dz),v(.41,1.345,zF+dz-.053),.043,p.exhaust);
      staticParts.rod(v(-.28,1.50,zF+dz-.05),v(-.35,1.59,zF+dz),.043,p.arm);
    }
    staticParts.rod(v(-.35,1.59,zF-.99),v(-.35,1.59,zF-.03),.073,p.iron,12);
    staticParts.rod(v(.41,1.345,zF-.99),v(.41,1.345,zF-.15),.065,p.exhaust,12);
    casting(v(0,.996,zF-.56),v(.57,.17,.81),p.frame,engineShape);
    for(const s of [-1,1]) {
      casting(v(s*.79,1.03,-.54),v(.46,.45,1.32),s<0?p.arm:p.frame,engineShape);
      for(const z of [-.93,-.20]){
        staticParts.box(v(s*.80, .80,z),v(.42,.034,.057),p.frame);
        staticParts.box(v(s*1.010,1.023,z),v(.024,.40,.049),p.frame);
        staticParts.box(v(s*.805,1.255,z),v(.414,.026,.049),p.frame);
      }
      staticParts.rod(v(s*.765,1.246,-.68),v(s*.765,1.29,-.68),.046,p.iron,12);
    }
    for(const dx of [-.16,.16])staticParts.rod(v(dx,.99,-1.79),v(dx,.99,-1.15),.12,p.iron,12);
    staticParts.rod(v(.36,.94,zF-.52),v(.43,.91,zR-.50),.078,p.exhaust);
  }
  for (const front of [true,false]) {
    const z=front?zF:zR,R=front?geom.frontWheelRadius:geom.rearWheelRadius;
    const W=front?geom.frontTireWidth:geom.rearTireWidth,track=front?geom.frontTrack:geom.rearTrack;
    const inner=track/2-W*.69, axleName=front?'Front':'Rear';
    let axle=null;
    if(truck) {
      axle=group(axleName+' SISU live axle',gear);axle.position.set(0,R,z);axle.updateMatrix();solidAxles.push({front,axle,R,z});
      const b=builder(axle,axleName+' beam');
      b.rod(v(-inner,0,0),v(inner,0,0),.105,p.iron,12);
      const ellipsoid=new T.SphereGeometry(1,16,10), differentialX=front?.19:-.12;
      b.part(ellipsoid,p.iron,v(differentialX,0,0),undefined,v(.245,.227,.18));
      b.rod(v(differentialX,0,front?-.13:.13),v(differentialX,0,front?-.26:.26),.105,p.frame,10);
      for(const sign of [-1,1]){
        b.box(v(sign*railX,.135,0),v(.19,.09,.23),p.frame);
        for(const dz of [-.085,.085]) for(const dx of [-.060,.060])
          b.rod(v(sign*railX+dx,-.112,dz),v(sign*railX+dx,.19,dz),.013,p.steel,6);
      }
      b.finish();
      link(axleName+' propeller shaft',localAnchor(axle,v(differentialX,0,front?-.22:.22)),
        bodyAnchor(v(0,.94,front?.31:-.13)),.054,p.frame);
    }
    for(const side of [-1,1]){
      const X=track/2*side, corner=axleName+(side<0?' left':' right');
      const carrier=group(corner+' carrier',wheelGroups);
      carrier.position.set(X,R,z);carrier.updateMatrix();
      const outward=group(corner+' outboard axis',carrier);
      outward.rotation.y=side<0?Math.PI:0;
      const spin=group(corner+' wheel rotation',outward);
      const roadWheel=wheelParts(T,w,car,front,R,W,spin);
      roadWheel.traverse(part=>{
        if(part.material!==p.tire && part.material!==p.tread)return;
        part.userData.fleetTire={front,side,radius:R,axleZ:z};
      });
      const discR=truck?.192:rally?.15:front?.165:.165, discX=-W*.19;
      const rotorSet=builder(spin,corner+' spinning brakes');
      rotorSet.part(revolved(T,[[discX-.011,discR*.48],[discX-.011,discR],[discX+.011,discR],[discX+.011,discR*.48]],36),p.disc,origin);
      rotorSet.rod(v(discX-.048,0,0),v(discX+.025,0,0),discR*.49,p.iron,20);
      rotorSet.finish();
      const carriers=builder(outward,corner+' upright and fixed brake');
      carriers.box(v(discX,discR*.15,-discR*.82),v(truck?.088:.063,discR*.75,.053),rally?p.arm:p.frame);
      for(const y of [-.012,.052]) carriers.rod(v(discX+.026,y,-discR*.79),v(discX+.036,y,-discR*.79),.014,p.iron,8);
      carriers.rod(v(-W*.43,-.070,0),v(-W*.47,.075,-.025),truck?.061:.034,p.iron,8);
      carriers.finish();
      wheels.push({front,side,carrier,spin,roadWheel,X,R,z,W,trip:0});
      const mount=(dx,dy,dz)=>localAnchor(carrier,v(dx*side,dy,dz)); // positive dx = outward
      const body=(ax,ay,az)=>bodyAnchor(v(ax*side,ay,z+az));
      if(truck) {
        const nLeaves=front?3:2, halfLength=front?.79:.86, eyeY=frameY-.035;
        const packCenter=localAnchor(axle,v(railX*side,.165,0)),eyeFront=body(railX,eyeY,halfLength);
        const rearHanger=body(railX,eyeY+.075,-halfLength-.038);
        const shackle=mesh(gear,corner+' spring shackle',unitBar,p.arm);
        for(const dz of [-halfLength,halfLength]){
          staticParts.box(v(railX*side,eyeY+.07,z+dz),v(.145,.14,.124),p.frame);
          staticParts.rod(v(railX*side-.09,eyeY+(dz<0?.075:0),z+dz),v(railX*side+.09,eyeY+(dz<0?.075:0),z+dz),.027,p.steel,10);
        }
        const elements=[];
        for(let j=0;j<nLeaves;j++){
          // Each inner leaf is shorter. Segment points follow the main curved
          // leaf at its offset in the laminated pack as the axle rises.
          const fraction=1-j*.205;
          for(let k=0;k<8;k++){
            elements.push({plate:mesh(gear,corner+' leaf '+(j+1),unitBar,j%2?p.arm:p.leafSteel),
              t0:(2*k/8-1)*fraction,t1:(2*(k+1)/8-1)*fraction,layer:j});
          }
        }
        leaves.push({elements,eyeFront,rearHanger,packCenter,shackle,halfLength});
        // Four separate coil-assisted dampers per axle, two adjacent on each
        // side, with opposite longitudinal inclination and independent stems.
        for(const s of [-1,1]){
          const foot=localAnchor(axle,v(side*(inner-.06),.052,s*.115));
          const tower=body(inner-.18,1.42,s*.325);
          staticParts.bar(v(side*(inner-.18),1.42,z+s*.325),v(side*railX,frameY+.04,z+s*.28),.080,.085,p.frame);
          coilover(corner+(s<0?' aft':' forward')+' Donerre damper',foot,tower,'truck');
        }
        if(!front) {
          staticParts.rod(v(side*.25,.965,z+.43),v(side*.51,.965,z+.43),.038,p.frame,8);
          link(corner+' stabilizer droplink',body(.50,.965,.43),localAnchor(axle,v(side*.66,.055,.24)),.022,p.steel);
        }
      } else {
        const mac=front||rally;
        const axleEnd=mount(-W*.45,-.095,.004);
        const armY=R-.093, innerX=porsche?.39:.415;
        for(const dz of [-.15,.15]) {
          const pickup=body(innerX,armY+.035,dz);
          link(corner+' lower control arm',pickup,axleEnd,mac?.022:.024,p.arm);
          staticParts.rod(v(side*innerX,armY+.035,z+dz-.024),v(side*innerX,armY+.035,z+dz+.024),.036,p.dark,8);
        }
        const steerZ=front?-.105:.116;
        link(corner+(front?' steering tie rod':' toe link'),body(.32,R+.016,steerZ*1.2),mount(-W*.53,.014,steerZ),.013,p.steel);
        const upperY=R+(rally?.407:mac?.325:.315);
        const upperX=inner-(rally?.127:.103), upperZ=front?-.066:.041;
        staticParts.rod(v(side*upperX,upperY-.012,z+upperZ),v(side*upperX,upperY+.008,z+upperZ),.074,p.frame,14);
        staticParts.bar(v(side*innerX,frameY+.03,z+.22),v(side*upperX,upperY,z+upperZ),.039,.045,p.frame);
        // On the rear 911 the damper attaches part way along a lower link.
        // Its lower seat follows that link's motion ratio through the stroke.
        const foot=mac?mount(-W*.52,-.010,0):{inboard:body(innerX,armY+.035,.15),outboard:axleEnd,fraction:.74};
        coilover(corner+(mac?' MacPherson strut':' rear coilover'),foot,body(upperX,upperY,upperZ),'car');
        if(!mac){
          // 911 multi-link: upper camber link, a diagonal trailing link and
          // separate toe control supplement the lower transverse links.
          link(corner+' camber link',body(.46,R+.111,.066),mount(-W*.46,.089,-.010),.020,p.arm);
          link(corner+' diagonal trailing link',body(.48,R-.036,.345),mount(-W*.46,-.048,-.033),.023,p.arm);
        }
        if(!porsche||!front){
          link(corner+' CV halfshaft',body(.12,R+.014,.005),mount(-W*.30,.006,0),.021,p.frame);
          const joint=builder(outward,corner+' outer CV boot');
          for(let j=0;j<4;j++){
            const innerEdge=-W*.50-.012*j;
            joint.rod(v(innerEdge,0,0),v(innerEdge-.010,0,0),.038-j*.003,p.dark,10);
          }
          joint.finish();
        }
      }
      mountList.push(carrier);
    }
  }
  skins.finish();staticParts.finish();
  const tempA=v(0,0,0),tempB=v(0,0,0),mid=v(0,0,0),extra=v(0,0,0), leafPos=v(0,0,0);
  const pitchMatrix=new T.Matrix4(),inversePivot=new T.Matrix4(), chassisDelta=new T.Matrix4();
  let cutaway=false, exterior=null;
  function articulate() {
    for(const {rod,from,to,r,sizeZ} of links)
      poseRod(rod,endpoint(from,tempA),endpoint(to,tempB),r,sizeZ);
    for(const st of struts){
      endpoint(st.from,tempA); endpoint(st.to,tempB);
      unitDir.copy(tempB).sub(tempA);const len=Math.max(.0001,unitDir.length());unitDir.divideScalar(len);
      st.lower.position.copy(tempA); st.lower.quaternion.setFromUnitVectors(up,unitDir);
      st.upper.position.copy(tempB); st.upper.quaternion.copy(st.lower.quaternion);
      // Leave a visible piston measured between the sleeve gland and the
      // upper cup; it disappears into the cylinder as the mounts converge.
      const sleeveReach=Math.min(st.sleeve,len-.012);
      mid.copy(tempA).addScaledVector(unitDir,Math.max(.001,sleeveReach));
      extra.copy(tempB).addScaledVector(unitDir,-.009);
      poseRod(st.piston,mid,extra,st.radius,st.radius);
      st.spring.position.copy(tempA).addScaledVector(unitDir,st.seatOffset);
      st.spring.quaternion.copy(st.lower.quaternion);
      st.spring.scale.y=Math.max(.010,len-st.seatOffset-st.upperSeat);
    }
    for(const pack of leaves){
      const center=endpoint(pack.packCenter,mid),frontEye=endpoint(pack.eyeFront,tempA),hanger=endpoint(pack.rearHanger,tempB);
      // The rear spring eye swings from a shackle so the pack can extend
      // longitudinally as the axle flattens the initial bow.
      const ang=Math.max(-.40,Math.min(.7,.38+1.8*(center.y-(frontEye.y-.12))));
      extra.set(hanger.x,hanger.y-.086*Math.cos(ang),hanger.z-.086*Math.sin(ang));
      poseRod(pack.shackle,hanger,extra,.080,.035);
      const point=(t,layer,out)=>{
        const end=t>0?frontEye:extra,at=Math.abs(t),b=at*at;
        out.set(center.x+(end.x-center.x)*at,center.y+(end.y-center.y)*b-layer*.015,center.z+(end.z-center.z)*at);
        return out;
      };
      for(const leaf of pack.elements){
        point(leaf.t0,leaf.layer,leafPos);point(leaf.t1,leaf.layer,unitDir);
        // poseRod uses unitDir as scratch. Save this endpoint before calling it.
        const x=unitDir.x,y=unitDir.y,z=unitDir.z;unitDir.set(x-leafPos.x,y-leafPos.y,z-leafPos.z);
        const len=unitDir.length();leaf.plate.quaternion.setFromUnitVectors(up,unitDir.multiplyScalar(1/len));
        leaf.plate.position.set((x+leafPos.x)*.5,(y+leafPos.y)*.5,(z+leafPos.z)*.5);
        leaf.plate.scale.set(.109,len+.002,.014);
      }
    }
  }
  function update(sample,run) {
    const gf=run.geometry, frontSag=run.static.nominalFrontTireDeflection, rearSag=run.static.nominalRearTireDeflection;
    const referenceSag=(gf.rearArm*frontSag+gf.frontArm*rearSag)/wheelbase;
    const cgZ=zF-gf.frontArm;
    inversePivot.makeTranslation(0,-bodyPivot,-cgZ);
    pitchMatrix.makeRotationX(-sample.pitch);
    chassisDelta.makeTranslation(0,bodyPivot-referenceSag+sample.body,cgZ).multiply(pitchMatrix).multiply(inversePivot);
    chassisDelta.decompose(chassis.position,chassis.quaternion,chassis.scale);
    chassis.updateMatrix();
    const frontOffset=sample.frontWheel-frontSag,rearOffset=sample.rearWheel-rearSag;
    for(const a of solidAxles){
      a.axle.position.set(0,a.R+(a.front?frontOffset:rearOffset),a.z);a.axle.updateMatrix();
    }
    for(const wheel of wheels){
      const dy=wheel.front?frontOffset:rearOffset;
      tempA.set(wheel.X,wheel.R,wheel.z).applyMatrix4(chassis.matrix);
      const jounce=wheel.R+dy-tempA.y;
      const gain=porsche&&!wheel.front ? .63 : .43;
      const camber=truck?0:Math.max(-.09,Math.min(.09,jounce*gain));
      const lateral=truck?0:Math.max(-.021,Math.min(.004,-jounce*jounce*.91+jounce*.038));
      wheel.carrier.position.set(wheel.X+wheel.side*lateral,wheel.R+dy,wheel.z);
      wheel.carrier.rotation.z=wheel.side*camber;wheel.carrier.updateMatrix();
      wheel.trip=(sample.x-run.startX)/wheel.R;
      wheel.spin.rotation.x=wheel.side*(wheel.trip%TAU);
    }
    articulate();
  }
  function setCutaway(enabled) {
    cutaway=!!enabled;
    if(exterior) exterior.visible=!cutaway;
    removable.visible=!cutaway;
    for(const wh of wheels) wh.roadWheel.visible=!(cutaway&&wh.side<0);
  }
  function setExterior(object) {
    if(exterior && exterior!==object) chassis.remove(exterior);
    exterior=object;
    if(object){chassis.add(object);object.visible=!cutaway;}
  }
  articulate();setCutaway(false);
  return {group:root,chassis,mounts:mountList,wheels,update,setExterior,setCutaway};
}
