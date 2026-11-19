import * as THREE from './vendor/three.module.js';
import { skyRadiance } from './software-shading.js';

export function reflectionEnvironment(renderer) {
  const width=512, height=256, pixels=new Float32Array(width*height*4), radiance=[0,0,0];
  for(let row=0;row<height;row++) {
    const elevation=((row+.5)/height-.5)*Math.PI;
    const y=Math.sin(elevation), radius=Math.cos(elevation);
    for(let col=0;col<width;col++) {
      const angle=((col+.5)/width-.5)*Math.PI*2;
      skyRadiance(radius*Math.cos(angle), y, radius*Math.sin(angle), radiance);
      const i=(row*width+col)*4;
      pixels[i]=radiance[0];pixels[i+1]=radiance[1];pixels[i+2]=radiance[2];pixels[i+3]=1;
    }
  }
  const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat,THREE.FloatType);
  texture.mapping=THREE.EquirectangularReflectionMapping;
  texture.needsUpdate=true;
  const prefilter=new THREE.PMREMGenerator(renderer);
  const environment=prefilter.fromEquirectangular(texture);
  texture.dispose();prefilter.dispose();
  return environment.texture;
}

export function lightStudio(scene, renderer, dimensions=null) {
  if(renderer) {
    scene.environment=reflectionEnvironment(renderer);
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  }
  scene.add(new THREE.HemisphereLight(0xe0ecff,0x897b68,.43));
  function softbox(color,intensity,x,y,z) {
    const light=new THREE.DirectionalLight(color,intensity);
    light.position.set(x,y,z); scene.add(light);return light;
  }
  const key=softbox(0xfff2dd,2.05,-3.9,5.6,4.15);
  if(renderer){
    key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);
    const c=key.shadow.camera;
    const size=Math.max(1,(dimensions?.length || 4.89)/4.89);
    c.left=-3.6*size;c.right=3.6*size;c.bottom=-2.9*size;c.top=3.1*size;c.near=.4;c.far=14*size;c.updateProjectionMatrix();
    key.shadow.bias=-.00016;key.shadow.normalBias=.012;
  }
  softbox(0xd2e5ff,.78,4.2,2.1,-3.6);
  const lift=softbox(0xf2eddd,0,-1.2,-4,1.4);

  const canvas=document.createElement('canvas');
  canvas.width=400;canvas.height=640;
  const ctx=canvas.getContext('2d');
  function shadow(x,y,sx,sy,strength){
    ctx.save();ctx.translate(x,y);ctx.scale(sx,sy);
    const g=ctx.createRadialGradient(0,0,0,0,0,1);
    g.addColorStop(0,'rgba(34,39,33,'+strength+')');
    g.addColorStop(.38,'rgba(34,39,33,'+strength*.83+')');
    g.addColorStop(.72,'rgba(34,39,33,'+strength*.26+')');
    g.addColorStop(1,'rgba(34,39,33,0)');
    ctx.fillStyle=g;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  // Coordinates follow the four actual ground contact patches. The long penumbra
  // belongs to the raised body, while the tight dark marks belong to the tires.
  shadow(208,317,153,285,.36);
  shadow(192,318,113,228,.23);
  const floorWidth=dimensions ? dimensions.width*2.08 : 4;
  const floorLength=dimensions ? dimensions.length*1.41 : 6.9;
  const footprints=dimensions
    ? [[dimensions.frontTrack,dimensions.frontAxleZ],[dimensions.rearTrack,dimensions.rearAxleZ]]
    : [[1.60,1.43],[1.60,-1.43]];
  for(const [track,axle] of footprints)for(const side of [-1,1]){
    const x=(.5+side*track/(2*floorWidth))*canvas.width;
    const y=(.5+axle/floorLength)*canvas.height;
    shadow(x,y,32,42,.35); shadow(x,y,15,17,.71);
  }
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(floorWidth,floorLength),material);
  ground.name='Feathered contact shadows';
  ground.rotation.x=-Math.PI/2;ground.position.y=-.008;scene.add(ground);
  let configured=false, isolated=null;
  return function updateStudio(camera,target,chassisOnly) {
    const elevation=camera.position.clone().sub(target).normalize().y;
    ground.visible=elevation>-.025 && camera.position.y>.04 && !chassisOnly;
    material.opacity=THREE.MathUtils.smoothstep(elevation,-.025,.15);
    lift.intensity=.15+2.15*(1-THREE.MathUtils.smoothstep(elevation,-.8,.04));
    if(renderer && (!configured || chassisOnly!==isolated)) {
      if(!configured) {
        scene.traverse(mesh=>{
          if(!mesh.isMesh || mesh===ground)return;
          const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
          mesh.castShadow=mats.every(m=>!m.transparent || m.opacity>.94);
          mesh.receiveShadow=true;
        });
        renderer.shadowMap.autoUpdate=false;
        configured=true;
      }
      renderer.shadowMap.needsUpdate=true;
      isolated=chassisOnly;
    }
  };
}
