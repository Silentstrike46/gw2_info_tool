import { describe, it } from "vitest";
import { expect } from "vitest";
import { type CharacterInfoShort } from "./types";
import {
  charactersToJson,
  charactersFromJson,
  charactersToCsv,
  charactersFromCsv,
  combinationInfoToJson,
  combinationInfoToCsv,
} from "./io";
import { getCombinations, type CombinationInfo } from "./combinations";
import { character } from "../../testutils";

function sampleCharacterCSV(): string {
  return [
    `name,race,gender,profession,armor,level,age,created`,
    `Alice,Charr,Female,Engineer,Medium,80,0,${new Date().toISOString()}`,
  ].join("\n");
}

describe("charactersToJson", () => {
  it("produces 2-space pretty-printed JSON", () => {
    const json = charactersToJson([character({ name: "Alice" })]);
    // pins the 2-space indent literally (2 spaces for array, 2 spaces for obj inside)
    expect(json).toContain('\n    "name": "Alice"');
  });
  it("serialises an empty list to an empty JSON array", () => {
    const json = charactersToJson([]);
    expect(json).toBe("[]");
  });
});

describe("charactersFromJson", () => {
  it("parses a valid JSON array into validated characters", () => {
    const json = [
      `[{"name":"Alice","race":"Charr","gender":"Female","profession":`,
      `"Engineer","armor":"Heavy","level":80,"age":0,"created":`,
      `"2024-01-01T00:00:00.000Z"}]`,
    ].join("");
    const parsed = charactersFromJson(json);
    // Verify that desired properties are preserved and valid
    expect(parsed).toHaveLength(1);
    const resChar = parsed[0];
    expect(resChar.name).toBe("Alice");
    expect(resChar.race).toBe("Charr");
    expect(resChar.profession).toBe("Engineer");
    // Verify that armor is derived from profession
    expect(resChar.armor).toBe("Medium"); // Engineer -> Medium armor
  });
  it("round-trips: fromJson(toJson(chars)) deep-equals chars", () => {
    const chars: CharacterInfoShort[] = [
      character({
        name: "Alice",
        race: "Charr",
        profession: "Engineer",
        armor: "Medium",
      }),
      character({
        name: "Bob",
        race: "Asura",
        profession: "Mesmer",
        armor: "Light",
      }),
    ];
    const json = charactersToJson(chars);
    const parsed = charactersFromJson(json);
    expect(parsed).toStrictEqual(chars);
  });
  it("throws when the top-level JSON value is not an array", () => {
    const json = '{"name":"Alice"}';
    expect(() => charactersFromJson(json)).toThrow(
      "character JSON must be a list.",
    );
  });
  it("propagates SyntaxError on malformed JSON", () => {
    const json = '{"name": "Alice"'; // malformed JSON
    expect(() => charactersFromJson(json)).toThrow(SyntaxError);
  });
  it("throws when an element fails validation (bad profession)", () => {
    const invalidJson = [
      `[{"name":"Alice","race":"Charr","gender":"Female","profession":`,
      `"InvalidProfession","armor":"Heavy","level":80,"age":0,`,
      `"created":"2024-01-01T00:00:00.000Z"}]`,
    ].join("");
    expect(() => charactersFromJson(invalidJson)).toThrow(
      "invalid profession: InvalidProfession",
    );
  });
  it("drops unknown wire fields and re-derives armor from profession", () => {
    const jsonWithExtraField = `[
        {
          "name": "Alice",
          "race": "Charr",
          "profession": "Engineer",
          "armor": "Heavy",
          "level": 80,
          "age": 0,
          "gender": "Female",
          "created": "${new Date().toISOString()}",
          "extraField": "should be dropped"
        }
      ]`;
    const parsed = charactersFromJson(jsonWithExtraField);
    expect(parsed[0]).not.toHaveProperty("extraField");
    expect(parsed[0].armor).toBe("Medium"); // Engineer -> Medium armor
  });
});

describe("charactersToCsv", () => {
  it("writes a header row followed by one row per character", () => {
    const chars: CharacterInfoShort[] = [
      character({
        name: "Alice",
        race: "Charr",
        profession: "Engineer",
        armor: "Medium",
      }),
      character({
        name: "Bob",
        race: "Asura",
        profession: "Mesmer",
        armor: "Light",
      }),
    ];
    const csv = charactersToCsv(chars);
    const lines = csv.trim().split(/\r?\n/); // split on either LF or CRLF
    const headers = lines[0].split(",");
    expect(headers).toEqual([
      "name",
      "race",
      "gender",
      "profession",
      "armor",
      "level",
      "age",
      "created",
    ]);
    expect(lines).toHaveLength(3); // header + 2 characters
  });
  it("emits columns in the canonical REQUIRED_CSV_HEADERS order", () => {
    const chars: CharacterInfoShort[] = [
      character({
        name: "Alice",
        race: "Charr",
        profession: "Engineer",
        armor: "Medium",
      }),
    ];
    const requiredHeaders = [
      "name",
      "race",
      "gender",
      "profession",
      "armor",
      "level",
      "age",
      "created",
    ];
    const csv = charactersToCsv(chars);
    const lines = csv.trim().split(/\r?\n/);
    const headers = lines[0].split(",");
    expect(headers).toEqual(requiredHeaders);

    // Assert that the values row matches the character's properties in the same order
    const values = lines[1].split(",");
    const char = chars[0];
    expect(values).toEqual([
      char.name,
      char.race,
      char.gender,
      char.profession,
      char.armor,
      char.level.toString(),
      char.age.toString(),
      char.created,
    ]);
  });
  it("quotes a value containing a comma (PapaParse RFC-4180 quoting)", () => {
    const csv = charactersToCsv([character({ name: "Sir Reginald, Esq." })]);
    expect(csv).toContain('"Sir Reginald, Esq."'); // quoted field survives, comma intact
  });
});

describe("charactersFromCsv", () => {
  it("parses a valid CSV into validated characters", () => {
    const csv = sampleCharacterCSV();
    const parsed = charactersFromCsv(csv);
    expect(parsed).toHaveLength(1);
    const char = parsed[0];
    expect(char.name).toBe("Alice");
    expect(char.race).toBe("Charr");
    expect(char.gender).toBe("Female");
    expect(char.profession).toBe("Engineer");
  });
  it("coerces level/age from strings to numbers", () => {
    const csv = sampleCharacterCSV();
    const parsed = charactersFromCsv(csv);
    const char = parsed[0];
    expect(typeof char.level).toBe("number");
    expect(char.level).toBe(80);
    expect(typeof char.age).toBe("number");
    expect(char.age).toBe(0);
  });
  it("round-trips: fromCsv(toCsv(chars)) deep-equals chars", () => {
    const chars: CharacterInfoShort[] = [
      character({
        name: "Alice",
        race: "Charr",
        gender: "Female",
        profession: "Engineer",
        armor: "Medium",
        level: 80,
        age: 0,
      }),
      character({
        name: "Bob",
        race: "Asura",
        gender: "Male",
        profession: "Mesmer",
        armor: "Light",
        level: 80,
        age: 0,
      }),
    ];
    const csv = charactersToCsv(chars);
    const parsed = charactersFromCsv(csv);
    expect(parsed).toStrictEqual(chars);
  });
  it("recovers a name containing a comma through a quoted field", () => {
    const csv = sampleCharacterCSV().replace("Alice", '"Sir Reginald, Esq."');
    const parsed = charactersFromCsv(csv);
    expect(parsed[0].name).toBe("Sir Reginald, Esq.");
  });
  it("ignores extra columns beyond the required set", () => {
    const csv = [
      `name,race,gender,profession,armor,level,age,created,extra`,
      `Alice,Charr,Female,Engineer,Medium,80,0,${new Date().toISOString()},should be dropped`,
    ].join("\n");
    const parsed = charactersFromCsv(csv);
    expect(parsed[0]).not.toHaveProperty("extra");
  });
  it("tolerates required columns in a different order", () => {
    const csv = [
      `race,gender,profession,armor,level,age,created,name`,
      `Charr,Female,Engineer,Medium,80,0,${new Date().toISOString()},Alice`,
    ].join("\n");
    const parsed = charactersFromCsv(csv);
    expect(parsed[0].name).toBe("Alice");
  });
  it("throws when a required column is missing", () => {
    const csv = [
      `race,gender,profession,armor,level,age,created`,
      `Charr,Female,Engineer,Medium,80,0,${new Date().toISOString()}`,
    ].join("\n");
    expect(() => charactersFromCsv(csv)).toThrow("missing required column");
  });
  it("throws on an empty numeric cell (Number('') === 0 guard)", () => {
    const csv = sampleCharacterCSV().replace(",80,", ",,");
    expect(() => charactersFromCsv(csv)).toThrow("level must be a number");
  });
  it("throws on a non-numeric level/age cell (NaN guard)", () => {
    const csv = sampleCharacterCSV().replace(",80,", ",eighty,");
    expect(() => charactersFromCsv(csv)).toThrow("level must be a number");
  });
  it("throws when a row fails validation (bad profession)", () => {
    const csv = sampleCharacterCSV().replace("Engineer", "InvalidProfession");
    expect(() => charactersFromCsv(csv)).toThrow("invalid profession");
  });
  it("drops unknown columns and re-derives armor from profession", () => {
    const csv = [
      `name,race,gender,profession,armor,level,age,created,extra`,
      `Alice,Charr,Female,Engineer,Heavy,80,0,${new Date().toISOString()},should be dropped`,
    ].join("\n");
    const parsed = charactersFromCsv(csv);
    expect(parsed[0]).not.toHaveProperty("extra");
    expect(parsed[0].armor).toBe("Medium"); // Engineer -> Medium armor
  });
});

describe("combinationInfoToJson", () => {
  it("produces 2-space pretty-printed JSON", () => {
    const chars: CharacterInfoShort[] = [
      character({
        name: "Alice",
        profession: "Engineer",
        armor: "Medium",
      }),
    ];
    const info: CombinationInfo = getCombinations(chars, ["profession"]);
    const json = combinationInfoToJson(info);
    // pins the 2-space indent literally (2 spaces for obj inside)
    expect(json).toContain('\n  "label": "profession"');
  });
  it("keeps the full nested wrapper (parsed JSON deep-equals the info)", () => {
    const chars: CharacterInfoShort[] = [
      character({
        name: "Alice",
        profession: "Engineer",
        armor: "Medium",
      }),
    ];
    const info: CombinationInfo = getCombinations(chars, ["profession"]);
    const json = combinationInfoToJson(info);
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toStrictEqual(info);
  });
});

describe("combinationInfoToCsv", () => {
  it("headers = label, selected properties, then count, then characters", () => {
    const chars: CharacterInfoShort[] = [
      character({
        name: "Alice",
        profession: "Engineer",
        armor: "Medium",
      }),
    ];
    const info: CombinationInfo = getCombinations(chars, ["profession"]);
    const csv = combinationInfoToCsv(info);
    const lines = csv.trim().split(/\r?\n/);
    const headers = lines[0].split(",");
    expect(headers).toEqual(["label", "profession", "count", "characters"]);
  });
  it("emits one row per combination entry", () => {
    const chars: CharacterInfoShort[] = [
      character({
        name: "Alice",
        profession: "Engineer",
        armor: "Medium",
      }),
      character({
        name: "Bob",
        profession: "Mesmer",
        armor: "Light",
      }),
    ];
    const info: CombinationInfo = getCombinations(chars, ["profession"]);
    const csv = combinationInfoToCsv(info);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines).toHaveLength(3); // header + one row per combination entry (2 professions)
  });
  it("joins character names with ', ' in the characters cell", () => {
    const chars: CharacterInfoShort[] = [
      character({ name: "Alice" }),
      character({ name: "Bob" }),
    ];
    const info: CombinationInfo = getCombinations(chars, []);
    const csv = combinationInfoToCsv(info);
    expect(csv).toContain("Alice, Bob");
  });
  it("quotes the multi-name characters cell (contains commas)", () => {
    const chars: CharacterInfoShort[] = [
      character({ name: "Alice" }),
      character({ name: "Bob" }),
    ];
    const info: CombinationInfo = getCombinations(chars, []);
    const csv = combinationInfoToCsv(info);
    expect(csv).toContain(`"Alice, Bob"`); // quoted because of the comma
  });
  it("handles the empty-properties 'All Characters' case", () => {
    const chars: CharacterInfoShort[] = [
      character({ name: "Alice" }),
      character({ name: "Bob" }),
    ];
    const info: CombinationInfo = getCombinations(chars, []);
    const csv = combinationInfoToCsv(info);
    expect(csv).toContain("All Characters");
  });
});
