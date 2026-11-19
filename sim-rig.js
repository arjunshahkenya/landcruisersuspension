import { batch } from './layers.js';
import { buildBody } from './model/body.js';
import { buildCabin } from './model/cabin.js';
import { buildEnds } from './model/ends.js';
import { buildAccessories } from './model/accessories.js';
import { buildWheels } from './model/wheels.js';
import { buildSimLinkage } from './sim-linkage.js';

const FRONT_AXLE = 1.42;
const PITCH_HEIGHT = .85;
const TWO_PI = 2 * Math.PI;

// The tire is modelled about local +Z; only its rubber meshes receive this
// displacement. The rim, brake rotor and hub remain rigid concentric parts.
// A moving contact patch avoids a wheel oval that spins with its lettering.
const contactFunctions = `
uniform vec4 simWheel;   // sin roll, cos roll, signed outward axis, hub height
uniform vec4 simTrack;   // axle position on road, bump length, height, free radius
uniform vec2 simCamber;  // cos camber, signed axle contribution to vertical
vec3 simUp() { return vec3(simWheel.xy * simCamber.x,simCamber.y); }
float simRoadAt(float s) {
  if (s <= 0.0 || s >= simTrack.y) return 0.0;
  return 0.5 * simTrack.z * (1.0 - cos(6.28318530718 * s / simTrack.y));
}
vec3 simDeformation(vec3 p) {
  vec2 fore = vec2(-simWheel.y, simWheel.x) * simWheel.z;
  float h = dot(p,simUp());
  float station = simTrack.x + dot(p.xy, fore);
  float floorY = simRoadAt(station) - simWheel.w;
  float compression = max(0.0, simTrack.w + floorY);
  float transition = clamp(compression * 0.30, 0.00001, 0.010);
  float overlap = floorY - h;
  // C1 blend between the circular sidewall and its contact with the surface.
  float t = clamp((overlap + transition) / (2.0 * transition), 0.0, 1.0);
  float lift = max(max(0.0,overlap),transition*t*t);
  float slope = 0.0;
  if (station > 0.0 && station < simTrack.y) {
    slope = 3.14159265359 * simTrack.z / simTrack.y * sin(6.28318530718 * station / simTrack.y);
  }
  return vec3(lift,t,slope);
}
`;

function tireProgram(material, uniforms) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + contactFunctions)
      .replace('void main() {','void main() {\nvec3 contactP = simDeformation(position);')
      .replace('#include <beginnormal_vertex>', `
        #include <beginnormal_vertex>
        vec2 along = vec2(-simWheel.y, simWheel.x) * simWheel.z;
        vec3 roadN = normalize(-simUp() + vec3(along * contactP.z,0.0));
        float bottomFacing = smoothstep(0.12, 0.78, dot(objectNormal, roadN));
        objectNormal = normalize(mix(objectNormal, roadN, contactP.y * bottomFacing));
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec3 verticalAxis = simUp();
        transformed += verticalAxis * contactP.x;
        // Loaded sidewalls spread outwards over the footprint, parallel to
        // the ground even when the upper and lower wishbones introduce camber.
        float bulge = position.z * min(0.065,contactP.x*1.7) * smoothstep(0.038,0.134,abs(position.z));
        transformed += bulge * (vec3(0.0,0.0,1.0) - verticalAxis * verticalAxis.z);
      `);
  };
  material.customProgramCacheKey = () => 'lc-rolling-footprint-v1';
  return material;
}

function mountWheels(T, rigGroup) {
  const original = buildWheels(T, {simulation:true});
  const wheels = [];
  for (const item of [...original.children]) {
    const side = Math.sign(item.position.x);
    const front = item.position.z > 0;
    // The original wheel texture has a distinct photographed rear clocking.
    const baseRoll = 2 * Math.atan2(item.quaternion.z,item.quaternion.w);
    const suspension = new T.Group();
    suspension.name = item.name + ' carrier';
    suspension.position.copy(item.position);
    suspension.rotation.set(0,side*Math.PI/2,0,'ZYX');
    rigGroup.add(suspension);
    const spin = new T.Group();
    spin.name = item.name + ' rotating parts';
    spin.rotation.z = baseRoll;
    suspension.add(spin);
    const uniforms = {
      simWheel:{value:new T.Vector4(Math.sin(baseRoll),Math.cos(baseRoll),side,item.position.y)},
      simTrack:{value:new T.Vector4(-2,1,0,item.position.y)},
      simCamber:{value:new T.Vector2(1,0)}
    };
    const wheel = {front,side,baseRoll,spin,suspension,cutawayParts:[],uniforms,
      mountX:item.position.x,mountZ:item.position.z};
    const mats = new Map();
    const shadowDepth = tireProgram(
      new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking}),uniforms
    );
    for (const part of [...item.children]) {
      if (part.userData.simBrakeFixed) suspension.add(part);
      else spin.add(part);
      if (side<0 && !part.userData.simBrakeFixed && !part.userData.simBrakeDisc) {
        wheel.cutawayParts.push(part);
      }
      if (!part.userData.simTire) continue;
      if (!mats.has(part.material)) {
        mats.set(part.material,tireProgram(part.material.clone(),uniforms));
      }
      part.material = mats.get(part.material);
      part.customDepthMaterial = shadowDepth;
    }
    wheels.push(wheel);
  }
  return wheels;
}

export function buildSimRig(THREE) {
  const group = new THREE.Group();
  group.name = 'Land Cruiser suspension simulation';
  const body = new THREE.Group();
  body.name = 'Sprung vehicle body';
  body.matrixAutoUpdate = false;
  body.add(batch(buildBody(THREE)),batch(buildCabin(THREE)),
    batch(buildEnds(THREE)),batch(buildAccessories(THREE)));
  const linkage = buildSimLinkage(THREE);
  group.add(body,linkage.group);
  const wheels = mountWheels(THREE,group);
  const negativePivot = new THREE.Matrix4();
  const rotation = new THREE.Matrix4();
  const linkPose = {bodyMatrix:body.matrix,frontY:0,rearY:0};

  function update(sample, run) {
    const {frontArm,rearArm,wheelRadius,wheelbase} = run.geometry;
    const cgZ = FRONT_AXLE-frontArm;
    const frontSag = run.static.nominalFrontTireDeflection;
    const rearSag = run.static.nominalRearTireDeflection;
    // The existing body was measured at a .405 m hub datum. Anchor its
    // nominal stance to the axle-weighted, loaded hub heights. The solver
    // supplies all additional static and dynamic heave and pitch.
    const referenceSag = (rearArm*frontSag+frontArm*rearSag)/wheelbase;
    negativePivot.makeTranslation(0,-PITCH_HEIGHT,-cgZ);
    rotation.makeRotationX(-sample.pitch);
    body.matrix.makeTranslation(0,PITCH_HEIGHT-referenceSag+sample.body,cgZ)
      .multiply(rotation).multiply(negativePivot);
    body.matrixWorldNeedsUpdate = true;
    linkPose.frontY = sample.frontWheel-frontSag;
    linkPose.rearY = sample.rearWheel-rearSag;
    const articulation = linkage.update(linkPose);

    const travel = (sample.x-run.startX)/wheelRadius;
    for (const wheel of wheels) {
      const y = wheelRadius + (wheel.front ? linkPose.frontY : linkPose.rearY);
      const roll = wheel.baseRoll + wheel.side*(travel % TWO_PI);
      const foreShift = wheel.front ? 0 : articulation.rearZ;
      const camber = wheel.front ? wheel.side*articulation.frontCamber : 0;
      const trackChange = wheel.front ? wheel.side*articulation.frontOut : 0;
      wheel.suspension.position.set(wheel.mountX+trackChange,y,wheel.mountZ+foreShift);
      wheel.suspension.rotation.z = camber;
      wheel.spin.rotation.z = roll;
      wheel.uniforms.simCamber.value.set(Math.cos(camber),wheel.side*Math.sin(camber));
      wheel.uniforms.simWheel.value.set(Math.sin(roll),Math.cos(roll),wheel.side,y);
      wheel.uniforms.simTrack.value.set(sample.x-(wheel.front?0:wheelbase)+foreShift,run.settings.bumpWidth,
        run.settings.bumpHeight*.001,wheelRadius);
    }
  }

  function setCutaway(enabled) {
    body.visible = !enabled;
    linkage.setCutaway(enabled);
    // Leave the far-side wheels intact. On the exposed side the spinning
    // rotors and fixed calipers mark the hub centres without hiding the links.
    for (const wheel of wheels) {
      for (const part of wheel.cutawayParts) part.visible = !enabled;
    }
  }

  return {group,update,setCutaway};
}
