const $ = id => document.getElementById(id);
const canvas = $('model-canvas');
const stage = $('stage');
const panel = stage.closest('.viewer-panel');
const dialog = $('controls-dialog');
const presets = [...document.querySelectorAll('[data-view]')];
const detailMenu = $('select-detail');
const parts = [...document.querySelectorAll('[data-part]')];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
$('controls-open').onclick = () => dialog.showModal();
$('controls-close').onclick = () => dialog.close();
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});

const fullButton = $('fullscreen');
function updateFull() {
  const full = !!document.fullscreenElement || panel.classList.contains('expanded');
  fullButton.setAttribute('aria-label', full ? 'Exit full screen' : 'Full screen');
  fullButton.title = fullButton.getAttribute('aria-label');
}
function setExpanded(value) {
  panel.classList.toggle('expanded', value);
  document.body.classList.toggle('viewer-expanded', value);
  updateFull();
}
fullButton.onclick = async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (panel.classList.contains('expanded')) setExpanded(false);
  else if (panel.requestFullscreen) {
    try { await panel.requestFullscreen(); } catch { setExpanded(true); }
  } else setExpanded(true);
  updateFull();
};
document.addEventListener('fullscreenchange', updateFull);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && panel.classList.contains('expanded')) setExpanded(false);
});

function showFallback(error) {
  console.error('Viewer could not start', error);
  canvas.hidden = true;
  const status = $('stage-status');
  status.textContent = 'The model could not load. Reload the page to try again.';
  status.hidden = false;
  stage.classList.add('unavailable');
  detailMenu.disabled = true;
  presets.forEach(button => { button.disabled = true; });
  ['zoom-in','zoom-out','reset-view','toggle-orbit'].forEach(id => { $(id).disabled = true; });
}

// Let the shell and loading status paint before constructing the geometry.
async function start() {
  const [THREE, {OrbitControls}, {vehicle}, {lightStudio}] = await Promise.all([
    import('./vendor/three.module.js'), import('./vendor/OrbitControls.js'),
    import('./layers.js'), import('./studio.js')
  ]);
  const options = {alpha:true, antialias:true, powerPreference:'high-performance'};
  const context = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
  const renderer = context
    ? new THREE.WebGLRenderer({canvas, context, ...options})
    : await (await import('./software.js')).createSoftwareRenderer(canvas, THREE);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setClearColor?.(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .97;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(25, 1, .035, 100);
  const controls = new OrbitControls(camera,canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .12;
  controls.panSpeed = .65;
  controls.rotateSpeed = .70;
  controls.zoomSpeed = .84;
  controls.minDistance = .39;
  controls.maxDistance = 22;
  controls.maxTargetRadius = 3.25;
  controls.autoRotateSpeed = .9;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  controls.cursor.set(0,.92,0);
  // Present the first frame with the paint, glazing and lamps already textured.
  const manager = THREE.DefaultLoadingManager;
  let pendingMaps = false;
  let finishMaterials;
  const materialsLoaded = new Promise(resolve => { finishMaterials = resolve; });
  manager.onStart = () => { pendingMaps = true; };
  manager.onLoad = finishMaterials;
  const lighting = lightStudio(scene,context ? renderer : null);
  const model = vehicle();
  if (pendingMaps) await materialsLoaded;
  manager.onStart = undefined;
  scene.add(model.group);
  let active = 'overview', detail = '', isolated = false, inspection = false;
  let dirty = true, intersecting = true, tween = null, previous = 0;
  renderer.onReady = () => { dirty=true; };
  const pose = {
    // Eye-level three-quarter view fitted to the owner's paved-drive photograph.
    overview: [-.847,.101,1], front: [0,.012,1], side: [-1,.12,.0001],
    rear:[0,.018,-1], roof:[-.001,1,.00001], underbody:[-.055,-1,.003]
  };
  const closeups = {
    bumper: {target:[0,.84,2.26], dir:[-.45,.24,1], distance:3.35},
    wheel: {target:[-.8,.44,1.42], dir:[-1,.14,.45], distance:2.24},
    rack: {target:[0,1.95,-1.12], dir:[-.92,.65,.72], distance:4.30},
    spare: {target:[-.455,1.03,-2.70], dir:[-.32,.17,-1], distance:2.7},
    'front-suspension': {target:[0,.43,1.35], dir:[-.38,-1,.44], distance:3.5, mechanical:true},
    'rear-axle': {target:[0,.43,-1.41], dir:[-.34,-1,-.38], distance:3.4, mechanical:true}
  };
  const titles = Object.fromEntries([
    ...[...presets, ...parts].map(b => [b.dataset.view || b.dataset.part, b.textContent.trim()]),
    ...[...detailMenu.options].filter(option => option.value).map(option => [option.value, option.text]),
  ]);
  const requested = new URLSearchParams(location.search);
  if (Object.hasOwn(pose, requested.get('view'))) active = requested.get('view');
  if (Object.hasOwn(closeups, requested.get('detail'))) {
    detail = requested.get('detail'); active = closeups[detail].mechanical ? 'underbody' : '';
  }
  inspection = active === 'underbody';
  function rememberView() {
    const url = new URL(location.href);
    url.searchParams.delete('view'); url.searchParams.delete('detail');
    if (detail) url.searchParams.set('detail',detail);
    else if (active && active !== 'overview') url.searchParams.set('view',active);
    if (location.protocol.startsWith('http')) history.replaceState(null,'',url);
  }
  const V = (x,y,z) => new THREE.Vector3(x,y,z);
  const pts = [];
  for (const sign of [-1,1]) {
    for (const z of [-2.58,2.49]) {
      pts.push(V(sign*.97,.52,z),V(sign*.93,1.2,z));
    }
    for (const z of [-2.12,.30]) pts.push(V(sign*.79,1.88,z));
    for (const z of [-1.68,-.56]) pts.push(V(sign*.65,2.05,z));
    for (const z of [-1.43,1.42]) pts.push(V(sign*.94,.018,z),V(sign*.94,.405,z-.405),V(sign*.94,.405,z+.405));
  }
  // The centre of the custom steel bumper projects beyond its swept wings.
  for (const sign of [-1,1]) pts.push(V(sign*.32,.86,2.70),V(sign*.32,.62,2.65));
  pts.push(V(-.85,1.03,-2.78),V(-.06,1.03,-2.78),V(-.455,1.42,-2.78),V(-.455,.63,-2.78));
  function frame(direction, target) {
    const right = new THREE.Vector3().crossVectors(camera.up,direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction,right);
    const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const mobile = stage.clientWidth < 640;
    const horizontalFactor = mobile ? .90 : .86;
    const verticalFactor = mobile ? .64 : .73;
    return Math.max(...pts.map(p => {
      const v = p.clone().sub(target);
      return v.dot(direction) + Math.max(Math.abs(v.dot(right))/(vertical*camera.aspect*horizontalFactor), Math.abs(v.dot(up))/(vertical*verticalFactor));
    }));
  }
  function desired() {
    const d = closeups[detail];
    const target = d ? V(...d.target) : V(0,active === 'underbody' ? .56 : .94,-.045);
    const dir = V(...(d ? d.dir : pose[active] || pose.overview)).normalize();
    const distance = d ? d.distance*Math.max(1,1.3/camera.aspect) : frame(dir,target);
    return {target, dir, distance};
  }
  function fromCamera() {
    const vec = camera.position.clone().sub(controls.target);
    return {target:controls.target.clone(), distance:vec.length(), dir:vec.normalize()};
  }
  function apply(settings) {
    controls.target.copy(settings.target);
    camera.position.copy(settings.target).addScaledVector(settings.dir, settings.distance);
    controls.update();
    dirty = true;
  }
  function animateTo(settings, instant=false) {
    const from = fromCamera();
    // Remove residual drag velocity before a button-driven camera movement.
    controls.enableDamping = false; controls.update(); controls.enableDamping = true;
    if (instant || reduced.matches) { tween=null; apply(settings); return; }
    const a = new THREE.Spherical().setFromVector3(from.dir);
    const b = new THREE.Spherical().setFromVector3(settings.dir);
    let yaw = b.theta - a.theta;
    yaw = Math.atan2(Math.sin(yaw),Math.cos(yaw));
    tween = {start:performance.now(), from, to:settings, a, b, yaw};
  }
  function setOrbit(value) {
    controls.autoRotate = value;
    $('toggle-orbit').setAttribute('aria-pressed', String(value));
    $('toggle-orbit').title = value ? 'Stop auto-orbit' : 'Auto-orbit';
    $('toggle-orbit').setAttribute('aria-label', $('toggle-orbit').title);
  }
  function reflect() {
    presets.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === active && !detail)));
    detailMenu.value = closeups[detail]?.mechanical ? '' : detail;
    parts.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.part === detail)));
    $('underbody-controls').hidden = !inspection;
    const b = $('chassis-toggle');
    b.hidden = !inspection; $('preset-note').hidden = !inspection;
    b.setAttribute('aria-pressed', String(isolated));
    b.querySelector('span').textContent = isolated ? 'Show bodywork' : 'Isolate chassis';
    stage.dataset.view = detail || active || 'free';
    const label = $('view-caption');
    label.textContent = titles[detail || active] || '';
    label.hidden = !label.textContent || active === 'overview';
    stage.classList.toggle('inspection-view',active !== 'overview');
  }
  function select(view, feature='', instant=false) {
    setOrbit(false);
    detail = feature; active = view;
    inspection = view === 'underbody';
    isolated = false; model.exterior.visible=true;
    reflect(); rememberView(); animateTo(desired(), instant);
  }
  function clearSelection() {
    if (active || detail) {active=''; detail=''; reflect();}
  }
  function zoom(factor) {
    tween = null;
    const s = fromCamera();
    clearSelection();
    s.distance = THREE.MathUtils.clamp(s.distance*factor, controls.minDistance, controls.maxDistance);
    apply(s);
  }
  presets.forEach(b => b.onclick = () => select(b.dataset.view));
  parts.forEach(b => b.onclick = () => {
    setOrbit(false); active = 'underbody'; detail = b.dataset.part;
    reflect(); rememberView(); animateTo(desired());
  });
  detailMenu.onchange = () => {
    if (detailMenu.value) select('', detailMenu.value);
    else select('overview');
  };
  $('zoom-in').onclick = () => zoom(.82);
  $('zoom-out').onclick = () => zoom(1/.82);
  $('reset-view').onclick = () => select('overview');
  $('toggle-orbit').onclick = () => {tween=null; setOrbit(!controls.autoRotate); if(controls.autoRotate) clearSelection();};
  $('chassis-toggle').onclick = () => {
    isolated = !isolated;
    model.exterior.visible = !isolated;
    dirty = true;
    reflect();
  };
  controls.addEventListener('change', () => {dirty = true;});
  controls.addEventListener('start', () => {
    tween=null; setOrbit(false);
  });
  let pointer = null;
  canvas.addEventListener('pointerdown', e => {
    canvas.focus({preventScroll:true});
    pointer = {x:e.clientX,y:e.clientY};
  });
  canvas.addEventListener('pointermove', e => {
    if (pointer && Math.hypot(pointer.x-e.clientX,pointer.y-e.clientY)>4) clearSelection();
  });
  for (const event of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(event,()=>{pointer=null;});
  canvas.addEventListener('keydown', e => {
    const axes = {ArrowLeft:[-.13,0],ArrowRight:[.13,0],ArrowUp:[0,-.12],ArrowDown:[0,.12]};
    if (axes[e.key]) {
      e.preventDefault(); tween=null; setOrbit(false); clearSelection();
      const s = fromCamera();
      const angle = new THREE.Spherical().setFromVector3(s.dir);
      angle.theta += axes[e.key][0]; angle.phi += axes[e.key][1]; angle.makeSafe();
      s.dir.setFromSpherical(angle); apply(s);
    } else if (['+','=','-','Home'].includes(e.key)) {
      e.preventDefault();
      if (e.key === 'Home') select('overview'); else zoom(e.key === '-' ? 1.2 : 1/1.2);
    }
  });
  function resize() {
    const w = Math.max(stage.clientWidth,1), h = Math.max(stage.clientHeight,1);
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.setViewOffset(w,h,0, w < 640 ? -18 : -9,w,h);
    camera.updateProjectionMatrix();
    if (active || detail) animateTo(desired(), true);
    dirty = true;
  }
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver(entries => {intersecting=entries[0].isIntersecting;dirty=true;}).observe(stage);
  THREE.DefaultLoadingManager.onLoad = () => {dirty=true;};
  canvas.addEventListener('webglcontextlost', e => {e.preventDefault(); $('stage-status').textContent='Restoring 3D viewer…'; $('stage-status').hidden=false;});
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  resize(); reflect();
  function haveFrame() {
    $('stage-status').hidden = true;
  }
  renderer.onPresented = haveFrame;
  function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden || !intersecting) {previous=0; return;}
    const delta = previous ? Math.min((now-previous)/1000, .06) : 0;
    previous = now;
    if (tween) {
      const t = Math.min(1,(now-tween.start)/650), s=t*t*(3-2*t);
      const { from,to,a,b,yaw } = tween;
      const direction = new THREE.Vector3().setFromSphericalCoords(1,THREE.MathUtils.lerp(a.phi,b.phi,s),a.theta+yaw*s);
      apply({target:from.target.clone().lerp(to.target,s),dir:direction,distance:THREE.MathUtils.lerp(from.distance,to.distance,s)});
      if(t===1) tween=null;
    } else controls.update(delta);
    if (!dirty) return;
    lighting(camera, controls.target, isolated);
    renderer.render(scene,camera);
    dirty = false;
    if (!renderer.isSoftwareRenderer) haveFrame();
  }
  requestAnimationFrame(loop);
}
start().catch(showFallback);
