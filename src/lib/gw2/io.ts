/**
 * Import/export of character data as JSON and CSV strings.
 *
 * Every read path re-validates through `parseCharacterShort`.
 * Re-validation also drops unknown wire fields and re-derives `armor`.
 */

import * as Papa from "papaparse"; // no default export; namespace import required
import { type CharacterInfoShort } from "./types";
import { type CombinationInfo } from "./combinations";
import { parseCharacterShort } from "./validators";
import { assert } from "../asserts";
// ---------------------------------------------------------------------------
//                                  JSON
// ---------------------------------------------------------------------------

/**
 * Serialise characters to a pretty-printed JSON string (the round-trippable form).
 *
 * @param characters - the characters to serialise.
 * @returns a 2-space-indented JSON array of characters.
 */
export function charactersToJson(
  characters: readonly CharacterInfoShort[],
): string {
  return JSON.stringify(characters, null, 2);
}

/**
 * Parse a JSON string into validated characters.
 *
 * @param text - a JSON string; expected to be an array of raw character objects.
 * @returns the validated characters.
 * @throws SyntaxError if `text` is not valid JSON (propagated from JSON.parse).
 * @throws Error if the top-level value is not an array, or if any element fails
 *   validation (propagated from parseCharacterShort).
 */
export function charactersFromJson(text: string): CharacterInfoShort[] {
  const raw: unknown = JSON.parse(text); // re-close the 'any' hole immediately
  // 2. Assert it's an array; throw a clear Error if not.
  assert(Array.isArray(raw), "character JSON must be a list.");
  const returnCharacters: CharacterInfoShort[] = [];
  for (const item of raw) {
    const entry = parseCharacterShort(item);
    returnCharacters.push(entry);
  }
  return returnCharacters;
}

// ---------------------------------------------------------------------------
//                                  CSV
// ---------------------------------------------------------------------------

// Canonical column set/order for the CharacterInfoShort round-trip. Used to fix
// output column order (unparse) and to check required columns are present on read.
// Extra columns and different column ORDER are tolerated on read (we index by
// header name, not position); only these must all be present.
const REQUIRED_CSV_HEADERS = [
  "name",
  "race",
  "gender",
  "profession",
  "armor",
  "level",
  "age",
  "created",
] as const;

/**
 * Coerce a CSV cell (always a string) to a finite number, or throw.
 *
 * CSV has no types — every cell arrives as a string. `Number()` is a minefield
 * here: `Number("")` is 0, and `Number("abc")` is NaN whose `typeof` is
 * "number" — so a bad cell would sail through parseCharacterShort's typeof check.
 * Guard both by rejecting anything non-finite (also catches "Infinity"/"1e999").
 *
 * @param value - the raw cell value.
 * @param field - field name, for the error message.
 * @returns the parsed finite number.
 * @throws Error if the value is empty or does not parse to a finite number.
 */
function parseNumericField(value: unknown, field: string): number {
  const err = new Error(`${field} must be a number, got: ${String(value)}`);
  if (typeof value !== "string" || value.trim() === "") {
    throw err;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw err;
  }
  return num;
}

/**
 * Serialise characters to a CSV string (the round-trippable form).
 *
 * @param characters - the characters to serialise.
 * @returns a CSV string with the canonical header row and one row per character.
 */
export function charactersToCsv(
  characters: readonly CharacterInfoShort[],
): string {
  // Spread into new array to prevent mutation of the original array
  const columns: string[] = [...REQUIRED_CSV_HEADERS];
  const str = Papa.unparse([...characters], { columns: columns });
  return str;
}

/**
 * Parse a CSV string into validated characters.
 *
 * Column order is irrelevant and extra columns are ignored (we read by header
 * name and parseCharacterShort rebuilds a fresh object); the REQUIRED_CSV_HEADERS
 * must all be present.
 *
 * @param text - a CSV string with a header row.
 * @returns the validated characters.
 * @throws Error if parsing reports errors, a required column is missing, a
 *   numeric field is unparseable, or any row fails validation.
 */
export function charactersFromCsv(text: string): CharacterInfoShort[] {
  const { data, errors, meta } = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true, // No dynamicTyping: we coerce + validate ourselves
    transform: (value) => value.trim(), // lenient: tolerate space-after-comma etc.
  });
  if (errors.length > 0) {
    throw new Error(
      `CSV parse errors: ${errors.map((e) => e.message).join("; ")}`,
    );
  }
  for (const header of REQUIRED_CSV_HEADERS) {
    assert(meta.fields?.includes(header), `missing required column: ${header}`);
  }
  const returnCharacters: CharacterInfoShort[] = [];
  for (const row of data) {
    const raw: Record<string, unknown> = {
      ...row,
      level: parseNumericField(row.level, "level"),
      age: parseNumericField(row.age, "age"),
    };
    const entry = parseCharacterShort(raw);
    returnCharacters.push(entry);
  }
  return returnCharacters;
}

// ---------------------------------------------------------------------------
//                      CombinationInfo export (export-only)
// ---------------------------------------------------------------------------
// Export-only: a CombinationInfo is never re-imported. To reload data a user
// re-uploads CharacterInfoShort[] (CSV/JSON) and we recompute the combinations.

/**
 * Serialise a CombinationInfo to a pretty-printed JSON string (lossless).
 *
 * Keeps the whole nested wrapper — label, properties, fillBlanks, and each
 * entry's full characters[]. The form for "use my results in another app".
 *
 * @param info - the combination result to serialise.
 * @returns a 2-space-indented JSON string.
 */
export function combinationInfoToJson(info: CombinationInfo): string {
  return JSON.stringify(info, null, 2);
}

/**
 * Serialise a CombinationInfo to a flat CSV — the table the user sees.
 *
 * One row per entry. Columns are DYNAMIC: one per selected property (in
 * info.properties order), then `count`, then `characters` (a ", "-joined list
 * of character names — the full objects only appear in the JSON export).
 *
 * Note that the characters[] will be reduced to a comma-separated list of names
 * in the CSV export. The full character objects are only preserved in the JSON export.
 * The cells will be escaped as needed by Papa.unparse.
 *
 * Reserved table names (do not use these as column names):
 * "label", "count", "characters".
 *
 * @param info - the combination result to serialise.
 * @returns a CSV string with a dynamic header row and one row per entry.
 */
export function combinationInfoToCsv(info: CombinationInfo): string {
  const columns: string[] = [
    "label",
    ...info.properties,
    "count",
    "characters",
  ];
  const rows: Record<string, string | number>[] = [];
  for (const entry of info.combinations) {
    const row: Record<string, string | number> = {};
    row.label = entry.label;
    for (const property of info.properties) {
      row[property] = entry.values[property] ?? "";
    }
    row.count = entry.count;
    row.characters = entry.characters.map((c) => c.name).join(", ");
    rows.push(row);
  }
  return Papa.unparse(rows, { columns });
}
