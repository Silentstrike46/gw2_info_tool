/**
 * Type definitions for GW2 character data.
 *
 * Characters only for now — account types come later when a feature needs them.
 */

// ---------------------------------------------------------------------------
//                          Static value lists
// ---------------------------------------------------------------------------
export const GW2_RACES = [
  "Human",
  "Charr",
  "Norn",
  "Asura",
  "Sylvari",
] as const;
export const GW2_GENDERS = ["Male", "Female"] as const;
export const GW2_PROFESSIONS = [
  "Guardian",
  "Warrior",
  "Revenant",
  "Thief",
  "Engineer",
  "Ranger",
  "Necromancer",
  "Elementalist",
  "Mesmer",
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
  discipline: CraftingDiscipline;
  rating: number; //current crafting level
  active: boolean;
}

export interface CharacterInfoShort {
  name: string;
  race: Race;
  gender: Gender;
  profession: Profession;
  armor: ArmorType; // derived from profession; not sent by the API
  level: number;
  age: number; // seconds played
  created: string; // ISO-8601 timestamp
}

export interface WvwAbilityInfo {
  id: string;
  rank: number;
}

export interface CharacterInfo extends CharacterInfoShort {
  flags: CharacterFlag[];
  deaths: number;
  crafting: CraftingDisciplineInfo[];
  backstory: string[]; // backstory answer IDs
  wvw_abilities: WvwAbilityInfo[];
  guild?: string;
  title?: number; // title ID
  // Skipping the unknown/placeholder API fields (equipment, recipes,
  // training, bags, equipment_pvp, specializations, skills).
  // Add them later if a feature needs them.
}
