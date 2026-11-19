import { buildChassis } from './model/chassis.js';

// Bind the photographed vehicle's existing running gear to the half-car model.
// All inputs use metres and the rest-model coordinate frame, with +Z forward.
// Frame, floor, engine, gearbox and front differential are sprung. The rear
// differential moves with the axle. The half-car prescribes symmetric hub travel.
export function buildSimLinkage(THREE) {
  const group = buildChassis(THREE, {articulate:true});
  const node = Object.fromEntries(group.children.map(item => [item.name, item]));
  group.name = 'Articulated Land Cruiser suspension';
  for (const part of group.children) part.matrixAutoUpdate = false;

  const V = p => new THREE.Vector3(...p);
  const I = () => new THREE.Matrix4();
  const frontHub = I(), inverseBody = I();
  const rear = () => node['rear-axle'].matrix;
  const body = () => node.sprung.matrix;
  const bodyRotation = new THREE.Quaternion();
  const rebinding = [], hinges = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3();
  const changed = new THREE.Vector3(), reference = new THREE.Vector3();
  const alignment = new THREE.Quaternion(), composed = new THREE.Quaternion();
  const rotation = I(), stretch = I(), translation = I();

  function put(target, matrix) {
    target.matrix.copy(matrix);
    target.matrixWorldNeedsUpdate = true;
  }

  // Pivot a rigid wishbone about the line connecting its two frame bushes.
  // In the symmetric model this is a longitudinal axis. Its outboard ball
  // joint follows a circular arc rather than stretching the cast arm.
  function wishbone(name, inner, outer, sign) {
    const member=node[name], pivot=V(inner), ball=V(outer);
    const dx=ball.x-pivot.x, dy=ball.y-pivot.y;
    const move=I().makeTranslation(...inner), unmove=I().makeTranslation(-inner[0],-inner[1],-inner[2]);
    hinges.push(() => {
      // Solve the ball height in world vertical coordinates, even when the
      // frame pitches. Transforming a world target with a fixed longitudinal
      // position would inadvertently prescribe a second degree of freedom.
      const e=body().elements, height=ball.y+frontHub.elements[13];
      const pivotHeight=e[1]*pivot.x+e[5]*pivot.y+e[9]*ball.z+e[13];
      const cosine=sign*(e[1]*dx+e[5]*dy), sine=sign*(e[5]*dx-e[1]*dy);
      const normalized=sign*(height-pivotHeight)/Math.max(1e-8,Math.hypot(cosine,sine));
      const angle=Math.asin(THREE.MathUtils.clamp(normalized,-.997,.997))-Math.atan2(cosine,sine);
      member.matrix.copy(body()).multiply(move).multiply(rotation.makeRotationZ(angle)).multiply(unmove);
      member.matrixWorldNeedsUpdate=true;
    });
    return () => member.matrix;
  }

  // Rotate a shaft between independently moving endpoints. A shock casing is
  // rigid and stays on its upper mount. The chrome piston enters that casing.
  // A spring changes only its length along the coil axis, preserving diameter.
  function span(name, from, to, driverA, driverB, rigidUpper=false) {
    const member=node[name], restA=V(from),restB=V(to);
    const unit=restB.clone().sub(restA), length=unit.length();
    unit.multiplyScalar(1/length);
    const origin=rigidUpper ? restB : restA;
    const unmove=I().makeTranslation(-origin.x,-origin.y,-origin.z);
    rebinding.push(() => {
      a.copy(restA).applyMatrix4(driverA());
      b.copy(restB).applyMatrix4(driverB());
      direction.subVectors(b,a);
      const distance=Math.max(1e-6,direction.length());
      direction.multiplyScalar(1/distance);
      changed.copy(unit).applyQuaternion(bodyRotation);
      alignment.setFromUnitVectors(changed,direction);
      composed.copy(alignment).multiply(bodyRotation);
      rotation.makeRotationFromQuaternion(composed);
      if(!rigidUpper) {
        const k=distance/length-1, x=unit.x,y=unit.y,z=unit.z;
        stretch.set(1+k*x*x,k*x*y,k*x*z,0, k*y*x,1+k*y*y,k*y*z,0, k*z*x,k*z*y,1+k*z*z,0, 0,0,0,1);
        rotation.multiply(stretch);
      }
      const anchor=rigidUpper ? b : a;
      member.matrix.copy(translation.makeTranslation(anchor.x,anchor.y,anchor.z)).multiply(rotation).multiply(unmove);
      member.matrixWorldNeedsUpdate=true;
    });
  }

  function strut(prefix, lower, upper, lowerDriver) {
    span(prefix+'-case',lower,upper,lowerDriver,body,true);
    span(prefix+'-rod',lower,upper,lowerDriver,body);
  }

  // The rear axle can move a little fore/aft and rotate about its own lateral
  // axis as its two pairs of fixed-length trailing links swing. Solve their
  // two sagittal length constraints at the hub height supplied by the model.
  const axleRest=V([0,.405,-1.43]);
  const upperA=V([.431,.524,-1.007]), lowerA=V([.560,.415,-.747]);
  const upperB=V([.382,.482,-1.426]), lowerB=V([.588,.343,-1.433]);
  const links=[{a:lowerA,b:lowerB},{a:upperA,b:upperB}].map(({a,b})=>({
    a,b,anchor:new THREE.Vector3(),lengthSq:a.distanceToSquared(b),
    offY:b.y-axleRest.y,offZ:b.z-axleRest.z
  }));
  const axleOrigin=I().makeTranslation(-axleRest.x,-axleRest.y,-axleRest.z);
  const articulation={rearZ:0,frontZ:0,frontOut:0,frontCamber:0};
  function rearAxlePose(offset,pose) {
    for(const link of links)link.anchor.copy(link.a).applyMatrix4(pose);
    let theta=0,shift=0;
    for(let iteration=0;iteration<8;iteration++){
      const sin=Math.sin(theta),cos=Math.cos(theta);
      for(const l of links){
        const y=cos*l.offY-sin*l.offZ,z=sin*l.offY+cos*l.offZ;
        const dx=l.b.x-l.anchor.x,dy=axleRest.y+offset+y-l.anchor.y,dz=axleRest.z+shift+z-l.anchor.z;
        l.error=dx*dx+dy*dy+dz*dz-l.lengthSq;
        l.shiftDerivative=2*dz;
        l.pitchDerivative=2*(-dy*z+dz*y);
      }
      const [f,r]=links;
      if(Math.abs(f.error)+Math.abs(r.error)<1e-11)break;
      const det=f.shiftDerivative*r.pitchDerivative-f.pitchDerivative*r.shiftDerivative;
      if(Math.abs(det)<1e-8)break;
      shift+=THREE.MathUtils.clamp((-f.error*r.pitchDerivative+f.pitchDerivative*r.error)/det,-.08,.08);
      theta+=THREE.MathUtils.clamp((-f.shiftDerivative*r.error+f.error*r.shiftDerivative)/det,-.19,.19);
    }
    articulation.rearZ=shift;
    const axle=node['rear-axle'];
    axle.matrix.makeTranslation(0,axleRest.y+offset,axleRest.z+shift)
      .multiply(rotation.makeRotationX(theta)).multiply(axleOrigin);
    axle.matrixWorldNeedsUpdate=true;
  }

  let lowerLeft;
  for(const s of [-1,1]) {
    const lower=wishbone('wishbone'+s+'-0',[s*.354,.347,1.42],[s*.705,.328,1.42],s);
    const upper=wishbone('wishbone'+s+'-1',[s*.476,.582,1.42],[s*.713,.554,1.42],s);
    if(s===-1)lowerLeft=lower;
    const upright='upright'+s;
    span(upright,[s*.704,.332,1.42],[s*.719,.556,1.410],lower,upper);
    const knuckle=()=>node[upright].matrix;
    span('cv'+s,[s*.342,.423,1.420],[s*.729,.405,1.420],body,knuckle);
    span('tie'+s,[s*.349,.474,1.241],[s*.698,.418,1.317],body,knuckle);
    strut('front-damper'+s,[s*.601,.345,1.474],[s*.470,.755,1.505],lower);
    strut('rear-damper'+s,[s*.585,.359,-1.377],[s*.590,.640,-1.659],rear);
    span('rear-coil'+s,[s*.480,.455,-1.445],[s*.480,.783,-1.445],rear,body);
    span('lower-link'+s,[s*.560,.415,-.747],[s*.588,.343,-1.433],body,rear);
    span('upper-link'+s,[s*.431,.524,-1.007],[s*.382,.482,-1.426],body,rear);
  }
  span('panhard',[-.533,.536,-1.560],[.557,.390,-1.532],body,rear);
  span('rear-prop',[.038,.528,-.196],[.045,.400,-1.191],body,rear);

  // Both front wheels rise together in a pitch-plane model, so the stabilizer
  // rotates in its chassis bushes without a left-right torsional difference.
  const stabPivot=V([0,.414,1.720]), stabTip=V([-.636,.341,1.527]);
  const z=stabTip.z-stabPivot.z, y=stabTip.y-stabPivot.y;
  const radius=Math.hypot(z,y), start=Math.atan2(y,-z);
  const pivotForward=I().makeTranslation(stabPivot.x,stabPivot.y,stabPivot.z);
  const pivotBack=I().makeTranslation(-stabPivot.x,-stabPivot.y,-stabPivot.z);

  const inspectionColors = [
    [/^rear-coil/, 0x40837b], [/-damper.*-case$/, 0xc28a46],
    [/^(wishbone|lower-link|upper-link|panhard)/,0x68859a]
  ];
  const highlighted=[];
  for(const item of group.children) {
    const finish=inspectionColors.find(([key])=>key.test(item.name));
    if(!finish) continue;
    const alternatives=new Map();
    for(const mesh of item.children){
      const original=mesh.material;
      if(['Bushings and boots','Zinc-plated fasteners','Brushed stainless'].includes(original.name))continue;
      if(!alternatives.has(original)){
        const brighter=original.clone();
        brighter.color.setHex(finish[1]);brighter.roughness=.48;brighter.metalness=.38;
        alternatives.set(original,brighter);
      }
      highlighted.push([mesh,original,alternatives.get(original)]);
    }
  }

  let cutaway;
  function setCutaway(enabled) {
    if(cutaway===!!enabled)return;
    cutaway=!!enabled;
    node.floor.visible=!cutaway;
    for(const [mesh,original,inspected] of highlighted)mesh.material=cutaway?inspected:original;
  }
  setCutaway(false);

  function update({bodyMatrix,frontY,rearY}) {
    put(node.sprung,bodyMatrix);
    put(node.floor,bodyMatrix);
    rearAxlePose(rearY,bodyMatrix);
    frontHub.makeTranslation(0,frontY,0);
    inverseBody.copy(bodyMatrix).invert();
    bodyRotation.setFromRotationMatrix(bodyMatrix);
    for(const bind of hinges)bind();
    for(const bind of rebinding)bind();
    const upright=node.upright1.matrix;
    reference.set(.714,.405,1.42).applyMatrix4(upright);
    articulation.frontOut=reference.x-.714;
    articulation.frontZ=reference.z-1.42;
    a.set(.704,.332,1.42).applyMatrix4(upright);
    b.set(.719,.556,1.41).applyMatrix4(upright).sub(a);
    articulation.frontCamber=Math.atan2(-b.x,b.y)-Math.atan2(-.015,.224);
    reference.copy(stabTip).applyMatrix4(lowerLeft()).applyMatrix4(inverseBody);
    const end=Math.asin(THREE.MathUtils.clamp((reference.y-stabPivot.y)/radius,-.98,.98));
    node.stabilizer.matrix.copy(bodyMatrix).multiply(pivotForward)
      .multiply(rotation.makeRotationX(end-start)).multiply(pivotBack);
    node.stabilizer.matrixWorldNeedsUpdate=true;
    return articulation;
  }
  update({bodyMatrix:I(),frontY:0,rearY:0});
  return { group, update, setCutaway };
}
