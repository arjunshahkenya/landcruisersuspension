import { makeShade } from './software-shading.js';

// The vehicle is rigid. Keep world geometry and its projection work buffers
// between frames, and do all rasterization off the UI thread where possible.
export function createRasterizer(source) {
  const materials = source.materials.map(m => ({ ...m, shade: makeShade(m) }));
  const textures = new Map();
  const meshes = source.meshes.map(mesh => {
    const count = mesh.positions.length / 3;
    return {...mesh,
      sx: new Float32Array(count), sy: new Float32Array(count), iz: new Float32Array(count),
      shade: new Float32Array(count * 3), stamp: new Uint32Array(count)
    };
  });
  let sequence = 0, zBuffer = new Float32Array(), pixels, rgba;
  function setTexture(texture) { textures.set(texture.key, texture); }

  function frame({width, height, matrix, eye, active, opacity, near, final}) {
    sequence++;
    if (zBuffer.length !== width * height) zBuffer = new Float32Array(width * height);
    else zBuffer.fill(0);
    pixels = new Uint8ClampedArray(width * height * 4);
    rgba = new Uint32Array(pixels.buffer);
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
    for (const j of [...ground, ...opaque, ...blended]) {
      const mesh=meshes[j], mat=materials[mesh.material], tex=textures.get(mat.map);
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
        } else mat.shade(nx,ny,nz,vx,vy,vz,world[k],world[k+1],world[k+2],shade,k);
        if (colors) { shade[k]*=colors[k]; shade[k+1]*=colors[k+1]; shade[k+2]*=colors[k+2]; }
      }
      const tWidth=tex?.width||0,tHeight=tex?.height||0, bitmap=tex?.pixels;
      const alpha=opacity[j], hasTexture=!!(tex&&uv), blendedMat=mat.transparent||alpha<.999;
      const bias=(mat.offset || 0) + mesh.order*1e-8;
      function drawTriangle(x0,y0,q0,r0,g0,b0,u0,v0, x1,y1,q1,r1,g1,b1,u1,v1, x2,y2,q2,r2,g2,b2,u2,v2) {
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
        let ur=0,ud=0,vr=0,vd=0;
        if (hasTexture) {
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
          let u=u0+dx*ur+dy*ud,v=v0+dx*vr+dy*vd, p=y*width+xFirst;
          for(let x=xFirst; x<=xLast; x++,p++,q+=qr,r+=rr,g+=gr,b+=br,u+=ur,v+=vr) {
            if(q+bias < zBuffer[p]-.00000006) continue;
            let R=r,G=g,B=b,A=alpha;
            if(hasTexture) {
              let U=u/q,V=v/q;
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
            }
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
        return [sx[i],sy[i],iz[i],shade[k],shade[k+1],shade[k+2],uv?uv[t]:0,uv?uv[t+1]:0];
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
              p[3]*l+t[3]*f,p[4]*l+t[4]*f,p[5]*l+t[5]*f,p[6]*l+t[6]*f,p[7]*l+t[7]*f]);
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
        const det=(xb-xa)*(yc-ya)-(xc-xa)*(yb-ya);
        if (Math.abs(det)<.023 || (mat.side!==2 && (mat.side===1 ? det*mesh.frontSign<0 : det*mesh.frontSign>0))) continue;
        shadeVertex(a); shadeVertex(b); shadeVertex(c);
        const i=a*3,l=b*3,m=c*3;
        drawTriangle(xa,ya,qa,shade[i],shade[i+1],shade[i+2],uv?uv[2*a]:0,uv?uv[2*a+1]:0,
          xb,yb,qb,shade[l],shade[l+1],shade[l+2],uv?uv[2*b]:0,uv?uv[2*b+1]:0,
          xc,yc,qc,shade[m],shade[m+1],shade[m+2],uv?uv[2*c]:0,uv?uv[2*c+1]:0);
      }
    }
    return pixels;
  }
  return { frame, setTexture };
}
