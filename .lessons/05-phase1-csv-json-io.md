# Lesson 05 — Phase 1: CSV / JSON IO (closing the pure-logic layer)

_Date: 2026-07-25. Import/export of character data as JSON and CSV strings
(`src/lib/gw2/io.ts`), plus two export-only `CombinationInfo` serializers. The
last pure-logic unit before Phase 2 (the API layer). 114 tests green._

---

## What we built

- **`charactersToJson` / `charactersFromJson`** — the round-trippable form; `fromJson`
  re-validates every element through `parseCharacterShort`.
- **`charactersToCsv` / `charactersFromCsv`** — same round-trip in CSV, via **PapaParse**;
  `fromCsv` coerces the numeric cells and re-validates.
- **`combinationInfoToJson` / `combinationInfoToCsv`** — export-only serializers for a
  grouped result (JSON keeps the full nested wrapper; CSV is the flat table).
- **`io.test.ts`** — round-trips, the coercion guards, comma quoting, extra/reordered
  columns, and the export shapes.
- Two small refactors: extracted `assert` to its own **`src/lib/asserts.ts`** leaf module,
  and the `character()` test factory to **`src/testutils.ts`**.

---

## Design first

Settled before code, as with every unit:

| Decision                 | Outcome                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Round-trippable form     | The raw `CharacterInfoShort[]` (JSON **and** CSV). Never the `CombinationInfo` wrapper.                               |
| Why not the wrapper      | It's _derived_ and reproducible from `(characters, properties, fillBlanks)` — persist the source, recompute the view. |
| `CombinationInfo` export | One-way. JSON = full nested wrapper; CSV = flat table. Never re-imported (re-upload characters).                      |
| Re-validation            | Every read path funnels through `parseCharacterShort` — the boundary already exists.                                  |
| Pure vs DOM              | These are string ↔ domain functions; the File API (picker, Blob download) is a thin Phase-6 wrapper over them.        |

That last row is why the whole layer is unit-testable now: nothing here touches the
browser. The download button and file `<input>` just supply/consume these strings later.

---

## JSON: `JSON.parse` is a hole in the type system

`JSON.parse` returns **`any`**, not `unknown`. `any` switches type-checking _off_ and
propagates, so `const data = JSON.parse(text)` silently re-opens everything lesson 03's
validator closed. The discipline is to **re-close it at the assignment**:

```ts
const raw: unknown = JSON.parse(text); // re-close the `any` hole immediately
assert(Array.isArray(raw), "character JSON must be a list.");
for (const item of raw as unknown[]) {
  returnCharacters.push(parseCharacterShort(item));
}
```

> **Superseded in [lesson 06](./06-phase2-api-layer.md) — for this project only.**
> `src/unknown-globals.d.ts` now re-declares `JSON.parse` and `Array.isArray` to yield
> `unknown` by default, so both the `: unknown` annotation and the `as unknown[]` cast
> above are redundant _here_ (`no-unnecessary-type-assertion` flags the cast, and the
> live `io.ts` no longer has it). The snippet is kept as written because this is the
> **stock TypeScript behaviour** you will meet in every project without that override —
> where you must still narrow by hand.

Two JS/TS notes:

- **`Array.isArray` on `unknown` narrows to `any[]`**, not `unknown[]` — so the `raw as
unknown[]` cast puts each `item` back to `unknown` before it reaches the validator.
- We **let `SyntaxError` propagate** from `JSON.parse` (malformed input), matching
  Python's `json.load`; error-to-UI mapping is a later concern. The one error we raise
  ourselves is "top-level value isn't an array" — because `JSON.parse("42")` _succeeds_.

Serialising is the easy direction: `JSON.stringify(value, null, 2)` — `null` replacer,
`2`-space indent (a human may open the file).

Docs: [MDN JSON.parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) ·
[JSON.stringify](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify)

---

## CSV has no types — and JS number coercion is a minefield

Unlike JSON, **every CSV cell is a string** (`"80"`, not `80`). `parseCharacterShort`
asserts `typeof level === "number"`, so the read path must coerce `level`/`age` **before**
delegating — the CSV analog of Python's `int(row["level"])`. That coercion is CSV-transport's
job, not the validator's.

The trap is that `Number()` fails silently in three ways the Python `int()` didn't:

- `Number("")` is **`0`** (not an error) — an empty cell becomes a valid-looking zero.
- `Number("abc")` is **`NaN`**, and `typeof NaN === "number"` is `true` — so a garbage cell
  would **pass** the validator's `typeof` check and poison the data.
- `Number("Infinity")` / `Number("1e999")` are **`Infinity`**.

So guard explicitly, and use **`Number.isFinite`**, not `!isNaN` (which lets `Infinity`
through):

```ts
function parseNumericField(value: unknown, field: string): number {
  const err = new Error(`${field} must be a number, got: ${String(value)}`);
  if (typeof value !== "string" || value.trim() === "") throw err; // Number("") === 0!
  const num = Number(value);
  if (!Number.isFinite(num)) throw err; // rejects NaN and Infinity
  return num;
}
```

Docs: [MDN Number()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/Number) ·
[Number.isFinite](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isFinite)

---

## PapaParse: don't hand-roll RFC-4180

JS has no standard-library CSV parser (unlike Python's `csv`). We used **PapaParse**, the
widely-used browser CSV library, so the quoting minefield (commas, quotes, newlines inside
fields) is someone else's tested problem. We test _our_ boundary, not the quoting.

- **Import:** `import * as Papa from "papaparse"` — its types are **named exports** with
  `export as namespace Papa`; there is **no default export**, so `import Papa from …`
  would fail under `verbatimModuleSyntax`. Add `@types/papaparse` (community types).
- **`header: true`** gives rows keyed by **column name** — so we read by name, not by
  position. That single choice makes two features free: extra columns and any column
  **order** are tolerated on read, and unknown columns get dropped by the validator's
  fresh-object rebuild. Only the required set must be _present_ (a subset check on
  `meta.fields`).
- **Result shape** is `{ data, errors, meta }`, not just rows — `errors` catches malformed
  rows (wrong field count); `meta.fields` is the header list. We deliberately **don't use
  `dynamicTyping`**: we want explicit, validated coercion, not Papa's guesses.
- **`transform: (v) => v.trim()`** — a deliberate leniency. The single most common
  hand-authored CSV convention is a space after each comma (`a, b, c`), which would make
  ` Charr` fail `isRace`. Trimming tolerates it. It's a spec deviation (RFC-4180 says
  whitespace is significant), justified because our domain has no field where surrounding
  whitespace is meaningful.
- **`Papa.unparse(rows, { columns })`** fixes the output column order explicitly rather
  than relying on object-key order.

Docs: [Papa.parse config](https://www.papaparse.com/docs#config) ·
[Papa.unparse](https://www.papaparse.com/docs#json-to-csv)

---

## `CombinationInfo` export: nested → flat

`combinationInfoToJson` is a one-liner (`JSON.stringify(info, null, 2)`) — lossless, keeps
every entry's `characters[]`. The interesting one is CSV, because the wrapper is _nested_
and CSV is _flat_. We flatten to **the table the user sees**, with **dynamic** columns:

```
[label, ...info.properties, count, characters]
```

- **Columns depend on the input** — for `["profession","race"]` the header is
  `label,profession,race,count,characters`; for empty properties ("All Characters") it's
  `label,count,characters`. Build the column list from `info.properties` at runtime.
- **`label` leads** as the row's stable composite key. It's redundant with the property
  columns _by design_: in an export-for-other-tools format, a single key alongside the
  decomposed columns is the norm — and it's far easier to delete an unwanted column than to
  recompute a compound key. It also rescues the otherwise-bare All-Characters row.
- **`characters` is squashed** to a `", "`-joined name list; the full objects live only in
  the JSON export. That cell contains commas, so PapaParse quotes it automatically —
  demonstrating exactly why we didn't hand-roll.
- `entry.values[property]` is `string | undefined` (it's a `Partial`), so the `?? ""`
  fallback is load-bearing: it makes the cell a `string` and handles blank rows.
- **Reserved column names:** `label`, `count`, `characters` (none collide with the
  groupable properties today — same class of assumption as "no dashes in values").

---

## Testing lessons (mostly reinforced from 03/04)

- **Don't recompute the expectation with the implementation's own logic.** Asserting
  `toBe(JSON.stringify(chars, null, 2))` against a function that _is_ that call is a
  tautology. Assert an _observable_ property instead — the literal 2-space indent
  (`toContain('\n    "name":')`).
- **Construct a function's input independently of its inverse.** When testing
  `charactersFromJson`, hardcode the JSON string; don't build it with `charactersToJson`
  (a bug in one would fail the other's test). The **one** exception is the round-trip test,
  where composing both is the whole point.
- **`toStrictEqual` > `toEqual`** for the parsed DTOs — it distinguishes a field that is
  _present but `undefined`_ from one that is _absent_, pinning "the result has exactly the
  declared fields."
- **Assert the throw _message_, not bare `toThrow()`** — otherwise a test passes even when
  the code throws for the wrong reason (e.g. a missing-column error masquerading as the
  numeric guard).
- **You cannot parse CSV with `.split(",")`.** A test tried to, and broke on
  `"Sir Reginald, Esq."` — the quoted field's internal comma is not a delimiter. That's the
  exact hazard quoting exists to solve; to inspect structure, parse it back with `Papa`.
- **`Papa.unparse` emits CRLF** (`\r\n`) per spec, so a hand-split leaves a trailing `\r`.
  Split fixtures on `/\r?\n/`. (Don't force `newline: "\n"` just to satisfy a test —
  changing production output to fit an assertion is backwards.)
- **Template literals preserve all indentation** — there's no auto-dedent. Build multi-line
  CSV/JSON fixtures as an **array of lines** `.join("\n")` so the code's indentation never
  leaks into the data.

Docs: [Vitest expect](https://vitest.dev/api/expect.html) (`toStrictEqual`, `toThrow`)

---

## Smaller things worth keeping

- **Where a utility lives matters.** `assert` is a generic "throw + narrow" helper, not
  validation surface, so it moved to its own `asserts.ts` leaf module — importing it from
  `validators.ts` would couple `io.ts` to the validator for something incidental. Assertion
  functions (`asserts condition`) keep their narrowing across module boundaries.
- **Shared test factory.** `character({ overrides })` (a test-data builder with `Partial<T>`
  overrides) moved to `src/testutils.ts` so both suites share it. Adding a field to
  `CharacterInfoShort` now updates _one_ factory — the builder pattern makes DRY _reduce_
  breakage, not increase it. (Named `testutils.ts`, no `.test.` infix, so Vitest doesn't
  try to run it.)
- **The `src/lib/` gitignore trap.** The global `core.excludesFile` had `lib/` (a
  build-output convention), which silently ignored our _source_ `src/lib/` — new files there
  were invisible to git while already-tracked ones survived. Fixed with a project-level
  negation (`!src/lib/` + `!src/lib/**`); project rules override the global excludes file.

---

## Open thread for next session

Phase 1's pure logic is done. The gate before Phase 2 is the **`readonly` character-types**
follow-up (`types.ts`) — make the fields of `CharacterInfoShort` / `CharacterInfo` (and the
nested info types) `readonly` so the shallow array-`readonly` from lesson 04 becomes deep.
Then **Phase 2 — the API layer**: `fetch` the GW2 API, typed responses, and MSW mocking
(no real network in tests). First real `async`/`await`, still no React components.
