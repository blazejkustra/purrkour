/** Cozy living-room palette — derived from the game's own materials (walnut
 * tray, clay runners, kraft boxes, lamplight) with contrast tightened for
 * small screens: ink pairs on cream hit ≥6:1, accent buttons use the deeper
 * fired-clay tone so white labels stay readable. */
export const colors = {
  ink: "#2e2620",
  inkSoft: "#5f5143",
  paper: "#f9f0e1",
  card: "#fffaf0",
  /** Secondary button fill — a shade under the card so buttons read as raised. */
  paperBtn: "#f4e8d3",
  btnBorder: "rgba(46, 38, 32, 0.14)",
  /** Fired clay — accent buttons (web's terracotta, deepened for contrast). */
  clay: "#b85a3c",
  clayPressed: "#9c4a30",
  terracotta: "#d9714e",
  teal: "#6b4f3a",
  /** Walnut plaque — HUD chrome matching the board tray. */
  walnut: "#41332a",
  walnutPressed: "#33281f",
  plaqueText: "#fff3dd",
  plaqueSoft: "rgba(255, 243, 221, 0.78)",
  amber: "#f0b64e",
  /** Star badge chip — amber field with ink text (gold-on-cream was weak). */
  starChip: "#f2c14e",
  starChipEdge: "#d9a636",
  starOnCream: "#a06f0a",
  /** The page gradient's midpoint — the GPU clear color. */
  paperBg: "#f4e3c4",
  /** Level tiles, rows 1-2 — deep enough to read against the card white.
   * Each tier pairs a face with a darker "edge" so tiles read as solid
   * platform blocks, the same material the cat jumps on in the room. */
  tier0Bg: "#eedcba",
  tier0Edge: "#d8bd8d",
  tier1Bg: "#f9e6b8",
  tier1Edge: "#e5c073",
  tier1Ink: "#5f4410",
  tier2Bg: "#e6d9f6",
  tier2Edge: "#c6b2e2",
  tier2Ink: "#44315f",
  lockedInk: "rgba(46, 38, 32, 0.38)",
  lockedBg: "rgba(46, 38, 32, 0.07)",
  /** Soft warm shadow for display text on cream cards. */
  titleShadow: "rgba(120, 78, 40, 0.22)",
};

/** Baloo 2 — the game's canon face (the web build ships it too). Weight
 * range does the work of a second font: medium for body, extraBold for
 * display. */
export const font = {
  medium: "Baloo2_500Medium",
  semiBold: "Baloo2_600SemiBold",
  bold: "Baloo2_700Bold",
  extraBold: "Baloo2_800ExtraBold",
} as const;

export type FontWeight = keyof typeof font;

export const radius = {
  card: 30,
  btn: 22,
  chip: 999,
} as const;
