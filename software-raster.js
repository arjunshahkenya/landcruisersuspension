import { makeShade } from './software-shading.js';
import { makeKeyShadow } from './software-shadow.js';

// The vehicle is rigid. Keep world geometry and its projection work buffers
// between frames, and do all rasterization off the UI thread where possible.
export function createRasterizer(source) {
  const materials = source.materials.map(m => ({ ...m, shade: makeShade(m) }));
  const textures = new Map(), shadowViews=new Map();
  function workingMesh(mesh) {
    const count = mesh.positions.length / 3;
    return {...mesh,
      sx: new Float32Array(count), sy: new Float32Array(count), iz: new Float32Array(count),
      shade: new Float32Array(count * (mesh.uv ? 4 : 3)), stamp: new Uint32Array(count)
    };
  }
  const meshes = source.meshes.map(workingMesh);
  // Cluster nearby vertices during continuous motion, pooling their UVs and tint. Every
  // stationary frame and every close inspection still uses the full mesh.
  function motionVersion(mesh) {
    if (mesh.count < 450 || materials[mesh.material].transparent || materials[mesh.material].alphaTest) return mesh;
    const p=mesh.positions, n=mesh.normals, grid=new Map(), ids=new Uint32Array(p.length/3);
    const accum=[],norm=[],weights=[],ix=[],uv=mesh.uv?[]:null,rgb=mesh.colors?[]:null;
    const inv=1/Math.min(.030,Math.max(.008,mesh.radius*.125));
    for(let i=0,k=0; k<p.length; i++,k+=3) {
      const x=Math.floor(p[k]*inv), y=Math.floor(p[k+1]*inv), z=Math.floor(p[k+2]*inv);
      const key=(x+1024)*4194304+(y+1024)*2048+z+1024;
      let id=grid.get(key);
      if(id===undefined) {
        id=weights.length;grid.set(key,id);weights.push(0);accum.push(0,0,0);norm.push(0,0,0);
        if(uv)uv.push(0,0);if(rgb)rgb.push(0,0,0);
      }
      const a=id*3; ids[i]=id; weights[id]++;
      if(uv){uv[id*2]+=mesh.uv[i*2]; uv[id*2+1]+=mesh.uv[i*2+1];}
      if(rgb){rgb[a]+=mesh.colors[k];rgb[a+1]+=mesh.colors[k+1];rgb[a+2]+=mesh.colors[k+2];}
      accum[a]+=p[k];accum[a+1]+=p[k+1];accum[a+2]+=p[k+2];
      norm[a]+=n[k];norm[a+1]+=n[k+1];norm[a+2]+=n[k+2];
    }
    if(weights.length>p.length*.28) return mesh;
    for(let j=mesh.start, end=j+mesh.count;j<end;j+=3) {
      const a=ids[mesh.indices?mesh.indices[j]:j],b=ids[mesh.indices?mesh.indices[j+1]:j+1],c=ids[mesh.indices?mesh.indices[j+2]:j+2];
      if(a!==b&&b!==c&&a!==c) ix.push(a,b,c);
    }
    if(ix.length<24 || ix.length>mesh.count*.85) return mesh;
    for(let j=0,k=0;j<weights.length;j++,k+=3) {
      const w=1/weights[j], s=1/(Math.hypot(norm[k],norm[k+1],norm[k+2])||1);
      accum[k]*=w;accum[k+1]*=w;accum[k+2]*=w;
      norm[k]*=s;norm[k+1]*=s;norm[k+2]*=s;
      if(uv){uv[j*2]*=w;uv[j*2+1]*=w;}
      if(rgb){rgb[k]*=w;rgb[k+1]*=w;rgb[k+2]*=w;}
    }
    return workingMesh({...mesh,positions:new Float32Array(accum), normals:new Float32Array(norm),
      uv:uv?new Float32Array(uv):null,colors:rgb?new Float32Array(rgb):null,
      indices:new (weights.length>65535?Uint32Array:Uint16Array)(ix),start:0,count:ix.length});
  }
  let sequence = 0, zBuffer = new Float32Array(), pixels, rgba;
  function setTexture(texture) { textures.set(texture.key, texture); }

  // Horizon occlusion on the settled depth buffer. Extrapolating the local
  // reciprocal-depth plane avoids darkening a uniformly sloping body panel.
  // Both radii are measured in vehicle metres so recesses keep their scale
  // when zooming from the whole truck to an individual suspension assembly.
  function ambientOcclusion(width,height,focal) {
    const steps=[[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]];
    for(let y=1,p=width+1; y<height-1; y++,p+=2) {
      for(let x=1; x<width-1; x++,p++) {
        const q=zBuffer[p];if(q<=0)continue;
        const l=zBuffer[p-1],r=zBuffer[p+1],u=zBuffer[p-width],d=zBuffer[p+width];
        const a=l?q-l:Infinity,b=r?r-q:Infinity,c=u?q-u:Infinity,e=d?d-q:Infinity;
        let sx=Math.abs(a)<Math.abs(b)?a:b,sy=Math.abs(c)<Math.abs(e)?c:e;
        // At silhouettes a large projected gradient can belong to the far wall.
        const maxSlope=2.5*q/focal;
        sx=Number.isFinite(sx)?Math.max(-maxSlope,Math.min(sx,maxSlope)):0;
        sy=Number.isFinite(sy)?Math.max(-maxSlope,Math.min(sy,maxSlope)):0;
        const distancePerQ=1/(q*q),scale=focal*q;
        let sum=0;
        for(let j=0;j<16;j++) {
          const nearRing=j<8, radius=nearRing?.065:.185, step=steps[j&7];
          const dx=Math.round(step[0]*radius*scale),dy=Math.round(step[1]*radius*scale);
          const tx=x+dx,ty=y+dy;
          if(tx<0||tx>=width||ty<0||ty>=height)continue;
          const sample=zBuffer[p+dx+dy*width];
          if(!sample)continue;
          const advance=(sample-q-sx*dx-sy*dy)*distancePerQ;
          if(advance<=.004)continue;
          const delta=Math.abs((sample-q)*distancePerQ);
          if(delta>radius*2.7)continue;
          const horizon=Math.min(1,(advance-.004)/(radius*.8));
          sum+=horizon*(1-delta/(radius*2.7))*(nearRing?1.25:.75);
        }
        if(sum>.01){
          const amount=1-Math.min(.48,sum*.075);
          const k=p*4;pixels[k]*=amount;pixels[k+1]*=amount;pixels[k+2]*=amount;
        }
      }
    }
  }

  function frame({width, height, matrix, eye, active, opacity, near, final}) {
    sequence++;
    if (zBuffer.length !== width * height) zBuffer = new Float32Array(width * height);
    else zBuffer.fill(0);
    pixels = new Uint8ClampedArray(width * height * 4);
    rgba = new Uint32Array(pixels.buffer);
    let configuration=0;
    for(let k=0;k<meshes.length;k++)if(active[k]&&!meshes[k].ground)configuration++;
    let shadow=shadowViews.get(configuration);
    if(!shadow) {
      shadow=makeKeyShadow(meshes,materials,active);
      shadowViews.set(configuration,shadow);
    }
    const sceneDepth = mesh => matrix[3]*mesh.center[0] + matrix[7]*mesh.center[1] + matrix[11]*mesh.center[2] + matrix[15];
    const opaque = [], blended = [], ground = [];
    for (let j=0; j<meshes.length; j++) {
      const mesh = meshes[j];
      if (!active[j] || opacity[j] <= .001) continue;
      mesh.depth = sceneDepth(mesh);
      if (mesh.depth + mesh.radius < near) continue;
      const cx=mesh.center[0], cy=mesh.center[1], cz=mesh.center[2];
      const clipX=matrix[0]*cx+matrix[4]*cy+matrix[8]*cz+matrix[12];
      const clipY=matrix[1]*cx+matrix[5]*cy+matrix[9]*cz+matrix[13];
      const expand=mesh.radius;
      if (Math.abs(clipX)>mesh.depth+expand*(1+Math.hypot(matrix[0],matrix[4],matrix[8])) ||
          Math.abs(clipY)>mesh.depth+expand*(1+Math.hypot(matrix[1],matrix[5],matrix[9]))) continue;
      const mat=materials[mesh.material];
      (mesh.ground ? ground : mat.transparent ? blended : opaque).push(j);
    }
    // An early depth test makes small hidden mechanical details inexpensive.
    opaque.sort((a,b)=>(meshes[a].depth-meshes[a].radius*.6)-(meshes[b].depth-meshes[b].radius*.6));
    blended.sort((a,b)=>meshes[b].depth-meshes[a].depth || meshes[a].order-meshes[b].order);
    for (const j of [...ground, ...opaque, -1, ...blended]) {
      if(j===-1){
        if(final)ambientOcclusion(width,height,height*.5*Math.hypot(matrix[1],matrix[5],matrix[9]));
        continue;
      }
      const full=meshes[j];
      if (!final && full.depth>2.2 && !full.motion) full.motion=motionVersion(full);
      const mesh=(!final && full.depth>2.2 && full.motion)||full;
      const mat=materials[mesh.material], tex=textures.get(mat.map);
      if (mat.map && !tex && (mat.alphaTest || mesh.ground)) continue;
      const world=mesh.positions, normal=mesh.normals, colors=mesh.colors, uv=mesh.uv;
      const {sx,sy,iz,shade,stamp,indices}=mesh;
      const hW=width/2, hH=height/2, n=world.length/3;
      for (let i=0,k=0; i<n; i++,k+=3) {
        const x=world[k],y=world[k+1],z=world[k+2];
        let w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
        if (Math.abs(w)<1e-9) w=1e-9;
        const q=1/w;
        iz[i]=q;
        sx[i]=hW*(1+(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])*q);
        sy[i]=hH*(1-(matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])*q);
      }
      let visibility=shadow.cache.get(mesh);
      if(!visibility && !mat.basic) {
        visibility=new Uint8Array(n);shadow.cache.set(mesh,visibility);
      }
      const roughMap=textures.get(mat.roughMap),metalMap=textures.get(mat.metalMap);
      function finishChannel(map,t,channel) {
        const x=Math.max(0,Math.min(map.width-1,Math.round(uv[t]*(map.width-1))));
        const v=map.flipY?1-uv[t+1]:uv[t+1];
        const y=Math.max(0,Math.min(map.height-1,Math.round(v*(map.height-1))));
        return map.pixels[(y*map.width+x)*4+channel];
      }
      function shadeVertex(i) {
        if (stamp[i]===sequence) return;
        stamp[i]=sequence;
        const k=i*3;
        let vx=eye[0]-world[k], vy=eye[1]-world[k+1], vz=eye[2]-world[k+2];
        const s=1/Math.sqrt(vx*vx+vy*vy+vz*vz+.000000001);
        vx*=s; vy*=s; vz*=s;
        let nx=normal[k], ny=normal[k+1], nz=normal[k+2];
        if (mat.side===2 && nx*vx+ny*vy+nz*vz<0) { nx=-nx; ny=-ny; nz=-nz; }
        if (mat.basic) {
          shade[k]=mat.display[0]; shade[k+1]=mat.display[1]; shade[k+2]=mat.display[2];
        } else {
          if(!visibility[i]) visibility[i]=1+Math.round(254*shadow.visible(world[k],world[k+1],world[k+2],nx,ny,nz));
          mat.shade(nx,ny,nz,vx,vy,vz,shade,k,(visibility[i]-1)/254,
            roughMap&&uv?finishChannel(roughMap,i*2,1):255,metalMap&&uv?finishChannel(metalMap,i*2,2):255);
        }
        if (colors) { shade[k]*=colors[k]; shade[k+1]*=colors[k+1]; shade[k+2]*=colors[k+2]; }
      }
      const tWidth=tex?.width||0,tHeight=tex?.height||0, bitmap=tex?.pixels;
      const alpha=opacity[j], hasTexture=!!(tex&&uv), blendedMat=mat.transparent||alpha<.999;
      const bias=(mat.offset || 0) + mesh.order*1e-8;
      function drawTriangle(x0,y0,q0,r0,g0,b0,u0,v0,s0, x1,y1,q1,r1,g1,b1,u1,v1,s1, x2,y2,q2,r2,g2,b2,u2,v2,s2) {
        const d1=x1-x0,d2=x2-x0,h1=y1-y0,h2=y2-y0, det=d1*h2-d2*h1;
        if (Math.abs(det)<.023 || (mat.side!==2 && (mat.side===1 ? det*mesh.frontSign<0 : det*mesh.frontSign>0))) return;
        const low=Math.max(0,Math.ceil(Math.min(y0,y1,y2)-.5)), high=Math.min(height-1,Math.floor(Math.max(y0,y1,y2)-.5));
        if (high<low || (x0<0 && x1<0 && x2<0) || (x0>=width && x1>=width && x2>=width)) return;
        const inv=1/det;
        const ax=h2*inv, ay=-d2*inv, bx=-h1*inv,by=d1*inv;
        const vq1=q1-q0,vq2=q2-q0;
        const qr=vq1*ax+vq2*bx, qd=vq1*ay+vq2*by;
        const vr1=r1-r0,vr2=r2-r0, vg1=g1-g0,vg2=g2-g0, vb1=b1-b0,vb2=b2-b0;
        const rr=vr1*ax+vr2*bx,rd=vr1*ay+vr2*by, gr=vg1*ax+vg2*bx,gd=vg1*ay+vg2*by, br=vb1*ax+vb2*bx,bd=vb1*ay+vb2*by;
        let ur=0,ud=0,vr=0,vd=0,sr=0,sd=0;
        if (hasTexture) {
          sr=(s1-s0)*ax+(s2-s0)*bx;sd=(s1-s0)*ay+(s2-s0)*by;
          u0*=q0;u1*=q1;u2*=q2;v0*=q0;v1*=q1;v2*=q2;
          ur=(u1-u0)*ax+(u2-u0)*bx;ud=(u1-u0)*ay+(u2-u0)*by;
          vr=(v1-v0)*ax+(v2-v0)*bx;vd=(v1-v0)*ay+(v2-v0)*by;
        }
        // Scan-convert only the covered span on each row, including narrow trim.
        let xa=x0,ya=y0,xb=x1,yb=y1,xc=x2,yc=y2;
        if(ya>yb) {let t=ya;ya=yb;yb=t;t=xa;xa=xb;xb=t;}
        if(yb>yc) {let t=yb;yb=yc;yc=t;t=xb;xb=xc;xc=t;}
        if(ya>yb) {let t=ya;ya=yb;yb=t;t=xa;xa=xb;xb=t;}
        const ac=(xc-xa)/(yc-ya||1), ab=(xb-xa)/(yb-ya||1), bc=(xc-xb)/(yc-yb||1);
        for(let y=low; y<=high; y++) {
          const yy=y+.5, one=xa+(yy-ya)*ac, two=yy<yb ? xa+(yy-ya)*ab : xb+(yy-yb)*bc;
          const xFirst=Math.max(0,Math.ceil(Math.min(one,two)-.5)), xLast=Math.min(width-1,Math.ceil(Math.max(one,two)-.5)-1);
          if(xFirst>xLast) continue;
          const dx=xFirst+.5-x0,dy=yy-y0;
          let q=q0+dx*qr+dy*qd, r=r0+dx*rr+dy*rd, g=g0+dx*gr+dy*gd, b=b0+dx*br+dy*bd;
          let u=u0+dx*ur+dy*ud,v=v0+dx*vr+dy*vd,sp=s0+dx*sr+dy*sd,p=y*width+xFirst;
          for(let x=xFirst; x<=xLast; x++,p++,q+=qr,r+=rr,g+=gr,b+=br,u+=ur,v+=vr,sp+=sr) {
            if(q+bias < zBuffer[p]-.00000006) continue;
            let R=r,G=g,B=b,A=alpha;
            if(hasTexture) {
              let U=u/q,V=v/q;
              if(tex.wrapS===1000) U-=Math.floor(U);
              else if(tex.wrapS===1002) U=1-Math.abs(1-((U%2)+2)%2);
              if(tex.wrapT===1000) V-=Math.floor(V);
              else if(tex.wrapT===1002) V=1-Math.abs(1-((V%2)+2)%2);
              U=Math.min(1,Math.max(0,U)); V=Math.min(1,Math.max(0,tex.flipY ? 1-V : V));
              const px=U*(tWidth-1),py=V*(tHeight-1),ix=px|0,iy=py|0, k=(iy*tWidth+ix)*4;
              let tr=bitmap[k],tg=bitmap[k+1],tb=bitmap[k+2],ta=bitmap[k+3];
              if(final && ix<tWidth-1 && iy<tHeight-1) {
                const fx=px-ix,fy=py-iy, right=k+4,lower=k+tWidth*4;
                const wA=(1-fx)*(1-fy),wB=fx*(1-fy),wC=(1-fx)*fy,wD=fx*fy;
                tr=tr*wA+bitmap[right]*wB+bitmap[lower]*wC+bitmap[lower+4]*wD;
                tg=tg*wA+bitmap[right+1]*wB+bitmap[lower+1]*wC+bitmap[lower+5]*wD;
                tb=tb*wA+bitmap[right+2]*wB+bitmap[lower+2]*wC+bitmap[lower+6]*wD;
                ta=ta*wA+bitmap[right+3]*wB+bitmap[lower+3]*wC+bitmap[lower+7]*wD;
              }
              A*=ta/255;
              if(A<Math.max(.003,mat.alphaTest)) continue;
              R*=tr/255;G*=tg/255;B*=tb/255;
              if(sp>.2) { const ss=sp*sp;R=Math.min(255,Math.sqrt(R*R+ss));G=Math.min(255,Math.sqrt(G*G+ss));B=Math.min(255,Math.sqrt(B*B+ss)); }
            }
            if(hasTexture){R=Math.min(255,R);G=Math.min(255,G);B=Math.min(255,B);}
            if(mat.depthWrite) zBuffer[p]=q+bias;
            if(!blendedMat || A>.996) {
              rgba[p]=(255<<24)|((B+.5)<<16)|((G+.5)<<8)|(R+.5);
            } else {
              const k=p*4, da=pixels[k+3]/255, a=A+(1-A)*da;
              const factor=(1-A)*da;
              pixels[k]=(R*A+pixels[k]*factor)/a;
              pixels[k+1]=(G*A+pixels[k+1]*factor)/a;
              pixels[k+2]=(B*A+pixels[k+2]*factor)/a;
              pixels[k+3]=a*255;
            }
          }
        }
      }
      function vertex(i) {
        const k=i*3,t=i*2;
        return [sx[i],sy[i],iz[i],shade[k],shade[k+1],shade[k+2],uv?uv[t]:0,uv?uv[t+1]:0,uv?shade[n*3+i]:0];
      }
      // Clip the rare near-plane intersection, notably during a very close dolly.
      function clipped(a,b,c) {
        const poly=[vertex(a),vertex(b),vertex(c)], out=[];
        for(let k=0;k<3;k++) {
          const p=poly[k],t=poly[(k+1)%3], zp=1/p[2],zt=1/t[2];
          if(zp>=near) out.push(p);
          if((zp>=near)!==(zt>=near)) {
            const f=(near-zp)/(zt-zp),l=1-f;
            out.push([(p[0]*zp*l+t[0]*zt*f)/near,(p[1]*zp*l+t[1]*zt*f)/near,1/near,
              p[3]*l+t[3]*f,p[4]*l+t[4]*f,p[5]*l+t[5]*f,p[6]*l+t[6]*f,p[7]*l+t[7]*f,p[8]*l+t[8]*f]);
          }
        }
        for(let k=1;k+1<out.length;k++) drawTriangle(...out[0],...out[k],...out[k+1]);
      }
      const maxQ=1/near;
      for(let k=mesh.start,end=k+mesh.count; k<end; k+=3) {
        const a=indices?indices[k]:k,b=indices?indices[k+1]:k+1,c=indices?indices[k+2]:k+2;
        const qa=iz[a],qb=iz[b],qc=iz[c];
        if(qa<=0||qb<=0||qc<=0||qa>maxQ||qb>maxQ||qc>maxQ) {
          if((qa<=0||qa>maxQ)&&(qb<=0||qb>maxQ)&&(qc<=0||qc>maxQ))continue;
          shadeVertex(a);shadeVertex(b);shadeVertex(c);clipped(a,b,c);continue;
        }
        const xa=sx[a],ya=sy[a],xb=sx[b],yb=sy[b],xc=sx[c],yc=sy[c];
        if ((ya<0&&yb<0&&yc<0)||(ya>=height&&yb>=height&&yc>=height)||(xa<0&&xb<0&&xc<0)||(xa>=width&&xb>=width&&xc>=width))continue;
        const xmin=Math.max(0,Math.ceil(Math.min(xa,xb,xc)-.5)), xmax=Math.min(width-1,Math.floor(Math.max(xa,xb,xc)-.5));
        const ymin=Math.max(0,Math.ceil(Math.min(ya,yb,yc)-.5)), ymax=Math.min(height-1,Math.floor(Math.max(ya,yb,yc)-.5));
        if(xmin>xmax || ymin>ymax || (xmin===xmax && ymin===ymax && Math.max(qa,qb,qc)+bias<zBuffer[ymin*width+xmin]-.00000006))continue;
        const det=(xb-xa)*(yc-ya)-(xc-xa)*(yb-ya);
        if (Math.abs(det)<.023 || (mat.side!==2 && (mat.side===1 ? det*mesh.frontSign<0 : det*mesh.frontSign>0))) continue;
        shadeVertex(a); shadeVertex(b); shadeVertex(c);
        const i=a*3,l=b*3,m=c*3;
        drawTriangle(xa,ya,qa,shade[i],shade[i+1],shade[i+2],uv?uv[2*a]:0,uv?uv[2*a+1]:0,uv?shade[n*3+a]:0,
          xb,yb,qb,shade[l],shade[l+1],shade[l+2],uv?uv[2*b]:0,uv?uv[2*b+1]:0,uv?shade[n*3+b]:0,
          xc,yc,qc,shade[m],shade[m+1],shade[m+2],uv?uv[2*c]:0,uv?uv[2*c+1]:0,uv?shade[n*3+c]:0);
      }
    }
    return pixels;
  }
  return { frame, setTexture };
}
