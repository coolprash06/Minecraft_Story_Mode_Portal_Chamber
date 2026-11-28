# Mission 1: Pirates in the Caribbean

Portal 0's dimension (the blue portal, bay 0 left, "DIMENSION I"). Today it is a placeholder screen. This mission turns it into a real 3D world that is built in stages.

Everything is original and procedural: no official Minecraft or Mojang textures, sounds, mobs or UI strings, and no film-franchise imagery.

**Status (2026-11-28):**
- The pirate characters exist in a showcase viewer (`?showcase=pirates`).
- Free Roam (Phase 3) is done.
- The ship world, build stage 1: entering through portal 0 loads a real 3D world (the warp screen is its loading screen). It has the open sea, a bright tropical sky, the island, a temporary flat deck and the blue deck portal.
- The real ship, the pirates on board, gameplay, combat and trading are **not built yet**.

---

## Setting

An original voxel pirate ship on open sea. It has five areas:

| Area | Notes |
|---|---|
| Main deck | Open deck, the mast, rigging and the helm. |
| Captain's cabin | At the stern, under the quarterdeck. |
| Crow's nest | At the top of the mast. |
| Hold | Below the main deck: cargo and supplies. |
| Brig | In the lower deck, where Natalie is held. |

**Sky:** a bright tropical day (chosen 2026-11-28). No sunset option.

**The island:** a voxel island about 220 m from the ship, clearly visible from the deck. It matters for the story (see "Getting home").

## Arriving and getting home (story change, 2026-11-28)

- **Arrival:** the player arrives on the main deck through a **blue deck portal**. It is **arrival only**: it does not lead back.
- **Getting home:**
  1. The player sails to the nearby island.
  2. On the island is a **dilapidated portal** (ruined, with a broken frame).
  3. The player lights it with a **flint and steel given by a mermaid**.
  4. Jumping in returns the player to **portal 0's mat in the hall, in Free Roam**.
- **Not built yet.** For now, during development:
  - the deck portal is still a working exit (jump in);
  - the pause menu has "Return to Corridor" (later behind a dev flag).

  Both switch off once the island exit exists.

## The crew

There are 6 pirates, each posted in a different part of the ship. **Every pirate is armed with a dagger.** The designs live in `src/config/pirates.ts`, one data entry per pirate.

| # | Name | Role | Look | Proposed post |
|---|---|---|---|---|
| 1 | Captain Redbeard Vane | Captain | Tall and broad. Long crimson coat with gold buttons and trim, black tricorn hat, thick red beard, gold earring, jewelled dagger. | Captain's cabin |
| 2 | One-Eye Morrow | First Mate | Navy coat, black eyepatch, cheek scar, grey stubble, dark bandana. | Main deck (helm) |
| 3 | Silas Ledger | Quartermaster | Brown waistcoat over a white shirt, round spectacles, neat moustache, ledger book on his belt. | Hold |
| 4 | Barnaby Brine | Cook | Wide build, stained apron, bald, ladle on his belt beside the dagger sheath. | Galley (lower deck) |
| 5 | Pip | Lookout | Small and young. Striped shirt, red bandana, spyglass on a strap. | Crow's nest |
| 6 | Iron Bess | Gunner | Braided hair, soot-streaked face, leather vest, powder horn. | Lower deck, guarding the brig |

The posts are proposals, to be confirmed when the ship is built.

## Currency: emeralds

- **Emeralds** are an original green gem item, not a copy of any existing game's emerald.
- The player holds them in the **left hand**, which is the off-hand slot. This is separate from the 9-slot hotbar and the right hand.

## Trading

- You can trade **only while holding emeralds in your left hand.**
- Six trades are on offer: **Iron Sword, Iron Axe, Cooked Fish, Rare Pearls, Rare Statue, Silver.**
- Hostile pirates can't be traded with.
- When a pirate is willing to trade, it plays the friendly **trade** animation (a nod and an open hand).

## Hostility (for later)

1. If you are **not** holding emeralds in your left hand, the pirates **always attack you.**
2. If you attack **any** pirate, whether or not you hold emeralds, **all 6 become hostile, permanently for that run.**
3. Hostile pirates can't be traded with.

### Passive mode (current)

The config flag `PIRATES_PASSIVE = true` lives in `src/config/pirates.ts`.

- While it is `true`, pirates **never attack or turn hostile anywhere**, whatever the rules above say.
- Gameplay code must ask `hostileAllowed()` before any hostile behaviour. It is the only gate.
- The showcase can still play the hostile and attack animations, but only when they are triggered manually from its buttons.

## Health and death

- The player has a health system and can die.
- Pirates take hits. They play the **hurt** animation (a red flash and knockback) and the **death** animation (a topple and a puff of pixel smoke).

## Captive: Natalie

- Natalie is held in the **brig**.
- The objective is to **kill all 6 pirates and free Natalie.**
- She then gives you an **original pearl reward item.** Later, it goes into an original sealed gate.

## Back in the hall (built later)

- An **armour stand** and a **chest with starting materials** near portal 0.

---

## TBD

These are still open, so don't invent answers. Ask the user.

- **The mermaid:** who she is (Natalie, or a new character).
- **The flint and steel vs. the pearl:** whether the mermaid's flint and steel replaces the pearl reward.
- **Sailing:** how the player gets to the island (steering the ship from the helm, or a rowboat).
- **The ship's name** on the stern board (proposed, waiting for approval).

- **Respawn rules:** what happens when the player dies, whether hostility is reset, and where you respawn.
- **Trade prices:** the emerald cost of each of the 6 trades, and how many emeralds the player starts with or can find.
- **The player's starting weapon.**
- **The pearl's name**, and its art.
- **Natalie's design:** her look and how the rescue plays out.

## Build stages (proposed)

1. ✅ **Pirate characters:** a showcase viewer with the rig, skins, accessories and 7 animations.
2. ✅ Free Roam (Phase 3 of the hall). It is a prerequisite.
3. The ship world, in four build stages:
   1. ✅ The world's plumbing: its own lazy chunk, the warp screen as its loader, sea, tropical sky, the island, a temporary flat deck, and the deck portal (arrival, plus the dev exit).
   2. The voxel ship: hull, decks, captain's cabin, crow's nest, hold, the galley and the brig (Natalie's cell present but empty), sails and rigging, lanterns, sway.
   3. Traversal: the ship's collision, stairs between decks, ladder climbing up the mast.
   4. The 6 pirates at their posts, passive: idle, short patrols, look-at, collision with the player.
4. The emerald off-hand slot and trading UI.
5. Player health, combat, hostility rules (behind `PIRATES_PASSIVE`), and death.
6. Natalie, the rescue and the pearl reward; the hall armour stand and chest.
7. The way home: sailing to the island, the mermaid, the ruined portal (see "Arriving and getting home").
