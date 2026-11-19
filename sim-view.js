import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

async function createHardware(canvas, context) {
  const [{buildSimRig}, {buildTestRoad}, {reflectionEnvironment}] = await Promise.all([
    import('./sim-rig.js'), import('./sim-road.js'), import('./studio.js')
  ]);
  const renderer = new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'high-performance'});
  renderer.setClearColor(0x182e28,0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.55));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x233931,.043);
  scene.environment = reflectionEnvironment(renderer);
  scene.add(new THREE.HemisphereLight(0xe1f4ff,0x84907b,1.0));
  const sun = new THREE.DirectionalLight(0xfff0d1,2.3);
  sun.position.set(-5,8,4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-5.5,right:5.5,top:5,bottom:-5,near:.1,far:23});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .016;
  sun.shadow.bias = -.00012;
  scene.add(sun);
  const edge = new THREE.DirectionalLight(0xc4e2ff,1.05);
  edge.position.set(3.7,4,-3.1);
  scene.add(edge);
  const underLight = new THREE.DirectionalLight(0xe5eee0,.28);
  underLight.position.set(-1.8,-4,.6);
  scene.add(underLight);
  const manager=THREE.DefaultLoadingManager;
  let waiting=false, done;
  const loaded=new Promise(resolve=>{done=resolve;});
  manager.onStart=()=>{waiting=true;};
  manager.onLoad=done;
  const rig = buildSimRig(THREE);
  scene.add(rig.group);
  rig.group.traverse(p=>{
    if (!p.isMesh) return;
    p.receiveShadow = true;
    const list = Array.isArray(p.material) ? p.material : [p.material];
    p.castShadow = list.every(m=>!m.transparent || m.opacity>.94);
  });
  const road = buildTestRoad(THREE,scene);
  if(waiting) await loaded;
  manager.onStart=undefined;manager.onLoad=undefined;
  let lastCutaway;
  return {
    resize(w,h){renderer.setSize(w,h,false);},
    draw(camera,sample,run,cutaway){
      if(lastCutaway!==cutaway){rig.setCutaway(cutaway);lastCutaway=cutaway;}
      rig.update(sample,run);
      road.update(sample,run,camera.position.y>.055);
      underLight.intensity=camera.position.y<.15 ? 2.1 : cutaway ? 1.15 : .32;
      renderer.render(scene,camera);
    }
  };
}

// Camera and controls are shared by the WebGL and software 3D renderers.
export async function createSimView(originalCanvas, {onDirty, onFreeOrbit}) {
  let canvas=originalCanvas, surface;
  async function software(){
    const {createSimSoftware}=await import('./sim-software.js');
    surface=await createSimSoftware(canvas,THREE);
  }
  const options={alpha:true,antialias:true,powerPreference:'high-performance'};
  let context;
  try { context=canvas.getContext('webgl2',options) || canvas.getContext('webgl',options); }
  catch { context=null; }
  if(context){
    try { surface=await createHardware(canvas,context); }
    catch(error) {
      console.warn('Using software 3D',error);
      const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;
      await software();
    }
  } else await software();
  const camera=new THREE.PerspectiveCamera(34,1,.045,160);
  const controls=new OrbitControls(camera,canvas);
  controls.enablePan=false;controls.minDistance=2.2;controls.maxDistance=20;
  controls.minPolarAngle=.012;controls.maxPolarAngle=Math.PI-.012;
  controls.rotateSpeed=.73;controls.zoomSpeed=.88;
  let preset='orbit',w=1,h=1,targetCutaway=false;
  const directions={orbit:[-1,.31,.57],side:[-1,.11,.003],front:[-.012,.31,1],under:[-.38,-1,.22],frontAxle:[-1,.12,.52],rearAxle:[-1,.17,-.48]};
  function place(mode){
    const dir=new THREE.Vector3(...directions[mode]).normalize();
    const axle=mode==='frontAxle'||mode==='rearAxle';
    const distanceByHeight=axle?2.8:mode==='under'?5.9:mode==='front'?5.5:6.6;
    const span=axle?2.95:mode==='front'?4.25:mode==='under'?6.05:mode==='orbit'?8.55:7.4;
    const distance=Math.max(distanceByHeight,span/(2*Math.tan(THREE.MathUtils.degToRad(17))*camera.aspect));
    if(axle) controls.target.set(-.22,.47,mode==='frontAxle'?1.30:-1.39);
    else controls.target.set(0,mode==='under'?.5:.81,mode==='orbit'?.87:mode==='side'?.52:0);
    camera.position.copy(controls.target).addScaledVector(dir,distance);
    controls.update();
    camera.updateMatrixWorld(true);
    onDirty();
  }
  let dirtyResize=true;
  function resize(){
    const box=canvas.getBoundingClientRect();
    const width=Math.max(1,Math.round(box.width)),height=Math.max(1,Math.round(box.height));
    if(!dirtyResize&&width===w&&height===h)return;
    dirtyResize=false;w=width;h=height;
    camera.aspect=w/h;
    camera.setViewOffset(w,h,0,-Math.round(h*.018),w,h);
    camera.updateProjectionMatrix();
    surface.resize?.(w,h);
    if(preset)place(preset);else onDirty();
  }
  const observer=new ResizeObserver(resize);
  observer.observe(canvas);
  controls.addEventListener('change',onDirty);
  function free(){preset='';onFreeOrbit();}
  controls.addEventListener('start',free);
  canvas.addEventListener('keydown',event=>{
    const offset=camera.position.clone().sub(controls.target);
    const angles=new THREE.Spherical().setFromVector3(offset);
    const n=.13;
    switch(event.key){
      case 'ArrowLeft':angles.theta-=n;break;
      case 'ArrowRight':angles.theta+=n;break;
      case 'ArrowUp':angles.phi-=n;break;
      case 'ArrowDown':angles.phi+=n;break;
      case '+':case '=':angles.radius/=1.15;break;
      case '-':angles.radius*=1.15;break;
      default:return;
    }
    event.preventDefault();free();
    angles.radius=THREE.MathUtils.clamp(angles.radius,controls.minDistance,controls.maxDistance);
    angles.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(angles));
    controls.update();
  });
  resize();
  return {
    draw(sample,run){camera.updateMatrixWorld(true);surface.draw(camera,sample,run,targetCutaway);},
    setCutaway(value){targetCutaway=value;onDirty();},
    setCamera(mode){if(Object.hasOwn(directions,mode)){preset=mode;place(mode);}}
  };
}
