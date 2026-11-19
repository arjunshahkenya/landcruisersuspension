// Right-hand-drive cabin. The glazing exposes mainly the dash top, front
// seats and head restraints; each is shaped in the same metre coordinates as the body.
export function buildCabin(T) {
  const cabin = new T.Group();
  cabin.name = 'Right-hand-drive cabin';
  const surface = (name,color,roughness=.79,metalness=.03) =>
    new T.MeshStandardMaterial({name,color,roughness,metalness});
  const upholstery = surface('Oak cloth, shadowed inside the cabin',0x60594c,.94);
  const weave = surface('Woven seat center panels',0x534e42,.98);
  const welt = surface('Seat piping and seams',0x48443c,.89);
  const dash = surface('Textured charcoal dash pad',0x343730,.86);
  const lowerDash = surface('Lower instrument panel',0x534e43,.80);
  const carpet = surface('Carpet and belt webbing',0x302f29,.98);
  const vent = surface('Recessed louvers',0x171b19,.78);
  const trim = surface('Console and switchgear',0x353730,.62);
  const chrome = surface('Satin interior hardware',0x878984,.29,.72);
  const wood = surface('Satin wood-effect fascia',0x493a28,.32,.12);
  const roof = surface('Woven headlining',0x676154,.93);
  const v = (x,y,z) => new T.Vector3(x,y,z);
  const put = (name,geo,mat,x,y,z,parent=cabin) => {
    const m = new T.Mesh(geo,mat); m.name=name; m.position.set(x,y,z); parent.add(m); return m;
  };
  const block = (name,mat,x,y,z,w,h,d,parent=cabin) =>
    put(name,new T.BoxGeometry(w,h,d),mat,x,y,z,parent);
  function rounded(name,mat,x,y,z,w,h,d,shape=.46,parent=cabin) {
    const geo = new T.SphereGeometry(1,24,14);
    const p=geo.attributes.position;
    const power=a=>Math.sign(a)*Math.abs(a)**shape;
    for(let i=0;i<p.count;i++) p.setXYZ(i,power(p.getX(i))*w/2,power(p.getY(i))*h/2,power(p.getZ(i))*d/2);
    geo.computeVertexNormals();
    return put(name,geo,mat,x,y,z,parent);
  }
  function bead(name,mat,coords,r=.004,parent=cabin) {
    const curve=new T.CatmullRomCurve3(coords.map(p=>v(...p)),false,'centripetal');
    return put(name,new T.TubeGeometry(curve,Math.max(8,coords.length*3),r,6,false),mat,0,0,0,parent);
  }
  function post(name,mat,a,b,r,parent=cabin){
    const direction=v(...b).sub(v(...a));
    const mid=v(...a).addScaledVector(direction,.5);
    const mesh=put(name,new T.CylinderGeometry(r,r,direction.length(),9),mat,mid.x,mid.y,mid.z,parent);
    mesh.quaternion.setFromUnitVectors(v(0,1,0),direction.normalize());
    return mesh;
  }
  function sectionLoft(name,mat,rows) {
    const pos=[],index=[];
    const n=rows[0].length;
    rows.forEach((points,i)=>{
      for(let j=0;j<n;j++){
        pos.push(...points[j]);
        if(i===rows.length-1) continue;
        const a=i*n+j,b=i*n+(j+1)%n;
        index.push(a,a+n,b,b,a+n,b+n);
      }
    });
    for(let j=1;j<n-1;j++){
      const k=(rows.length-1)*n;
      index.push(0,j,j+1,k,k+j+1,k+j);
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    g.setIndex(index);g.computeVertexNormals();
    return put(name,g,mat,0,0,0);
  }
  // Wraparound dash pad, narrowed towards the side glass. The center bows
  // forward with the bottom edge of the windscreen.
  const dashRows=[];
  for(let i=0;i<=36;i++){
    const a=i/18-1,x=.858*a,edge=Math.abs(a)**2.7;
    const front=.924-.22*edge, lip=.429+.052*edge;
    const crown=1.248-.017*edge;
    dashRows.push([
      [x,crown-.127,front-.005],[x,crown-.056,front+.017],
      [x,crown+.008,front],[x,crown+.023,front*.70+lip*.30],
      [x,crown+.019,(front+lip)/2],[x,crown+.005,lip+.038],
      [x,crown-.020,lip],[x,crown-.059,lip-.011],
      [x,crown-.123,lip+.005]
    ]);
  }
  dash.side=T.DoubleSide;
  sectionLoft('Curved windscreen scuttle and moulded dashboard',dash,dashRows);
  rounded('Passenger dash and glovebox',lowerDash,.475,1.107,.604,.68,.215,.29);
  rounded('Drivers knee bolster',lowerDash,-.461,1.096,.601,.62,.205,.26);
  bead('Glovebox reveal',vent,[[.178,1.151,.467],[.38,1.147,.455],[.62,1.146,.464],[.751,1.152,.486]],.0038);
  rounded('Glovebox latch',trim,.42,1.141,.448,.08,.021,.01);
  // Defroster outlets lie flat on the upper pad, following its curve.
  for(const side of [-1,1]){
    const slit=rounded('Scuttle demister opening',vent,side*.38,1.266,.755,.46,.006,.026,.38);
    slit.rotation.y=-side*.13;
    for(let k=0;k<9;k++) block('Demister grille bridge',dash,side*.38+(k-4)*.042,1.268,.753-(k-4)*side*.005,.006,.006,.022);
  }
  const cowl=rounded('Driver instrument hood',dash,-.402,1.261,.57,.504,.187,.261,.55);
  cowl.rotation.x=-.035;
  const instruments=rounded('Recessed instrument pack',vent,-.402,1.264,.462,.451,.130,.024,.46);
  instruments.rotation.x=.09;
  const lens=surface('Unlit instrument glass',0x282e2b,.24,.18);
  const ticks=surface('Instrument markings',0xaaa18c,.66);
  for(const [dx,rad] of [[-.14,.033],[-.066,.052],[.067,.052],[.145,.031]]){
    const local = new T.Group();local.position.set(-.402+dx,1.264,.442);local.rotation.y=Math.PI;cabin.add(local);
    const dial=put('Instrument dial',new T.CircleGeometry(rad,32),lens,0,0,0,local);
    for(let k=0;k<=9;k++){
      const a=(215-k*29)*Math.PI/180;
      post('Gauge scale',ticks,[Math.cos(a)*rad*.80,Math.sin(a)*rad*.80,.0008],
           [Math.cos(a)*rad*.92,Math.sin(a)*rad*.92,.0008],.00075,local);
    }
    post('Parked dial needle',ticks,[0,0,.0015],[-rad*.56,-rad*.40,.0015],.0011,local);
  }
  // Register vents have individually recessed horizontal vanes.
  function register(x,y,z,width) {
    rounded('Vent surround',trim,x,y,z,width,.066,.018,.40);
    rounded('Vent aperture',vent,x,y,z-.007,width-.011,.055,.010,.42);
    for(let k=-2;k<=2;k++) block('Vent slat',dash,x,y+k*.009,z-.014,width-.019,.003,.008);
    rounded('Vent tab',trim,x+.013,y,z-.020,.024,.011,.007);
  }
  register(-.725,1.207,.47,.132); register(.720,1.207,.47,.132);
  register(-.086,1.235,.415,.128); register(.079,1.235,.415,.128);
  const stack=rounded('Center dashboard fascia',wood,-.002,1.105,.459,.302,.21,.065,.32);
  stack.rotation.x=-.105;
  rounded('Stereo face and climate controls',trim,-.003,1.112,.422,.259,.155,.018,.28);
  block('Stereo display',vent,-.002,1.146,.411,.166,.032,.009);
  for(const side of [-1,1]) rounded('Stereo rotary knob',dash,side*.102,1.141,.405,.024,.024,.016,.8);
  for(let i=0;i<6;i++) block('Preset buttons',dash,(i-2.5)*.032,1.107,.410,.025,.010,.007);
  for(const x of [-.073,0,.073]) rounded('Climate selector',dash,x,1.071,.408,.038,.036,.018,.7);

  // Two-tone seat faces with tapered shoulder bolsters and piping.
  function seat(cx,z,w,front) {
    const baseY=front?.974:.991;
    rounded('Seat base cushion',upholstery,cx,baseY,z,w,.132,.492,.46);
    rounded('Seat base center panel',weave,cx,baseY+.055,z+.018,w*.70,.038,.376,.45);
    for(const s of [-1,1]){
      const b=rounded('Cushion side bolster',upholstery,cx+s*w*.412,baseY+.044,z,w*.17,.098,.432,.60);
      b.rotation.z=-s*.105;
    }
    const zBack=z-.222;
    const rows=[];
    const levels=[[0,.76,.13],[.055,.98,.143],[.16,1,.151],[.32,.95,.149],[.419,.84,.133],[.452,.70,.110],[.465,.53,.068]];
    for (const [y,wScale,depth] of levels){
      const profile=[];
      for(let j=0;j<40;j++){
        const t=j/40*2*Math.PI, c=Math.cos(t), s=Math.sin(t);
        const px=Math.sign(c)*Math.abs(c)**.66*w*.5*wScale;
        const pz=Math.sign(s)*Math.abs(s)**.51*depth*.5;
        profile.push([cx+px,baseY+.047+y,zBack-y*.21+pz]);
      }
      rows.push(profile);
    }
    upholstery.side=T.DoubleSide;
    sectionLoft('Tapered upholstered seat back',upholstery,rows);
    const insert=rounded('Seatback center panel',weave,cx,baseY+.274,zBack+.024,w*.70,.369,.06,.48);
    insert.rotation.x=-.202;
    for(const s of [-1,1]){
      const bol=rounded('Contoured lumbar side bolster',upholstery,cx+s*w*.349,baseY+.264,zBack+.001,w*.234,.349,.147,.66);
      bol.rotation.x=-.225;bol.rotation.z=s*.061;
      bead('Upholstery stitched welt',welt,[[cx+s*w*.32,baseY+.10,zBack+.071],[cx+s*w*.31,baseY+.214,zBack+.065],
        [cx+s*w*.30,baseY+.347,zBack+.039],[cx+s*w*.263,baseY+.432,zBack+.001]],.0028);
      post('Headrest plated guide',chrome,[cx+s*.065,baseY+.499,zBack-.092],[cx+s*.065,baseY+.56,zBack-.092],.006);
    }
    const head=rounded('Shaped head restraint',upholstery,cx,baseY+.603,zBack-.097,w*.56,.158,.128,.54);
    head.rotation.x=-.16;
  }
  for(const sign of [-1,1]){
    seat(sign*.402,-.032,.493,true);
    seat(sign*.445,-.982,.483,false);
  }
  rounded('Rear bench middle cushion',weave,0,.995,-.975,.49,.131,.465,.41);
  const midback=rounded('Rear bench center back',upholstery,0,1.231,-1.235,.44,.451,.146,.43);
  midback.rotation.x=-.19;
  rounded('Cargo blind',carpet,0,1.14,-1.726,1.5,.035,.824);
  block('Floor carpet',carpet,0,.786,-.58,1.54,.031,3.12);
  rounded('Center tunnel',carpet,0,.888,-.044,.27,.205,1.132);
  rounded('Upholstered console lid',upholstery,0,1.072,-.249,.204,.094,.315);
  rounded('Console tray',wood,0,1.003,.033,.219,.073,.388);
  rounded('Gear selector gate',trim,-.035,1.042,.091,.082,.009,.17,.43);
  post('Automatic selector shaft',chrome,[-.036,1.045,.077],[-.035,1.146,.074],.011);
  rounded('Automatic selector knob',dash,-.035,1.143,.074,.053,.053,.060);
  post('Transfer case lever',trim,[.067,1.028,.113],[.071,1.108,.100],.010);
  rounded('Transfer selector knob',trim,.071,1.109,.101,.034,.040,.039);

  // The steering wheel inclines towards the windshield at the top. The
  // padded center faces the driver on the vehicle's right-hand side (−X).
  const wheel = new T.Group();wheel.position.set(-.402,1.23,.31);wheel.rotation.x=.39;cabin.add(wheel);
  put('Steering rim',new T.TorusGeometry(.174,.0155,12,74),dash,0,0,0,wheel);
  rounded('Four-spoke airbag cover',dash,0,-.007,-.013,.183,.112,.072,.42,wheel);
  for(const side of [-1,1]){
    bead('Upper steering spoke',dash,[[side*.045,.019,-.006],[side*.084,.025,0],[side*.13,.033,.007],[side*.164,.047,0]],.017,wheel);
    bead('Lower steering spoke',dash,[[side*.033,-.033,.003],[side*.061,-.073,.011],[side*.093,-.115,.004],[side*.106,-.139,0]],.014,wheel);
  }
  for(const [x,y,rx,ry] of [[0,0,.020,.013],[0,.001,.0055,.0105],[0,.0048,.015,.0041]]){
    const oval=put('Steering wheel emblem',new T.TorusGeometry(1,.076,6,28),chrome,x,y,-.049,wheel);
    oval.scale.set(rx,ry,.013);
  }
  for (const side of [-1,1]) {
    rounded('Door trim panel',lowerDash,side*.801,1.084,-.234,.053,.303,1.93,.36);
    for (const z of [.008,-.988]) {
      rounded('Padded door armrest',upholstery,side*.766,1.062,z,.082,.065,.416);
      rounded('Interior door release recess',trim,side*.770,1.173,z+.083,.026,.045,.116);
      rounded('Door release lever',chrome,side*.754,1.178,z+.080,.013,.013,.066);
    }
    bead('Pillar assist grip',roof,[[side*.747,1.677,.181],[side*.712,1.65,.216],[side*.716,1.59,.302],[side*.759,1.563,.336]],.012);
    for (const z of [-.06,-1.10])
      bead('Overhead assist grip',roof,[[side*.729,1.761,z-.073],[side*.707,1.739,z-.065],[side*.703,1.739,z+.061],[side*.728,1.762,z+.070]],.0095);
    // Narrow soft belts cross the B pillars immediately behind the front seats.
    const belt=block('Front belt webbing',carpet,side*.803,1.337,-.42,.011,.55,.041);
    belt.rotation.x=-.102;
  }
  rounded('Headliner',roof,0,1.814,-1.038,1.44,.032,1.90,.39);
  rounded('Interior mirror case',trim,0,1.683,.145,.235,.068,.046,.46);
  rounded('Interior mirror glass',chrome,0,1.683,.124,.216,.053,.006,.42);
  post('Interior mirror mount',trim,[0,1.698,.152],[0,1.771,.182],.011);
  return cabin;
}
