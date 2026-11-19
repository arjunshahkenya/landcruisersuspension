// Vertical half-car model. Each axle represents both wheels, so suspension and
// tire forces are axle totals. Motion is measured upward; nose-up pitch is positive.
import { getVehicle } from './vehicle-specs.js';
const landCruiser=getVehicle();
export const DEFAULTS=landCruiser.defaults, LIMITS=landCruiser.limits, GEOMETRY=landCruiser.geometry;
const gravity=9.80665, stepSeconds=1/1200, outputStride=5;
const sampleHz=Math.round(1/stepSeconds/outputStride), twoPi=2*Math.PI;

function axle(spec, tune, fraction) {
  const nominalSprung=spec.referenceMass-spec.front.unsprungMass-spec.rear.unsprungMass;
  const nominalLoad=nominalSprung*fraction*gravity;
  const nominalSpring=nominalLoad/(2000*tune.wheelRate);
  const tireRate=2000*tune.tireRate;
  return {
    ...tune, fraction, nominalSpring, tireRate, stopScale:spec.stopScale,
    bumpStop:nominalSpring+tune.bump, reboundStop:nominalSpring-tune.droop,
    finalJounce:nominalSpring+tune.jounce,
    nominalTire:(nominalLoad+tune.unsprungMass*gravity)/tireRate
  };
}

function normalize(settings,spec) {
  const clean = {vehicle:spec.id};
  for (const key of Object.keys(spec.limits)) {
    const value = settings?.[key];
    const n = value === null || value === '' ? NaN : Number(value);
    const { min, max } = spec.limits[key];
    clean[key] = Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : spec.defaults[key];
  }
  // A stopped run is distinct from driving. The smallest moving control step is 1 km/h.
  if (clean.speed > 0 && clean.speed < 1) clean.speed = 1;
  return clean;
}

// Both ends meet the flat road with zero slope. X is measured from the start of the bump.
export function roadHeight(x, settings = DEFAULTS) {
  const w = settings.bumpWidth ?? DEFAULTS.bumpWidth;
  if (!(x > 0 && x < w)) return 0;
  return (settings.bumpHeight ?? DEFAULTS.bumpHeight) * .0005 * (1 - Math.cos(twoPi * x / w));
}

// The hub of a rolling tire follows the upper envelope of the obstacle and
// its circular tread. A point follower would inject the full slope of a short
// obstacle at the axle center and can grossly overpredict the impact impulse.
function rollingRoad(settings, tireDeflection, radius) {
  const height = settings.bumpHeight / 1000, width = settings.bumpWidth;
  const dx = .003;
  const patch = .70 * Math.sqrt(2 * radius * tireDeflection - tireDeflection ** 2);
  const padding = Math.ceil((radius + patch) / dx) + 2;
  const count = 2 * padding + Math.ceil(width / dx) + 1;
  const envelope = new Float64Array(count);
  const raw = new Float64Array(count);
  const begin = padding, end = padding + Math.ceil(width / dx);
  for (let j = begin; j <= end; j++) raw[j] = roadHeight((j - padding) * dx, settings);
  // Beyond this contact angle even the obstacle crest sits below the free tire.
  // A crest taller than the tire radius can touch its forward-most point.
  // The common low-obstacle reach formula only holds for height < radius.
  const rise=Math.min(height,radius);
  const reach = Math.floor(Math.sqrt(2*radius*rise-rise*rise) / dx);
  for (let shift = -reach; shift <= reach; shift++) {
    const x = shift * dx;
    const arc = Math.sqrt(radius * radius - x * x) - radius;
    for (let j = begin; j <= end; j++) {
      const dest = j - shift;
      envelope[dest] = Math.max(envelope[dest], raw[j] + arc);
    }
  }
  // A distributed contact patch smooths the transition onto the leading face.
  // The cosine pressure weight has zero load at either end of the footprint.
  const filtered = new Float64Array(count);
  const halfCells = Math.max(1, Math.ceil(patch / dx));
  let weightSum = 0;
  for (let offset = -halfCells; offset <= halfCells; offset++) {
    const weight = .5 + .5 * Math.cos(Math.PI * offset / halfCells);
    weightSum += weight;
    for (let j = Math.max(0, -offset); j < Math.min(count, count-offset); j++) {
      filtered[j] += weight * envelope[j+offset];
    }
  }
  for (let j = 0; j < count; j++) filtered[j] /= weightSum;
  const slope = new Float64Array(count);
  for (let j = 1; j < count-1; j++) slope[j] = (filtered[j+1]-filtered[j-1]) / (2*dx);
  return { filtered, slope, padding, dx };
}

function rollingInput(profile, x, out) {
  if (!profile) { out[0] = 0; out[1] = 0; return; }
  const pos = x / profile.dx + profile.padding;
  if (pos < 0 || pos >= profile.filtered.length - 1) { out[0] = 0; out[1] = 0; return; }
  const i = Math.floor(pos), s = pos-i;
  out[0] = profile.filtered[i]*(1-s) + profile.filtered[i+1]*s;
  out[1] = profile.slope[i]*(1-s) + profile.slope[i+1]*s;
}

function springForce(compression, rate, geometry) {
  const bump = Math.max(0, compression - geometry.bumpStop);
  const rebound = Math.max(0, geometry.reboundStop - compression);
  const end = Math.max(0, compression - geometry.finalJounce);
  // The initial rubber bumper engages progressively. Its near-solid region
  // rises steeply before the rear coil binds or the front arm reaches the frame.
  // A quadratic onset keeps force and its first derivative continuous there.
  return rate * Math.max(0, compression)
    + geometry.stopScale*(bump*(85000+7000000*bump) + 2e8*end*end
    - rebound*(115000+6500000*rebound));
}

function springDamper(compression, velocity, rate, geometry) {
  // Slower reversal is more heavily damped; digressive valving reduces the
  // damping coefficient on a fast stroke. Both terms always dissipate energy.
  const lowSpeedRate = velocity > 0 ? geometry.compressionDamping : geometry.reboundDamping;
  const damping = lowSpeedRate * (.48 + .52 / (1 + Math.abs(velocity) / .58));
  const stop = velocity >= 0 ? compression - geometry.bumpStop : geometry.reboundStop - compression;
  const stopDamping = Math.min(1, Math.max(0, stop / .024)) * 3900 * geometry.stopScale;
  const crush = Math.max(0, Math.min(1, (compression - geometry.finalJounce) / .025));
  const crushDamping = velocity > 0 ? 23000 * crush * geometry.stopScale : 0;
  return springForce(compression, rate, geometry) + (damping + stopDamping + crushDamping) * velocity;
}

function equilibrium(sprungMass, rate, geometry) {
  const load = sprungMass * geometry.fraction * gravity;
  let spring = load / rate;
  if (spring < geometry.reboundStop || spring > geometry.bumpStop) {
    let lo = -.3, hi = 1;
    for (let i = 0; i < 54; i++) {
      const mid = (lo + hi) * .5;
      if (springForce(mid, rate, geometry) > load) hi = mid;
      else lo = mid;
    }
    spring = (lo + hi) * .5;
  }
  const normal = load + geometry.unsprungMass * gravity;
  const tire = normal / geometry.tireRate;
  const wheelOffset = geometry.nominalTire - tire;
  const springOffset = spring - geometry.nominalSpring;
  return {
    spring, normal, tire, wheelOffset, springOffset,
    bodyOffset: wheelOffset - springOffset,
    force: springForce(spring, rate, geometry)
  };
}

function tireNormal(deflection, compressionVelocity, axle) {
  if (deflection <= 0) return 0;
  const deep = Math.max(0, deflection - axle.tireCrush);
  // The tire cannot pull down on the road. Carcass stiffness climbs at
  // deep compression, before a large sharp obstacle can reach the rim.
  return Math.max(0, axle.tireRate * (deflection + (2e7/496000)*deep*deep) + axle.tireDamping * compressionVelocity);
}

function eventTimes(startX, speed, width, wheelbase) {
  if (!speed) return { frontEnter: null, frontExit: null, rearEnter: null, rearExit: null };
  return {
    frontEnter: -startX / speed, frontExit: (width - startX) / speed,
    rearEnter: (wheelbase - startX) / speed, rearExit: (wheelbase + width - startX) / speed
  };
}

// Find first contact between the solid road and the estimated underside. A
// rotating line segment can touch the hump between its endpoints, especially
// at the crest of a narrow bump. Test the exact tangent on the raised cosine.
function chassisStrike(vehicle,settings,x,body,pitch){
  const {frontArm,cgHeight}=vehicle.geometry;
  const width=settings.bumpWidth, height=settings.bumpHeight*.001;
  const sn=Math.sin(pitch), cs=Math.cos(pitch);
  let lastX,lastY;
  for(const [offset,clearance] of vehicle.underside){
    const z=frontArm+offset, y=clearance-cgHeight;
    const wx=x-frontArm+z*cs-y*sn, wy=cgHeight+body+z*sn+y*cs;
    if(wy<=roadHeight(wx,settings))return true;
    if(lastX!==undefined && Math.max(wx,lastX)>0 && Math.min(wx,lastX)<width && Math.min(wy,lastY)<=height){
      const gradient=(wy-lastY)/(wx-lastX),scaled=gradient*width/(Math.PI*height);
      if(Math.abs(scaled)<=1){
        const tangent=width*(Math.PI-Math.asin(scaled))/twoPi;
        if(tangent>Math.min(wx,lastX)&&tangent<Math.max(wx,lastX) &&
           lastY+gradient*(tangent-lastX)<=roadHeight(tangent,settings))return true;
      }
    }
    lastX=wx;lastY=wy;
  }
  return false;
}

export function simulate(options = DEFAULTS) {
  const vehicle=getVehicle(options?.vehicle);
  const settings=normalize(options,vehicle),speed=settings.speed/3.6;
  const geometry=vehicle.geometry,{frontArm,rearArm,wheelbase}=geometry;
  const front=axle(vehicle,vehicle.front,vehicle.sprungFrontFraction);
  const rear=axle(vehicle,vehicle.rear,1-vehicle.sprungFrontFraction);
  const unsprungFront=front.unsprungMass,unsprungRear=rear.unsprungMass;
  const sprungMass=settings.weight-unsprungFront-unsprungRear;
  const nominalSprungMass=vehicle.referenceMass-unsprungFront-unsprungRear;
  const pitchInertia=sprungMass*vehicle.pitchGyration**2;
  const rateScale=settings.stiffness/vehicle.defaults.stiffness;
  const frontRate=2000*front.wheelRate*rateScale,rearRate=2000*rear.wheelRate*rateScale;
  const f=equilibrium(sprungMass,frontRate,front),r=equilibrium(sprungMass,rearRate,rear);
  const baseline = {
    body: (rearArm * f.bodyOffset + frontArm * r.bodyOffset) / wheelbase,
    pitch: Math.asin((f.bodyOffset - r.bodyOffset) / wheelbase),
    frontWheel: f.wheelOffset, rearWheel: r.wheelOffset,
    frontTravel: f.springOffset, rearTravel: r.springOffset,
    frontSpringCompression: f.spring, rearSpringCompression: r.spring,
    frontTireDeflection: f.tire, rearTireDeflection: r.tire,
    nominalFrontTireDeflection: front.nominalTire, nominalRearTireDeflection: rear.nominalTire,
    frontNormal: f.normal, rearNormal: r.normal
  };
  // Leave time to see the approach even at high speed. At walking pace
  // start with the bumper and tire envelope clear of the obstacle.
  const lead=vehicle.underside[0][0]+geometry.frontWheelRadius+.40;
  const startX = -Math.max(lead,Math.min(75,speed*.85));
  const events = eventTimes(startX,speed,settings.bumpWidth,wheelbase);
  // Round upward to an output time; the sampling grid also contains the final frame.
  const settlingTime = 3.8 * Math.max(1, Math.sqrt((sprungMass / nominalSprungMass) * (vehicle.defaults.stiffness / settings.stiffness)));
  const sampleCount = Math.ceil((speed ? events.rearExit + settlingTime : 4) * sampleHz);
  let duration=sampleCount/sampleHz,termination=null;
  const samples = [];
  const stats = {
    maxBodyRise: 0, peakHeave: 0, peakPitch: 0, peakAccel: 0, peakFrontTravel: 0,
    peakRearTravel: 0, peakTravel: 0, frontAirTime: 0, rearAirTime: 0
  };
  const noExcitation = speed === 0 || settings.bumpHeight === 0;
  const profiles = noExcitation ? [null, null] : [rollingRoad(settings,f.tire,geometry.frontWheelRadius),rollingRoad(settings,r.tire,geometry.rearWheelRadius)];
  const frontInput = [0, 0], rearInput = [0, 0];
  const staticSine = Math.sin(baseline.pitch);

  // State coordinates are increments from this run's exact loaded equilibrium:
  // body CG height, body pitch, front hub height and rear hub height, then velocities.
  const state = new Float64Array(8), scratch = new Float64Array(8);
  const k1 = new Float64Array(8), k2 = new Float64Array(8), k3 = new Float64Array(8), k4 = new Float64Array(8);
  const diagnostic = {};
  function evaluate(time, s, d, report) {
    const x = startX + speed * time, xr = x - wheelbase;
    rollingInput(profiles[0], x, frontInput);
    rollingInput(profiles[1], xr, rearInput);
    const angle = baseline.pitch + s[1], lever = Math.cos(angle);
    const rotation = Math.sin(angle) - staticSine;
    // Vertical heights and moment arms come from the same rigid-body rotation.
    const frontTravel = s[2] - s[0] - frontArm * rotation;
    const rearTravel = s[3] - s[0] + rearArm * rotation;
    const frontTravelRate = s[6] - s[4] - frontArm * lever * s[5];
    const rearTravelRate = s[7] - s[4] + rearArm * lever * s[5];
    const deltaFront = springDamper(f.spring + frontTravel, frontTravelRate, frontRate, front) - f.force;
    const deltaRear = springDamper(r.spring + rearTravel, rearTravelRate, rearRate, rear) - r.force;
    // Radial tire compression and the vertical component of its reaction
    // both depend on the angle of the local effective road surface.
    const deflectionF=f.tire+frontInput[0]-s[2],deflectionR=r.tire+rearInput[0]-s[3];
    const nf = tireNormal(deflectionF, speed * frontInput[1] - s[6], front) / (1 + frontInput[1] ** 2);
    const nr = tireNormal(deflectionR, speed * rearInput[1] - s[7], rear) / (1 + rearInput[1] ** 2);
    // Static spring loads balance sprung gravity and static tire loads balance
    // both sprung and unsprung gravity. Subtracting those loads is the shifted
    // form of Newton's translation and pitch equations, including in free flight.
    d[0] = s[4]; d[1] = s[5]; d[2] = s[6]; d[3] = s[7];
    d[4] = (deltaFront + deltaRear) / sprungMass;
    d[5] = lever * (frontArm * deltaFront - rearArm * deltaRear) / pitchInertia;
    d[6] = (nf - f.normal - deltaFront) / unsprungFront;
    d[7] = (nr - r.normal - deltaRear) / unsprungRear;
    if (report) Object.assign(report, { x,nf,nr,frontTravel,rearTravel,
      radialFront:deflectionF/Math.sqrt(1+frontInput[1]**2), radialRear:deflectionR/Math.sqrt(1+rearInput[1]**2) });
  }

  const advance = noExcitation ? outputStride : 1;
  for (let step = 0; step <= sampleCount * outputStride; step += advance) {
    const t = step * stepSeconds;
    evaluate(t, state, k1, diagnostic);
    const { x, nf, nr, frontTravel, rearTravel } = diagnostic;
    stats.maxBodyRise = Math.max(stats.maxBodyRise, state[0]);
    stats.peakHeave = Math.max(stats.peakHeave, Math.abs(state[0]));
    stats.peakPitch = Math.max(stats.peakPitch, Math.abs(state[1]));
    stats.peakAccel = Math.max(stats.peakAccel, Math.abs(k1[4]));
    stats.peakFrontTravel = Math.max(stats.peakFrontTravel, Math.abs(frontTravel));
    stats.peakRearTravel = Math.max(stats.peakRearTravel, Math.abs(rearTravel));
    if(!noExcitation){
      let reason='',label='';
      if(chassisStrike(vehicle,settings,x,baseline.body+state[0],baseline.pitch+state[1])){
        reason='body-strike';label='The estimated underside has contacted the road.';
      }else if(diagnostic.radialFront>=vehicle.frontSidewall||diagnostic.radialRear>=vehicle.rearSidewall){
        reason='rim-strike';label='The tire has compressed to its estimated rim clearance.';
      }else if(f.spring+frontTravel>front.finalJounce+vehicle.bufferCrush || r.spring+rearTravel>rear.finalJounce+vehicle.bufferCrush){
        reason='travel-limit';label='The suspension has exhausted its modeled compression travel.';
      }else if(Math.abs(state[1])>Math.PI/4){
        reason='pitch-limit';label='Body pitch has exceeded the vertical ride model’s range.';
      }
      if(reason){termination={reason,label,time:t};duration=t;}
    }
    if (step % outputStride === 0 || termination) {
      samples.push({
        t, x, body: baseline.body + state[0], pitch: baseline.pitch + state[1],
        frontWheel: baseline.frontWheel + state[2], rearWheel: baseline.rearWheel + state[3],
        frontTravel, rearTravel, frontRoad: roadHeight(x, settings), rearRoad: roadHeight(x - wheelbase, settings), accel: k1[4],
        frontContact: nf > 0, rearContact: nr > 0, frontNormal: nf, rearNormal: nr,
        heave: state[0], dynamicPitch: state[1], bodyVelocity: state[4],
        pitchVelocity: state[5], frontWheelVelocity: state[6], rearWheelVelocity: state[7]
      });
    }
    if(termination)break;
    if (step === sampleCount * outputStride || noExcitation) continue;
    if (nf === 0) stats.frontAirTime += stepSeconds;
    if (nr === 0) stats.rearAirTime += stepSeconds;
    for (let j = 0; j < 8; j++) scratch[j] = state[j] + k1[j] * stepSeconds * .5;
    evaluate(t + stepSeconds * .5, scratch, k2);
    for (let j = 0; j < 8; j++) scratch[j] = state[j] + k2[j] * stepSeconds * .5;
    evaluate(t + stepSeconds * .5, scratch, k3);
    for (let j = 0; j < 8; j++) scratch[j] = state[j] + k3[j] * stepSeconds;
    evaluate(t + stepSeconds, scratch, k4);
    for (let j = 0; j < 8; j++) state[j] += stepSeconds / 6 * (k1[j] + 2*k2[j] + 2*k3[j] + k4[j]);
  }
  stats.peakTravel = Math.max(stats.peakFrontTravel, stats.peakRearTravel);
  return { settings, duration, samples, stats, static: baseline, events, startX, geometry, vehicle, termination, sampleHz };
}

export function sampleAt(run, time) {
  const t = Number(time);
  if (!(t > 0)) return run.samples[0];
  if (t >= run.duration) return run.samples.at(-1);
  const index = Math.min(run.samples.length - 2, Math.floor(t * run.sampleHz));
  const a = run.samples[index], b = run.samples[index + 1];
  const blend = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
  if (blend <= 1e-10) return a;
  if (blend >= 1 - 1e-10) return b;
  const sample = {};
  for (const key of Object.keys(a)) {
    sample[key] = typeof a[key] === 'number' ? a[key] + blend * (b[key] - a[key]) : (blend < .5 ? a[key] : b[key]);
  }
  // A zero/nonzero force and its contact flag always describe the same state.
  sample.frontContact = sample.frontNormal > 0;
  sample.rearContact = sample.rearNormal > 0;
  sample.frontRoad = roadHeight(sample.x, run.settings);
  sample.rearRoad = roadHeight(sample.x - run.geometry.wheelbase, run.settings);
  return sample;
}
