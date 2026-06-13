# Lesson 02 — Phase 1: Types, derived literal unions & the `tsc -b` gotcha

_Date: 2026-06-13. First pure-logic unit: the GW2 character types module
(`src/lib/gw2/types.ts`). No React yet — just the TypeScript type system._

---

## What we built

`src/lib/gw2/types.ts` — the shared vocabulary every later module imports:

- Static value lists as `as const` arrays: `GW2_RACES`, `GW2_GENDERS`,
  `GW2_PROFESSIONS`, `GW2_ARMOR_TYPES`, `GW2_CRAFTING_DISCIPLINES`,
  `GW2_CHARACTER_FLAGS`, and the `GW2_PROFESSION_TO_ARMOR_TYPE` map.
- Literal-union types **derived** from those arrays: `Race`, `Gender`,
  `Profession`, `ArmorType`, `CraftingDiscipline`, `CharacterFlag`.
- Interfaces: `CraftingDisciplineInfo`, `WvwAbilityInfo`, `CharacterInfoShort`,
  and `CharacterInfo extends CharacterInfoShort`.

Everything is exported (this module has no private internals — being the
vocabulary IS its job).

---

## `as const` — from "array of strings" to "tuple of literals"

```ts
const a = ["Human", "Charr"]; // type: string[]
const b = ["Human", "Charr"] as const; // type: readonly ["Human", "Charr"]
```

`as const` does two things: makes the value **readonly**, and narrows each element
from the wide `string` to its exact **literal** type. That literal information is
the raw material the union derivation reads. Without it, the chain below collapses
to `string`.

---

## Deriving a union: `(typeof GW2_RACES)[number]`

Read it inside-out — three pieces compose:

1. **`as const`** (above) → the array's type holds literals, not `string`.
2. **`typeof GW2_RACES`** → the _type_ of a runtime value. `typeof` here is the
   **type-world** operator (after `type X =` or a `:` annotation), totally separate
   from JavaScript's runtime `typeof`. Result: `readonly ["Human", "Charr", …]`.
3. **`[number]`** → an **indexed access type**. Indexing a tuple type by a specific
   number gives that slot (`(typeof GW2_RACES)[0]` → `"Human"`); indexing by the
   whole `number` type asks "what's at _any_ index?" → the **union of all slots**:
   `"Human" | "Charr" | "Norn" | "Asura" | "Sylvari"`.

**Payoff:** one source of truth. Add a value to the array and the union updates
itself — no parallel hand-written union to keep in sync (the drift the old
"keep these in sync" comment was guarding against).

Docs: [Indexed Access Types](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html)
· [`typeof` type operator](https://www.typescriptlang.org/docs/handbook/2/typeof-types.html)
· [const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions).

---

## Python → TypeScript mapping (for reference)

| Concept                      | TypeScript                        |
| ---------------------------- | --------------------------------- |
| A fixed dict shape           | `interface`                       |
| "one of these exact strings" | string-literal union `'a' \| 'b'` |
| optional key                 | `prop?: T`                        |
| subclass / inherit a shape   | `interface B extends A`           |
| frozen list of constants     | `const xs = [...] as const`       |

---

## The `tsc -b` gotcha (important — cost us a false "pass")

The root `tsconfig.json` is a **solution-style** config: `"files": []` plus
`references` to `tsconfig.app.json` and `tsconfig.node.json`. Consequences:

- `npx tsc --noEmit` against it compiles the file list it was given — **empty** —
  so it checks **nothing** and exits 0. A green light that means nothing.
- The correct command is **`tsc -b`** (build mode): it follows `references` and
  actually type-checks the app + node projects.

We added an npm script so this is a non-issue going forward:

```jsonc
"typecheck": "tsc -b"
```

Run it with **`npm run typecheck`** — that uses the project's pinned TypeScript
(`node_modules/.bin` is first on PATH) so local/CI/everyone runs the same compiler.
Notes on `tsc -b`:

- **Incremental** — caches to `.tsbuildinfo`; only re-checks what changed.
  `npx tsc -b --force` to re-check everything.
- Emits no `.js` because both referenced configs set `"noEmit": true`.

---

## `noUnusedLocals` + `verbatimModuleSyntax` (two strict-config behaviours we hit)

- **`noUnusedLocals`** flags any module-level declaration that is neither used in
  the file nor exported. `GW2_PROFESSION_TO_ARMOR_TYPE` tripped it because nothing
  referenced it _yet_. The fix was to recognise it as part of the public surface
  and `export` it (exporting counts as "used") — not to manufacture a local use.
  (The other value lists escaped the check only because a `typeof` referenced them.)
- **`verbatimModuleSyntax`** forbids mixing types and values in a plain
  `export { … }`; types must go through `export type`. We sidestepped it entirely
  by using **inline `export`** on each declaration (`export const`, `export type`,
  `export interface`), which also makes the public surface readable at the point of
  definition.

---

## Open thread for next session

`CharacterInfo.wvw_abilities` is **snake_case**, matching the GW2 API's JSON, while
TS convention is camelCase. Decision deferred to the validators unit: mirror the
wire format (parsed JSON drops straight in) vs. idiomatic camelCase with a mapping
at the API boundary. The validator is where that boundary actually lives, so we
decide it there.
