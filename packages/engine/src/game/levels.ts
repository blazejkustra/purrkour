/**
 * The campaign. Every level was found/verified by the BFS solver
 * (tests/genlevels.mjs) — `par` is the proven minimum move count,
 * re-asserted in tests. `intro` is the playful card shown before play.
 *
 * Cell map:      0  1  2  3  4
 *                5  6  7  8  9
 *               10 11 12 13 14
 *               15 16 17 18 19
 *               20 21 22 23 24
 */
import type { LevelDef } from "./model.ts";

export interface Level extends LevelDef {
  par: number;
  intro: string;
}

export const LEVELS: Level[] = [
  {
    name: "Warm-up",
    intro:
      "Cats don't walk — they JUMP over things. Hop the plants, land in the box.",
    cats: [{ color: "red", cell: 10 }],
    dogs: [],
    cushions: [11, 12, 13],
    boxes: [14],
    par: 1,
  },
  {
    name: "Two Hops",
    intro: "The box is too far for one leap — jump from plant to plant.",
    cats: [{ color: "red", cell: 8 }],
    dogs: [],
    cushions: [17, 13, 7, 10],
    boxes: [16],
    par: 2,
  },
  {
    name: "Good Dog",
    intro: "Meet the dog: an obstacle with a lifestyle. Jump right over him.",
    cats: [{ color: "red", cell: 4 }],
    dogs: [{ cell: 8, axis: "v" }],
    cushions: [9, 1, 5],
    boxes: [12],
    par: 2,
  },
  {
    name: "Fetch",
    intro:
      "The dog never leaves his line — he only slides along it. To a cat, just one more thing to jump over.",
    cats: [{ color: "red", cell: 16 }],
    dogs: [{ cell: 7, axis: "v" }],
    cushions: [8, 15, 4],
    boxes: [18],
    par: 2,
  },
  {
    name: "Cat Duet",
    intro: "Two cats, two boxes. Cats make excellent obstacles too.",
    cats: [
      { color: "red", cell: 2 },
      { color: "blue", cell: 7 },
    ],
    dogs: [],
    cushions: [9, 6],
    boxes: [17, 22],
    par: 3,
  },
  {
    name: "Double Trouble",
    intro: "Two cats, one dog, many opinions about who jumps first.",
    cats: [
      { color: "red", cell: 5 },
      { color: "blue", cell: 16 },
    ],
    dogs: [{ cell: 18, axis: "h" }],
    cushions: [6, 14, 24],
    boxes: [9, 7],
    par: 4,
  },
  {
    name: "Potted",
    intro: "A plant ON a box?! That one is taken. Find another home.",
    cats: [
      { color: "red", cell: 6 },
      { color: "blue", cell: 1 },
    ],
    dogs: [{ cell: 7, axis: "v" }],
    cushions: [22, 5],
    boxes: [11, 18, 14],
    cappedBoxes: [14],
    par: 4,
  },
  {
    name: "Leap Frog",
    intro: "Plan two jumps ahead. Walking is still not an option.",
    cats: [
      { color: "red", cell: 13 },
      { color: "blue", cell: 22 },
    ],
    dogs: [{ cell: 15, axis: "h" }],
    cushions: [5, 9, 20],
    boxes: [11, 0],
    par: 5,
  },
  {
    name: "No Vacancy",
    intro: "Three cats, four boxes, one squatter plant. Housing is hard.",
    cats: [
      { color: "red", cell: 1 },
      { color: "blue", cell: 3 },
      { color: "violet", cell: 4 },
    ],
    dogs: [{ cell: 11, axis: "h" }],
    cushions: [16, 8, 6],
    boxes: [10, 21, 17, 5],
    cappedBoxes: [5],
    par: 7,
  },
  {
    name: "Dog Park",
    intro:
      "Two dogs now, one per lane. Twice the traffic, twice the springboards.",
    cats: [
      { color: "red", cell: 11 },
      { color: "blue", cell: 3 },
      { color: "violet", cell: 12 },
    ],
    dogs: [
      { cell: 6, axis: "h" },
      { cell: 17, axis: "h" },
    ],
    cushions: [0],
    boxes: [20, 13, 1],
    par: 7,
  },
  {
    name: "Scooch",
    intro: "Nothing works until the dog scooches. Ask nicely.",
    cats: [
      { color: "red", cell: 17 },
      { color: "blue", cell: 10 },
    ],
    dogs: [{ cell: 12, axis: "h" }],
    cushions: [16, 11, 24, 19],
    boxes: [7, 15, 2],
    cappedBoxes: [2],
    par: 6,
  },
  {
    name: "Gap Year",
    intro:
      "Slide the dog, change the gap, change the jump. That is the whole trick.",
    cats: [
      { color: "red", cell: 9 },
      { color: "blue", cell: 4 },
    ],
    dogs: [{ cell: 3, axis: "v" }],
    cushions: [5],
    boxes: [22, 19],
    par: 7,
  },
  {
    name: "Garden Party",
    intro: "Three cats, one dog, entirely too many plants.",
    cats: [
      { color: "red", cell: 7 },
      { color: "blue", cell: 22 },
      { color: "violet", cell: 21 },
    ],
    dogs: [{ cell: 18, axis: "v" }],
    cushions: [20, 6, 19, 5],
    boxes: [14, 24, 4],
    par: 8,
  },
  {
    name: "Musical Boxes",
    intro: "When the dog moves, every jump changes. Conduct accordingly.",
    cats: [
      { color: "red", cell: 14 },
      { color: "blue", cell: 1 },
      { color: "violet", cell: 9 },
    ],
    dogs: [{ cell: 16, axis: "h" }],
    cushions: [20, 23, 6],
    boxes: [13, 12, 24],
    par: 9,
  },
  {
    name: "Tandem",
    intro: "Two dogs, zero plants, nowhere to hide.",
    cats: [
      { color: "red", cell: 21 },
      { color: "blue", cell: 7 },
      { color: "violet", cell: 11 },
    ],
    dogs: [
      { cell: 17, axis: "v" },
      { cell: 18, axis: "h" },
    ],
    cushions: [],
    boxes: [2, 13, 20],
    par: 10,
  },
  {
    name: "Conga Line",
    intro:
      "Three cats in a queue down the middle. Only one opening move works.",
    cats: [
      { color: "red", cell: 7 },
      { color: "blue", cell: 17 },
      { color: "violet", cell: 12 },
    ],
    dogs: [
      { cell: 20, axis: "h" },
      { cell: 18, axis: "v" },
    ],
    cushions: [9, 5, 16],
    boxes: [24, 19, 8],
    par: 10,
  },
  {
    name: "Downstairs",
    intro: "The boxes are two floors down. The dogs are the stairs.",
    cats: [
      { color: "red", cell: 0 },
      { color: "blue", cell: 2 },
    ],
    dogs: [
      { cell: 11, axis: "h" },
      { cell: 5, axis: "h" },
    ],
    cushions: [19, 3],
    boxes: [16, 17],
    par: 10,
  },
  {
    name: "Double Doors",
    intro: "Two doors, both dogs. Only one order gets everyone through.",
    cats: [
      { color: "red", cell: 15 },
      { color: "blue", cell: 10 },
      { color: "violet", cell: 24 },
    ],
    dogs: [
      { cell: 12, axis: "v" },
      { cell: 8, axis: "v" },
    ],
    cushions: [11, 21, 19],
    boxes: [23, 2, 5],
    par: 11,
  },
  {
    name: "Crosswalk",
    intro:
      "Two dogs crossing paths in the middle. Time your leaps like a local.",
    cats: [
      { color: "red", cell: 16 },
      { color: "blue", cell: 4 },
      { color: "violet", cell: 17 },
    ],
    dogs: [
      { cell: 10, axis: "h" },
      { cell: 7, axis: "v" },
    ],
    cushions: [20, 18, 23],
    boxes: [9, 5, 24],
    par: 12,
  },
  {
    name: "Tangled Yarn",
    intro: "Nine ways to open. One untangles. The rest are just knots.",
    cats: [
      { color: "red", cell: 12 },
      { color: "blue", cell: 7 },
      { color: "violet", cell: 23 },
    ],
    dogs: [
      { cell: 8, axis: "v" },
      { cell: 6, axis: "v" },
    ],
    cushions: [21],
    boxes: [15, 20, 3, 24],
    cappedBoxes: [24],
    par: 12,
  },
  {
    name: "Rush Hour Whiskers",
    intro: "Both dogs block. Both dogs help. Which is which?",
    cats: [
      { color: "red", cell: 10 },
      { color: "blue", cell: 5 },
      { color: "violet", cell: 21 },
    ],
    dogs: [
      { cell: 16, axis: "h" },
      { cell: 23, axis: "h" },
    ],
    cushions: [],
    boxes: [11, 6, 14],
    par: 13,
  },
  {
    name: "The Warm-up Is Over",
    intro: "A capped box, two dogs, zero room for error.",
    cats: [
      { color: "red", cell: 5 },
      { color: "blue", cell: 22 },
    ],
    dogs: [
      { cell: 1, axis: "v" },
      { cell: 7, axis: "v" },
    ],
    cushions: [],
    boxes: [4, 10, 8],
    cappedBoxes: [8],
    par: 14,
  },
  {
    name: "Clockwork Cats",
    intro: "Fifteen moves, one correct opening. The cats believe in you.",
    cats: [
      { color: "red", cell: 5 },
      { color: "blue", cell: 0 },
      { color: "violet", cell: 14 },
    ],
    dogs: [
      { cell: 15, axis: "h" },
      { cell: 10, axis: "h" },
    ],
    cushions: [21],
    boxes: [7, 24, 9],
    par: 15,
  },
  {
    name: "The Impossible Nap",
    intro: "Seven ways to start. One works. Choose like a cat.",
    cats: [
      { color: "red", cell: 1 },
      { color: "blue", cell: 11 },
      { color: "violet", cell: 16 },
    ],
    dogs: [
      { cell: 12, axis: "v" },
      { cell: 8, axis: "v" },
    ],
    cushions: [],
    boxes: [22, 21, 5],
    par: 17,
  },
  {
    name: "The Grand Nap",
    intro:
      "Twenty perfect moves to the coziest nap in history. Make them count.",
    cats: [
      { color: "red", cell: 13 },
      { color: "blue", cell: 3 },
      { color: "violet", cell: 2 },
    ],
    dogs: [
      { cell: 17, axis: "h" },
      { cell: 11, axis: "h" },
    ],
    cushions: [8],
    boxes: [24, 15, 0],
    par: 20,
  },
];
