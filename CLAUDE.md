# The Hall of Portals

A 3D voxel portal corridor web page in an original, Minecraft-inspired style: a royal armoury hall with 18 coloured portals (9 per side), a Glide camera on rails, and a portal-lighting mechanic with flint items.

- **Stack:** Vite, React 19, TypeScript, React Three Fiber, drei, postprocessing, GSAP, Tailwind v4, @fontsource (Press Start 2P, VT323).
- **Quality reference (read only, never modify):** `../Breaking Bad Login Page` (same stack).
- **Behaviour reference (read only, never modify):** `../Minecraft Nether Portal Login Page`. It shows how lighting and entering a portal should feel.
- **Run:** `npm run dev` (http://localhost:5174), `npm run typecheck`, `npm run build`, `npm run preview`.

## Rules

- No official Minecraft/Mojang textures, sounds, logos, fonts, UI strings or characters. Everything must be original and procedural.
- **Never commit.** The user commits.
- **Propose first, wait for approval, then build.** Stop after each phase with test steps. The user tests in Edge on a 2560×1600 screen with an Intel Arc 140T.
- Quality (`high`/`low`) is decided once at startup and stays fixed for the session. Nothing may toggle shaders or lights mid-session.
- All movement is camera-relative, in Glide and in Free Roam.
- Measure performance with `?bench=N` (GPU timer queries), not headless FPS. Benchmark only on AC power: on battery the iGPU throttles to about 30 fps and the numbers are noise.
  - The user's real setup is 2560×1600 at 150 % scaling, so DPR 1.5 and High renders at 1.5 (about 2561×1395 in a maximised Edge).
  - The A/B pose is `?bench=5&fixed&z=-2&lit=all`. Alternate baseline and variant runs, 3+ pairs. Treat ±0.5 ms as noise.
  - Absolute numbers drift ~1 ms with temperature over a long session, so only paired deltas count.
- **Frame budget (High, ratio 1.5, bench pose):** ≤11 ms median and ≤14 ms p90 for the hall. Mission 1's scene needs the same, so new features must fit it.

## Done

- **Phase 1:** voxel hall generator, chunk mesher, procedural 16×16 atlas, Glide camera on rails.
- **Phase 2:** light field with distance culling, a shadow pool (2 lights on High, 1 on Low), post stack, embers and dust, and royal armoury decor (armour stands, weapon displays, original crest banners, gold trim, red carpet). Also 360° drag-look in Glide and the debug flags.
- **Fixes:** camera-relative W/S in Glide, an end-wall finale with an original "Founding King" portrait, and visible unlit portal frames (desaturated, with a faint glow in the portal's colour).
- **Soul-fire chandeliers.** The previous warm design is in `docs/chandelier-warm-gold.md`.
- **Phase 4 slice, portal 0 only** (blue, bay 0, left side):
  - Azure Flint in an item frame, a 9-slot hotbar, keys 1–9 to hold an item, and the held item shown in view.
  - Click vs drag uses a 5 px threshold.
  - Ignite: the surface fills bottom-up, with sparks, a frame flare, the floor light pool and a camera shake.
  - The wrong flint or no flint gives a fizzle and a toast.
  - Progress is saved in sessionStorage.
  - `playSfx` hooks are in place.
- **Carpet pathways:** a side runner from the main carpet to every portal (all 18), ending in a flat mat with a border in the portal's colour. The border is desaturated while unlit and glows once lit.
- **Portal entry, portal 0:** hover shows "Click to enter".
  - The camera leaves the rail, walks the runner with head bob, and jumps over the sill. The FOV stretch is capped at 90°.
  - Effects: spiral mode, a pulse vignette, the warp swirl, then a whiteout.
  - Screens: the warp screen, then the dimension placeholder ("PIRATES IN THE CARIBBEAN"). "Return to Corridor" or Esc puts you back on the rail in front of the portal, still lit.
  - Esc during the walk cancels and glides you back onto the rail.
  - Reduced motion: a plain fade, with no bob, stretch, warp or shake.
  - Ignite now has a bloom kick.
  - `enterPortal(id, 'free')` is ready for Free Roam: only the crossing runs.
- **Returning a flint:** hold a flint and click its own empty frame, at any time.
  - It flies from the hand back into the frame and leaves the hotbar.
  - If its portal was lit, the portal deactivates: the surface drains top-down, there's smoke and a few dying sparks, and the screen dims softly. The glow, floor pool and mat border follow the light field.
  - Prompts and toasts: "Click to return X", "This isn't its frame", "Hold X to return it".
  - Data-driven from `FLINTS`. Saved to sessionStorage. Reduced motion: no flight, the surface fades out.
- **Pirate showcase (Mission 1, stage 1):** `?showcase=pirates`. The 6 original pirates on a lit stage in the hall's style, one at a time.
  - Rig: head, torso, 2 arms and 2 legs, built from voxels with procedurally painted pixel skins and voxel accessories. Every pirate holds a dagger in the right hand.
  - It is data-driven: one `PIRATES` entry per pirate (name, role, post, build, palette, 8×8 face, hair, outfit, accessories, dagger).
  - Seven procedural animations: idle, walk, trade, hostile, attack, hurt (red flash and knockback), and death (topple, pixel smoke, respawn).
  - Controls: a slow turntable, drag to rotate, ←/→ or the arrows to switch pirate, and 1–7 or the buttons to animate.
  - App lazy-loads it as its own chunk, so the hall never loads it.
- **Performance Step 0 (2026-11-28).** Cost table at ratio 1.5, all lit, fixed pose, baseline 13.4 ms median / 16.1 ms p90:
  - shadows 4.3–4.9 ms (of which PCF filtering 3.0, the second pool light 2.4);
  - post 2.9 ms (SMAA 1.1, bloom 0.5, grain 0);
  - props 1.5 ms;
  - everything else ≤0.5 ms, which is noise;
  - ratio 1.25 would save 3.0 ms.
  - The old "10 → 13.4 ms drift" was not real: every commit from bfb2525 to 6b344f3 benches at 9.8 ± 0.1 ms under the old conditions. The high readings were throttled runs.
- **Perf pass 1 (2026-11-28), no visible change.** About −2.6 ms paired at the bench pose: 14.2 → 11.2 ms median and 16.6 → 13.6 ms p90 in that (warm) session. Moving glide: 14.0 → 11.2 ms median and 17.3 → 14.3 ms p90.
  - **Shadow filter** (`gfx/shadowFilter.ts`, about −0.7 ms). The hall now uses the Basic shadow map. A 4-tap soft filter (point-sampled compares on a rotated Vogel disk with the same radius) replaces Basic's hard tap. On the Arc, three's PCF hardware depth-compare path cost about 2.5 ms whatever the tap count. Same softness, with a slightly more dithered penumbra up close.
  - **Draw order** (about −0.8 ms). The corridor (walls, floor, ceiling) draws after every other opaque mesh, so early-z skips the wall and floor pixels hidden behind props and carpet. Nothing is coplanar, so the image is identical.
  - **Props mesh** (≈0 ms measured). Static props merge coplanar same-colour faces (208k → 100k triangles, identical pixels). It's kept because it costs nothing and shrinks shadow-map re-renders. Props were already merged per chunk (109 draw calls per frame in total), so instancing was not needed.

- **Phase 3: Free Roam (2026-11-28).**
  - **Mode switch:** F, or the mode badge (it's a button), toggles Glide ⇄ Free Roam. Glide is the default on every load and the mode is never saved. Not offered on touch devices.
    - **Into Free Roam:** starts from the current camera pose (feet dropped to the floor, same yaw and pitch) and blends from the rail pose over 0.45 s.
    - **Back to Glide:** goes to the nearest rail point with GlideRig's hand-back blend.
  - **Movement:** WASD, fully camera-relative, with pointer-lock look (360°, pitch ±89°).
    - Walk 4.3 m/s, Shift sprints at 5.6 m/s with a +5° FOV kick that eases in and out.
    - SPACE jumps (apex about 1.2 m, buffered; holding it keeps hopping) with gravity.
    - Small ledges (carpet, runners, mats) are stepped up and down smoothly.
  - **Collision:** swept-box against the voxel grid, plus a box per static prop from its real model bounds, plus thin carpet, runner and mat boxes (surface `carpet`).
  - **Portals:**
    - Unlit portal openings are blocked.
    - A lit opening is a trigger above the 1-block sill, so only a jump gets in (`enterPortal(id, 'free')`, crossing only).
    - Clicking a lit portal in Free Roam does nothing; the prompt says "Jump in to enter".
    - Coming back from a dimension entered in Free Roam puts you on that portal's mat facing the hall. The Return button's click re-locks the mouse.
  - **Interaction:** a crosshair, and E or left-click interacts with what it targets (reach 6 m; Glide keeps 20 m). The prompt sits under the crosshair; toasts are the same as in Glide. 1–9 still select slots.
  - **Pause menu:** Esc releases the lock and opens it, with Resume, Controls, Switch to Glide and Return to Entrance. If the browser refuses a quick re-lock, it says "One moment…".
  - **Head bob and sounds:**
    - Head bob, a landing dip and step smoothing. With reduced motion: no bob, dip, FOV kick or blend.
    - Sound hooks: `step` (with `surface`), `jump`, `land` (with `impact`).
  - **HUD:** the badge shows FREE ROAM and the hints change with the mode.
  - **Performance:** 6 worst-angle poses at ratio 1.5, all lit (median / p90):
    - aisle 11.2 / 13.3 ms (the same pose as the hall baseline);
    - nose to a lit portal 9.2 / 11.6;
    - in a recess looking back 10.0 / 11.7;
    - at an armour stand under a torch 9.0 / 10.9;
    - straight up at the chandeliers 10.3 / 12.3;
    - finale 9.8 / 11.6.
    - Free Roam adds no GPU work, and the controller costs about 3 µs of CPU per frame.

## Remaining phases

0. **Perf reserve (for Mission 1, not applied).** Use only if a later phase measures over budget, and ask first:
   1. Render ratio 1.5 → 1.25 on High: about −3.0 ms. Slightly softer image on the 2560 panel.
   2. Shadow pool 2 → 1 on High: about −2.4 ms with PCF, less now. Only the single most important light casts shadows.
   - Smaller items: drop SMAA (−1.1 ms, jaggier edges) and cheaper bloom (about −0.3 ms).
4. **Portal mechanic for the other 17 portals.** Add a `FLINTS` entry for each.
5. **Sound:** synthesised WebAudio sounds plugged into `setSfxPlayer`, plus a mute toggle.
6. **Warp and dimensions.**
7. **Mission 1 – Pirates in the Caribbean (portal 0's dimension):** real 3D ship world, 6 pirates, emerald trading, hostility, combat, rescuing Natalie, pearl reward. Spec in `docs/mission-1-pirates.md`. Reuse `src/player/` for the player: give it the ship's own `CollisionWorld` (its voxel grid `solid`, extra colliders and triggers).
8. **Extras.**
9. **Polish and a production build.**

## Debug URL flags

| Flag | Effect |
|---|---|
| `?debug` | FPS, GPU timer, the render size and actual pixel ratio, sfx console logs |
| `?bench=N` | Glides the whole rail in N s, then puts `BENCH` stats in the tab title. Add `&fixed` to hold the start pose with no sway, for A/B runs. With `fixed`, `?x`, `?y` (eye height), `?z` and `?pitch` (±89°) are unclamped, so Free Roam angles can be measured |
| `?mode=free` | Starts in Free Roam, behind the "Click to play" menu. `?x` `?z` `?yaw` `?pitch` set the start (default: the entrance) |
| `?noclip` | Free Roam flies with no collision (SPACE up, Shift faster). `?y` sets the eye height |
| `?nolock` | Simulates the pointer lock (automated tests: headless browsers refuse it). Esc still pauses. With `?debug`, `window.__free` exposes the player and the store |
| `?dpr=N` | Renders at exactly this pixel ratio, ignoring the quality cap (measurement only) |
| `?lit=all` or `?lit=0,3` | Lights those portals (never saved) |
| `?z=-30` `?yaw=180` `?pitch=10` | Start pose (degrees) |
| `?quality=low\|high` | Overrides the device default |
| `?off=a,b` | Measurement switches (see `lib/debug.ts`): `post`, `shadows`, `bloom`, `smaa`, `grain`, `surfaces`, `motes`, `portallight`, `poolportals`, and the components `hanging`, `flames`, `dust`, `props`, `banners`, `carpet`, `runners`, `frames`, `finale`, `portalfx`, `held` |
| `?pool=N` | Overrides the shadow pool size |
| `?shadowtype=basic\|percentage\|soft` | Shadow map type. The default is `basic` with the soft 4-tap filter. `percentage` is three's PCF (the look before perf pass 1) |
| `?shadowfilter=three` | Basic's stock single hard tap (measurement only) |
| `?shadowtaps=N` | Tap count of the soft filter, 1–8 (default 4) |
| `?order=default` | three's default draw order (the corridor no longer draws last) |
| `?propmesh=voxel` | One quad per voxel face for props (no face merging) |
| `?reset` | Clears the saved session |
| `?give=crimson` | Gives a dev-only flint (to test the mismatch path) |
| `?at=0` | Starts on the rail in front of portal 0, facing it, lit (never saved) |
| `?dim=0` | Starts on portal 0's dimension screen. Return leads to the rail in front of it, lit |
| `?motion=reduce\|full` | Forces reduced motion on or off |
| `?showcase=pirates` | Opens the pirate showcase instead of the hall. Extras: `&pirate=1..6` or an id (`bess`), `&anim=<idle\|walk\|trade\|hostile\|attack\|hurt\|death>`, `&still` (no turntable), `&turn=<deg>` |

## Code map (`src/`)

- `config/`
  - `portals.ts`: colours and per-side order.
  - `items.ts`: `FLINTS`. An entry here enables a portal.
  - `dimensions.ts`: the name, numeral, blurb and backdrop of each portal's dimension.
  - `pirates.ts`: Mission 1's crew (`PIRATES`, one entry per pirate), plus `PIRATES_PASSIVE` and `hostileAllowed()`.
  - `theme.ts`: scene and UI colours, fog.
- `world/`
  - `layout.ts`: `buildHall()`, the deterministic voxel grid plus portals, torches, lanterns, decor and the rail. Also the bay geometry notes.
  - `blocks.ts`, `grid.ts`: block types and voxel storage.
  - `mesher.ts`: chunk meshing.
  - `motion.ts`: shared sway and flicker.
- `gfx/`
  - `atlas.ts`, `tiles.ts`, `voxel.ts`, `pixelArt.ts`, `portrait.ts`, `flintArt.ts`: procedural textures and art.
  - `lightField.ts`: every light as a data texture plus a culling grid. It is injected into materials with `withLightField`.
  - `shadowFilter.ts`: the soft 4-tap point-shadow filter, patched into three's shader chunk at startup (imported first in `main.tsx`).
  - `voxel.ts`: the voxel model mesher. `mesh(scale, origin, merge)` can merge coplanar faces of the same colour.
  - `materials.ts`: shared materials.
  - `portalFx.ts`: per-portal fill, hover, flash and spiral arrays, `cameraFx` (shake, fov), `warpFx` (pulse, warp, flash) and `postFx` (bloom kick).
  - `dimensionArt.ts`: 2D pixel art for the dimension side (the sunset sea with a ship, the warp tunnel).
  - `outline.ts`: hover outlines.
- `scene/`
  - `Experience.tsx`: the Canvas, a single GSAP+R3F frame driver and a shader warm-up.
  - `Corridor`, `Decor` (banners, carpet, runners and mats), `Props`, `Hanging`, `Flames`, `Finale`, `Atmosphere`: the hall and its dressing.
  - `Portals`: the surface shader and motes.
  - `PortalFx`: ignite, fizzle and hover effects.
  - `ItemFrames`, `HeldItem`: items.
  - `Lighting`: the shadow pool and the light-field update.
  - `Effects`: the post stack. The warp distortion has its own `EffectPass`, enabled only while active. The warp tint (pulse and whiteout) merges into the main pass.
  - `GpuTimer`: GPU timer queries.
- `characters/`: the Mission 1 pirates. They are reusable, not tied to the showcase.
  - `pirateModel.ts`: `buildPirate(def)`, which builds the voxel rig parts, skins, accessories and dagger, with pivots. There are 3 head variants (open, narrow and closed eyes).
  - `pirateAnims.ts`: `PirateAnimator`, the procedural poses for the 7 animations, with blending and the hostile gate.
  - `PirateRig.tsx`: the posed R3F rig, the hurt-flash materials and the death smoke puff.
- `showcase/`
  - `PirateShowcase.tsx`: the `?showcase=pirates` page (its Canvas, lights, turntable and pixel UI).
  - `stage.ts`: the stage voxels (brick room, plinth, banners, torches).
- `player/`: the reusable first-person controller (no React, R3F or hall imports; Mission 1 reuses it).
  - `PlayerController.ts`: movement, jump and gravity, step-up and step-down, footsteps, and `viewPose()` (bob, landing dip, step smoothing, sprint FOV). All tunables are in `PLAYER`.
  - `collision.ts`: `CollisionWorld` (`solid(x, y, z)` in the VoxelGrid cell convention, `colliders` with an optional `surface` and `active()`, and `triggers`). Swept movement one axis at a time.
  - `input.ts`: `FirstPersonInput` (keys, pointer lock and look deltas; `onChange(locked, ours)`).
- `world/hallColliders.ts`: `buildHallWorld(hooks)` builds the hall's CollisionWorld from the layout and `propPlacements()`. Lit state and portal entry come in as callbacks.
- `controls/`
  - `GlideRig.tsx`: the rail camera (exports `lookState`, and `glideControl.place` to hand control back with a blend).
  - `FreeRig.tsx`: Free Roam in the hall: the mode switch, the pointer lock, E/click, footstep sounds, and `freeControl.place` (EntryRig's return).
  - `EntryRig.tsx`: the scripted portal-entry camera (walk, jump, cancel, return).
  - `Interaction.tsx`: hover picking, and click vs drag.
  - `interact.ts`: targets, ray picking and the voxel walk.
- `state/`
  - `store.ts`: a tiny external store (`appStore`, `useApp`) plus sessionStorage persistence.
  - `game.ts`: gameplay rules (take, return, strike, ignite, fizzle, extinguish, enter, cancel, cross, arrive, return to corridor). `returnCheck` drives both the frame prompt and the click.
  - `events.ts`: one-shot events (`onGame`, `emitGame`).
- `audio/sfx.ts`: `playSfx` hooks. This is a no-op until phase 5.
- `ui/`
  - `Hud`: title, mode badge, hints, perf.
  - `Hotbar`.
  - `Prompt`: hover prompt and toasts.
  - `Loader`.
  - `Journey`: the veil, the warp screen and the dimension placeholder.
  - `PauseMenu`: Free Roam's pause menu and the "Return to Entrance" fade. The crosshair lives in `Hud`.
- `lib/device.ts`: `REDUCED_MOTION`, fixed for the session.
- `lib/debug.ts`: `OFF`, the set of `?off=` switches.
- `scene/heldPose.ts`: the held item's camera-space pose (shared by HeldItem and the return flight).

## Conventions

- State lives in `appStore`. One-shot animations go through `emitGame` and `onGame`. Per-frame values live in plain arrays or objects (`portalFx`, `cameraFx`) that GSAP tweens and shaders read, so React never re-renders per frame.
- Particle systems and effects are always mounted, idle and culled in the shader, so every program compiles behind the loading veil.
- `store.mode` (never saved) and `store.freeLock` (`locked`, `pending`, `released` or `refused`) gate Free Roam input. The pause menu shows whenever the mode is free in the hall without the lock.
- `store.journey` (`hall → entering → warp → dimension → returning → hall`) gates all input. It is never saved. The 3D frame pauses during `warp` and `dimension` while GSAP keeps running.
- `PIRATES_PASSIVE` (`config/pirates.ts`, currently `true`): pirates never attack or turn hostile anywhere. All gameplay must ask `hostileAllowed()` before hostile behaviour. Only showcase buttons pass `manual = true`, which plays the hostile and attack animations regardless.
- Portal ids run bay by bay from the entrance, left (−x) then right (+x). So 0 is bay 0 left, 1 is bay 0 right, and so on.
