// Dimensions in metres. The stiffness control is the average effective spring
// rate at one wheel, preserving each setup's front/rear rate split.
const sharedRoad = {
  bumpHeight: {min:0,max:1000,step:1},
  bumpWidth: {min:.4,max:20,step:.1},
};
// Per-axle unsprung masses are in kg, per-wheel spring/tire rates in kN/m,
// axle damping coefficients in N·s/m, and bump/droop/sidewall travel in m.
function vehicle(spec){
  const {geometry:g,front:f,rear:r}=spec;
  g.rearAxleZ=g.frontAxleZ-g.wheelbase;
  g.frontArm=g.wheelbase*(1-spec.sprungFrontFraction);
  g.rearArm=g.wheelbase*spec.sprungFrontFraction;
  g.wheelRadius=g.frontWheelRadius;
  spec.defaults={vehicle:spec.id,speed:25,bumpHeight:85,bumpWidth:1.8,
    stiffness:(f.wheelRate+r.wheelRate)/2,weight:spec.referenceMass};
  spec.limits={...sharedRoad,...spec.limits};
  return spec;
}
export const VEHICLES = {
  landcruiser:vehicle({
    id:'landcruiser',name:'Toyota Land Cruiser 100',shortName:'Land Cruiser 100',
    suspension:'Front double wishbones with torsion bars and a coil-sprung live rear axle.',
    referenceMass:2370,massBasis:'Toyota lists 2,370 kg curb mass for the representative Japanese VX Limited V8. Accessories and payload on the pictured vehicle are unweighed.',
    sourceNote:'The 2.85 m wheelbase and reference mass follow Toyota’s 100 Series archive. Tire dimensions and the suspension tune approximate the photographed vehicle.',
    sources:[{label:'Toyota 100 Series archive',url:'https://www.toyota-global.com/company/history_of_toyota/75years/vehicle_lineage/car/id60012613/index.html'}],
    geometry:{wheelbase:2.85,frontAxleZ:1.42,frontTrack:1.62,rearTrack:1.615,length:4.89,width:1.94,height:1.86,cgHeight:.85,frontWheelRadius:.405,rearWheelRadius:.405,frontTireWidth:.285,rearTireWidth:.285},
    // [distance forward from front axle, underside height at nominal ride height]
    // in metres; a simplified clearance envelope for solid obstacle strikes.
    underside:[[.98,.48],[.30,.35],[-.32,.32],[-2.62,.32],[-3.65,.45]],
    frontSidewall:.202,rearSidewall:.202,
    sprungFrontFraction:.53,pitchGyration:1.30,stopScale:1,bufferCrush:.027,
    front:{unsprungMass:120,wheelRate:42,tireRate:248,tireDamping:520,
      compressionDamping:4550,reboundDamping:6500,bump:.095,droop:.106,jounce:.135,tireCrush:.080},
    rear:{unsprungMass:160,wheelRate:42,tireRate:248,tireDamping:520,
      compressionDamping:4550,reboundDamping:6500,bump:.115,droop:.130,jounce:.156,tireCrush:.080},
    limits:{speed:{min:0,max:180,step:1},weight:{min:1800,max:3500,step:10},stiffness:{min:20,max:85,step:1}}
  }),
  porsche:vehicle({
    id:'porsche',name:'Porsche 911 Carrera',shortName:'911 Carrera',
    suspension:'Rear-engine, rear-wheel drive. Front MacPherson struts and a multi-link rear axle, approximated with a passive damper setting.',
    referenceMass:1520,massBasis:'Porsche’s DIN unladen mass for the 992.2 Carrera Coupé is 1,520 kg. Its permissible gross mass is 1,860 kg.',
    sourceNote:'The 992.2 Carrera dimensions, staggered tires and reference mass follow Porsche’s May 2024 EU specifications. The rear-biased spring and mass distributions are estimates.',
    sources:[{label:'Porsche 992.2 Carrera technical data',url:'https://newsroom.porsche.com/dam/jcr%3A7f3751ae-477c-48a5-b087-31f4fde1c124/pag-911-carrera-en.pdf'}],
    geometry:{wheelbase:2.45,frontAxleZ:1.225,frontTrack:1.597,rearTrack:1.551,length:4.542,width:1.852,height:1.302,cgHeight:.49,frontWheelRadius:.3353,rearWheelRadius:.35725,frontTireWidth:.235,rearTireWidth:.295},
    underside:[[.99,.145],[.40,.135],[-.22,.124],[-2.52,.132],[-3.40,.225]],
    frontSidewall:.094,rearSidewall:.10325,
    sprungFrontFraction:.388,pitchGyration:1.03,stopScale:.84,bufferCrush:.015,
    front:{unsprungMass:82,wheelRate:31,tireRate:225,tireDamping:360,
      compressionDamping:2850,reboundDamping:4300,bump:.050,droop:.065,jounce:.072,tireCrush:.055},
    rear:{unsprungMass:102,wheelRate:53,tireRate:286,tireDamping:430,
      compressionDamping:4200,reboundDamping:6200,bump:.055,droop:.068,jounce:.079,tireCrush:.060},
    limits:{speed:{min:0,max:294,step:1},weight:{min:1450,max:1860,step:5},stiffness:{min:24,max:110,step:1}}
  }),
  rally:vehicle({
    id:'rally',name:'Toyota GR Yaris Rally1',shortName:'GR Yaris Rally1',
    suspension:'Four-wheel drive with MacPherson struts at both ends. Gravel wheel rates and damping are estimated.',
    referenceMass:1350,massBasis:'The 1,350 kg starting setup uses the FIA minimum for car and crew with one spare wheel. The car-only minimum is 1,180 kg.',
    sourceNote:'Toyota gives a 2.63 m wheelbase and 270 mm damper stroke. Wheel travel, axle loads, and gravel setup are modeled separately. The gravel tire diameter follows the 2025 Rally Chile regulations.',
    sources:[{label:'Toyota 2025 Rally1 specifications',url:'https://toyotagazooracing.com/wrc/cars/2025/'},{label:'FIA Rally1 mass rules',url:'https://www.fia.com/sites/default/files/262_2025_final.pdf'},{label:'Rally Chile 2025 tire specifications',url:'https://rallychilebiobio.com/wp-content/uploads/2025/06/Supplementary-Regulations-Rally-Chile-2025-final.pdf'}],
    geometry:{wheelbase:2.63,frontAxleZ:1.315,frontTrack:1.645,rearTrack:1.645,length:4.225,width:1.875,height:1.55,cgHeight:.58,frontWheelRadius:.325,rearWheelRadius:.325,frontTireWidth:.205,rearTireWidth:.205},
    underside:[[.80,.31],[.32,.260],[-.12,.245],[-2.65,.25],[-3.34,.36]],
    frontSidewall:.1345,rearSidewall:.1345,
    sprungFrontFraction:.54,pitchGyration:1.08,stopScale:.90,bufferCrush:.021,
    front:{unsprungMass:84,wheelRate:38,tireRate:170,tireDamping:400,
      compressionDamping:3850,reboundDamping:5450,bump:.094,droop:.102,jounce:.152,tireCrush:.078},
    rear:{unsprungMass:80,wheelRate:34,tireRate:158,tireDamping:380,
      compressionDamping:3400,reboundDamping:4850,bump:.102,droop:.108,jounce:.151,tireCrush:.078},
    limits:{speed:{min:0,max:201,step:1},weight:{min:1180,max:1550,step:5},stiffness:{min:18,max:76,step:1}}
  }),
  dakar:vehicle({
    id:'dakar',name:'IVECO Powerstar 4×4',shortName:'IVECO Powerstar',
    suspension:'Live axles with front three-leaf and rear two-leaf springs. Four coil-assisted dampers per axle are represented by an effective axle damper.',
    referenceMass:9400,massBasis:'IVECO lists 9,400 kg ready to start and 8,600 kg empty for Gerard de Rooy’s 2013 Powerstar, with equal static weight on the two axles.',
    sourceNote:'The 2013 Team De Rooy #500 chassis dimensions, axle layout, race mass and weight split follow IVECO’s Dakar press kit. Damping, effective spring rates, and available travel are estimates.',
    sources:[{label:'IVECO Dakar 2013 technical information',url:'https://www.iveco.com/global/-/media/Iveco---Press-Import/Pdfs/Dakar2013_ENG_complete.pdf?rev=62f278dde81c41199f741630605db32c'}],
    geometry:{wheelbase:4.4,frontAxleZ:2.2,frontTrack:2.15,rearTrack:2.15,length:6.8,width:2.55,height:3.0,cgHeight:1.42,frontWheelRadius:.629,rearWheelRadius:.629,frontTireWidth:.384,rearTireWidth:.384},
    underside:[[1.25,.73],[.38,.57],[-.4,.54],[-4.4,.55],[-5.45,.70]],
    frontSidewall:.375,rearSidewall:.375,
    sprungFrontFraction:.5,pitchGyration:1.91,stopScale:3.25,bufferCrush:.026,
    front:{unsprungMass:740,wheelRate:174,tireRate:690,tireDamping:1600,
      compressionDamping:19600,reboundDamping:30500,bump:.155,droop:.145,jounce:.221,tireCrush:.131},
    rear:{unsprungMass:740,wheelRate:150,tireRate:660,tireDamping:1500,
      compressionDamping:17400,reboundDamping:26000,bump:.165,droop:.155,jounce:.236,tireCrush:.131},
    limits:{speed:{min:0,max:140,step:1},weight:{min:8600,max:11000,step:25},stiffness:{min:90,max:280,step:1}}
  })
};
export function getVehicle(id='landcruiser') {
  return Object.hasOwn(VEHICLES,id) ? VEHICLES[id] : VEHICLES.landcruiser;
}
