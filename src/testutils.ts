/** Utility functions for tests */

import type { CharacterInfoShort } from "./lib/gw2/types";

/**
 * Generates a valid default character, merged with the fields a test cares about.
 * NOTE: if profession is overridden, armor is not automatically derived;
 * tests must set it explicitly if they care.
 * @param overrides - fields to override in the default character
 * @returns a valid CharacterInfoShort object
 */
export function character(
  overrides: Partial<CharacterInfoShort>,
): CharacterInfoShort {
  return {
    name: "Default Name",
    race: "Human",
    gender: "Male",
    profession: "Guardian",
    armor: "Heavy",
    level: 80,
    age: 0,
    created: new Date().toISOString(),
    ...overrides,
  };
}
