import { LIMITS } from './sim-physics.js';

const parameters = [
  { key: 'speed', label: 'Speed', unit: 'km/h', spokenUnit: 'kilometres per hour' },
  { key: 'bumpHeight', label: 'Bump height', unit: 'mm', spokenUnit: 'millimetres' },
  { key: 'bumpWidth', label: 'Bump width', unit: 'm', spokenUnit: 'metres', note: 'Along direction of travel' },
  { key: 'stiffness', label: 'Suspension stiffness', unit: 'kN/m', spokenUnit: 'kilonewtons per metre', note: 'Per wheel' },
  { key: 'weight', label: 'Vehicle weight', unit: 'kg', spokenUnit: 'kilograms', note: 'Total vehicle mass' },
];

let nextId = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function resetIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M3.1 5.9v3.9h3.8M3.3 9.3a6.4 6.4 0 1 1 1.6 5.0');
  svg.append(path);
  return svg;
}

// Store the same physical settings that the solver accepts. Rounding here
// also prevents values such as 1.8000000000000003 appearing in the UI.
function normalize(value, {min, max, step}) {
  const bounded = Math.max(min, Math.min(max, value));
  return Number((min + Math.round((bounded - min) / step) * step).toFixed(6));
}

export function createControls(container, defaults, onChange, {limits: ranges=LIMITS, current=defaults}={}) {
  const values = {}, initial = {}, fields = new Map();
  const id = 'suspension-setup-' + ++nextId;
  const panel = element('section', 'susp-controls');
  const header = element('div', 'susp-controls__header');
  const heading = element('h2', 'susp-controls__title', 'Test setup');
  heading.id = id;
  panel.setAttribute('aria-labelledby', id);

  const resetButton = element('button', 'susp-controls__reset');
  resetButton.type = 'button';
  resetButton.append(resetIcon(), document.createTextNode('Reset to defaults'));
  header.append(heading, resetButton);
  const grid = element('div', 'susp-controls__grid');
  panel.append(header, grid);

  function refreshReset() {
    resetButton.disabled = parameters.every(({key}) => values[key] === initial[key]);
  }

  function display(key, rewriteNumber = true) {
    const { slider, number, row, spokenUnit, note } = fields.get(key);
    const { min, max } = ranges[key];
    const value = values[key];
    const percent = (value - min) * 100 / (max - min);
    row.style.setProperty('--susp-progress', percent + '%');
    slider.value = String(value);
    slider.setAttribute('aria-valuetext', value + ' ' + spokenUnit + (note ? ', ' + note.toLowerCase() : ''));
    if (rewriteNumber) number.value = String(value);
    number.removeAttribute('aria-invalid');
  }

  function setValue(key, value, rewriteNumber) {
    const changed = values[key] !== value;
    values[key] = value;
    display(key, rewriteNumber);
    refreshReset();
    if (changed) onChange({ ...values });
  }

  function reset() {
    for (const {key} of parameters) {
      values[key] = initial[key];
      display(key);
    }
    refreshReset();
    onChange({ ...values });
  }

  for (const {key, label, unit, spokenUnit, note} of parameters) {
    const limits = ranges[key];
    initial[key] = normalize(defaults[key], limits);
    values[key] = normalize(current[key], limits);
    const row = element('div', 'susp-controls__field');
    row.dataset.setting = key;
    const labelRow = element('div', 'susp-controls__label-row');

    const title = element('label', 'susp-controls__label', label);
    const sliderId = id + '-' + key;
    title.setAttribute('for', sliderId);
    const readout = element('div', 'susp-controls__readout');
    const number = element('input', 'susp-controls__number');
    number.type = 'number';
    number.inputMode = Number.isInteger(limits.step) ? 'numeric' : 'decimal';
    number.id = id + '-' + key + '-value';
    number.setAttribute('aria-label', label + ' in ' + spokenUnit);
    number.autocomplete = 'off';
    const suffix = element('span', 'susp-controls__unit', unit);
    suffix.setAttribute('aria-hidden', 'true');
    readout.append(number, suffix);
    labelRow.append(title, readout);

    const slider = element('input', 'susp-controls__slider');
    slider.type = 'range';
    slider.id = sliderId;
    for (const input of [slider, number]) {
      input.setAttribute('min', String(limits.min));
      input.setAttribute('max', String(limits.max));
      input.setAttribute('step', String(limits.step));
    }
    const scale = element('div', 'susp-controls__scale');
    const low = element('span', '', String(limits.min));
    const high = element('span', '', String(limits.max));
    low.setAttribute('aria-hidden', 'true');
    high.setAttribute('aria-hidden', 'true');
    scale.append(low);
    if (note) {
      const help = element('small', 'susp-controls__note', note);
      help.id = id + '-' + key + '-note';
      number.setAttribute('aria-describedby', help.id);
      scale.append(help);
    }
    scale.append(high);
    row.append(labelRow, slider, scale);
    grid.append(row);

    fields.set(key, {slider, number, row, spokenUnit, note});
    display(key);
    slider.addEventListener('input', () => setValue(key, Number(slider.value), true));

    let beforeEdit = values[key];
    const typedNumber = () => number.value.trim() === '' ? NaN : Number(number.value);
    number.addEventListener('focus', () => { beforeEdit = values[key]; });
    number.addEventListener('input', () => {
      // Leave partial drafts alone. The user can type 2370 or 1.8 naturally
      // without the first digit snapping to the lower bound.
      const value = typedNumber();
      if (!Number.isFinite(value)) {
        number.removeAttribute('aria-invalid');
        return;
      }
      if (value < limits.min || value > limits.max || Math.abs(value - normalize(value, limits)) > 1e-7) {
        number.setAttribute('aria-invalid', 'true');
        return;
      }
      setValue(key, normalize(value, limits), false);
    });
    number.addEventListener('blur', () => {
      const typed = typedNumber();
      setValue(key, Number.isFinite(typed) ? normalize(typed, limits) : values[key], true);
    });
    number.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        number.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setValue(key, beforeEdit, true);
        number.blur();
      }
    });
  }
  resetButton.addEventListener('click', reset);
  refreshReset();
  container.replaceChildren(panel);
  return { reset, getSettings: () => ({ ...values }) };
}
