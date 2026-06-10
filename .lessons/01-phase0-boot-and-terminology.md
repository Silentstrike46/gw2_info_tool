# Lesson 01 — Phase 0: Project boot & core terminology

_Date: 2026-06-10. Scaffolding the Vite project and understanding how a React app
starts up, plus the frontend vocabulary needed to follow along._

---

## Tooling decisions (the "why")

- **Vite** — build tool + dev server. Compiles our TS/JSX to plain JS the browser
  can run, and serves it fast in dev. The default for client-side React SPAs.
- **TypeScript (strict)** — JS plus a static type system. Chosen because the
  Python source is already heavily typed, so porting is a direct translation.
- **React SPA, statically hosted, no backend.** Confirmed the GW2 API sends
  `access-control-allow-origin: *`, so the browser can call it directly.

### The scaffold command, decoded
```bash
npm create vite@latest . -- --template react-ts
```
- `npm create vite@latest` → download & run the `create-vite` scaffolder (latest).
- `.` → scaffold into the **current directory**.
- `--` → POSIX **"end of options"** marker: everything after it is passed through
  to `create-vite` instead of being parsed as flags for `npm`. Needed because two
  programs are involved (npm running create-vite).
- `--template react-ts` → use the React + TypeScript starter (a `create-vite` flag).

---

## The DOM (Document Object Model)

When the browser loads HTML *text*, it parses it into an in-memory **tree of
objects** — one node per tag. That tree is the DOM. Key point: **the DOM is not
the HTML file**; it's the browser's live object representation that JS reads and
edits. Whatever the DOM looks like right now is what's on screen.

```
document
└── html
    ├── head → title, meta…
    └── body
        └── div#root   ← document.getElementById('root') returns this node
```

React's whole job is to manipulate the DOM for you: you describe UI as components,
React computes the minimal DOM changes. You rarely touch the DOM directly.

---

## File extensions: the 2×2 grid

| Ext   | Language   | Can contain JSX? |
|-------|------------|------------------|
| `.js` | JavaScript | no               |
| `.jsx`| JavaScript | yes              |
| `.ts` | TypeScript | no               |
| `.tsx`| TypeScript | **yes**          |

`.tsx` = TypeScript **+** JSX. Pure-logic files (no JSX) are `.ts`; components are
`.tsx`. None of `.ts/.tsx/.jsx` run in a browser — they're all compiled to `.js`
first (Vite does it).

---

## ES modules (ESM)

- **ES** = ECMAScript, the official standard JavaScript implements.
- A **module** = a file with its own private scope that shares code explicitly via
  `import` / `export` (nothing leaks to a global namespace).
- **ESM** = the standard, language-native module system (introduced in ES2015/ES6).
- `<script type="module">` in `index.html` tells the browser to run the entry file
  as an ES module, which is what makes `import`/`export` work.

### default vs named exports
```ts
// App.tsx
export default App            // one "default" export per file
// main.tsx
import App from './App.tsx'   // name is arbitrary for a default import
import Anything from './App.tsx'  // also valid — just renaming the default
```
- A file can have **at most one** `default` export; the importer picks any name.
- **Named** exports must be imported by their exact name (with braces):
  `export function foo() {}` → `import { foo } from './x'` (rename with
  `import { foo as bar }`). A file can have many named exports.

---

## The boot chain: `index.html` → `main.tsx` → `App.tsx`

A React SPA has **one** HTML page; everything is JS building DOM nodes inside it.

1. **`index.html`** — the shell. Two key lines:
   ```html
   <div id="root"></div>                              <!-- empty mount point -->
   <script type="module" src="/src/main.tsx"></script> <!-- entry point -->
   ```
   React fills `#root`; Vite compiles the `.tsx` entry on the fly.

2. **`main.tsx`** — the only place the app touches the real DOM directly:
   ```tsx
   createRoot(document.getElementById('root')!).render(
     <StrictMode>
       <App />
     </StrictMode>,
   )
   ```
   - `createRoot(node).render(tree)` — React 18+ entry API: claim the `#root`
     node, render the component tree **into** it (doesn't replace the div).
   - `!` — TypeScript **non-null assertion**. `getElementById` is typed
     `HTMLElement | null`; `!` silences the compiler. ⚠️ It's **compile-time only**
     and erased before runtime — it gives **zero** runtime safety. If `#root` were
     missing, `createRoot(null)` would throw a real error at runtime and the page
     would be blank.

3. **`App.tsx`** — your first component: a **function that returns JSX**.
   `main.tsx` imported it and rendered `<App />`.

Full flow: browser loads `index.html` → runs `main.tsx` → renders `<App />` into
`#root` → page appears.

---

## JSX

**JSX = "JavaScript XML"** — HTML-looking markup written inside JS. It's not a
string and not real HTML; a compiler rewrites each tag into a "create element"
function call returning a plain JS object (a React element):

```tsx
return <h1>Get started</h1>
// compiles to ~ jsx('h1', { children: 'Get started' })
```

So JSX is **syntactic sugar** for create-element calls; it exists because markup is
more readable than nested function calls. Differences from HTML to remember later:
`className` (not `class`), `{ }` to embed JS values, camelCase events (`onClick`),
and a component must return a **single** root — hence the empty **Fragment**
`<>…</>` that groups children without adding a DOM node.

---

## StrictMode & the "double invoke"

`<StrictMode>` is a **dev-only** wrapper (stripped from production). In dev it
deliberately calls certain functions **twice** (component render, effect
setup/cleanup). Purpose: those functions must be **pure** (same input → same
output, no side effects). Running them twice exposes impurity — duplicated list
items, double network calls, mutated outside state — surfacing bugs early. It
renders nothing and ships nothing to users.

---

## HMR / Fast Refresh

**HMR** (Hot Module Replacement) swaps changed modules into the running app without
a full page reload. **Fast Refresh** is React's HMR flavour that also **preserves
component state** across edits (e.g. a counter keeps its value when you edit and
save). A normal reload would reset everything.

---

## Quick reference: commands

```bash
npm run dev       # start the Vite dev server (HMR)
npm run build     # production build → dist/
npm run preview   # serve the built dist/ locally
npx tsc --noEmit  # type-check without emitting JS
```
