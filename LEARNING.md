# Learning Log & Roadmap

This is the "where were we?" file. Travels with the repo so it works across
machines. Update the checklist and concept log as we go. Detailed write-ups of
each lesson live in [`.lessons/`](./.lessons/).

## Next session — resume here

**Phase 1, next unit: `combinations.ts`** (probable home
`src/lib/gw2/combinations.ts`). Given a list of validated `CharacterInfoShort`
(soon `CharacterInfo`) and a set of selected properties to group by, produce the
grouped rows that feed the table. The "fill blanks" part: combinations with no
matching characters should still appear, so the output is stable regardless of the
account. Working mode stays Socratic — the developer writes it, Claude reviews.

Settle at the start of the unit:

- **Decide the shape first:** what exactly is a "combination" — every cartesian
  product of the selected properties' value lists, or only the combinations that
  actually occur in the data (plus blanks)? Nail down the input/output types before
  writing logic.
- New TS concepts likely to come up: **generics** (a group-by that works over any
  property key), **mapped/keyof types** for selecting properties by name, and
  `Map`/`Record` for accumulation.
- This is the second **unit-tested** module — pure functions, same Vitest setup as
  validators. Stub nothing yet; real API calls come in Phase 2.

Run the type check with **`npm run typecheck`** (= `tsc -b`). NOT
`tsc --noEmit` against the root config — that checks nothing (see lesson 02). Run
tests with **`npm test`** (watch) or **`npm run test:run`** (one-shot).

## Roadmap

| Phase                    | What we build                                        | React/TS concepts                                              |
| ------------------------ | ---------------------------------------------------- | -------------------------------------------------------------- |
| 0. Scaffold              | Vite + TS project, folder structure, tooling         | Project anatomy, npm scripts, how the app boots                |
| 1. Pure logic (no React) | Port `types`, `validators`, `combinations`, CSV/JSON | TS type system, unions/generics, modules, Vitest               |
| 2. API layer             | Port the GW2 request handler with `fetch`            | `async`/`await`, typed responses, MSW mocking                  |
| 3. React shell           | Mantine skeleton, 3 routes, header nav               | JSX, components, props, `MantineProvider`, React Router        |
| 4. State & data          | API-key input → fetch → store characters cross-page  | `useState`, `useEffect`, Context, custom hooks, sessionStorage |
| 5. The table             | Combinations page wired to Phase-1 logic             | Lifting state, derived data, `mantine-react-table`             |
| 6. Niceties              | CSV/JSON upload/download, polish                     | File APIs, refactors; introduce TanStack Query                 |

Each phase depends on the previous one — one new concept at a time.

## Progress checklist

- [x] **Phase 0 — Scaffold** (done)
  - [x] Run `npm create vite@latest . -- --template react-ts`
  - [x] Reconcile clobbered `.gitignore` / `README.md`
  - [x] Understand how the app boots (`index.html` → `main.tsx` → `App.tsx`); dev server + HMR confirmed
- [ ] **Phase 1 — Pure logic** (in progress)
  - [x] `types.ts` — value lists, derived literal unions, character interfaces (`tsc -b` clean)
  - [x] `validators.ts` — runtime type guards + `parseCharacterShort` + derive `armor`; 59 Vitest tests
  - [ ] `combinations.ts` — group characters by selected properties; fill blanks (next)
  - [ ] CSV / JSON IO
- [ ] Phase 2 — API layer
- [ ] Phase 3 — React shell
- [ ] Phase 4 — State & data
- [ ] Phase 5 — The table
- [ ] Phase 6 — Niceties

## Concept log

_Concepts the user has learned, with date and a one-line takeaway. Newest first._

- **2026-06-23 — Tooling: strict, type-aware ESLint.** Upgraded `eslint.config.js` from `tseslint.configs.recommended` (syntactic only) to **`strictTypeChecked` + `stylisticTypeChecked`** (correctness + consistency axes), plus the React plugins **`eslint-plugin-react-x`** / **`eslint-plugin-react-dom`** enabled early so styling is enforced from the first Phase-3 component. **Type-aware linting**: the `*TypeChecked` configs hand ESLint the TS type-checker, unlocking rules that need type info (`no-floating-promises`, `no-misused-promises`, `restrict-template-expressions`…); enabled via `parserOptions.projectService: true` (v8+ preferred over hand-listing `project: [...]`). `eslint-config-prettier` stays **last** to disable formatting rules. Five new errors surfaced and fixed: **`restrict-template-expressions`** flagged interpolating still-`unknown` values into `assert` messages in `validators.ts` → wrap with `String(...)` (TS types are erased, so the value is genuinely `unknown` at that call site); **`no-non-null-assertion`** flagged `main.tsx`'s `getElementById("root")!` → replaced with a real runtime null-check that throws (enforces lesson 01's compile-time-vs-runtime point); **`no-confusing-void-expression`** flagged `App.tsx`'s `onClick={() => setCount(...)}` returning `void` → wrapped body in braces.
- **2026-06-14 — Phase 1: validators, type guards & first Vitest suite.** Built `src/lib/gw2/validators.ts` + `validators.test.ts` (59 tests, all green). **Runtime validation** is needed because TS types are **erased** — a type annotation/`as` cast does not check or strip anything at runtime, so the API boundary must do real checks. **Type guards**: a function returning `value is T` (a **type predicate**) narrows at call sites; built off the `as const` arrays via the `(ARR as readonly string[]).includes(value)` widening trick (`.includes` otherwise demands its arg already be `T`). **Assertion functions**: `function assert(c): asserts c` narrows by _throwing_ on the false path — its consumer (`parseCharacterShort`) is what finally satisfied `noUnusedLocals`. **`unknown` vs `any`**: raw input is `unknown` (forces narrowing) not `any` (turns checking off). **Validate at the boundary, then trust your types** — `armorForProfession` takes an already-validated `Profession`, so its runtime existence check was dead code (the total `as const` map + indexing already guarantees it, and would error at compile time on drift). **DTO discipline**: return a freshly **constructed** object, not the input — only that drops unknown wire fields at runtime (proven by a test that feeds in `wvw_abilities` and asserts it's absent from the result). **Decision resolved**: `wvw_abilities` → camelCase `wvwAbilities` (lesson 02's open thread), the validator being the boundary that does the rename. **Vitest**: `describe`/`it`, explicit imports (no globals, per house style); **`toBe`** (Object.is, primitives) vs **`toEqual`** (deep, objects); **`toThrow(/msg/)`** with the call wrapped in an arrow so `expect` catches it; **`it.each`** for table-driven cases (the 9-profession map, value lists, non-string inputs); **`it.todo`** for pending placeholders; watch mode (`npm test`) re-runs only affected tests. **Tooling gotcha**: Vite 8 (Rolldown) and Vitest 3 bundle different Vite copies, so a shared `defineConfig` clashes plugin types — fixed by a **separate `vitest.config.ts`** with no plugins (pure-logic tests don't need the React plugin), added to `tsconfig.node.json`. See [lesson 03](./.lessons/03-phase1-validators-and-vitest.md).
- **2026-06-13 — Phase 1: types & derived literal unions.** Built `src/lib/gw2/types.ts`. Covered: **`as const`** (array → `readonly` tuple of string **literals**, not `string[]`); **deriving a union** with `(typeof GW2_RACES)[number]` — read inside-out: `typeof` (value→type, the type-world operator) gives the readonly tuple, `[number]` (an **indexed access type**) indexes by _any_ number to yield the **union** of all element types — so one `as const` array is the single source of truth for both values and type; **interfaces** + `extends`, optional `?` props. Tooling: the root `tsconfig.json` is **solution-style** (`files: []` + `references`), so `tsc --noEmit` against it checks **nothing** — must use **`tsc -b`** (build mode follows `references`, is incremental via `.tsbuildinfo`). Added `npm run typecheck`. Strict-config behaviours: **`noUnusedLocals`** flags non-exported unused module decls (fix = export it if it's public surface); **`verbatimModuleSyntax`** forbids mixing value/type in `export {}` — sidestepped with inline `export`. Open thread: snake_case (wire) vs camelCase for `wvw_abilities`, decided in validators. See [lesson 02](./.lessons/02-phase1-types-and-derived-unions.md).
- **2026-06-10 — Phase 0: boot chain & core terminology.** Scaffolded Vite `react-ts`. Covered: the **DOM** (browser's live object-tree of the page; `#root` is React's mount point); the `.js/.jsx/.ts/.tsx` grid (`.tsx` = TypeScript + JSX); **ES modules** (`import`/`export`, `<script type="module">`); the boot chain `index.html` → `main.tsx` (`createRoot(...).render()`, `<StrictMode>`; the `!` non-null assertion is compile-time only — `createRoot(null)` throws at runtime) → `App.tsx` (a component = a function returning **JSX**); **default vs named exports**; StrictMode's dev-only **double-invoke** as a purity smoke test; **HMR / Fast Refresh** preserves state across edits.
