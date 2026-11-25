import * as THREE from 'three';

export const DEFAULT_BEANIE_HEX = 0x5c79ad;
export const DEFAULT_SCARF_HEX = 0xe78f75;
export const CHARACTER_BODY_HALF_HEIGHT = 0.9;

export interface HumanoidVisualRig {
  bodyVisual: THREE.Group;
  headPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftForearmPivot: THREE.Group;
  rightForearmPivot: THREE.Group;
  leftHandTipAnchor: THREE.Object3D;
  rightHandTipAnchor: THREE.Object3D;
  leftHandRingMesh: THREE.Mesh;
  leftHandRingMat: THREE.MeshBasicMaterial;
  rightHandRingMesh: THREE.Mesh;
  rightHandRingMat: THREE.MeshBasicMaterial;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftShinPivot: THREE.Group;
  rightShinPivot: THREE.Group;
  beanieMat: THREE.MeshStandardMaterial;
  scarfMat: THREE.MeshStandardMaterial;
  disposables: Array<{ dispose: () => void }>;
  setAccentColor: (hexColor: string | null) => void;
}

const _tmpColor = new THREE.Color();
const _scarfColor = new THREE.Color();

/**
 * Shared procedural multi-part humanoid character model used by both the local
 * physics-driven PlayerCharacter and synchronized remote multiplayer players so
 * every climber shares the exact same silhouette, proportions, and joint pivots.
 */
export function buildHumanoidVisualRig(accentColorHex?: string | null): HumanoidVisualRig {
  const bodyVisual = new THREE.Group();
  const headPivot = new THREE.Group();
  const leftArmPivot = new THREE.Group();
  const rightArmPivot = new THREE.Group();
  const leftForearmPivot = new THREE.Group();
  const rightForearmPivot = new THREE.Group();
  const leftHandTipAnchor = new THREE.Object3D();
  const rightHandTipAnchor = new THREE.Object3D();
  const leftLegPivot = new THREE.Group();
  const rightLegPivot = new THREE.Group();
  const leftShinPivot = new THREE.Group();
  const rightShinPivot = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // Varied roughness PBR materials for tactile clay/toybox readability
  const porcelainMat = new THREE.MeshStandardMaterial({
    color: 0xf7f6f2,
    roughness: 0.56,
    metalness: 0.02,
  });
  const jointMat = new THREE.MeshStandardMaterial({
    color: 0xe3e6ec,
    roughness: 0.78,
    metalness: 0.03,
  });
  const beanieMat = new THREE.MeshStandardMaterial({
    color: DEFAULT_BEANIE_HEX,
    roughness: 0.88,
    metalness: 0.0,
  });
  const scarfMat = new THREE.MeshStandardMaterial({
    color: DEFAULT_SCARF_HEX,
    roughness: 0.8,
    metalness: 0.02,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x242a36,
    roughness: 0.25,
    metalness: 0.08,
  });
  const blushMat = new THREE.MeshStandardMaterial({
    color: 0xf3b4a8,
    roughness: 0.75,
    metalness: 0.0,
  });
  disposables.push(porcelainMat, jointMat, beanieMat, scarfMat, eyeMat, blushMat);

  const setAccentColor = (hexColor: string | null): void => {
    if (!hexColor) {
      beanieMat.color.setHex(DEFAULT_BEANIE_HEX);
      scarfMat.color.setHex(DEFAULT_SCARF_HEX);
      return;
    }
    try {
      _tmpColor.set(hexColor);
      beanieMat.color.copy(_tmpColor);
      // Warm complementary/brighter tint for scarf & pack strap so each player pops unmistakably
      _scarfColor.copy(_tmpColor).offsetHSL(0.06, -0.05, 0.14);
      scarfMat.color.copy(_scarfColor);
    } catch {
      beanieMat.color.setHex(DEFAULT_BEANIE_HEX);
      scarfMat.color.setHex(DEFAULT_SCARF_HEX);
    }
  };

  if (accentColorHex) {
    setAccentColor(accentColorHex);
  }

  const addMesh = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    pos: [number, number, number],
    rot?: [number, number, number],
    scale?: [number, number, number],
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    disposables.push(geo);
    return mesh;
  };

  // --- TORSO & PELVIS (centered around body origin, boots touch y = -0.90) ---
  addMesh(
    bodyVisual,
    new THREE.CapsuleGeometry(0.275, 0.34, 12, 20),
    porcelainMat,
    [0, 0.02, 0],
    undefined,
    [1.06, 1.0, 0.92],
  );
  addMesh(
    bodyVisual,
    new THREE.SphereGeometry(0.285, 20, 14),
    porcelainMat,
    [0, -0.22, 0],
    undefined,
    [1.04, 0.74, 0.94],
  );
  // Explorer scarf ring around neck
  addMesh(
    bodyVisual,
    new THREE.TorusGeometry(0.19, 0.068, 12, 24),
    scarfMat,
    [0, 0.35, 0],
    [Math.PI / 2, 0, 0],
  );
  // Backpack on +Z (back) while character faces -Z
  addMesh(
    bodyVisual,
    new THREE.CapsuleGeometry(0.14, 0.16, 8, 14),
    beanieMat,
    [0, 0.04, 0.28],
    undefined,
    [1.15, 1.0, 0.65],
  );
  addMesh(
    bodyVisual,
    new THREE.BoxGeometry(0.2, 0.08, 0.06),
    scarfMat,
    [0, 0.12, 0.36],
  );

  // --- HEAD PIVOT ---
  headPivot.position.set(0, 0.38, 0);
  bodyVisual.add(headPivot);

  addMesh(
    headPivot,
    new THREE.SphereGeometry(0.265, 24, 18),
    porcelainMat,
    [0, 0.24, 0],
    undefined,
    [1.02, 0.98, 1.0],
  );
  addMesh(headPivot, new THREE.SphereGeometry(0.036, 12, 10), eyeMat, [-0.092, 0.255, -0.242]);
  addMesh(headPivot, new THREE.SphereGeometry(0.036, 12, 10), eyeMat, [0.092, 0.255, -0.242]);
  addMesh(
    headPivot,
    new THREE.SphereGeometry(0.032, 10, 8),
    blushMat,
    [-0.155, 0.205, -0.215],
    undefined,
    [1.2, 0.7, 0.5],
  );
  addMesh(
    headPivot,
    new THREE.SphereGeometry(0.032, 10, 8),
    blushMat,
    [0.155, 0.205, -0.215],
    undefined,
    [1.2, 0.7, 0.5],
  );
  // Alpine beanie dome + cuffed rim + white pom-pom
  addMesh(
    headPivot,
    new THREE.SphereGeometry(0.262, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.54),
    beanieMat,
    [0, 0.27, 0.02],
    [0.18, 0, 0],
  );
  addMesh(
    headPivot,
    new THREE.TorusGeometry(0.248, 0.046, 10, 24),
    beanieMat,
    [0, 0.31, 0.02],
    [Math.PI / 2 + 0.18, 0, 0],
  );
  addMesh(
    headPivot,
    new THREE.SphereGeometry(0.068, 12, 10),
    porcelainMat,
    [0, 0.545, 0.08],
  );

  // --- LEFT & RIGHT ARMS ---
  let leftHandRingMat!: THREE.MeshBasicMaterial;
  let rightHandRingMat!: THREE.MeshBasicMaterial;
  let leftHandRingMesh!: THREE.Mesh;
  let rightHandRingMesh!: THREE.Mesh;

  const buildArm = (
    side: -1 | 1,
    shoulderPivot: THREE.Group,
    forearmPivot: THREE.Group,
    tipAnchor: THREE.Object3D,
  ) => {
    shoulderPivot.position.set(side * 0.33, 0.25, 0);
    bodyVisual.add(shoulderPivot);

    addMesh(shoulderPivot, new THREE.SphereGeometry(0.095, 14, 12), jointMat, [0, 0, 0]);
    addMesh(
      shoulderPivot,
      new THREE.CapsuleGeometry(0.082, 0.18, 8, 14),
      porcelainMat,
      [side * 0.02, -0.14, 0],
    );

    forearmPivot.position.set(side * 0.02, -0.27, 0);
    shoulderPivot.add(forearmPivot);

    addMesh(forearmPivot, new THREE.SphereGeometry(0.075, 12, 10), jointMat, [0, 0, 0]);
    addMesh(
      forearmPivot,
      new THREE.CapsuleGeometry(0.076, 0.16, 8, 14),
      porcelainMat,
      [0, -0.13, -0.02],
      [0.16, 0, 0],
    );
    addMesh(
      forearmPivot,
      new THREE.SphereGeometry(0.094, 14, 12),
      porcelainMat,
      [0, -0.265, -0.045],
      undefined,
      [0.95, 1.05, 1.1],
    );

    tipAnchor.position.set(0, -0.29, -0.055);
    forearmPivot.add(tipAnchor);

    const ringGeo = new THREE.TorusGeometry(0.115, 0.018, 10, 24);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: side === -1 ? 0x3b82f6 : 0xf97316,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(0, -0.22, -0.035);
    ringMesh.visible = false;
    forearmPivot.add(ringMesh);
    disposables.push(ringGeo, ringMat);

    if (side === -1) {
      leftHandRingMat = ringMat;
      leftHandRingMesh = ringMesh;
    } else {
      rightHandRingMat = ringMat;
      rightHandRingMesh = ringMesh;
    }
  };

  buildArm(-1, leftArmPivot, leftForearmPivot, leftHandTipAnchor);
  buildArm(1, rightArmPivot, rightForearmPivot, rightHandTipAnchor);

  // --- LEFT & RIGHT LEGS (boots flush at y = -0.90) ---
  const buildLeg = (side: -1 | 1, hipPivot: THREE.Group, shinPivot: THREE.Group) => {
    hipPivot.position.set(side * 0.145, -0.32, 0);
    bodyVisual.add(hipPivot);

    addMesh(
      hipPivot,
      new THREE.CapsuleGeometry(0.104, 0.14, 10, 14),
      porcelainMat,
      [0, -0.11, 0],
    );

    shinPivot.position.set(0, -0.24, 0);
    hipPivot.add(shinPivot);

    addMesh(shinPivot, new THREE.SphereGeometry(0.09, 12, 10), jointMat, [0, 0, -0.015]);
    addMesh(
      shinPivot,
      new THREE.CapsuleGeometry(0.092, 0.12, 10, 14),
      porcelainMat,
      [0, -0.125, 0],
    );
    addMesh(
      shinPivot,
      new THREE.CapsuleGeometry(0.085, 0.12, 8, 12),
      jointMat,
      [0, -0.255, -0.04],
      [Math.PI / 2, 0, 0],
      [1.12, 1.0, 0.96],
    );
  };

  buildLeg(-1, leftLegPivot, leftShinPivot);
  buildLeg(1, rightLegPivot, rightShinPivot);

  return {
    bodyVisual,
    headPivot,
    leftArmPivot,
    rightArmPivot,
    leftForearmPivot,
    rightForearmPivot,
    leftHandTipAnchor,
    rightHandTipAnchor,
    leftHandRingMesh,
    leftHandRingMat,
    rightHandRingMesh,
    rightHandRingMat,
    leftLegPivot,
    rightLegPivot,
    leftShinPivot,
    rightShinPivot,
    beanieMat,
    scarfMat,
    disposables,
    setAccentColor,
  };
}
