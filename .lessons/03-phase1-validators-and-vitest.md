# Lesson 03 — Phase 1: Validators, type guards & the first Vitest suite

_Date: 2026-06-14. The API boundary: turning untrusted JSON into trusted domain
objects (`src/lib/gw2/validators.ts`), plus the project's first unit tests
(`validators.test.ts`, 59 passing)._

---

## What we built

- **Type guards** `isRace`, `isGender`, `isProfession` — each `(value: unknown) => value is T`.
- **`armorForProfession`** — a total lookup deriving armor weight from profession.
- **`parseCharacterShort`** — the boundary function: `(raw: unknown) => CharacterInfoShort`,
  throwing a field-named `Error` on anything missing or mistyped.
- A private **`assert`** helper (`asserts condition`).
- **`validators.test.ts`** — guards (valid / invalid / non-string), the full
  profession→armor map, and `parseCharacterShort` happy path + every throw case.

---

## Why a validator exists at all: types are erased

TypeScript types vanish at compile time. At runtime there is no `Race`, no
`CharacterInfoShort` — so a type annotation or `as` cast **checks nothing and
strips nothing**. `return raw as CharacterInfoShort` is a lie to the compiler that
ships whatever the network sent. The validator's job is to do **real runtime
checks** and then tell the compiler what it proved.

---

## Type guards & the `.includes` widening trick

A **type predicate** is a function whose return type is `value is T`. After
`if (isRace(x))`, TS narrows `x` to `Race` in that branch — the runtime check and
the compile-time type move together.

Built straight off the `as const` arrays, with one gotcha:

```ts
export function isRace(value: unknown): value is Race {
  if (typeof value !== "string") return false;
  // Widen the array, not the value: .includes() otherwise demands a Race arg.
  return (GW2_RACES as readonly string[]).includes(value);
}
```

`Array.includes` types its parameter as the element type (`Race`), so passing a
`string` is rejected. The fix is to widen the **array** to `readonly string[]`;
the `value is Race` return type still carries the proof outward. (The early
`typeof` return also narrows `value` to `string`, so no cast on `value` is needed.)

Docs: [Type predicates](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates)

---

## Assertion functions: narrowing by throwing

```ts
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
```

The `asserts condition` return type means: if this call _returns_, the condition
held — so TS narrows afterwards, exactly like an inline `if`-throw. Combined with a
type-predicate call it narrows the underlying value:

```ts
assert(isProfession(data.profession), `invalid profession: ${data.profession}`);
// data.profession is now `Profession`
```

One field, one line. A single type assertion also subsumes the existence check: a
missing key reads as `undefined`, which fails `typeof … === "string"` anyway — no
separate `"key" in data` needed (for required fields).

Docs: [Assertion functions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions)

---

## `unknown` vs `any`, and the indexing cast

Raw input is typed **`unknown`**, not `any`. `any` switches type-checking off;
`unknown` forbids touching the value until you narrow it — the discipline we want
at a boundary. To read fields, narrow to an indexable record once:

```ts
assert(
  typeof raw === "object" && raw !== null && !Array.isArray(raw),
  "character must be an object",
);
const data = raw as Record<string, unknown>;
```

This `as Record<string, unknown>` is **not** the banned whole-object cast — each
`data.field` still comes out `unknown` and must be validated. The forbidden one is
`raw as CharacterInfoShort`, which asserts the entire shape unchecked. Note
`typeof null === "object"` and `typeof [] === "object"`, so both the null and array
checks are load-bearing.

---

## Validate at the boundary, then trust your types

`armorForProfession` takes an **already-validated** `Profession`, so a runtime
"does this profession have a mapping?" check is dead code — the total `as const`
map plus indexing guarantees a hit, and TS would flag a missing entry at _compile_
time if the lists ever drift. The lesson: re-checking already-typed data inside the
boundary is redundant defensiveness TS lets you delete.

```ts
export function armorForProfession(profession: Profession): ArmorType {
  return GW2_PROFESSION_TO_ARMOR_TYPE[profession];
}
```

---

## DTO discipline: construct, don't pass through

Because types don't strip anything, returning the input (even validated) keeps
every extra wire field at runtime — they'd surface in storage and exports. The only
way to drop them is to **build a fresh object** with exactly the declared fields
(which we must do anyway, since `armor` is derived and not in the input):

```ts
const character: CharacterInfoShort = {
  name: data.name, race: data.race, /* … */,
  armor: armorForProfession(data.profession), // derived
};
return character;
```

A test proves it: feed in `wvw_abilities`, assert it's **absent** from the result.

This also resolved lesson 02's open thread — `wvw_abilities` → **camelCase**
`wvwAbilities` in `types.ts`, with the validator as the wire→domain boundary.

---

## Vitest: the testing vocabulary

- `describe`/`it` with **explicit imports** from `vitest` (no globals — house style).
- **`toBe`** = `Object.is`, for primitives/booleans. **`toEqual`** = deep equality,
  for the parsed object (it builds a _new_ object, so `toBe` would fail on identity).
- **`toThrow(/msg/)`** — wrap the call in an arrow (`expect(() => fn()).toThrow(…)`)
  so `expect` invokes it and catches; the arg is matched as substring/regex against
  the message. Don't use `it.fails` for negative cases — assert the result directly
  (`toBe(false)`) or assert the throw.
- **`it.each(rows)("name %s", …)`** — table-driven; used for the 9-profession map,
  the value lists, and non-string inputs. `%s` gives each row a distinct name.
- **`it.todo("…")`** — a pending placeholder (no body); the count ticks down as you
  implement, doubling as a progress bar. (Different from `it.skip`/`it.only`.)
- **Watch mode** `npm test` re-runs only the tests affected by a change; `npm run
test:run` is the one-shot CI form.

Docs: [Vitest API](https://vitest.dev/api/) · [expect](https://vitest.dev/api/expect.html)

---

## Tooling gotcha: Vite 8 + Vitest 3 config split

Vite 8 is built on **Rolldown** and ships different plugin types than the
(Rollup-based) Vite that **Vitest 3** bundles under its own `node_modules`. Putting
the React plugin into a `defineConfig` imported from `vitest/config` makes the two
`Plugin` types collide (a wall of `hotUpdate`/`rolldownVersion` errors).

Fix — **keep the configs separate**: `vite.config.ts` stays as-is for the app
build; a standalone **`vitest.config.ts`** holds the test config with **no
plugins** (pure-logic Node tests don't need `@vitejs/plugin-react`). Added it to
`tsconfig.node.json`'s `include` so it's type-checked too. Scripts: `test` =
`vitest` (watch), `test:run` = `vitest run`.

(Aside: `noUnusedLocals` bites scaffolds — a test file can't pre-import `expect` or
the functions under test before anything references them, so the scaffold imported
only `describe`/`it` and listed the rest in a comment to uncomment as used.)

---

## Open thread for next session

`combinations.ts` — group validated characters by selected properties and "fill
blanks" so absent combinations still show. Decide the input/output types first:
cartesian product of the value lists, or only combinations present in the data?
Likely first contact with **generics** and `keyof`/mapped types.
