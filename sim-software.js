// Driving-view rasterizer for browsers without a WebGL context. The reduced
// exterior is baked from the same measured model. Wheels, links and the track
// remain 3D meshes, driven by the same half-car state as the GPU renderer.
import { finishes, pieces, packed, drivingTexture } from './model/sim-driving-mesh.js';
import * as chassisMesh from './model/sim-driving-chassis.js';
import { roadHeight } from './sim-physics.js';
import { makeDrivingReflection } from './software-shading.js';
import { prepareFleetSoftware } from './fleet-software.js';
import { makeKeyShadow } from './software-shadow.js';

const TAU=2*Math.PI, WHEEL=.405, FRONT=1.42, REAR=-1.43;
const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
const rgb=hex=>[(hex>>16)&255,(hex>>8)&255,hex&255];
const finish=(hex,metal=.15,rough=.55,texture='',alpha=1)=>[rgb(hex),metal,rough,texture,alpha,alpha<1];
const chassisOffset=finishes.length;
const materials=[...finishes,...chassisMesh.finishes];
function addFinish(...args){materials.push(finish(...args));return materials.length-1;}
const tire=addFinish(0x343835,.02,.94),tread=addFinish(0x454640,.02,.86);
const frontPhoto=addFinish(0xffffff,.09,.67,'wheel-front-surface.webp'),rearPhoto=addFinish(0xffffff,.09,.67,'wheel-rear-surface.webp');
const alloy=addFinish(0xb7b8aa,.63,.32),steel=addFinish(0x515956,.47,.46),graphite=addFinish(0x37423e,.39,.59);
const cast=addFinish(0x757c72,.43,.60),dark=addFinish(0x292f2c,.13,.70);
const frontAccent=addFinish(0x83d5b0,.32,.42),rearAccent=addFinish(0xe6a470,.32,.42);
const asphalt=addFinish(0x45504e,0,.94), bumpMat=addFinish(0x3b4846,.01,.86), shoulder=addFinish(0x263e37,0,.95);
const margin=addFinish(0xb5c4af,.05,.80),warning=addFinish(0xc9a758,.09,.76), tick=addFinish(0x839b8d,.02,.85);
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function unit(a){const s=1/(Math.hypot(...a)||1);return [a[0]*s,a[1]*s,a[2]*s];}
function lerp(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}

function readMesh(blob,parts,offset=0){
  const bytes=Uint8Array.from(atob(blob),ch=>ch.charCodeAt(0)),v=new DataView(bytes.buffer);
  return parts.map(([material,start,count,indexCount])=>{
    const positions=new Float32Array(count*3),normals=new Float32Array(count*3),uv=new Float32Array(count*2);
    let o=start;
    for(let i=0;i<count;i++,o+=14){
      for(let k=0;k<3;k++){positions[i*3+k]=v.getInt16(o+2*k,true)/4096;normals[i*3+k]=v.getInt8(o+6+k)/127;}
      uv[i*2]=v.getInt16(o+10,true)/4096;uv[i*2+1]=v.getInt16(o+12,true)/4096;
    }
    const indices=new Uint16Array(indexCount);
    for(let i=0;i<indexCount;i++)indices[i]=v.getUint16(o+i*2,true);
    const group=materials[material+offset][6],rig=group==='rear-axle'?'ra':group==='sprung'?'frame':group==='floor'?'floor':'shell';
    return {rig,positions,normals,uv,indices,material:material+offset};
  });
}

class Geometry {
  constructor(){this.buckets=new Map();}
  patch(rig,material,positions,normals,indices,uv){
    const key=rig+'/'+material;
    let m=this.buckets.get(key);
    if(!m){m={rig,material,positions:[],normals:[],uv:[],indices:[]};this.buckets.set(key,m);}
    const offset=m.positions.length/3;
    for(let i=0;i<positions.length;i++){
      m.positions.push(...positions[i]);m.normals.push(...normals[i]);m.uv.push(...(uv?.[i]||[0,0]));
    }
    for(const i of indices)m.indices.push(i+offset);
  }
  quad(rig,mat,a,b,c,d,n){
    n=n||unit(cross(sub(b,a),sub(c,a)));
    this.patch(rig,mat,[a,b,c,d],[n,n,n,n],[0,1,2,0,2,3],rig==='ground'?[a,b,c,d].map(p=>[p[0],p[2]]):null);
  }
  box(rig,mat,x,y,z,w,h,l){
    const A=x-w/2,B=x+w/2,C=y-h/2,D=y+h/2,E=z-l/2,F=z+l/2;
    this.quad(rig,mat,[A,C,E],[B,C,E],[B,D,E],[A,D,E],[0,0,-1]);
    this.quad(rig,mat,[B,C,F],[A,C,F],[A,D,F],[B,D,F],[0,0,1]);
    this.quad(rig,mat,[A,C,F],[A,C,E],[A,D,E],[A,D,F],[-1,0,0]);
    this.quad(rig,mat,[B,C,E],[B,C,F],[B,D,F],[B,D,E],[1,0,0]);
    this.quad(rig,mat,[A,D,E],[B,D,E],[B,D,F],[A,D,F],[0,1,0]);
    this.quad(rig,mat,[A,C,F],[B,C,F],[B,C,E],[A,C,E],[0,-1,0]);
  }
  rod(rig,mat,a,b,r,sides=7,closed=true,r2=r){
    const axis=unit(sub(b,a)),n=unit(cross(axis,Math.abs(axis[1])<.82?[0,1,0]:[1,0,0])),t=cross(axis,n),p=[],ns=[],ix=[];
    for(let j=0;j<2;j++)for(let i=0;i<sides;i++){
      const cs=Math.cos(TAU*i/sides),sn=Math.sin(TAU*i/sides),v=[cs*n[0]+sn*t[0],cs*n[1]+sn*t[1],cs*n[2]+sn*t[2]];
      const c=j?b:a,ra=j?r2:r;p.push([c[0]+v[0]*ra,c[1]+v[1]*ra,c[2]+v[2]*ra]);ns.push(v);
    }
    for(let i=0;i<sides;i++){const j=(i+1)%sides;ix.push(i,j,j+sides,i,j+sides,i+sides);}
    if(closed)for(let i=1;i<sides-1;i++){ix.push(0,i+1,i,sides,sides+i,sides+i+1);}
    this.patch(rig,mat,p,ns,ix);
  }
  mesh(){return [...this.buckets.values()].map(m=>({...m,positions:Float32Array.from(m.positions),normals:Float32Array.from(m.normals),uv:Float32Array.from(m.uv),indices:Uint16Array.from(m.indices)}));}
}

function wheels(g){
  for(const z of [FRONT,REAR])for(const side of [-1,1]){
    const isFront=z>0, rig=(isFront?'fw':'rw')+side, fixed=isFront?'fa':'ra', m=isFront?frontPhoto:rearPhoto, cx=side*(isFront?.810:.8075);
    const phase=isFront?0:23*Math.PI/180;
    const pos=(angle,r,h)=>[cx+side*h,WHEEL+r*Math.sin(angle+phase),z-side*r*Math.cos(angle+phase)];
    const tex=(angle,r)=>[.5+r*Math.cos(angle)/.81,.5+r*Math.sin(angle)/.81];
    const rings=[
      [.205,-.105], [.225,-.126],[.31,-.143],[.35,-.14],[.382,-.118],[.401,-.083],[.405,-.047],
      [.405,.047],[.401,.083],[.382,.118],[.353,.14],[.317,.143],[.267,.138],[.224,.123],[.208,.106]
    ];
    const N=40;
    for(let j=0;j<rings.length-1;j++){
      const p=[],ns=[],uv=[],ix=[];
      for(let i=0;i<=N;i++){
        const a=i*TAU/N;
        for(const k of [j,j+1]){
          const [r,h]=rings[k],prev=rings[Math.max(0,k-1)],next=rings[Math.min(rings.length-1,k+1)];
          const nr=next[1]-prev[1],na=prev[0]-next[0],b=a+phase;
          p.push(pos(a,r,h));ns.push(unit([side*na,nr*Math.sin(b),-side*nr*Math.cos(b)]));uv.push(tex(a,r));
        }
        if(i<N){const k=i*2;ix.push(k,k+1,k+3,k,k+3,k+2);}
      }
      g.patch(rig,j>=9?m:tire,p,ns,ix,uv);
    }
    // Staggered individual crown lugs preserve the all-terrain silhouette from underneath.
    for(let i=0;i<32;i++)for(const hsign of [-1,1]){
      const a=TAU*(i+(hsign<0?.42:0))/32,dir=hsign*.035;
      const p=[pos(a-.055,.405,-.005*hsign),pos(a+.061,.405,.014*hsign),pos(a+.066+dir,.399,.093*hsign),pos(a-.047+dir,.393,.108*hsign)];
      const normals=p.map(q=>unit([side*.14*hsign,q[1]-.405,q[2]-z]));
      g.patch(rig,i%3===1?tread:tire,p,normals,[0,1,2,0,2,3]);
    }
    // The five apertures follow the radial outline traced on the actual alloy.
    const stations=[[.03,36,36],[.084,36,36],[.099,29,44],[.110,22,52],[.135,18.8,54.8],[.164,17.8,56],[.185,19,55],[.194,21,53],[.198,36,36],[.208,36,36],[.211,36,36]];
    for(let fold=0;fold<5;fold++){
      const p=[],ns=[],uv=[],ix=[],width=8;
      for(let j=0;j<stations.length;j++)for(let k=0;k<=width;k++){
        const [r,l,h]=stations[j],deg=(h-72)+(l-(h-72))*k/width,a=fold*TAU/5+deg*Math.PI/180;
        const depth=.085+.033*(r/.211)-.008*Math.max(0,1-Math.abs(deg)/14);
        p.push(pos(a,r,depth));ns.push([side,0,0]);uv.push(tex(a,r));
        if(j<stations.length-1&&k<width){const q=j*(width+1)+k;ix.push(q,q+1,q+width+2,q,q+width+2,q+width+1);}
      }g.patch(rig,m,p,ns,ix,uv);
      for(const edge of [0,width])for(let j=2;j<stations.length-3;j++){
        const q=j*(width+1)+edge,a=p[q],b=p[q+width+1];
        g.quad(rig,steel,a,b,[b[0]-side*.026,b[1],b[2]],[a[0]-side*.026,a[1],a[2]]);
      }
      const a=fold*TAU/5,hub=pos(a,.075,.094),out=pos(a,.075,.106);g.rod(rig,alloy,hub,out,.010,6);
    }
    g.rod(rig,dark,[cx+side*.078,WHEEL,z],[cx+side*.110,WHEEL,z],.043,15);
    g.rod(fixed,steel,[cx-side*.057,WHEEL,z],[cx-side*.034,WHEEL,z],.160,24);
    g.box(fixed,cast,cx-side*.04,.451,z-.135,.07,.094,.06);
  }
}

function frameRise(sample,run){
  const s=run.static, c=Math.cos(-sample.pitch),n=Math.sin(-sample.pitch);
  const pivot=run.geometry.cgHeight??.85, cg=(run.geometry.frontAxleZ??FRONT)-run.geometry.frontArm, nominal=(run.geometry.rearArm*s.nominalFrontTireDeflection+run.geometry.frontArm*s.nominalRearTireDeflection)/run.geometry.wheelbase;
  const dy=pivot+sample.body-nominal-pivot*c+cg*n,dz=cg-pivot*n-cg*c;
  const wheelF=sample.frontWheel-s.nominalFrontTireDeflection,wheelR=sample.rearWheel-s.nominalRearTireDeflection;
  return {c,n,dy,dz,wheelF,wheelR,world:(p)=>[p[0],p[1]*c-p[2]*n+dy,p[1]*n+p[2]*c+dz]};
}

function articulations(g,pose){
  const body=pose.world,F=pose.wheelF,R=pose.wheelR;
  for(const side of [-1,1]){
    const hub=[side*.716,.405+F,FRONT], low=[side*.705,.328+F,FRONT];
    g.rod('world',steel,low,[side*.722,.526+F,FRONT],.038,7);
    for(const dz of [-.206,.206]){
      g.rod('world',frontAccent,body([side*.354,.347,FRONT+dz]),low,.030,7);
      g.rod('world',cast,body([side*.476,.582,FRONT+dz*.71]),[side*.713,.554+F,FRONT],.018,6);
    }
    g.rod('world',steel,body([side*.149,.47,FRONT]),hub,.024,8);
    g.rod('world',frontAccent,body([side*.354,.347,1.22]),body([side*.39,.428,.088]),.019,7);
    const lower=[side*.601,.345+F,1.474],top=body([side*.47,.755,1.505]);
    const sleeve=lerp(top,lower,Math.min(.91,.22/Math.hypot(...sub(top,lower))));
    g.rod('world',frontAccent,top,sleeve,.031,8);g.rod('world',alloy,sleeve,lower,.017,7);
    const bot=[side*.48,.460+R,-1.445], cap=body([side*.48,.783,-1.445]), turn=5.9,steps=46;
    let prev=null;
    for(let i=0;i<=steps;i++){
      const t=i/steps,a=TAU*t*turn;
      const p=[bot[0]+Math.cos(a)*.077,bot[1]+(cap[1]-bot[1])*t,bot[2]+(cap[2]-bot[2])*t+Math.sin(a)*.077];
      if(prev)g.rod('world',rearAccent,prev,p,.0125,4,false);
      prev=p;
    }
    const damper=[side*.585,.359+R,-1.377],tower=body([side*.59,.64,-1.659]);
    const rearSleeve=lerp(tower,damper,Math.min(.91,.19/Math.hypot(...sub(tower,damper))));
    g.rod('world',rearAccent,tower,rearSleeve,.027,7);g.rod('world',alloy,rearSleeve,damper,.014,7);
    g.rod('world',rearAccent,body([side*.49,.469,-.60]),[side*.60,.344+R,REAR],.026,7);
    g.rod('world',cast,body([side*.373,.64,-.95]),[side*.390,.482+R,REAR],.022,7);
  }
  g.rod('world',cast,body([.037,.49,.04]),[.018,.409+R,REAR+.11],.036,9);
  g.rod('world',steel,body([-.54,.62,-1.49]),[.54,.452+R,-1.48],.022,7);
}

function road(g,sample,run){
  const frontAxle=run.geometry.frontAxleZ??FRONT, start=frontAxle-sample.x, width=run.settings.bumpWidth, full=2.15;
  const height=z=>roadHeight(z-start,run.settings);
  const stations=[-65,65];
  for(let i=0;i<=24;i++){
    const z=start+width*i/24;if(z>-65&&z<65)stations.push(z);
  }
  stations.sort((a,b)=>a-b);
  g.quad('ground',shoulder,[-70,-.029,-65],[70,-.029,-65],[70,-.029,65],[-70,-.029,65],[0,1,0]);
  function surface(mat,left,right,z1,z2,lift=0){
    const a=height(z1)+lift,b=height(z2)+lift;
    g.quad('ground',mat,[left,a,z1],[right,a,z1],[right,b,z2],[left,b,z2],unit([0,z2-z1,a-b]));
  }
  for(let j=1;j<stations.length;j++){
    const a=stations[j-1],b=stations[j],on=a>=start-.00001&&b<=start+width+.00001&&run.settings.bumpHeight>0;
    if(b-a<1e-6)continue;
    surface(on?bumpMat:asphalt,-full,full,a,b);
    for(const side of [-1,1])surface(margin,side*1.985-.019,side*1.985+.019,a,b,.0026);
    if(on) for(const side of [-1,1]){
      const u=((a+b)*.5-start)/width;
      if((u>.02&&u<.14)||(u>.86&&u<.99))
        for(let i=0;i<4;i++){const x=side*(.39+i*.399);surface(warning,x-.142,x+.142,a,b,.004);}
    }
  }
  const phase=((sample.x%1.5)+1.5)%1.5;
  for(let i=-13;i<=13;i++)for(const side of [-1,1]){
    const z=frontAxle+i*1.5-phase;
    if(z>start-.05&&z<start+width+.05) continue;
    const x=side*1.86;
    surface(tick,x-.058,x+.058,z,z+.045,.003);
  }

}

function loadMaps(done){
  const maps=new Map();
  if(typeof Image==='undefined')return maps;
  for(const file of new Set(materials.map(m=>m[3]).filter(Boolean))){
    const image=new Image();
    image.onload=()=>{
      try{
        const scale=Math.min(1,768/Math.max(image.width,image.height)),w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));
        const el=typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):document.createElement('canvas');el.width=w;el.height=h;
        const ctx=el.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);
        const levels=[{w,h,data:ctx.getImageData(0,0,w,h).data}];
        let mw=w,mh=h;
        while(mw>8||mh>8){
          mw=Math.max(1,mw>>1);mh=Math.max(1,mh>>1);
          el.width=mw;el.height=mh;ctx.drawImage(image,0,0,mw,mh);
          levels.push({w:mw,h:mh,data:ctx.getImageData(0,0,mw,mh).data});
        }
        maps.set(file,levels);done();
      }catch{/* The geometry remains interactive if a texture cannot decode. */}
    };
    image.src=drivingTexture(file);
  }return maps;
}

const rgbInt=(r,g,b)=>0xff000000|(clamp(b,0,255)<<16)|(clamp(g,0,255)<<8)|clamp(r,0,255);
const missingColor=file=>(file.includes('paint')||file.includes('bonnet'))?[42,83,79]:file.includes('glass')?[70,97,102]:file.includes('cladding')?[151,148,133]:file.includes('taillight')?[157,54,45]:file.includes('headlight')?[194,196,174]:file.includes('wheel')?[70,70,66]:file.includes('spare')?[62,64,60]:[181,186,171];

export function createSimSoftware(canvas,THREE,rig=null){
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('A Canvas2D context is required.');
  const sceneMaterials=materials.slice();
  const fleet=rig ? prepareFleetSoftware(THREE,rig,sceneMaterials) : null;
  const castMaterials=fleet?sceneMaterials.map(m=>({transparent:m[5]})):null;
  let shadowCaster, fleetShadow;
  let vehicle=[];
  if(!fleet){
    const mechanism=new Geometry();
    wheels(mechanism);
    vehicle=[...readMesh(packed,pieces),...readMesh(chassisMesh.packed,chassisMesh.pieces,chassisOffset),...mechanism.mesh()];
  }
  const projection=new THREE.Matrix4(),frustum=fleet ? new THREE.Frustum() : null,scratch=new Map();
  const reflection=makeDrivingReflection();
  let W=0,H=0,requestedW=0,requestedH=0,image,rgba,depth,backdrop;
  let dead=false,last=null,queued=false,sceneKey='',live=[],prevCost=0,scaleHint=1,refine=0;
  // A repeatable two-scale aggregate texture follows the physical road. Noise
  // is attenuated with distance rather than swimming in screen coordinates.
  const grain=new Int8Array(256*256); let seed=87431;
  for(let i=0;i<grain.length;i++){seed=(Math.imul(1664525,seed)+1013904223)>>>0;grain[i]=((seed>>>26)-31)/5;}
  const maps=fleet ? new Map() : loadMaps(()=>{
    if(dead||!last||queued)return;
    queued=true;
    const redraw=()=>{queued=false;if(!dead&&last)draw(...last);};
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(redraw);else setTimeout(redraw,0);
  });
  function dimensions(settled){
    const w=Math.max(1,requestedW||canvas.clientWidth||canvas.width||600),h=Math.max(1,requestedH||canvas.clientHeight||canvas.height||400);
    const dpr=globalThis.devicePixelRatio||1;
    const s=settled ? Math.min(clamp(dpr,1.6,2),1700/w,Math.sqrt(1100000/(w*h)))
      : Math.min(scaleHint,1050/w,Math.sqrt(460000/(w*h)));
    const x=Math.max(1,Math.round(w*s)),y=Math.max(1,Math.round(h*s));
    if(x===W&&y===H)return;
    W=x;H=y;canvas.width=W;canvas.height=H;image=ctx.createImageData(W,H);rgba=new Uint32Array(image.data.buffer);depth=new Float32Array(W*H);backdrop=new Uint32Array(W*H);
    for(let j=0;j<H;j++){const k=j/H;backdrop.fill(rgbInt(16+12*k,36+23*k,34+18*k),j*W,(j+1)*W);}
  }
  function scratchFor(mesh){
    const count=mesh.positions.length/3+3;
    // Fixed meshes retain their projected-vertex arrays. Bounded, ephemeral
    // road and linkage meshes share buffers by material and array size.
    const key=mesh.rig==='world'||mesh.rig==='ground'?mesh.rig+mesh.material:mesh;
    let a=scratch.get(key);
    if(!a||a.length<count*7){a=new Float32Array(count*7);scratch.set(key,a);}
    return a;
  }
  function draw(camera,sample,run,cutaway=false,settled=false){
    if(dead||!sample||!run)return;
    const t0=performance.now(),moving=last && last[1].t!==sample.t;last=[camera,sample,run,cutaway];
    dimensions(settled);rgba.set(backdrop);depth.fill(0);
    camera.updateMatrixWorld();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const M=projection.elements,eye=camera.position, near=camera.near;
    frustum?.setFromProjectionMatrix(projection);
    const pose=frameRise(sample,run),spin=(sample.x-run.startX)/WHEEL,cs=Math.cos(spin),sn=Math.sin(spin);
    const groundOn=eye.y>.055;
    const key=[run.settings.speed,run.settings.bumpWidth,run.settings.bumpHeight,run.settings.weight,run.settings.stiffness,sample.t,groundOn].join('|');
    if(key!==sceneKey){
      const g=new Geometry();
      if(!fleet)articulations(g,pose);
      if(groundOn)road(g,sample,run);
      live=g.mesh();sceneKey=key;
    }
    if(fleet){
      vehicle=fleet.sync(sample,run,cutaway);
      if(settled && vehicle!==shadowCaster){
        fleetShadow=makeKeyShadow(vehicle,castMaterials,new Uint8Array(vehicle.length).fill(1));
        shadowCaster=vehicle;
      }
    }
    const geo=run.geometry,frontZ=geo.frontAxleZ??FRONT,rearZ=geo.rearAxleZ??REAR;
    const shadowW=(geo.width??1.94)*.71,shadowL=(geo.length??4.89)*.59;
    const solid=[],blended=[],track=[],transparentTriangles=[];
    for(const mesh of [...vehicle,...live]){
      if(mesh.object && !frustum.intersectsObject(mesh.object))continue;
      if(cutaway && (mesh.rig==='shell'||mesh.rig==='floor'||mesh.rig==='fw-1'||mesh.rig==='rw-1'))continue;
      if(mesh.rig==='ground')track.push(mesh);
      else if(sceneMaterials[mesh.material][5])blended.push(mesh);
      else solid.push(mesh);
    }
    // Opaque bodywork fills depth first so hidden stretches of track can skip
    // their grain and shadow work. Glass composites over the resulting color.
    for(const mesh of [...solid,...track,...blended]){
      const m=sceneMaterials[mesh.material],p=mesh.positions,n=mesh.normals, idx=mesh.indices,uv=mesh.uv,rig=mesh.rig;
      const shade=rig==='fleet'?m[6]:null, shadow=shade&&vehicle===shadowCaster?fleetShadow:null;
      const winding=mesh.object?.matrixWorld.determinant()<0 ? -1 : 1;
      const buf=scratchFor(mesh), levels=maps.get(m[3]), color=(!levels&&m[3])?missingColor(m[3]):m[0];
      const isGlass=m[5], opacity=isGlass?m[4]:1,base=m[1],rough=m[2];
      const transparentSurface=isGlass && opacity<.99;
      const glossy=rough<.73 && (base>.18 || transparentSurface);
      const mip=clamp(Math.round(rough*4),0,4);
      const gloss=(1-rough)*(1-rough);
      let c=1,s=0,dy=0,dz=0,wheelMode=false,wheelCenter=0,roadUnder=0;
      if(rig==='shell'||rig==='frame'||rig==='floor'){c=pose.c;s=pose.n;dy=pose.dy;dz=pose.dz;}
      else if(rig==='fa'||rig==='ra'){dy=rig==='fa'?pose.wheelF:pose.wheelR;}
      else if(rig.startsWith('fw')||rig.startsWith('rw')){
        const front=rig.startsWith('fw'),center=front?FRONT:REAR,offset=front?pose.wheelF:pose.wheelR;
        c=cs;s=sn;dy=.405+offset-.405*c+center*s;dz=center-.405*s-center*c;
        wheelMode=true;wheelCenter=center;roadUnder=front?sample.frontRoad:sample.rearRoad;
      }
      let visible=0,allL=true,allR=true,allT=true,allB=true;
      const under=eye.y<.25||cutaway;
      for(let i=0,k=0,o=0;k<p.length;i++,k+=3,o+=7){
        const x=p[k],ry=p[k+1],rz=p[k+2],z=ry*s+rz*c+dz;
        let y=ry*c-rz*s+dy;
        // A loaded tire can flatten against the road without squashing its rim.
        if(wheelMode && y<roadUnder+.035 && Math.abs(z-wheelCenter)<.24)
          y=Math.max(y,roadHeight(sample.x+z-FRONT,run.settings));
        const w=M[3]*x+M[7]*y+M[11]*z+M[15],inv=Math.abs(w)>1e-7?1/w:1e7;
        const sx=(1+(M[0]*x+M[4]*y+M[8]*z+M[12])*inv)*W*.5;
        const sy=(1-(M[1]*x+M[5]*y+M[9]*z+M[13])*inv)*H*.5;
        buf[o]=sx;buf[o+1]=sy;buf[o+2]=w;
        if(w>=near){visible++;if(sx>=0)allL=false;if(sx<W)allR=false;if(sy>=0)allT=false;if(sy<H)allB=false;}
        const nx=n[k],ny=n[k+1]*c-n[k+2]*s,nz=n[k+1]*s+n[k+2]*c;
        if(shade){
          let vx=eye.x-x,vy=eye.y-y,vz=eye.z-z;
          const inverse=1/Math.sqrt(vx*vx+vy*vy+vz*vz+.000001);
          vx*=inverse;vy*=inverse;vz*=inverse;
          const key=shadow?shadow.visible(x,y,z,nx,ny,nz):1;
          shade(nx,ny,nz,vx,vy,vz,buf,o+3,key);
          // A fourth channel is unused for the fleet's geometric liveries.
          continue;
        }
        const sun=Math.max(0,-.56*nx+.73*ny+.39*nz),fill=Math.max(0,.54*nx+.38*ny-.57*nz);
        let light=.66+.36*sun+.11*(ny*.5+.5)+.16*fill;
        if(under)light+=.13+.20*Math.max(0,-ny);
        let glint=0;
        if(glossy){
          let vx=eye.x-x,vy=eye.y-y,vz=eye.z-z;
          const invLength=1/Math.sqrt(vx*vx+vy*vy+vz*vz+.000001);
          vx*=invLength;vy*=invLength;vz*=invLength;
          // Normals are quantized in the reduced mesh and back faces are drawn
          // on thin glass. Orient the reflection on either side of that sheet.
          const signed=clamp(nx*vx+ny*vy+nz*vz,-1,1);
          const radiance=reflection(2*signed*nx-vx,2*signed*ny-vy,2*signed*nz-vz,mip);
          const sky=Math.min(1.8,radiance), grazing=(1-Math.abs(signed))**5;
          light*=1+base*(1-rough)*(-.51+.46*sky);
          const lacquer=transparentSurface?.72:base*(.49+.60*gloss);
          glint=(12+39*grazing)*lacquer*sky;
        }
        buf[o+3]=light;buf[o+4]=glint;buf[o+5]=uv?uv[i*2]:0;buf[o+6]=uv?uv[i*2+1]:0;
      }
      // If some vertices are behind the camera they may still clip onto the
      // screen, particularly the long road. Only reject a fully projected mesh.
      if(!visible || (visible===p.length/3&&(allL||allR||allT||allB)))continue;
      const roadFill=rig==='ground', farGround=mesh.material===shoulder;
      const roadGrain=mesh.material===asphalt||mesh.material===bumpMat||farGround;
      const carLoad=clamp(1-.78*pose.dy,.62,1.08),xAdvance=sample.x;
      const frontLoad=clamp(1-Math.max(0,pose.wheelF-sample.frontRoad)*4.5,0,1);
      const rearLoad=clamp(1-Math.max(0,pose.wheelR-sample.rearRoad)*4.5,0,1);
      const depthBias=roadFill&&mesh.material!==asphalt&&mesh.material!==bumpMat&&mesh.material!==shoulder?1e-6:(mesh.offset||0);
      function raster(a,b,c){
        const x0=buf[a],y0=buf[a+1],q0=1/buf[a+2],x1=buf[b],y1=buf[b+1],q1=1/buf[b+2],x2=buf[c],y2=buf[c+1],q2=1/buf[c+2];
        const dx1=x1-x0,dx2=x2-x0,dy1=y1-y0,dy2=y2-y0, det=dx1*dy2-dx2*dy1;
        if(Math.abs(det)<.035 || (mesh.side===0 && det*winding>0) || (mesh.side===1 && det*winding<0))return;
        const first=Math.max(0,Math.ceil(Math.min(y0,y1,y2)-.5)),lastY=Math.min(H-1,Math.floor(Math.max(y0,y1,y2)-.5));
        const minX=Math.max(0,Math.ceil(Math.min(x0,x1,x2)-.5)),maxX=Math.min(W-1,Math.floor(Math.max(x0,x1,x2)-.5));
        if(lastY<first||minX>maxX)return;
        const ax=dy2/det,bx=-dy1/det,ay=-dx2/det,by=dx1/det, qx=(q1-q0)*ax+(q2-q0)*bx,qy=(q1-q0)*ay+(q2-q0)*by;
        const f0=buf[a+3],g0=buf[a+4],f1=buf[b+3]-f0,f2=buf[c+3]-f0,g1=buf[b+4]-g0,g2=buf[c+4]-g0;
        const fx=f1*ax+f2*bx,fy=f1*ay+f2*by,gx=g1*ax+g2*bx,gy=g1*ay+g2*by;
        const blue0=shade?buf[a+5]:0,blue1=shade?buf[b+5]-blue0:0,blue2=shade?buf[c+5]-blue0:0;
        const blueX=blue1*ax+blue2*bx,blueY=blue1*ay+blue2*by;
        const u0=buf[a+5]*q0,v0=buf[a+6]*q0;
        let ux=0,uy=0,vx=0,vy=0,tex=null;
        if(levels||roadFill){
          const u1=buf[b+5]*q1-u0,u2=buf[c+5]*q2-u0,v1=buf[b+6]*q1-v0,v2=buf[c+6]*q2-v0;
          ux=u1*ax+u2*bx;uy=u1*ay+u2*by;vx=v1*ax+v2*bx;vy=v1*ay+v2*by;
          if(levels){
            const base=levels[0],du1=buf[b+5]-buf[a+5],du2=buf[c+5]-buf[a+5],dv1=buf[b+6]-buf[a+6],dv2=buf[c+6]-buf[a+6];
            const footprint=Math.max(1,Math.abs(du1*ax+du2*bx)*base.w,Math.abs(du1*ay+du2*by)*base.w,Math.abs(dv1*ax+dv2*bx)*base.h,Math.abs(dv1*ay+dv2*by)*base.h);
            tex=levels[Math.min(levels.length-1,Math.max(0,Math.floor(Math.log2(footprint))))];
          }
        }
        let xa=x0,xb=x1,xc=x2,ya=y0,yb=y1,yc=y2,t;
        if(ya>yb){t=xa;xa=xb;xb=t;t=ya;ya=yb;yb=t;}
        if(yb>yc){t=xb;xb=xc;xc=t;t=yb;yb=yc;yc=t;}
        if(ya>yb){t=xa;xa=xb;xb=t;t=ya;ya=yb;yb=t;}
        const ac=(xc-xa)/(yc-ya||1),ab=(xb-xa)/(yb-ya||1),bc=(xc-xb)/(yc-yb||1);
        for(let y=first;y<=lastY;y++){
          const yy=y+.5,L=xa+(yy-ya)*ac,R=yy<yb?xa+(yy-ya)*ab:xb+(yy-yb)*bc;
          const start=Math.max(0,Math.ceil(Math.min(L,R)-.5)),end=Math.min(W-1,Math.ceil(Math.max(L,R)-.5)-1);
          if(start>end)continue;
          const dx=start+.5-x0,dy=yy-y0;
          let q=q0+dx*qx+dy*qy,f=f0+dx*fx+dy*fy,g=g0+dx*gx+dy*gy,u=u0+dx*ux+dy*uy,v=v0+dx*vx+dy*vy,px=y*W+start;
          let blue=blue0+dx*blueX+dy*blueY;
          for(let x=start;x<=end;x++,px++,q+=qx,f+=fx,g+=gx,u+=ux,v+=vx,blue+=blueX){
            if(q+depthBias<depth[px]-.00000009)continue;
            let r=color[0],gg=color[1],b=color[2],alpha=opacity;
            if(tex){
              const U=clamp(u/q,0,1),V=clamp(1-v/q,0,1),at=4*((((tex.h-1)*V+.5)|0)*tex.w+(((tex.w-1)*U+.5)|0));
              r*=tex.data[at]/255;gg*=tex.data[at+1]/255;b*=tex.data[at+2]/255;alpha*=tex.data[at+3]/255;
              if(alpha<.13)continue;
            }
            if(shade){r=f;gg=g;b=blue;}
            else {r=r*f+.95*g;gg=gg*f+g;b=b*f+1.06*g;}
            if(roadFill){
              const dist=1/q,wx=u*dist,wz=v*dist;
              if(roadGrain){
                const gx=Math.floor(wx*75)&255,gz=Math.floor((wz+xAdvance)*75)&255;
                const coarse=grain[((Math.floor((wz+xAdvance)*8)&255)<<8)+(Math.floor(wx*8)&255)];
                const texture=(grain[(gz<<8)+gx]*.62+coarse*.38)*clamp((26-dist)/20,0,1);
                r+=texture;gg+=texture;b+=texture;
              }
              if(!farGround && Math.abs(wx)<shadowW+.5 && Math.abs(wz)<shadowL+.55){
                const bx=(wx-.10)/shadowW,bz=(wz+.12)/shadowL;
                let broad=clamp(1-bx*bx-bz*bz,0,1);
                broad=broad*broad*(3-2*broad);
                let shade=broad*(cutaway?.21:.47)*carLoad;
                const front=wz>(frontZ+rearZ)*.5,axle=front?frontZ:rearZ;
                const track=(front?geo.frontTrack:geo.rearTrack)??1.618;
                const radius=(front?geo.frontWheelRadius:geo.rearWheelRadius)??WHEEL;
                const dx=(Math.abs(wx)-track*.5)/(radius*.94),dz=(wz-axle)/(radius*1.09);
                if(!(cutaway&&wx<0)){
                  let tire=clamp(1-dx*dx-dz*dz,0,1);
                  shade+=tire*tire*(wz>0?frontLoad:rearLoad)*.46;
                }
                const gain=1-Math.min(.78,shade);
                r*=gain;gg*=gain;b*=gain;
              }
              const fog=clamp((dist-8)/35,0,.84);
              r+=(23-r)*fog;gg+=(43-gg)*fog;b+=(39-b)*fog;
              if(farGround){r*=.94;gg*=.96;b*=.94;}
            }
            if(alpha<.995){
              const prev=rgba[px];r=r*alpha+(prev&255)*(1-alpha);gg=gg*alpha+((prev>>8)&255)*(1-alpha);b=b*alpha+((prev>>16)&255)*(1-alpha);
            }
            rgba[px]=rgbInt(r,gg,b);if(!isGlass||alpha>.92)depth[px]=q+depthBias;
          }
        }
      }
      // Complete near-plane clipping keeps the course and body visible when
      // the observer zooms close or orbits below the axle line.
      const clipStart=p.length/3*7;
      const activeBuf=buf;
      function clipped(a,b,c){
        const polygon=[a,b,c],out=[];let cursor=clipStart;
        for(let j=0;j<3;j++){
          const A=polygon[j],B=polygon[(j+1)%3],da=activeBuf[A+2],db=activeBuf[B+2];
          if(da>=near)out.push(A);
          if((da>=near)!==(db>=near)){
            const t=(near-da)/(db-da),l=1-t;
            activeBuf[cursor]=(activeBuf[A]*da*l+activeBuf[B]*db*t)/near;
            activeBuf[cursor+1]=(activeBuf[A+1]*da*l+activeBuf[B+1]*db*t)/near;
            activeBuf[cursor+2]=near;
            for(let k=3;k<7;k++)activeBuf[cursor+k]=activeBuf[A+k]*l+activeBuf[B+k]*t;
            out.push(cursor);cursor+=7;
          }
        }for(let j=1;j+1<out.length;j++)raster(out[0],out[j],out[j+1]);
      }
      function triangle(a,b,c){
        if(buf[a+2]>=near&&buf[b+2]>=near&&buf[c+2]>=near)raster(a,b,c);
        else if(buf[a+2]>=near||buf[b+2]>=near||buf[c+2]>=near)clipped(a,b,c);
      }
      for(let i=0;i<idx.length;i+=3){
        const a=idx[i]*7,b=idx[i+1]*7,c=idx[i+2]*7;
        if(isGlass){
          // Near and far side windows share materials and can occupy the same
          // batch. Sort their triangles after projected vertices are ready.
          transparentTriangles.push({a,b,c,depth:buf[a+2]+buf[b+2]+buf[c+2],triangle});
        }else triangle(a,b,c);
      }
    }
    transparentTriangles.sort((a,b)=>b.depth-a.depth);
    for(const t of transparentTriangles)t.triangle(t.a,t.b,t.c);
    ctx.putImageData(image,0,0);
    clearTimeout(refine);
    if(!settled){
      const elapsed=performance.now()-t0;
      prevCost=prevCost?prevCost*.8+elapsed*.2:elapsed;
      if(prevCost>(moving?44:70)&&scaleHint>.59){scaleHint=Math.max(.59,scaleHint-.07);prevCost=35;}
      else if(prevCost<16&&scaleHint<1){scaleHint=Math.min(1,scaleHint+.025);prevCost=27;}
      // Orbit or playback uses the adaptive resolution above. After *any*
      // interaction settles, supersample the held pose for clean trim edges.
      refine=setTimeout(()=>{if(!dead&&last)draw(...last,true);},180);
    }
  }
  return {draw,resize(w,h){requestedW=w;requestedH=h;},dispose(){dead=true;clearTimeout(refine);last=null;scratch.clear();maps.clear();}};
}
