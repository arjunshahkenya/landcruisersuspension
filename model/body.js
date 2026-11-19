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
  const seatMaterial = std(0x615e53,.74);
  const seatInsert = std(0x534f44,.81);
  const charcoal = std(0x292e2c,.73);
  const lining = std(0x6d695d,.87);
  const pane = (color, opacity, roughness) => new THREE.MeshPhysicalMaterial({
    color, metalness:.17, roughness, clearcoat:1, clearcoatRoughness:.08,
    transparent:true, opacity, depthWrite:false, side:THREE.DoubleSide, envMapIntensity:.88
  });
  const frontGlass = pane(0x8fa7ad,.34,.12);
  const driverGlass = pane(0x627b82,.46,.14);
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
  function box(name,x,y,z,w,h,d,material) {
    const m=part(name,new THREE.BoxGeometry(w,h,d),material);
    m.position.set(x,y,z);return m;
  }
  function squab(name,x,y,z,w,h,d,material,exponent=.43) {
    const power=(v,e)=>Math.sign(v)*Math.pow(Math.abs(v),e);
    const mesh=grid(name,36,16,(u,v)=>{
      const lat=(v-.5)*Math.PI,lon=u*Math.PI*2,rad=power(Math.cos(lat),exponent);
      return V(rad*power(Math.cos(lon),exponent)*w/2,power(Math.sin(lat),exponent)*h/2,rad*power(Math.sin(lon),exponent)*d/2);
    },material,V(-1,0,0));
    mesh.position.set(x,y,z);return mesh;
  }
  function profile(z,points) {
    if(z<=points[0][0]) return points[0][1];
    for(let i=1;i<points.length;i++){
      if(z<=points[i][0]){
        const [a,av]=points[i-1],[b,bv]=points[i];
        return mix(av,bv,smooth(z,a,b));
      }
    }
    return points[points.length-1][1];
  }

  const frontAxle=1.42,rearAxle=-1.43,archRadius=.475;
  // The arches are actual openings. Their lips and the inner returns share the
  // same parametric boundary as the fenders and the two-tone rocker skins.
  const widthStations=[[-2.26,.886],[-2.09,.919],[-1.66,.931],[-.65,.925],[.49,.926],[1.39,.929],[1.94,.914],[2.245,.866]];
  const rimTop=[[-2.26,1.254],[-1.89,1.278],[-.65,1.292],[.67,1.296],[.96,1.285],[1.54,1.246],[1.95,1.213],[2.245,1.182]];
  const sill=[[-2.26,.656],[-1.99,.525],[-1.65,.501],[.82,.494],[1.80,.514],[2.245,.712]];
  const z0=-2.26,z1=2.245,bicolor=.771;
  function low(z){
    const dz=Math.min(Math.abs(z-frontAxle),Math.abs(z-rearAxle));
    const arc=dz<archRadius ? .405+Math.sqrt(archRadius*archRadius-dz*dz) : 0;
    return Math.max(profile(z,sill),arc);
  }
  const top=z=>profile(z,rimTop);
  function sideX(z,y){
    const proximity=Math.min(Math.hypot(z-frontAxle,y-.405),Math.hypot(z-rearAxle,y-.405));
    const flare=.042*Math.exp(-Math.pow((proximity-.525)/.11,2));
    const crown=.011*Math.exp(-Math.pow((y-.97)/.19,2));
    const shoulder=-.026*smooth(y,1.085,top(z))-.009*(1-smooth(y,.52,.72));
    return profile(z,widthStations)+flare+crown+shoulder;
  }
  const sidePoint=(sign,z,y,offset=0)=>V(sign*(sideX(z,y)+offset),y,z);
  for(const s of [-1,1]){
    const side=s<0?'right':'left';
    grid(side+' silver lower body',182,8,(u,v)=>{
      const z=mix(z0,z1,u), lowY=low(z),upper=Math.max(lowY,bicolor);
      return sidePoint(s,z,mix(lowY,upper,v),.002);
    },silver,V(s,0,0));
    grid(side+' sculpted fenders and door skins',182,23,(u,v)=>{
      const z=mix(z0,z1,u),y=mix(Math.max(bicolor,low(z)),top(z),v);
      return sidePoint(s,z,y);
    },paint,V(s,0,0));
    grid(side+' wheel housings and pinchweld return',182,5,(u,v)=>{
      const z=mix(z0,z1,u),y=low(z);
      return V(s*mix(sideX(z,y),.715,v),y+v*.016,z);
    },concealed,V(0,-1,0));

    // Three separate pieces of side cladding, interrupted at both wheel arches.
    for(const [start,end] of [[z0,-1.77],[-1.09,1.08],[1.76,z1]]){
      for(const [y,r,mat] of [[.774,.005,polished],[.751,.006,silver],[.641,.0027,concealed],[.605,.0027,silver]]){
        let section=[];
        const flush=()=>{
          if(section.length>2)tube('moulded rocker detail',section,r,mat,section.length);
          section=[];
        };
        for(let i=0;i<=70;i++){
          const z=mix(start,end,i/70);
          if(y>low(z)+.004) section.push(sidePoint(s,z,y,.0035));
          else flush();
        }
        flush();
      }
    }
    // Arched highlight, rolled black inner lip and front/rear quarter flares.
    for(const center of [frontAxle,rearAxle]){
      const halfAngle=Math.acos((.525-.405)/archRadius);
      edge(side+' rolled arch lip',u=>{
        const a=mix(-halfAngle,halfAngle,u),y=.405+archRadius*Math.cos(a),z=center+archRadius*Math.sin(a);
        return sidePoint(s,z,y,-.002);
      },.0085,rubber,48);
      grid(side+' pressed arch flare',50,7,(u,v)=>{
        const a=mix(-halfAngle,halfAngle,u);
        const r=archRadius+.012+.157*v;
        const y=.405+r*Math.cos(a),z=center+r*Math.sin(a);
        const strength=Math.sin(Math.PI*v)**1.7*Math.sin(Math.PI*u)**.44;
        return sidePoint(s,z,y,.002+.015*strength);
      },paint,V(s,0,0));
    }
    const doorPath=(name,coords)=>{
      const path=new THREE.CatmullRomCurve3(coords.map(([z,y])=>V(z,y,0)),false,'centripetal');
      edge(side+' '+name,u=>{
        const p=path.getPoint(u);
        return sidePoint(s,p.x,p.y,.0046);
      },.0031,panelGap,60);
    };
    doorPath('front door shut line',[[.818,1.296],[.868,1.22],[.889,1.08],[.891,.82],[.878,.647],[.853,.557],[.819,.516],[.735,.509],[.19,.508],[-.283,.512],[-.312,.53],[-.325,.63],[-.331,.955],[-.34,1.30]]);
    doorPath('rear door shut line',[[-.34,1.30],[-.331,1.02],[-.327,.69],[-.312,.53],[-.345,.513],[-.64,.512],[-.90,.515],[-.969,.548],[-1.001,.63],[-1.044,.715],[-1.112,.794],[-1.193,.84],[-1.309,.883],[-1.332,.925],[-1.327,1.0],[-1.293,1.17],[-1.264,1.297]]);
    for(const z of [-1.058,-.085]){
      const y=1.147;
      const cup=squab('painted handle recess',s*(sideX(z,y)+.003),y,z,.021,.065,.169,panelGap);
      cup.rotation.x=-.028;
      const surround=squab('flush oval door handle surround',s*(sideX(z,y)+.013),y+.002,z,.027,.054,.16,paint);
      surround.rotation.x=-.028;
      squab('recess under pull',s*(sideX(z,y)+.025),y+.001,z-.002,.012,.024,.110,darkTrim);
      squab('painted exterior door pull',s*(sideX(z,y)+.031),y+.012,z,.022,.018,.138,paint);
      if(z>-.5) squab('door lock barrel',s*(sideX(z,y)+.032),y+.001,z-.061,.008,.015,.015,polished);
    }
    const markerY=1.13, markerZ=1.05;
    squab('front quarter repeater seal',s*(sideX(markerZ,markerY)+.003),markerY,markerZ,.019,.045,.076,darkTrim);
    squab('amber side marker lens',s*(sideX(markerZ,markerY)+.013),markerY,markerZ,.014,.036,.064,std(0xdeab57,.27,.23));
    // The fuel flap is on the left quarter, opposite the steering position.
    if(s===1) doorPath('fuel filler lid',[[-1.70,1.174],[-1.858,1.171],[-1.867,1.14],[-1.862,1.048],[-1.844,1.035],[-1.69,1.038],[-1.681,1.056],[-1.682,1.155],[-1.70,1.174]]);
  }

  // A gently bowed front face, with the bonnet nose rolled into the fascia.
  const endZ=(front,u)=>front ? 2.31-.065*(Math.abs(u)**3) : -2.32+.06*(Math.abs(u)**3);
  function hood(z,u) {
    const a=Math.abs(u),outer=sideX(z,top(z));
    const edgeCrown=(1-a*a)*(.023+.010*smooth(z,1.95,2.27));
    const ridge=.017*Math.exp(-Math.pow((a-.72)/.102,2))*(.30+.70*Math.sin(Math.PI*clamp((z-.73)/1.60,0,1))**.7);
    return V(u*outer,top(z)+edgeCrown+ridge,z);
  }
  const windshieldBase=u=>1.02-.208*Math.abs(u)**2.2;
  grid('crowned bonnet and front fender shoulders',62,62,(x,t)=>{
    const u=2*x-1,z=mix(windshieldBase(u)-.068,endZ(true,u),t);
    return hood(z,u);
  },paint,V(0,1,0));
  for(const s of [-1,1]){
    edge('bonnet perimeter shut line',t=>{
      const a=.733+.09*t,z=mix(.905,2.275,t);
      const p=hood(z,a*s);p.y+=.002;return p;
    },.0033,panelGap,50);
  }
  grid('front fascia substrate',48,8,(u,v)=>{
    const a=2*u-1,z=endZ(true,a);
    const p=hood(z,a);
    return V(p.x,mix(.76,p.y,v),z-.006*(1-v));
  },paint,V(0,0,1));
  grid('tailgate inner panel',54,20,(u,v)=>{
    const a=2*u-1,y=mix(.64,1.29,v);
    const z=endZ(false,a)+.022*(1-smooth(y,.655,.75))+.012*Math.exp(-Math.pow((y-.827)/.028,2));
    return V(a*sideX(z0,Math.min(y,top(z0))),y,z);
  },paint,V(0,0,-1));

  // Side glass apertures are cut out of the actual cabin framework. Narrow
  // stamped pillars connect the roof, quarter panel, scuttle and door frames.
  const cabWidth=(y,z)=>{
    const t=clamp((y-1.277)/.559,0,1);
    const base=sideX(clamp(z,z0,.86),top(clamp(z,z0,.86)));
    return mix(base,.78,t*.90+t*t*.10)+.014*Math.sin(Math.PI*t);
  };
  const cabP=(s,z,y,d=0)=>V(s*(cabWidth(y,z)+d),y,z);
  const cabOutline=[[-2.26,1.252],[-2.244,1.43],[-2.185,1.662],[-2.104,1.77],[-2.03,1.832],[-1.92,1.845],[-.07,1.845],[.085,1.81],[.246,1.743],[.474,1.608],[.812,1.296],[.831,1.277],[.49,1.282],[-.75,1.280],[-1.76,1.265]];
  const openings=[
    [[-2.133,1.328],[-2.112,1.484],[-2.057,1.643],[-1.989,1.744],[-1.90,1.785],[-1.208,1.792],[-1.264,1.32],[-2.025,1.308]],
    [[-1.232,1.32],[-1.178,1.794],[-.423,1.80],[-.404,1.32]],
    [[-.326,1.32],[-.347,1.800],[-.105,1.800],[.03,1.778],[.166,1.719],[.359,1.595],[.656,1.363],[.67,1.325]]
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
  function sidePoly(sign,name,shape,mat,offset,depthVariation=0) {
    const geo=new THREE.ShapeGeometry(shape,8),attr=geo.attributes.position;
    for(let i=0;i<attr.count;i++){
      const z=attr.getX(i),y=attr.getY(i);
      attr.setXYZ(i,sign*(cabWidth(y,z)+offset+depthVariation*Math.sin(Math.PI*clamp((y-1.32)/.48,0,1))),y,z);
    }
    if(sign===1){
      const idx=geo.index.array;
      for(let i=0;i<idx.length;i+=3) [idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];
    }
    geo.computeVertexNormals();return part(name,geo,mat);
  }
  function traceShape(sign,name,shape,radius,mat,offset){
    const pts=shape.getSpacedPoints(100).map(p=>cabP(sign,p.x,p.y,offset));
    return tube(name,pts,radius,mat,100);
  }
  const glassNames=['rear quarter','rear door','front door'];
  for(const s of [-1,1]){
    const outline=rounded(cabOutline,.022);
    const shapes=openings.map((a,i)=>rounded(a,i===0?.040:.018));
    for(const shape of shapes) outline.holes.push(shape);
    sidePoly(s,'painted side pillars and window frames',outline,paint,0);
    for(let i=0;i<shapes.length;i++){
      sidePoly(s,glassNames[i]+' curved tinted glass',shapes[i],i===2?driverGlass:privacyGlass,-.003);
      traceShape(s,glassNames[i]+' black weatherstrip',shapes[i],i===0?.0085:.0078,rubber,.002);
    }
    sidePoly(s,'satin black B pillar',rounded([[-.405,1.316],[-.425,1.804],[-.341,1.805],[-.317,1.315]],.004),darkTrim,.002);
    sidePoly(s,'quarter glass division',rounded([[-1.268,1.32],[-1.211,1.796],[-1.176,1.796],[-1.231,1.318]],.001),darkTrim,.002);
    edge('vent window division',u=>cabP(s,mix(-.964,-.935,u),mix(1.323,1.792,u),.002),.0065,rubber,12);
    edge('upper door belt moulding',u=>{
      const z=mix(-1.26,.732,u),y=mix(1.303,1.307,u);
      return cabP(s,z,y,.004);
    },.006,rubber,50);
    // Dark smoke acrylic deflectors following the top two door frames.
    sidePoly(s,'rear door smoked rain visor',rounded([[-1.174,1.786],[-.435,1.793],[-.424,1.742],[-.48,1.725],[-1.161,1.730],[-1.183,1.746]],.013),deflectorGlass,.020);
    sidePoly(s,'front door smoked rain visor',rounded([[-.326,1.792],[-.112,1.792],[.028,1.772],[.168,1.707],[.34,1.593],[.50,1.467],[.486,1.456],[.286,1.596],[.128,1.679],[-.018,1.722],[-.312,1.738]],.011),deflectorGlass,.020);
    // Distinct stepped black D-pillar pressure relief grille.
    sidePoly(s,'rear quarter vent housing',rounded([[-2.214,1.31],[-2.201,1.385],[-2.157,1.407],[-2.104,1.395],[-2.078,1.32]],.012),rubber,.004);
    for(let k=0;k<4;k++){
      const y=1.328+k*.015;
      edge('quarter vent louvre',u=>cabP(s,mix(-2.206+k*.002,-2.09-k*.003,u),y,.008),.003,darkTrim,6);
    }
    traceShape(s,'rear door window frame joint',rounded([[-1.273,1.304],[-1.207,1.816],[-.405,1.823],[-.379,1.303]],.012),.0022,panelGap,.004);
  }

  const linearProfile=(v,points)=>{
    if(v<=points[0][0])return points[0][1];
    for(let i=1;i<points.length;i++){
      if(v<=points[i][0])return mix(points[i-1][1],points[i][1],(v-points[i-1][0])/(points[i][0]-points[i-1][0]));
    }
    return points.at(-1)[1];
  };
  function frontSurface(a,h,d=0){
    const y=mix(1.296,1.836,h);
    const sideZ=linearProfile(y,[[1.296,.812],[1.608,.474],[1.743,.246],[1.81,.085],[1.836,-.024]]);
    return V(a*cabWidth(y,sideZ),y+(1-a*a)*mix(.019,.022,h)+d*.65,sideZ+(1-Math.abs(a)**2.2)*mix(.208,.12,h)+d);
  }
  function rearSurface(a,h,d=0){
    const y=mix(1.252,1.836,h);
    const sideZ=linearProfile(y,[[1.252,-2.26],[1.43,-2.244],[1.662,-2.185],[1.77,-2.104],[1.836,-2.025]]);
    return V(a*cabWidth(y,sideZ),y+(1-a*a)*mix(.022,.016,h)+d*.24,sideZ-(1-Math.abs(a)**3)*.064-d);
  }
  function glazedEnd(name,surface,glass,front,lower,upper,width){
    const normal=V(0,.24,front?1:-1);
    // Radius the four corners by narrowing the final few centimetres of pane.
    const widthAt=v=>width-.023*Math.pow(Math.abs(v*2-1),14);
    const at=(a,v,off=0)=>surface(a*widthAt(v),mix(lower,upper,v),off);
    grid(name+' glazing',34,19,(u,v)=>at(u*2-1,v),glass,normal);
    grid(name+' header',34,5,(u,v)=>surface(2*u-1,mix(upper,1,v)),paint,normal);
    grid(name+' lower frame',34,5,(u,v)=>surface(2*u-1,mix(0,lower,v)),paint,normal);
    for(const s of [-1,1]){
      grid(name+' outer pillar',8,26,(u,v)=>surface(s*mix(widthAt(v),1,u),mix(lower,upper,v)),paint,normal);
      edge(name+' side weatherstrip',t=>at(s,t,.001),.0105,rubber,38);
    }
    for(const v of [0,1])edge(name+' perimeter weatherstrip',u=>at(2*u-1,v,.001),.0105,rubber,40);
    return at;
  }
  const wind=glazedEnd('windscreen',frontSurface,frontGlass,true,.035,.932,.946);
  const rear=glazedEnd('heated rear screen',rearSurface,backGlass,false,.084,.884,.864);

  // Roof crown, stamped channels and narrow flush roof-gutter strips.
  function roof(a,v,offset=0){
    const front=frontSurface(a,1),rear=rearSurface(a,1);
    const z=mix(rear.z,front.z,v);
    const crown=1-Math.abs(a)**2.7;
    const bow=.010*Math.sin(Math.PI*v)**.8;
    const groove=.0045*Math.exp(-(((Math.abs(a)-.66)/.031)**2))*Math.sin(Math.PI*v)**1.35;
    return V(a*mix(Math.abs(rearSurface(1,1).x),Math.abs(frontSurface(1,1).x),v),mix(rear.y,front.y,v)+.022*crown+bow*crown-groove+offset,z);
  }
  grid('gently crowned roof pressing',70,48,(u,v)=>roof(2*u-1,v),paint,V(0,1,0));
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

  // A restrained but dimensional right-hand-drive interior, visible through
  // the windscreen and front door windows.
  const interiorFloor=box('cab floor and carpet',0,.795,-.61,1.53,.043,3.16,seatInsert);
  interiorFloor.receiveShadow=true;
  squab('cargo interior trim',0,1.010,-1.91,1.42,.33,.46,charcoal);
  squab('rear luggage cover',0,1.245,-1.69,1.51,.044,.89,seatMaterial);
  for(const s of [-1,1]){
    for(const z of [-1.13,-.065]){
      const row=z<-.5?'second row':'front';
      squab(row+' seat cushion',s*.399,.962,z,.49,.164,.52,seatMaterial);
      const back=squab(row+' shaped seatback',s*.399,1.211,z-.19,.48,.52,.135,seatMaterial);
      back.rotation.x=-.10;
      const insert=squab(row+' upholstered seat insert',s*.399,1.207,z-.119,.329,.40,.021,seatInsert);
      insert.rotation.x=-.10;
      for(const q of [-1,1])box('head restraint post',s*.399+q*.058,1.495,z-.217,.012,.086,.012,polished);
      const rest=squab(row+' head restraint',s*.399,1.555,z-.227,.268,.178,.139,seatMaterial);
      rest.rotation.x=-.12;
    }
    squab('door inner trim',s*.79,1.102,-.266,.06,.27,1.94,charcoal);
    tube('A-pillar grab handle',[V(s*.745,1.685,.235),V(s*.714,1.666,.253),V(s*.718,1.599,.35),V(s*.772,1.577,.39)],.0115,lining,15);
  }
  squab('dashboard top pad',0,1.235,.638,1.6,.162,.448,charcoal);
  squab('instrument binnacle',-.395,1.31,.573,.466,.139,.234,darkTrim);
  const steering=new THREE.Group();steering.name='right-hand-drive steering wheel';
  steering.position.set(-.397,1.244,.377);steering.rotation.x=-.45;group.add(steering);
  const wheelRim=new THREE.Mesh(new THREE.TorusGeometry(.167,.015,10,58),charcoal);
  steering.add(wheelRim);
  const wheelHub=new THREE.Mesh(new THREE.BoxGeometry(.118,.082,.048),darkTrim);
  steering.add(wheelHub);
  for(const ang of [-.04,Math.PI+.04,-.96,-Math.PI+.96]){
    const spoke=new THREE.Mesh(new THREE.CylinderGeometry(.012,.015,.132,8),charcoal);
    spoke.rotation.z=ang-Math.PI/2;spoke.position.set(Math.cos(ang)*.098,Math.sin(ang)*.098,0);
    steering.add(spoke);
  }
  squab('center console',0,.998,.057,.213,.226,.516,charcoal);
  tube('gear selector',[V(-.027,1.079,.124),V(-.031,1.171,.142)],.013,darkTrim,5);
  squab('selector knob',-.031,1.169,.145,.05,.057,.052,charcoal);
  squab('rear view mirror',0,1.711,.159,.217,.067,.034,darkTrim);
  tube('interior mirror stem',[V(0,1.732,.153),V(0,1.789,.168)],.009,darkTrim,6);

  // The upper liftgate and lower drop gate are split across the rear face.
  const gatePoint=(a,y,d=.003)=>V(a*sideX(z0,y),y,endZ(false,a)+.012*Math.exp(-Math.pow((y-.827)/.028,2))-d);
  for(const s of [-1,1]){
    edge('rear liftgate vertical joint',u=>gatePoint(s*.771,mix(.704,1.28,u)),.0035,panelGap,34);
  }
  edge('split tailgate seam',u=>gatePoint(mix(-.772,.772,u),.831,.004),.004,panelGap,46);
  edge('rear gate lower moulding',u=>gatePoint(mix(-.766,.766,u),.771,.004),.006,paint,46);
  return group;
}
