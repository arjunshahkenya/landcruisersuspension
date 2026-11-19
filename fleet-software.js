// Adapt the actual articulated THREE.Mesh tree to the driving rasterizer.
// Each batch keeps its geometry and material when its linkage moves. This is
// especially important for the two halves of a damper and the Dakar leaf packs.
import { deformFleetRubber } from './fleet-tires.js';
import { makeShade } from './software-shading.js';

export function prepareFleetSoftware(T, rig, materialTable) {
  const materialIds = new Map();
  const normalMatrix = new T.Matrix3();
  const drawables = [];
  function finish(material) {
    if (materialIds.has(material)) return materialIds.get(material);
    const color = material.color.clone();
    if (material.emissive && material.emissiveIntensity) {
      color.add(material.emissive.clone().multiplyScalar(material.emissiveIntensity));
    }
    const shade=makeShade({color,metalness:material.metalness,roughness:material.roughness,
      clearcoat:material.clearcoat,clearcoatRoughness:material.clearcoatRoughness,
      envMapIntensity:material.envMapIntensity,transparent:material.transparent});
    const rgb = color.clone().convertLinearToSRGB().toArray().map(channel=>Math.round(255*Math.min(1,channel)));
    const id = materialTable.length;
    materialTable.push([rgb, material.metalness ?? 0, material.roughness ?? .65, '',
      material.opacity ?? 1, material.transparent === true,shade]);
    materialIds.set(material,id);
    return id;
  }
  rig.group.traverse(object=>{
    const g=object.geometry;
    if(!object.isMesh || !g?.attributes.position)return;
    if(!g.attributes.normal)g.computeVertexNormals();
    const pos=g.attributes.position, norm=g.attributes.normal;
    const count=pos.count, srcP=new Float32Array(count*3), srcN=new Float32Array(count*3);
    for(let i=0,k=0;i<count;i++,k+=3){
      srcP[k]=pos.getX(i);srcP[k+1]=pos.getY(i);srcP[k+2]=pos.getZ(i);
      srcN[k]=norm.getX(i);srcN[k+1]=norm.getY(i);srcN[k+2]=norm.getZ(i);
    }
    const positions=new Float32Array(srcP.length),normals=new Float32Array(srcN.length);
    const allIndices=g.index?.array || Uint32Array.from({length:count},(_,i)=>i);
    const range=g.drawRange, first=range?.start||0, last=Math.min(allIndices.length,first+(range?.count??Infinity));
    const groups=Array.isArray(object.material)? g.groups : [{start:first,count:last-first,materialIndex:0}];
    const ancestors=[];
    for(let node=object;node;node=node.parent)ancestors.push(node);
    const batches=groups.flatMap(group=>{
      const material=Array.isArray(object.material)?object.material[group.materialIndex]:object.material;
      const start=Math.max(first,group.start),end=Math.min(last,group.start+group.count);
      if(!material||end<=start)return [];
      return [{rig:'fleet',object,side:material.side,material:finish(material),positions,normals,uv:null,
        indices:allIndices.subarray(start,end),start:0,count:end-start,offset:material.polygonOffset ? -material.polygonOffsetUnits*1e-7 : 0}];
    });
    drawables.push({object,ancestors,srcP,srcN,positions,normals,batches,matrix:null});
  });
  let lastRun, lastTime, lastCutaway, lastInspection, visible=[];
  function sync(sample,run,cutaway){
    const samePose=lastRun===run && lastTime===sample.t;
    if(samePose && lastCutaway===cutaway && lastInspection===rig.inspection)return visible;
    if(lastCutaway!==cutaway)rig.setCutaway(cutaway);
    if(!samePose){
      rig.update(sample,run);
      rig.group.updateMatrixWorld(true);
    }
    lastRun=run;lastTime=sample.t;lastCutaway=cutaway;lastInspection=rig.inspection;
    visible=[];
    const road={start:sample.x-run.geometry.frontAxleZ,width:run.settings.bumpWidth,height:run.settings.bumpHeight*.001,
      limit:Math.max(run.geometry.frontWheelRadius,run.geometry.rearWheelRadius)*.47};
    for(const part of drawables){
      if(!part.ancestors.every(node=>node.visible))continue;
      const {matrixWorld:matrix}=part.object;
      const rubber=part.object.userData.fleetTire;
      if(!part.matrix || !part.matrix.equals(matrix) || (rubber && !samePose)){
        const m=matrix.elements,nm=normalMatrix.getNormalMatrix(matrix).elements;
        const {srcP,srcN,positions:p,normals:n}=part;
        for(let k=0;k<srcP.length;k+=3){
          const x=srcP[k],y=srcP[k+1],z=srcP[k+2],nx=srcN[k],ny=srcN[k+1],nz=srcN[k+2];
          p[k]=m[0]*x+m[4]*y+m[8]*z+m[12];
          p[k+1]=m[1]*x+m[5]*y+m[9]*z+m[13];
          p[k+2]=m[2]*x+m[6]*y+m[10]*z+m[14];
          const a=nm[0]*nx+nm[3]*ny+nm[6]*nz,b=nm[1]*nx+nm[4]*ny+nm[7]*nz,c=nm[2]*nx+nm[5]*ny+nm[8]*nz;
          const inv=1/Math.sqrt(a*a+b*b+c*c||1);
          n[k]=a*inv;n[k+1]=b*inv;n[k+2]=c*inv;
        }
        if(rubber)deformFleetRubber(p,n,road);
        if(!part.matrix)part.matrix=new T.Matrix4();
        part.matrix.copy(matrix);
      }
      visible.push(...part.batches);
    }
    return visible;
  }
  return {sync};
}
