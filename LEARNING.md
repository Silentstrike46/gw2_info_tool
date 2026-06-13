# Learning Log & Roadmap

This is the "where were we?" file. Travels with the repo so it works across
machines. Update the checklist and concept log as we go. Detailed write-ups of
each lesson live in [`.lessons/`](./.lessons/).

## Next session — resume here

**Phase 1, next unit: the GW2 API _validators_** (probable home
`src/lib/gw2/validators.ts`). Given a raw object from the API, assert the required
keys exist, narrow to known keys, validate race/gender/profession against the value
lists, and **derive the `armor` field from profession** (the API does not send
armor weight). Working mode is Socratic — the developer writes it, Claude reviews.

Settle at the start of the unit:

- **Decision first:** `wvw_abilities` (and any other) snake_case vs. camelCase. The
  validator is the API boundary, so this is where we choose: mirror the wire format,
  or convert to idiomatic camelCase here. See lesson 02's "open thread".
- New TS concepts likely to come up: **type narrowing / type guards**, the `x is T`
  return type, `unknown` vs `any` for raw input, and validating at runtime when TS
  types are erased (types don't exist at runtime, so we need real checks against the
  `as const` arrays).
- First unit we'll **unit-test** (Vitest) — pure functions, easy to test. Stub
  nothing yet; real API calls come in Phase 2.

Run the type check with **`npm run typecheck`** (= `tsc -b`). NOT
`tsc --noEmit` against the root config — that checks nothing (see lesson 02).

Docs: TS Handbook — Narrowing.

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
  - [ ] `validators.ts` — runtime validation + derive `armor` (next)
  - [ ] `combinations.ts` — group characters by selected properties; fill blanks
  - [ ] CSV / JSON IO
- [ ] Phase 2 — API layer
- [ ] Phase 3 — React shell
- [ ] Phase 4 — State & data
- [ ] Phase 5 — The table
- [ ] Phase 6 — Niceties

## Concept log

_Concepts the user has learned, with date and a one-line takeaway. Newest first._

- **2026-06-13 — Phase 1: types & derived literal unions.** Built `src/lib/gw2/types.ts`. Covered: **`as const`** (array → `readonly` tuple of string **literals**, not `string[]`); **deriving a union** with `(typeof GW2_RACES)[number]` — read inside-out: `typeof` (value→type, the type-world operator) gives the readonly tuple, `[number]` (an **indexed access type**) indexes by _any_ number to yield the **union** of all element types — so one `as const` array is the single source of truth for both values and type; **interfaces** + `extends`, optional `?` props. Tooling: the root `tsconfig.json` is **solution-style** (`files: []` + `references`), so `tsc --noEmit` against it checks **nothing** — must use **`tsc -b`** (build mode follows `references`, is incremental via `.tsbuildinfo`). Added `npm run typecheck`. Strict-config behaviours: **`noUnusedLocals`** flags non-exported unused module decls (fix = export it if it's public surface); **`verbatimModuleSyntax`** forbids mixing value/type in `export {}` — sidestepped with inline `export`. Open thread: snake_case (wire) vs camelCase for `wvw_abilities`, decided in validators. See [lesson 02](./.lessons/02-phase1-types-and-derived-unions.md).
- **2026-06-10 — Phase 0: boot chain & core terminology.** Scaffolded Vite `react-ts`. Covered: the **DOM** (browser's live object-tree of the page; `#root` is React's mount point); the `.js/.jsx/.ts/.tsx` grid (`.tsx` = TypeScript + JSX); **ES modules** (`import`/`export`, `<script type="module">`); the boot chain `index.html` → `main.tsx` (`createRoot(...).render()`, `<StrictMode>`; the `!` non-null assertion is compile-time only — `createRoot(null)` throws at runtime) → `App.tsx` (a component = a function returning **JSX**); **default vs named exports**; StrictMode's dev-only **double-invoke** as a purity smoke test; **HMR / Fast Refresh** preserves state across edits.
