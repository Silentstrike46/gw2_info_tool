# Learning Log & Roadmap

This is the "where were we?" file. Travels with the repo so it works across
machines. Update the checklist and concept log as we go. Detailed write-ups of
each lesson live in [`.lessons/`](./.lessons/).

## Next session — resume here

**Phase 1, first unit: write `src/lib/gw2/types.ts`** (port of the Python
`../gw2_info_tool_py/app/gw2_api/types.py`). Working mode is Socratic — the
developer writes it, Claude reviews.

Port only these (skip account types for now — characters are what the app uses):
- The static constants `GW2_RACES`, `GW2_GENDERS`, `GW2_PROFESSIONS`,
  `GW2_ARMOR_TYPES`, `GW2_PROFESSION_TO_ARMOR_TYPE` (use `as const`).
- `CharacterInfoShort` interface (`name`, `race`, `gender`, `profession`, `armor`,
  `level`, `age`, `created`) with **string-literal unions** for
  race/gender/profession/armor.
- `CharacterInfo extends CharacterInfoShort` adding `flags`, `deaths`, `crafting`,
  etc., with `guild?` and `title?` optional.

Key mappings: `TypedDict` → `interface`; `Literal[...]` → `'a' | 'b' | …` union;
`NotRequired[x]` → `prop?: x`; subclass → `extends`. Hand-write the unions for now;
Claude will show the `as const` + `typeof`/indexed-access trick to derive them
during review.

Acceptance: compiles clean with `npx tsc --noEmit`.

Docs: TS Handbook — Everyday Types & Object Types.

## Roadmap

| Phase | What we build | React/TS concepts |
|-------|---------------|-------------------|
| 0. Scaffold | Vite + TS project, folder structure, tooling | Project anatomy, npm scripts, how the app boots |
| 1. Pure logic (no React) | Port `types`, `validators`, `combinations`, CSV/JSON | TS type system, unions/generics, modules, Vitest |
| 2. API layer | Port the GW2 request handler with `fetch` | `async`/`await`, typed responses, MSW mocking |
| 3. React shell | Mantine skeleton, 3 routes, header nav | JSX, components, props, `MantineProvider`, React Router |
| 4. State & data | API-key input → fetch → store characters cross-page | `useState`, `useEffect`, Context, custom hooks, sessionStorage |
| 5. The table | Combinations page wired to Phase-1 logic | Lifting state, derived data, `mantine-react-table` |
| 6. Niceties | CSV/JSON upload/download, polish | File APIs, refactors; introduce TanStack Query |

Each phase depends on the previous one — one new concept at a time.

## Progress checklist

- [x] **Phase 0 — Scaffold** (done)
  - [x] Run `npm create vite@latest . -- --template react-ts`
  - [x] Reconcile clobbered `.gitignore` / `README.md`
  - [x] Understand how the app boots (`index.html` → `main.tsx` → `App.tsx`); dev server + HMR confirmed
- [ ] **Phase 1 — Pure logic** (next)
- [ ] Phase 2 — API layer
- [ ] Phase 3 — React shell
- [ ] Phase 4 — State & data
- [ ] Phase 5 — The table
- [ ] Phase 6 — Niceties

## Concept log

_Concepts the user has learned, with date and a one-line takeaway. Newest first._

- **2026-06-10 — Phase 0: boot chain & core terminology.** Scaffolded Vite `react-ts`. Covered: the **DOM** (browser's live object-tree of the page; `#root` is React's mount point); the `.js/.jsx/.ts/.tsx` grid (`.tsx` = TypeScript + JSX); **ES modules** (`import`/`export`, `<script type="module">`); the boot chain `index.html` → `main.tsx` (`createRoot(...).render()`, `<StrictMode>`; the `!` non-null assertion is compile-time only — `createRoot(null)` throws at runtime) → `App.tsx` (a component = a function returning **JSX**); **default vs named exports**; StrictMode's dev-only **double-invoke** as a purity smoke test; **HMR / Fast Refresh** preserves state across edits.
