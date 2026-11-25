import * as CANNON from 'cannon-es';
import type { StaticBoxSpec } from '../types';

export const PHYSICS_FIXED_TIME_STEP = 1 / 60;
const MAX_SUB_STEPS = 4;

export class PhysicsWorld {
  public readonly world: CANNON.World;
  public readonly stoneMaterial: CANNON.Material;
  public readonly playerMaterial: CANNON.Material;
  public readonly blockMaterial: CANNON.Material;

  private accumulator = 0;

  constructor() {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.81, 0),
    });

    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = false;

    const solver = this.world.solver as CANNON.GSSolver;
    solver.iterations = 10;
    solver.tolerance = 0.001;

    this.stoneMaterial = new CANNON.Material('stone');
    this.playerMaterial = new CANNON.Material('player');
    this.blockMaterial = new CANNON.Material('block');

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.playerMaterial, this.stoneMaterial, {
        // Zero passive contact friction avoids Cannon-es wall sticking and foot-snag torque;
        // PlayerCharacter applies active grounded traction and braking forces.
        friction: 0,
        restitution: 0.04,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
      }),
    );

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.blockMaterial, this.stoneMaterial, {
        friction: 0.5,
        restitution: 0.24,
        contactEquationStiffness: 1e7,
        contactEquationRelaxation: 3,
      }),
    );

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.playerMaterial, this.blockMaterial, {
        friction: 0.42,
        restitution: 0.22,
      }),
    );

    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.blockMaterial, this.blockMaterial, {
        friction: 0.48,
        restitution: 0.22,
      }),
    );
  }

  public addStaticBox(spec: StaticBoxSpec): CANNON.Body {
    const [w, h, d] = spec.size;
    const [x, y, z] = spec.position;
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      material: this.stoneMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(w * 0.5, h * 0.5, d * 0.5)),
      position: new CANNON.Vec3(x, y, z),
    });
    if (spec.rotationX || spec.rotationY || spec.rotationZ) {
      body.quaternion.setFromEuler(
        spec.rotationX ?? 0,
        spec.rotationY ?? 0,
        spec.rotationZ ?? 0,
      );
    }
    this.world.addBody(body);
    return body;
  }

  public addKinematicBox(
    size: [number, number, number],
    position: [number, number, number],
    rotationY = 0,
  ): CANNON.Body {
    const [w, h, d] = size;
    const [x, y, z] = position;
    const body = new CANNON.Body({
      type: CANNON.Body.KINEMATIC,
      material: this.stoneMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(w * 0.5, h * 0.5, d * 0.5)),
      position: new CANNON.Vec3(x, y, z),
    });
    if (rotationY) {
      body.quaternion.setFromEuler(0, rotationY, 0);
    }
    this.world.addBody(body);
    return body;
  }

  public addDynamicBox(
    size: [number, number, number],
    position: [number, number, number],
    mass: number,
    rotationY = 0,
  ): CANNON.Body {
    const [w, h, d] = size;
    const [x, y, z] = position;
    const body = new CANNON.Body({
      mass,
      material: this.blockMaterial,
      shape: new CANNON.Box(new CANNON.Vec3(w * 0.5, h * 0.5, d * 0.5)),
      position: new CANNON.Vec3(x, y, z),
      linearDamping: 0.14,
      angularDamping: 0.24,
    });
    if (rotationY) {
      body.quaternion.setFromEuler(0, rotationY, 0);
    }
    this.world.addBody(body);
    return body;
  }

  public addDynamicSphere(
    radius: number,
    position: [number, number, number],
    mass: number,
    linearDamping = 0.16,
    angularDamping = 0.28,
  ): CANNON.Body {
    const [x, y, z] = position;
    const body = new CANNON.Body({
      mass,
      material: this.blockMaterial,
      shape: new CANNON.Sphere(radius),
      position: new CANNON.Vec3(x, y, z),
      linearDamping,
      angularDamping,
    });
    this.world.addBody(body);
    return body;
  }

  public addDistanceConstraint(
    bodyA: CANNON.Body,
    bodyB: CANNON.Body,
    distance: number,
    maxForce = 1e5,
  ): CANNON.DistanceConstraint {
    const constraint = new CANNON.DistanceConstraint(bodyA, bodyB, distance, maxForce);
    this.world.addConstraint(constraint);
    return constraint;
  }

  public clearLevelBodies(keepBody: CANNON.Body): void {
    const constraintsCopy = [...this.world.constraints];
    for (const c of constraintsCopy) {
      this.world.removeConstraint(c);
    }
    const bodiesCopy = [...this.world.bodies];
    for (const b of bodiesCopy) {
      if (b !== keepBody) {
        this.world.removeBody(b);
      }
    }
    this.accumulator = 0;
  }

  private stabilizeDynamicBodies(): void {
    const maxLinSq = 42 * 42;
    const maxAngSq = 28 * 28;
    const bodies = this.world.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.type !== CANNON.Body.DYNAMIC || b.mass <= 0) continue;

      // Guard against non-finite corruption
      if (
        !Number.isFinite(b.position.x) ||
        !Number.isFinite(b.position.y) ||
        !Number.isFinite(b.position.z) ||
        !Number.isFinite(b.velocity.x) ||
        !Number.isFinite(b.velocity.y) ||
        !Number.isFinite(b.velocity.z)
      ) {
        b.velocity.set(0, 0, 0);
        b.angularVelocity.set(0, 0, 0);
        b.force.set(0, 0, 0);
        b.torque.set(0, 0, 0);
        if (!Number.isFinite(b.position.x) || !Number.isFinite(b.position.y) || !Number.isFinite(b.position.z)) {
          b.position.set(0, 4, 0);
        }
        continue;
      }

      const linSq =
        b.velocity.x * b.velocity.x +
        b.velocity.y * b.velocity.y +
        b.velocity.z * b.velocity.z;
      if (linSq > maxLinSq) {
        const s = 42 / Math.sqrt(linSq);
        b.velocity.x *= s;
        b.velocity.y *= s;
        b.velocity.z *= s;
      }

      const angSq =
        b.angularVelocity.x * b.angularVelocity.x +
        b.angularVelocity.y * b.angularVelocity.y +
        b.angularVelocity.z * b.angularVelocity.z;
      if (angSq > maxAngSq) {
        const s = 28 / Math.sqrt(angSq);
        b.angularVelocity.x *= s;
        b.angularVelocity.y *= s;
        b.angularVelocity.z *= s;
      }
    }
  }

  public step(deltaSeconds: number, onSubStep?: (dt: number) => void): void {
    const clampedDelta = Math.min(deltaSeconds, 0.1);
    this.accumulator += clampedDelta;

    let steps = 0;
    while (this.accumulator >= PHYSICS_FIXED_TIME_STEP && steps < MAX_SUB_STEPS) {
      if (onSubStep) {
        onSubStep(PHYSICS_FIXED_TIME_STEP);
      }
      this.world.step(PHYSICS_FIXED_TIME_STEP);
      this.stabilizeDynamicBodies();
      this.accumulator -= PHYSICS_FIXED_TIME_STEP;
      steps++;
    }

    if (steps === MAX_SUB_STEPS) {
      this.accumulator = 0;
    }
  }
}
