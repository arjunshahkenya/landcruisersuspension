import test from 'node:test';
import assert from 'node:assert/strict';
import { getVehicle, VEHICLES } from '../vehicle-specs.js';
import { DEFAULTS, GEOMETRY, LIMITS, roadHeight, sampleAt, simulate } from '../sim-physics.js';

const g = 9.80665;
const standard = simulate();
function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} within ${tolerance} of ${expected}`);
}

test('stationary and flat-road runs have no dynamic response under different loads', () => {
  for (const settings of [
    { speed: 0, weight: 3500, stiffness: 20 },
    { bumpHeight: 0, weight: 1820, speed: 100, stiffness: 85 }
  ]) {
    const run = simulate(settings);
    for (const s of run.samples) {
      assert.equal(s.heave, 0); assert.equal(s.dynamicPitch, 0);
      assert.equal(s.frontTravel, 0); assert.equal(s.rearTravel, 0); assert.equal(s.accel, 0);
      assert.equal(s.frontContact, true); assert.equal(s.rearContact, true);
      near(s.frontNormal + s.rearNormal, run.settings.weight * g);
    }
    assert.ok(Object.values(run.stats).every(x => x === 0));
    if (!run.settings.speed) {
      assert.ok(Object.values(run.events).every(t => t === null));
      assert.equal(run.samples[0].x, run.samples.at(-1).x);
    }
  }
});

test('changing mass and wheel rate creates the corresponding static ride-height change', () => {
  const light = simulate({ speed: 0, weight: 2000 });
  const heavy = simulate({ speed: 0, weight: 3000 });
  const soft = simulate({ speed: 0, stiffness: 27 });
  const firm = simulate({ speed: 0, stiffness: 72 });
  near(standard.static.body, 0);
  near(standard.static.pitch, 0);
  assert.ok(light.static.body > standard.static.body && heavy.static.body < standard.static.body);
  assert.ok(soft.static.body < standard.static.body && firm.static.body > standard.static.body);
  assert.ok(heavy.static.frontTireDeflection > light.static.frontTireDeflection);
  near(soft.static.frontTireDeflection, firm.static.frontTireDeflection);
  for (const run of [light, heavy, soft, firm]) {
    const { frontArm, rearArm } = GEOMETRY;
    const s = run.static;
    near(s.frontWheel - s.body - frontArm*Math.sin(s.pitch), s.frontTravel);
    near(s.rearWheel - s.body + rearArm*Math.sin(s.pitch), s.rearTravel);
  }
});

test('raised-cosine road reaches the selected height and reaches each axle one wheelbase apart', () => {
  const { events, settings } = standard, speed = settings.speed / 3.6;
  near(events.rearEnter - events.frontEnter, GEOMETRY.wheelbase / speed);
  near(events.frontExit - events.frontEnter, settings.bumpWidth / speed);
  assert.equal(roadHeight(-1, settings), 0); assert.equal(roadHeight(settings.bumpWidth, settings), 0);
  near(roadHeight(settings.bumpWidth * .5, settings), settings.bumpHeight / 1000);
  const frontTop = sampleAt(standard, (events.frontEnter + events.frontExit) / 2);
  const rearTop = sampleAt(standard, (events.rearEnter + events.rearExit) / 2);
  near(frontTop.frontRoad, .085, 1e-8); near(rearTop.rearRoad, .085, 1e-8);
  assert.equal(frontTop.rearRoad, 0);
  const before = sampleAt(standard, events.frontEnter - .02);
  assert.equal(before.heave, 0); assert.equal(before.dynamicPitch, 0);
  assert.ok(frontTop.dynamicPitch > 0);
  const last = standard.samples.at(-1);
  assert.ok(Math.abs(last.heave) < .001 && Math.abs(last.dynamicPitch) < .001);
});

test('vertical and pitch momentum agree with integrated external road forces', () => {
  const { samples, settings, geometry, static: baseline } = standard;
  const frontMass = 120, rearMass = 160, sprung = settings.weight - frontMass - rearMass;
  const { frontArm: a, rearArm: b } = geometry, inertia = sprung * 1.3 ** 2;
  let verticalImpulse = 0, angularImpulse = 0, translationError = 0, rotationError = 0;
  let peakMomentum = 0, peakAngularMomentum = 0;
  for (let i = 1; i < samples.length; i++) {
    const p = samples[i-1], s = samples[i], dt = s.t - p.t;
    const f = .5*(p.frontNormal + s.frontNormal) - baseline.frontNormal;
    const r = .5*(p.rearNormal + s.rearNormal) - baseline.rearNormal;
    verticalImpulse += (f + r)*dt;
    const axleMomentum = k => a*frontMass*k.frontWheelVelocity - b*rearMass*k.rearWheelVelocity;
    const torque = k => Math.cos(k.pitch) * (a*(k.frontNormal-baseline.frontNormal) - b*(k.rearNormal-baseline.rearNormal))
      - Math.sin(k.pitch)*k.pitchVelocity*axleMomentum(k);
    angularImpulse += .5*(torque(p) + torque(s))*dt;
    const momentum = sprung*s.bodyVelocity + frontMass*s.frontWheelVelocity + rearMass*s.rearWheelVelocity;
    const angular = inertia*s.pitchVelocity + Math.cos(s.pitch)*axleMomentum(s);
    translationError = Math.max(translationError, Math.abs(momentum - verticalImpulse));
    rotationError = Math.max(rotationError, Math.abs(angular - angularImpulse));
    peakMomentum = Math.max(peakMomentum, Math.abs(momentum));
    peakAngularMomentum = Math.max(peakAngularMomentum, Math.abs(angular));
  }
  assert.ok(translationError < .002 * peakMomentum);
  assert.ok(rotationError < .002 * peakAngularMomentum);
});

test('extreme narrow bumps can lift a wheel and contact never exerts tension', () => {
  const run = simulate({ speed: 100, bumpHeight: 200, bumpWidth: .4, stiffness: 85, weight: 1800 });
  assert.ok(run.stats.frontAirTime > 0 && run.stats.rearAirTime > 0);
  for (const s of run.samples) {
    assert.ok(s.frontNormal >= 0 && s.rearNormal >= 0);
    assert.equal(s.frontContact, s.frontNormal > 0);
    assert.equal(s.rearContact, s.rearNormal > 0);
  }
  assert.ok(run.samples.at(-1).frontContact && run.samples.at(-1).rearContact);
});

test('the final jounce stop protects the loaded linkage and coil on short, severe obstacles', () => {
  for (const speed of [35, 55, 75, 100]) {
    const r = simulate({ speed, weight: 3500, stiffness: 20, bumpHeight: 200, bumpWidth: .4 });
    const frontJounce = r.static.frontTravel + Math.max(...r.samples.map(s => s.frontTravel));
    const rearJounce = r.static.rearTravel + Math.max(...r.samples.map(s => s.rearTravel));
    assert.ok(frontJounce < .185, `Front jounce reached ${frontJounce} m`);
    assert.ok(rearJounce < .215, `Rear jounce reached ${rearJounce} m`);
  }
});

test('finite tire radius resolves an extreme short obstacle before the front hub reaches it', () => {
  const run = simulate({ speed: 10, weight: 3500, stiffness: 20, bumpHeight: 200, bumpWidth: .4 });
  const earlier = run.samples.filter(s => s.x < -.04);
  assert.ok(earlier.every(s => s.frontRoad === 0));
  assert.ok(earlier.some(s => s.frontWheel - run.static.frontWheel > .006));
  assert.ok(run.stats.peakPitch < 16 * Math.PI / 180);
  assert.ok(run.stats.maxBodyRise < .45);
  assert.ok(run.samples.every(s => s.frontNormal >= 0 && s.rearNormal >= 0));
});

test('slow broad obstacle approaches a quasi-static body response', () => {
  const run = simulate({ speed: 1, bumpHeight: 200, bumpWidth: 6, weight: 3500, stiffness: 20 });
  assert.ok(run.stats.maxBodyRise > .1);
  assert.ok(run.stats.peakAccel < .025);
  assert.ok(run.stats.peakTravel < .001);
  assert.ok(run.stats.frontAirTime === 0 && run.stats.rearAirTime === 0);
  assert.ok(run.samples.every(s => Object.values(s).every(v => typeof v !== 'number' || Number.isFinite(v))));
});

test('sampling is repeatable, bounds time and handles interpolated states', () => {
  const repeated = simulate({ ...DEFAULTS });
  assert.deepEqual(repeated.stats, standard.stats);
  assert.deepEqual(repeated.samples[212], standard.samples[212]);
  assert.strictEqual(sampleAt(standard, -10), standard.samples[0]);
  assert.strictEqual(sampleAt(standard, Infinity), standard.samples.at(-1));
  const i = Math.floor(standard.events.frontEnter*standard.sampleHz)+12, first = standard.samples[i], second = standard.samples[i+1];
  const middle = sampleAt(standard, (first.t + second.t) / 2);
  near(middle.body, (first.body + second.body) / 2);
  near(middle.frontRoad, roadHeight(middle.x, standard.settings));
  assert.ok(standard.stats.peakAccel >= Math.max(...standard.samples.map(s => Math.abs(s.accel))));
  assert.ok(standard.stats.maxBodyRise >= Math.max(...standard.samples.map(s => s.heave)));
});

test('invalid or out-of-range controls produce a finite bounded run', () => {
  const run = simulate({ speed: -.2, bumpWidth: Infinity, stiffness: 900, weight: null, bumpHeight: -1 });
  assert.equal(run.settings.speed, 0);
  assert.equal(run.settings.bumpWidth, DEFAULTS.bumpWidth);
  assert.equal(run.settings.stiffness, LIMITS.stiffness.max);
  assert.equal(run.settings.weight, DEFAULTS.weight);
  assert.equal(run.settings.bumpHeight, 0);
  assert.equal(simulate({ speed: .00001 }).settings.speed, 1);
});

test('vehicle-specific geometry, static axle loads, spring balance and bump timing agree', () => {
  const accelerations=[];
  for(const spec of Object.values(VEHICLES)){
    const r=simulate({vehicle:spec.id}),s=r.static,v=r.settings.speed/3.6;
    assert.strictEqual(r.vehicle,spec);
    assert.deepEqual(r.settings,spec.defaults);
    assert.equal(r.termination,null);
    near(s.body,0); near(s.pitch,0);
    near(s.frontNormal+s.rearNormal,spec.referenceMass*g);
    const sprung=spec.referenceMass-spec.front.unsprungMass-spec.rear.unsprungMass;
    near(s.frontNormal,(sprung*spec.sprungFrontFraction+spec.front.unsprungMass)*g);
    near(s.frontSpringCompression,sprung*g*spec.sprungFrontFraction/(2000*spec.front.wheelRate));
    near(r.events.rearEnter-r.events.frontEnter,spec.geometry.wheelbase/v);
    near(r.events.frontEnter,.85);
    assert.ok(-r.startX>spec.underside[0][0]+spec.geometry.frontWheelRadius);
    near(s.frontTireDeflection,s.frontNormal/(2000*spec.front.tireRate));
    near(s.rearTireDeflection,s.rearNormal/(2000*spec.rear.tireRate));
    near(sampleAt(r,(r.events.rearEnter+r.events.rearExit)/2).rearRoad,.085);
    accelerations.push(r.stats.peakAccel);
  }
  assert.equal(new Set(accelerations.map(a=>a.toFixed(2))).size,4);
  assert.strictEqual(simulate({vehicle:'missing'}).vehicle,getVehicle('landcruiser'));
});

test('gravel crest can unload tires and the modeled vehicle lands and settles', () => {
  for(const spec of Object.values(VEHICLES)){
    const r=simulate({...spec.defaults,speed:spec.id==='landcruiser'?60:65,
      bumpHeight:spec.id==='landcruiser'?160:120,bumpWidth:4});
    assert.ok(r.stats.frontAirTime>.02 && r.stats.rearAirTime>.02);
    assert.equal(r.termination,null);
    const last=r.samples.at(-1);
    assert.ok(last.frontContact && last.rearContact && Math.abs(last.heave)<.0015);
  }
});

test('solid one-metre obstacle stops the run at first body contact, including before a wheel reaches it',()=>{
  for(const spec of Object.values(VEHICLES)){
    const r=simulate({vehicle:spec.id,speed:spec.limits.speed.max,bumpWidth:.4,bumpHeight:1000});
    assert.equal(r.termination.reason,'body-strike');
    assert.ok(r.duration<r.events.frontEnter);
    assert.ok(r.termination.time>0);
    near(r.termination.time,r.duration); near(r.samples.at(-1).t,r.duration);
    near(sampleAt(r,Infinity).x,sampleAt(r,r.duration).x);
    near(r.stats.maxBodyRise,0);
  }
});

test('maximum width and height with minimum and maximum load keep motion finite across vehicle envelopes',()=>{
  for(const spec of Object.values(VEHICLES))for(const end of ['max','min']){
    const lim=spec.limits;
    const r=simulate({vehicle:spec.id,speed:lim.speed.max,bumpWidth:lim.bumpWidth.max,
      bumpHeight:lim.bumpHeight.max,stiffness:lim.stiffness[end],weight:lim.weight[end]});
    for(const s of r.samples){
      assert.ok(Object.values(s).every(v=>typeof v!=='number'||Number.isFinite(v)));
      assert.ok(s.frontNormal>=0 && s.rearNormal>=0);
    }
    assert.ok(r.stats.peakPitch<.80 && r.stats.maxBodyRise<15);
    assert.ok(r.duration<=r.events.rearExit+10);
  }
});
