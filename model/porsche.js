// 992.2 Carrera coupé, EU launch specification. The axle midpoint is the
// origin, +Z is forward and the wheels and running gear belong to the rig.
export function buildPorsche(T) {
  const body = new T.Group();
  body.name = '911 Carrera | coachwork and cabin';
  const v = (x,y,z) => new T.Vector3(x,y,z);
  const mix = T.MathUtils.lerp;
  const clamp = T.MathUtils.clamp;
  const smooth = T.MathUtils.smoothstep;
  const pi = Math.PI;
  const paint = new T.MeshPhysicalMaterial({name:'Guards Red enamel',color:0xaf1414,roughness:.235,metalness:.27,clearcoat:1,clearcoatRoughness:.11,side:T.DoubleSide});
  const mat = (name,color,roughness,metalness=0) => new T.MeshStandardMaterial({name,color,roughness,metalness,side:T.DoubleSide});
  const rubber = mat('Seals and shadow gaps',0x101416,.76);
  const black = mat('Graphite aero mouldings',0x20272a,.48,.22);
  const carbon = mat('Diffuser and wheel liners',0x202224,.83,.07);
  const chrome = mat('Brushed alloy',0xaeb5b6,.25,.84);
  const silver = mat('Optical aluminium',0xc2cbd1,.18,.72);
  const lamp = mat('Daytime light guides',0xddeaf2,.17,.14);
  lamp.emissive.setHex(0x9cb6c9); lamp.emissiveIntensity=.39;
  const ruby = mat('Tail-light lenses',0x810808,.21,.25);
  const lightRed = mat('Rear LED filaments',0xff3325,.19,.13);
  lightRed.emissive.setHex(0xe6190d); lightRed.emissiveIntensity=.62;
  const leather=mat('Anthracite leather',0x23262a,.72,.02);
  const optical=mat('Machined projector bowls',0x63717a,.22,.61);
  const midLeather=mat('Seat panel leather',0x3d3e3e,.68,.04);
  const glass = new T.MeshPhysicalMaterial({name:'Cool grey laminated glass',color:0x304654,roughness:.13,metalness:.16,clearcoat:1,clearcoatRoughness:.12,transparent:true,opacity:.58,depthWrite:false,side:T.DoubleSide});
  const lampGlass = new T.MeshPhysicalMaterial({name:'Clear headlamp cover',color:0x9bb4c2,roughness:.075,metalness:.06,clearcoat:1,transparent:true,opacity:.17,depthWrite:false,side:T.DoubleSide});
  const tailGlass = mat('Smoked light channel',0x241c20,.23,.36);
  const polishedBlack = mat('High gloss black',0x172128,.22,.37);
  const gold = mat('Gold crest',0xca9a45,.31,.68);
  const assign = (name,geometry,material,parent=body) => {
    const mesh = new T.Mesh(geometry,material);
    mesh.name=name; parent.add(mesh); return mesh;
  };
  const dimensions=new WeakMap();
  function panel(name,cols,rows,point,material,out,omit) {
    const xyz=[],uv=[],index=[];
    for(let j=0;j<=rows;j++) for(let i=0;i<=cols;i++){
      const p=point(i/cols,j/rows); xyz.push(p.x,p.y,p.z); uv.push(i/cols,j/rows);
    }
    const base=point(.463,.476);
    const n=point(.464,.476).sub(base).cross(point(.463,.477).sub(base));
    const reverse=out && n.dot(out)<0;
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      if(omit && omit((i+.5)/cols,(j+.5)/rows)) continue;
      const a=j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;
      if(reverse)index.push(a,c,b,b,c,d); else index.push(a,b,c,b,d,c);
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setIndex(index);g.computeVertexNormals();const mesh=assign(name,g,material);dimensions.set(mesh,[cols,rows]);return mesh;
  }
  function line(name,points,radius,material,closed=false,samples=points.length*2){
    const c=new T.CatmullRomCurve3(points,closed,'centripetal');
    return assign(name,new T.TubeGeometry(c,samples,radius,radius<.008?4:6,closed),material);
  }
  function trace(name,n,fn,r,material,closed=false){
    return line(name,Array.from({length:closed?n:n+1},(_,i)=>fn(i/n)),r,material,closed,n);
  }
  function ellipsoid(name,center,radii,material,segments=24){
    const mesh=assign(name,new T.SphereGeometry(1,segments,Math.max(7,Math.floor(segments*.41))),material);
    mesh.position.copy(center);mesh.scale.set(...radii);return mesh;
  }
  function block(name,center,size,material){
    const mesh=assign(name,new T.BoxGeometry(...size),material); mesh.position.copy(center);return mesh;
  }
  // Nonuniform Hermite stations with zero tangent at slope reversals. The
  // signed profile derivatives give the continuous reflections along a wing.
  function profile(points){
    const slopes=points.slice(1).map(([x,y],i)=>(y-points[i][1])/(x-points[i][0]));
    const tangent=points.map((_,i)=>{
      if(!i)return slopes[0]; if(i===slopes.length)return slopes[i-1];
      const l=slopes[i-1],r=slopes[i];return l*r>0 ? 2*l*r/(l+r):0;
    });
    return x=>{
      if(x<=points[0][0])return points[0][1];
      for(let i=0;i<slopes.length;i++){
        const [a,y]=points[i],[b,k]=points[i+1];if(x>b)continue;
        const h=b-a,t=(x-a)/h,s=t*t,u=s*t;
        return (2*u-3*s+1)*y+(u-2*s+t)*h*tangent[i]+(3*s-2*u)*k+(u-s)*h*tangent[i+1];
      }
      return points.at(-1)[1];
    };
  }
  const rearZ=-2.309,frontZ=2.233;
  const width=profile([[rearZ,.811],[-2.03,.886],[-1.62,.9254],[-1.22,.9304],[-.91,.9246],[-.55,.883],[-.28,.863],[.13,.856],[.56,.876],[.93,.910],[1.25,.921],[1.55,.917],[1.83,.887],[2.05,.850],[frontZ,.775]]);
  const waist=profile([[rearZ,.709],[-2.00,.745],[-1.6,.783],[-1.23,.806],[-.93,.772],[-.62,.742],[-.20,.725],[.40,.728],[.84,.740],[1.24,.75],[1.56,.704],[1.82,.622],[2.05,.538],[frontZ,.461]]);
  const spine=profile([[rearZ,.713],[-2.06,.758],[-1.78,.83],[-1.44,.841],[-.66,.816],[.22,.813],[.73,.815],[.96,.823],[1.18,.785],[1.47,.701],[1.78,.613],[2.03,.532],[frontZ,.464]]);
  const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2)); 
  const skinX=(z,y)=>width(z)-.064*(1-smooth(y,.158,.405))-.014*smooth(y,.48,.825);
  const qFront=z=>smooth(z,1.63,frontZ), qRear=z=>1-smooth(z,rearZ,-1.72);
  // Rolled shoulders carry a steep but continuous tangent from a nearly
  // horizontal deck down into each side. The wheel arch stays exactly clear.
  const shoulderRoll=z=>.026+.016*gauss(z,-1.22,.68)+.008*gauss(z,1.22,.63);
  const sectionWidth=z=>skinX(z,waist(z)-shoulderRoll(z));
  const rolledEdge=(r,start,power)=>{
    const t=clamp((r-start)/(1-start),0,1),e=.994;
    return (1-Math.sqrt(1-e*t**power))/(1-Math.sqrt(1-e));
  };
  function planZ(a,z){
    const r=Math.abs(a);
    const turn=rolledEdge(r,0,2.45);
    return z-qFront(z)*(.054+.302*turn)+qRear(z)*(.035+.231*turn);
  }
  function top(a,z){
    const r=Math.abs(a),edge=waist(z);
    const crown=1-r**2.35;
    const hump=.132*gauss(z,1.44,.64)+.103*gauss(z,-1.31,.66)+.025*gauss(z,-.40,.69);
    const ridge=(gauss(r,.778,.174)-gauss(1,.778,.174)*r**3.5)*r**.48;
    return v(a*sectionWidth(z),mix(edge,spine(z),crown)+hump*ridge-shoulderRoll(z)*rolledEdge(r,.84,1.7),planZ(a,z));
  }
  const wheelClear=z=>{
    const front=z>0,cap=front?.328:.349,axle=front?1.225:-1.225;
    const dist=Math.abs(z-axle),radius=front?.366:.389;
    const base=.170+.031*smooth(Math.abs(z),1.69,2.12);
    // Vertical tangents at 3/9 o'clock flow into a short nearly vertical
    // return as the bumper and sill continue below the wheel centre.
    if(dist<radius) return cap+Math.sqrt(radius*radius-dist*dist);
    return mix(cap,base,smooth(dist,radius,radius+.048));
  };
  function panelJoint(sign,z,y,offset=.003){
    const shoulder=top(sign,z);
    if(y<=shoulder.y)return v(sign*(skinX(z,y)+offset),y,z);
    // Door seams rise off the side and turn over the quarter panel onto the
    // shoulder. Project the sampled curve onto both sheets to avoid floating
    // or disappearing into the panel as its transverse crown changes.
    let inner=.65,outer=1;
    for(let i=0;i<15;i++){
      const r=(inner+outer)*.5;
      if(top(r,z).y>y) inner=r;else outer=r;
    }
    const p=top(sign*(inner+outer)*.5,z);p.x+=sign*offset*.6;p.y+=offset*.7;return p;
  }
  function wall(sign,z,t,off=0){
    const end=top(sign,z),lower=wheelClear(end.z);
    const y=mix(lower,end.y,t);
    return v(sign*(skinX(z,y)+off),y,end.z);
  }
  const cabinStart=-1.51,cabinEnd=.755;
  const baseW=t=>.721+.060*Math.sin(pi*t)**.66-.016*t;
  function baseY(t) {
    const z=mix(cabinStart,cabinEnd,t);
    return top(baseW(t)/sectionWidth(z),z).y;
  }
  const windArc=a=>Math.sqrt(Math.max(0,1-Math.abs(a)**3.3));
  const cowl=baseY(1),aftBelt=baseY(0);
  function sideWindow(s,t,h,off=0){
    const eaveY=mix(1.176,1.187,t)+.0574*Math.sin(pi*t);
    const widthAtTop=.562+.038*Math.sin(pi*t)+.009*t;
    const x=mix(baseW(t),widthAtTop,.74*h+.26*h*h)+.012*Math.sin(pi*h);
    const front=mix(cabinEnd,.104,h)+.041*Math.sin(pi*h),rear=mix(cabinStart,-.746,h)-.047*Math.sin(pi*h);
    return v(s*(x+off),mix(baseY(t),eaveY,h),mix(rear,front,t));
  }
  function endScreen(a,h,front,offset=0){
    const sign=front?1:-1,edge=sideWindow(1,front?1:0,h),round=windArc(a);
    const baseCenter=front? .990:-1.762;
    const endCenter=front? .213:-.876;
    const bow=mix(Math.abs(baseCenter-(front?cabinEnd:cabinStart)),Math.abs(endCenter-(front?.104:-.746)),h);
    const deltaBase=spine(baseCenter)-(front?cowl:aftBelt);
    return v(a*edge.x,edge.y+round*mix(deltaBase,.063,h)+offset*.53,edge.z+sign*(round*bow+offset));
  }
  function cabinHole(u,t){
    const a=2*u-1,z=mix(rearZ,frontZ,t),p=top(a,z),xx=Math.abs(p.x),sideT=clamp((p.z-cabinStart)/(cabinEnd-cabinStart),0,1);
    if(xx>=baseW(sideT)-.045) return false;
    const back=endScreen(Math.min(.999,xx/baseW(0)),0,false).z+.037;
    const front=endScreen(Math.min(.999,xx/baseW(1)),0,true).z-.037;
    return p.z>back && p.z<front;
  }
  panel('Continuous sculpted front wings and rear haunches',64,138,(u,t)=>top(2*u-1,mix(rearZ,frontZ,t)),paint,v(0,1,0),cabinHole);
  for(const s of [-1,1]){
    panel('Quarter panels and door skin with cut wheel openings',150,12,(u,t)=>wall(s,mix(rearZ,frontZ,u),t),paint,v(s,0,0));
    panel('Folded rocker and arch returns',150,3,(u,t)=>{
      const p=wall(s,mix(rearZ,frontZ,u),0);p.x-=s*.104*t;p.y+=.017*t;return p;
    },carbon,v(0,-1,0));
    for(const axle of [-1.225,1.225]){
      const front=axle>0,range=front?.405:.428;
      trace('Rolled painted wheel-arch flange',62,t=>wall(s,axle+range*(2*t-1),0,.0006),.0038,paint);
      panel('Curved acoustical wheel housing',55,5,(u,t)=>{
        const z=axle+range*(2*u-1),p=wall(s,z,0);
        p.x-=s*(.024+.233*t);p.y+=.020+.038*Math.sin(pi*t*.83);return p;
      },carbon,v(0,-1,0));
    }
    const sideAt=(z,y,offset=.002)=>v(s*(skinX(z,y)+offset),y,z);
    const path=new T.CatmullRomCurve3([[.715,.806],[.689,.745],[.672,.663],[.655,.57],[.622,.301],[.594,.239],[.520,.222],[-.558,.219],[-.684,.239],[-.724,.315],[-.735,.465],[-.716,.646],[-.677,.720],[-.605,.782]].map(([z,y])=>v(0,y,z)));
    trace('Coupé door shut line',85,t=>{const p=path.getPoint(t);return panelJoint(s,p.z,p.y);},.0023,rubber);
    trace('Rocker blade',48,t=>{const z=mix(-.788,.803,t);return sideAt(z,.195+.013*(2*t-1)**2,.007);},.012,black);
    const handle=ellipsoid('Flush extending door handle',sideAt(-.467,.679,.003),[.009,.020,.091],polishedBlack);
    handle.rotation.x=-.045;
    ellipsoid('Body-colour handle blade',sideAt(-.467,.682,.010),[.005,.012,.083],paint);
    if(s<0)trace('Front wing fuel flap',44,t=>{
      const a=t*2*pi,z=1.025+.078*Math.cos(a),y=.735+.045*Math.sin(a);return panelJoint(s,z,y,.002);
    },.0018,rubber,true);
  }
  const projectDeck=(x,z)=>{
    const a=clamp(x/sectionWidth(z),-1,1);return top(a,z);
  };
  for(const s of [-1,1]){
    trace('Bonnet lid shut line',61,t=>{
      const z=mix(.891,2.092,t),x=s*mix(.605,.449,t**.75);
      const p=projectDeck(x,z);p.y+=.0006;return p;
    },.0026,rubber);
    trace('Drawn inner bonnet flute',48,t=>{
      const z=mix(1.035,2.04,t),p=projectDeck(s*mix(.487,.396,t),z);p.y+=.0011;return p;
    },.0018,paint);
  }
  trace('Front lid rolled lip',42,t=>{const a=(2*t-1)*.449,z=2.098-.006*(Math.abs(a)/.449)**2;const p=projectDeck(a,z);p.y+=.001;return p;},.0027,rubber);
  function roof(a,t){
    const rear=endScreen(a,1,false),front=endScreen(a,1,true),edge=sideWindow(1,t,1),round=windArc(a);
    return v(a*edge.x,edge.y+.063*round,mix(rear.z,front.z,t));
  }
  panel('Arched aluminium roof',38,26,(u,t)=>roof(2*u-1,t),paint,v(0,1,0));
  // Frit bands, roof posts and wraparound seals are separate from the actual
  // curved glass, so the interior is visible through an open aperture.
  for(const front of [true,false]){
    const normal=v(0,.7,front?1:-1),lower=front?.043:.055,upper=front?.947:.895;
    const fullWidth=front?.950:.908;
    const widthAt=h=>fullWidth-.060*Math.abs(2*h-1)**10;
    const glassAt=(a,h,d=0)=>endScreen(a*widthAt(h),mix(lower,upper,h),front,d);
    panel(front?'Swept windscreen':'Sloping heated rear window',38,19,(u,t)=>glassAt(2*u-1,t),glass,normal);
    panel('Upper screen header',34,4,(u,t)=>endScreen(2*u-1,mix(upper,1,t),front),paint,normal);
    panel('Lower screen surround',38,4,(u,t)=>endScreen(2*u-1,mix(0,lower,t),front),paint,normal);
    for(const s of [-1,1]){
      panel(front?'Curved A-pillar':'Sloping rear roof pillar',7,32,(u,h)=>endScreen(s*mix(widthAt(h),1,u),mix(lower,upper,h),front),paint,normal);
      trace('Screen side encapsulation',36,t=>glassAt(s,t,.0016),.0075,rubber);
    }
    for(const h of [0,1])trace('Screen transverse weatherstrip',54,t=>glassAt(2*t-1,h,.0016),.0075,rubber);
    if(!front) for(let j=0;j<10;j++){
      trace('Rear window heater',28,t=>glassAt(mix(-.95,.95,t),.088+j*.084,.0013),.0007,midLeather);
    }
    if(front)for(const [lo,hi,pivot] of [[-.89,-.012,-.36],[-.019,.86,.69]]){
      const w=(a,h)=>glassAt(a,h,.010);
      line('Parked wiper arm',[w(pivot,.024),w((lo+hi+2*pivot)/4,.056),w((lo+hi)/2,.081)],.0055,black);
      trace('Wiper blade',26,t=>w(mix(lo,hi,t),.045+.032*Math.sin(pi*t)),.0057,rubber);
    }
  }
  for(const s of [-1,1]){
    const start=h=>.030+.100*(1-h)**3+.027*h**7,end=h=>.965-.048*(1-h)**4-.035*h**5;
    const opening=(u,h,d=0)=>sideWindow(s,mix(start(h),end(h),u),mix(.055,.93,h),d);
    panel('Curved door and quarter glazing',44,15,(u,h)=>opening(u,h,-.001),glass,v(s,0,0));
    for(const [a,b,edge] of [[0,.055,'Beltline'],[.93,1,'Roof gutter']])
      panel(edge,45,5,(u,h)=>sideWindow(s,u,mix(a,b,h)),paint,v(s,0,0));
    for(const rear of [true,false]){
      panel(rear?'Broad swept C pillar':'A pillar return',7,23,(u,h)=>sideWindow(s,rear?mix(0,start(h),u):mix(end(h),1,u),mix(.055,.93,h)),paint,v(s,0,0));
      trace('Window surround',34,t=>opening(rear?0:1,t,.0015),.007,rubber);
    }
    for(const h of [0,1])trace('Satin window surround',48,t=>opening(t,h,.0015),.0075,black);
    panel('Black B pillar',4,18,(u,h)=>sideWindow(s,mix(.394,.337,h)+.025*u,mix(.055,.93,h),.004),polishedBlack,v(s,0,0));
    trace('Roof gutter joint',38,t=>roof(s*.976,t),.0025,black);
    const foot=sideWindow(s,.945,.118);
    line('Two-piece mirror pedestal',[foot,v(s*.818,.858,.587),v(s*.908,.904,.589)],.020,black,false,12);
    const housing=ellipsoid('Painted teardrop mirror housing',v(s*.91983,.922,.582),[.098,.057,.114],paint);
    housing.rotation.y=s*.16;
    ellipsoid('Mirror black lower return',v(s*.922,.905,.578),[.089,.040,.097],black);
    ellipsoid('Framed mirror glass',v(s*.931,.923,.506),[.072,.036,.020],chrome);
  }
  function face(a,h,front,depth=0){
    const z=front?frontZ:rearZ,p=top(a,z),s=front?1:-1;
    const r=Math.abs(a),edge=wall(1,z,h);
    const centerBase=front?.152:.184,edgeBase=wheelClear(planZ(1,z));
    const lower=mix(centerBase,edgeBase,r**3);
    const push=(front?.054:.032)*Math.sin(pi*h)**.72;
    const round=1-rolledEdge(r,0,2.45);
    // By construction the last column shares the side surface at EVERY
    // height, including the tucked rocker. There is no cap or daylight slit.
    const span=sectionWidth(z)+(edge.x-sectionWidth(z))*r**2+.012*Math.sin(pi*h)*round;
    const plateRecess=front ? 0 : .025*(1-smooth(r,.327,.40))*smooth(h,.292,.399)*(1-smooth(h,.641,.755));
    return v(a*span,mix(lower,p.y,h),p.z+s*(push*round+depth-plateRecess));
  }
  function bumperWindow(a,h){
    const x=Math.abs(a);
    const inRounded=(left,right,low,high)=>{
      if(x<left || x>right || h<low || h>high)return false;
      // Rounded vertical ends to each intake rather than razor-cut rectangles.
      const dx=Math.max(left+.034-x,0,x-right+.034)/.034;
      const dy=Math.max(low+.085-h,0,h-high+.085)/.085;
      return dx*dx+dy*dy<1;
    };
    return inRounded(-.20,.575,.145,.735) || inRounded(.641,.936,.162,.767);
  }
  panel('Body-colour nose with open cooling apertures',104,37,(u,h)=>face(2*u-1,h,true),paint,v(0,0,1),
    (u,h)=>bumperWindow(2*u-1,h));
  panel('Recessed radiator surfaces behind the three open intakes',82,9,(u,t)=>face(mix(-.952,.952,u),mix(.106,.801,t),true,-.044),rubber,v(0,0,1));
  for(const [start,end] of [[-.929,-.649],[-.566,.566],[.649,.929]]){
    for(const h of [.231,.361,.490,.625]){
      panel('Horizontal graphite intake vane',22,3,(u,t)=>{
        const a=mix(start+.009,end-.009,u),p=face(a,h,true,-.018);p.y+=(t-.5)*.010;p.z+=.009*Math.sin(pi*t);return p;
      },black,v(0,.1,1));
    }
    for(let j=1;j<=Math.round((end-start)*18);j++){
      const a=mix(start,end,j/(Math.round((end-start)*18)+1));
      trace('Recessed radiator fin',4,t=>face(a,mix(.155,.731,t),true,-.037),.0025,carbon);
    }
  }
  panel('Front spoiler lip',54,4,(u,t)=>{
    const a=u*2-1,p=face(a,.011,true);p.y-=.011*(1-t);p.z+=.018*t-.012;return p;
  },black,v(0,.5,1));
  for(const s of [-1,1]){
    const lampPoint=(lx,ly,lift=0)=>{
      const q=1.819+.213*ly,x=s*(.710+.124*lx-.023*ly);
      const p=projectDeck(x,q);p.y+=lift;p.z+=lift*.68;return p;
    };
    const lampDisk=(r,a,lift)=>lampPoint(r*Math.cos(a),r*Math.sin(a),lift);
    panel('Oval headlamp inner mask',48,9,(u,t)=>lampDisk(t,2*pi*u,.006+.002*(1-t*t)),polishedBlack,v(0,1,1));
    trace('Flush oval headlamp gasket',60,t=>lampDisk(1,t*2*pi,.005),.006,rubber,true);
    trace('Optical surround bevel',54,t=>lampDisk(.917,t*2*pi,.009),.0035,silver,true);
    for(const [cx,cy] of [[-.37,-.34],[.36,-.34],[-.36,.35],[.35,.35]]){
      panel('Matrix LED reflector cup',18,4,(u,t)=>{
        const a=u*2*pi;
        return lampPoint(cx+t*.234*Math.cos(a),cy+t*.212*Math.sin(a),.012+.007*t);
      },optical,v(0,1,1));
      panel('Projector convex optic',16,4,(u,t)=>{
        const a=u*2*pi;return lampPoint(cx+t*.174*Math.cos(a),cy+t*.139*Math.sin(a),.019+.009*(1-t*t));
      },polishedBlack,v(0,1,1));
      panel('Four-point LED signature',11,2,(u,t)=>{
        const x=mix(-.156,.159,u);
        const y=cy+(cy>0?.128:-.131)+.025*Math.sin(pi*u)+(t-.5)*.043;
        return lampPoint(cx+x,y,.033);
      },lamp,v(0,1,1));
    }
    panel('Clear flush headlamp lens',48,10,(u,t)=>lampDisk(t,u*2*pi,.010+.022*(1-t*t)),lampGlass,v(0,1,1));
  }
  const crestPoint=(x,z,lift=.003)=>{const p=projectDeck(x,z);p.y+=lift;return p;};
  panel('Porsche enamel bonnet crest',9,10,(u,t)=>{
    const w=.023*Math.sqrt(t)*(.92+.08*t);return crestPoint((u*2-1)*w,2.029-.053*t);
  },gold,v(0,1,0));
  for(const x of [-.012,.011])for(const z of [1.988,1.999])
    trace('Enamel crest inlay',4,t=>crestPoint(x+mix(-.006,.006,t),z,.005),.0017,ruby);
  panel('Integrated rear bumper skin',64,19,(u,t)=>face(2*u-1,t,false),paint,v(0,0,-1));
  panel('Black lower rear valance',72,10,(u,t)=>{
    const a=mix(-.98,.98,u),p=face(a,t*(.309+.047*Math.abs(a)**3),false,.003);p.y-=.008*(1-t);return p;
  },black,v(0,-.2,-1));
  const tail=(a,d=0)=>{
    const t=Math.abs(a),s=Math.sign(a)||1,corner=.958;
    if(t<=corner){
      const u=t/corner,p=face(s*u,.919+.025*u*u,false,d+.005);
      return p;
    }
    const u=(t-corner)/(1-corner),q=mix(rearZ,-2.165,u);
    const p=wall(s,q,.944+.010*u,d+.004);
    p.z-=.005*(1-u);
    return p;
  };
  panel('Full width smoked rear light bar',80,6,(u,t)=>{
    const a=2*u-1,p=tail(a,.003);p.y+=(t-.52)*(.065-.021*Math.abs(a)**6);
    p.z-=.006*Math.sin(pi*t);return p;
  },tailGlass,v(0,0,-1));
  for(const s of [-1,1]){
    panel('Wrapped rear quarter light',36,7,(u,t)=>{
      const a=s*mix(.762,.998,u),p=tail(a,.010);
      p.y-=.006+(1-t)*.038*Math.sin(pi*u*.89);p.z-=.002*t;return p;
    },ruby,v(s*.5,0,-1));
    trace('Additional rear corner LED',31,t=>{const p=tail(s*mix(.791,.984,t),.014);p.y-=.016;return p;},.0037,lightRed);
  }
  trace('Continuous red LED at engine lid trailing edge',102,t=>tail(2*t-1,.013),.0054,lightRed);
  for(const s of [-1,1]){
    // The tips follow the plan curvature of the valance and are tucked into
    // its lower panel, so the far pipe remains attached at oblique angles.
    const hoop=(a,r,d)=>face(s*.719+r*.086*Math.cos(a),.205+r*.087*Math.sin(a),false,d);
    panel('Black exhaust interior',24,4,(u,t)=>hoop(2*pi*u,t*.91,.009),rubber,v(0,0,-1));
    panel('Twin exhaust tip bore',28,3,(u,t)=>hoop(2*pi*u,mix(.86,.91,t),mix(.018,.009,t)),black,v(0,0,-1));
    panel('Stainless oval exhaust rim',32,4,(u,t)=>hoop(2*pi*u,mix(.86,1,t),.019+.003*Math.sin(pi*t)),chrome,v(0,0,-1));
    trace('Rear bumper reflector',25,t=>{const p=face(s*mix(.62,.93,t),.388,false,.006);p.y-=.006;return p;},.0066,ruby);
  }
  for(const a of [-.52,-.32,-.105,.105,.32,.52]){
    const p=face(a,0,false);const fin=block('Rear diffuser strake',v(p.x,p.y+.009,p.z+.105),[.012,.051,.196],carbon);fin.rotation.x=-.110;
  }
  // Horizontal seams outline the retracted spoiler. The dismounted view sees
  // an open lower shell for the separately simulated rear engine and gearbox.
  trace('Retractable spoiler edge',56,t=>{
    const x=mix(-.791,.791,t),q=-2.128-.040*(1-(x/.8)**2),p=projectDeck(x,q);p.y+=.001;return p;
  },.0026,rubber);
  const grilleDeck=(a,t,lift=0)=>{
    const q=mix(-2.106,-1.766,t)+.038*a*a,x=a*mix(.557,.582,t),p=projectDeck(x,q);p.y+=lift;return p;
  };
  panel('Engine cover grille recess',38,12,(u,t)=>grilleDeck(2*u-1,t,.004),rubber,v(0,1,-.3));
  for(let i=-11;i<=11;i++)if(i){
    panel('Longitudinal engine grille vane',4,16,(u,t)=>grilleDeck(i/11.72+(u-.5)*.023,mix(.033,.961,t),.010+.002*Math.sin(pi*u)),black,v(0,1,-.2));
  }
  for(const s of [-1,1])trace('Centrally mounted vertical brake light',21,t=>grilleDeck(s*.016,mix(.086,.951,t),.011),.0058,lightRed);
  const glyph={
    P:[[[0,0],[0,1],[.8,1],[1,.82],[1,.59],[.8,.47],[0,.47]]],
    O:[[[.16,0],[0,.12],[0,.88],[.16,1],[.84,1],[1,.88],[1,.12],[.84,0],[.16,0]]],
    R:[[[0,0],[0,1],[.77,1],[1,.84],[1,.64],[.76,.48],[0,.48]],[[.53,.48],[1,0]]],
    S:[[[1,.95],[.83,1],[.19,1],[0,.83],[0,.65],[.17,.52],[.83,.48],[1,.34],[1,.15],[.82,0],[.13,0],[0,.08]]],
    C:[[[1,.87],[.86,1],[.18,1],[0,.84],[0,.16],[.18,0],[.86,0],[1,.11]]],
    H:[[[0,0],[0,1]],[[1,0],[1,1]],[[0,.48],[1,.48]]],
    E:[[[1,1],[0,1],[0,0],[1,0]],[[0,.48],[.82,.48]]],
  };
  for(const [i,char] of Array.from('PORSCHE').entries())for(const stroke of glyph[char]){
    const points=stroke.map(([x,y])=>{const a=(.210-i*.061-x*.038)/.886,p=tail(a,.017);p.y-=.022-y*.015;return p;});
    // Each short run is geometrically legible even on a texture-free renderer.
    for(let j=1;j<points.length;j++)line('Raised rear wordmark', [points[j-1],points[j]],.00125,chrome,false,2);
  }
  panel('Dark upholstered rear parcel shelf',22,10,(u,t)=>{
    const x=(2*u-1)*mix(.659,.686,t),z=mix(-1.68,-.714,t)+.12*(Math.abs(2*u-1)**3)*(1-t);
    return v(x,mix(.797,.670,t)-.018*(1-(2*u-1)**2),z);
  },leather,v(0,1,0));
  const plateRect=(x,y,d)=>face(x/.807,.485+y/.516,false,d);
  const plateMaterial=mat('European rear plate',0xd4d6d3,.55,.18);
  const blue=mat('Blue registration strip',0x263b74,.58,.15);
  panel('Registration plate frame',12,4,(u,t)=>plateRect((u-.5)*.472,(t-.5)*.110,.012),black,v(0,0,-1));
  panel('Registration plate',12,4,(u,t)=>plateRect((u-.5)*.460,(t-.5)*.097,.015),plateMaterial,v(0,0,-1));
  panel('Blue plate strip',2,4,(u,t)=>plateRect(.196+u*.031,(t-.5)*.097,.017),blue,v(0,0,-1));
  const digits={'S':glyph.S,'C':glyph.C,'A':[[[0,0],[.5,1],[1,0]],[[.21,.40],[.79,.40]]],
    '9':[[[.90,.55],[.73,.44],[.21,.44],[.08,.57],[.08,.89],[.23,1],[.73,1],[.90,.87],[.90,.22],[.72,0],[.23,0]]],
    '2':[[[0,.82],[.16,1],[.76,1],[.94,.84],[.91,.66],[0,0],[1,0]]]};
  for(const [i,ch] of Array.from('S CA 992').entries())for(const stroke of digits[ch]||[]){
    const pts=stroke.map(([x,y])=>plateRect(.167-i*.044-x*.030,(y-.5)*.061,.019));
    for(let j=1;j<pts.length;j++)line('Registration characters',[pts[j-1],pts[j]],.0028,rubber,false,2);
  }
  const floor=block('Carpeted cabin floor',v(0,.286,-.15),[1.37,.045,1.79],rubber);
  floor.rotation.x=-.012;
  ellipsoid('Wrapped instrument panel',v(0,.722,.577),[.713,.098,.189],leather,36);
  ellipsoid('Dashboard upper brow',v(.305,.788,.509),[.228,.072,.133],black);
  const display=block('Curved digital binnacle',v(.308,.781,.430),[.346,.097,.024],polishedBlack);display.rotation.x=.13;
  const pcm=block('Central infotainment glass',v(-.063,.717,.433),[.25,.102,.018],polishedBlack);pcm.rotation.x=-.08;
  block('Centre console',v(0,.483,-.053),[.185,.136,.721],leather);
  ellipsoid('PDK selector',v(0,.585,.138),[.025,.039,.043],chrome,16);
  for(const s of [-1,1]){
    const x=s*.344;
    ellipsoid('Leather sport seat base',v(x,.437,-.195),[.207,.076,.256],leather);
    ellipsoid('Perforated cushion insert',v(x,.477,-.188),[.142,.047,.206],midLeather);
    const back=ellipsoid('Sculpted sport seat back',v(x,.692,-.380),[.212,.272,.081],leather);back.rotation.x=-.17;
    const insert=ellipsoid('Perforated back insert',v(x,.690,-.324),[.145,.218,.047],midLeather);insert.rotation.x=-.17;
    ellipsoid('Integral head restraint',v(x,.929,-.410),[.121,.122,.068],leather);
    for(const direction of [-1,1])ellipsoid('Upright seat bolster',v(x+direction*.153,.688,-.320),[.054,.17,.080],leather,16);
    ellipsoid('Rear parcel trim',v(x,.681,-1.203),[.253,.072,.225],leather,16);
    ellipsoid('Inner door card',v(s*.720,.588,-.090),[.042,.147,.559],leather);
  }
  const wheelCenter=v(.315,.715,.300);
  const steer=a=>v(wheelCenter.x+.164*Math.cos(a),wheelCenter.y+.157*Math.sin(a),wheelCenter.z+.050*Math.sin(a));
  trace('Leather steering wheel',42,t=>steer(t*2*pi),.014,leather,true);
  ellipsoid('Steering boss',wheelCenter,[.065,.050,.033],leather,16);
  for(const a of [.08,pi-.08,1.5*pi])line('Steering wheel spoke',[wheelCenter,steer(a)],.014,chrome,false,7);
  function softenSeam(first,edgeA,second,edgeB){
    const edge=(m,axis)=>{
      const [nx,ny]=dimensions.get(m),at=m.geometry.attributes.normal;
      const alongU=axis[0]==='v',upper=axis[1]==='1',length=alongU?nx:ny;
      function index(i,layer){const across=upper?(alongU?ny:nx)-layer:layer;return alongU?across*(nx+1)+i:i*(nx+1)+across;}
      const saved=Array.from({length:length+1},(_,i)=>new T.Vector3().fromBufferAttribute(at,index(i,0)));
      const sample=t=>{const f=t*length,i=Math.min(length-1,Math.floor(f));return saved[i].clone().lerp(saved[i+1],f-i).normalize();};
      return {at,index,length,sample};
    };
    const a=edge(first,edgeA),b=edge(second,edgeB);
    for(const [self,other] of [[a,b],[b,a]])for(let i=0;i<=self.length;i++){
      const t=i/self.length,n=self.sample(t).add(other.sample(t)).normalize();
      for(const [layer,weight] of [[0,1],[1,.40],[2,.085]]){
        const k=self.index(i,layer),p=new T.Vector3().fromBufferAttribute(self.at,k).lerp(n,weight).normalize();
        self.at.setXYZ(k,p.x,p.y,p.z);
      }
    }
  }
  const deck=body.getObjectByName('Continuous sculpted front wings and rear haunches');
  const sides=body.children.filter(part=>part.name==='Quarter panels and door skin with cut wheel openings');
  const nose=body.getObjectByName('Body-colour nose with open cooling apertures');
  const tailSkin=body.getObjectByName('Integrated rear bumper skin');
  for(const [i,side] of sides.entries()){
    softenSeam(deck,'u'+i,side,'v1');
    softenSeam(side,'u0',tailSkin,'u'+i);
    softenSeam(side,'u1',nose,'u'+i);
  }
  softenSeam(deck,'v0',tailSkin,'v1');
  softenSeam(deck,'v1',nose,'v1');
  return body;
}
