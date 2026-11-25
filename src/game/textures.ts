import * as THREE from 'three';

export interface ProceduralTextureSet {
  limestoneTile: THREE.CanvasTexture;
  mattePlaster: THREE.CanvasTexture;
  pastelWood: THREE.CanvasTexture;
  brushedBrass: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  skyGradient: THREE.CanvasTexture;
  industrialConcrete: THREE.CanvasTexture;
  woodCrate: THREE.CanvasTexture;
  metalPanel: THREE.CanvasTexture;
  alpineStone: THREE.CanvasTexture;
  castleBrick: THREE.CanvasTexture;
  cautionStripe: THREE.CanvasTexture;
  woodPlank: THREE.CanvasTexture;
  createCustomSkyGradient: (stops: Array<[number, string]>) => THREE.CanvasTexture;
  dispose: () => void;
}

function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function configureTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
  wrap = true,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  if (wrap) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  tex.needsUpdate = true;
  return tex;
}

function createLimestoneTileCanvas(): HTMLCanvasElement {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = makeSeededRandom(4217);

  ctx.fillStyle = '#eee8dc';
  ctx.fillRect(0, 0, size, size);

  const cells = 4;
  const step = size / cells;
  for (let gx = 0; gx < cells; gx++) {
    for (let gy = 0; gy < cells; gy++) {
      const shade = Math.floor((rand() - 0.5) * 14);
      const r = 238 + shade;
      const g = 232 + shade;
      const b = 220 + shade;
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(gx * step + 2, gy * step + 2, step - 4, step - 4);
    }
  }

  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const rad = 0.6 + rand() * 1.5;
    const dark = rand() > 0.45;
    ctx.fillStyle = dark ? 'rgba(148, 136, 118, 0.14)' : 'rgba(255, 253, 248, 0.25)';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(176, 165, 148, 0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= cells; i++) {
    const pos = i * step;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(size, pos);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.5;
  for (let gx = 0; gx < cells; gx++) {
    for (let gy = 0; gy < cells; gy++) {
      ctx.strokeRect(gx * step + 3, gy * step + 3, step - 6, step - 6);
    }
  }

  return canvas;
}

function createMattePlasterCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = makeSeededRandom(9133);

  ctx.fillStyle = '#f6f3ee';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 3.5;
    ctx.fillStyle =
      rand() > 0.5 ? 'rgba(215, 208, 198, 0.14)' : 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(165, 155, 145, 0.16)';
  ctx.lineWidth = 2;
  for (let y = 32; y < size; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  return canvas;
}

function createPastelWoodCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = makeSeededRandom(7731);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 3) {
    const alpha = 0.03 + rand() * 0.045;
    ctx.fillStyle = `rgba(90, 75, 65, ${alpha.toFixed(3)})`;
    ctx.fillRect(0, y, size, 1.5);
  }

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  ctx.strokeStyle = 'rgba(60, 50, 45, 0.12)';
  ctx.lineWidth = 4;
  ctx.strokeRect(12, 12, size - 24, size - 24);

  return canvas;
}

function createBrushedBrassCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = makeSeededRandom(5519);

  ctx.fillStyle = '#d9b974';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const v = rand() > 0.5 ? 'rgba(255, 246, 214, 0.14)' : 'rgba(138, 102, 42, 0.14)';
    ctx.fillStyle = v;
    ctx.fillRect(0, y, size, 1);
  }

  return canvas;
}

function createContactShadowCanvas(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, size * 0.06, cx, cx, size * 0.48);
  grad.addColorStop(0, 'rgba(38, 48, 66, 0.48)');
  grad.addColorStop(0.55, 'rgba(38, 48, 66, 0.18)');
  grad.addColorStop(1, 'rgba(38, 48, 66, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function createSkyGradientCanvas(stops: Array<[number, string]>): HTMLCanvasElement {
  const width = 32;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  for (const [offset, color] of stops) {
    grad.addColorStop(offset, color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function createIndustrialConcreteCanvas(): HTMLCanvasElement {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = makeSeededRandom(3109);

  ctx.fillStyle = '#d5d2ca';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 3600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.8 + rand() * 2.4;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(92, 95, 102, 0.12)' : 'rgba(255, 255, 250, 0.16)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Expansion joint grid
  ctx.strokeStyle = 'rgba(84, 88, 96, 0.42)';
  ctx.lineWidth = 3;
  for (let p = 0; p <= size; p += 256) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Subtle floor safety dashes
  ctx.fillStyle = 'rgba(232, 168, 56, 0.22)';
  ctx.fillRect(0, 12, size, 10);

  return canvas;
}

function createWoodCrateCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = makeSeededRandom(6613);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Horizontal timber slats
  for (let y = 0; y < size; y += 42) {
    const shade = 232 + Math.floor((rand() - 0.5) * 18);
    ctx.fillStyle = `rgb(${shade}, ${shade - 8}, ${shade - 18})`;
    ctx.fillRect(0, y, size, 40);
    ctx.fillStyle = 'rgba(72, 48, 28, 0.25)';
    ctx.fillRect(0, y + 39, size, 3);
  }

  // Diagonal brace & perimeter frame
  ctx.strokeStyle = 'rgba(120, 82, 45, 0.34)';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.moveTo(22, 22);
  ctx.lineTo(size - 22, size - 22);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(92, 62, 34, 0.36)';
  ctx.lineWidth = 26;
  ctx.strokeRect(13, 13, size - 26, size - 26);

  // Corner nails
  ctx.fillStyle = 'rgba(55, 58, 66, 0.55)';
  const pts: [number, number][] = [
    [16, 16],
    [size - 16, 16],
    [16, size - 16],
    [size - 16, size - 16],
  ];
  for (const [nx, ny] of pts) {
    ctx.beginPath();
    ctx.arc(nx, ny, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas;
}

function createMetalPanelCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = makeSeededRandom(8243);

  ctx.fillStyle = '#dce3ec';
  ctx.fillRect(0, 0, size, size);

  // Corrugated ribs
  for (let x = 0; x < size; x += 32) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(x, 0, 12, size);
    ctx.fillStyle = 'rgba(52, 64, 82, 0.14)';
    ctx.fillRect(x + 14, 0, 10, size);
  }

  // Brushed streaks
  for (let i = 0; i < 650; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(40,52,70,0.08)';
    ctx.fillRect(rand() * size, rand() * size, 18 + rand() * 24, 1.5);
  }

  ctx.strokeStyle = 'rgba(45, 56, 72, 0.32)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  return canvas;
}

function createAlpineStoneCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = makeSeededRandom(1951);

  ctx.fillStyle = '#c4c0b7';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 1800; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1.5 + rand() * 5;
    const pick = rand();
    ctx.fillStyle =
      pick < 0.35
        ? 'rgba(128, 124, 118, 0.18)'
        : pick < 0.72
          ? 'rgba(235, 232, 224, 0.18)'
          : 'rgba(130, 164, 128, 0.12)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Subtle strata fracture lines
  ctx.strokeStyle = 'rgba(84, 82, 78, 0.24)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const y = i * 32 + rand() * 14;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size * 0.5, y + (rand() - 0.5) * 14);
    ctx.lineTo(size, y);
    ctx.stroke();
  }

  return canvas;
}

function createCastleBrickCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = makeSeededRandom(4919);

  ctx.fillStyle = '#a8a299';
  ctx.fillRect(0, 0, size, size);

  const rows = 8;
  const cols = 4;
  const rowH = size / rows;
  const colW = size / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const shade = 205 + Math.floor((rand() - 0.5) * 26);
      ctx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 10})`;
      ctx.fillRect(c * colW + offset + 2, r * rowH + 2, colW - 4, rowH - 4);
      ctx.strokeStyle = 'rgba(255, 252, 245, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c * colW + offset + 3, r * rowH + 3, colW - 6, rowH - 6);
    }
  }

  return canvas;
}

function createCautionStripeCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f2b73b';
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#2d333d';
  for (let i = -size; i < size * 2; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 28, 0);
    ctx.lineTo(i + 28 - size, size);
    ctx.lineTo(i - size, size);
    ctx.closePath();
    ctx.fill();
  }

  return canvas;
}

function createWoodPlankCanvas(): HTMLCanvasElement {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = makeSeededRandom(2741);

  ctx.fillStyle = '#d4a674';
  ctx.fillRect(0, 0, size, size);

  for (let p = 0; p < 4; p++) {
    const py = p * 64;
    const tone = 198 + Math.floor((rand() - 0.5) * 20);
    ctx.fillStyle = `rgb(${tone}, ${Math.floor(tone * 0.78)}, ${Math.floor(tone * 0.56)})`;
    ctx.fillRect(0, py + 2, size, 60);
    for (let g = 0; g < 16; g++) {
      ctx.fillStyle = 'rgba(90, 56, 28, 0.1)';
      ctx.fillRect(0, py + 4 + rand() * 54, size, 1.5);
    }
    ctx.fillStyle = 'rgba(70, 44, 24, 0.35)';
    ctx.fillRect(0, py + 61, size, 3);
  }

  return canvas;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const limestoneTile = configureTexture(createLimestoneTileCanvas(), maxAnisotropy, 10, 10);
  const mattePlaster = configureTexture(createMattePlasterCanvas(), maxAnisotropy, 2, 2);
  const pastelWood = configureTexture(createPastelWoodCanvas(), maxAnisotropy, 1, 1);
  const brushedBrass = configureTexture(createBrushedBrassCanvas(), maxAnisotropy, 2, 2);

  const industrialConcrete = configureTexture(createIndustrialConcreteCanvas(), maxAnisotropy, 8, 8);
  const woodCrate = configureTexture(createWoodCrateCanvas(), maxAnisotropy, 1, 1);
  const metalPanel = configureTexture(createMetalPanelCanvas(), maxAnisotropy, 1, 1);
  const alpineStone = configureTexture(createAlpineStoneCanvas(), maxAnisotropy, 3, 3);
  const castleBrick = configureTexture(createCastleBrickCanvas(), maxAnisotropy, 3, 3);
  const cautionStripe = configureTexture(createCautionStripeCanvas(), maxAnisotropy, 4, 1);
  const woodPlank = configureTexture(createWoodPlankCanvas(), maxAnisotropy, 2, 1);

  const contactShadow = new THREE.CanvasTexture(createContactShadowCanvas());
  contactShadow.colorSpace = THREE.SRGBColorSpace;
  contactShadow.needsUpdate = true;

  const skyGradient = new THREE.CanvasTexture(
    createSkyGradientCanvas([
      [0.0, '#6db3ee'],
      [0.28, '#9dd0f7'],
      [0.47, '#d6ebf8'],
      [0.52, '#f5ebe0'],
      [0.62, '#e4edf4'],
      [1.0, '#bfd4e5'],
    ]),
  );
  skyGradient.colorSpace = THREE.SRGBColorSpace;
  skyGradient.wrapS = THREE.ClampToEdgeWrapping;
  skyGradient.wrapT = THREE.ClampToEdgeWrapping;
  skyGradient.needsUpdate = true;

  const createCustomSkyGradient = (stops: Array<[number, string]>): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(createSkyGradientCanvas(stops));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    limestoneTile,
    mattePlaster,
    pastelWood,
    brushedBrass,
    contactShadow,
    skyGradient,
    industrialConcrete,
    woodCrate,
    metalPanel,
    alpineStone,
    castleBrick,
    cautionStripe,
    woodPlank,
    createCustomSkyGradient,
    dispose() {
      limestoneTile.dispose();
      mattePlaster.dispose();
      pastelWood.dispose();
      brushedBrass.dispose();
      contactShadow.dispose();
      skyGradient.dispose();
      industrialConcrete.dispose();
      woodCrate.dispose();
      metalPanel.dispose();
      alpineStone.dispose();
      castleBrick.dispose();
      cautionStripe.dispose();
      woodPlank.dispose();
    },
  };
}
