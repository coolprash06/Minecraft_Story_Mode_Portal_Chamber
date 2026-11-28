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

## Remaining phases

0. **Performance Step 0 (pending):** re-measure on AC power at the real pixel ratio, full `?off=` cost table, ranked optimisations. Don't change visuals until approved.
3. **Free Roam:** F toggles it. WASD with pointer-lock 360° look, Shift to sprint, SPACE to jump, collision, a crosshair and an Esc pause menu.
4. **Portal mechanic for the other 17 portals.** Add a `FLINTS` entry for each.
5. **Sound:** synthesised WebAudio sounds plugged into `setSfxPlayer`, plus a mute toggle.
6. **Warp and dimensions.**
7. **Mission 1 – Pirates in the Caribbean (portal 0's dimension):** real 3D ship world, 6 pirates, emerald trading, hostility, combat, rescuing Natalie, pearl reward. Spec in `docs/mission-1-pirates.md`. Needs Free Roam (Phase 3) first.
8. **Extras.**
9. **Polish and a production build.**

## Debug URL flags

| Flag | Effect |
|---|---|
| `?debug` | FPS, GPU timer, sfx console logs |
| `?bench=N` | Glides the whole rail in N s, then puts `BENCH` stats in the tab title |
| `?lit=all` or `?lit=0,3` | Lights those portals (never saved) |
| `?z=-30` `?yaw=180` `?pitch=10` | Start pose (degrees) |
| `?quality=low\|high` | Overrides the device default |
| `?off=a,b` | Measurement switches (see `lib/debug.ts`): `post`, `shadows`, `bloom`, `surfaces`, `motes`, `portallight`, `poolportals`, and the components `hanging`, `flames`, `dust`, `props`, `banners`, `carpet`, `runners`, `frames`, `finale`, `portalfx`, `held` |
| `?pool=N` | Overrides the shadow pool size |
| `?shadowtype=basic\|percentage\|soft` | Shadow filter type |
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
- `controls/`
  - `GlideRig.tsx`: the rail camera (exports `lookState`, and `glideControl.place` to hand control back with a blend).
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
- `lib/device.ts`: `REDUCED_MOTION`, fixed for the session.
- `lib/debug.ts`: `OFF`, the set of `?off=` switches.
- `scene/heldPose.ts`: the held item's camera-space pose (shared by HeldItem and the return flight).

## Conventions

- State lives in `appStore`. One-shot animations go through `emitGame` and `onGame`. Per-frame values live in plain arrays or objects (`portalFx`, `cameraFx`) that GSAP tweens and shaders read, so React never re-renders per frame.
- Particle systems and effects are always mounted, idle and culled in the shader, so every program compiles behind the loading veil.
- `store.journey` (`hall → entering → warp → dimension → returning → hall`) gates all input. It is never saved. The 3D frame pauses during `warp` and `dimension` while GSAP keeps running.
- `PIRATES_PASSIVE` (`config/pirates.ts`, currently `true`): pirates never attack or turn hostile anywhere. All gameplay must ask `hostileAllowed()` before hostile behaviour. Only showcase buttons pass `manual = true`, which plays the hostile and attack animations regardless.
- Portal ids run bay by bay from the entrance, left (−x) then right (+x). So 0 is bay 0 left, 1 is bay 0 right, and so on.
