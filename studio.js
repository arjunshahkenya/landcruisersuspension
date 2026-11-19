import * as THREE from './vendor/three.module.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

export function lightStudio(scene, renderer) {
  if (renderer) {
    const generator = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment(renderer);
    const environment = generator.fromScene(room, .035);
    scene.environment = environment.texture;
    room.dispose();
    generator.dispose();
  }

  scene.add(new THREE.HemisphereLight(0xf6fcff, 0xb8afa1, .92));
  function softbox(color, intensity, x, y, z) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(x, y, z);
    scene.add(light);
    return light;
  }
  softbox(0xfff4e4, 2.35, -3, 6, 4);
  softbox(0xe6f4ff, .92, 4, 3, -3);
  const lift = softbox(0xf0f5ff, 0, -.9, -4, .8);

  // A feathered contact shadow anchors the car without a ground surface
  // that could obscure the suspension as the camera passes below the tires.
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 640;
  const ctx = canvas.getContext('2d');
  function shadow(x, y, sx, sy, strength) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(sx, sy);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, 'rgba(35,40,35,' + strength + ')');
    gradient.addColorStop(.44, 'rgba(35,40,35,' + strength * .78 + ')');
    gradient.addColorStop(1, 'rgba(35,40,35,0)');
    ctx.fillStyle = gradient; ctx.fillRect(-1,-1,2,2);
    ctx.restore();
  }
  shadow(158,317,150,310,.30);
  for (const y of [186,312,458]) shadow(161,y,109,149,.22);
  for (const x of [96,224]) for (const y of [186,452]) shadow(x,y,23,43,.54);
  const material = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite:false, toneMapped:false
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4, 6.9), material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.014;
  scene.add(ground);
  return function updateStudio(camera, target, chassisOnly) {
    const elevation = camera.position.clone().sub(target).normalize().y;
    ground.visible = elevation > -.025 && camera.position.y > .04 && !chassisOnly;
    material.opacity = THREE.MathUtils.smoothstep(elevation, -.025, .15);
    lift.intensity = .18 + 2.0 * (1 - THREE.MathUtils.smoothstep(elevation, -.8, .03));
  };
}
