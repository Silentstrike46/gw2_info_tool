# Design Documentation

The purpose of this document is to outline what the project should include, how it
should be designed, the specifications it must meet, and the constraints it must
abide by. It is the "what and why" companion to [LEARNING.md](./LEARNING.md) (the
"where were we?" learning log) and [CLAUDE.md](./CLAUDE.md) (working agreement).

The project is a statically-hosted React + TypeScript SPA that fetches a player's
Guild Wars 2 character data and categorises it into property combinations.

---

## 1. Background & motivation

Guild Wars 2 is an MMO where one account can hold many characters ("alts"). Each
character has a fixed set of properties — **race, gender, profession**, and a
**armor weight** (Heavy/Medium/Light) that is determined by the profession.

The author is an "alt-aholic" who likes spreadsheets, and historically tracked
character data by hand to answer questions like _"which race/gender/armor-weight
combinations do I not yet have a character for?"_ — useful for deciding what alt to
make next (e.g. to collect every armour-skin variant). Filling those spreadsheets in
manually is tedious; the GW2 API already has the raw data. This tool automates the
fetch-and-categorise step that the spreadsheet did by hand.

Existing tools (e.g. GW2Efficiency) cover most needs but not this specific
"missing-combinations" analysis, which is the tool's reason to exist.

> An earlier Python/NiceGUI implementation of this tool already exists and works;
> this repo is a rebuild. That history is noted here only as context — the design
> below stands on its own and should not depend on the older codebase.

---

## 2. Goals

### Primary goals (must ship)

1. **Fetch character data from the GW2 API** using a user-supplied API key. Only the
   `characters` permission/scope is required.
2. **Categorise characters into combinations** of chosen properties (race, gender,
   profession, armor) and present the result in a **sortable table**: one row per
   combination, with its label, the count of matching characters, the property
   values, and the matching character names.
3. **Surface missing combinations** — optionally include combinations that have
   **zero** characters ("fill blanks"), so the user can see gaps to fill. This is the
   headline feature carried over from the spreadsheet.
4. **Keep the user's data private.** The API key lives only in browser session
   storage and is discarded after fetching; fetched character data is held only in
   the browser session, so it survives navigation between pages. Nothing is
   persisted server-side — there is no server.

### Secondary goals (niceties, later phases)

1. **CSV / JSON import & export** of character data and of the combinations table, so
   the user can save a snapshot or work offline without re-fetching.
2. **An About page** explaining the project and linking the source repo.

### Learning goal (equal priority — see CLAUDE.md)

1. **Teach the author React + TypeScript** via a Socratic, learn-as-you-build
   process. This shapes _how_ we build (logic first, one concept at a time, author
   writes the code) but not _what_ we build.

### Explicit non-goals (for now)

- No account-level features (account info, WvW, fractals, achievements). The
  combinations feature only needs character data, so we skip account types until a
  feature needs them.
- No user accounts, login, or server-side persistence of any kind.
- No write operations against the GW2 API (it is read-only data anyway).
- No real-time/auto-refresh; fetching is an explicit user action.

---

## 3. Functional specification

Three pages: Home, Character Combinations, About.

### Home page

- Input for the GW2 API key (clearable). "Fetch Data" enabled only when non-empty.
- On fetch: call the API, validate + enrich each character, store the list in the
  session, and show a count ("Fetched data for N characters.").
- A note on data storage/privacy, and a "Clear Session Data" action.
- (Later) Upload CSV/JSON of character data instead of fetching.

### Character Combinations page

- Multi-select of which properties to include: Race, Gender, Profession, Armor Type
  (human-readable labels mapped to internal keys).
- A "show empty combinations" toggle (the fill-blanks behaviour).
- A sortable table: columns = Label, Count, one column per selected property, and a
  Characters column (comma-separated, sorted names).
- Guidance note: when showing empty combinations, use Profession **or** Armor Type
  but not both (they are correlated — Guardian implies Heavy — so combining them
  fabricates impossible rows).
- Empty state when no character data has been fetched yet.
- (Later) Export the combinations table to CSV/JSON.

### About page

- Static prose about the project + a link to the GitHub repo.

---

## 4. Core domain logic

These modules are framework-agnostic and are built/tested **before** any React
(Phase 1).

- **Types** (`src/lib/gw2/types.ts`): the static value lists (`GW2_RACES`,
  `GW2_GENDERS`, `GW2_PROFESSIONS`, `GW2_ARMOR_TYPES`), the profession→armor mapping,
  and the `CharacterInfoShort` / `CharacterInfo` shapes with string-literal unions.
- **Validators**: given a raw API object, assert required keys exist, narrow to known
  keys, validate race/gender/profession, and **derive the `armor` field from
  profession** (the API does not send armor weight).
- **Combinations**: group a character list by the selected properties into labelled
  entries `{ label, propertyValues, count, characters }`; optionally fill in every
  missing combination (recursively, only for the four bounded properties) with a
  count of 0; sort by label for stable output.
- **IO**: read/write `CharacterInfoShort` lists to and from CSV/JSON, validating on
  the way in.

---

## 5. Constraints & key decisions

- **Client-only / no backend.** Verified the GW2 API returns
  `access-control-allow-origin: *`, so the browser may call it directly — static
  hosting is viable with no proxy or server.
- **API key handling.** Session storage only; never persisted to disk, never sent
  anywhere except the GW2 API as a bearer token; discarded after use. (Aligns with
  the global env-var/secrets rule.)
- **Armor weight is derived, not fetched.** The API gives profession but not armor
  weight; we compute it from `GW2_PROFESSION_TO_ARMOR_TYPE`. Single source of truth.
- **Static value lists and their literal-union types must stay in sync.** We _derive_
  the unions from the `as const` arrays (`(typeof GW2_RACES)[number]`) so the two
  cannot drift apart.
- **Locked stack** (see CLAUDE.md): Vite · TypeScript (strict) · React Router ·
  Mantine (+ `mantine-react-table`) · Vitest + React Testing Library + MSW · ESLint +
  Prettier · raw `fetch` first, TanStack Query later.
- **Testing.** All external calls (the GW2 API) are stubbed with MSW; no real network
  requests in tests.
- **Migrations / persistence.** None — there is no database.

---

## 6. Open questions / future considerations

- Whether to support fetching the _full_ `CharacterInfo` (deaths, crafting, etc.) or
  keep to `CharacterInfoShort`, which is all the combinations feature needs.
- Concurrency and error handling for the fetch: decide how to surface API errors
  (bad key, rate limit, partial failures) in the UI.
- Whether export should cover the raw character data, the combinations table, or
  both, and in which formats.
