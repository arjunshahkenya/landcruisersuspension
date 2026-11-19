import { applySideSurface } from './surfaces.js';

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
  const rearSilver = standard(0x9d9990,.42,.43);
  const rearPad = standard(0x424344,.69,.14);
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
  const mix=T.MathUtils.lerp;
  // Cross-car recession of the hood edge, measured from center to the rolled
  // upper corner of the fender. All of the optical parts share this datum.
  const noseStations=[[0,2.338],[.25,2.333],[.49,2.308],[.64,2.279],[.75,2.240],[.835,2.200],[.903,2.150]];
  function nose(x) {
    const a=Math.abs(x);
    for(let i=1;i<noseStations.length;i++) {
      if(a<=noseStations[i][0]) {
        const [left,z0]=noseStations[i-1],[right,z1]=noseStations[i];
        return mix(z0,z1,(a-left)/(right-left));
      }
    }
    return noseStations.at(-1)[1];
  }
  const grilleHeight=.286, grilleY=.887;
  function rolled(t,r) {
    if(t>=r) return 0;
    const delta=1-t/r;return 1-Math.sqrt(Math.max(0,1-delta*delta));
  }
  function grille(u,v) {
    // The base is flatter than the broad upper chamfer, with rounded corners
    // pinching in across the lower third, as on the first 100-series grille.
    const half=.438+.059*v-.041*rolled(v,.19)-.023*rolled(1-v,.10);
    const x=(u*2-1)*half;
    return [x,grilleY+grilleHeight*v+.009*(1-(x/.51)**2)*v,
      nose(x)+.004+.044*(1-v)+.012*Math.sin(Math.PI*v)];
  }
  const frontPaint=new T.MeshPhysicalMaterial({color:0x245555,roughness:.29,metalness:.50,clearcoat:.80,clearcoatRoughness:.18,side:T.DoubleSide});
  // The painted sill turns continuously below both lamps into the side wing.
  patch(front,'Body-colored lower fascia molding',(u,v)=>{
    const x=(u*2-1)*.848, a=Math.abs(x);
    const y=.835+.049*v+.014*(a/.848)**3;
    const z=nose(x)+.055-.003*v+.003*Math.sin(v*Math.PI);
    return [x,y,z];
  },frontPaint,80,6);
  // Recess the black radiator and horizontal mesh behind the cast surround.
  patch(front,'Recessed black radiator core',(u,v)=>{
    const p=grille(u,v);p[2]-=.025;return p;
  },voidBlack,48,16);
  const rim=perimeter(grille,40,24);
  const center=[0,grilleY+.5*grilleHeight];
  patch(front,'Cast chrome grille perimeter',(u,v)=>{
    const i=Math.round(u*rim.length)%rim.length,p=rim[i],nx=p[0]/.466,ny=(p[1]-center[1])/.150;
    const bevel=[[-.006,-.022],[-.006,-.007],[0,.003],[.005,.004],[.012,.002],[.017,-.005],[.018,-.013]];
    const t=v*(bevel.length-1),j=Math.min(bevel.length-2,Math.floor(t)),f=t-j;
    const d=mix(bevel[j][0],bevel[j+1][0],f),depth=mix(bevel[j][1],bevel[j+1][1],f);
    return [p[0]-nx*d,p[1]-ny*d,p[2]+depth];
  },chrome,rim.length,6);
  const grilleBlack=standard(0x22282a,.50,.24);
  for(let i=-10;i<=10;i++){
    const u=.5+i*.046;
    patch(front,'Radiator vertical fin',(t,v)=>{
      const p=grille(u,.07+.86*v);p[0]+=(t-.5)*.0035;p[2]-=.014;return p;
    },grilleBlack,1,6);
  }
  for(let j=1;j<=19;j++){
    const v=j/20;
    patch(front,'Dark fine horizontal radiator louvre',(u,h)=>{
      const p=grille(.025+.95*u,v);p[1]+=(h-.5)*.0025;p[2]-=.020;return p;
    },black,18,1);
  }
  for(const v of [.170,.384,.604,.828]){
    patch(front,'Rolled leading edge and black return of grille blade',(u,k)=>{
      const p=grille(.023+.954*u,v),taper=.80+.2*Math.sin(Math.PI*u);
      const profile=[[-.0115,-.012],[-.011,-.001],[-.008,.009],[.002,.014],[.007,.012],[.010,.004],[.012,-.019]];
      const t=k*(profile.length-1),i=Math.min(profile.length-2,Math.floor(t)),f=t-i;
      p[1]+=taper*mix(profile[i][0],profile[i+1][0],f)-.004*Math.sin(Math.PI*u);
      p[2]+=mix(profile[i][1],profile[i+1][1],f);return p;
    },chrome,44,6);
  }
  const emblemPosition=grille(.5,.505);
  toyota(front,0,emblemPosition[1],emblemPosition[2]+.024,.135);
  const reflector=standard(0xc3cac9,.32,.12,{map:map('ends-headlight.webp')});
  const lensCover=new T.MeshPhysicalMaterial({color:0x9cabad,roughness:.12,metalness:.025,
    clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.058,depthWrite:false,side:T.FrontSide});
  const reflectorEdge=standard(0x929694,.31,.63), lensRubber=standard(0x292c29,.65,.04);
  for(const side of [-1,1]){
    // Looking at the front face, u runs from the outer corner lamp to the main
    // beam. The corner curves round the fender and the lens leans back at top.
    function optic(u,v) {
      const inner=.448+.056*v;
      const outer=.901-.024*(1-v)**2-.029*rolled(v,.25)-.015*rolled(1-v,.13);
      const a=mix(outer,inner,u),x=side*a;
      const y0=.882+.012*(1-u),y1=1.178+.004*u;
      const bulge=.022*Math.sin(Math.PI*u)**.85*Math.sin(Math.PI*v)**.72;
      return [x,mix(y0,y1,v),nose(a)+.005+.047*(1-v)+bulge];
    }
    function sideMarker(u,v) {
      const a=optic(0,v),t=1-u,x0=Math.abs(a[0]),z0=a[2];
      const z1=1.956+.106*(1-v)**2+.071*v**5,x1=.925;
      // Maintain the tangent across the corner with a cubic optical section.
      // The lens then becomes nearly parallel to the side as it approaches the wing.
      const y=mix(a[1],mix(1.025,1.150,v),u**.91);
      const x=t**3*x0+3*t*t*u*(x0+.031)+3*t*u*u*(x1+.002)+u**3*x1;
      const z=t**3*z0+3*t*t*u*(z0-.028)+3*t*u*u*(z1+.071)+u**3*z1;
      return [side*x,y,z];
    }
    // Roll the fender skin under the pointed corner indicator into the narrow
    // green strip above the bumper. The shell's lamp pocket is recessed here.
    const apron=patch(front,'Continuous painted fender return below the corner lamp',(u,v)=>{
      const marker=sideMarker(u,0), f=1-(1-u)**4,rearEdge=.934;
      const railX=mix(.848,rearEdge,f);
      const h=mix(.835+.014,.842,u);
      return [side*(mix(railX,Math.abs(marker[0]),v)-.019*T.MathUtils.smoothstep(u,.70,1)*Math.sin(v*Math.PI)-.007*T.MathUtils.smoothstep(u,.83,1)*(1-v)),
        mix(h,marker[1]+.003,v),
        mix(marker[2]+.002,marker[2]-.0007,v)];
    },frontPaint,43,14,side<0);
    applySideSurface(T,apron,'paint');
    function opticalUV(mesh,start,end) {
      const uv=mesh.geometry.getAttribute('uv');
      for(let j=0;j<uv.count;j++)uv.setX(j,mix(start,end,uv.getX(j)));
      return mesh;
    }
    opticalUV(patch(front,'Wraparound corner reflector within curved wing',sideMarker,reflector,38,24,side<0),.115,.193);
    const outerEdge=[
      ...curvePoints(28,t=>sideMarker(t,0)),
      ...curvePoints(11,t=>sideMarker(1,t)).slice(1),
      ...curvePoints(28,t=>sideMarker(1-t,1)).slice(1)
    ];
    tube(front,'Marker perimeter seal at wheel arch shoulder',outerEdge,.0024,lensRubber,false,true,74);
    for(let i=0;i<13;i++) {
      patch(front,'Side marker prism ridges',(t,v)=>{
        const q=sideMarker(.08+i*.063+(v-.5)*.036+.003*t,.08+.84*v);
        q[0]+=side*.001;return q;
      },reflectorEdge,1,8,side<0);
    }
    const outline=[...curvePoints(30,t=>optic(t,0)),...curvePoints(18,t=>optic(1,t)).slice(1),
      ...curvePoints(30,t=>optic(1-t,1)).slice(1)];
    const bezel=standard(0x575a58,.44,.28);
    patch(front,'Molded headlight casing',(u,v)=>{
      const p=outline[Math.round(u*(outline.length-1))];
      return [p[0]*(1-.016*v),p[1]-.002*v,p[2]-.059*v];
    },bezel,outline.length-1,1);
    const gasket=[...curvePoints(30,t=>optic(t,0)),...curvePoints(18,t=>optic(1,t)).slice(1),
      ...curvePoints(30,t=>optic(1-t,1)).slice(1)];
    tube(front,'Narrow dark perimeter gasket',gasket,.0039,lensRubber,false,true,92);
    const refracted=(u,v)=>{
      const p=optic(u,v);
      // The dark horizontal shelf and parabolic recess recede inside the main
      // beam independently of the convex exterior glazing.
      const compartment=u<.233?u/.233:(u-.233)/.767;
      p[2]-=.006+(.029*Math.sin(Math.PI*compartment)**1.3)*Math.sin(v*Math.PI)**1.2;
      return p;
    };
    opticalUV(patch(front,'Prismatic front reflector and corner lamp',refracted,reflector,66,28,side>0),.115,1);
    // Shallow chrome reveal between the optical assembly and the clear cover.
    patch(front,'Internal bright headlamp reveal',(u,v)=>{
      const p=outline[Math.round(u*(outline.length-1))];
      const cx=side*.685,cy=1.033;
      return [mix(p[0],cx,.027*v),mix(p[1],cy,.037*v),p[2]-.010*v];
    },reflectorEdge,outline.length,3);
    tube(front,'Optical chamber divider',curvePoints(23,t=>{
      const p=optic(.232,.025+.948*t);p[2]-=.006;return p;
    }),.0035,lensRubber,false,true,24);
    // Fine, raised lens prisms catch light at the outside marker when orbited.
    const flute=standard(0xaaa99f,.34,.24,{transparent:true,opacity:.33,depthWrite:false});
    for(let k=0;k<12;k++) {
      patch(front,'Molded corner lens prism',(u,v)=>{
        const at=.020+k*.0160+.006*Math.sin(Math.PI*v)+(u-.5)*.0009;
        const p=optic(at,.080+.826*v);p[2]+=.0004;return p;
      },flute,1,10,side>0);
    }
    patch(front,'Convex clear headlamp lens',(u,v)=>{
      const p=optic(u,v);p[2]+=.002;return p;
    },lensCover,38,18,side>0);
  }
  // A faceted, cut-and-folded steel bumper. Real openings go through the skin
  // and reveal the inset light buckets and the winch behind the fairlead.
  const bumperFinish=standard(0x383b3f,.66,.36);
  const grain=map('ends-steel-grain.webp');
  if(grain) {grain.wrapS=grain.wrapT=T.RepeatWrapping;grain.repeat.set(6,4);bumperFinish.map=grain;}
  const lowerFold=standard(0x292d2f,.66,.34);
  // x, upper leading Z, lower leading Z, top, bottom, rear of top deck.
  const wings=[[0,2.495,2.421,.844,.506,2.313],[.407,2.495,2.421,.844,.506,2.306],
    [.807,2.417,2.361,.842,.558,2.203],[.953,2.266,2.220,.843,.621,2.108],
    [.966,2.149,2.119,.843,.656,2.054],[.941,1.886,1.891,.841,.712,1.862]];
  const mixV=(a,b,f)=>a.map((n,i)=>mix(n,b[i],f));
  function uvPolygon(name,points,holes,fn,material) {
    const sets=[points,...holes], ps=sets.map(set=>set.map(p=>new T.Vector2(...p)));
    const tris=T.ShapeUtils.triangulateShape(ps[0],ps.slice(1));
    const geometry=new T.BufferGeometry(),all=sets.flat();
    geometry.setAttribute('position',new T.Float32BufferAttribute(all.flatMap(uv=>fn(...uv)),3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(all.flat(),2));
    geometry.setIndex(tris.flat());geometry.computeVertexNormals();
    return add(front,geometry,material,name);
  }
  const rectangle=[[0,0],[1,0],[1,1],[0,1]];
  function insetShape(left,right,bottom,top,bevel=.035) {
    return [[left+bevel,bottom],[right-bevel,bottom],[right,bottom+bevel],[right,top-bevel],
      [right-bevel,top],[left+bevel,top],[left,top-bevel],[left,bottom+bevel]];
  }
  for(const side of [-1,1]){
    for(let i=0;i<wings.length-1;i++){
      const a=wings[i],b=wings[i+1];
      const skin=(u,v)=>{
        const [x,zTop,zBottom,top,bottom]=mixV(a,b,u);
        return [side*x,mix(bottom+.017,top-.010,v),mix(zBottom,zTop,v)];
      };
      const deck=(u,v)=>{
        const [x,zt,,top,,back]=mixV(a,b,u);
        const xt=i>=3 ? x-.104*v : x;
        return [side*xt,top-.009*v,mix(zt-.008,back,v)];
      };
      const lampOpening=[[.334,.324],[.745,.324],[.800,.638],[.782,.737],[.307,.737],[.274,.662],[.281,.391]];
      const recovery=[[.784,.231],[.894,.231],[.933,.395],[.908,.425],[.805,.413]];
      const winch=[[0,.133],[.317,.133],[.317,.245],[0,.245]];
      const openings=i===0?[recovery]:i===1?[lampOpening]:[];
      // The centerline intersects the fairlead. Include this half opening in
      // the outer path so the triangulator sees a proper open notch.
      const outline=i===0 ? [[0,0],[1,0],[1,1],[0,1],[0,.245],[.317,.245],[.317,.133],[0,.133]] : rectangle;
      uvPolygon('Powder-coated steel bumper face',outline,openings,skin,bumperFinish);
      const slot=i===0?insetShape(.49,.73,.30,.56,.03):i===1?insetShape(.039,.196,.34,.54,.022):null;
      uvPolygon('Bumper deck with winch access ports',rectangle,slot?[slot]:[],deck,bumperFinish);
      if(slot){
        const lower=(u,v)=>{const p=deck(u,v);p[1]-=.027;return p;};
        uvPolygon('Dark bumper deck cavity',slot,[],lower,voidBlack);
      }
      // Both bent steel edges have their own small bevels. The underside folds
      // back to the chassis instead of simply ending at a vertical face.
      patch(front,'Upper steel press brake',(u,v)=>mixV(skin(u,1),deck(u,0),v),steelEdge,2,1);
      patch(front,'Beveled lower bumper edge',(u,v)=>{
        const p=skin(u,0); p[1]-=.016*v;p[2]-=.013*v;return p;
      },lowerFold,2,1);
      patch(front,'Folded underside return',(u,v)=>{
        const p=skin(u,0),w=mixV(a,b,u);p[0]*=1-.068*v;p[2]=mix(p[2]-.013,w[5]-.022,v);p[1]+=-.016+.052*v;return p;
      },lowerFold,2,1);
      for(const hole of [...openings,...(i===0?[winch]:[])]){
        const inward=hole===lampOpening?.036:.029;
        const cx=hole.reduce((s,p)=>s+p[0],0)/hole.length,cy=hole.reduce((s,p)=>s+p[1],0)/hole.length;
        const bucket=(u,v,depth)=>{const p=skin(mix(u,cx,.11*depth),mix(v,cy,.11*depth));p[2]-=inward*depth;return p;};
        for(let j=0;j<hole.length;j++) {
          if(hole===winch&&j===hole.length-1)continue;
          const p=hole[j],q=hole[(j+1)%hole.length];
          patch(front,'Bent return within bumper aperture',(u,v)=>bucket(mix(p[0],q[0],u),mix(p[1],q[1],u),v),lowerFold,1,1);
        }
        uvPolygon('Recess behind bumper aperture',hole,[],(u,v)=>bucket(u,v,1),voidBlack);
      }
      if(i===1){
        const p=skin(.565,.535);
        const pod=new T.Group();front.add(pod);pod.name='Inset auxiliary LED pod';
        pod.position.set(p[0],p[1],p[2]-.026);pod.rotation.y=side*.195;pod.rotation.x=-.12;
        box(pod,'Aluminum LED floodlight bezel',.079,.079,.011,0,0,0,black);
        const cellMat=standard(0x9eac84,.30,.34), emitter=standard(0xd5cc98,.37,.13);
        for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++){
          const mirror=add(pod,new T.ConeGeometry(.009,.009,7,1,true),cellMat,'LED reflector cup');
          mirror.rotation.x=-Math.PI/2;mirror.position.set(x*.019,y*.019,.009);
          const led=add(pod,new T.CircleGeometry(.003,8),emitter,'LED phosphor');led.position.set(x*.019,y*.019,.010);
        }
        for(const x of [-.033,.033])for(const y of [-.033,.033]){
          const bolt=add(pod,new T.CylinderGeometry(.003,.003,.0028,6),satin,'Floodlight frame hardware');
          bolt.rotation.x=Math.PI/2;bolt.position.set(x,y,.007);
        }
      }
    }
    const end=wings.at(-1);
    sections(front,'Closed trailing edge of bumper wing',[
      [[side*end[0],end[4],end[2]],[side*end[0],end[3],end[1]],[side*(end[0]-.105),end[3]-.009,end[5]],[side*(end[0]-.081),end[4]+.018,end[5]]],
      [[side*(end[0]-.006),end[4]+.003,end[2]-.006],[side*(end[0]-.006),end[3]-.003,end[1]-.006],
        [side*(end[0]-.105),end[3]-.012,end[5]-.006],[side*(end[0]-.081),end[4]+.022,end[5]-.006]]
    ],lowerFold);
  }
  const registrationBracket=new T.Group();front.add(registrationBracket);
  registrationBracket.name='Registration bracket on raked center panel';registrationBracket.position.set(0,.748,2.477);registrationBracket.rotation.x=.201;
  plate(registrationBracket,'Front Kenyan registration',0,0,0,.466,.110,'ends-plate-front.webp');
  // Tail lamps and bumper share the corrected rear overhang of the shell.
  rear.position.z=-.122;
  // The bumper forms a continuous molded cap. Cross sections follow the
  // tangent of its wrap onto each rear quarter to keep the end radii smooth.
  const rearPlan=[[-.929,1.827],[-.943,1.925],[-.953,2.140],[-.948,2.228],[-.925,2.305],[-.875,2.364],
    [-.792,2.404],[-.614,2.430],[-.342,2.448],[0,2.453],[.342,2.448],
    [.614,2.430],[.792,2.404],[.875,2.364],[.925,2.305],[.948,2.228],[.953,2.140],[.943,1.925],[.929,1.827]];
  const rearPath=new T.CatmullRomCurve3(rearPlan.map(([x,z])=>new T.Vector3(x,0,z)),false,'centripetal');
  const beltProfile=[[.103,1],[.046,1],[.021,.98],[.005,.92],[0,.83],[.000,.67],[.002,.44],
    [.009,.22],[.022,.095],[.040,.032],[.061,.004],[.089,0],[.145,.064],[.166,.186]];
  function backBumper(u,v){
    const p=rearPath.getPointAt(u),t=rearPath.getTangentAt(u);
    const section=T.MathUtils.clamp(v,0,1)*(beltProfile.length-1),i=Math.min(beltProfile.length-2,Math.floor(section)),f=section-i;
    const inset=mix(beltProfile[i][0],beltProfile[i+1][0],f),height=mix(beltProfile[i][1],beltProfile[i+1][1],f);
    const side=Math.abs(p.x),corner=T.MathUtils.smoothstep(side,.62,.88);
    const bottom=.479+.034*corner+.042*(1-T.MathUtils.smoothstep(p.z,2.10,2.31));
    const top=.721+.056*corner;
    return [p.x+inset*t.z,mix(bottom,top,height),p.z-inset*t.x];
  }
  patch(rear,'Rounded one-piece rear bumper',backBumper,rearSilver,132,26);
  for(const u of [0,1]){
    patch(rear,'Rear bumper inner quarter end',(w,v)=>{
      const p=backBumper(u,v);const center=backBumper(u,.56);
      return [mix(p[0],center[0]-.049*Math.sign(p[0]),w),mix(p[1],center[1],w),p[2]];
    },rearPad,1,26);
  }
  patch(rear,'Rear bumper rubber loading step',(u,v)=>{
    const x=(u-.5)*1.34;
    return [x,.723+.016*T.MathUtils.smoothstep(Math.abs(x),.55,.69),2.422-.037*(x/.68)**2-.086*v];
  },rearPad,50,4);
  for(let i=0;i<5;i++){
    tube(rear,'Raised molded step ribs',curvePoints(30,u=>{
      const x=(u-.5)*1.25;
      return [x,.726+.016*T.MathUtils.smoothstep(Math.abs(x),.55,.69),2.414-.036*(x/.68)**2-.014*i];
    }),.0027,rubber,false,true,32);
  }
  const red=standard(0x9f1121,.34,.17),redLens=standard(0xbf1725,.28,.21);
  for(const side of [-1,1]){
    const reflector=new T.Group();rear.add(reflector);reflector.name='Inlaid rear bumper reflector';
    reflector.position.set(side*.754,.599,2.416);reflector.rotation.y=side*.254;
    const rounded=(u,v,rx,ry,depth)=>{
      const angle=u*2*Math.PI,c=Math.cos(angle),s=Math.sin(angle);
      const a=Math.sign(c)*Math.pow(Math.abs(c),.52),b=Math.sign(s)*Math.pow(Math.abs(s),.52);
      return [rx*a*v,ry*b*v,depth+.002*(1-v*v)];
    };
    patch(reflector,'Recessed rounded reflector pocket',(u,v)=>rounded(u,v,.084,.027,0),rearPad,42,4);
    patch(reflector,'Rounded red reflector lens',(u,v)=>rounded(u,v,.076,.020,.003),red,42,4);
    for(let j=-2;j<=2;j++){
      tube(reflector,'Prismatic rear bumper reflector band',curvePoints(8,u=>[(u-.5)*.131,j*.006,.007]),.0009,redLens,false,false,9);
    }
  }
  const tailLens=standard(0xe5e1d4,.34,.10,{map:map('ends-taillight.webp')});
  const rearLampPath=new T.CatmullRomCurve3([[.710,2.336],[.766,2.333],[.838,2.319],[.886,2.295],[.919,2.259],[.937,2.216],
    [.945,2.169],[.945,2.123],[.940,2.075]].map(([x,z])=>new T.Vector3(x,0,z)),false,'centripetal');
  for(const side of [-1,1]){
    function tail(u,v) {
      const endRound=.087*rolled(1-v,.18)+.037*rolled(v,.07);
      const startRound=.036*rolled(1-v,.12)+.012*rolled(v,.055);
      const around=mix(startRound,1-endRound,u),p=rearLampPath.getPointAt(around);
      const face=1-T.MathUtils.smoothstep(around,.38,.88);
      const top=1.207-.030*(1-face)-.003*(1-u);
      const bottom=.787+.005*(1-face);
      const crown=.005*Math.sin(v*Math.PI)*Math.sin(u*Math.PI);
      return [side*(p.x-.024*v**3*(1-face)+crown*(1-face)),mix(bottom,top,v),p.z-.009*v**3+crown*face];
    }
    patch(rear,'Three-part wraparound rear combination lamp',tail,tailLens,58,30,side<0);
    const lip=perimeter(tail,40,12);
    patch(rear,'Rear combination-lamp return',(u,v)=>{
      const p=lip[Math.round(u*lip.length)%lip.length];return [p[0]*(1-.043*v),p[1],p[2]-.032*v];
    },black,lip.length,1);
    tube(rear,'Rear combination-lamp seal',lip,.0038,black,true,true,132);
    for(const h of [.427,.724]){
      tube(rear,'Optical junction in tail lamp',curvePoints(34,u=>{
        const p=tail(u,h);p[0]+=side*.0009*u;p[2]+=.0009*(1-u);return p;
      }),.0011,satin,false,true,36);
    }
  }
  toyota(rear,0,1.285,2.340,.106);
  function badge(file,x,y,z,w,h,name) {
    const m=standard(0xffffff,.42,.17,{map:map(file),transparent:true,alphaTest:.18,depthWrite:false});
    const b=add(rear,new T.PlaneGeometry(w,h),m,name);b.position.set(x,y,z);
  }
  badge('ends-v8.png',-.573,1.163,2.341,.094,.038,'V8 chrome tailgate badge');
  badge('ends-nameplate.png',-.079,1.169,2.344,.405,.030,'Trim and Land Cruiser badges');
  const pocket=frontPaint.clone();pocket.color.setHex(0x22494a);
  patch(rear,'Formed rear registration pocket',(u,v)=>{
    const d=(u-.5)*.43,corner=.014*rolled(v,.12)+.013*rolled(1-v,.09);
    const x=-.505+d*(1-corner/.21),y=.858+.265*v;
    return [x,y,2.314-.039*(Math.abs(x)/.9)**3+.007*Math.sin(u*Math.PI)*Math.sin(v*Math.PI)];
  },pocket,36,10);
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
