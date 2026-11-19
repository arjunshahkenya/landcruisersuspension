import { buildPorsche } from './model/porsche.js';
import { buildRally } from './model/rally.js';
import { buildDakar } from './model/dakar.js';
import { buildFleetRig } from './model/fleet-running-gear.js';
import { getVehicle } from './vehicle-specs.js';

const bodies = {porsche: buildPorsche, rally: buildRally, dakar: buildDakar};

// The viewer, the WebGL driving scene, and the software driving scene all use
// the very same articulated assembly. The model axes and suspension anchors
// come from the selected vehicle's specification.
export function buildFleetVehicle(THREE, id) {
  if (!Object.hasOwn(bodies, id)) throw Error('Unknown fleet vehicle: '+id);
  const spec = getVehicle(id);
  const rig = buildFleetRig(THREE, spec);
  const exterior = bodies[id](THREE);
  rig.setExterior(exterior);
  rig.group.name = spec.name;
  rig.group.updateMatrixWorld(true);
  const coils=[];
  rig.group.traverse(mesh=>{
    if(mesh.isMesh && mesh.name.endsWith(' live coil')){
      const box=new THREE.Box3().setFromObject(mesh);
      if(box.getCenter(new THREE.Vector3()).x<0)coils.push(box);
    }
  });
  const targets={};
  const rotors=[];
  for(const wheel of rig.wheels){
    if(wheel.side>=0)continue;
    const view=wheel.front?'frontAxle':'rearAxle', bounds=new THREE.Box3();
    for(const coil of coils){
      if(Math.abs(coil.getCenter(new THREE.Vector3()).z-wheel.z)<spec.geometry.wheelbase*.27)bounds.union(coil);
    }
    targets[view]=bounds.isEmpty()?new THREE.Vector3(wheel.X*.85,wheel.R*1.4,wheel.z):bounds.getCenter(new THREE.Vector3());
    // The road wheel is already removed by the ordinary cutaway. The rotor
    // and hub are separate children of the rotating carrier, so a close-up
    // can reveal the lower damper eye while retaining the rest of the axle.
    for(const part of wheel.spin.children){
      if(part!==wheel.roadWheel)rotors.push({part,view});
    }
  }
  let inspection='', cutaway=false;
  function showBrakes(){
    for(const {part,view} of rotors)part.visible=!(cutaway&&view===inspection);
  }
  return {...rig, exterior, spec, targets,
    get inspection(){return inspection;},
    setInspection(view){inspection=view;showBrakes();},
    setCutaway(value){cutaway=value;rig.setCutaway(value);showBrakes();}
  };
}
