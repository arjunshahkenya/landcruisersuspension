import { DEFAULTS, roadHeight } from './sim-physics.js';

const halfTrack = 2.15;
const halfBump = 2.015;
// The vehicle meshes are offset 5 mm from the axle midpoint in local Z.
const frontAxle = 1.420;
const trackPeriod = 5;
const paintPeriod = 1.4;
const trackReach = 80;
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x-a)/(b-a)));
  return t*t*(3-2*t);
};
const repeat = x => x - Math.floor(x);
const mix = (a,b,t) => a+(b-a)*t;

// Small deterministic color textures keep the track self-contained. UVs are
// in physical road coordinates so the grain and cadence marks move together.
function trackTexture(T, kind) {
  const w = kind === 'floor' ? 128 : 512;
  const h = kind === 'floor' ? 128 : kind === 'bump' ? 256 : 512;
  const pixels = new Uint8Array(w*h*4);
  let seed = 527961;
  const rand = () => {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let j=0; j<h; j++) {
    const v = (j+.5)/h;
    const z = v*(kind==='bump' ? paintPeriod : trackPeriod);
    for (let i=0; i<w; i++) {
      const x = ((i+.5)/w*2-1)*(kind==='bump' ? halfBump : halfTrack);
      const a = Math.abs(x), r = rand();
      let red,green,blue;
      const grit = (rand()-.5)*12 + (r > .976 ? 13 : r < .014 ? -13 : 0);
      const tireLane = Math.exp(-(((a-.80)/.23)**2));
      if (kind === 'floor') {
        red=41;green=58;blue=51;
      } else if (kind === 'lane') {
        red=69-4*tireLane;green=80-5*tireLane;blue=78-5*tireLane;
        const shoulder=smooth(2.074,2.140,a);
        red-=8*shoulder;green-=7*shoulder;blue-=7*shoulder;
        // Off-white edges and half-metre graduations stop clear of the tires.
        const edge = 1-smooth(.015,.025,Math.abs(a-2.057));
        const halfMeter = Math.round(z*2);
        const major = halfMeter===0 || halfMeter===10;
        const fullMeter = halfMeter % 2===0;
        const tickLength = major ? .32 : fullMeter ? .19 : .102;
        const across = smooth(2.028-tickLength-.008,2.028-tickLength+.008,a)*(1-smooth(2.025,2.035,a));
        const along = 1-smooth(major?.023:.012,major?.04:.024,Math.abs(z-halfMeter/2));
        const paint = Math.max(.80*edge,across*along*(major?.87:.67))*(r<.045?.53:1);
        red=mix(red,153,paint);green=mix(green,163,paint);blue=mix(blue,150,paint);
      } else {
        red=57;green=65;blue=61;
        // One pattern tile advances exactly two stripe intervals. This keeps
        // the diagonal hatch continuous over any selected bump length.
        const phase=repeat(x/.54+2*v);
        const stripe=smooth(.08,.105,phase)*(1-smooth(.44,.465,phase));
        const inside=1-smooth(1.78,1.86,a);
        const stripePaint=stripe*inside*(r<.046?.48:r<.11?.75:.91);
        red=mix(red,185,stripePaint);green=mix(green,148,stripePaint);blue=mix(blue,78,stripePaint);
      }
      const n = kind==='floor' ? grit*.29 : grit*(kind==='bump'?.87:1);
      const k=(j*w+i)*4;
      pixels[k]=Math.round(red+n);pixels[k+1]=Math.round(green+n);pixels[k+2]=Math.round(blue+n);pixels[k+3]=255;
    }
  }
  const texture=new T.DataTexture(pixels,w,h,T.RGBAFormat,T.UnsignedByteType);
  texture.name='Proving ground '+kind;
  texture.colorSpace=T.SRGBColorSpace;
  texture.wrapT=T.RepeatWrapping;
  texture.wrapS=kind==='floor'?T.RepeatWrapping:T.ClampToEdgeWrapping;
  texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}

function sheet(T, position, uv, indices) {
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildTestRoad(T, scene) {
  const stage=new T.Group();stage.name='Suspension proving ground';scene.add(stage);
  const asphalt=trackTexture(T,'lane'), bumpPaint=trackTexture(T,'bump'), floorMap=trackTexture(T,'floor');
  const matte=map=>new T.MeshStandardMaterial({color:0xffffff,map,roughness:.96,metalness:.025});
  function add(name,geometry,material){
    const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;stage.add(mesh);return mesh;
  }

  const road=add('4.3 m test lane',sheet(T,
    [-halfTrack,0,-trackReach, halfTrack,0,-trackReach, -halfTrack,0,trackReach, halfTrack,0,trackReach],
    [0,-trackReach/trackPeriod, 1,-trackReach/trackPeriod, 0,trackReach/trackPeriod, 1,trackReach/trackPeriod],
    [0,2,1,1,2,3]),matte(asphalt));
  road.renderOrder=-1;
  const grade=-.042, verge=150;
  add('Evergreen test surface',sheet(T,
    [-verge,grade,-verge, verge,grade,-verge, -verge,grade,verge, verge,grade,verge],
    [-verge/3,-verge/3,verge/3,-verge/3,-verge/3,verge/3,verge/3,verge/3],[0,2,1,1,2,3]),
    matte(floorMap));
  const margin=[],borderUV=[],borderIndex=[];
  for(const side of [-1,1]){
    const k=margin.length/3;
    margin.push(side*halfTrack,0,-trackReach,side*(halfTrack+.030),grade,-trackReach,
      side*halfTrack,0,trackReach,side*(halfTrack+.030),grade,trackReach);
    borderUV.push(0,0,1,0,0,1,1,1);
    if(side>0)borderIndex.push(k,k+2,k+1,k+1,k+2,k+3);
    else borderIndex.push(k,k+1,k+2,k+1,k+3,k+2);
  }
  add('Beveled asphalt margins',sheet(T,margin,borderUV,borderIndex),
    new T.MeshStandardMaterial({color:0x404942,roughness:.98,metalness:.02}));

  const bumpGroup=new T.Group();bumpGroup.name='Profile at the surveyed station';stage.add(bumpGroup);
  const lanes=[-halfBump,-1.995,-1.958,-1.909,-1.862,-1.72,0,1.72,1.862,1.909,1.958,1.995,halfBump];
  const slices=100,cols=lanes.length,vertexCount=(slices+1)*cols;
  const positions=new Float32Array(vertexCount*3),uv=new Float32Array(vertexCount*2);
  const indices=[];
  for(let row=0;row<=slices;row++)for(let col=0;col<cols;col++){
    const k=row*cols+col;
    positions[k*3]=lanes[col];uv[k*2]=.5+lanes[col]/(2*halfBump);
    if(row<slices&&col<cols-1)indices.push(k,k+cols,k+1,k+1,k+cols,k+cols+1);
  }
  const profile=new T.BufferGeometry();
  profile.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
  profile.setAttribute('uv',new T.BufferAttribute(uv,2).setUsage(T.DynamicDrawUsage));
  profile.setIndex(indices);
  const overlay=matte(bumpPaint);
  overlay.polygonOffset=true;overlay.polygonOffsetFactor=-1.2;overlay.polygonOffsetUnits=-1;
  const bump=new T.Mesh(profile,overlay);bump.name='Raised-cosine asphalt bump';
  bump.castShadow=true;bump.receiveShadow=true;bumpGroup.add(bump);

  // Narrow painted bars inset from either toe give a clear width reference.
  // They follow the same surface function as the raised asphalt.
  const trimXs=[-1.82,1.82], trimSteps=5;
  const trimPos=new Float32Array(2*(trimSteps+1)*2*3),trimIndex=[];
  for(let end=0;end<2;end++)for(let i=0;i<trimSteps;i++){
    const k=end*(trimSteps+1)*2+i*2;
    trimIndex.push(k,k+2,k+1,k+1,k+2,k+3);
  }
  const trimGeo=new T.BufferGeometry();
  trimGeo.setAttribute('position',new T.BufferAttribute(trimPos,3).setUsage(T.DynamicDrawUsage));trimGeo.setIndex(trimIndex);
  const trimMat=new T.MeshStandardMaterial({color:0xb29b64,roughness:.93,metalness:.01,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const trim=new T.Mesh(trimGeo,trimMat);trim.name='Painted bump toes';trim.receiveShadow=true;bumpGroup.add(trim);

  let oldWidth=NaN,oldHeight=NaN;
  function setProfile(settings){
    const width=settings.bumpWidth,height=settings.bumpHeight;
    if(width===oldWidth && height===oldHeight)return;
    oldWidth=width;oldHeight=height;
    for(let row=0;row<=slices;row++){
      const q=width*row/slices,h=roadHeight(q,settings);
      for(let col=0;col<cols;col++){
        const k=row*cols+col;
        // Taper only at the lateral ends; all four wheel paths see the exact
        // one-dimensional surface passed to the half-car integrator.
        positions[k*3+1]=h*(1-smooth(1.862,halfBump,Math.abs(lanes[col])));
        positions[k*3+2]=q;uv[k*2+1]=q/paintPeriod;
      }
    }
    profile.attributes.position.needsUpdate=true;profile.attributes.uv.needsUpdate=true;
    profile.computeVertexNormals();profile.computeBoundingSphere();
    const barWidth=Math.min(.021,width*.038),inset=Math.min(.062,width*.095);
    for(let end=0;end<2;end++)for(let i=0;i<=trimSteps;i++)for(let col=0;col<2;col++){
      const q=(end ? width-inset-barWidth : inset)+barWidth*i/trimSteps;
      const k=((end*(trimSteps+1)+i)*2+col)*3;
      trimPos[k]=trimXs[col];trimPos[k+1]=roadHeight(q,settings)+.00035;trimPos[k+2]=q;
    }
    trimGeo.attributes.position.needsUpdate=true;trimGeo.computeVertexNormals();trimGeo.computeBoundingSphere();
  }
  setProfile(DEFAULTS);
  return {
    update(sample,run,visible=true) {
      stage.visible=visible;
      if(!visible || !sample || !run)return;
      const settings=run.settings||DEFAULTS;
      setProfile(settings);
      const offset=(run.geometry?.frontAxleZ ?? frontAxle)-sample.x;
      bumpGroup.position.z=offset;
      bumpGroup.visible=settings.bumpHeight>0 && offset<trackReach && offset+settings.bumpWidth>-trackReach;
      asphalt.offset.y=repeat(-offset/trackPeriod);
      floorMap.offset.y=repeat(-offset/3);
    },
  };
}
