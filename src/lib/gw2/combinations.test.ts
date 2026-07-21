import { describe, it } from "vitest";

import { expect } from "vitest";
import { type CharacterInfoShort, type GroupableProperty } from "./types";
import { getCombinations } from "./combinations";

/**
 * Generates a valid default character, merged with the fields a test cares about.
 * @param overrides - fields to override in the default character
 * @returns a valid CharacterInfoShort object
 */
function character(overrides: Partial<CharacterInfoShort>): CharacterInfoShort {
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

describe("getCombinations - no grouping", () => {
  const sample_chars = [character({}), character({}), character({})];
  const properties: GroupableProperty[] = [];
  const result = getCombinations(sample_chars, properties);
  it("returns a single All Characters entry when properties is empty", () => {
    expect(result.combinations.length).toEqual(1);
  });
  it("counts every character in the All Characters entry", () => {
    expect(result.combinations[0].characters.length).toEqual(
      sample_chars.length,
    );
  });
  it("gives the All Characters entry an empty values bag", () => {
    expect(result.combinations[0].values).toEqual({});
  });
  it("labels the wrapper All Characters when properties is empty", () => {
    expect(result.label).toEqual("All Characters");
  });
});

describe("getCombinations - validation", () => {
  const sample_chars = [character({}), character({}), character({})];
  const properties: GroupableProperty[] = ["armor", "armor"];
  it("throws when the same property is listed twice", () => {
    expect(() => {
      getCombinations(sample_chars, properties);
    }).toThrow(Error);
  });
  it("names the duplicated property in the error message", () => {
    expect(() => {
      getCombinations(sample_chars, properties);
    }).toThrow('duplicate property: "armor"');
  });
});

describe("getCombinations - grouping without fill", () => {
  const char1 = character({});
  const char2 = character({});
  const char3 = character({
    name: "Character 3",
    profession: "Elementalist",
    armor: "Light",
    race: "Charr",
  });
  const characters = [char1, char2, char3];
  const properties: GroupableProperty[] = ["profession"];
  const result = getCombinations(characters, properties);
  const propertiesMultiple: GroupableProperty[] = ["profession", "race"];
  const resultMultiple = getCombinations(characters, propertiesMultiple);

  it("creates one entry per distinct value of a single property", () => {
    expect(result.combinations.length).toEqual(2);
  });
  it("omits values that no character has", () => {
    // Compared as Sets: row order is not guaranteed until the sort lands.
    expect(new Set(result.combinations.map((entry) => entry.label))).toEqual(
      new Set(["Guardian", "Elementalist"]),
    );
  });
  it("puts each character in exactly one entry", () => {
    const grouped = result.combinations.flatMap((entry) => [
      ...entry.characters,
    ]);
    expect(grouped).toHaveLength(characters.length);
    expect(new Set(grouped).size).toEqual(characters.length);
  });
  it("keeps count equal to characters.length for every entry", () => {
    for (const entry of result.combinations) {
      expect(entry.count).toEqual(entry.characters.length);
    }
  });
  it("labels the wrapper with the dash-joined property names", () => {
    expect(result.label).toEqual("profession");
    expect(resultMultiple.label).toEqual("profession-race");
  });
  it("creates one entry per combination present for multiple properties", () => {
    expect(resultMultiple.combinations.length).toEqual(2);
  });
  it("orders each entry label by the properties argument order", () => {
    // profession before race, because that is the argument order.
    expect(
      new Set(resultMultiple.combinations.map((entry) => entry.label)),
    ).toEqual(new Set(["Guardian-Human", "Elementalist-Charr"]));
  });
  it("includes exactly the selected keys in the values bag", () => {
    for (const entry of resultMultiple.combinations) {
      expect(Object.keys(entry.values).sort()).toEqual(["profession", "race"]);
    }
  });
});

describe("getCombinations - fillBlanks", () => {
  // Two Male/Heavy characters and one Female/Light, so four of the six
  // gender x armor cells have nobody in them.
  const male1 = character({});
  const male2 = character({ name: "Male 2" });
  const female = character({
    name: "Female 1",
    gender: "Female",
    armor: "Light",
    profession: "Mesmer",
  });
  const characters = [male1, male2, female];
  const properties: GroupableProperty[] = ["gender", "armor"];
  const filled = getCombinations(characters, properties, { fillBlanks: true });

  it("adds every combination that no character matches", () => {
    const labels = new Set(filled.combinations.map((entry) => entry.label));
    expect(labels).toEqual(
      new Set([
        "Male-Heavy",
        "Male-Medium",
        "Male-Light",
        "Female-Heavy",
        "Female-Medium",
        "Female-Light",
      ]),
    );
  });
  it("gives filled entries a count of 0 and no characters", () => {
    const blank = filled.combinations.find(
      (entry) => entry.label === "Female-Medium",
    );
    expect(blank?.count).toEqual(0);
    expect(blank?.characters).toEqual([]);
    expect(blank?.values).toEqual({ gender: "Female", armor: "Medium" });
  });
  it("leaves entries that do have characters unchanged", () => {
    const occupied = filled.combinations.find(
      (entry) => entry.label === "Male-Heavy",
    );
    expect(occupied?.count).toEqual(2);
    expect(occupied?.characters).toEqual([male1, male2]);
  });
  it("returns rows equal to the product of the value list lengths", () => {
    // 2 genders x 3 armor types, regardless of what the account contains.
    expect(filled.combinations.length).toEqual(6);
  });
  it("echoes the fillBlanks setting on the wrapper", () => {
    expect(filled.fillBlanks).toEqual(true);
    expect(getCombinations(characters, properties).fillBlanks).toEqual(false);
  });
  it("omits the empty cells when fillBlanks is off", () => {
    const unfilled = getCombinations(characters, properties);
    expect(unfilled.combinations.length).toEqual(2);
  });
});

describe("getCombinations - sorting", () => {
  const characters = [
    character({ name: "Human 1", race: "Human", profession: "Warrior" }),
    character({ name: "Norn 1", race: "Norn", profession: "Ranger" }),
    character({ name: "Charr 1", race: "Charr", profession: "Engineer" }),
  ];
  it("orders rows by value list order, not alphabetically", () => {
    const combinations = getCombinations(characters, ["race"]);
    // Must match order of GW2_RACES, not alphabetical.
    expect(combinations.combinations.map((entry) => entry.values.race)).toEqual(
      ["Charr", "Human", "Norn"],
    );
  });
  it("sorts by the first property before the second", () => {
    const combinations = getCombinations(characters, ["profession", "race"]);
    // Must match order of GW2_PROFESSIONS, not alphabetical.
    expect(
      combinations.combinations.map((entry) => entry.values.profession),
    ).toEqual(["Warrior", "Engineer", "Ranger"]);
    // Expected to prioritise order by profession first, then race second
    expect(combinations.combinations.map((entry) => entry.values.race)).toEqual(
      ["Human", "Charr", "Norn"],
    );
  });
});

describe("getCombinations - purity", () => {
  const characters = [
    character({}),
    character({ name: "Charr 1", race: "Charr" }),
  ];
  const reversed = [...characters].reverse();

  // Depends on the sort: without it, row order follows whichever character the
  // API happened to return first.
  it("returns the same result regardless of input character order", () => {
    const originalCombinations = getCombinations(characters, ["race"]);
    const reversedCombinations = getCombinations(reversed, ["race"]);
    expect(reversedCombinations).toEqual(originalCombinations);
  });

  it("returns the same result regardless of input order when filling blanks", () => {
    expect(getCombinations(reversed, ["race"], { fillBlanks: true })).toEqual(
      getCombinations(characters, ["race"], { fillBlanks: true }),
    );
  });

  it("does not mutate the characters argument", () => {
    const snapshot = [...characters];
    getCombinations(characters, ["race"], { fillBlanks: true });
    expect(characters).toEqual(snapshot);
  });
  it("does not mutate the properties argument", () => {
    const properties: GroupableProperty[] = ["race", "gender"];
    getCombinations(characters, properties, { fillBlanks: true });
    expect(properties).toEqual(["race", "gender"]);
  });
});
