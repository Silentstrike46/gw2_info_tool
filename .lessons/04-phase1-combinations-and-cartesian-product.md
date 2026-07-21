# Lesson 04 - Phase 1: Combinations, immutability & the cartesian product

_Date: 2026-07-20. Grouping validated characters by selected properties (`src/lib/gw2/combinations.ts`), with an optional filled grid. The unit where TypeScript started deleting runtime code rather than just describing it._

---

## What we built

- **`GROUPABLE_VALUE_LISTS`** - a registry object that is the single source of truth for both the groupable-property union and the value lists the fill step iterates.
- **`getCombinations(characters, properties, options?)`** - groups characters by the selected properties; with `fillBlanks` it emits the full cartesian grid, zero-count rows included.
- **`combinations.test.ts`** - grouping, filling, validation and purity cases.

---

## Design first: what is a "combination"?

Settled before any code was written:

| Decision           | Outcome                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Fill               | Optional `fillBlanks` (default off). Off -> only combos present in the data. On -> full cartesian grid.                                |
| Property type      | Fixed categorical union derived from the registry, not `string`.                                                                       |
| Empty `properties` | One "All Characters" entry - "don't subdivide", not "info missing".                                                                    |
| Output             | A wrapper echoing `properties` + `fillBlanks`, so an export is reproducible.                                                           |
| Row `label`        | Dash-joined values, kept as a stable **id / export handle**, not the table's display source (the table renders columns from `values`). |
| Sort               | Property precedence, each property's values in **value-list order** - so list order is display order.                                  |

---

## Choosing the type deleted three runtime guards

The Python original took `properties: list[str]`, so it had to re-check everything at runtime: unknown property key, character missing a property, and "you may only fill blanks for these four properties". Typing the parameter as a **fixed union of the four categorical fields** made all three disappear:

- unknown key -> a **compile** error
- missing property -> impossible, all four are required fields on `CharacterInfoShort`
- fill not allowed -> the type _is_ the permission

Three `raise ValueError` branches became one (duplicate properties). This is lesson 03's "validate at the boundary, then trust your types", applied to a function signature instead of a parser.

---

## Deriving a union from an object: `keyof typeof`

Lesson 02 turned an `as const` **array** into a union with `(typeof GW2_RACES)[number]`. This is the object analog:

```ts
const GROUPABLE_VALUE_LISTS = {
  race: GW2_RACES,
  gender: GW2_GENDERS,
  profession: GW2_PROFESSIONS,
  armor: GW2_ARMOR_TYPES,
} as const;

type GroupableProperty = keyof typeof GROUPABLE_VALUE_LISTS;
```

Read inside-out: `typeof X` (value -> type) gives the object's type, `keyof` collects its keys into a union. One object now feeds both the type and the fill step - add a property and both grow.

Supporting utility types: **`Record<K, V>`** (object type with keys `K`, values `V`) and **`Partial<T>`** (all properties optional - a row's `values` only holds the _selected_ properties).

Docs: [typeof](https://www.typescriptlang.org/docs/handbook/2/typeof-types.html) - [keyof](https://www.typescriptlang.org/docs/handbook/2/keyof-types.html) - [Utility types](https://www.typescriptlang.org/docs/handbook/utility-types.html)

---

## The widening trick, again

`GROUPABLE_VALUE_LISTS[property]` where `property: GroupableProperty` returns a **union of four `as const` tuple types**, and `.map`/`.indexOf` on that union fails:

> This expression is not callable. Each member of the union has signatures, but none of those signatures are compatible with each other.

Same fix as lesson 03's `.includes` problem - **widen the array, not the value**:

```ts
const values: readonly string[] = GROUPABLE_VALUE_LISTS[property];
```

The `readonly` is load-bearing: the lists are `as const`. Worth filing as a pattern, not a one-off - it shows up whenever you index a registry with a union key.

---

## `for...of` vs `for...in` (the Python trap)

| Python              | JavaScript              |
| ------------------- | ----------------------- |
| `for x in my_list:` | `for (const x of list)` |
| `for k in my_dict:` | `for (const k in obj)`  |

Python's `in` means JS's **`of`**. JS's `for...in` iterates **enumerable property keys**, and object keys are always strings - so on an array you get `"0"`, `"1"`, `"2"`, not the elements.

TS types the `for...in` binding as `string` (never `keyof T`) deliberately, for **soundness**: structural typing means a value can carry properties beyond its declared type at runtime, and `for...in` also walks the prototype chain. Same reason `Object.keys()` returns `string[]`. The escape hatch is an explicit `Object.keys(obj) as (keyof typeof obj)[]`.

This was caught by the type system, not by a test: `Set<GroupableProperty>.has()` rejected the `string`. Untyped, the duplicate guard would have silently compared `"0"` and `"1"`, never fired, and let `["armor", "armor"]` through.

---

## Grouping idioms (Python -> JS)

**Label:** `properties.map((p) => character[p]).join("-")`. Note the receiver flip - in Python the _separator_ owns `.join`; in JS the **array** does. `character[property]` is an **indexed access type** with a union key, resolving to `Race | Gender | Profession | ArmorType`.

**Accumulator:** `new Map<string, CharacterInfoShort[]>()` over a plain `{}` - no inherited prototype keys to collide with data, any key type, guaranteed insertion order, `.size`.

**Get-or-create:** `map.get()` returns `V | undefined`, so TS forces you to handle the miss (no `KeyError`, no `defaultdict`). The idiom:

```ts
const bucket = groups.get(label);
if (bucket === undefined) groups.set(label, [character]);
else bucket.push(character);
```

`get()` hands back a **reference**, so `push` mutates what is already in the map - no second `.set()`.

**No dict comprehension.** `Object.fromEntries` types too loosely to satisfy `Partial<Record<...>>` without a cast; the plain annotated loop type-checks cleanly and reads better. The boring option wins in TypeScript more often than in Python.

---

## Aliasing and `readonly`

Arrays are handles, not values. Returning `properties: properties` puts the **caller's array** inside the result, wiring the two together in both directions: the caller mutating their array changes the result (desyncing the `count === characters.length` invariant), and a consumer calling `result.properties.sort()` reorders the caller's data from three files away.

Fix: shallow-copy on the way out (`[...properties]`). **Deliberately shallow** - the elements are validated DTOs nobody should mutate, deep-copying is wasteful, and it would destroy useful identity. You protect the container you made claims about, not the contents.

**Two different `readonly`s**, usually both wanted:

```ts
readonly characters: readonly CharacterInfoShort[];
//  ^^ (1) property modifier    ^^ (2) ReadonlyArray
```

1. Can't reassign the field.
2. Can't mutate the array - `ReadonlyArray` simply doesn't declare `push`/`sort`/`splice`.

The best part is on the **parameters**: `readonly T[]` is not assignable to a mutable `T[]`, so declaring `properties: readonly GroupableProperty[]` makes `properties: properties` fail to compile and points at the exact line needing the spread. Don't rely on discipline to remember the copy - pick types that make the uncopied version fail to build.

Caveats: `readonly` is **erased at runtime** (a design constraint, not a guarantee); it's **shallow** (the character objects inside stay mutable - see the deferred follow-up); and `sort` doesn't exist on a readonly array, so consumers must `[...rows].sort()` or [`toSorted()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/toSorted). Assignability runs one way, so building a local mutable array and assigning it into a readonly field is fine.

Docs: [readonly properties](https://www.typescriptlang.org/docs/handbook/2/objects.html#readonly-properties) - [ReadonlyArray](https://www.typescriptlang.org/docs/handbook/2/objects.html#the-readonlyarray-type)

---

## The cartesian product as a fold

The constraint: `properties` is **variable-length at runtime**, so you cannot write N nested loops. The reframe:

> Hold a list of partial combinations. Crossing in one property replaces every partial with K copies - one per value.

`1 -> 2 -> 6` for `gender x armor`. Multiplication one factor at a time, with the property count becoming the number of _passes_ rather than the depth of nesting.

```ts
let combos: string[][] = [[]];
for (const property of properties) {
  const possibleValues: readonly string[] = GROUPABLE_VALUE_LISTS[property];
  combos = combos.flatMap((combo) =>
    possibleValues.map((value) => [...combo, value]),
  );
}
```

**`flatMap` vs `map`:** `map` is strictly 1-in-1-out; `flatMap` runs the same callback then flattens one level, so the output can be **longer** than the input. That growth is the whole point - `map` can never grow a list.

**The `[[]]` seed** is one **empty** combination, not zero combinations. Seed with `[]` and `flatMap` has nothing to iterate, so the result stays empty forever. Sums start at 0, products start at 1; `[[]]` is the **1 of cartesian products**.

**Type annotation required:** `[[]]` alone infers `never[][]`, and `[...combo, value]` (a `string[]`) won't assign back.

Generation order matters and is free: first property varies slowest, values in list order - already the specified sort order. The explicit sort is still written, because the grouped-only path is insertion-ordered by whatever the API returned, and an ordering that is _emergent_ rather than stated is one refactor from silently breaking.

Docs: [flatMap](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap)

---

## Merging: let the grid drive the output

Two structures were on the table: assemble from the groups then append the missing combos, or let the product drive everything and look up each cell. The second won:

```
for each tuple in product:
    bucket = groups.get(label) ?? []
    emit entry(label, valuesFromTuple, bucket)
```

No `Set`, no membership check, no dedup, no way to emit a duplicate row. The cost is two assembly paths, each about six lines. "Merge two collections without duplicating" grows edge cases; "the grid is the output, look up what fills each cell" has none.

Corollary that settled it: a blank row has **no character to read `values` from**, so the product must generate **value tuples**, not label strings. Recovering values by splitting a label apart would lean on the no-dash assumption a second time, in the fragile direction.

---

## Smaller things worth keeping

- **Duplicate detection:** `new Set(x).size !== x.length` answers "any duplicates?"; accumulating a `seen` set inside the loop answers "**which** one" and short-circuits. `Set` uses SameValueZero - value equality for primitives, **reference** equality for objects, so deduping objects needs a key function.
- **Comment why, not how.** Comments explaining what `flatMap` does describe the _language_, not the code, and read as noise later. The `[[]]`-as-identity note earns its place because it is non-obvious and invites an incorrect "simplification".
- **Don't recompute the expectation in a test.** `expect(result.label).toEqual(properties.join("-"))` uses the implementation's own logic, so it passes even if the separator changes in both places. Assert the literal `"profession-race"` - a test states the answer, it doesn't re-derive it.
- **Identical concepts should look identical.** Two loops building the same values bag in different shapes (`for...of` vs indexed `for`) make readers hunt for a distinction that isn't there.
- **Correlated properties:** armor is _derived_ from profession, so filling both yields 27 rows of which 18 are structurally impossible. Correct per spec, but a UI concern - see the Phase 5 note in `LEARNING.md`.

---

## Open thread for next session

`readonly` on the character types themselves (see Deferred follow-ups in `LEARNING.md`), then CSV/JSON IO to close Phase 1.
