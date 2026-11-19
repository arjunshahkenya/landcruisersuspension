import { sampleDaylight } from './daylight.js';

// Linear radiance for a car-sized daylight studio. Tall diffusion frames, a
// clouded overhead skylight and black flags give chrome and curved paint a
// recognisable scene to reflect. Both renderers use the same lighting plan.
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const smooth = (a,b,v) => { const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t); };
const band = (v,lo,hi,feather) => smooth(lo-feather,lo+feather,v)*(1-smooth(hi-feather,hi+feather,v));
function azimuthGate(angle, center, span, feather) {
  const d=Math.abs(Math.atan2(Math.sin(angle-center),Math.cos(angle-center)));
  return 1-smooth(span-feather,span+feather,d);
}
export function skyRadiance(x,y,z, out) {
  const a=Math.atan2(z,x);
  sampleDaylight(x,y,z,out);
  // Natural sky and foliage break across the glass and lacquer. A small
  // neutral bounce keeps the lower surfaces legible through the open bay.
  const bounce=.025+.038*(1-Math.abs(y));
  let r=out[0]+bounce, g=out[1]+bounce, b=out[2]+bounce;
  // Negative fill flags between the white side walls and overhead diffusion.
  const black=azimuthGate(a,-1.97,.70,.06)*band(y,-.38,.30+.09*z,.045)*.92
    + azimuthGate(a,1.12,.59,.07)*band(y,-.28,.36-.08*x,.035)*.86;
  const factor=Math.max(.075,1-black);
  r*=factor;g*=factor;b*=factor;
  const strip=azimuthGate(a,-2.75,1.02,.13)*band(y,-.10+.08*z,.14+.09*z,.04);
  const wall=azimuthGate(a,.24,.75,.06)*band(y,-.24,.34,.06);
  const roof=azimuthGate(a,2.73,1.12,.16)*band(y,.46,.86,.09);
  const tall=azimuthGate(a,-.91,.15,.04)*band(y,-.17,.71,.05);
  r+=strip*2.4+wall*1.65+roof*1.6+tall*2.2;
  g+=strip*2.45+wall*1.60+roof*1.7+tall*2.25;
  b+=strip*2.5+wall*1.51+roof*1.82+tall*2.2;
  out[0]=r;out[1]=g;out[2]=b;
}

// Cube lookup avoids atan2/asin in the vertex loop. Downsampled radiance is
// used for rough alloys and rubber, preserving tight reflections on glazing.
const faceSize=64, levels=5, faces=[];
function makeFaces(){
  if(faces.length)return;
  const rgb=[0,0,0];
  for(let f=0;f<6;f++){
    const mips=[],base=new Float32Array(faceSize*faceSize*3);
    for(let v=0;v<faceSize;v++)for(let u=0;u<faceSize;u++){
      const s=(u+.5)*2/faceSize-1,t=(v+.5)*2/faceSize-1;
      let x,y,z;
      if(f<2){x=f? -1:1;y=t;z=s;}else if(f<4){x=s;y=f===3?-1:1;z=t;}else{x=s;y=t;z=f===5?-1:1;}
      const n=1/Math.hypot(x,y,z);skyRadiance(x*n,y*n,z*n,rgb);
      base.set(rgb,(v*faceSize+u)*3);
    }
    mips.push(base);
    let size=faceSize;
    while(mips.length<levels){
      const src=mips.at(-1),s=size>>1,dst=new Float32Array(s*s*3);
      for(let y=0;y<s;y++)for(let x=0;x<s;x++)for(let c=0;c<3;c++){
        const a=(2*y*size+2*x)*3+c;dst[(y*s+x)*3+c]=(src[a]+src[a+3]+src[a+size*3]+src[a+size*3+3])*.25;
      }
      mips.push(dst);size=s;
    }
    faces.push(mips);
  }
}
function sampleSky(x,y,z,level,out){
  const ax=Math.abs(x),ay=Math.abs(y),az=Math.abs(z);
  let f,u,v,d;
  if(ax>=ay && ax>=az){f=x>0?0:1;u=z;v=y;d=ax;}
  else if(ay>=az){f=y>0?2:3;u=x;v=z;d=ay;}
  else{f=z>0?4:5;u=x;v=y;d=az;}
  const size=faceSize>>level,scene=faces[f][level];
  const s=clamp((u/d*.5+.5)*size-.5,0,size-1.001),t=clamp((v/d*.5+.5)*size-.5,0,size-1.001);
  const i=s|0,j=t|0,k=(i+j*size)*3,fx=s-i,fy=t-j,a=(1-fx)*(1-fy),b=fx*(1-fy),c=(1-fx)*fy,e=fx*fy,low=k+size*3;
  out[0]=scene[k]*a+scene[k+3]*b+scene[low]*c+scene[low+3]*e;
  out[1]=scene[k+1]*a+scene[k+4]*b+scene[low+1]*c+scene[low+4]*e;
  out[2]=scene[k+2]*a+scene[k+5]*b+scene[low+2]*c+scene[low+5]*e;
}
// A lookup keeps the display conversion smooth and inexpensive for dark trim.
// The shoulder permits bright steel and glazing to roll off without clipping.
const display=new Uint8Array(8193);
for(let i=0;i<display.length;i++){
  const v=i/2048, mapped=v<.55?v:.55+.45*(1-Math.exp(-Math.max(0,v-.55)/.58));
  const srgb=mapped<.0031308?12.92*mapped:1.055*Math.pow(mapped,1/2.4)-.055;
  display[i]=clamp(Math.round(255*srgb),0,255);
}
const encode=v=>display[Math.min(8192, Math.max(0,(v*2048+.5)|0))];
const texGain=Float32Array.from({length:8193},(_,i)=>{
  const v=i/2048;
  return 255*(v<.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055);
});
const glassTint=[.68,.85,1.04];
export function makeShade(material) {
  makeFaces();
  const {color, metalness=0, roughness=.55, clearcoat=0} = material;
  const c=[color?.r??1,color?.g??1,color?.b??1];
  const textured=!!material.map, glass=material.transparent && clearcoat>.1;
  const recordedPaint=textured && !glass && clearcoat>.24 && metalness>.28;
  const coatGain=recordedPaint?.38:1;
  const intensity=material.envMapIntensity??1, coatGloss=1-(material.clearcoatRoughness??roughness);
  const constants=(r,m)=>{
    const gloss=(1-r)*(1-r);
    return {level:clamp(Math.round(r*r*4.4),0,levels-1), gloss,
      fresnelBase:(.027+clearcoat*.042)*(1-m), mirror:m*(.27+.61*gloss), metalness:m};
  };
  const base=constants(roughness,metalness), finishes=new Map();
  function finish(rough,metal){
    if(rough===255&&metal===255)return base;
    const id=(rough>>4)*16+(metal>>4);
    if(!finishes.has(id))finishes.set(id,constants(roughness*rough/255,metalness*metal/255));
    return finishes.get(id);
  }
  const env=[0,0,0];
  return function shade(nx,ny,nz,vx,vy,vz,output,i,keyVisible,rough=255,metal=255) {
    const finishProps=finish(rough,metal);
    const {level,gloss,fresnelBase,mirror}=finishProps;
    const dot=clamp(nx*vx+ny*vy+nz*vz,0,1), edge=1-dot, f=edge*edge*edge*edge*edge;
    const up=ny*.5+.5,key=Math.max(0,-.49*nx+.70*ny+.52*nz),fill=Math.max(0,.71*nx+.35*ny-.60*nz);
    const inspection=clamp(-vy*1.4+.08,0,1);
    const underside=Math.max(0,-ny)*inspection*(.42+.25*Math.max(0,.53*nx-.74*ny-.40*nz));
    const light=(.18+.36*up+.22*fill)*(.75+.25*keyVisible)+.83*key*(.05+.95*keyVisible)+underside;
    const rx=2*dot*nx-vx,ry=2*dot*ny-vy,rz=2*dot*nz-vz;
    sampleSky(rx,ry,rz,level,env);
    // Metallic pigment follows the reflected environment; clear lacquer adds
    // an untinted reflection over it. Smooth glass gains reflectivity at the edge.
    const spec=(fresnelBase+(1-fresnelBase)*f*.88)*(.12+.88*gloss+.10*clearcoat*coatGloss)*intensity;
    const diffuse=light*(1-.58*finishProps.metalness)*(1-(glass?.15:.06)*f);
    let reflected=0;
    for(let channel=0;channel<3;channel++){
      const refl=env[channel];
      const skySpec=spec*coatGain*(.65+.35*keyVisible)*refl*(glass?.78:.83)*(glass?glassTint[channel]:1);
      const body=c[channel]*(diffuse+mirror*(.09+.78*refl));
      if(textured){
        // This is diffuse irradiance for a per-pixel sRGB map. The reflection
        // is passed separately and added *after* applying the texel colour.
        output[i+channel]=texGain[Math.min(8192,Math.max(0,(body*2048+.5)|0))];
        reflected+=skySpec;
      }else output[i+channel]=encode(body+skySpec);
    }
    if(textured) output[3*output.length/4+i/3]=encode(reflected/3);
  };
}
