// Inner fender stampings and splash shields. Their outer edges inherit the
// actual left/right wheel-opening profile from the body rather than a circle.
export function buildWheelTubs(T, lowerBody) {
  const group = new T.Group();
  const liner = new T.MeshStandardMaterial({
    name:'Textured wheel-well underseal',color:0x363630,metalness:.06,roughness:.94,side:T.DoubleSide
  });
  const clips = new T.MeshStandardMaterial({name:'Splash shield fixings',color:0x3c3e38,metalness:.25,roughness:.70});
  if (typeof document !== 'undefined') {
    const tex = new T.TextureLoader().load(new URL('./assets/underseal-grain.webp',import.meta.url).href);
    tex.colorSpace=T.SRGBColorSpace; tex.wrapS=tex.wrapT=T.RepeatWrapping;
    liner.map=tex; liner.bumpMap=tex; liner.bumpScale=.0007;
  }
  function sheet(rows,columns,point,name) {
    const pos=[],uv=[],indices=[];
    for(let row=0;row<=rows;row++){
      for(let col=0;col<=columns;col++){
        const [x,y,z]=point(col/columns,row/rows);
        pos.push(x,y,z); uv.push((x+y*.31)*2.8,z*2.8);
        if (row===rows || col===columns) continue;
        const i=row*(columns+1)+col;
        indices.push(i,i+columns+1,i+1,i+1,i+columns+1,i+columns+2);
      }
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geo.setIndex(indices);geo.computeVertexNormals();
    const m=new T.Mesh(geo,liner);m.name=name;group.add(m);
  }
  for (const axle of [-1.43,1.42]) for (const side of [-1,1]) {
    const front=axle>0;
    const start=front?.923:-1.97,end=front?1.98:-.91;
    const arc=(t)=>{
      const z=start+(end-start)*t;
      // All parts of the liner stay above the swept envelope of the tire.
      const dy=Math.sqrt(Math.max(0,.424**2-(z-axle)**2));
      return [z,Math.max(lowerBody(z)+.020,.405+dy+.030)];
    };
    sheet(12,66,(t,s)=>{
      const [z,rim]=arc(t);
      const dome=.068*Math.sin(s*Math.PI/1.76);
      return [side*(.735-.16*s),rim+dome,z];
    },'Recessed wheel-arch housing');
    sheet(12,66,(t,s)=>{
      const [z,rim]=arc(t);
      const cap=rim+.067;
      // The front apron has a raised opening above the upper wishbone. The
      // rear housing clears the moving axle and spring seat.
      const clearance=(front?.49:.51)+.110*Math.exp(-(((z-axle)/.188)**2));
      return [side*(.575-.025*s),cap+(Math.min(clearance,cap-.007)-cap)*s,z];
    },'Inner wheel housing apron');
    for(const t of [.14,.39,.67,.86]){
      const [z,y]=arc(t);
      const head=new T.Mesh(new T.CylinderGeometry(.010,.011,.006,12),clips);
      head.name='Wheel liner retainer';head.position.set(side*.715,y+.007,z);
      group.add(head);
    }
  }
  return group;
}
