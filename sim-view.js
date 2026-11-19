import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { getVehicle } from './vehicle-specs.js';

async function createHardware(canvas, context, fleetRig, spec) {
  const [{buildTestRoad}, {reflectionEnvironment}] = await Promise.all([
    import('./sim-road.js'), import('./studio.js')
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
  // Open-sky fill leaves enough difference between vertical doors and their
  // upward-facing shoulders for the paint reflection to trace the stamping.
  scene.add(new THREE.HemisphereLight(0xe1edfa,0x978d7b,.74));
  const sun = new THREE.DirectionalLight(0xfff0d1,2.3);
  sun.position.set(-5,8,4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  const shadowSpan=Math.max(5.5,spec.geometry.length*.86);
  Object.assign(sun.shadow.camera,{left:-shadowSpan,right:shadowSpan,top:shadowSpan,bottom:-shadowSpan,near:.1,far:27});
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .016;
  sun.shadow.bias = -.00012;
  scene.add(sun);
  const edge = new THREE.DirectionalLight(0xd3e5fa,.80);
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
  const rig = fleetRig ?? (await import('./sim-rig.js')).buildSimRig(THREE);
  const updateTires=fleetRig ? (await import('./fleet-tires.js')).attachFleetTires(THREE,rig) : null;
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
      updateTires?.(sample,run);
      road.update(sample,run,camera.position.y>.055);
      underLight.intensity=camera.position.y<.15 ? 2.1 : cutaway ? 1.15 : .32;
      renderer.render(scene,camera);
    }
  };
}

// Camera and controls are shared by the WebGL and software 3D renderers.
export async function createSimView(originalCanvas, {onDirty, onFreeOrbit, vehicleId}) {
  const spec=getVehicle(vehicleId), geo=spec.geometry;
  const fleetRig=spec.id==='landcruiser' ? null : (await import('./fleet-rig.js')).buildFleetVehicle(THREE,spec.id);
  let canvas=originalCanvas, surface;
  async function software(){
    const {createSimSoftware}=await import('./sim-software.js');
    surface=await createSimSoftware(canvas,THREE,fleetRig);
  }
  const options={alpha:true,antialias:true,powerPreference:'high-performance'};
  let context;
  try { context=canvas.getContext('webgl2',options) || canvas.getContext('webgl',options); }
  catch { context=null; }
  if(context){
    try { surface=await createHardware(canvas,context,fleetRig,spec); }
    catch(error) {
      console.warn('Using software 3D',error);
      const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;
      await software();
    }
  } else await software();
  const camera=new THREE.PerspectiveCamera(34,1,.045,160);
  const controls=new OrbitControls(camera,canvas);
  controls.enablePan=false;controls.minDistance=fleetRig ? .8 : 2.2;controls.maxDistance=Math.max(20,geo.length*4);
  controls.minPolarAngle=.012;controls.maxPolarAngle=Math.PI-.012;
  controls.rotateSpeed=.73;controls.zoomSpeed=.88;
  let preset='orbit',w=1,h=1,targetCutaway=false,followHeight=0;
  const directions={orbit:[-1,.31,.57],side:[-1,.11,.003],front:[-.012,.31,1],under:[-.38,-1,.22],frontAxle:[-1,.12,.52],rearAxle:[-1,.17,-.48]};
  function place(mode){
    const axle=mode==='frontAxle'||mode==='rearAxle';
    const corner=axle&&fleetRig;
    fleetRig?.setInspection(axle ? mode : '');
    const direction=corner?[-1,.49,mode==='frontAxle'?.76:-.76]:directions[mode];
    const dir=new THREE.Vector3(...direction).normalize();
    const scale=geo.length/4.89, tall=geo.height/1.86, wide=geo.width/1.94;
    const front=mode==='frontAxle', radius=front?geo.frontWheelRadius:geo.rearWheelRadius;
    const axScale=.55*radius/.405+.45*wide;
    const distanceByHeight=corner?(spec.id==='dakar'?2.56:1.52):axle?2.8*axScale:mode==='under'?5.9*scale:mode==='front'?5.5*Math.max(wide,tall):6.6*Math.max(scale,tall);
    const span=corner?(spec.id==='dakar'?2.56:1.55):axle?2.95*axScale:mode==='front'?4.25*wide:mode==='under'?6.05*scale:mode==='orbit'?8.55*scale:7.4*scale;
    const distance=Math.max(distanceByHeight,span/(2*Math.tan(THREE.MathUtils.degToRad(17))*camera.aspect));
    if(corner)controls.target.copy(fleetRig.targets[mode]);
    else if(axle) controls.target.set(-.22*wide,1.16*radius,(front?geo.frontAxleZ:geo.rearAxleZ)+(front?-.12:.04)*scale);
    else controls.target.set(0,(mode==='under'?.5:.81)*tall,(mode==='orbit'?.87:mode==='side'?.52:0)*scale);
    controls.target.y+=followHeight;
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
  function free(){preset='';fleetRig?.setInspection('');onFreeOrbit();}
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
    draw(sample,run){
      // Normal wheel travel stays visible against a stationary track. During
      // unusually large bump events, keep the selected axle or body in frame.
      const tracked=preset==='frontAxle'?sample.frontWheel:preset==='rearAxle'?sample.rearWheel:sample.body*.72;
      const close=fleetRig&&(preset==='frontAxle'||preset==='rearAxle');
      const axleBody=preset==='frontAxle'?run.geometry.frontArm:-run.geometry.rearArm;
      const strutMotion=.52*tracked+.48*(sample.body+Math.sin(sample.pitch)*axleBody);
      const rise=close?strutMotion:Math.max(0,tracked-.12*geo.height);
      const offset=rise-followHeight;
      if(offset){camera.position.y+=offset;controls.target.y+=offset;followHeight=rise;}
      camera.updateMatrixWorld(true);surface.draw(camera,sample,run,targetCutaway);
    },
    setCutaway(value){targetCutaway=value;onDirty();},
    setCamera(mode){if(Object.hasOwn(directions,mode)){preset=mode;place(mode);}}
  };
}
