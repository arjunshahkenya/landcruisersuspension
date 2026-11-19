// The chart is independent of playback. Its static paths are rebuilt when a
// run, a measure or its viewport changes; playback only moves the readout.
const svgNS = 'http://www.w3.org/2000/svg';
const frontInk = '#12564e';
const rearInk = '#a44e27';
const modes = {
  travel: {
    label: 'Suspension travel', unit: 'mm', precision: 1, defaultSpan: 10,
    note: 'Positive travel is compression. Negative travel is rebound.',
    traces: [
      {label: 'Front axle', color: frontInk, value: s => s.frontTravel * 1000},
      {label: 'Rear axle', color: rearInk, dashed: true, value: s => s.rearTravel * 1000},
    ],
  },
  body: {
    label: 'Body rise', unit: 'mm', precision: 1, defaultSpan: 10,
    note: 'Body height is measured at the center of gravity relative to its starting position.',
    traces: [{label: 'Body rise', color: frontInk, value: (s, zero) => (s.heave ?? (s.body - zero.body)) * 1000}],
  },
  pitch: {
    label: 'Body pitch', unit: '°', precision: 2, defaultSpan: .5,
    note: 'Pitch is measured relative to the starting angle. Positive pitch is nose-up.',
    traces: [{label: 'Body pitch', color: frontInk, value: (s, zero) => (s.dynamicPitch ?? (s.pitch - zero.pitch)) * 180 / Math.PI}],
  },
};
const css = `
  :host { display:block; min-width:0; color:#24332f; font-family:inherit; color-scheme:light }
  * { box-sizing:border-box }
  section { min-width:0; background:#fcfcf8; border:1px solid #d6ded5; border-radius:17px; padding:19px 21px 13px }
  header,.stats,.stat,.legend,.switch,.time-group { display:flex; align-items:center }
  header { justify-content:space-between; gap:10px; flex-wrap:wrap }
  h2 { font:inherit; font-size:1.15rem; font-weight:650; letter-spacing:-.035em; line-height:1.2; margin:0 }
  .switch { position:relative }
  select { font:inherit; font-size:.79rem; font-weight:600; appearance:none; color:#354a43;
    background:#f5f7f1; border:1px solid #d5ddd3; border-radius:7px; padding:6px 26px 6px 9px; cursor:pointer }
  .chevron { position:absolute; pointer-events:none; right:10px; width:7px; height:7px; margin-top:-3px;
    transform:rotate(45deg); border:solid #586962; border-width:0 1.5px 1.5px 0 }
  .stats { gap:14px 23px; margin:15px 0 7px; flex-wrap:wrap; min-height:20px }
  .stat { gap:7px; white-space:nowrap; font-size:.805rem }
  .legend { gap:5px; color:#51605a }
  .line { width:15px; height:0; border-top:2.5px solid var(--trace); flex:none }
  .dashed { border-top-style:dashed }
  .value,.clock { font-variant-numeric:tabular-nums; letter-spacing:-.02em }
  .value { font-size:.88rem; font-weight:650; min-width:4.2em; color:var(--trace) }
  .time-group { margin-left:auto; gap:8px; font-size:.75rem; color:#5d6962 }
  .clock { font-weight:600; color:#354840; min-width:4.0em; text-align:right }
  .resume { font:inherit; font-weight:600; color:#1a574f; border:0; background:transparent;
    text-decoration:underline; text-underline-offset:2px; padding:4px 0; cursor:pointer }
  .resume[hidden], .empty[hidden], .plot[hidden] {display:none}
  .plot { width:100%; height:auto; min-width:0; display:block; touch-action:pan-y pinch-zoom; border-radius:5px; outline-offset:2px }
  .plot:focus-visible, select:focus-visible, button:focus-visible { outline:2px solid #16665d; outline-offset:3px }
  .plot text { font:11.5px system-ui,sans-serif; fill:#5b6961; font-variant-numeric:tabular-nums }
  .plot .event-label { font-size:10.6px; font-weight:600 }
  .plot .axis-label { font-size:11px }
  .plot line,.plot path { vector-effect:non-scaling-stroke }
  .note,.empty { margin:1px 0 0; font-size:.755rem; line-height:1.4; color:#5c6861 }
  .empty { margin:25px 0; text-align:center }
  .compact {padding:15px 13px 12px}
  .compact h2 {font-size:1.02rem}
  .compact .stats {gap:5px 15px; margin-top:12px}
  .compact .stat {gap:4px; font-size:.76rem}
  .compact .legend {gap:4px}
  .compact .value {font-size:.82rem; min-width:0}
  .compact .time-group {margin-left:0}
  .compact .line {width:11px}
  .compact .note {font-size:.72rem}
  @media (forced-colors:active) { .plot text { fill:CanvasText } .plot .curve { stroke:LinkText } .value { color:CanvasText } }
`;

function svg(parent, tag, attrs, label) {
  const el = parent.ownerDocument.createElementNS(svgNS, tag);
  for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, val);
  if (label !== undefined) el.textContent = label;
  parent.appendChild(el);
  return el;
}
function niceStep(span, count) {
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const ratio = raw / mag;
  return (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10) * mag;
}
function axisRange(low, high, span) {
  low = Math.min(low, 0); high = Math.max(high, 0);
  if (high - low < 1e-7) { low = -span; high = span; }
  else {
    const padding = (high - low) * .055;
    if (low < 0) low -= padding;
    if (high > 0) high += padding;
  }
  const step = niceStep(high - low, 5);
  return {low: Math.floor(low / step) * step, high: Math.ceil(high / step) * step, step};
}
function nearest(samples, time) {
  let left = 0, right = samples.length - 1;
  while (left < right) {
    const mid = (left + right) >> 1;
    if (samples[mid].t < time) left = mid + 1;
    else right = mid;
  }
  if (left && time - samples[left-1].t < samples[left].t - time) return samples[left-1];
  return samples[left];
}
const tidy = n => Math.abs(n) < 1e-8 ? '0' : Number(n.toFixed(5)).toString().replace('-', '−');
const fixed = (n, precision) => {
  if (!Number.isFinite(n)) return '—';
  const rounded = Number(n.toFixed(precision));
  return (rounded < 0 ? '−' : rounded > 0 ? '+' : '') + Math.abs(rounded).toFixed(precision);
};
const unitValue = (value, unit) => value + (unit === '°' ? '' : ' ') + unit;

export function createTelemetry(container) {
  const root = container.shadowRoot || container.attachShadow({mode:'open'});
  root.innerHTML = `<style>${css}</style><section aria-labelledby="heading">
    <header><h2 id="heading">Suspension telemetry</h2>
      <label class="switch"><select aria-label="Telemetry measure"></select><span class="chevron" aria-hidden="true"></span></label></header>
    <div class="stats"><div class="time-group"><button type="button" class="resume" hidden>Follow playback</button>
      <span class="clock" aria-label="Playback time">0.00 s</span></div></div>
    <p class="empty">Waiting for simulation data.</p>
    <svg class="plot" hidden role="slider" tabindex="0" aria-label="Inspect telemetry by time" aria-orientation="horizontal" aria-valuemin="0"
      aria-valuemax="0" aria-valuenow="0" aria-describedby="keys"></svg>
    <p class="note"></p><span id="keys" hidden>Use the arrow keys to inspect a sample. Hold Shift to move faster. Home and End reach either end. Escape follows playback.</span>
  </section>`;
  const get = selector => root.querySelector(selector);
  const section = get('section'), chart = get('.plot'), stats = get('.stats'), clock = get('.clock');
  const selector = get('select'), timeGroup = get('.time-group'), resume = get('.resume'), note = get('.note');
  for (const [key, metric] of Object.entries(modes)) {
    const option = container.ownerDocument.createElement('option');
    option.value = key; option.textContent = metric.label; selector.appendChild(option);
  }
  let run = null, metric = modes.travel, live = null, inspected = null, inspectionKind = '';
  let view = null, values = [], dots = [], cursor = null, liveLine = null, dragging = false;
  function selectMeasure() {
    metric = modes[selector.value] || modes.travel;
    for (const item of stats.querySelectorAll('.stat')) item.remove();
    values = metric.traces.map(trace => {
      const item = container.ownerDocument.createElement('div');
      item.className = 'stat'; item.style.setProperty('--trace',trace.color);
      item.innerHTML = `<span class="legend"><i class="line ${trace.dashed?'dashed':''}" aria-hidden="true"></i><span></span></span><span class="value"></span>`;
      item.querySelector('.legend span').textContent = trace.label;
      stats.insertBefore(item,timeGroup);return item.querySelector('.value');
    });
    note.textContent = metric.note;
    rebuild();
  }
  function eventLabels(plot, x) {
    if (!run.settings?.bumpHeight) return;
    const hits = [
      [run.events?.frontEnter, 'Front on bump', frontInk],
      [run.events?.rearEnter, 'Rear on bump', rearInk],
    ].filter(([t]) => Number.isFinite(t) && t >= 0 && t <= run.duration);
    if (!hits.length) return;
    const short = view.width < 390;
    const width = short ? 55 : 80, pad = 3;
    const centers = hits.map(([time]) => Math.max(view.left+width/2,Math.min(view.right-width/2,x(time))));
    if (centers.length === 2 && centers[1] - centers[0] < width + pad) {
      centers[0] = Math.min(centers[0],view.right-1.5*width-pad);
      centers[1] = Math.max(centers[1],centers[0]+width+pad);
    }
    hits.forEach(([time,label,color],index) => {
      const at = x(time), center = centers[index];
      const group = svg(plot,'g',{});
      svg(group,'title',{},label+' at '+time.toFixed(2)+' seconds');
      svg(group,'line',{x1:at,y1:view.top+1,x2:at,y2:view.bottom,stroke:color,'stroke-opacity':.42,'stroke-dasharray':'2 4'});
      svg(group,'path',{d:`M${center},18 L${center},21 L${at},${view.top-2}`,stroke:color,'stroke-opacity':.53,fill:'none'});
      svg(group,'rect',{x:center-width/2,y:2,width,height:16,rx:4,fill:color===frontInk?'#e3eee7':'#f6e9de'});
      const caption = svg(group,'text',{class:'event-label',x:center,y:13.9,'text-anchor':'middle'},short?label.split(' ')[0]+' entry':label);
      caption.style.fill=color;
    });
  }
  function rebuild() {
    const hasRun = !!run?.samples?.length;
    chart.toggleAttribute('hidden',!hasRun);
    get('.empty').hidden = hasRun;
    section.classList.toggle('compact',container.getBoundingClientRect().width < 450);
    if (!hasRun) {view=null; values.forEach(el=>el.textContent='—');return;}
    const width = Math.max(170,Math.round(chart.getBoundingClientRect().width || container.getBoundingClientRect().width));
    const height = width < 420 ? 202 : 218;
    const zero = run.samples[0];
    let lo=0,hi=0;
    for (const sample of run.samples) for (const trace of metric.traces) {
      const value=trace.value(sample,zero); if(Number.isFinite(value)){lo=Math.min(lo,value);hi=Math.max(hi,value);}
    }
    const range=axisRange(lo,hi,metric.defaultSpan), duration=run.duration || run.samples.at(-1).t || 1;
    const digits=Math.max(tidy(range.low).length,tidy(range.high).length);
    const left=Math.max(31,10+digits*7);
    view={width,height,left,right:width-9,top:30,bottom:height-26,duration,range};
    view.x=t=>view.left+Math.max(0,Math.min(1,t/duration))*(view.right-view.left);
    view.y=v=>view.bottom-(v-range.low)/(range.high-range.low)*(view.bottom-view.top);
    const {x,y,bottom,right}=view;
    chart.replaceChildren();chart.setAttribute('viewBox',`0 0 ${width} ${height}`);
    chart.setAttribute('aria-valuemax',String(duration));
    svg(chart,'title',{},metric.label+' over time in '+(metric.unit==='°'?'degrees':'millimeters'));
    for(let k=0;k<=Math.round((range.high-range.low)/range.step);k++){
      const value=range.low+k*range.step, top=y(value);
      svg(chart,'line',{x1:left,y1:top,x2:right,y2:top,stroke:Math.abs(value)<1e-8?'#a7b2a9':'#dfe5dc','stroke-width':Math.abs(value)<1e-8?1.1:.8});
      svg(chart,'text',{'text-anchor':'end',x:left-7,y:top+4},tidy(value));
    }
    svg(chart,'text',{class:'axis-label',x:left-6,y:17,'text-anchor':'end'},metric.unit);
    const xStep=niceStep(duration,width<370?4:6);
    const times=[];
    for(let i=0;i*xStep<=duration+.00001;++i) times.push(i*xStep);
    if(duration-times.at(-1) > .68*xStep) times.push(duration);
    for(const t of times) {
      const at=x(t);
      svg(chart,'line',{x1:at,y1:bottom,x2:at,y2:bottom+4,stroke:'#a7b2a9'});
      svg(chart,'text',{x:at,y:bottom+18,'text-anchor':at>right-13?'end':at<left+6?'start':'middle'},tidy(Number(t.toFixed(2)))+' s');
    }
    eventLabels(chart,x);
    metric.traces.forEach(trace=>{
      // Each horizontal pixel retains its first, minimum, maximum and last
      // samples, so zoom-independent downsampling preserves short oscillations.
      let path='', bucket=-1, first=0,last=0,min=0,max=0,minV=0,maxV=0;
      function flush(){
        if(bucket<0)return;
        const picks=[...new Set([first,min,max,last])].sort((a,b)=>a-b);
        for(const i of picks){
          const s=run.samples[i],v=trace.value(s,zero);
          path+=(path?'L':'M')+x(s.t).toFixed(2)+','+y(v).toFixed(2);
        }
      }
      run.samples.forEach((s,i)=>{
        const value=trace.value(s,zero);
        if(!Number.isFinite(value))return;
        const pixel=Math.floor(x(s.t));
        if(pixel!==bucket){flush();bucket=pixel;first=min=max=i;minV=maxV=value;}
        if(value<minV){minV=value;min=i;}if(value>maxV){maxV=value;max=i;}last=i;
      });flush();
      svg(chart,'path',{class:'curve',d:path,fill:'none',stroke:trace.color,'stroke-width':2.1,'stroke-dasharray':trace.dashed?'6 3':'none','stroke-linecap':'round','stroke-linejoin':'round'});
    });
    liveLine=svg(chart,'line',{y1:view.top,y2:bottom,stroke:'#88948c','stroke-width':1,'stroke-dasharray':'3 3'});
    cursor=svg(chart,'line',{y1:view.top,y2:bottom,stroke:'#42554c','stroke-width':1.2});
    dots=metric.traces.map(t=>svg(chart,'circle',{r:3.7,fill:t.color,stroke:'#fcfcf8','stroke-width':1.4}));
    paintIndicator();
  }
  function setText(el,text){if(el.textContent!==text)el.textContent=text;}
  function paintIndicator(){
    const sample=inspected||live||run?.samples?.[0];
    if(!view||!sample)return;
    const x=view.x(sample.t);
    cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);
    const separate=inspected && live && Math.abs(view.x(live.t)-x)>2;
    liveLine.setAttribute('visibility',separate?'visible':'hidden');
    if(separate){const at=view.x(live.t);liveLine.setAttribute('x1',at);liveLine.setAttribute('x2',at);}
    const displayed=metric.traces.map((trace,i)=>{
      const value=trace.value(sample,run.samples[0]);
      const text=unitValue(fixed(value,metric.precision),metric.unit);
      setText(values[i],text);
      dots[i].setAttribute('cx',x);dots[i].setAttribute('cy',Number.isFinite(value)?view.y(value):0);
      dots[i].setAttribute('visibility',Number.isFinite(value)?'visible':'hidden');return trace.label+' '+text;
    });
    const t=sample.t.toFixed(2);
    setText(clock,t+' s');
    resume.hidden= !inspected || inspectionKind==='mouse';
    clock.setAttribute('aria-label',(inspected?'Inspection time ':'Playback time ')+t+' seconds');
    chart.setAttribute('aria-valuenow',String(sample.t));
    chart.setAttribute('aria-valuetext',t+' seconds, '+displayed.join(', '));
  }
  function follow(){inspected=null;inspectionKind='';paintIndicator();}
  function inspect(time,kind){
    if(!view)return;
    inspected=nearest(run.samples,Math.max(0,Math.min(view.duration,time)));
    inspectionKind=kind;paintIndicator();
  }
  function pointerTime(event){
    const box=chart.getBoundingClientRect(),at=(event.clientX-box.left)*view.width/box.width;
    return view.duration*(at-view.left)/(view.right-view.left);
  }
  chart.addEventListener('pointerdown',event=>{
    if(!view||!event.isPrimary)return;
    dragging=event.pointerType!=='mouse';
    if(dragging)chart.setPointerCapture(event.pointerId);
    inspect(pointerTime(event),event.pointerType);
  });
  chart.addEventListener('pointermove',event=>{
    if(view && event.isPrimary && (event.pointerType==='mouse'||dragging)) inspect(pointerTime(event),event.pointerType);
  });
  chart.addEventListener('pointerup',()=>{dragging=false;});
  chart.addEventListener('pointercancel',()=>{dragging=false;follow();});
  chart.addEventListener('pointerleave',()=>{if(inspectionKind==='mouse')follow();});
  chart.addEventListener('keydown',event=>{
    if(!view)return;
    const start=(inspected||live||run.samples[0]).t;
    const step=Math.max(.05,run.samples.length>1?run.samples[1].t-run.samples[0].t:.05)*(event.shiftKey?5:1);
    const target={ArrowLeft:start-step,ArrowDown:start-step,ArrowRight:start+step,ArrowUp:start+step,PageDown:start-view.duration/10,PageUp:start+view.duration/10,Home:0,End:view.duration}[event.key];
    if(event.key==='Escape'){event.preventDefault();follow();return;}
    if(target===undefined)return;event.preventDefault();inspect(target,'keyboard');
  });
  chart.addEventListener('blur',event=>{if(inspectionKind==='keyboard' && event.relatedTarget!==resume) follow();});
  resume.addEventListener('click',()=>{follow();chart.focus({preventScroll:true});});
  selector.addEventListener('change',selectMeasure);
  if(typeof ResizeObserver!=='undefined'){
    let last=-1;new ResizeObserver(entries=>{const w=entries[0].contentRect.width;if(Math.abs(last-w)>.5){last=w;rebuild();}}).observe(container);
  }
  selectMeasure();
  return {
    setRun(next){
      run=next;live=run?.samples?.[0]||null;inspected=null;inspectionKind='';resume.hidden=true;
      if(!live)setText(clock,'0.00 s');
      rebuild();
    },
    draw(sample){if(sample && Number.isFinite(sample.t)){live=sample;paintIndicator();}},
  };
}
