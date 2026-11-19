// Project compressed rubber onto the same raised-cosine surface used by the
// dynamics. The bead and rim remain rigid. One rounded millimetre smooths the
// edge of the contact patch to avoid a crease as it crosses a triangle.
const shaderFunctions = `
uniform vec4 fleetRoad;
vec2 fleetSurface(vec3 world) {
  float distance = world.z + fleetRoad.x;
  float height = 0.0, slope = 0.0;
  if(distance > 0.0 && distance < fleetRoad.y){
    float phase = 6.28318530718 * distance / fleetRoad.y;
    height = .5 * fleetRoad.z * (1.0-cos(phase));
    slope = 3.14159265359 * fleetRoad.z / fleetRoad.y * sin(phase);
  }
  return vec2(height,slope);
}
float fleetLift(float overlap) {
  float fraction=clamp((overlap+.001)/.002,0.0,1.0);
  return min(fleetRoad.w,max(max(0.0,overlap),.001*fraction*fraction));
}
`;
function attachShader(material, road) {
  material.onBeforeCompile = shader => {
    shader.uniforms.fleetRoad = road;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n'+shaderFunctions)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 fleetNWorld = (modelMatrix*vec4(position,1.0)).xyz;
        vec2 fleetNSurface = fleetSurface(fleetNWorld);
        float fleetOverlap = fleetNSurface.x-fleetNWorld.y;
        vec3 fleetOut = normalize(mat3(modelMatrix)*objectNormal);
        vec3 fleetContact = normalize(vec3(0.0,-1.0,fleetNSurface.y));
        float fleetFacing = smoothstep(.1,.75,dot(fleetOut,fleetContact));
        vec3 fleetLocalContact = vec3(dot(modelMatrix[0].xyz,fleetContact),dot(modelMatrix[1].xyz,fleetContact),dot(modelMatrix[2].xyz,fleetContact));
        objectNormal = normalize(mix(objectNormal,normalize(fleetLocalContact),fleetFacing*clamp((fleetOverlap+.001)/.002,0.0,1.0)));
      `).replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 fleetWorld = (modelMatrix*vec4(transformed,1.0)).xyz;
        float fleetOffset=fleetLift(fleetSurface(fleetWorld).x-fleetWorld.y);
        transformed += fleetOffset*vec3(modelMatrix[0].y,modelMatrix[1].y,modelMatrix[2].y);
      `);
  };
  material.customProgramCacheKey = ()=>'fleet-rolling-tire-v1';
  return material;
}

export function attachFleetTires(T, rig) {
  const road = {value: new T.Vector4(0,1,0,.12)}, shaders=new Map();
  const depth=attachShader(new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking}),road);
  rig.group.traverse(mesh=>{
    if(!mesh.userData.fleetTire)return;
    const original=mesh.material;
    if(!shaders.has(original))shaders.set(original,attachShader(original.clone(),road));
    mesh.material=shaders.get(original);
    mesh.customDepthMaterial=depth;
  });
  return (sample,run)=>road.value.set(sample.x-run.geometry.frontAxleZ,run.settings.bumpWidth,
    run.settings.bumpHeight*.001,Math.max(run.geometry.frontWheelRadius,run.geometry.rearWheelRadius)*.47);
}

export function deformFleetRubber(p,n, road) {
  const {start,width,height,limit} = road;
  const frequency=2*Math.PI/width, maxSlope=Math.PI*height/width;
  for(let i=0;i<p.length;i+=3){
    const y=p[i+1];if(y>height+.001)continue;
    const distance=start+p[i+2], inBump=distance>0&&distance<width;
    const angle=distance*frequency, yz=inBump?.5*height*(1-Math.cos(angle)):0;
    const overlap=yz-y;if(overlap<=-.001)continue;
    const blend=Math.min(1,(overlap+.001)/.002);
    p[i+1]=y+Math.min(limit,Math.max(0,overlap,.001*blend*blend));
    const slope=inBump?maxSlope*Math.sin(angle):0, inv=1/Math.sqrt(1+slope*slope);
    const ny=-inv,nz=slope*inv, dot=n[i+1]*ny+n[i+2]*nz;
    const t=Math.max(0,Math.min(1,(dot-.1)/.65)),f=t*t*(3-2*t)*blend;
    if(!f)continue;
    const ax=n[i]*(1-f),ay=n[i+1]*(1-f)+ny*f,az=n[i+2]*(1-f)+nz*f;
    const unit=1/Math.sqrt(ax*ax+ay*ay+az*az||1);
    n[i]=ax*unit;n[i+1]=ay*unit;n[i+2]=az*unit;
  }
}
