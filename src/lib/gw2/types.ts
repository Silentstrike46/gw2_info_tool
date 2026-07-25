/**
 * Type definitions for GW2 character data.
 *
 * Characters only for now — account types come later when a feature needs them.
 */

// ---------------------------------------------------------------------------
//                          Static value lists
// ---------------------------------------------------------------------------
// NOTE: We assume no properties contain dashes in the string. If they do, it will
// corrupt the label buckets later. No "-" in strings here!
// NOTE: Order here matters! The order of values in these arrays is used to sort the
// rows and columns of the combinations table. If you change the order, you will change
// the order of the table.
// Order chosen here matches the order of the GW2 character creation screens.
export const GW2_RACES = [
  "Charr",
  "Human",
  "Norn",
  "Asura",
  "Sylvari",
] as const;
export const GW2_GENDERS = ["Male", "Female"] as const;
export const GW2_PROFESSIONS = [
  "Guardian",
  "Warrior",
  "Revenant",
  "Engineer",
  "Thief",
  "Ranger",
  "Mesmer",
  "Necromancer",
  "Elementalist",
] as const;
export const GW2_ARMOR_TYPES = ["Heavy", "Medium", "Light"] as const;
export const GW2_PROFESSION_TO_ARMOR_TYPE = {
  Guardian: "Heavy",
  Warrior: "Heavy",
  Revenant: "Heavy",
  Thief: "Medium",
  Engineer: "Medium",
  Ranger: "Medium",
  Necromancer: "Light",
  Elementalist: "Light",
  Mesmer: "Light",
} as const;
export const GW2_CRAFTING_DISCIPLINES = [
  "Armorsmith",
  "Artificer",
  "Chef",
  "Huntsman",
  "Jeweler",
  "Leatherworker",
  "Scribe",
  "Tailor",
  "Weaponsmith",
] as const;
export const GW2_CHARACTER_FLAGS = ["Beta"] as const; // Only Beta for now

// ---------------------------------------------------------------------------
//                          Literal-union types
// ---------------------------------------------------------------------------
// A value of one of these types must be exactly one of the listed strings. Either
// hand-write the unions, or derive them from the arrays with
// `(typeof GW2_RACES)[number]` so they can't drift out of sync with the values.

export type Race = (typeof GW2_RACES)[number];
export type Gender = (typeof GW2_GENDERS)[number];
export type Profession = (typeof GW2_PROFESSIONS)[number];
export type ArmorType = (typeof GW2_ARMOR_TYPES)[number];
export type CraftingDiscipline = (typeof GW2_CRAFTING_DISCIPLINES)[number];
export type CharacterFlag = (typeof GW2_CHARACTER_FLAGS)[number];

// ---------------------------------------------------------------------------
//                          Character information
// ---------------------------------------------------------------------------
export interface CraftingDisciplineInfo {
  readonly discipline: CraftingDiscipline;
  readonly rating: number; //current crafting level
  readonly active: boolean;
}

export interface CharacterInfoShort {
  readonly name: string;
  readonly race: Race;
  readonly gender: Gender;
  readonly profession: Profession;
  readonly armor: ArmorType; // derived from profession; not sent by the API
  readonly level: number;
  readonly age: number; // seconds played
  readonly created: string; // ISO-8601 timestamp
}

export interface WvwAbilityInfo {
  readonly id: string;
  readonly rank: number;
}

export interface CharacterInfo extends CharacterInfoShort {
  readonly flags: readonly CharacterFlag[];
  readonly deaths: number;
  readonly crafting: readonly CraftingDisciplineInfo[];
  readonly backstory: readonly string[]; // backstory answer IDs
  readonly wvwAbilities: readonly WvwAbilityInfo[];
  readonly guild?: string;
  readonly title?: number; // title ID
  // Skipping the unknown/placeholder API fields (equipment, recipes,
  // training, bags, equipment_pvp, specializations, skills).
  // Add them later if a feature needs them.
}

// ---------------------------------------------------------------------------
//                          Groupable Properties / Combinations
// ---------------------------------------------------------------------------
// single source of truth for both the union of groupable properties and the
// value lists fill-blanks iterates.
export const GROUPABLE_VALUE_LISTS = {
  race: GW2_RACES,
  gender: GW2_GENDERS,
  profession: GW2_PROFESSIONS,
  armor: GW2_ARMOR_TYPES,
} as const;

// value -> type: `typeof` gives the object's type; `keyof` gives the union of its keys.
// = "race" | "gender" | "profession" | "armor"
export type GroupableProperty = keyof typeof GROUPABLE_VALUE_LISTS;
