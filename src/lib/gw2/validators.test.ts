import { describe, it, expect } from "vitest";
import { type CharacterInfoShort } from "./types";
import {
  isRace,
  isGender,
  isProfession,
  armorForProfession,
  parseCharacterShort,
} from "./validators";

describe("isRace", () => {
  it.each(["Human", "Charr", "Norn", "Asura", "Sylvari"] as const)(
    "returns true for a valid race %s",
    (race) => {
      expect(isRace(race)).toBe(true);
    },
  );
  it("returns false for an unknown string", () => {
    expect(isRace("SentientChairs")).toBe(false);
  });
  it.each([123, null, undefined, []] as const)(
    "returns false for a non-string",
    (item) => {
      expect(isRace(item)).toBe(false);
    },
  );
});

describe("isGender", () => {
  it.each(["Male", "Female"] as const)(
    "returns true for a valid gender %s",
    (gender) => {
      expect(isGender(gender)).toBe(true);
    },
  );
  it("returns false for an unknown string", () => {
    expect(isGender("AA")).toBe(false);
  });
  it.each([123, null, undefined, []] as const)(
    "returns false for a non-string %s",
    (item) => {
      expect(isGender(item)).toBe(false);
    },
  );
});

describe("isProfession", () => {
  it.each([
    "Guardian",
    "Warrior",
    "Revenant",
    "Thief",
    "Engineer",
    "Ranger",
    "Necromancer",
    "Elementalist",
    "Mesmer",
  ] as const)("returns true for a valid profession %s", (profession) => {
    expect(isProfession(profession)).toBe(true);
  });
  it("returns false for an unknown string", () => {
    expect(isProfession("AA")).toBe(false);
  });
  it.each([123, null, undefined, []] as const)(
    "returns false for a non-string %s",
    (item) => {
      expect(isProfession(item)).toBe(false);
    },
  );
});

describe("armorForProfession", () => {
  // Hint: drive this with it.each over all 9 professions so the whole
  // GW2_PROFESSION_TO_ARMOR_TYPE map is covered in one parametrised test.
  it.each([
    ["Guardian", "Heavy"],
    ["Warrior", "Heavy"],
    ["Revenant", "Heavy"],
    ["Thief", "Medium"],
    ["Engineer", "Medium"],
    ["Ranger", "Medium"],
    ["Necromancer", "Light"],
    ["Elementalist", "Light"],
    ["Mesmer", "Light"],
  ] as const)("profession %s returns armor type %s", (prof, expArm) => {
    expect(armorForProfession(prof)).toBe(expArm);
  });
});

describe("parseCharacterShort", () => {
  // Hint: define a valid raw fixture object once at the top of this block,
  // then for each throw-case clone it and break a single field.
  const validRaw: Record<string, unknown> = {
    name: "Test",
    race: "Human",
    gender: "Female",
    profession: "Mesmer",
    level: 80,
    age: 123456,
    created: "2024-01-01T00:00:00Z",
  };

  it("parses a valid raw object into a CharacterInfoShort (toEqual)", () => {
    const input = {
      ...validRaw,
      wvw_abilities: [{ id: "x", rank: 1 }], // extra wire field that must NOT survive
    };
    const expected: CharacterInfoShort = {
      name: "Test",
      race: "Human",
      gender: "Female",
      profession: "Mesmer",
      armor: "Light",
      level: 80,
      age: 123456,
      created: "2024-01-01T00:00:00Z",
    };
    const result = parseCharacterShort(input);
    expect(result).toEqual(expected);
    expect(result).not.toHaveProperty("wvw_abilities"); // extra wire field was dropped
  });

  it("derives armor from profession rather than reading it from input", () => {
    const input = { ...validRaw };
    // Failsafe in case tests are modified
    expect(input).not.toHaveProperty("armor");
    const result = parseCharacterShort(input);
    expect(result.armor).toBe("Light");
  });

  it.each([null, 123, [1, 2, 3]] as const)(
    "throws when raw is not an object (%s)",
    (input) => {
      expect(() => {
        parseCharacterShort(input);
      }).toThrow("must be an object");
    },
  );

  it.each([null, 123] as const)(
    "throws when name is missing or not a string (%s)",
    (name) => {
      expect(() => {
        const input = { ...validRaw };
        input.name = name;
        parseCharacterShort(input);
      }).toThrow("name must be a string");
    },
  );

  it.each([null, "ninety"] as const)(
    "throws when level is missing or not a number (%s)",
    (level) => {
      expect(() => {
        const input = { ...validRaw };
        input.level = level;
        parseCharacterShort(input);
      }).toThrow("level must be a number");
    },
  );

  it.each([null, 123] as const)(
    "throws when created is missing or not a string (%s)",
    (created) => {
      expect(() => {
        const input = { ...validRaw };
        input.created = created;
        parseCharacterShort(input);
      }).toThrow("created must be a string");
    },
  );

  it.each([null, "ninety"] as const)(
    "throws when age is missing or not a number (%s)",
    (age) => {
      expect(() => {
        const input = { ...validRaw };
        input.age = age;
        parseCharacterShort(input);
      }).toThrow("age must be a number");
    },
  );

  it.each([null, "Chair"] as const)(
    "throws when race is invalid (%s)",
    (race) => {
      expect(() => {
        const input = { ...validRaw };
        input.race = race;
        parseCharacterShort(input);
      }).toThrow("invalid race");
    },
  );

  it.each([null, "Chair"] as const)(
    "throws when gender is invalid (%s)",
    (gender) => {
      expect(() => {
        const input = { ...validRaw };
        input.gender = gender;
        parseCharacterShort(input);
      }).toThrow("invalid gender");
    },
  );

  it.each([null, "Chair"] as const)(
    "throws when profession is invalid (%s)",
    (profession) => {
      expect(() => {
        const input = { ...validRaw };
        input.profession = profession;
        parseCharacterShort(input);
      }).toThrow("invalid profession");
    },
  );
});
