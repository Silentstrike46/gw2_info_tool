# CLAUDE.md — GW2 Info Tool (React port)

Project-specific guidance for Claude Code. The user's global `~/.claude/CLAUDE.md`
rules still apply (env-var handling, migrations, git-message style, external-write
approval, stubbing external services in tests).

## What this project is

A rebuild of the existing Python/NiceGUI app (`../gw2_info_tool_py/`) as a
**statically-hosted React + TypeScript SPA**. Two goals, equally important:

1. **Ship the tool** — take a user's GW2 API key (kept only in browser session
   storage, never persisted server-side), fetch their character data from the
   public GW2 API, categorise characters by chosen properties, and show the
   result in a sortable table. CSV/JSON upload/download is a later nicety.
2. **Teach the user React** — this is a guided learning project. The user is new
   to React.

## Working mode — IMPORTANT

This is a **Socratic guided-learning** project. For each unit of work:

- Claude explains the concept, links the relevant official docs, and provides the
  interface/signature + acceptance criteria.
- **The user writes the implementation themselves.** Claude does NOT write feature
  code for them — scaffolding with `TODO`s at most — then reviews and corrects.

Do not jump ahead and implement things on the user's behalf unless explicitly asked.

## Architecture & key decisions

- **Client-only / no backend.** Verified the GW2 API sends
  `access-control-allow-origin: *`, so the browser calls it directly — static
  hosting is viable with no proxy.
- **Port pure logic first, React second.** The non-trivial parts (combinations
  algorithm, validators, CSV/JSON IO) are framework-agnostic TypeScript; the UI
  surface is small. Build and test the logic before touching React.
- **Cross-page state** = React Context + a custom hook persisted to
  `sessionStorage` (the analog of the Python `StorageManager`).

## Locked stack

- **Build:** Vite · **Language:** TypeScript (strict) · **Routing:** React Router
- **UI:** Mantine (incl. `mantine-react-table` for the sortable table)
- **Tests:** Vitest + React Testing Library + MSW (mock the GW2 API; no real
  network calls in tests)
- **Lint/format:** ESLint + Prettier
- **Data fetching:** raw `fetch` + hooks first; introduce TanStack Query later.

## Progress

See [LEARNING.md](./LEARNING.md) for the phase roadmap, current progress, and the
running log of concepts covered.
