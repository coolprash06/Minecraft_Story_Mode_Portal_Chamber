/**
 * Mission 1 (Pirates in the Caribbean): the crew. One entry per pirate: name, role, palette,
 * build, face, outfit and accessories. The rig and skins are built from this data alone
 * (characters/pirateModel.ts), so a design is tweaked here. Spec: docs/mission-1-pirates.md.
 */

/**
 * PASSIVE MODE. While true, pirates never attack or turn hostile anywhere. Every piece of gameplay
 * code must ask hostileAllowed() before hostile behaviour. The showcase may still play the hostile
 * and attack animations, but only when they're triggered manually (manual = true).
 */
export const PIRATES_PASSIVE = true

/** The one gate for hostile behaviour. `manual` = a showcase button, never gameplay. */
export const hostileAllowed = (manual = false) => manual || !PIRATES_PASSIVE

/** Torso outfits (the arms and legs follow the outfit: sleeves, cuffs, coat skirts, apron). */
export type Outfit = 'longcoat' | 'coat' | 'waistcoat' | 'apron' | 'striped' | 'vest'

/** short / long hair; bald (with a back fringe); braids (long, framing the face). */
export type HairStyle = 'short' | 'long' | 'bald' | 'braids'

export type Accessory =
  | 'tricorn' // black three-cornered hat with gold trim
  | 'bandana' // head wrap in `accent`, knotted at the back
  | 'beard' // full beard: face 'B' pixels stand out, plus a chin beard below the head
  | 'earring' // gold hoop, left ear
  | 'eyepatch' // strap across the left side of the head ('e' face pixels stand out)
  | 'spectacles' // temples along both sides ('g' face pixels stand out)
  | 'ledger' // book hanging from the belt, left front
  | 'ladle' // on the belt, right front
  | 'sheath' // empty dagger sheath on the belt (the dagger is in hand)
  | 'spyglass' // brass spyglass on a strap across the back
  | 'powderHorn' // ivory powder horn on a strap, right hip
  | 'braids' // two braids down the back
  | 'belly' // the outfit bulges forward at the front

export type DaggerKind = 'jewelled' | 'plain'

/** Proportions, in pixels (1 px = 1/16 block). Torso height (11) and head (8³) are shared. */
export interface PirateBuild {
  /** Overall scale (1 = about 1.9 blocks tall without a hat). */
  scale: number
  /** Torso width (even): 8 slim, 10 broad, 12 wide. Legs are half this wide. */
  torsoW: 8 | 10 | 12
  /** Torso depth (4–6). */
  torsoD: number
  /** Arm width = depth (3–4). */
  armW: number
  /** Leg length (10–12). */
  legH: number
  /** Boot height, and bare shins between boot and trousers (rolled-up trousers). */
  bootH: number
  shins?: number
}

/** All colours sRGB hex. */
export interface PiratePalette {
  skin: string
  skinShade: string
  hair: string
  hairDark: string
  eye: string
  mouth: string
  shirt: string
  shirtShade: string
  /** Coat / waistcoat / apron / vest. */
  outer: string
  outerShade: string
  /** Gold trim, buttons, buckles, laces. */
  trim: string
  trousers: string
  trousersShade: string
  boots: string
  bootsCuff: string
  belt: string
  /** Bandana / cravat / headband. */
  accent: string
  accentShade: string
}

export interface PirateDef {
  id: string
  name: string
  role: string
  /** Proposed post on the ship (mission spec). */
  post: string
  build: PirateBuild
  palette: PiratePalette
  /**
   * Front of the head, 8 × 8, top row first, viewer's left to right. Legend:
   *  s skin · S skin shade · h hair · H hair dark · b brow · W eye white · P pupil · m mouth
   *  t teeth · n nose shade · k blush · f freckle · B beard · M moustache · u stubble
   *  x scar · e eyepatch · g spectacle frame · o soot · D accent (bandana)
   * Narrowed (hostile) and closed (blink) eyes are derived from W / P automatically.
   */
  face: string[]
  hair: HairStyle
  outfit: Outfit
  accessories: Accessory[]
  dagger: DaggerKind
}

export const PIRATES: PirateDef[] = [
  {
    id: 'vane',
    name: 'CAPTAIN REDBEARD VANE',
    role: 'Captain',
    post: "Captain's cabin",
    build: { scale: 1.1, torsoW: 10, torsoD: 5, armW: 3, legH: 12, bootH: 4 },
    palette: {
      skin: '#e0a982',
      skinShade: '#c08060',
      hair: '#b8361f',
      hairDark: '#7e2112',
      eye: '#2a5d8a',
      mouth: '#7a2a20',
      shirt: '#eee6d4',
      shirtShade: '#cfc4ad',
      outer: '#a31d24',
      outerShade: '#73131a',
      trim: '#e8b730',
      trousers: '#2c2a33',
      trousersShade: '#211f27',
      boots: '#2a1c14',
      bootsCuff: '#4a3222',
      belt: '#2a1c14',
      accent: '#16151a',
      accentShade: '#0d0c10',
    },
    face: [
      'hhhhhhhh', //
      'hssssssh',
      'sbbssbbs',
      'sWPssPWs',
      'sssnnsss',
      'BMMMMMMB',
      'BBBmmBBB',
      'BBBBBBBB',
    ],
    hair: 'long',
    outfit: 'longcoat',
    accessories: ['tricorn', 'beard', 'earring'],
    dagger: 'jewelled',
  },
  {
    id: 'morrow',
    name: 'ONE-EYE MORROW',
    role: 'First Mate',
    post: 'Main deck (helm)',
    build: { scale: 1.02, torsoW: 8, torsoD: 5, armW: 3, legH: 11, bootH: 4 },
    palette: {
      skin: '#c99572',
      skinShade: '#a47254',
      hair: '#8f8f92',
      hairDark: '#5e5e62',
      eye: '#3a3a3a',
      mouth: '#6e3a2e',
      shirt: '#c9c7bf',
      shirtShade: '#a9a79f',
      outer: '#1f2d4f',
      outerShade: '#141e36',
      trim: '#c79a3a',
      trousers: '#4a3b2c',
      trousersShade: '#3a2d21',
      boots: '#1c1714',
      bootsCuff: '#3a2e24',
      belt: '#241a12',
      accent: '#2a2730',
      accentShade: '#1b1920',
    },
    face: [
      'DDDDDDDD', //
      'DDDDDDDD',
      'sbbsseee',
      'sWPsseee',
      'sxssnsss',
      'uxuuuuus',
      'uuummuuu',
      'suuuuuus',
    ],
    hair: 'short',
    outfit: 'coat',
    accessories: ['bandana', 'eyepatch'],
    dagger: 'plain',
  },
  {
    id: 'silas',
    name: 'SILAS LEDGER',
    role: 'Quartermaster',
    post: 'Hold',
    build: { scale: 0.98, torsoW: 8, torsoD: 4, armW: 3, legH: 11, bootH: 3 },
    palette: {
      skin: '#e8bf9c',
      skinShade: '#c99a78',
      hair: '#5a3a22',
      hairDark: '#3b2414',
      eye: '#3f5f34',
      mouth: '#8a4a3a',
      shirt: '#f1efe8',
      shirtShade: '#d2cfc4',
      outer: '#7a4f2c',
      outerShade: '#5a3a1f',
      trim: '#d8c070',
      trousers: '#3c3a36',
      trousersShade: '#2e2c29',
      boots: '#2b1e14',
      bootsCuff: '#47331f',
      belt: '#2b1e14',
      accent: '#6b1f2a',
      accentShade: '#4c141d',
    },
    face: [
      'hhhhhhhh', //
      'hhhssshh',
      'sggssggs',
      'gWPggPWg',
      'sggnnggs',
      'ssMMMMss',
      'sssmmsss',
      'ssssssss',
    ],
    hair: 'short',
    outfit: 'waistcoat',
    accessories: ['spectacles', 'ledger'],
    dagger: 'plain',
  },
  {
    id: 'barnaby',
    name: 'BARNABY BRINE',
    role: 'Cook',
    post: 'Galley (lower deck)',
    build: { scale: 1.0, torsoW: 12, torsoD: 6, armW: 4, legH: 10, bootH: 3 },
    palette: {
      skin: '#d9a07c',
      skinShade: '#b47a58',
      hair: '#6e5640',
      hairDark: '#4f3c2a',
      eye: '#3b2a1e',
      mouth: '#7a3a2e',
      shirt: '#8ea3b5',
      shirtShade: '#6f8598',
      outer: '#e4dccb',
      outerShade: '#c4b99f',
      trim: '#9aa0a8',
      trousers: '#5a4632',
      trousersShade: '#463626',
      boots: '#2b1e14',
      bootsCuff: '#47331f',
      belt: '#3a2a1c',
      accent: '#8a6a48',
      accentShade: '#9b4a3a',
    },
    face: [
      'ssssssss', //
      'ssssssss',
      'sbbssbbs',
      'sWPssPWs',
      'kssnnssk',
      'kssssssk',
      'ssmttmss',
      'SssssssS',
    ],
    hair: 'bald',
    outfit: 'apron',
    accessories: ['belly', 'ladle', 'sheath'],
    dagger: 'plain',
  },
  {
    id: 'pip',
    name: 'PIP',
    role: 'Lookout',
    post: "Crow's nest",
    build: { scale: 0.8, torsoW: 8, torsoD: 4, armW: 3, legH: 10, bootH: 2, shins: 2 },
    palette: {
      skin: '#f0c7a0',
      skinShade: '#d3a47e',
      hair: '#c98a3c',
      hairDark: '#9a6524',
      eye: '#3a6aa0',
      mouth: '#a0524a',
      shirt: '#eceae2',
      shirtShade: '#2a3f73',
      outer: '#eceae2',
      outerShade: '#2a3f73',
      trim: '#b08a4a',
      trousers: '#7a6a4e',
      trousersShade: '#625540',
      boots: '#3a2a1c',
      bootsCuff: '#55402a',
      belt: '#8a7250',
      accent: '#c4302b',
      accentShade: '#8f1f1b',
    },
    face: [
      'DDDDDDDD', //
      'DhhhhhhD',
      'sbbssbbs',
      'sWPssPWs',
      'sfsnnsfs',
      'ssssssss',
      'sssmmsss',
      'ssssssss',
    ],
    hair: 'short',
    outfit: 'striped',
    accessories: ['bandana', 'spyglass'],
    dagger: 'plain',
  },
  {
    id: 'bess',
    name: 'IRON BESS',
    role: 'Gunner',
    post: 'Lower deck (by the brig)',
    build: { scale: 0.96, torsoW: 8, torsoD: 5, armW: 3, legH: 11, bootH: 4 },
    palette: {
      skin: '#b9825e',
      skinShade: '#986444',
      hair: '#4a2a1c',
      hairDark: '#2e1a10',
      eye: '#5a3a20',
      mouth: '#8a4038',
      shirt: '#d9c9a8',
      shirtShade: '#b8a785',
      outer: '#6a4426',
      outerShade: '#4e3018',
      trim: '#c9b48a',
      trousers: '#3a3f3a',
      trousersShade: '#2c302c',
      boots: '#241a12',
      bootsCuff: '#3c2c1e',
      belt: '#2a1c12',
      accent: '#8b2a2a',
      accentShade: '#651c1c',
    },
    face: [
      'hhhhhhhh', //
      'hhsssshh',
      'hbbssbbh',
      'hWPssPWh',
      'hosnnsoh',
      'soosssss',
      'sssmmsos',
      'ssssssss',
    ],
    hair: 'braids',
    outfit: 'vest',
    accessories: ['braids', 'powderHorn'],
    dagger: 'plain',
  },
]
