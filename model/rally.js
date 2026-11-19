// 2025 GR Yaris Rally1. Distances in metres; front is +Z. The 2.630 m
// wheelbase, 1.875 m shell width and 4.225 m length include the aero devices.
// The paint scheme and gravel ride height are representative of competition trim.
export function buildRally(T) {
  const group=new T.Group();
  group.name='Toyota GR Yaris Rally1 competition body';
  const V=(x,y,z)=>new T.Vector3(x,y,z);
  const mix=T.MathUtils.lerp, sat=x=>Math.max(0,Math.min(1,x));
  const smooth=(lo,hi,x)=>T.MathUtils.smoothstep(x,lo,hi);
  const finish=(name,color,roughness,metalness=0,extra={})=>{
    const m=new T.MeshStandardMaterial({color,roughness,metalness,side:T.DoubleSide,...extra});
    m.name=name;return m;
  };
  const white=finish('Pearl white competition paint',0xe6e9e8,.27,.35);
  const red=finish('Rally vermilion',0xe72230,.29,.22);
  const black=finish('Piano black graphic',0x22252a,.30,.27);
  const carbon=finish('Exposed carbon composite',0x272b2e,.48,.27);
  const inside=finish('Intake and wheel arch interior',0x15191b,.85);
  const silver=finish('Machined alloy',0xbcc6c9,.26,.78);
  const steel=finish('Cage steel',0xabaead,.44,.45);
  const glass=finish('Smoked laminated glass',0x6c858f,.15,.12,{transparent:true,opacity:.54,depthWrite:false});
  const quarterGlass=finish('Tinted quarter glass',0x42535c,.16,.15,{transparent:true,opacity:.73,depthWrite:false});
  const lens=finish('Headlamp projector',0x94a9b4,.17,.60);
  const lamp=finish('LED light guide',0xe2f1fa,.22,.15,{emissive:0x859bb0,emissiveIntensity:.38});
  const ruby=finish('Ruby LED tail light',0xca1823,.24,.25,{emissive:0x600608,emissiveIntensity:.45});
  const gold=finish('Fluorescent competition number',0xfba629,.46,.04);
  const fabric=finish('Seat and safety webbing',0x292a2c,.89);
  function mesh(name,g,m) {
    const o=new T.Mesh(g,m);o.name=name;group.add(o);return o;
  }
  function skin(name,n,m,p,material,out) {
    const xyz=[],uv=[],idx=[];
    for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){
      const a=i/n,b=j/m,t=p(a,b);xyz.push(t.x,t.y,t.z);uv.push(a,b);
    }
    const q=p(.48,.48),a=p(.481,.48).sub(q),b=p(.48,.481).sub(q);
    const flip=a.cross(b).dot(out)<0;
    for(let j=0;j<m;j++)for(let i=0;i<n;i++){
      const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;
      idx.push(...(flip?[a,c,b,b,c,d]:[a,b,c,b,d,c]));
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    g.setIndex(idx);g.computeVertexNormals();return mesh(name,g,material);
  }
  // Map the decal, gasket, or panel onto the same curved stamping it belongs
  // to. Subdivision avoids the straight chords a flat decal would produce.
  function panel(name,outline,mapper,material,detail=2,holes=[]) {
    const lists=[outline,...holes].map(r=>r.map(([a,b])=>new T.Vector2(a,b)));
    const flat=lists.flat(),faces=T.ShapeUtils.triangulateShape(lists[0],lists.slice(1)),idx=[],xyz=[],uv=[];
    const known=new Map();
    function vertex(p){
      const key=Math.round(p.x*1e6)+','+Math.round(p.y*1e6);
      if(known.has(key))return known.get(key);
      const w=mapper(p.x,p.y),i=xyz.length/3;xyz.push(w.x,w.y,w.z);uv.push(p.x,p.y);known.set(key,i);return i;
    }
    function divide(a,b,c,k){
      if(!k){idx.push(vertex(a),vertex(b),vertex(c));return;}
      const d=a.clone().lerp(b,.5),e=b.clone().lerp(c,.5),f=c.clone().lerp(a,.5);
      divide(a,d,f,k-1);divide(d,b,e,k-1);divide(f,e,c,k-1);divide(d,e,f,k-1);
    }
    faces.forEach(([a,b,c])=>divide(flat[a],flat[b],flat[c],detail));
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return mesh(name,g,material);
  }
  // Clip vinyl against the actual shell triangles. Projecting just its
  // corners would let large graphics cut underneath a convex arch.
  function flankGraphic(flank,name,outline,mat,offset) {
    const path=outline.map(([z,y])=>new T.Vector2(z,y));
    const cut=T.ShapeUtils.triangulateShape(path,[]).map(face=>face.map(i=>path[i]));
    const g=flank.geometry,source=g.attributes.position,norm=g.attributes.normal,indices=g.index.array;
    const xyz=[],nn=[],uv=[],out=[],lookup=new Map();
    function store(p) {
      const key=Math.round(p[2]*1e6)+','+Math.round(p[1]*1e6);
      if(lookup.has(key))return lookup.get(key);
      const i=xyz.length/3;xyz.push(p[0]+offset,p[1],p[2]);nn.push(p[3],p[4],p[5]);uv.push(p[2],p[1]);lookup.set(key,i);return i;
    }
    for(let i=0;i<indices.length;i+=3){
      const raw=Array.from(indices.slice(i,i+3),k=>[source.getX(k),source.getY(k),source.getZ(k),norm.getX(k),norm.getY(k),norm.getZ(k)]);
      for(const tri of cut){
        let polygon=raw;
        for(let j=0;j<3&&polygon.length;j++){
          const a=tri[j],b=tri[(j+1)%3],dx=b.x-a.x,dy=b.y-a.y;
          const score=p=>dx*(p[1]-a.y)-dy*(p[2]-a.x);
          const next=[];let last=polygon.at(-1),lastScore=score(last);
          for(const p of polygon){
            const d=score(p);
            if((d>=0)!==(lastScore>=0)){
              const f=lastScore/(lastScore-d);next.push(last.map((v,k)=>mix(v,p[k],f)));
            }
            if(d>=0)next.push(p);last=p;lastScore=d;
          }
          polygon=next;
        }
        if(polygon.length<3)continue;
        const mapped=polygon.map(store);for(let j=1;j<mapped.length-1;j++)out.push(mapped[0],mapped[j],mapped[j+1]);
      }
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(xyz,3));geo.setAttribute('normal',new T.Float32BufferAttribute(nn,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(out);return mesh(name,geo,mat);
  }
  function line(name,points,r,m,curved=false,close=false){
    const path=new T.CurvePath();
    if(curved)path.add(new T.CatmullRomCurve3(points,close,'centripetal'));
    else for(let i=0;i<points.length-(close?0:1);i++)path.add(new T.LineCurve3(points[i],points[(i+1)%points.length]));
    return mesh(name,new T.TubeGeometry(path,Math.max(points.length-1,curved?8:1),r,5,close),m);
  }
  const steps=(n,fn)=>Array.from({length:n},(_,i)=>fn(i/(n-1)));
  function block(name,w,h,d,x,y,z,m){
    const o=mesh(name,new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);return o;
  }
  function bead(name,mapper,outline,r,m){line(name,outline.map(([a,b])=>mapper(a,b)),r,m,false,true);}
  function spline(stations){
    const slopes=stations.slice(1).map(([x,y],i)=>(y-stations[i][1])/(x-stations[i][0]));
    const tangent=stations.map((_,i)=>{
      if(!i||i===stations.length-1)return 0;
      const a=slopes[i-1],b=slopes[i];return a*b>0?2*a*b/(a+b):0;
    });
    return x=>{
      if(x<=stations[0][0])return stations[0][1];
      const i=stations.findIndex(([s])=>s>=x)-1;
      if(i<0)return stations.at(-1)[1];
      const [a,y]=stations[i],[b,q]=stations[i+1],t=(x-a)/(b-a),h=t*t*(3-2*t);
      return mix(y,q,h)+(b-a)*t*(1-t)*((1-t)*tangent[i]-t*tangent[i+1]);
    };
  }
  const frontAxle=1.315,rearAxle=-1.315,zRear=-1.864,zFront=1.878;
  const half=spline([[-1.864,.778],[-1.68,.799],[-1.31,.820],[-.83,.805],[-.4,.793],[.52,.793],[1.28,.820],[1.64,.811],[1.878,.780]]);
  const belt=spline([[-1.864,.923],[-1.57,1.025],[-1.12,1.072],[-.62,1.049],[.10,1.022],[.778,1.006],[1.19,1.001],[1.45,.981],[1.69,.929],[1.878,.835]]);
  const distance=z=>Math.min(Math.abs(z-frontAxle),Math.abs(z-rearAxle));
  function bottom(z) {
    const d=distance(z)/.441;
    return .246+(d<1?.548*(1-d**2.65)**.73:0);
  }
  function sideX(z,y){
    const t=sat((y-bottom(z))/Math.max(.04,belt(z)-bottom(z))),d=distance(z);
    const flare=(1-smooth(.28,.67,d))*(.107+.009*Math.sin(Math.PI*t)-.033*t**2.9);
    return Math.min(.9337,half(z)+flare+.008*Math.sin(Math.PI*t)-.009*(1-t)**4-.024*t**9);
  }
  const sidePoint=(s,z,y,off=0)=>V(s*(sideX(z,y)+off),y,z);
  const roofEdge=spline([[-1.68,1.008],[-1.53,1.104],[-1.33,1.270],[-1.12,1.373],[-.89,1.423],[-.55,1.452],[-.19,1.468],[.12,1.453],[.25,1.396],[.49,1.245],[.778,1.006]]);
  const roofHalf=spline([[-1.68,.808],[-1.33,.696],[-1.0,.644],[-.43,.621],[.12,.642],[.40,.696],[.778,.791]]);
  const roofFront=.12,roofBack=-1.12,cowl=.778,hatch=-1.68;
  function greenhouseSide(s,z,y,off=0){
    const upper=roofEdge(z),base=belt(z),t=sat((y-base)/Math.max(.001,upper-base));
    return V(s*(mix(sideX(z,base),roofHalf(z),t)+.010*Math.sin(t*Math.PI)+off),y,z);
  }
  const sideFront=[[-.45,1.075],[-.43,1.367],[-.38,1.423],[-.06,1.429],[.119,1.416],[.22,1.371],[.58,1.136],[.645,1.079],[.626,1.064],[-.41,1.062]];
  const sideBack=[[-1.531,1.094],[-1.36,1.224],[-1.124,1.331],[-.96,1.371],[-.55,1.416],[-.529,1.394],[-.55,1.086],[-.6,1.068],[-1.49,1.078]];
  const liveryWhite=finish('White vinyl lettering',0xf4f4ee,.38,.16);
  for(const s of [-1,1]){
    const normal=V(s,0,0),side=(z,y,d=.002)=>sidePoint(s,z,y,d);
    const flank=skin('Stamped quarter panels, doors and wide arches',76,9,(u,v)=>{
      const z=mix(zRear,zFront,u);return side(z,mix(bottom(z),belt(z),v),0);
    },white,normal);
    for(const axle of [rearAxle,frontAxle]){
      const end=(u,b)=>{const z=axle+(2*u-1)*.438;return side(z,bottom(z)+b);};
      skin('Rolled composite arch lip',36,1,(u,v)=>{
        const p=end(u,.001+v*.014);p.x+=s*(.002+.001*Math.sin(v*Math.PI));return p;
      },carbon,normal);
      skin('Inner arch liner',32,1,(u,v)=>{const z=axle+(u*2-1)*.439;return V(s*.579,mix(.245,bottom(z)+.006,v),z);},inside,normal);
      skin('Wheel housing return',32,1,(u,v)=>{
        const p=end(u,.002);p.x=mix(p.x,s*.544,v);p.y+=.008*Math.sin(Math.PI*v);return p;
      },inside,V(0,-1,0));
    }
    const between=(u,v)=>{const z=mix(-.875,.875,u), y=.244+.084*v;return V(s*(mix(.83,.805,v)+.044*Math.sin(Math.PI*v)),y,z);};
    skin('Carbon sill blade between axles',18,3,between,carbon,normal);
    skin('Red sill stripe',24,2,(u,v)=>{const p=between(u,.51+.14*v);p.x+=s*.002;return p;},red,normal);
    const cabinOutline=[...steps(15,t=>[mix(hatch,cowl,t),belt(mix(hatch,cowl,t))]),
      ...steps(31,t=>[mix(cowl-.003,hatch+.003,t),roofEdge(mix(cowl-.003,hatch+.003,t))])];
    const cabin=(z,y,off=0)=>greenhouseSide(s,z,y,off);
    panel('Roof rail, A pillar and rear sail',cabinOutline,(z,y)=>cabin(z,y),white,1,[sideFront,sideBack]);
    for(const [outline,m] of [[sideFront,glass],[sideBack,quarterGlass]]){
      panel('Flush polycarbonate side glazing',outline,(z,y)=>cabin(z,y,-.002),m,2);
      bead('Black glazing gasket',(z,y)=>cabin(z,y,.001),outline,.009,black);
    }
    const sliding=[[-.13,1.126],[-.13,1.323],[.149,1.323],[.176,1.301],[.176,1.126]];
    bead('Sliding ventilation window',(z,y)=>cabin(z,y,.004),sliding,.0043,carbon);
    line('Sliding window latch',[cabin(.143,1.197,.008),cabin(.143,1.25,.008)],.005,silver);
    const wrap=(name,ring,mat,offset)=>flankGraphic(flank,name,ring,mat,s*offset);
    wrap('Black angular rear quarter livery',[[-1.86,.91],[-1.60,1.024],[-1.06,1.039],[-.199,.707],[.16,.51],[-.26,.495],[-.818,.60],[-1.18,.765],[-1.55,.767],[-1.82,.50]],black,.002);
    wrap('Scarlet quarter slash',[[-1.78,.963],[-1.563,1.007],[-1.291,1.031],[-.331,.677],[-.16,.600],[-.39,.61],[-1.10,.835],[-1.742,.784]],red,.0038);
    wrap('Forward black rally chevron',[[.52,.987],[.754,.998],[.93,.98],[.798,.73],[.366,.462],[.295,.467],[.554,.75]],black,.002);
    wrap('Scarlet front fender chevron',[[.69,.979],[1.03,.965],[.916,.885],[.757,.806],[.545,.684]],red,.0038);
    const exit=[[.824,.717],[.884,.833],[.978,.887],[1.008,.878],[.932,.745],[.858,.698]];
    panel('Front wheel-well pressure outlet',exit,(z,y)=>side(z,y,.010),inside,2);
    for(let i=0;i<3;i++){
      const a=.838+i*.021,b=.894+i*.023;
      line('Outlet guide vane',[side(a,.728+i*.023,.014),side(b,.755+i*.024,.015)],.005,carbon);
    }
    const seam=[[-.51,1.042],[-.534,.91],[-.506,.519],[-.471,.353],[-.381,.326],[.555,.328],[.632,.376],[.682,.624],[.697,.858],[.674,1.002]];
    line('Door perimeter',seam.map(([z,y])=>side(z,y,.010)),.0031,carbon,true);
    line('Flush door handle',steps(8,t=>side(-.35+.138*t,.956+.007*Math.sin(t*Math.PI),.012)),.009,black);
    line('Door mirror arm',[cabin(.572,1.067),V(s*.831,1.073,.543),V(s*.878,1.113,.500)],.016,carbon);
    const mirror=mesh('Aero mirror housing',new T.SphereGeometry(1,12,7),black);mirror.position.set(s*.873,1.131,.490);mirror.scale.set(.060,.044,.088);
    const mirrorFace=mesh('Mirror glass',new T.SphereGeometry(1,12,6),silver);mirrorFace.position.set(s*.873,1.13,.435);mirrorFace.scale.set(.048,.034,.016);
  }
  function topGlass(a,z){
    const transverse=1-a*a,front=smooth(.10,cowl,z),back=1-smooth(hatch,-1.12,z);
    const bow=.032*transverse+.014*(1-a**4);
    return V(a*roofHalf(z),roofEdge(z)+bow,z+(.085*front-.093*back)*transverse);
  }
  const roof=(u,v)=>topGlass(2*u-1,mix(roofBack,roofFront,v));
  skin('Crowned hatchback roof pressing',21,12,roof,white,V(0,1,0));
  for(const [front,zBase,zTop,m] of [[true,cowl,roofFront,glass],[false,hatch,roofBack,quarterGlass]]){
    const normal=V(0,.55,front?1:-1);
    const end=(x,t)=>topGlass(x,mix(zBase,zTop,t));
    const pane=(u,v)=>{
      const t=mix(.050,.940,v),corner=.050*(1-Math.sin(Math.PI*v)**.34);
      return end((2*u-1)*(.972-corner),t);
    };
    skin(front?'Laminated curved windscreen':'Heated rear hatch glazing',20,9,pane,m,normal);
    for(const s of [-1,1]){
      skin('Composite pillar return',2,10,(u,v)=>{
        const e=pane(s<0?0:1,v),f=end(s,mix(.05,.94,v));return e.lerp(f,u);
      },black,normal);
    }
    for(const t of [0,1]){
      skin('Window header or scuttle',20,1,(u,v)=>end(u*2-1,t?mix(.94,1,v):mix(0,.05,v)),black,normal);
    }
    if(front){
      skin('Winscreen competition sun strip',24,3,(u,v)=>{
        const p=pane(u,.865+.135*v);p.y+=.002;return p;
      },black,normal);
      for(const s of [-1,1]){
        line('Rally wiper blade',steps(9,t=>{
          const p=pane((s<0?.055:.49)+.39*t,.095+.025*Math.sin(t*Math.PI));p.z+=.006;return p;
        }),.006,carbon);
      }
    }
  }
  const hoodNose=a=>2.061-.183*Math.abs(a)**2.7;
  function hood(a,t){
    const z=mix(cowl+.085*(1-a*a),hoodNose(a),t),edge=belt(Math.min(z,zFront));
    const aAbs=Math.abs(a),halfWidth=sideX(Math.min(z,zFront),edge);
    const c=.032*(1-a*a)+.015*(1-a**4)+.019*Math.exp(-((aAbs-.72)**2)/.015)*Math.sin(t*Math.PI);
    const center=mix(1.049,.817,t)-.015*Math.sin(Math.PI*t);
    const y=mix(edge,center,Math.sqrt(Math.max(0,1-a**4)))+c*Math.sin(t*Math.PI);
    return V(a*halfWidth,y,z);
  }
  skin('Bonnet and front wing shoulders',30,18,(u,v)=>hood(2*u-1,v),white,V(0,1,0));
  for(const s of [-1,1]){
    const h=(a,t,d=.002)=>{const p=hood(s*a,t);p.y+=d;return p;};
    line('Hood closing joint',steps(17,t=>h(.75-.10*t,.035+.943*t,.0025)),.0032,black);
    panel('Black bonnet blade',[[.965,.09],[.978,.224],[.695,.562],[.363,.830],[.474,.655],[.709,.392]],(a,t)=>h(a,t,.006),black,3);
    panel('Scarlet bonnet blade',[[.946,.115],[.938,.206],[.682,.488],[.552,.591],[.647,.458]],(a,t)=>h(a,t,.009),red,3);
    panel('Red nose graphics',[[.70,.10],[.87,.11],[.989,.49],[.97,.64],[.84,.45]],(a,t)=>h(a,t,.004),red,2);
    const vent=[[.29,.275],[.51,.30],[.55,.486],[.50,.526],[.315,.495]];
    panel('Bonnet thermal outlet',vent,(a,t)=>h(a,t,.005),inside,2);
    for(let i=0;i<5;i++)skin('Angled hood extractor louvre',6,1,(u,v)=>h(.313+.195*u,.308+.034*i+.022*u+.008*v,.009+.004*v),carbon,V(0,1,0));
    const pin=h(.75,.824,.006);
    const stud=mesh('Quick release bonnet pin',new T.CylinderGeometry(.016,.016,.006,12),silver);stud.position.copy(pin);
  }
  function forward(x,y,off=0){
    const a=Math.abs(x)/.865,t=sat((y-.232)/.619);
    return V(x,y,2.072-.188*a**2.65-.018*(1-t)+.019*Math.sin(Math.PI*t)+off);
  }
  const fascia=(u,v)=>{
    const x=(2*u-1)*mix(.844,.851,v),a=Math.abs(2*u-1),top=hood(a,1).y;
    return forward(x,mix(.236+.025*a**4,top,v));
  };
  skin('Contoured front bumper cover',28,8,fascia,white,V(0,0,1));
  skin('Bonnet leading return',26,2,(u,v)=>hood(2*u-1,1).lerp(fascia(u,1),v),white,V(0,.75,1));
  const grille=[[-.620,.317],[-.577,.286],[.577,.286],[.620,.317],[.549,.588],[.488,.617],[-.488,.617],[-.549,.588]];
  panel('Large recessed radiator intake',grille,(x,y)=>forward(x,y,.007),inside,3);
  bead('Front intake rolled edge',(x,y)=>forward(x,y,.010),grille,.011,carbon);
  for(let j=0;j<5;j++)skin('Radiator core horizontal fin',14,1,(u,v)=>forward((u-.5)*(1.13-.018*j),.342+j*.047+.0045*v,.014+.002*v),black,V(0,0,1));
  for(let i=-7;i<=7;i++){
    const x=i*.068;line('Grille vertical reinforcement',[forward(x,.315,.012),forward(x*.97,.598,.012)],.0035,black);
  }
  const upper=[[-.421,.737],[-.292,.701],[.292,.701],[.421,.737],[.362,.779],[-.362,.779]];
  panel('Black upper grille and badge mounting',upper,(x,y)=>forward(x,y,.011),black,2);
  const oval=(name,rx,ry,h,mapper)=>skin(name,26,2,(u,v)=>{
    const a=u*Math.PI*2,r=(v-.5)*.005;
    return mapper((rx+r)*Math.cos(a),h+(ry+r)*Math.sin(a),.023+.001*Math.sin(Math.PI*v));
  },silver,V(0,0,1));
  const emblem=(rx,ry,cy)=>oval('Toyota grille oval',rx,ry,cy,forward);
  emblem(.052,.031,.750);emblem(.011,.026,.749);emblem(.036,.009,.760);
  for(const s of [-1,1]){
    const front=(x,y,d=.01)=>forward(s*x,y,d);
    const housing=[[.365,.785],[.510,.815],[.697,.855],[.814,.862],[.855,.836],[.833,.751],[.757,.685],[.521,.680],[.432,.713]];
    panel('Faceted smoked headlight housing',housing,(x,y)=>front(x,y,.017),black,2);
    const optical=[[.415,.767],[.526,.798],[.708,.835],[.805,.842],[.819,.816],[.790,.757],[.742,.716],[.529,.708],[.467,.729]];
    panel('Silver LED headlight reflector',optical,(x,y)=>front(x,y,.022),lens,2);
    const guide=[[.426,.758],[.526,.779],[.696,.809],[.799,.822],[.776,.759],[.742,.736],[.645,.730]];
    line('Swept LED light signature',guide.map(([x,y])=>front(x,y,.027)),.0079,lamp,true);
    for(const x of [.52,.61]){
      const p=front(x,.744+.18*(x-.52),.029);
      const optic=mesh('LED projector lens',new T.SphereGeometry(1,10,6),lens);optic.scale.set(.035,.020,.012);optic.position.copy(p);
    }
    const inlet=[[.645,.300],[.812,.336],[.843,.427],[.813,.573],[.73,.597],[.656,.501]];
    panel('Outer brake cooling duct',inlet,(x,y)=>front(x,y,.014),inside,2);
    for(const y of [.392,.453,.514])line('Brake duct cascade',[front(.688,y,.020),front(.801,y+.022,.023)],.008,carbon);
    panel('Front bumper red corner flash',[[.60,.69],[.788,.667],[.841,.714],[.85,.651],[.733,.617],[.576,.631]],(x,y)=>front(x,y,.016),red,2);
    skin('Corner winglet',9,3,(u,v)=>{const x=.713+.161*u, p=front(x,.372+.044*u,.025+.039*v);p.y+=.008*v;return p;},carbon,V(0,1,0));
    // Wrap the nose and optical corner into the arch, including the hidden
    // inner return so oblique and underbody cameras see a closed bumper.
    skin('Front fender end return',6,6,(u,v)=>{
      const p=fascia(s<0?0:1,v);const y=mix(bottom(zFront),belt(zFront),v);
      return p.lerp(sidePoint(s,zFront,y),u);
    },white,V(s,0,.3));
  }
  skin('Carbon front splitter',32,4,(u,v)=>{
    const x=(2*u-1)*.870,a=Math.abs(2*u-1);return V(x,.228+.027*a**3+.009*v,2.108-.202*a**2.8-.128*v);
  },carbon,V(0,1,0));
  const hatchZ=a=>-1.958+.094*Math.abs(a)**2;
  skin('Hatch belt panel',20,6,(u,v)=>{
    const a=2*u-1,z=mix(hatch-.093*(1-a*a),hatchZ(a),v);
    return V(a*mix(roofHalf(hatch),.790,v),mix(roofEdge(hatch)+.046*(1-a*a),.906+.012*(1-a*a),v),z);
  },white,V(0,.45,-1));
  const tail=(x,y,d=0)=>V(x,y,-1.947+.094*(Math.abs(x)/.828)**2.6+.016*(1-sat((y-.28)/.65))-d);
  skin('Recessed rear bumper and tailgate',27,9,(u,v)=>tail((2*u-1)*mix(.828,.795,v),mix(.251,.919,v)),white,V(0,0,-1));
  panel('Gloss hatch light panel',[[-.787,.783],[-.594,.742],[.594,.742],[.787,.783],[.777,.903],[-.777,.903]],(x,y)=>tail(x,y,.013),black,3);
  const hatchEdge=[[-.572,.882],[-.657,.729],[-.662,.548],[-.597,.509],[.597,.509],[.662,.548],[.657,.729],[.572,.882]];
  line('Tailgate shutline',hatchEdge.map(([x,y])=>tail(x,y,.004)),.0027,black);
  const rearPlate=[[-.189,.548],[.189,.548],[.201,.562],[.201,.630],[.182,.642],[-.182,.642],[-.201,.63],[-.201,.562]];
  panel('Recessed tailgate number-plate surround',rearPlate,(x,y)=>tail(x,y,.005),black,1);
  for(const s of [-1,1]){
    const back=(x,y,d=.014)=>tail(s*x,y,d);
    const housing=[[.452,.872],[.697,.896],[.823,.885],[.824,.798],[.755,.762],[.551,.779],[.498,.804]];
    panel('Wraparound rear light housing',housing,(x,y)=>back(x,y,.018),black,2);
    const redLight=[[.499,.851],[.709,.870],[.804,.860],[.798,.819],[.748,.797],[.561,.812]];
    line('C-shaped ruby rear signature',redLight.map(([x,y])=>back(x,y,.029)),.010,ruby,true);
    panel('Scarlet lower bumper slash',[[.497,.548],[.826,.614],[.816,.532],[.531,.493]],(x,y)=>back(x,y,.012),red,2);
    skin('Swept rear corner return',6,6,(u,v)=>{
      const p=tail(s*mix(.828,.795,v),mix(.251,.919,v));
      return p.lerp(sidePoint(s,zRear,mix(bottom(zRear),belt(zRear),v)),u);
    },white,V(s,0,-.25));
  }
  panel('Wide rear diffuser and bumper protection',[[-.827,.272],[-.682,.233],[.682,.233],[.827,.272],[.814,.467],[.653,.462],[.512,.390],[-.512,.390],[-.653,.462],[-.814,.467]],(x,y)=>tail(x,y,.013),carbon,3);
  for(let i=-3;i<=3;i++){
    const x=i*.14;panel('Diffuser vertical guide',[[-1.93,.277],[-1.95,.228],[-1.702,.203],[-1.575,.246]],(z,y)=>V(x,y,z),carbon,0);
  }
  const exhaust=mesh('Exhaust tailpipe',new T.CylinderGeometry(.046,.048,.145,16,1,true),silver);
  exhaust.rotation.x=Math.PI/2;exhaust.position.set(.499,.365,-1.929);
  const bore=mesh('Black exhaust bore',new T.CircleGeometry(.040,16),inside);
  bore.rotation.y=Math.PI;bore.position.set(.499,.365,-1.999);
  // The hollow wing sits over the glass on two swan-neck pylons.
  for(const s of [-1,1]){
    const bracket=[[-1.394,1.226],[-1.484,1.226],[-1.741,1.392],[-1.936,1.408],[-1.936,1.461],[-1.748,1.460]];
    panel('Rear wing swan-neck pylon',bracket,(z,y)=>V(.491*s,y,z),carbon,0);
  }
  function wing(name,span,z0,chord,y0,rise){
    const p=(u,v)=>{
      const x=(2*u-1)*span,a=Math.abs(2*u-1);
      return V(x,y0+.016*a*a+rise*v+.018*Math.sin(v*Math.PI),z0-chord*v+.027*a*a);
    };
    skin(name,18,5,p,carbon,V(0,1,0));
    skin(name+' underside',18,3,(u,v)=>{const q=p(u,v);q.y-=.005+.018*Math.sin(v*Math.PI);return q;},carbon,V(0,-1,0));
  }
  wing('High-mounted competition rear wing',.833,-1.780,.337,1.420,.039);
  wing('Raised secondary slotted foil',.823,-1.977,.122,1.480,.024);
  for(const s of [-1,1]){
    const endplate=[[-1.730,1.429],[-1.813,1.498],[-1.965,1.539],[-2.109,1.531],[-2.113,1.393],[-1.943,1.340],[-1.813,1.345]];
    panel('Carbon wing endplate',endplate,(z,y)=>V(s*.833,y,z),black,0);
    panel('Red wing endplate accent',[[-1.823,1.476],[-2.079,1.522],[-2.097,1.491],[-1.898,1.435]],(z,y)=>V(s*.836,y,z),red,0);
  }
  const scoop=(u,v)=>{
    const a=2*u-1,z=mix(-.21,.183,v);
    const width=mix(.106,.161,v),thickness=.072*Math.sin(v*Math.PI*.53);
    return V(a*width,roofEdge(z)+.043+thickness*(.80+.2*(1-a*a)),z);
  };
  skin('Roof-mounted crew ventilation scoop',12,10,scoop,white,V(0,1,0));
  for(const s of [-1,1]){
    skin('Roof scoop cheek',9,3,(u,v)=>{
      const p=scoop(s<0?0:1,u);p.y=mix(roofEdge(p.z)+.040,p.y,v);return p;
    },white,V(s,0,0));
  }
  skin('Crew scoop ram air mouth',12,4,(u,v)=>{const p=scoop(.03+.94*u,1);p.z+=.001;p.y=mix(roofEdge(p.z)+.049,p.y-.006,v);return p;},inside,V(0,0,1));
  line('Roof telemetry whip',[V(.122,1.514,-.541),V(.14,1.681,-.593)],.0032,carbon);
  // The two front buckets, restraints, navigation display and cage are
  // visible through the windscreen and the little sliding side windows.
  for(const s of [-1,1]){
    line('Main rollover hoop',[
      V(s*.622,.32,-.388),V(s*.665,.92,-.411),V(s*.576,1.356,-.433),
      V(s*.502,1.391,-.434),V(0,1.397,-.434)
    ],.027,steel);
    line('Front cage leg and cant rail',[
      V(s*.632,.32,.583),V(s*.658,.974,.602),V(s*.521,1.385,.040),V(s*.515,1.397,-.435)
    ],.025,steel);
    line('Rear stay',[V(s*.540,1.377,-.424),V(s*.610,.64,-1.476)],.026,steel);
    line('Crossed door protection',[V(s*.635,.424,-.410),V(s*.655,.855,.555)],.022,steel);
    line('Crossed door protection',[V(s*.640,.881,-.410),V(s*.633,.427,.555)],.022,steel);
    line('Crossed rear stays',[V(s*.55,1.33,-.44),V(-s*.543,.668,-1.440)],.019,steel);
    const seatZ=s<0?-.096:-.185,x=s*.324;
    const seat=mesh('Competition bucket back',new T.SphereGeometry(1,12,9),fabric);
    seat.position.set(x,.798,seatZ-.139);seat.scale.set(.197,.313,.085);seat.rotation.x=-.14;
    const head=mesh('Side impact head restraint',new T.SphereGeometry(1,12,7),carbon);head.position.set(x,1.078,seatZ-.157);head.scale.set(.197,.116,.101);
    const base=mesh('FIA bucket seat cushion',new T.SphereGeometry(1,12,7),fabric);base.position.set(x,.552,seatZ+.05);base.scale.set(.19,.083,.207);
    for(const b of [-1,1]){
      line('Harness shoulder straps',[V(x+b*.081,1.013,seatZ-.061),V(x+b*.064,.867,seatZ-.043),V(x+b*.055,.661,seatZ+.008)],.014,red);
      line('Bucket thigh bolster',[V(x+b*.146,.693,seatZ-.024),V(x+b*.157,.616,seatZ+.199)],.032,fabric);
    }
  }
  block('Crew compartment floor',1.29,.045,2.22,0,.349,-.296,inside);
  const dash=mesh('Flocked dashboard',new T.SphereGeometry(1,20,8),fabric);dash.position.set(0,.918,.545);dash.scale.set(.681,.088,.213);
  block('Co-driver navigation instrument',.222,.096,.032,.31,.961,.430,inside);
  const wheel=mesh('Quick-release steering wheel',new T.TorusGeometry(.133,.014,7,24),carbon);wheel.position.set(-.304,.917,.316);wheel.rotation.x=-.19;
  for(const a of [.12,2.89,4.71])line('Steering wheel spoke',[V(-.304,.917,.317),V(-.304+.126*Math.cos(a),.917+.126*Math.sin(a),.312)],.009,silver);
  line('Sequential shift lever',[V(-.10,.455,.191),V(-.115,.802,.174)],.011,steel);
  // Lettering uses the same geometry in WebGL and the software renderer.
  // The type follows the glass/paint rather than hovering on flat cards.
  const letters={
    '1':[[[.20,.75],[.56,1],[.56,0]],[[.23,0],[.87,0]]],
    '7':[[[0,1],[.95,1],[.35,0]]],
    G:[[[.9,.86],[.69,1],[.17,1],[0,.79],[0,.19],[.16,0],[.76,0],[.94,.17],[.94,.50],[.51,.50]]],
    R:[[[0,0],[0,1],[.7,1],[.91,.84],[.91,.63],[.71,.49],[0,.49]],[[.48,.5],[.96,0]]],
    T:[[[0,1],[1,1]],[[.50,1],[.50,0]]],
    O:[[[.21,1],[.78,1],[.97,.78],[.97,.20],[.77,0],[.20,0],[0,.2],[0,.79],[.21,1]]],
    Y:[[[0,1],[.49,.53],[1,1]],[[.49,.53],[.49,0]]],
    A:[[[0,0],[.39,1],[.58,1],[1,0]],[[.22,.42],[.78,.42]]],
  };
  function type(word,project,w,h,weight,material){
    const advance=w/word.length;
    [...word].forEach((c,i)=>{for(const path of letters[c])for(let k=1;k<path.length;k++){
      const [a,b]=path.slice(k-1,k+1);
      const ax=(i+a[0]*.78)*advance,ay=a[1]*h,bx=(i+b[0]*.78)*advance,by=b[1]*h;
      const length=Math.hypot(bx-ax,by-ay),dx=-(by-ay)/length*weight/2,dy=(bx-ax)/length*weight/2;
      panel('Competition lettering '+c,[[ax+dx,ay+dy],[bx+dx,by+dy],[bx-dx,by-dy],[ax-dx,ay-dy]],project,material,0);
    }});
  }
  // On opposite sides of the car the text still reads left to right.
  for(const s of [-1,1]){
    const project=(z,y,d)=>sidePoint(s,z,y,d);
    const plaque=(u,v,d)=>project(s<0?-.226+u:.336-u,.676+v,d);
    panel('Rally number board',[[0,0],[.348,0],[.348,.243],[0,.243]],(u,v)=>plaque(u,v,.008),black,2);
    panel('Event identification band',[[.009,.209],[.34,.209],[.34,.234],[.009,.234]],(u,v)=>plaque(u,v,.011),red,1);
    type('17',(u,v)=>plaque(.066+u,.027+v,.014),.25,.153,.021,liveryWhite);
    type('17',(u,v)=>greenhouseSide(s,s<0?-1.125+u:-.849-u,1.143+v,.007),.214,.122,.015,gold);
    type('GR',(u,v)=>project(s<0?-.38+u:.38-u,.549+v,.010),.172,.063,.010,black);
  }
  type('TOYOTA',(u,v)=>{
    const p=topGlass(-.51+u*1.07,mix(cowl,roofFront,.846+v*.84));p.y+=.005;return p;
  },.94,.065,.009,liveryWhite);
  type('GR',(u,v)=>tail(.068-u,.568+v,.012),.133,.048,.007,liveryWhite);
  const backOval=(rx,ry,h)=>oval('Toyota rear hatch oval',rx,ry,h,tail);
  backOval(.043,.027,.83);backOval(.010,.021,.828);backOval(.028,.008,.838);
  const gr=(u,v)=>forward(.303+u,.470+v,.027);
  panel('GR grille badge black',[[0,0],[.112,0],[.112,.045],[0,.045]],gr,black,0);
  panel('GR grille badge red',[[.056,0],[.112,0],[.112,.045],[.056,.045]],gr,red,0);
  type('GR',(u,v)=>forward(.310+u,.478+v,.029),.099,.029,.004,liveryWhite);
  return group;
}
