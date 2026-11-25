import * as THREE from 'three';
import type {
  AudioThemeId,
  DynamicObjectKind,
  EnvironmentThemeId,
  Vec3Tuple,
} from './types';

interface MusicTrackSpec {
  barMs: number;
  chords: number[][];
  melody: number[];
  padWave: OscillatorType;
  leadWave: OscillatorType;
  bassWave: OscillatorType;
  filterHz: number;
  padGain: number;
  leadGain: number;
  bassGain: number;
  arpOffsets: number[];
  pulseBass?: boolean;
}

const MUSIC_TRACKS: Record<AudioThemeId, MusicTrackSpec> = {
  menu: {
    barMs: 3200,
    chords: [
      [261.63, 329.63, 392.0, 587.33],
      [220.0, 261.63, 329.63, 493.88],
      [174.61, 261.63, 329.63, 440.0],
      [196.0, 293.66, 392.0, 493.88],
    ],
    melody: [523.25, 587.33, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33],
    padWave: 'sine',
    leadWave: 'triangle',
    bassWave: 'sine',
    filterHz: 980,
    padGain: 0.026,
    leadGain: 0.028,
    bassGain: 0.036,
    arpOffsets: [0.15, 0.95, 1.75, 2.55],
  },
  'dream-world': {
    barMs: 3600,
    chords: [
      [174.61, 261.63, 329.63, 493.88], // Fmaj7#11 airy Lydian
      [196.0, 293.66, 369.99, 493.88], // Gmaj7
      [220.0, 329.63, 392.0, 587.33], // Am11
      [174.61, 246.94, 329.63, 440.0], // F Lydian shimmer
    ],
    melody: [659.25, 739.99, 880.0, 987.77, 1174.66, 987.77, 880.0, 659.25],
    padWave: 'sine',
    leadWave: 'sine',
    bassWave: 'sine',
    filterHz: 1150,
    padGain: 0.028,
    leadGain: 0.024,
    bassGain: 0.03,
    arpOffsets: [0.2, 1.05, 1.95, 2.85],
  },
  warehouse: {
    barMs: 2600,
    chords: [
      [146.83, 220.0, 261.63, 329.63], // Dm9 industrial groove
      [130.81, 196.0, 246.94, 293.66], // Cmaj9
      [116.54, 174.61, 220.0, 261.63], // Bbmaj7
      [130.81, 196.0, 220.0, 293.66], // C6/9
    ],
    melody: [293.66, 349.23, 440.0, 523.25, 440.0, 392.0, 349.23, 329.63],
    padWave: 'triangle',
    leadWave: 'triangle',
    bassWave: 'sawtooth',
    filterHz: 680,
    padGain: 0.018,
    leadGain: 0.022,
    bassGain: 0.028,
    arpOffsets: [0.1, 0.72, 1.35, 1.98],
    pulseBass: true,
  },
  'mountain-adventure': {
    barMs: 3400,
    chords: [
      [196.0, 293.66, 392.0, 493.88], // G open fifths
      [164.81, 246.94, 329.63, 440.0], // Em11
      [130.81, 196.0, 293.66, 392.0], // Cadd9
      [146.83, 220.0, 293.66, 369.99], // D major
    ],
    melody: [587.33, 659.25, 783.99, 880.0, 783.99, 587.33, 493.88, 587.33],
    padWave: 'triangle',
    leadWave: 'sine',
    bassWave: 'sine',
    filterHz: 1050,
    padGain: 0.025,
    leadGain: 0.026,
    bassGain: 0.032,
    arpOffsets: [0.3, 1.2, 2.0, 2.7],
  },
  'construction-site': {
    barMs: 2500,
    chords: [
      [116.54, 174.61, 233.08, 293.66], // Bb major upbeat
      [130.81, 196.0, 261.63, 329.63], // C major
      [174.61, 220.0, 261.63, 349.23], // F major
      [146.83, 220.0, 293.66, 349.23], // Dm7
    ],
    melody: [466.16, 523.25, 587.33, 698.46, 587.33, 523.25, 466.16, 440.0],
    padWave: 'triangle',
    leadWave: 'square',
    bassWave: 'triangle',
    filterHz: 820,
    padGain: 0.017,
    leadGain: 0.014,
    bassGain: 0.032,
    arpOffsets: [0.08, 0.68, 1.25, 1.88],
    pulseBass: true,
  },
  'medieval-castle': {
    barMs: 3300,
    chords: [
      [146.83, 220.0, 293.66, 349.23], // D Dorian lute/hall
      [130.81, 196.0, 261.63, 329.63], // C major
      [174.61, 220.0, 261.63, 349.23], // F major
      [196.0, 246.94, 293.66, 392.0], // G major (Dorian VI)
    ],
    melody: [587.33, 523.25, 493.88, 440.0, 392.0, 440.0, 523.25, 587.33],
    padWave: 'triangle',
    leadWave: 'triangle',
    bassWave: 'sine',
    filterHz: 840,
    padGain: 0.023,
    leadGain: 0.025,
    bassGain: 0.034,
    arpOffsets: [0.15, 0.9, 1.65, 2.45],
  },
  observatory: {
    barMs: 3500,
    chords: [
      [220.0, 277.18, 329.63, 493.88], // Amaj9
      [185.0, 220.0, 277.18, 329.63], // F#m7
      [146.83, 220.0, 277.18, 369.99], // Dmaj7
      [164.81, 246.94, 329.63, 415.3], // Emaj7
    ],
    melody: [554.37, 659.25, 880.0, 987.77, 880.0, 659.25, 554.37, 493.88],
    padWave: 'sine',
    leadWave: 'sine',
    bassWave: 'sine',
    filterHz: 1080,
    padGain: 0.024,
    leadGain: 0.022,
    bassGain: 0.03,
    arpOffsets: [0.22, 1.1, 1.95, 2.75],
  },
  victory: {
    barMs: 2400,
    chords: [
      [261.63, 329.63, 392.0, 523.25], // C major triumphant
      [174.61, 261.63, 349.23, 440.0], // F major
      [196.0, 293.66, 392.0, 493.88], // G major
      [261.63, 329.63, 392.0, 659.25], // Cmaj7
    ],
    melody: [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5, 1174.66, 1046.5],
    padWave: 'triangle',
    leadWave: 'triangle',
    bassWave: 'sine',
    filterHz: 1450,
    padGain: 0.026,
    leadGain: 0.03,
    bassGain: 0.034,
    arpOffsets: [0.08, 0.62, 1.18, 1.78],
  },
};

interface EnvironmentBedSpec {
  noiseType: 'pink' | 'white';
  filterType: BiquadFilterType;
  baseFreq: number;
  q: number;
  gain: number;
  lfoHz: number;
  lfoDepthHz: number;
  humFreq?: number;
  humGain?: number;
  chimeAccent?: 'dream' | 'construction' | 'castle' | null;
}

const ENVIRONMENT_BEDS: Record<EnvironmentThemeId, EnvironmentBedSpec> = {
  menu: {
    noiseType: 'pink',
    filterType: 'bandpass',
    baseFreq: 420,
    q: 1.4,
    gain: 0.045,
    lfoHz: 0.14,
    lfoDepthHz: 140,
    chimeAccent: 'dream',
  },
  'dream-world': {
    noiseType: 'pink',
    filterType: 'bandpass',
    baseFreq: 480,
    q: 1.6,
    gain: 0.052,
    lfoHz: 0.16,
    lfoDepthHz: 180,
    chimeAccent: 'dream',
  },
  warehouse: {
    noiseType: 'pink',
    filterType: 'lowpass',
    baseFreq: 210,
    q: 0.9,
    gain: 0.06,
    lfoHz: 0.09,
    lfoDepthHz: 35,
    humFreq: 58,
    humGain: 0.022,
    chimeAccent: null,
  },
  'mountain-adventure': {
    noiseType: 'pink',
    filterType: 'bandpass',
    baseFreq: 560,
    q: 1.15,
    gain: 0.085,
    lfoHz: 0.24,
    lfoDepthHz: 290,
    chimeAccent: null,
  },
  'construction-site': {
    noiseType: 'pink',
    filterType: 'bandpass',
    baseFreq: 390,
    q: 1.0,
    gain: 0.055,
    lfoHz: 0.18,
    lfoDepthHz: 130,
    humFreq: 76,
    humGain: 0.015,
    chimeAccent: 'construction',
  },
  'medieval-castle': {
    noiseType: 'pink',
    filterType: 'bandpass',
    baseFreq: 270,
    q: 3.1,
    gain: 0.068,
    lfoHz: 0.12,
    lfoDepthHz: 105,
    chimeAccent: 'castle',
  },
  observatory: {
    noiseType: 'pink',
    filterType: 'bandpass',
    baseFreq: 460,
    q: 1.5,
    gain: 0.048,
    lfoHz: 0.15,
    lfoDepthHz: 165,
    chimeAccent: 'dream',
  },
};

interface ActiveEnvironmentBed {
  bus: GainNode;
  noiseSource: AudioBufferSourceNode;
  lfoOsc: OscillatorNode;
  humOsc: OscillatorNode | null;
}

export class ProceduralAudio {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private envGain: GainNode | null = null;

  // Dual A/B crossfading music track buses
  private musicBusA: GainNode | null = null;
  private musicBusB: GainNode | null = null;
  private activeMusicSlot: 'A' | 'B' = 'A';
  private activeMusicTheme: AudioThemeId = 'menu';
  private musicTimeoutId: number | null = null;
  private musicStep = 0;

  // Continuous environmental bed + falling wind nodes
  private activeEnvTheme: EnvironmentThemeId = 'menu';
  private activeEnvBed: ActiveEnvironmentBed | null = null;
  private envAccentTimerId: number | null = null;

  private fallingWindSource: AudioBufferSourceNode | null = null;
  private fallingWindFilter: BiquadFilterNode | null = null;
  private fallingWindGain: GainNode | null = null;
  private readonly pannerCleanupTimers = new Set<number>();

  // Pre-generated noise buffers (reused across all SFX & wind, zero per-event allocations)
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;

  // Mixer state
  private masterVolume = 0.85;
  private musicVolume = 0.45;
  private sfxVolume = 0.85;
  private environmentVolume = 0.68;
  private muted = false;
  private paused = false;

  // Cooldown registry (prevents sound spam & unrealistic machine-gunning)
  private readonly cooldowns = new Map<string, number>();

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(18, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.18, this.ctx.currentTime);

        this.masterGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain = this.ctx.createGain();
        this.envGain = this.ctx.createGain();

        this.musicBusA = this.ctx.createGain();
        this.musicBusB = this.ctx.createGain();
        this.musicBusA.gain.setValueAtTime(1, this.ctx.currentTime);
        this.musicBusB.gain.setValueAtTime(0, this.ctx.currentTime);
        this.musicBusA.connect(this.musicGain);
        this.musicBusB.connect(this.musicGain);

        this.sfxGain.connect(this.masterGain);
        this.musicGain.connect(this.masterGain);
        this.envGain.connect(this.masterGain);
        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);

        this.createNoiseBuffers();
        this.initFallingWindChannel();
        this.syncGainNodes();
        this.startMusicScheduler();
        this.rebuildEnvironmentBed(this.activeEnvTheme, 0.8);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setVolumes(
    master: number,
    music: number,
    sfx: number,
    environment?: number,
    muted?: boolean,
  ): void {
    this.masterVolume = Math.min(1, Math.max(0, master));
    this.musicVolume = Math.min(1, Math.max(0, music));
    this.sfxVolume = Math.min(1, Math.max(0, sfx));
    if (typeof environment === 'number') {
      this.environmentVolume = Math.min(1, Math.max(0, environment));
    }
    if (typeof muted === 'boolean') {
      this.muted = muted;
    }
    this.syncGainNodes();
  }

  public setPaused(nextPaused: boolean): void {
    if (this.paused === nextPaused) return;
    this.paused = nextPaused;
    this.syncGainNodes();
    if (nextPaused) {
      this.updateFallingWind(0);
    }
  }

  public setMusicTheme(theme: AudioThemeId): void {
    if (this.activeMusicTheme === theme) return;
    this.activeMusicTheme = theme;
    this.musicStep = 0;

    if (!this.ctx || !this.musicBusA || !this.musicBusB) return;

    const now = this.ctx.currentTime;
    const prevBus = this.activeMusicSlot === 'A' ? this.musicBusA : this.musicBusB;
    this.activeMusicSlot = this.activeMusicSlot === 'A' ? 'B' : 'A';
    const nextBus = this.activeMusicSlot === 'A' ? this.musicBusA : this.musicBusB;

    // Smooth 1.25s equal-power style crossfade between old and new theme buses
    prevBus.gain.cancelScheduledValues(now);
    prevBus.gain.setValueAtTime(prevBus.gain.value, now);
    prevBus.gain.linearRampToValueAtTime(0, now + 1.25);

    nextBus.gain.cancelScheduledValues(now);
    nextBus.gain.setValueAtTime(nextBus.gain.value, now);
    nextBus.gain.linearRampToValueAtTime(1, now + 1.25);

    // Restart scheduler immediately onto the new bus so the new theme enters smoothly
    if (this.musicTimeoutId !== null) {
      window.clearTimeout(this.musicTimeoutId);
      this.musicTimeoutId = null;
    }
    this.startMusicScheduler();
  }

  public setEnvironmentTheme(theme: EnvironmentThemeId): void {
    if (this.activeEnvTheme === theme && this.activeEnvBed) return;
    this.activeEnvTheme = theme;
    if (this.ctx && this.envGain) {
      this.rebuildEnvironmentBed(theme, 1.35);
    }
  }

  public updateListener(
    pos: THREE.Vector3,
    forward: THREE.Vector3,
    up: THREE.Vector3,
  ): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const listener = this.ctx.listener;
    const now = this.ctx.currentTime;
    if (listener.positionX) {
      listener.positionX.setTargetAtTime(pos.x, now, 0.03);
      listener.positionY.setTargetAtTime(pos.y, now, 0.03);
      listener.positionZ.setTargetAtTime(pos.z, now, 0.03);
      listener.forwardX.setTargetAtTime(forward.x, now, 0.03);
      listener.forwardY.setTargetAtTime(forward.y, now, 0.03);
      listener.forwardZ.setTargetAtTime(forward.z, now, 0.03);
      listener.upX.setTargetAtTime(up.x, now, 0.03);
      listener.upY.setTargetAtTime(up.y, now, 0.03);
      listener.upZ.setTargetAtTime(up.z, now, 0.03);
    } else if (typeof listener.setPosition === 'function') {
      listener.setPosition(pos.x, pos.y, pos.z);
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  private syncGainNodes(): void {
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain || !this.envGain) return;
    const now = this.ctx.currentTime;
    const effectiveMaster = this.muted ? 0 : this.masterVolume;
    const musicDuck = this.paused ? 0.35 : 1.0;
    const envDuck = this.paused ? 0.12 : 1.0;

    this.masterGain.gain.setTargetAtTime(effectiveMaster, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, 0.025);
    this.musicGain.gain.setTargetAtTime(this.musicVolume * musicDuck, now, 0.08);
    this.envGain.gain.setTargetAtTime(this.environmentVolume * envDuck, now, 0.09);
  }

  private createNoiseBuffers(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 2.0);

    const white = this.ctx.createBuffer(1, length, sampleRate);
    const whiteData = white.getChannelData(0);
    for (let i = 0; i < length; i++) {
      whiteData[i] = Math.random() * 2 - 1;
    }
    this.whiteNoiseBuffer = white;

    // Paul Kellet's pink noise filter for rich, warm wind & impact rumble
    const pink = this.ctx.createBuffer(1, length, sampleRate);
    const pinkData = pink.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    this.pinkNoiseBuffer = pink;
  }

  private initFallingWindChannel(): void {
    if (!this.ctx || !this.sfxGain || !this.pinkNoiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.pinkNoiseBuffer;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(320, this.ctx.currentTime);
    filter.Q.setValueAtTime(1.1, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start();

    this.fallingWindSource = src;
    this.fallingWindFilter = filter;
    this.fallingWindGain = gain;
  }

  private canPlay(key: string, minIntervalSec: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    const prev = this.cooldowns.get(key) ?? -999;
    if (now - prev < minIntervalSec) return false;
    this.cooldowns.set(key, now);
    return true;
  }

  private jitter(base: number, ratio = 0.07): number {
    return base * (1 + (Math.random() * 2 - 1) * ratio);
  }

  private getSfxTarget(worldPos?: Vec3Tuple): AudioNode | null {
    if (!this.ctx || this.ctx.state !== 'running' || !this.sfxGain) return null;
    if (this.muted || this.masterVolume <= 0.004 || this.sfxVolume <= 0.004) return null;

    if (
      worldPos &&
      typeof this.ctx.createPanner === 'function' &&
      Number.isFinite(worldPos.x) &&
      Number.isFinite(worldPos.y) &&
      Number.isFinite(worldPos.z)
    ) {
      const panner = this.ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 4.5;
      panner.maxDistance = 54;
      panner.rolloffFactor = 1.1;
      const now = this.ctx.currentTime;
      if (panner.positionX) {
        panner.positionX.setValueAtTime(worldPos.x, now);
        panner.positionY.setValueAtTime(worldPos.y, now);
        panner.positionZ.setValueAtTime(worldPos.z, now);
      } else if (typeof panner.setPosition === 'function') {
        panner.setPosition(worldPos.x, worldPos.y, worldPos.z);
      }
      panner.connect(this.sfxGain);
      // Cleanly disconnect temporary spatial panner after max SFX tail to prevent Web Audio graph leaks
      if (typeof window !== 'undefined') {
        const timerId = window.setTimeout(() => {
          this.pannerCleanupTimers.delete(timerId);
          try {
            panner.disconnect();
          } catch {
            // Ignore already-disconnected nodes
          }
        }, 1250);
        this.pannerCleanupTimers.add(timerId);
      }
      return panner;
    }
    return this.sfxGain;
  }

  private playFilteredNoiseBurst(
    target: AudioNode,
    duration: number,
    filterType: BiquadFilterType,
    startFreq: number,
    endFreq: number,
    q: number,
    peakGain: number,
    usePink = true,
    delaySec = 0,
  ): void {
    if (!this.ctx) return;
    const buf = usePink ? this.pinkNoiseBuffer : this.whiteNoiseBuffer;
    if (!buf) return;
    const t = this.ctx.currentTime + delaySec;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, t);
    filter.frequency.setValueAtTime(Math.max(40, startFreq), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0008, t);
    gain.gain.linearRampToValueAtTime(Math.max(0.001, peakGain), t + Math.min(0.025, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0006, t + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(target);
    const offset = Math.random() * 1.1;
    src.start(t, offset);
    src.stop(t + duration + 0.02);
  }

  // ==================== CROSSFADING PER-WORLD MUSIC ====================

  private startMusicScheduler(): void {
    if (typeof window === 'undefined' || !this.ctx) return;

    const scheduleNextBar = () => {
      if (!this.ctx) return;
      const theme = this.activeMusicTheme;
      const spec = MUSIC_TRACKS[theme];
      const bus = this.activeMusicSlot === 'A' ? this.musicBusA : this.musicBusB;

      if (
        bus &&
        this.ctx.state === 'running' &&
        !this.muted &&
        this.masterVolume > 0.005 &&
        this.musicVolume > 0.005
      ) {
        const now = this.ctx.currentTime;
        const barSec = spec.barMs / 1000;
        const chord = spec.chords[this.musicStep % spec.chords.length];

        // 1. Warm harmonic pad bed
        for (let i = 0; i < chord.length; i++) {
          const osc = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const gain = this.ctx.createGain();

          osc.type = i === 0 ? spec.bassWave : spec.padWave;
          const freq = i === 0 ? chord[0] * 0.5 : chord[i];
          osc.frequency.setValueAtTime(freq, now);

          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(i === 0 ? spec.filterHz * 0.55 : spec.filterHz, now);

          const peak = i === 0 ? spec.bassGain : spec.padGain;
          gain.gain.setValueAtTime(0.0005, now);
          gain.gain.linearRampToValueAtTime(peak, now + Math.min(0.75, barSec * 0.24));
          gain.gain.exponentialRampToValueAtTime(0.0006, now + barSec * 1.04);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(bus);
          osc.start(now);
          osc.stop(now + barSec * 1.08);
        }

        // 2. Optional rhythmic bass pulse for Warehouse & Construction Site
        if (spec.pulseBass) {
          const beatSec = barSec / 4;
          for (let b = 0; b < 4; b++) {
            const t = now + b * beatSec;
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(chord[0] * (b === 2 ? 0.75 : 0.5), t);
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(340, t);

            gain.gain.setValueAtTime(0.0005, t);
            gain.gain.linearRampToValueAtTime(0.022, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0006, t + beatSec * 0.65);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(bus);
            osc.start(t);
            osc.stop(t + beatSec * 0.7);
          }
        }

        // 3. Signature melodic arpeggio accents
        spec.arpOffsets.forEach((offset, idx) => {
          if (!this.ctx || !bus) return;
          const t = now + offset;
          const note = spec.melody[(this.musicStep * 2 + idx) % spec.melody.length];
          const osc = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const gain = this.ctx.createGain();

          osc.type = spec.leadWave;
          osc.frequency.setValueAtTime(note, t);
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(spec.filterHz * 1.85, t);

          gain.gain.setValueAtTime(0.0005, t);
          gain.gain.linearRampToValueAtTime(spec.leadGain, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.68);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(bus);
          osc.start(t);
          osc.stop(t + 0.74);
        });

        this.musicStep += 1;
      }

      this.musicTimeoutId = window.setTimeout(scheduleNextBar, spec.barMs);
    };

    scheduleNextBar();
  }

  // ==================== ENVIRONMENTAL AUDIO BEDS ====================

  private rebuildEnvironmentBed(theme: EnvironmentThemeId, fadeSeconds: number): void {
    if (!this.ctx || !this.envGain || !this.pinkNoiseBuffer || !this.whiteNoiseBuffer) return;

    const now = this.ctx.currentTime;

    // Gracefully fade out & stop previous environmental bed
    if (this.activeEnvBed) {
      const old = this.activeEnvBed;
      this.activeEnvBed = null;
      old.bus.gain.cancelScheduledValues(now);
      old.bus.gain.setValueAtTime(old.bus.gain.value, now);
      old.bus.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      const stopAt = now + fadeSeconds + 0.1;
      try {
        old.noiseSource.stop(stopAt);
        old.lfoOsc.stop(stopAt);
        old.humOsc?.stop(stopAt);
      } catch {
        // Ignore already-stopped nodes
      }
    }

    if (this.envAccentTimerId !== null) {
      window.clearInterval(this.envAccentTimerId);
      this.envAccentTimerId = null;
    }

    const spec = ENVIRONMENT_BEDS[theme];
    const bedBus = this.ctx.createGain();
    bedBus.gain.setValueAtTime(0.0001, now);
    bedBus.gain.linearRampToValueAtTime(1.0, now + fadeSeconds);
    bedBus.connect(this.envGain);

    // Filtered noise wind/room-tone loop
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = spec.noiseType === 'pink' ? this.pinkNoiseBuffer : this.whiteNoiseBuffer;
    noiseSource.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = spec.filterType;
    filter.frequency.setValueAtTime(spec.baseFreq, now);
    filter.Q.setValueAtTime(spec.q, now);

    // Slow LFO modulates wind gusts / corridor swells organically
    const lfoOsc = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfoOsc.type = 'sine';
    lfoOsc.frequency.setValueAtTime(spec.lfoHz, now);
    lfoGain.gain.setValueAtTime(spec.lfoDepthHz, now);
    lfoOsc.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(spec.gain, now);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(bedBus);

    noiseSource.start(now);
    lfoOsc.start(now);

    // Optional industrial / crane low-end machinery hum
    let humOsc: OscillatorNode | null = null;
    if (spec.humFreq && spec.humGain) {
      humOsc = this.ctx.createOscillator();
      const humFilter = this.ctx.createBiquadFilter();
      const humGainNode = this.ctx.createGain();
      humOsc.type = 'sawtooth';
      humOsc.frequency.setValueAtTime(spec.humFreq, now);
      humFilter.type = 'lowpass';
      humFilter.frequency.setValueAtTime(140, now);
      humGainNode.gain.setValueAtTime(spec.humGain, now);
      humOsc.connect(humFilter);
      humFilter.connect(humGainNode);
      humGainNode.connect(bedBus);
      humOsc.start(now);
    }

    this.activeEnvBed = { bus: bedBus, noiseSource, lfoOsc, humOsc };

    // Sparse atmospheric environmental accents (distant chimes, crane creaks, hall breeze)
    if (spec.chimeAccent && typeof window !== 'undefined') {
      const accentKind = spec.chimeAccent;
      this.envAccentTimerId = window.setInterval(() => {
        if (
          !this.ctx ||
          !this.envGain ||
          this.ctx.state !== 'running' ||
          this.paused ||
          this.muted ||
          this.environmentVolume < 0.02
        ) {
          return;
        }
        const t = this.ctx.currentTime;
        if (accentKind === 'dream') {
          const chimeNotes = [1046.5, 1174.66, 1318.51, 1567.98];
          const freq = chimeNotes[Math.floor(Math.random() * chimeNotes.length)];
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.0005, t);
          gain.gain.linearRampToValueAtTime(0.014, t + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0004, t + 1.4);
          osc.connect(gain);
          gain.connect(this.envGain);
          osc.start(t);
          osc.stop(t + 1.45);
        } else if (accentKind === 'construction') {
          // Subtle distant crane/steel creak
          const osc = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(115 + Math.random() * 25, t);
          osc.frequency.linearRampToValueAtTime(88 + Math.random() * 18, t + 0.65);
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(340, t);
          filter.Q.setValueAtTime(4.5, t);
          gain.gain.setValueAtTime(0.0005, t);
          gain.gain.linearRampToValueAtTime(0.012, t + 0.14);
          gain.gain.exponentialRampToValueAtTime(0.0004, t + 0.7);
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(this.envGain);
          osc.start(t);
          osc.stop(t + 0.74);
        } else if (accentKind === 'castle') {
          // Distant hollow corridor draft resonance
          this.playFilteredNoiseBurst(
            this.envGain,
            1.2,
            'bandpass',
            320,
            210,
            5.5,
            0.022,
            true,
          );
        }
      }, 6200);
    }
  }

  // ==================== CHARACTER SOUND EFFECTS ====================

  public updateFallingWind(downwardSpeed: number): void {
    if (!this.ctx || !this.fallingWindGain || !this.fallingWindFilter) return;
    const now = this.ctx.currentTime;
    const active = !this.paused && !this.muted && downwardSpeed > 5.2;
    const norm = active ? Math.min(1, (downwardSpeed - 5.2) / 11.5) : 0;
    const targetGain = norm * norm * 0.16;
    const targetFreq = 260 + norm * 620;
    this.fallingWindGain.gain.setTargetAtTime(targetGain, now, 0.08);
    this.fallingWindFilter.frequency.setTargetAtTime(targetFreq, now, 0.08);
  }

  public playFootstep(isRunning: boolean): void {
    if (!this.canPlay('footstep', isRunning ? 0.14 : 0.2)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    // Soft padded boot tap
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = this.jitter(isRunning ? 158 : 124, 0.12);
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.048);

    const peak = isRunning ? 0.062 : 0.038;
    gain.gain.setValueAtTime(0.0008, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.007);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.056);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.062);

    // Subtle ground scuff texture
    this.playFilteredNoiseBurst(
      target,
      isRunning ? 0.055 : 0.04,
      'bandpass',
      this.jitter(isRunning ? 1250 : 950, 0.18),
      520,
      1.6,
      isRunning ? 0.032 : 0.018,
      false,
    );
  }

  public playJumpWhoosh(): void {
    if (!this.canPlay('jump', 0.18)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.jitter(162, 0.07), now);
    osc.frequency.exponentialRampToValueAtTime(this.jitter(355, 0.07), now + 0.11);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.095, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.135);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.145);

    this.playFilteredNoiseBurst(target, 0.11, 'bandpass', 420, 1150, 1.4, 0.038, true);
  }

  public playLandingThud(impactSpeed: number, worldPos?: Vec3Tuple): void {
    if (!this.canPlay('landing', 0.09)) return;
    const target = this.getSfxTarget(worldPos);
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    const strength = Math.min(1, Math.max(0.14, impactSpeed / 10.5));
    const isHeavy = impactSpeed >= 6.8;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.jitter(isHeavy ? 112 : 132, 0.08) + strength * 26, now);
    osc.frequency.exponentialRampToValueAtTime(isHeavy ? 34 : 48, now + (isHeavy ? 0.2 : 0.13));

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime((isHeavy ? 0.22 : 0.15) * strength, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.24 : 0.15));

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + (isHeavy ? 0.26 : 0.16));

    // Gravel / dust thump layer on medium & heavy landings
    if (impactSpeed > 3.0) {
      this.playFilteredNoiseBurst(
        target,
        isHeavy ? 0.18 : 0.1,
        'lowpass',
        isHeavy ? 950 : 650,
        180,
        0.9,
        (isHeavy ? 0.11 : 0.055) * strength,
        true,
      );
    }
  }

  public playCharacterCollision(impactSpeed: number, worldPos?: Vec3Tuple): void {
    if (!this.canPlay('char-collide', 0.14)) return;
    const target = this.getSfxTarget(worldPos);
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    const strength = Math.min(1, Math.max(0.18, impactSpeed / 9.5));
    // Soft rubbery clay-character body bump
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(this.jitter(148 + strength * 40, 0.1), now);
    osc.frequency.exponentialRampToValueAtTime(56, now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.13 * strength, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.15);

    this.playFilteredNoiseBurst(target, 0.09, 'bandpass', 520, 220, 1.3, 0.045 * strength, true);
  }

  public playSlideOrRoll(speed: number, isRolling: boolean): void {
    if (!this.canPlay(isRolling ? 'roll' : 'slide', isRolling ? 0.24 : 0.19)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;

    const strength = Math.min(1, Math.max(0.15, speed / 7.5));
    this.playFilteredNoiseBurst(
      target,
      isRolling ? 0.22 : 0.16,
      'bandpass',
      this.jitter(isRolling ? 380 : 880, 0.15),
      isRolling ? 210 : 480,
      isRolling ? 1.8 : 1.2,
      (isRolling ? 0.058 : 0.042) * strength,
      true,
    );
  }

  public playThrowWhoosh(speed: number): void {
    if (!this.canPlay('throw', 0.16)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;

    const strength = Math.min(1, Math.max(0.25, speed / 8));
    this.playFilteredNoiseBurst(
      target,
      0.16,
      'bandpass',
      this.jitter(520, 0.1),
      1550,
      1.3,
      0.085 * strength,
      true,
    );
  }

  public playHeavyStrain(intensity: number): void {
    if (!this.canPlay('heavy-strain', 0.65)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;
    const s = Math.min(1, Math.max(0.2, intensity));

    // Gentle wooden/fabric effort creak & soft strain breath
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(this.jitter(96, 0.09), now);
    osc.frequency.linearRampToValueAtTime(this.jitter(118, 0.08), now + 0.16);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(340, now);
    filter.Q.setValueAtTime(3.2, now);

    gain.gain.setValueAtTime(0.0008, now);
    gain.gain.linearRampToValueAtTime(0.032 * s, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0006, now + 0.19);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  // ==================== MATERIAL-AWARE OBJECT SOUND EFFECTS ====================

  public playObjectCollision(
    kind: DynamicObjectKind,
    impactSpeed: number,
    mass = 2.0,
    worldPos?: Vec3Tuple,
  ): void {
    const cooldownKey = `obj-${kind}`;
    if (!this.canPlay(cooldownKey, 0.065)) return;
    if (!this.canPlay('obj-global', 0.03)) return;

    const target = this.getSfxTarget(worldPos);
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    const speedNorm = Math.min(1, Math.max(0.12, impactSpeed / 9.2));
    const massWeight = Math.min(1.45, Math.max(0.55, Math.sqrt(mass / 2.2)));
    const pitchScale = Math.min(1.28, Math.max(0.58, 1.15 / Math.pow(massWeight, 0.55)));
    const volume = Math.min(0.24, (0.085 + 0.11 * speedNorm) * Math.min(1.25, massWeight));

    if (kind === 'metal-crate') {
      // Resonant metallic clang: fundamental + inharmonic bell overtone + heavy thud
      const baseHz = this.jitter(310 * pitchScale, 0.09);
      const partials = [1.0, 2.38, 3.71];
      partials.forEach((mult, idx) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(baseHz * mult, now);
        osc.frequency.exponentialRampToValueAtTime(baseHz * mult * 0.92, now + (idx === 0 ? 0.24 : 0.16));

        const pVol = volume * (idx === 0 ? 0.72 : idx === 1 ? 0.42 : 0.22);
        gain.gain.setValueAtTime(0.0008, now);
        gain.gain.linearRampToValueAtTime(pVol, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0006, now + (idx === 0 ? 0.26 : 0.18));

        osc.connect(gain);
        gain.connect(target);
        osc.start(now);
        osc.stop(now + 0.28);
      });

      this.playFilteredNoiseBurst(target, 0.09, 'highpass', 1800, 900, 1.2, volume * 0.35, false);
      return;
    }

    if (kind === 'boulder') {
      // Heavy granite stone impact + low rumble + pebble grit
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(this.jitter(95 * pitchScale, 0.08), now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.22);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume * 1.15, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.25);

      osc.connect(gain);
      gain.connect(target);
      osc.start(now);
      osc.stop(now + 0.27);

      this.playFilteredNoiseBurst(
        target,
        0.19,
        'lowpass',
        this.jitter(640, 0.14),
        140,
        1.1,
        volume * 0.75,
        true,
      );
      return;
    }

    if (kind === 'rope-handle') {
      // Crisp rope snap + wooden grip click
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(this.jitter(440, 0.1), now);
      osc.frequency.exponentialRampToValueAtTime(210, now + 0.06);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume * 0.65, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.07);

      osc.connect(gain);
      gain.connect(target);
      osc.start(now);
      osc.stop(now + 0.08);
      return;
    }

    // Wooden objects ('block' | 'crate' | 'plank'): hollow woody resonant knock
    const woodBase = this.jitter((kind === 'plank' ? 375 : 295) * pitchScale, 0.1);
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(woodBase, now);
    osc.frequency.exponentialRampToValueAtTime(woodBase * 0.48, now + 0.085);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(woodBase * 1.62, now);
    osc2.frequency.exponentialRampToValueAtTime(woodBase * 0.9, now + 0.06);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(woodBase * 1.4, now);
    filter.Q.setValueAtTime(1.8, now);

    gain.gain.setValueAtTime(0.0008, now);
    gain.gain.linearRampToValueAtTime(volume * 0.95, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0006, now + 0.11);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.12);
    osc2.stop(now + 0.09);

    if (mass >= 3.2 && impactSpeed > 3.5) {
      // Heavy object ground drop extra sub-thud
      this.playFilteredNoiseBurst(target, 0.13, 'lowpass', 480, 140, 0.9, volume * 0.52, true);
    }
  }

  public playBlockClack(impactSpeed: number, worldPos?: Vec3Tuple): void {
    this.playObjectCollision('block', impactSpeed, 2.0, worldPos);
  }

  public playObjectDrag(
    kind: DynamicObjectKind,
    speed: number,
    mass = 2.5,
    worldPos?: Vec3Tuple,
  ): void {
    if (!this.canPlay('obj-drag', 0.18)) return;
    const target = this.getSfxTarget(worldPos);
    if (!this.ctx || !target) return;

    const speedNorm = Math.min(1, Math.max(0.15, speed / 3.8));
    const massScale = Math.min(1.3, Math.max(0.6, mass / 3.0));
    const isMetal = kind === 'metal-crate';
    const isStone = kind === 'boulder';

    const startHz = isMetal ? 1280 : isStone ? 310 : 620;
    const endHz = isMetal ? 920 : isStone ? 200 : 410;
    const q = isMetal ? 4.2 : isStone ? 1.5 : 2.1;

    this.playFilteredNoiseBurst(
      target,
      0.16,
      'bandpass',
      this.jitter(startHz, 0.14),
      endHz,
      q,
      0.048 * speedNorm * massScale,
      !isMetal,
    );
  }

  // ==================== INTERACTION, PUZZLE & UI SFX ====================

  public playUiHover(): void {
    if (!this.canPlay('ui-hover', 0.045)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.035);
    gain.gain.setValueAtTime(0.0008, now);
    gain.gain.linearRampToValueAtTime(0.032, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.045);
    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playUiClick(): void {
    this.unlock();
    if (!this.canPlay('ui-click', 0.04)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.055);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.068, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playPauseChime(paused: boolean): void {
    this.unlock();
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;
    const notes = paused ? [523.25, 392.0] : [392.0, 523.25];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !target) return;
      const t = now + idx * 0.06;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(target);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  public playTargetLock(side: 'left' | 'right'): void {
    if (!this.canPlay(`lock-${side}`, 0.12)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const startFreq = side === 'left' ? 440 : 523.25;
    const endFreq = side === 'left' ? 587.33 : 659.25;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.065);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.055, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playGrabAttach(side: 'left' | 'right', mass = 2.0): void {
    if (!this.canPlay(`grab-${side}`, 0.08)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    const massFactor = Math.min(1.25, Math.max(0.75, mass / 2.4));
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const base = this.jitter((side === 'left' ? 235 : 275) / Math.sqrt(massFactor), 0.06);
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.42, now + 0.075);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.105 * Math.min(1.15, massFactor), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.1);

    // Tactile grip slap noise
    this.playFilteredNoiseBurst(target, 0.045, 'bandpass', 720, 320, 1.5, 0.032, true);
  }

  public playGrabRelease(side: 'left' | 'right'): void {
    if (!this.canPlay(`release-${side}`, 0.08)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const startFreq = this.jitter(side === 'left' ? 285 : 325, 0.06);
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(145, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playLedgeGrab(side: 'left' | 'right'): void {
    if (!this.canPlay(`ledge-${side}`, 0.1)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const startFreq = this.jitter(side === 'left' ? 175 : 205, 0.08);
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(102, now + 0.075);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.115, now + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.092);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.098);

    this.playFilteredNoiseBurst(target, 0.06, 'bandpass', 880, 380, 1.4, 0.044, true);
  }

  public playClimbEffort(): void {
    if (!this.canPlay('climb', 0.24)) return;
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.jitter(185, 0.08), now);
    osc.frequency.exponentialRampToValueAtTime(this.jitter(325, 0.08), now + 0.12);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.085, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.145);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.155);

    this.playFilteredNoiseBurst(target, 0.09, 'bandpass', 600, 1000, 1.5, 0.03, true);
  }

  public playPlatePress(activated: boolean, worldPos?: Vec3Tuple): void {
    if (!this.canPlay('plate', 0.1)) return;
    const target = this.getSfxTarget(worldPos);
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    // Mechanical pressure click + status chime
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(activated ? 310 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(activated ? 540 : 175, now + 0.125);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.115, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.17);

    this.playFilteredNoiseBurst(target, 0.055, 'bandpass', 500, 240, 2.0, 0.045, true);
  }

  public playLeverToggle(on: boolean, worldPos?: Vec3Tuple): void {
    if (!this.canPlay('lever', 0.14)) return;
    const target = this.getSfxTarget(worldPos);
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    // Metallic ratchet click + lever throw
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(on ? 195 : 295, now);
    osc.frequency.exponentialRampToValueAtTime(on ? 430 : 145, now + 0.115);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.085, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.145);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.155);

    this.playFilteredNoiseBurst(target, 0.07, 'highpass', 1400, 750, 1.5, 0.042, false);
  }

  public playDoorMovement(opening: boolean, worldPos?: Vec3Tuple): void {
    if (!this.canPlay('door', 0.25)) return;
    const target = this.getSfxTarget(worldPos);
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    // Distinct opening (rising mechanical rumble) vs closing (descending stone/steel slam)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(opening ? 68 : 102, now);
    osc.frequency.exponentialRampToValueAtTime(opening ? 105 : 46, now + 0.42);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.145, now + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.48);

    this.playFilteredNoiseBurst(
      target,
      0.42,
      'lowpass',
      opening ? 420 : 540,
      opening ? 260 : 140,
      1.2,
      0.075,
      true,
    );
  }

  public playDoorRumble(worldPos?: Vec3Tuple): void {
    this.playDoorMovement(true, worldPos);
  }

  public playCheckpointChime(): void {
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !target) return;
      const t = now + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.085, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain);
      gain.connect(target);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  public playRelicCollect(): void {
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;
    const notes = [659.25, 880, 1174.66, 1318.51];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !target) return;
      const t = now + idx * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain);
      gain.connect(target);
      osc.start(t);
      osc.stop(t + 0.27);
    });
  }

  public playLevelComplete(): void {
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !target) return;
      const t = now + idx * 0.1;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.115, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.54);

      osc.connect(gain);
      gain.connect(target);
      osc.start(t);
      osc.stop(t + 0.56);
    });
  }

  public playRespawnWhoosh(): void {
    const target = this.getSfxTarget();
    if (!this.ctx || !target) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.22);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(target);
    osc.start(now);
    osc.stop(now + 0.26);

    this.playFilteredNoiseBurst(target, 0.2, 'bandpass', 900, 320, 1.3, 0.04, true);
  }

  public dispose(): void {
    if (this.musicTimeoutId !== null) {
      window.clearTimeout(this.musicTimeoutId);
      this.musicTimeoutId = null;
    }
    if (this.envAccentTimerId !== null) {
      window.clearInterval(this.envAccentTimerId);
      this.envAccentTimerId = null;
    }
    for (const timerId of this.pannerCleanupTimers) {
      window.clearTimeout(timerId);
    }
    this.pannerCleanupTimers.clear();
    try {
      this.fallingWindSource?.stop();
      this.activeEnvBed?.noiseSource.stop();
      this.activeEnvBed?.lfoOsc.stop();
      this.activeEnvBed?.humOsc?.stop();
    } catch {
      // Ignore already-stopped nodes
    }
    this.activeEnvBed = null;
    this.fallingWindSource = null;
    this.cooldowns.clear();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
