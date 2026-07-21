/** Contains combination logic to divide characters up based on provided properties.*/

import {
  GROUPABLE_VALUE_LISTS,
  type CharacterInfoShort,
  type GroupableProperty,
} from "./types";
type CombinationValues = Partial<Record<GroupableProperty, string>>;

interface CombinationEntry {
  readonly label: string; // "Charr-Guardian" — stable id / export handle
  readonly values: CombinationValues; // { race: "Charr", profession: "Guardian" }
  readonly count: number; // invariant: === characters.length
  readonly characters: readonly CharacterInfoShort[];
}

interface CombinationInfo {
  readonly label: string; // "profession-race", or "All Characters"
  readonly properties: readonly GroupableProperty[]; // echoed input
  readonly fillBlanks: boolean; // echoed setting
  readonly combinations: readonly CombinationEntry[];
}

/**
 * Get the combinations of characters grouped by the given properties.
 * Optionally, fill in missing combinations with count 0 and empty character lists.
 *
 * If length of properties is 0, returns a single combination with all characters
 * and the label "All Characters".
 * @param characters - the characters to group
 * @param properties - the properties to group by, in order of precedence
 * @param options - optional settings, currently only fillBlanks
 * @returns a CombinationInfo object containing the grouped combinations
 */
export function getCombinations(
  characters: readonly CharacterInfoShort[],
  properties: readonly GroupableProperty[],
  options?: { fillBlanks?: boolean },
): CombinationInfo {
  // Duplicate-property guard: throw Error naming the duplicate property.
  const seen = new Set<GroupableProperty>();
  for (const property of properties) {
    if (seen.has(property)) {
      throw new Error(`duplicate property: "${property}"`);
    }
    seen.add(property);
  }
  // Return early if no properties are given: single "All Characters" entry.
  if (properties.length === 0) {
    return {
      label: "All Characters",
      properties: [...properties], // copy to avoid mutation
      fillBlanks: options?.fillBlanks ?? false,
      combinations: [
        {
          label: "All Characters",
          values: {},
          count: characters.length,
          characters: [...characters], // copy to avoid mutation
        },
      ],
    };
  }
  // Group present characters into a Map keyed by dash-label; one
  // CombinationEntry per bucket (values, count, characters).
  // Mapping of dash-labels of character property to lists of characters matching that
  // label.
  const groups = new Map<string, CharacterInfoShort[]>();

  for (const character of characters) {
    // NOTE: We assume no property value has a dash in it, or this will break
    // label generation.
    // Logic: For each property provided, fetch the value in character for that key.
    // This is done via a map to return an array. Finally, separator-join that list
    // of strings in the array to generate the label.
    const charLabel = properties
      .map((property) => character[property])
      .join("-");

    // Get or create list of characters for that dash-label and append new character.
    const bucket = groups.get(charLabel);
    if (bucket === undefined) {
      groups.set(charLabel, [character]);
    } else {
      bucket.push(character);
    }
  }

  const combinations: CombinationEntry[] = [];
  // If not fillBlanks: can now iterate over the Map and create a CombinationEntry for each bucket.
  if (!options?.fillBlanks) {
    for (const [label, bucketCharacters] of groups) {
      const values: CombinationValues = {};
      const character = bucketCharacters[0];
      properties.forEach((property) => {
        values[property] = character[property];
      });
      combinations.push({
        characters: bucketCharacters,
        count: bucketCharacters.length,
        label: label,
        values: values,
      });
    }
  } else {
    // If fillBlanks, need to generate all possible combinations of the property values,
    // then fill in the counts and characters from the groups Map. This is a more complex
    // operation and will require generating the cartesian product of the property values.
    // [[]] is the "identity" for cartesian product: cartesian product of any set
    // with [[]] is the set itself. Without this, we'd end up not being able to apply
    // the first property's values to the empty list, and thus not generate any
    let combos: string[][] = [[]];
    for (const property of properties) {
      const possibleValues: readonly string[] = GROUPABLE_VALUE_LISTS[property];
      combos = combos.flatMap((combo) =>
        possibleValues.map((value) => [...combo, value]),
      );
    }
    for (const combo of combos) {
      // For each combination, generate the dash-label. See if any characters exist
      // for that label in the groups Map. If so, use those characters and their count.
      // Otherwise, use an empty array and count 0. Then, generate the values bag for that
      // combination, and push a new CombinationEntry into the combinations array.
      // Think of this as a "Grid": For each cell, check if we have values, and if not,
      // fill in with empty values.
      const label = combo.join("-");
      const bucketCharacters = groups.get(label) ?? [];
      const values: CombinationValues = {};
      properties.forEach((property, i) => {
        values[property] = combo[i];
      });
      combinations.push({
        characters: bucketCharacters,
        count: bucketCharacters.length,
        label: label,
        values: values,
      });
    }
  }

  // Sort rows by property precedence. Prioritises earlier properties in list.
  const comparator = (a: CombinationEntry, b: CombinationEntry) => {
    for (const property of properties) {
      const valueList: readonly string[] = GROUPABLE_VALUE_LISTS[property];
      const aValue = a.values[property] ?? "";
      const bValue = b.values[property] ?? "";
      const aIndex = valueList.indexOf(aValue);
      const bIndex = valueList.indexOf(bValue);
      if (aIndex !== bIndex) {
        return aIndex - bIndex;
      }
    }
    return 0;
  };

  combinations.sort(comparator);

  return {
    label: properties.join("-"),
    properties: [...properties], // copy to avoid mutation
    fillBlanks: options?.fillBlanks ?? false,
    combinations: combinations,
  };
}
