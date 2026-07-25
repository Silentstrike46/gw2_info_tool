/** Contains validators to parse the JSON response data from the API.*/

import {
  type ArmorType,
  type Gender,
  type Race,
  type Profession,
  GW2_GENDERS,
  GW2_PROFESSIONS,
  GW2_RACES,
  GW2_PROFESSION_TO_ARMOR_TYPE,
  type CharacterInfoShort,
} from "./types";

import { assert } from "../asserts";
// ------------------------ TYPE GUARDS ----------------------------------------
/**
 * Narrows unknown value to a known GW2 race.
 *
 * @param value - the value to inspect, typically a field from parsed API JSON.
 * @returns `true` if `value` is exactly one of `GW2_RACES`.
 */
export function isRace(value: unknown): value is Race {
  if (typeof value !== "string") {
    return false;
  }
  // Must widen array as GW2_RACES.includes() assumes value type is Race,
  // not unknown
  return (GW2_RACES as readonly string[]).includes(value);
}

/**
 * Narrows unknown value to a known GW2 gender.
 *
 * @param value - the value to inspect, typically a field from parsed API JSON.
 * @returns `true` if `value` is exactly one of `GW2_GENDERS`.
 */
export function isGender(value: unknown): value is Gender {
  if (typeof value !== "string") {
    return false;
  }
  // Must widen array as GW2_RACES.includes() assumes value type is Gender,
  // not unknown
  return (GW2_GENDERS as readonly string[]).includes(value);
}

/**
 * Narrows unknown value to a known GW2 profession.
 *
 * @param value - the value to inspect, typically a field from parsed API JSON.
 * @returns `true` if `value` is exactly one of `GW2_PROFESSIONS`.
 */
export function isProfession(value: unknown): value is Profession {
  if (typeof value !== "string") {
    return false;
  }
  // Must widen array as GW2_PROFESSIONS.includes() assumes value type is
  // Profession, not unknown
  return (GW2_PROFESSIONS as readonly string[]).includes(value);
}

/**
 * Maps a profession to its armor weight.
 *
 * Armor weight is not sent by the API; it is derived from the profession.
 */
export function armorForProfession(profession: Profession): ArmorType {
  return GW2_PROFESSION_TO_ARMOR_TYPE[profession];
}

/**
 * Parse/validate raw JSON character information from API into expected types.
 *
 * @param raw - raw JSON character information from API
 * @returns processed `CharacterInfoShort` object.
 * @throws Error if any required field is missing or is an incorrect type.
 */
export function parseCharacterShort(raw: unknown): CharacterInfoShort {
  // Convert raw into object we can index into
  assert(
    typeof raw === "object" && raw !== null && !Array.isArray(raw),
    "character must be an object",
  );
  const data = raw as Record<string, unknown>;

  // primitive fields (typeof)
  assert(typeof data.name === "string", "name must be a string");
  assert(typeof data.level === "number", "level must be a number");
  assert(typeof data.created === "string", "created must be a string");
  assert(typeof data.age === "number", "age must be a number");

  // enum fields (type guards)
  assert(isRace(data.race), `invalid race: ${String(data.race)}`);
  assert(isGender(data.gender), `invalid gender: ${String(data.gender)}`);
  assert(
    isProfession(data.profession),
    `invalid profession: ${String(data.profession)}`,
  );

  const character: CharacterInfoShort = {
    name: data.name,
    race: data.race,
    gender: data.gender,
    profession: data.profession,
    armor: armorForProfession(data.profession), // derived, not from input
    level: data.level,
    age: data.age,
    created: data.created,
  };
  return character;
}
