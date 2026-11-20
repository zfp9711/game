// 音频层：全部程序化生成，零素材。总线：master → music / sfx。
// 首次用户手势后解锁 AudioContext。

const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let noiseBuf = null;
  let beamGain = null;
  let droneGain = null;
  let pulseGain = null;
  let enabled = true;
  let unlocked = false;
  let silent = false;

  let tension = 0;
  let nextNote = 0;
  let nextPulse = 0;
  let lastHit = 0;
  let lastKill = 0;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    if (navigator.audioSession) {
      try {
        navigator.audioSession.type = 'playback';
      } catch (_) {
        /* 忽略 */
      }
    }
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = 0.5;
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.75;
    sfxBus.connect(master);

    noiseBuf = makeNoise(ctx, 1.2);
    startDrone();
    startBeam();
    nextNote = ctx.currentTime + 2.5;
    nextPulse = ctx.currentTime + 1;
  }

  function startDrone() {
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.0;
    droneGain.connect(musicBus);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    filter.connect(droneGain);

    const freqs = [
      [55, 0.05],
      [82.5, 0.028],
      [110, 0.02],
    ];
    for (const [f, g] of freqs) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(filter);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(droneGain.gain);
    lfo.start();
    droneGain.gain.setTargetAtTime(0.85, ctx.currentTime, 3);
  }

  function startBeam() {
    beamGain = ctx.createGain();
    beamGain.gain.value = 0;
    beamGain.connect(sfxBus);

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 780;
    bp.Q.value = 1.1;
    const g1 = ctx.createGain();
    g1.gain.value = 0.5;
    src.connect(bp).connect(g1).connect(beamGain);
    src.start();

    const saw = ctx.createOscillator();
    saw.type = 'sawtooth';
    saw.frequency.value = 116;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const g2 = ctx.createGain();
    g2.gain.value = 0.16;
    saw.connect(lp).connect(g2).connect(beamGain);
    saw.start();

    // 灯油越少，音高越紧
    const trem = ctx.createOscillator();
    trem.frequency.value = 7.2;
    const tg = ctx.createGain();
    tg.gain.value = 0.08;
    trem.connect(tg).connect(beamGain.gain);
    trem.start();
  }

  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
  }

  function setEnabled(on) {
    enabled = on;
    if (master && ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
  }

  function setSilent(on) {
    silent = on;
  }

  function setTension(level) {
    tension = level;
    if (!ctx || !unlocked) return;
    const now = ctx.currentTime;
    if (droneGain) droneGain.gain.setTargetAtTime(level >= 1 ? 0.95 : 0.55, now, 1.5);
  }

  function setFiring(on) {
    if (!ctx || !unlocked) return;
    const target = on ? 0.075 : 0;
    beamGain.gain.setTargetAtTime(target, ctx.currentTime, 0.045);
  }

  function update() {
    if (!ctx || !unlocked || !enabled) return;
    const now = ctx.currentTime;
    if (tension >= 1 && now >= nextNote) {
      const note = SCALE[Math.floor(Math.random() * SCALE.length)];
      bell(note, 0.045 + Math.random() * 0.02, 3.4);
      nextNote = now + 3.2 + Math.random() * 3.4;
    }
    if (tension >= 2 && now >= nextPulse) {
      thump(58, 0.055, 0.42);
      nextPulse = now + 1.9;
    }
  }

  function bell(freq, gain, decay) {
    const t0 = ctx.currentTime + 0.01;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.01;
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(musicBus);
    o.start(t0);
    o2.start(t0);
    o.stop(t0 + decay + 0.05);
    o2.stop(t0 + decay + 0.05);
  }

  function blip(freq, gain, dur, type = 'square') {
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noiseHit(dur, gain, freq, type = 'lowpass') {
    if (!noiseBuf) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.25), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function thump(freq, gain, dur) {
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function onEvents(events, state) {
    if (!ctx || !unlocked || !enabled || silent) return;
    const now = ctx.currentTime;
    for (const ev of events) {
      switch (ev.type) {
        case 'beamHit':
          if (now - lastHit > 0.055) {
            lastHit = now;
            blip(760 + Math.random() * 320, 0.018, 0.05, 'triangle');
          }
          break;
        case 'kill':
          if (now - lastKill > 0.04) {
            lastKill = now;
            noiseHit(0.16, 0.06, 1800);
            blip(300, 0.03, 0.12, 'triangle');
          }
          break;
        case 'ember':
          blip(1046, 0.028, 0.1, 'sine');
          blip(1568, 0.016, 0.12, 'sine');
          break;
        case 'dash':
          noiseHit(0.22, 0.09, 2600, 'bandpass');
          break;
        case 'playerHit':
          thump(150, 0.11, 0.28);
          noiseHit(0.18, 0.06, 700);
          break;
        case 'fireHit':
          thump(72, 0.14, 0.5);
          noiseHit(0.32, 0.07, 420);
          break;
        case 'fireConsume':
          noiseHit(0.14, 0.05, 1200);
          break;
        case 'waveStart':
          bell(196, 0.07, 4.2);
          bell(294, 0.035, 3);
          break;
        case 'waveClear':
          [523.25, 659.25, 783.99].forEach((f, i) => {
            const t0 = ctx.currentTime + i * 0.09;
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = f;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.045, t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
            o.connect(g).connect(sfxBus);
            o.start(t0);
            o.stop(t0 + 0.95);
          });
          break;
        case 'upgrade':
          blip(880, 0.03, 0.12, 'sine');
          blip(1320, 0.02, 0.18, 'sine');
          break;
        case 'oilEmpty':
          blip(180, 0.03, 0.18, 'sawtooth');
          break;
        case 'win':
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            const t0 = ctx.currentTime + 0.15 + i * 0.16;
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = f;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
            o.connect(g).connect(sfxBus);
            o.start(t0);
            o.stop(t0 + 2.3);
          });
          break;
        case 'lose':
          [261.63, 207.65, 164.81, 130.81].forEach((f, i) => {
            const t0 = ctx.currentTime + 0.1 + i * 0.2;
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = f;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
            o.connect(g).connect(sfxBus);
            o.start(t0);
            o.stop(t0 + 1.9);
          });
          break;
        case 'bossSummon':
          blip(110, 0.04, 0.4, 'sawtooth');
          break;
        default:
          break;
      }
    }
  }

  return {
    unlock,
    setEnabled,
    setSilent,
    setTension,
    setFiring,
    onEvents,
    update,
    get ready() {
      return !!ctx && unlocked;
    },
  };
}

function makeNoise(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}
