import { simulate, sampleAt } from './sim-physics.js';
import { createControls } from './sim-controls.js';
import { createTelemetry } from './sim-telemetry.js';
import { createTimeDial } from './sim-dial.js';
import { createSimView } from './sim-view.js';
import { setupVehiclePicker, vehicleFromLocation } from './vehicle-picker.js';

const $=id=>document.getElementById(id);
const play=$('toggle-play'), scrub=$('time-scrub'), phase=$('phase'), load=$('stage-loading');
const cameraMenu=$('camera-view');
const spec=vehicleFromLocation();
const picker=setupVehiclePicker(spec);
document.title=spec.name+' · Suspension simulator';
document.querySelector('.vehicle-title .make').textContent=picker.label.make.toUpperCase();
document.querySelector('.vehicle-title h2').textContent=spec.shortName;
$('car-assumptions').textContent=spec.sourceNote;
$('mass-basis').textContent=spec.massBasis;
const axleNotes={
  landcruiser:['Double wishbones, torsion bar and telescopic damper','Live axle, coil spring and telescopic damper'],
  porsche:['MacPherson strut with coil spring','Multi-link suspension with coil spring and damper'],
  rally:['MacPherson gravel strut and coil spring','MacPherson gravel strut and coil spring'],
  dakar:['Live axle, three-leaf spring packs and paired dampers','Live axle, two-leaf spring packs and paired dampers']
};
function describeCutaway(){
  const axle=cameraMenu.value==='frontAxle'?0:cameraMenu.value==='rearAxle'?1:-1;
  $('suspension-layout').textContent=axle===-1?spec.suspension:axleNotes[spec.id][axle]+'.';
}
const sourceBox=$('model-sources');
for(const source of [...spec.sources].reverse()){
  const link=document.createElement('a');
  link.href=source.url;link.textContent=source.label;sourceBox.prepend(link);
}
const query=new URLSearchParams(location.search);
const initial={...spec.defaults};
for(const [key,range] of Object.entries(spec.limits)){
  if(!query.has(key)||!query.get(key).trim())continue;
  const value=Number(query.get(key));
  if(Number.isFinite(value)){
    const steps=Math.round((value-range.min)/range.step);
    initial[key]=Math.max(range.min,Math.min(range.max,Number((range.min+steps*range.step).toFixed(6))));
  }
}
const telemetry=createTelemetry($('telemetry'));
let run=simulate(initial);
let view=null, running=false, time=0, lastNow=0, rate=0, lastRate=1;
let frameId=0, pendingSetup=null, dirty=true, cutaway=false;
const dial=createTimeDial($('time-dial'),changeRate);
dial.setRate(0);
createControls($('test-setup'),spec.defaults,settings=>{
  pendingSetup={...settings,vehicle:spec.id};
  schedule();
},{limits:spec.limits,current:initial});

function rememberSetup(){
  const url=new URL(location.href);
  for(const key of Object.keys(spec.limits)){
    if(run.settings[key]===spec.defaults[key])url.searchParams.delete(key);
    else url.searchParams.set(key,run.settings[key]);
  }
  if(cameraMenu.value==='orbit')url.searchParams.delete('camera');
  else url.searchParams.set('camera',cameraMenu.value);
  if(cutaway)url.searchParams.set('cutaway','1');
  else if(cameraMenu.value.endsWith('Axle'))url.searchParams.set('cutaway','0');
  else url.searchParams.delete('cutaway');
  if(url.href!==location.href)history.replaceState(null,'',url);
  picker.updateLinks();
}

function schedule(){
  if(!frameId && !document.hidden) frameId=requestAnimationFrame(frame);
}
function invalidate(){dirty=true;schedule();}
function showStats(){
  $('peak-rise').textContent=(run.stats.maxBodyRise*1000).toFixed(1);
  $('peak-pitch').textContent=(run.stats.peakPitch*180/Math.PI).toFixed(2);
  $('peak-accel').textContent=(run.stats.peakAccel/9.80665).toFixed(2);
  scrub.max=String(run.duration);
  telemetry.setRun(run);
}
function updateSetup(settings){
  const old=run;
  run=simulate(settings);
  // Preserve the location in the pass when comparing setups mid-replay.
  if(time<=0 || time>=old.duration || !run.settings.speed || !old.settings.speed) time=0;
  else if(time<=old.events.rearExit){
    const progress=(time-old.events.frontEnter)/(old.events.rearExit-old.events.frontEnter);
    time=Math.max(0,run.events.frontEnter+progress*(run.events.rearExit-run.events.frontEnter));
  }else time=Math.min(run.duration,run.events.rearExit+(time-old.events.rearExit));
  if(!run.settings.speed){running=false;lastNow=0;rate=0;dial.setRate(0);}
  showStats();
  rememberSetup();
  dirty=true;
}
function advance(now){
  if(running&&lastNow) time=Math.min(run.duration,time+(now-lastNow)*.001*rate);
  if(running&&time>=run.duration){running=false;lastNow=0;rate=0;dial.setRate(0);}
  else if(running) lastNow=now;
}
function changeRate(next){
  if(!view){rate=next;if(next>0)lastRate=next;invalidate();return;}
  advance(performance.now());
  rate=next;
  if(next===0){running=false;lastNow=0;}
  else{
    lastRate=next;
    if(run.settings.speed){
      if(time>=run.duration) time=0;
      running=true;lastNow=performance.now();
    }else{rate=0;dial.setRate(0);}
  }
  invalidate();
}
function phaseText(s){
  if(!run.settings.speed)return ['Parked','idle'];
  if(time===0)return ['Ready','idle'];
  if(!running && time>=run.duration)return run.termination ? ['Impact limit','bump'] : ['Run complete','idle'];
  if(!running)return ['Paused','idle'];
  if(!run.settings.bumpHeight)return ['Flat road','running'];
  if(!s.frontContact || !s.rearContact){
    if(!s.frontContact && !s.rearContact)return ['Both axles airborne','bump'];
    return [s.frontContact?'Rear tires airborne':'Front tires airborne','bump'];
  }
  const {frontEnter,frontExit,rearEnter,rearExit}=run.events;
  if(time<frontEnter)return ['Approaching bump','running'];
  const front=time<frontExit,rear=time>=rearEnter && time<rearExit;
  if(front&&rear)return ['Both axles on bump','bump'];
  if(front)return ['Front axle on bump','bump'];
  if(rear)return ['Rear axle on bump','bump'];
  if(time<rearEnter)return ['Between axles','running'];
  return ['Settling','running'];
}
function present(){
  const sample=sampleAt(run,time);
  view?.draw(sample,run);
  if(cutaway){
    for(const axle of ['front','rear']){
      const mm=Math.round(sample[axle+'Travel']*1000);
      const label=mm===0?'0 mm':Math.abs(mm)+' mm '+(mm>0?'compressed':'extended');
      const field=$(axle+'-travel');
      if(field.textContent!==label)field.textContent=label;
    }
  }
  telemetry.draw(sample);
  const label=running?'Pause':time===0?'Run simulation':time>=run.duration?'Replay':'Resume';
  const span=play.querySelector('span');
  if(span.textContent!==label){span.textContent=label;$('play-glyph').setAttribute('href',running?'#pause':'#play');}
  play.disabled=!view||!run.settings.speed;
  $('restart').disabled=!view||time===0;
  scrub.disabled=!view||!run.settings.speed;
  scrub.value=String(time);
  scrub.style.setProperty('--pct',(100*time/run.duration)+'%');
  scrub.setAttribute('aria-valuetext',time.toFixed(2)+' seconds of '+run.duration.toFixed(2));
  $('time-display').textContent=time.toFixed(2)+' / '+run.duration.toFixed(2)+' s';
  const [text,kind]=phaseText(sample);
  if(phase.textContent!==text)phase.textContent=text;
  phase.dataset.state=kind;
  if(run.termination && time>=run.duration){
    $('impact-note').textContent=run.termination.label;
    $('impact-note').hidden=false;
  }else $('impact-note').hidden=true;
  $('peak-travel').hidden=!cutaway || !cameraMenu.value.endsWith('Axle');
  $('peak-travel').disabled=!view || !run.settings.bumpHeight || !run.settings.speed;
}
function frame(now){
  frameId=0;
  if(pendingSetup){const next=pendingSetup;pendingSetup=null;updateSetup(next);lastNow=running?now:0;}
  const wasRunning=running;
  advance(now);
  if(dirty||wasRunning){dirty=false;present();}
  if(running)schedule();
}
play.addEventListener('click',()=>{
  if(running){changeRate(0);dial.setRate(0);}
  else{changeRate(rate>0?rate:lastRate);dial.setRate(rate);}
});
$('restart').addEventListener('click',()=>{
  running=false;time=0;lastNow=0;rate=0;dial.setRate(0);invalidate();
});
$('peak-travel').addEventListener('click',()=>{
  const field=cameraMenu.value==='rearAxle'?'rearTravel':'frontTravel';
  const maximum=run.samples.reduce((best,s)=>s[field]>best[field]?s:best,run.samples[0]);
  running=false;time=maximum.t;lastNow=0;rate=0;dial.setRate(0);invalidate();
});
scrub.addEventListener('input',()=>{
  running=false;lastNow=0;time=Number(scrub.value);
  rate=0;dial.setRate(0);invalidate();
});
function setCutaway(value){
  cutaway=value;view?.setCutaway(cutaway);
  $('cutaway').setAttribute('aria-pressed',String(cutaway));
  $('travel-monitor').hidden=!cutaway;
  describeCutaway();
  invalidate();
}
cameraMenu.addEventListener('change',()=>{
  if(cameraMenu.value==='frontAxle'||cameraMenu.value==='rearAxle')setCutaway(true);
  view?.setCamera(cameraMenu.value);
  describeCutaway();
  rememberSetup();
});
$('cutaway').addEventListener('click',()=>{setCutaway(!cutaway);rememberSetup();});
document.addEventListener('visibilitychange',()=>{
  lastNow=0;
  if(!document.hidden)invalidate();
});
if([...cameraMenu.options].some(o=>o.value===query.get('camera')))cameraMenu.value=query.get('camera');
setCutaway(query.has('cutaway')?query.get('cutaway')==='1':cameraMenu.value.endsWith('Axle'));
showStats();present();
try{
  view=await createSimView($('road-canvas'),{vehicleId:spec.id,onDirty:invalidate,onFreeOrbit:()=>{if(cameraMenu.value!=='orbit'){cameraMenu.value='orbit';describeCutaway();rememberSetup();}}});
  view.setCutaway(cutaway);
  view.setCamera(cameraMenu.value);
  if(rate>0)changeRate(rate);
  present();load.hidden=true;
}catch(error){
  console.error('Suspension viewer initialization failed',error);
  load.textContent='The 3D view could not load. Reload to try again.';
}
