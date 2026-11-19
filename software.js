import { createRasterizer } from './software-raster.js';

function prepareScene(scene, T) {
  scene.updateMatrixWorld(true);
  const meshes=[], materials=[], objects=[], textures=new Map(), materialIds=new Map();
  function materialId(mat) {
    if(materialIds.has(mat)) return materialIds.get(mat);
    const id=materials.length, c=mat.color || new T.Color(0xffffff);
    const display=c.clone().convertLinearToSRGB();
    const map=mat.map?.uuid || '';
    const roughMap=mat.roughnessMap?.uuid || '', metalMap=mat.metalnessMap?.uuid || '';
    for(const tex of [mat.map,mat.roughnessMap,mat.metalnessMap]){
      if(tex)textures.set(tex.uuid,tex);
    }
    materialIds.set(mat,id);
    materials.push({
      color:{r:c.r,g:c.g,b:c.b},display:[255*display.r,255*display.g,255*display.b],
      metalness:mat.metalness,roughness:mat.roughness,clearcoat:mat.clearcoat,
      map,roughMap,metalMap,envMapIntensity:mat.envMapIntensity,clearcoatRoughness:mat.clearcoatRoughness,transparent:mat.transparent,alphaTest:mat.alphaTest||0,side:mat.side,
      depthWrite:mat.depthWrite, basic:mat.isMeshBasicMaterial===true,
      offset:mat.polygonOffset ? -mat.polygonOffsetUnits*.0000002 : 0
    });
    return id;
  }
  scene.traverse(object=>{
    const geometry=object.geometry;
    if(!object.isMesh || !geometry?.attributes.position) return;
    const attr=geometry.attributes, source=attr.position, n=source.count;
    const positions=new Float32Array(n*3), normals=new Float32Array(n*3);
    const matWorld=object.matrixWorld.elements, nm=new T.Matrix3().getNormalMatrix(object.matrixWorld).elements;
    const color=attr.color ? new Float32Array(n*3) : null;
    const uv=attr.uv ? new Float32Array(n*2) : null;
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity,z0=Infinity,z1=-Infinity;
    for(let i=0,k=0; i<n; i++,k+=3) {
      const x=source.getX(i),y=source.getY(i),z=source.getZ(i);
      const X=matWorld[0]*x+matWorld[4]*y+matWorld[8]*z+matWorld[12];
      const Y=matWorld[1]*x+matWorld[5]*y+matWorld[9]*z+matWorld[13];
      const Z=matWorld[2]*x+matWorld[6]*y+matWorld[10]*z+matWorld[14];
      positions[k]=X;positions[k+1]=Y;positions[k+2]=Z;
      x0=Math.min(X,x0);x1=Math.max(X,x1);y0=Math.min(Y,y0);y1=Math.max(Y,y1);z0=Math.min(Z,z0);z1=Math.max(Z,z1);
      const nx=attr.normal?.getX(i)||0,ny=attr.normal?.getY(i)||0,nz=attr.normal?.getZ(i)||0;
      const ax=nm[0]*nx+nm[3]*ny+nm[6]*nz,ay=nm[1]*nx+nm[4]*ny+nm[7]*nz,az=nm[2]*nx+nm[5]*ny+nm[8]*nz;
      const s=1/(Math.sqrt(ax*ax+ay*ay+az*az)||1);
      normals[k]=ax*s;normals[k+1]=ay*s;normals[k+2]=az*s;
      if(uv) { uv[i*2]=attr.uv.getX(i);uv[i*2+1]=attr.uv.getY(i); }
      if(color) { color[k]=Math.pow(attr.color.getX(i),1/2.2);color[k+1]=Math.pow(attr.color.getY(i),1/2.2);color[k+2]=Math.pow(attr.color.getZ(i),1/2.2); }
    }
    const indices=geometry.index?.array || null;
    const limit=indices?.length || n;
    const draw=geometry.drawRange;
    const start=Math.max(0,draw?.start||0),end=Math.min(limit,start+(draw?.count??limit));
    const groups=Array.isArray(object.material) ? geometry.groups : [{start,count:end-start,materialIndex:0}];
    for(const group of groups) {
      const a=Math.max(start,group.start),b=Math.min(end,group.start+group.count);
      const material=Array.isArray(object.material)?object.material[group.materialIndex]:object.material;
      if(a>=b||!material)continue;
      const ancestors=[];
      for(let p=object;p;p=p.parent) ancestors.push(p);
      const ground=object.name==='Feathered contact shadows';
      let mapUV=material.map?uv:null;
      if(mapUV){
        const texture=material.map;
        if(texture.matrixAutoUpdate)texture.updateMatrix();
        const e=texture.matrix.elements;
        if(e[0]!==1||e[1]!==0||e[3]!==0||e[4]!==1||e[6]!==0||e[7]!==0){
          mapUV=uv.slice();
          for(let t=0;t<uv.length;t+=2){
            mapUV[t]=e[0]*uv[t]+e[3]*uv[t+1]+e[6];
            mapUV[t+1]=e[1]*uv[t]+e[4]*uv[t+1]+e[7];
          }
        }
      }
      meshes.push({positions,normals,uv:mapUV,colors:material.vertexColors?color:null,indices,start:a,count:b-a,material:materialId(material),ground,
        order:object.renderOrder,frontSign:object.matrixWorld.determinant()<0?-1:1,center:[(x0+x1)/2,(y0+y1)/2,(z0+z1)/2],
        radius:Math.hypot(x1-x0,y1-y0,z1-z0)/2});
      objects.push({ancestors,material});
    }
  });
  return {model:{meshes,materials},objects,textures};
}

function readTexture(texture) {
  const image=texture.image;
  const w=image?.naturalWidth||image?.videoWidth||image?.width,h=image?.naturalHeight||image?.videoHeight||image?.height;
  if(!w||!h) return null;
  const scale=Math.min(1,1024/Math.max(w,h));
  const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale));
  const element=typeof OffscreenCanvas!=='undefined' ? new OffscreenCanvas(width,height) : document.createElement('canvas');
  element.width=width;element.height=height;
  const ctx=element.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(image,0,0,width,height);
  return {key:texture.uuid,width,height,flipY:texture.flipY,wrapS:texture.wrapS,wrapT:texture.wrapT,pixels:ctx.getImageData(0,0,width,height).data};
}

export async function createSoftwareRenderer(canvas, THREE) {
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)throw Error('This browser cannot create a 2D drawing surface.');
  let width=1,height=1,pixelRatio=1,prepared=null,worker=null,local=null;
  let inFlight=false,lastRequest=null,pending=null,lastRender=-Infinity,refineTimer=0;
  let receivedFrames=0, waitForTextures=0, texturePolls=0;
  const sent=new Map(), matrix=new THREE.Matrix4();
  function installTextures() {
    let unloaded=false,changed=false;
    for(const [key,texture] of prepared.textures) {
      if(sent.has(key)) continue;
      let data;
      try { data=readTexture(texture); }
      catch { sent.set(key,null); continue; }
      if(!data) { unloaded=true;continue; }
      sent.set(key,data); changed=true;
      if(worker) worker.postMessage({type:'texture',data});
      else local?.setTexture(data);
    }
    if(unloaded && !waitForTextures && texturePolls<120) waitForTextures=setTimeout(()=>{
      waitForTextures=0;texturePolls++;
      if(installTextures()) {
        if(lastRequest) enqueue({...lastRequest,final:true});
        api.onReady?.();
      }
    },250);
    return changed;
  }
  function present(data,w,h) {
    if(canvas.width!==w || canvas.height!==h) {canvas.width=w;canvas.height=h;}
    let image;
    if(typeof ImageData!=='undefined') image=new ImageData(data,w,h);
    else { image=ctx.createImageData(w,h);image.data.set(data); }
    ctx.putImageData(image,0,0);
    receivedFrames++;
    if(receivedFrames===1) api.onPresented?.();
  }
  function fallback() {
    worker?.terminate();worker=null;inFlight=false;
    local=createRasterizer(prepared.model);
    for(const t of sent.values()) if(t)local.setTexture(t);
    const request=pending||lastRequest;
    pending=null;
    if(request) enqueue(request);
  }
  function initialize(scene) {
    prepared=prepareScene(scene,THREE);
    if(typeof Worker!=='undefined') {
      try {
        worker=new Worker(new URL('./software-worker.js',import.meta.url),{type:'module'});
        worker.onerror=()=>fallback();
        worker.onmessage=({data})=>{
          if(data.error) {fallback();return;}
          present(new Uint8ClampedArray(data.pixels),data.width,data.height);
          inFlight=false;
          const request=pending;
          pending=null;
          if(request) enqueue(request);
        };
        worker.postMessage({type:'init',model:prepared.model});
      } catch { worker?.terminate(); worker=null; }
    }
    if(!worker) local=createRasterizer(prepared.model);
    installTextures();
  }
  function enqueue(request) {
    if(inFlight) {pending=request;return;}
    const final=request.final;
    const limit=final?1840:760, budget=final?1450000:245000;
    const scale=Math.min(final ? Math.max(pixelRatio,1.55) : pixelRatio,limit/Math.max(1,width,height),Math.sqrt(budget/Math.max(1,width*height)));
    const w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
    const payload={...request,width:w,height:h};
    if(worker) {
      inFlight=true;
      worker.postMessage({type:'frame',payload});
    } else present(local.frame(payload),w,h);
  }
  const api={
    isSoftwareRenderer:true,
    setPixelRatio(r){pixelRatio=Math.max(.5,Math.min(r||1,2));},
    setSize(w,h,updateStyle=true){
      width=w;height=h;
      if(updateStyle&&canvas.style){canvas.style.width=w+'px';canvas.style.height=h+'px';}
    },
    setClearColor() {},
    render(scene,camera){
      if(!prepared) initialize(scene);
      camera.updateMatrixWorld();
      matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
      const count=prepared.objects.length,active=new Uint8Array(count),opacity=new Float32Array(count);
      for(let i=0;i<count;i++){
        const o=prepared.objects[i];
        active[i]=o.material.visible && o.ancestors.every(p=>p.visible)?1:0;
        opacity[i]=o.material.opacity;
      }
      const now=performance.now(),final=now-lastRender>160;
      lastRender=now;
      lastRequest={matrix:matrix.toArray(),eye:camera.position.toArray(), near:camera.near,active,opacity,final};
      enqueue(lastRequest);
      clearTimeout(refineTimer);
      if(!final)refineTimer=setTimeout(()=>{if(lastRequest)enqueue({...lastRequest,final:true});},160);
    },
    get frameCount(){return receivedFrames;}
  };
  return api;
}
