// Detents are equally spaced around the dial so the slowest rates stay easy
// to select with a fingertip. A zero rate means paused simulation time.
const rates = [0, .1, .25, .5, 1];
const arc = 270;
const startAngle = -arc / 2;
let nextId = 0;

export function createTimeDial(container, onRateChange) {
  const doc = container.ownerDocument;
  const id = 'sim-time-rate-' + ++nextId;
  const root = doc.createElement('div');
  root.className = 'sim-time-dial';
  const knob = doc.createElement('div');
  knob.className = 'sim-time-dial__knob';
  knob.tabIndex = 0;
  knob.setAttribute('role', 'slider');
  knob.setAttribute('aria-label', 'Time dial, playback speed');
  knob.setAttribute('aria-valuemin', '0');
  knob.setAttribute('aria-valuemax', '1');
  knob.title = 'Drag to change speed. Press the centre to pause or resume.';

  function svgElement(tag, attrs) {
    const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    return node;
  }
  function point(angle, radius) {
    const rad = angle * Math.PI / 180;
    return { x: 26 + Math.sin(rad) * radius, y: 26 - Math.cos(rad) * radius };
  }
  const svg = svgElement('svg', { viewBox:'0 0 52 52', 'aria-hidden':'true', focusable:'false' });
  const ticks = [];
  for (let i = 0; i <= 8; i++) {
    const angle = startAngle + arc * i / 8;
    const major = i % 2 === 0;
    const inner = point(angle, major ? 20 : 21.3);
    const outer = point(angle, major ? 23.6 : 23);
    const tick = svgElement('line', { x1:inner.x, y1:inner.y, x2:outer.x, y2:outer.y,
      class:major ? 'sim-time-dial__tick is-major' : 'sim-time-dial__tick' });
    svg.append(tick);
    ticks.push(tick);
  }
  const start = point(startAngle, 18.9), end = point(-startAngle, 18.9);
  const track = 'M' + start.x + ',' + start.y + ' A18.9,18.9 0 1,1 ' + end.x + ',' + end.y;
  const rail = svgElement('path', { d:track, class:'sim-time-dial__rail' });
  const fill = svgElement('path', { d:track, pathLength:'100', 'stroke-dasharray':'100 100', class:'sim-time-dial__arc' });
  const face = svgElement('circle', { cx:'26', cy:'26', r:'16.4', class:'sim-time-dial__face' });
  const hub = svgElement('circle', { cx:'26', cy:'26', r:'14.6', class:'sim-time-dial__hub' });
  const marker = svgElement('line', { x1:'26', y1:'12.5', x2:'26', y2:'17.2', class:'sim-time-dial__pointer' });
  const icon = svgElement('path', { class:'sim-time-dial__icon' });
  svg.append(rail, fill, face, hub, marker, icon);
  knob.append(svg);

  const menu = doc.createElement('div');
  menu.className = 'sim-time-dial__menu';
  const label = doc.createElement('label');
  label.className = 'sim-time-dial__label';
  label.setAttribute('for', id);
  label.textContent = 'Time dial';
  const select = doc.createElement('select');
  select.className = 'sim-time-dial__select';
  select.id = id;
  for (const rate of rates) {
    const option = doc.createElement('option');
    option.value = String(rate);
    option.textContent = rate === 0 ? 'Paused' : rate + '×';
    select.append(option);
  }
  menu.append(label, select);
  root.append(knob, menu);
  container.replaceChildren(root);

  let current = 4, lastMoving = 4, drag = null;
  function write(index, notify = false) {
    const previous = current;
    current = Math.max(0, Math.min(index, rates.length - 1));
    const rate = rates[current];
    if (rate > 0) lastMoving = current;
    const angle = startAngle + current * arc / (rates.length - 1);
    // Each of the five allowed rates maps to a real angular position.
    marker.setAttribute('transform', 'rotate(' + angle + ' 26 26)');
    fill.setAttribute('stroke-dashoffset', 100 - 100 * current / (rates.length - 1));
    ticks.forEach((tick, i) => tick.classList.toggle('is-active', i <= current*2));
    icon.setAttribute('d', rate ? 'M23.8 24v4m4.4-4v4' : 'M24.2 22.9l4.8 3.1-4.8 3.1z');
    icon.classList.toggle('is-play', !rate);
    knob.setAttribute('aria-valuenow', String(rate));
    knob.setAttribute('aria-valuetext', rate ? rate + ' times normal speed' : 'Paused');
    // selectedIndex is also used for repeat selections after external updates.
    select.selectedIndex = current;
    select.options[current].selected = true;
    if (notify && current !== previous) onRateChange(rate);
  }
  function setRate(rate) {
    if (!Number.isFinite(rate)) return;
    let closest = 0;
    for (let i = 1; i < rates.length; i++) {
      if (Math.abs(rates[i]-rate) < Math.abs(rates[closest]-rate)) closest = i;
    }
    write(closest);
  }
  function pickAngle(dx, dy, first) {
    let angle = Math.atan2(dx, -dy) * 180 / Math.PI;
    // Crossing the unmarked lower sector while dragging should retain the
    // adjacent endpoint, just as a physical dial would stop at its limit.
    if (!first && Math.abs(angle) > -startAngle) return;
    angle = Math.max(startAngle, Math.min(-startAngle, angle));
    write(Math.round((angle - startAngle) * (rates.length - 1) / arc), true);
  }
  knob.addEventListener('pointerdown', event => {
    if (drag || (event.button !== undefined && event.button !== 0)) return;
    event.preventDefault();
    knob.focus({preventScroll:true});
    const box = knob.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const dx = event.clientX - cx, dy = event.clientY - cy;
    drag = {id:event.pointerId, cx, cy, x:event.clientX, y:event.clientY,
      center:Math.hypot(dx,dy) < Math.min(box.width,box.height)*.145, moved:false, start:current};
    knob.classList.add('is-dragging');
    knob.setPointerCapture?.(event.pointerId);
    if (!drag.center) pickAngle(dx, dy, true);
  });
  knob.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx,dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.center) write(drag.start + Math.round((dx - dy) / 10), true);
    else pickAngle(event.clientX - drag.cx, event.clientY - drag.cy, false);
  });
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const toggle = event.type === 'pointerup' && drag.center && !drag.moved;
    drag = null;
    knob.classList.remove('is-dragging');
    if (knob.hasPointerCapture?.(event.pointerId)) knob.releasePointerCapture(event.pointerId);
    if (toggle) write(current ? 0 : lastMoving, true);
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) knob.addEventListener(type, endDrag);
  knob.addEventListener('keydown', event => {
    switch (event.key) {
      case 'ArrowRight': case 'ArrowUp': write(current + 1, true); break;
      case 'ArrowLeft': case 'ArrowDown': write(current - 1, true); break;
      case 'Home': write(0, true); break;
      case 'End': write(rates.length-1, true); break;
      case ' ': case 'Enter': write(current ? 0 : lastMoving, true); break;
      default: return;
    }
    event.preventDefault();
  });
  select.addEventListener('change', () => write(rates.indexOf(Number(select.value)), true));
  write(current);
  return { setRate };
}
