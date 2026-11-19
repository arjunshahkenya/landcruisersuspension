import { getVehicle, VEHICLES } from './vehicle-specs.js';

const labels = {
  landcruiser:{make:'Toyota',variant:'100 Series',card:'Land Cruiser V8',type:'100 Series · 4×4',swatch:'#2b5951'},
  porsche:{make:'Porsche',variant:'992.2 Carrera',card:'911 Carrera',type:'992.2 · Road',swatch:'#c52625'},
  rally:{make:'Toyota',variant:'2025 Rally1',card:'GR Yaris Rally1',type:'2025 · Stage rally',swatch:'#b33a3b'},
  dakar:{make:'IVECO',variant:'Team De Rooy · 2013',card:'Powerstar 4×4',type:'2013 · Dakar truck',swatch:'#407562'},
};

export function vehicleFromLocation() {
  return getVehicle(new URL(location.href).searchParams.get('vehicle'));
}

function withVehicle(url, id) {
  if (id === 'landcruiser') url.searchParams.delete('vehicle');
  else url.searchParams.set('vehicle', id);
  return url;
}

export function setupVehiclePicker(spec) {
  const nav = document.getElementById('vehicle-picker');
  const cards = [];
  for (const id of Object.keys(VEHICLES)) {
    const label = labels[id];
    const a = document.createElement('a');
    a.className = 'vehicle-card';
    a.style.setProperty('--vehicle-colour', label.swatch);
    if (id === spec.id) a.setAttribute('aria-current', 'true');
    const name = document.createElement('strong');
    const detail = document.createElement('small');
    name.textContent = label.card;
    detail.textContent = label.type;
    a.append(name, detail);
    nav.append(a);
    cards.push([id, a]);
  }
  // Carry shared road inputs between vehicles. Weight and tuning belong to
  // the chosen car. Preserve a camera preset when both vehicles support it.
  function updateLinks() {
    const here = new URL(location.href);
    for (const [id, a] of cards) {
      const url = withVehicle(new URL(here), id);
      if (id !== spec.id) for (const key of ['weight','stiffness','detail']) url.searchParams.delete(key);
      a.href = url.href;
    }
    for (const link of document.querySelectorAll('.studio-nav a, a.wordmark')) {
      const url = withVehicle(new URL(link.getAttribute('href'), location.href), spec.id);
      link.href = url.href;
    }
  }
  updateLinks();
  return {label:labels[spec.id], updateLinks};
}
