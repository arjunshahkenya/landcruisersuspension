import { buildWheelTubs } from './wheel-tubs.js';
import { applySideSurface, applyBonnetSurface } from './surfaces.js';

// Land Cruiser 100-series bodywork. Longitudinal coordinates are measured from
// the middle of the photographed wheelbase. The front is toward positive Z.
export function buildBody(THREE) {
  const group = new THREE.Group();
  group.name = 'Body, cabin and glass';
  const V = (x,y,z) => new THREE.Vector3(x,y,z);
  const mix = THREE.MathUtils.lerp;
  const clamp = THREE.MathUtils.clamp;
  const smooth = THREE.MathUtils.smoothstep;
  const std = (color, roughness, metalness = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({color, roughness, metalness, ...extra});
  const paint = new THREE.MeshPhysicalMaterial({
    color:0x245555, metalness:.52, roughness:.29, clearcoat:.9, clearcoatRoughness:.18, side:THREE.DoubleSide
  });
  const silver = std(0x938e84,.35,.53,{side:THREE.DoubleSide});
  const polished = std(0xb8c0bf,.22,.87);
  const darkTrim = std(0x191e20,.54,.1);
  const rubber = std(0x121516,.79,.02);
  const panelGap = std(0x132625,.8,.04);
  const concealed = std(0x252822,.8,.08,{side:THREE.DoubleSide});
  const pane = (color, opacity, roughness) => new THREE.MeshPhysicalMaterial({
    color, metalness:.17, roughness, clearcoat:1, clearcoatRoughness:.08,
    transparent:true, opacity, depthWrite:false, side:THREE.DoubleSide, envMapIntensity:.88
  });
  // The tall laminated screen catches broad silver-green sky reflections in
  // the forward three-quarter photographs. Leave some cabin visible beneath.
  const frontGlass = pane(0xaec5c1,.73,.105);
  frontGlass.metalness=.24;frontGlass.clearcoat=.92;frontGlass.envMapIntensity=1.23;
  const driverGlass = pane(0x56717d,.615,.135);
  driverGlass.metalness=.24;driverGlass.clearcoat=.69;driverGlass.envMapIntensity=1.09;
  const privacyGlass = pane(0x24333e,.88,.15);
  const backGlass = pane(0x374248,.72,.14);
  const deflectorGlass = pane(0x292c32,.79,.20);

  function part(name,geo,material) {
    const mesh = new THREE.Mesh(geo,material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  }
  function grid(name,nu,nv,point,material,outward) {
    const positions=[], coords=[], indices=[];
    for(let j=0;j<=nv;j++){
      for(let i=0;i<=nu;i++){
        const p=point(i/nu,j/nv);
        positions.push(p.x,p.y,p.z);
        coords.push(i/nu,j/nv);
      }
    }
    // Some panel ends collapse naturally at an arch; test the middle.
    const p=point(.47,.43), pu=point(.471,.43), pv=point(.47,.431);
    const reverse=pu.sub(p).cross(pv.sub(p)).dot(outward)<0;
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
      const a=j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;
      if(reverse) indices.push(a,c,b,b,c,d);
      else indices.push(a,b,c,b,d,c);
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(coords,2));
    geo.setIndex(indices); geo.computeVertexNormals();
    return part(name,geo,material);
  }
  function tube(name,points,radius,material,resolution=24,radial=7) {
    const curve=new THREE.CatmullRomCurve3(points);
    return part(name,new THREE.TubeGeometry(curve,resolution,radius,radial,false),material);
  }
  function edge(name,fn,radius,material,resolution=32) {
    const points = Array.from({length:resolution+1},(_,i)=>fn(i/resolution));
    return tube(name,points,radius,material,resolution);
  }
  function squab(name,x,y,z,w,h,d,material,exponent=.43) {
    const power=(v,e)=>Math.sign(v)*Math.pow(Math.abs(v),e);
    const mesh=grid(name,36,16,(u,v)=>{
      const lat=(v-.5)*Math.PI,lon=u*Math.PI*2,rad=power(Math.cos(lat),exponent);
      return V(rad*power(Math.cos(lon),exponent)*w/2,power(Math.sin(lat),exponent)*h/2,rad*power(Math.sin(lon),exponent)*d/2);
    },material,V(-1,0,0));
    mesh.position.set(x,y,z);return mesh;
  }
  // A shape-preserving cubic maintains a continuous tangent between body
  // stations without flattening the sheet metal at every measured landmark.
  function curve(anchors){
    const widths=anchors.slice(1).map(([x],i)=>x-anchors[i][0]);
    const slopes=widths.map((w,i)=>(anchors[i+1][1]-anchors[i][1])/w);
    const tangents=anchors.map((_,i)=>{
      if(i===0)return slopes[0];
      if(i===slopes.length)return slopes.at(-1);
      if(slopes[i-1]*slopes[i]<=0)return 0;
      const a=2*widths[i]+widths[i-1],b=widths[i]+2*widths[i-1];
      return (a+b)/(a/slopes[i-1]+b/slopes[i]);
    });
    return x=>{
      if(x<=anchors[0][0])return anchors[0][1];
      for(let i=0;i<widths.length;i++){
        if(x>anchors[i+1][0])continue;
        const t=(x-anchors[i][0])/widths[i],t2=t*t,t3=t2*t;
        return (2*t3-3*t2+1)*anchors[i][1]+(t3-2*t2+t)*widths[i]*tangents[i]+
          (-2*t3+3*t2)*anchors[i+1][1]+(t3-t2)*widths[i]*tangents[i+1];
      }
      return anchors.at(-1)[1];
    };
  }

  const z0=-2.366,z1=2.15;
  const width=curve([[-2.366,.833],[-2.29,.868],[-2.26,.880],[-2.17,.895],[-1.97,.910],[-1.63,.917],[-1.12,.913],[-.40,.910],[.33,.914],[.74,.918],[1.12,.910],[1.52,.910],[1.83,.912],[2.00,.917],[2.15,.912]]);
  const shoulderLine=curve([[-2.366,1.242],[-2.26,1.245],[-1.85,1.253],[-1.22,1.259],[-.40,1.270],[.25,1.275],[.70,1.267],[.94,1.252],[1.18,1.239],[1.52,1.217],[1.78,1.202],[1.99,1.184],[2.15,1.178]]);
  const leadingRoll=(z,end)=>.013*smooth(z,end-.16,end);
  const top=z=>shoulderLine(z)-leadingRoll(z,z1);
  const silverLine=curve([[-2.26,.789],[-1.48,.802],[-.56,.813],[.72,.819],[1.65,.832],[2.15,.837]]);
  // These are the arch outlines, rocker ends and bumper junctions traced on
  // the owner's side photograph. Each wheel opening has its own shape.
  const low=curve([[-2.26,.708],[-2.01,.709],[-1.960,.710],[-1.926,.726],[-1.887,.766],[-1.839,.802],[-1.76,.832],[-1.67,.850],[-1.52,.861],[-1.37,.864],[-1.22,.856],[-1.143,.834],[-1.079,.791],[-1.018,.704],[-.967,.595],[-.940,.527],[-.917,.494],[-.889,.486],[-.32,.481],[.334,.488],[.866,.489],[.913,.492],[.935,.526],[.966,.606],[1.012,.714],[1.065,.800],[1.132,.866],[1.211,.903],[1.299,.927],[1.390,.935],[1.496,.934],[1.591,.927],[1.680,.911],[1.772,.882],[1.826,.854],[1.858,.842],[1.923,.844],[2.15,.852]]);
  const lowerWidth=curve([[.48,-.067],[.50,-.044],[.526,-.024],[.558,-.015],[.642,-.004],[.729,.003],[.792,.005],[.835,.002],[.94,.003],[1.033,.009],[1.095,.012],[1.145,.011],[1.19,.006],[1.235,-.005],[1.28,-.025]]);
  const lampWingSection=curve([[.48,-.060],[.526,-.018],[.642,-.005],[.792,.002],[.94,-.002],[1.033,0],[1.11,.005],[1.182,.008],[1.235,.002],[1.28,-.010]]);
  const gaussian=(x,center,spread)=>Math.exp(-(((x-center)/spread)**2));
  const indicatorLower=curve([[1.92,1.119],[1.95,1.111],[2.00,1.080],[2.07,1.030],[2.12,.980],[2.15,.950]]);
  function sideX(z,y){
    const signFront=z>0,axle=signFront?1.42:-1.43;
    const wheelFoot=1-smooth(Math.abs(z-axle),signFront?.285:.295,signFront?.691:.633);
    const dz=z-axle;
    // The broad stamped brow has a much flatter upper arc than the wheel
    // opening. Keeping these two curves independent avoids a tubular lip.
    const brow=(signFront?1.124:1.048)-(signFront?.110:.082)*(dz/.56)**2-.014*dz;
    // A shallow shelf falls steeply back into the upper wing. The lower
    // cheek is much fuller and stretches down towards the flange. The two
    // ends disappear into the doors before the stamped lip ends at the lamp.
    const rise=y-brow;
    const browRound=gaussian(rise,-.025,rise<-.025 ? .144:.056);
    const cheek=gaussian(rise,-.119,.128);
    const flare=wheelFoot*((signFront?.038:.027)*browRound+.013*cheek);
    const shoulder=.005*gaussian(y,top(z)-.074,.056);
    // Three softly rolled lines on the silver door protectors; the lip is
    // pressed into the width of the panel, so it follows the wheel openings.
    const belt=silverLine(z);
    const rib= y<=belt ? (.008*gaussian(y,belt-.012,.013)-.003*gaussian(y,belt-.055,.007)-.0032*gaussian(y,belt-.148,.008)) : 0;
    const tip=smooth(z,1.80,z1);
    // The indicator rolls from the front face into a pocket in the wing.
    const lip=indicatorLower(z);
    const lampY=y+leadingRoll(z,z1)*smooth(y,1.09,1.15);
    const pocket=tip*(.018+.072*smooth(y,lip-.020,lip+.014)*(1-smooth(lampY,1.147,1.179)));
    const lampJoin=smooth(z,1.92,2.14);
    const section=mix(lowerWidth(y),lampWingSection(lampY),lampJoin);
    return width(z)+section+flare+shoulder+rib-pocket;
  }
  const sidePoint=(s,z,y,d=0)=>V(s*(sideX(z,y)+d),y,z);
  const bodyLower=(z)=>low(z)+.001;
  const flareSpans=[[-1.94,-.932],[.912,1.86]];
  const projection=(m,k)=>applySideSurface(THREE,m,k);
  for(const s of [-1,1]){
    const side=s<0?'right':'left';
    // The quarter, two doors and the front fender are separately formed panels.
    // The opening and the raised flare are a single continuous curved stamping.
    const silverSkin=grid(side+' contoured silver protector',240,31,(u,v)=>{
      const z=mix(z0,z1,u),bottom=bodyLower(z),end=Math.max(bottom,silverLine(z)-.001);
      return sidePoint(s,z,mix(bottom,end,v),.002);
    },silver,V(s,0,0));
    projection(silverSkin,'cladding');
    const outer=grid(side+' shaped side body and integral arch blisters',240,42,(u,v)=>{
      const z=mix(z0,z1,u),y=mix(Math.max(silverLine(z),bodyLower(z)),top(z),v);
      return sidePoint(s,z,y);
    },paint,V(s,0,0));
    projection(outer,'paint');
    grid(side+' folded rocker and wheel-well return',240,6,(u,v)=>{
      const z=mix(z0,z1,u),yl=low(z);
      return V(s*mix(sideX(z,yl)-.001,.716,v),yl+.015*v-.008*Math.sin(Math.PI*v),z);
    },concealed,V(0,-1,0));
    // Inward curl of the pressed-steel arch. A narrow dark hem follows the
    // fender circumference without hiding the outer color at its crown.
    for(const [a,b] of flareSpans){
      edge(side+' arch flange and liner joint',t=>{
        const z=mix(a,b,t),y=low(z)-.002;
        return sidePoint(s,z,y,-.010);
      },.0044,rubber,86);
    }
    function interruptedEdge(name,yAt,r,mat,offset=.0028){
      let coords=[];
      const flush=()=>{if(coords.length>1)tube(name,coords,r,mat,coords.length);coords=[];};
      for(let i=0;i<=290;i++){
        const z=mix(z0,z1,i/290),y=yAt(z);
        if(y>low(z)+.008)coords.push(sidePoint(s,z,y,offset));else flush();
      }
      flush();
    }
    interruptedEdge('upper polished trim reveal',z=>silverLine(z)-.002,.0035,polished);
    interruptedEdge('body side moulding contact seam',z=>silverLine(z)+.0012,.0022,panelGap,.0011);
    const sourcePath=coords=>new THREE.CatmullRomCurve3(coords.map(([z,y])=>V(z,y,0)),false,'centripetal');
    function doorPath(name,coords,width=.0058){
      const path=sourcePath(coords);
      grid(side+' '+name,Math.max(coords.length*6,60),4,(u,v)=>{
        const p=path.getPoint(u),t=path.getTangent(u),d=(v-.5)*width;
        return sidePoint(s,p.x-d*t.y,p.y+d*t.x,.0024+.0018*Math.abs(2*v-1));
      },panelGap,V(s,0,0));
    }
    doorPath('front door leading and sill seam',[[.703,1.27],[.746,1.211],[.777,1.130],[.793,1.009],[.794,.828],[.785,.682],[.765,.603],[.742,.558],[.714,.535],[.65,.529],[.24,.527],[-.287,.526],[-.322,.534]]);
    doorPath('B-post door meeting edges',[[-.340,.530],[-.326,.600],[-.318,.802],[-.328,1.030],[-.339,1.269]]);
    doorPath('rear door shaped corner and sill seam',[[-1.264,1.262],[-1.280,1.211],[-1.299,1.116],[-1.316,1.000],[-1.315,.944],[-1.307,.922],[-1.228,.892],[-1.149,.860],[-1.085,.815],[-1.031,.750],[-.975,.660],[-.918,.554],[-.897,.531],[-.829,.526],[-.52,.525],[-.34,.530]]);
    for(const [z,y] of [[-1.098,1.104],[-.134,1.113]]){
      const x=sideX(z,y);
      // Oval lipped surrounds, scooped finger recess, tapered pull and thumb cap.
      squab('elliptical door handle surround',s*(x+.001),y,z,.017,.068,.244,polished,.73);
      squab('metallic handle pocket shell',s*(x+.008),y,z,.017,.058,.229,paint,.73);
      squab('deep finger pocket',s*(x+.015),y+.002,z-.003,.012,.030,.149,rubber,.65);
      const handle=tube('raised bridge door pull',[
        V(s*(x+.017),y+.008,z-.078),V(s*(x+.030),y+.015,z-.054),
        V(s*(x+.036),y+.018,z),V(s*(x+.030),y+.015,z+.057),V(s*(x+.017),y+.006,z+.078)
      ],.010,paint,22,12);
      handle.castShadow=true;
      if(z>-.5)squab('key barrel',s*(x+.019),y,z-.094,.007,.018,.020,polished,.85);
    }
    const markerY=1.112, markerZ=.855,x=sideX(markerZ,markerY);
    squab('side repeater perimeter',s*(x+.001),markerY,markerZ,.016,.040,.073,rubber,.56);
    squab('amber quarter repeater',s*(x+.011),markerY,markerZ,.015,.034,.064,std(0xe4c38b,.22,.11),.57);
    if(s===1)doorPath('recessed fuel filler joint',[[-1.68,1.179],[-1.841,1.176],[-1.863,1.160],[-1.864,1.069],[-1.85,1.048],[-1.684,1.050],[-1.67,1.063],[-1.668,1.161],[-1.68,1.179]],.0043);
  }

  // The upper front edge is bowed almost 19 cm from the badge to the corner
  // indicator. The outer fender shoulders turn continuously into the bonnet.
  const frontBow=curve([[0,2.338],[.31,2.330],[.54,2.308],[.69,2.283],[.826,2.240],[.926,2.199],[1,2.15]]);
  const endZ=(front,u)=>front ? frontBow(Math.abs(u)) : -2.44+.074*(Math.abs(u)**3.5);
  const hoodSpine=curve([[.68,1.303],[.93,1.303],[1.10,1.302],[1.38,1.293],[1.65,1.276],[1.9,1.252],[2.08,1.231],[2.22,1.213],[2.338,1.194]]);
  // In plan the windscreen is wide and almost flat in the middle, then
  // rolls into the A-posts more sharply in its last hand's breadth.
  function curvedSection(a,power,roll){
    const extent=.995, minimum=(1-extent**power)**roll;
    return ((1-(extent*Math.min(Math.abs(a),1))**power)**roll-minimum)/(1-minimum);
  }
  const windBow=a=>curvedSection(a,2.45,.63);
  const windshieldBase=u=>.703+.233*windBow(u);
  function hood(z,u){
    const a=Math.min(Math.abs(u),1),outer=sideX(Math.min(z,z1),top(Math.min(z,z1)));
    const edgeY=shoulderLine(Math.min(z,z1))-.006*Math.max(0,(z-z1)/.188);
    const start=windshieldBase(a),end=endZ(true,a);
    const along=clamp((z-start)/(end-start),0,1);
    const form=smooth(along,0,.28)*(1-smooth(along,.75,1));
    const originalCrown=Math.sqrt(Math.max(0,1-a**3.4));
    const crown=mix(originalCrown,curvedSection(a,2.18,.53),form);
    // The centre panel is broadly domed, with a shallower drawn channel
    // before each wing rises again into the rounded top of the wheel housing.
    // Both sections return to the closing lines around the screen and lamps.
    const spine=hoodSpine(z)+.032*form;
    const fenderTop=.018*gaussian(a,.839,.093)*form;
    const draw=-.009*gaussian(a,.727+.070*along,.063)*form;
    const pressing=(fenderTop+draw)*(1-smooth(a,.955,1));
    return V(u*outer,mix(edgeY,spine,crown)+pressing-leadingRoll(z,end),z);
  }
  const bonnet=grid('compound-curved bonnet, fender brows and nose',96,63,(x,t)=>{
    // More samples across the extremely rounded outer edge.
    const a=Math.sin((x-.5)*Math.PI),z=mix(windshieldBase(a)-.032,endZ(true,a),t);
    return hood(z,a);
  },paint,V(0,1,0));
  applyBonnetSurface(THREE,bonnet);
  for(const s of [-1,1]){
    const lampDivider=.797/sideX(z1,top(z1));
    const crease=u=>{
      const a=s*(mix(.853,lampDivider,smooth(u,0,1))+.008*Math.sin(Math.PI*u));
      const z=mix(windshieldBase(a)+.061,endZ(true,a)-.002,u);
      return hood(z,a);
    };
    edge('bonnet closing gap',t=>{const p=crease(t);p.y+=.0010;return p;},.0020,panelGap,54);
  }
  // Black perforated scuttle and the sealed rear lip of the hood.
  const cowl=(a,t)=>{const z=windshieldBase(a)+mix(-.023,.075,t);const p=hood(z,a);p.y+=.003;return p;};
  grid('moulded wiper scuttle',52,6,(u,v)=>cowl((u*2-1)*.926,v),darkTrim,V(0,1,0));
  for(let i=-25;i<=25;i++){
    const a=i*.029;
    edge('scuttle intake slot',u=>{const p=cowl(a+u*.008,mix(.16,.79,u));p.y+=.0015;return p;},.0016,rubber,4);
  }
  grid('rolled bonnet front hem',58,5,(u,v)=>{
    const a=2*u-1,p=hood(endZ(true,a),a),k=Math.sin(v*Math.PI/2);
    return V(p.x,p.y-.016*(1-Math.cos(v*Math.PI/2)),p.z+.0058*k-.005*v*v);
  },paint,V(0,.35,1));
  grid('curved radiator support behind grille and lights',48,12,(u,v)=>{
    const a=2*u-1,p=hood(endZ(true,a),a);
    return V(p.x*(.991+.009*v),mix(.761,p.y-.009,v),p.z-.060-.030*Math.abs(a)**3-.014*(1-v));
  },concealed,V(0,0,1));
  grid('rolled tailgate inner panel',64,23,(u,v)=>{
    const a=2*u-1,y=mix(.64,1.275,v);
    const z=endZ(false,a)+.022*(1-smooth(y,.655,.75))+.012*gaussian(y,.827,.028);
    return V(a*sideX(z0,Math.min(y,top(z0))),y,z);
  },paint,V(0,0,-1));

  // Calibrated side-glass silhouette, including the tapering tumblehome and
  // the slight barrel to each piece of glass in both directions.
  const roofEdgeHeight=curve([[-2.026,1.819],[-1.875,1.823],[-1.64,1.824],[-.58,1.827],[-.26,1.828],[-.071,1.823],[-.054,1.821]]);
  const cabWidth=(y,z)=>{
    const station=clamp(z,z0,.703),waist=top(station);
    const t=clamp((y-waist)/(roofEdgeHeight(z)-waist),0,1);
    const base=sideX(station,waist);
    const eave=.782-.012*smooth(-z,1.79,2.32)-.005*smooth(z,.02,.68);
    const corner=.020*smooth(-z,1.82,2.33)+.011*smooth(z,.33,.69);
    return mix(base,eave,.66*t+.34*t*t)+(.012-corner)*Math.sin(Math.PI*t)-.016*t**9;
  };
  const cabP=(s,z,y,d=0)=>V(s*(cabWidth(y,z)+d),y,z);
  const outerFront=curve([[1.266,.703],[1.348,.622],[1.476,.498],[1.610,.341],[1.709,.208],[1.773,.101],[1.806,.019],[1.821,-.054]]);
  const outerRear=curve([[1.242,-2.366],[1.390,-2.332],[1.522,-2.279],[1.650,-2.210],[1.74,-2.153],[1.798,-2.083],[1.819,-2.026]]);
  function outlineColumns(fn,lo,hi,n){
    return Array.from({length:n+1},(_,i)=>{const y=mix(lo,hi,i/n);return [fn(y),y];});
  }
  const cabOutline=[
    ...outlineColumns(outerRear,1.242,1.819,35),[-1.875,1.823],[-1.64,1.824],[-.58,1.827],[-.26,1.828],[-.071,1.823],
    ...outlineColumns(outerFront,1.821,1.266,42),[.54,1.271],[.17,1.270],[-.46,1.262],[-1.27,1.253],[-1.84,1.246]
  ];
  const openings=[
    [[-2.102,1.347],[-2.098,1.403],[-2.081,1.498],[-2.052,1.587],[-2.016,1.675],[-1.971,1.722],[-1.923,1.746],[-1.851,1.758],[-1.245,1.777],[-1.269,1.263],[-2.016,1.252]],
    [[-1.232,1.265],[-1.195,1.771],[-.429,1.778],[-.412,1.270]],
    [[-.267,1.275],[-.377,1.777],[-.102,1.778],[-.022,1.761],[.095,1.718],[.202,1.655],[.333,1.551],[.475,1.408],[.537,1.335],[.545,1.28]]
  ];
  function rounded(points,radius) {
    const path=new THREE.Shape();
    const a=points.map(([x,y])=>new THREE.Vector2(x,y));
    const split=(from,to)=>from.clone().lerp(to,Math.min(radius/from.distanceTo(to),.40));
    for(let i=0;i<a.length;i++){
      const prev=a[(i+a.length-1)%a.length],p=a[i],next=a[(i+1)%a.length];
      const before=split(p,prev),after=split(p,next);
      if(i===0) path.moveTo(before.x,before.y);else path.lineTo(before.x,before.y);
      path.quadraticCurveTo(p.x,p.y,after.x,after.y);
    }
    path.closePath();return path;
  }
  function sidePoly(sign,name,shape,mat,offset){
    // Tessellate through each aperture as well as along the outline: a single
    // triangulated quad gives a flat diagonal highlight across an SUV window.
    const initial=new THREE.ShapeGeometry(shape,5),pt=initial.attributes.position,index=initial.index.array;
    const pos=[],normal=[],uv=[],lookup=new Map(),tri=[];
    const maxLength=.095, point=(i)=>[pt.getX(i),pt.getY(i)];
    const entry=(a)=>{
      const [z,y]=a,key=Math.round(z*1e6)+','+Math.round(y*1e6);
      if(lookup.has(key))return lookup.get(key);
      const x=cabWidth(y,z),dz=(cabWidth(y,z+.00015)-cabWidth(y,z-.00015))/.00030,dy=(cabWidth(y+.00015,z)-cabWidth(y-.00015,z))/.00030;
      const n=V(sign,-dy,-dz).normalize(),i=pos.length/3;
      pos.push(sign*(x+offset),y,z);normal.push(...n.toArray());uv.push(z,y);lookup.set(key,i);
      return i;
    };
    const squared=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2;
    const half=(a,b)=>[(a[0]+b[0])*.5,(a[1]+b[1])*.5];
    function split(a,b,c){
      const ab=squared(a,b),bc=squared(b,c),ca=squared(c,a);
      if(Math.max(ab,bc,ca)<=maxLength*maxLength){
        const t=[entry(a),entry(b),entry(c)];
        if(sign===1) t.reverse();
        tri.push(...t);return;
      }
      if(ab>=bc&&ab>=ca){const h=half(a,b);split(a,h,c);split(h,b,c);}
      else if(bc>=ca){const h=half(b,c);split(a,b,h);split(a,h,c);}
      else {const h=half(c,a);split(a,b,h);split(h,b,c);}
    }
    for(let i=0;i<index.length;i+=3)split(point(index[i]),point(index[i+1]),point(index[i+2]));
    initial.dispose();
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(tri);
    return part(name,geo,mat);
  }
  function traceShape(sign,name,shape,radius,mat,offset){
    const pts=shape.getSpacedPoints(120).map(p=>cabP(sign,p.x,p.y,offset));
    return tube(name,pts,radius,mat,120);
  }
  const glassNames=['rear quarter','rear door','front door'];
  for(const s of [-1,1]){
    const outline=rounded(cabOutline,.012);
    const shapes=openings.map((a,i)=>rounded(a,i===0?.031:.014));
    for(const shape of shapes) outline.holes.push(shape);
    sidePoly(s,'painted pillars and window apertures',outline,paint,0);
    for(let i=0;i<shapes.length;i++){
      const m=sidePoly(s,glassNames[i]+' compound-curved glazing',shapes[i],i===2?driverGlass:privacyGlass,-.0057);
      projection(m,['quarter-glass','rear-glass','front-glass'][i]);
      traceShape(s,glassNames[i]+' compressed rubber seal',shapes[i],i===0?.0066:.0058,rubber,.0013);
    }
    sidePoly(s,'satin black B-post cover',rounded([[-.414,1.265],[-.435,1.782],[-.378,1.783],[-.268,1.273]],.0022),darkTrim,.0008);
    sidePoly(s,'glass division on C-post',rounded([[-1.270,1.255],[-1.246,1.78],[-1.199,1.778],[-1.234,1.262]],.003),darkTrim,.0012);
    edge('rear quarterlight divider',u=>cabP(s,mix(-.944,-.99,u),mix(1.267,1.769,u),.001),.0065,rubber,18);
    edge('window lower weather belt',u=>{const z=mix(-1.251,.620,u);return cabP(s,z,top(z)+.001,.0026);},.0048,rubber,49);
    const rearVisor=rounded([[-1.191,1.773],[-.445,1.783],[-.427,1.768],[-.433,1.690],[-.472,1.676],[-1.159,1.679],[-1.19,1.672],[-1.204,1.683]],.012);
    const frontVisor=rounded([[-.368,1.782],[-.099,1.778],[.007,1.754],[.144,1.69],[.292,1.582],[.415,1.461],[.397,1.464],[.249,1.578],[.100,1.642],[-.058,1.669],[-.342,1.684],[-.368,1.696]],.010);
    for(const [shape,label] of [[rearVisor,'rear'],[frontVisor,'front']]){
      sidePoly(s,label+' smoke acrylic door visor',shape,deflectorGlass,.0195);
      traceShape(s,label+' visor rolled edge',shape,.0023,darkTrim,.020);
    }
    const sail=rounded([[.538,1.278],[.526,1.337],[.486,1.4],[.557,1.353],[.668,1.277]],.005);
    sidePoly(s,'black mirror mounting sail',sail,darkTrim,.0025);
    // Fluted pressure-relief insert in the rear dogleg.
    const vent=rounded([[-2.331,1.261],[-2.308,1.322],[-2.287,1.346],[-2.166,1.346],[-2.13,1.283],[-2.122,1.263]],.013);
    sidePoly(s,'quarter vent recessed well',vent,rubber,.003);
    traceShape(s,'quarter vent moulded surround',vent,.0044,darkTrim,.005);
    for(let k=0;k<5;k++){
      const y=1.272+k*.012;
      edge('vent louvre',u=>cabP(s,mix(-2.312+k*.004,-2.145-k*.005,u),y,.009),.0029,darkTrim,8);
    }
    traceShape(s,'rear door upper seam',rounded([[-1.264,1.261],[-1.215,1.802],[-.402,1.807],[-.344,1.268]],.007),.0019,panelGap,.003);
  }

  function frontSurface(a,h,d=0){
    const y=mix(1.266,1.821,h),z=outerFront(y),c=windBow(a);
    return V(a*cabWidth(y,z),y+c*mix(.036,.028,h)+d*.65,z+c*mix(.233,.144,h)+d);
  }
  function rearSurface(a,h,d=0){
    const y=mix(1.242,1.819,h),z=outerRear(y);
    const c=mix(1-Math.abs(a)**3.5,curvedSection(a,3.6,.55),smooth(h,0,.23));
    return V(a*cabWidth(y,z),y+c*mix(.021,.022,h)+d*.27,z-c*mix(.074,.100,h)-d);
  }
  function glazedEnd(name,surface,glass,front,lower,upper,width){
    const normal=V(0,.24,front?1:-1);
    // Radius the four corners by narrowing the final few centimetres of pane.
    const widthAt=v=>width-.023*Math.pow(Math.abs(v*2-1),14);
    const at=(a,v,off=0)=>surface(a*widthAt(v),mix(lower,upper,v),off);
    const paneMesh=grid(name+' glazing',42,28,(u,v)=>at(u*2-1,v),glass,normal);
    if(front){
      // Laminated glass cools gently towards the upper edge and the rolled
      // corners. The specular environment remains free to move with the viewer.
      const geom=paneMesh.geometry,uv=geom.attributes.uv,colors=new Float32Array(uv.count*3);
      for(let i=0;i<uv.count;i++){
        const side=Math.abs(2*uv.getX(i)-1),head=smooth(uv.getY(i),.64,1);
        colors[i*3]=1-.23*head-.055*side**4;
        colors[i*3+1]=1-.122*head-.022*side**4;
        colors[i*3+2]=1-.066*head;
      }
      geom.setAttribute('color',new THREE.BufferAttribute(colors,3));
      glass.vertexColors=true;
    }
    grid(name+' header',34,5,(u,v)=>surface(2*u-1,mix(upper,1,v)),paint,normal);
    grid(name+' lower frame',34,5,(u,v)=>surface(2*u-1,mix(0,lower,v)),paint,normal);
    for(const s of [-1,1]){
      grid(name+' outer pillar',8,26,(u,v)=>surface(s*mix(widthAt(v),1,u),mix(lower,upper,v)),paint,normal);
      edge(name+' side weatherstrip',t=>at(s,t,.001),.0105,rubber,38);
    }
    for(const v of [0,1])edge(name+' perimeter weatherstrip',u=>at(2*u-1,v,.001),.0105,rubber,40);
    return at;
  }
  const wind=glazedEnd('windscreen',frontSurface,frontGlass,true,.024,.947,.948);
  const rear=glazedEnd('heated rear screen',rearSurface,backGlass,false,.076,.869,.849);

  // Roof crown, stamped channels and narrow flush roof-gutter strips.
  function roof(a,v,offset=0){
    const front=frontSurface(a,1),rear=rearSurface(a,1);
    const z=mix(rear.z,front.z,v);
    const sideZ=mix(outerRear(1.819),outerFront(1.821),v);
    const edgeY=roofEdgeHeight(sideZ);
    const shoulder=cabWidth(edgeY,sideZ);
    const crown=curvedSection(a,3.45,.54);
    const span=Math.sin(Math.PI*v)**.72;
    const bow=edgeY-mix(1.819,1.821,v)+span*.020*crown;
    const groove=.0045*gaussian(Math.abs(a),.666,.032)*span;
    // Shallow longitudinal pressings stiffen the rear roof panel. Their ends
    // fade smoothly before the curved front/rear headers.
    const ribs=(.0045*gaussian(a,0,.085)+.0042*gaussian(Math.abs(a),.32,.075)+
      .0036*gaussian(Math.abs(a),.587,.061))*smooth(v,.095,.15)*(1-smooth(v,.71,.84));
    return V(a*shoulder,mix(rear.y,front.y,v)+bow-groove+ribs+offset,z);
  }
  grid('gently crowned roof pressing',80,48,(u,v)=>roof(Math.sin((u-.5)*Math.PI),v),paint,V(0,1,0));
  for(const s of [-1,1]){
    edge('longitudinal roof ditch moulding',t=>roof(s*.895,mix(.028,.958,t),.0025),.0042,darkTrim,48);
    edge('painted gutter seam',t=>roof(s*.963,mix(.02,.971,t),.001),.0024,panelGap,48);
  }
  // Curved defogger filaments appear against the dark rear glass.
  const heater=std(0x584037,.64,.20);
  for(let i=1;i<=11;i++){
    const v=.095+i*.063;
    edge('rear window heater wire',u=>rear((2*u-1)*.955,v,.0018),.00072,heater,32);
  }
  for(const s of [-1,1])edge('defogger bus bar',u=>rear(s*.96,mix(.12,.82,u),.0015),.0015,heater,16);
  // Front wiper pivots, articulated arms and curved rubber blades at rest.
  for(const [pivot,inner,outer] of [[-.36,-.91,-.006],[.67,.008,.864]]){
    const wp=(a,h,off)=>wind(a,h,off);
    const foot=wp(pivot,.013,.011);
    squab('wiper spindle',foot.x,foot.y,foot.z,.036,.022,.028,rubber);
    const joint=mix(inner,outer,.49);
    tube('windscreen wiper arm',[wp(pivot,.017,.014),wp(mix(pivot,joint,.49),.049,.020),wp(joint,.077,.022)],.007,darkTrim,14);
    edge('bowed wiper rubber',u=>wp(mix(inner,outer,u),.058+.028*Math.sin(Math.PI*u),.012),.0068,rubber,28);
    edge('wiper blade backing',u=>wp(mix(inner,outer,u),.060+.028*Math.sin(Math.PI*u),.020),.0045,darkTrim,28);
  }
  tube('tailgate wiper arm',[rear(-.08,.01,.014),rear(.025,.058,.023),rear(.31,.142,.025)],.0085,darkTrim,14);
  edge('tailgate wiper blade',u=>rear(mix(.01,.63,u),mix(.060,.229,u),.016),.007,rubber,25);
  for(const a of [-.53,.53]){
    const p=hood(1.055,a);
    squab('twin-jet screen washer',p.x,p.y+.006,p.z,.031,.016,.024,rubber);
  }
  // The reference shows a vertical stack of small permits at the passenger edge.
  let permitMap=null;
  if(typeof document!=='undefined'){
    permitMap=new THREE.TextureLoader().load(new URL('./assets/body-inspection-permits.png',import.meta.url).href);
    permitMap.colorSpace=THREE.SRGBColorSpace;
  }
  const sticker=std(permitMap?0xffffff:0x8ca79c,.69,0,{map:permitMap,transparent:true,alphaTest:.18,side:THREE.DoubleSide});
  grid('inspection permits',5,22,(u,v)=>wind(mix(.781,.931,u),mix(.083,.846,v),.0027),sticker,V(0,.3,1));

  // The upper liftgate and lower drop gate are split across the rear face.
  const gatePoint=(a,y,d=.003)=>V(a*sideX(z0,y),y,endZ(false,a)+.012*Math.exp(-Math.pow((y-.827)/.028,2))-d);
  for(const s of [-1,1]){
    edge('rear liftgate vertical joint',u=>gatePoint(s*.771,mix(.704,1.28,u)),.0035,panelGap,34);
  }
  edge('split tailgate seam',u=>gatePoint(mix(-.772,.772,u),.831,.004),.004,panelGap,46);
  edge('rear gate lower moulding',u=>gatePoint(mix(-.766,.766,u),.771,.004),.006,paint,46);
  group.add(buildWheelTubs(THREE,low));
  return group;
}
