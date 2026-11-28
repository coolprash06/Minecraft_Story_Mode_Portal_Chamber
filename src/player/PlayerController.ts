/**
 * First-person player controller (reusable: the hall's Free Roam now, Mission 1's ship later).
 * Plain TypeScript, no React / R3F / world imports: it moves a box through any CollisionWorld.
 *
 *  • Movement is camera-relative: W/S along the view direction flattened onto the ground, A/D
 *    strafe; diagonals are normalised. Quick acceleration on the ground, little control in the air.
 *  • Shift sprints (forward only). SPACE jumps (buffered briefly, so a press just before landing
 *    still counts) with gravity; small ledges (carpets, mats, a low step) are stepped up onto.
 *  • The view layer (`viewPose`) adds the head bob, the landing dip, step smoothing and the sprint
 *    FOV kick, all eased; with `reducedMotion` only the step smoothing remains.
 *  • Events: onStep (each footfall, with the surface underfoot), onJump, onLand (impact speed).
 *  • noclip: flies along the full view direction (SPACE up, Shift faster), no collision.
 */
import { nearColliders, runTriggers, sweepAxis, type Box, type Collider, type CollisionWorld } from './collision'

export const PLAYER = {
  width: 0.6,
  height: 1.8,
  eye: 1.7,
  walk: 4.3,
  sprint: 5.6,
  accelGround: 45,
  accelAir: 9,
  gravity: 25,
  jumpHeight: 1.25,
  maxFall: 40,
  stepHeight: 0.36,
  /** Max move per collision sub-step (m): well under a cell, so nothing tunnels through. */
  subStep: 0.2,
  /** Distance per footfall (m) walking / sprinting. */
  stride: 1.35,
  strideSprint: 1.65,
  /** Radians per pixel of mouse movement. */
  lookSensitivity: 0.0022,
  pitchLimit: (89 * Math.PI) / 180,
  sprintFov: 5,
  jumpBuffer: 0.12,
  noclipSpeed: 8,
} as const

export interface MoveInput {
  /** −1..1: forward (W) / back (S). */
  forward: number
  /** −1..1: right (D) / left (A). */
  right: number
  jump: boolean
  sprint: boolean
}

export interface ViewPose {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
  /** Extra field of view (degrees). */
  fov: number
}

export interface PlayerEvents {
  onStep?: (surface: string, at: [number, number, number]) => void
  onJump?: (at: [number, number, number]) => void
  onLand?: (impact: number, surface: string, at: [number, number, number]) => void
}

const damp = (from: number, to: number, rate: number, dt: number) => to + (from - to) * Math.exp(-rate * dt)

export class PlayerController {
  /** Feet position (centre of the box's bottom face). */
  x = 0
  y = 0
  z = 0
  vx = 0
  vy = 0
  vz = 0
  yaw = 0
  pitch = 0
  onGround = false
  noclip = false
  reducedMotion = false
  /** Surface underfoot (from the last ground contact). */
  surface = 'stone'

  /** Stride phase (π per footfall), advanced by distance walked on the ground. */
  private phase = 0
  private steps = 0
  private bobAmount = 0
  private sprintK = 0
  private landDip = 0
  private stepSmooth = 0
  private jumpBufferT = 0
  private jumpHeld = false
  private near: Collider[] = []
  private box: Box = { min: [0, 0, 0], max: [0, 0, 0] }

  constructor(
    public world: CollisionWorld,
    public events: PlayerEvents = {},
  ) {}

  /** Teleport (feet position) and face (yaw, pitch); clears motion. */
  place(x: number, y: number, z: number, yaw: number, pitch = 0) {
    this.x = x
    this.y = y
    this.z = z
    this.yaw = yaw
    this.pitch = Math.max(-PLAYER.pitchLimit, Math.min(PLAYER.pitchLimit, pitch))
    this.vx = this.vy = this.vz = 0
    this.bobAmount = this.landDip = this.stepSmooth = this.sprintK = 0
    this.onGround = false
    this.settle()
  }

  /** Drop the feet onto whatever is below (up to 3 m), without a landing event. */
  settle() {
    if (this.noclip) return
    const b = this.writeBox()
    nearColliders(this.world, b, 3.5, this.near)
    const r = sweepAxis(this.world, b, 1, -3, this.near)
    this.y = b.min[1]
    this.onGround = r.blocked
    if (r.blocked) this.surface = r.hit?.surface ?? this.world.gridSurface ?? 'stone'
  }

  /** Mouse look in pixels (pointer-lock movementX / movementY). */
  look(dx: number, dy: number) {
    this.yaw -= dx * PLAYER.lookSensitivity
    this.pitch = Math.max(-PLAYER.pitchLimit, Math.min(PLAYER.pitchLimit, this.pitch - dy * PLAYER.lookSensitivity))
  }

  private writeBox() {
    const h = PLAYER.width / 2
    const b = this.box
    b.min[0] = this.x - h
    b.max[0] = this.x + h
    b.min[1] = this.y
    b.max[1] = this.y + PLAYER.height
    b.min[2] = this.z - h
    b.max[2] = this.z + h
    return b
  }

  update(dt: number, input: MoveInput) {
    if (dt <= 0) return
    if (this.noclip) return this.fly(dt, input)

    // 1. wanted horizontal velocity, relative to the view
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    // forward = (−sin, −cos), right = (cos, −sin) for a camera looking down −z at yaw 0
    let wx = -sin * input.forward + cos * input.right
    let wz = -cos * input.forward - sin * input.right
    const len = Math.hypot(wx, wz)
    const sprinting = input.sprint && input.forward > 0 && len > 0
    const speed = sprinting ? PLAYER.sprint : PLAYER.walk
    if (len > 0) {
      wx = (wx / len) * speed
      wz = (wz / len) * speed
    }
    const accel = (this.onGround ? PLAYER.accelGround : PLAYER.accelAir) * dt
    const dvx = wx - this.vx
    const dvz = wz - this.vz
    const dv = Math.hypot(dvx, dvz)
    if (dv <= accel) {
      this.vx = wx
      this.vz = wz
    } else {
      this.vx += (dvx / dv) * accel
      this.vz += (dvz / dv) * accel
    }

    // 2. jump (buffered) and gravity
    // a fresh press is remembered briefly (pressed just before landing still jumps); holding SPACE
    // keeps hopping, like most block games
    if (input.jump && !this.jumpHeld) this.jumpBufferT = PLAYER.jumpBuffer
    this.jumpHeld = input.jump
    const wantJump = input.jump || this.jumpBufferT > 0
    this.jumpBufferT = Math.max(0, this.jumpBufferT - dt)
    if (wantJump && this.onGround) {
      this.vy = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight)
      this.onGround = false
      this.jumpBufferT = 0
      this.events.onJump?.([this.x, this.y, this.z])
    }
    this.vy = Math.max(-PLAYER.maxFall, this.vy - PLAYER.gravity * dt)

    // 3. move, in sub-steps
    const dx = this.vx * dt
    const dy = this.vy * dt
    const dz = this.vz * dt
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / PLAYER.subStep))
    const b = this.writeBox()
    nearColliders(this.world, b, Math.hypot(dx, dy, dz) + PLAYER.stepHeight + 0.5, this.near)
    const wasGround = this.onGround
    const fallSpeed = -this.vy
    let grounded = false
    let groundHit: Collider | null = null
    let movedXZ = 0
    for (let i = 0; i < n; i++) {
      const ry = sweepAxis(this.world, b, 1, dy / n, this.near)
      if (ry.blocked) {
        if (dy < 0) {
          grounded = true
          groundHit = ry.hit
        }
        this.vy = dy < 0 ? -0.01 : 0
      }
      movedXZ += this.moveHorizontal(b, dx / n, dz / n, grounded || wasGround)
    }
    // walked off a small ledge (a carpet's edge, a step)? snap down onto the floor below it
    if (!grounded && wasGround && this.vy <= 0) {
      const before = b.min[1]
      const probe = sweepAxis(this.world, b, 1, -PLAYER.stepHeight, this.near)
      if (probe.blocked) {
        grounded = true
        groundHit = probe.hit
        this.stepSmooth += before - b.min[1]
      } else {
        b.min[1] = before
        b.max[1] = before + PLAYER.height
      }
    }
    this.x = (b.min[0] + b.max[0]) / 2
    this.y = b.min[1]
    this.z = (b.min[2] + b.max[2]) / 2
    this.onGround = grounded
    if (grounded) {
      this.surface = groundHit?.surface ?? this.world.gridSurface ?? 'stone'
      if (!wasGround) {
        this.events.onLand?.(fallSpeed, this.surface, [this.x, this.y, this.z])
        if (!this.reducedMotion) this.landDip = Math.min(0.14, Math.max(0, fallSpeed - 2) * 0.016)
      }
    }

    // 4. footsteps (one at the bottom of each bob dip) and the view effects
    if (grounded && movedXZ > 0) {
      this.phase += (movedXZ / this.strideNow()) * Math.PI
      const k = Math.floor(this.phase / Math.PI + 0.5)
      if (k > this.steps) {
        this.steps = k
        this.events.onStep?.(this.surface, [this.x, this.y, this.z])
      }
    }
    const hSpeed = Math.hypot(this.vx, this.vz)
    this.bobAmount = damp(this.bobAmount, grounded ? Math.min(1, hSpeed / PLAYER.walk) : 0, 8, dt)
    this.sprintK = damp(this.sprintK, sprinting && hSpeed > PLAYER.walk * 0.8 ? 1 : 0, 5, dt)
    this.landDip = damp(this.landDip, 0, 9, dt)
    this.stepSmooth = damp(this.stepSmooth, 0, 14, dt)

    runTriggers(this.world, b)
  }

  private strideNow() {
    return this.sprintK > 0.5 ? PLAYER.strideSprint : PLAYER.stride
  }

  /** X then Z; when blocked on the ground, retry from a step higher and keep the better result. */
  private moveHorizontal(b: Box, dx: number, dz: number, canStep: boolean) {
    const sx = b.min[0]
    const sz = b.min[2]
    const sy = b.min[1]
    const rx = sweepAxis(this.world, b, 0, dx, this.near)
    const rz = sweepAxis(this.world, b, 2, dz, this.near)
    const plain = Math.hypot(b.min[0] - sx, b.min[2] - sz)
    if (!canStep || PLAYER.stepHeight <= 0 || (!rx.blocked && !rz.blocked)) return plain
    // try the step: up, across, back down
    const t: Box = { min: [sx, sy, sz], max: [sx + (b.max[0] - b.min[0]), sy + PLAYER.height, sz + (b.max[2] - b.min[2])] }
    const up = sweepAxis(this.world, t, 1, PLAYER.stepHeight, this.near).moved
    sweepAxis(this.world, t, 0, dx, this.near)
    sweepAxis(this.world, t, 2, dz, this.near)
    sweepAxis(this.world, t, 1, -up - 0.01, this.near)
    const stepped = Math.hypot(t.min[0] - sx, t.min[2] - sz)
    if (stepped > plain + 1e-4 && t.min[1] > sy + 1e-4) {
      // smooth the camera over the step instead of popping up
      this.stepSmooth -= t.min[1] - sy
      for (let i = 0; i < 3; i++) {
        b.min[i] = t.min[i]
        b.max[i] = t.max[i]
      }
      return stepped
    }
    return plain
  }

  private fly(dt: number, input: MoveInput) {
    const cp = Math.cos(this.pitch)
    const fx = -Math.sin(this.yaw) * cp
    const fy = Math.sin(this.pitch)
    const fz = -Math.cos(this.yaw) * cp
    const rx = Math.cos(this.yaw)
    const rz = -Math.sin(this.yaw)
    const sp = PLAYER.noclipSpeed * (input.sprint ? 2.5 : 1) * dt
    this.x += (fx * input.forward + rx * input.right) * sp
    this.y += (fy * input.forward + (input.jump ? 1 : 0)) * sp
    this.z += (fz * input.forward + rz * input.right) * sp
    this.vx = this.vy = this.vz = 0
    this.bobAmount = this.sprintK = 0
  }

  /** Camera pose: eye position plus the head bob, landing dip, step smoothing and sprint FOV. */
  viewPose(out: ViewPose): ViewPose {
    out.x = this.x
    out.y = this.y + PLAYER.eye + this.stepSmooth
    out.z = this.z
    out.yaw = this.yaw
    out.pitch = this.pitch
    out.roll = 0
    out.fov = 0
    if (this.reducedMotion) return out
    const phase = this.phase
    const b = this.bobAmount * (0.75 + 0.35 * this.sprintK)
    // a dip at each footfall, a small sway across the direction of travel, a hint of roll
    out.y += -Math.abs(Math.sin(phase)) * 0.05 * b - this.landDip
    const sway = Math.sin(phase) * 0.028 * b
    out.x += Math.cos(this.yaw) * sway
    out.z += -Math.sin(this.yaw) * sway
    out.roll = Math.sin(phase) * 0.006 * b
    out.fov = PLAYER.sprintFov * this.sprintK * this.sprintK * (3 - 2 * this.sprintK)
    return out
  }
}
