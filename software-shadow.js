// Shadow from the large front-left key. In this viewer both the running gear
// and outer body are rigid, so each of the two visibility configurations can
// reuse a single orthographic depth pass while the camera moves.
export function makeKeyShadow(meshes, materials, active) {
  const size=448, scale=size/6.25;
  const depth=new Float32Array(size*size).fill(-100);
  const u=(x,z)=>(.728*x+.685*z+3.125)*scale;
  const v=(x,y,z)=>(.480*x+.715*y-.510*z+2.46)*scale;
  const d=(x,y,z)=>-.49*x+.70*y+.52*z;
  for(let m=0;m<meshes.length;m++){
    const mesh=meshes[m],mat=materials[mesh.material];
    if(!active[m] || mesh.ground || mat.transparent || mat.alphaTest>.01)continue;
    const pos=mesh.positions,coords=new Float32Array(pos.length);
    for(let k=0;k<pos.length;k+=3){
      const x=pos[k],y=pos[k+1],z=pos[k+2];
      coords[k]=u(x,z);coords[k+1]=v(x,y,z);coords[k+2]=d(x,y,z);
    }
    const index=mesh.indices;
    for(let t=mesh.start,end=t+mesh.count;t<end;t+=3){
      const a=(index?index[t]:t)*3,b=(index?index[t+1]:t+1)*3,c=(index?index[t+2]:t+2)*3;
      const x0=coords[a],y0=coords[a+1],z0=coords[a+2],x1=coords[b],y1=coords[b+1],z1=coords[b+2],x2=coords[c],y2=coords[c+1],z2=coords[c+2];
      const dx1=x1-x0,dy1=y1-y0,dx2=x2-x0,dy2=y2-y0, det=dx1*dy2-dx2*dy1;
      if(Math.abs(det)<.028)continue;
      const left=Math.max(0,Math.ceil(Math.min(x0,x1,x2)-.5)),right=Math.min(size-1,Math.floor(Math.max(x0,x1,x2)-.5));
      const low=Math.max(0,Math.ceil(Math.min(y0,y1,y2)-.5)),high=Math.min(size-1,Math.floor(Math.max(y0,y1,y2)-.5));
      if(right<left||high<low)continue;
      const ax=dy2/det,ay=-dx2/det,bx=-dy1/det,by=dx1/det,depth1=z1-z0,depth2=z2-z0;
      for(let y=low;y<=high;y++){
        const qx=left+.5-x0,qy=y+.5-y0;
        let r=qx*ax+qy*ay,s=qx*bx+qy*by;
        for(let x=left,p=y*size+x;x<=right;x++,p++,r+=ax,s+=bx){
          if(r<0||s<0||r+s>1)continue;
          const closest=z0+r*depth1+s*depth2;
          if(closest>depth[p])depth[p]=closest;
        }
      }
    }
  }
  function visible(x,y,z,nx,ny,nz){
    const ix=Math.round(u(x,z)-.5),iy=Math.round(v(x,y,z)-.5);
    if(ix<3||iy<3||ix>=size-3||iy>=size-3)return 1;
    const tilt=Math.abs(d(nx,ny,nz)),bias=.010+.022*(1-tilt),ref=d(x,y,z)+bias,p=ix+iy*size;
    let t=0;
    for(const gap of [depth[p]-ref,depth[p-2]-ref,depth[p+2]-ref,depth[p-size*2]-ref,depth[p+size*2]-ref]){
      t+=gap<=0?1:Math.max(0,1-gap/.027);
    }
    return t*.2;
  }
  return {visible,cache:new WeakMap()};
}
