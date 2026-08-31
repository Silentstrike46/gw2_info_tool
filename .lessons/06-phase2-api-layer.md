# Lesson 06 — Phase 2: the API layer (`fetch`, CORS, and closing the `any` holes)

_Date: 2026-07-28. Porting the Python `GW2APIRequestHandler` to `src/lib/gw2/api.ts`:
`Gw2ApiClient` + `Gw2ApiError`, plus a project-wide tightening of the standard-library
`any` signatures. Still framework-agnostic — no React._

> **Complete.** Unit 2a (the client) and unit 2b (MSW mocking + `api.test.ts`, 13 tests)
> are both done. Phase 2 is finished; Phase 3 (the React shell) is next.

---

## What we built

- **`src/lib/gw2/api.ts`** — `Gw2ApiClient` (a class, chosen for room to grow), its private
  `request()` helper, and `Gw2ApiError` with a `kind` discriminant.
- **`src/unknown-globals.d.ts`** — re-declares `JSON.parse`, `.json()`, and
  `Array.isArray` to yield `unknown` instead of `any`.
- **`strict: true`** pinned explicitly in both tsconfigs.

---

## Design first

| Decision        | Outcome                                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| Endpoint        | `GET /v2/characters?ids=all` — one request, full detail. No paging, no N+1 fan-out.    |
| Auth transport  | **Query param `access_token`**, never an `Authorization` header (see CORS below).      |
| Public surface  | A class, not a bare function — scaffolding for future endpoints on a shared helper.    |
| Errors          | Throw `Gw2ApiError` with a `kind` the UI can switch on; consistent with Phase 1.       |
| Timeout         | `AbortSignal.timeout()`, defaults to 20 s (parity with Python). No retry/backoff.      |
| Empty-key guard | Lives in `request()`, **not** the constructor.                                         |
| Parse boundary  | Unchanged — every element through `parseCharacterShort`, same as `charactersFromJson`. |

**Why the empty-key guard is not in the constructor.** An empty key isn't something _we_
detect: the API returns `401 {"text": "Invalid access token"}` for it, which maps to the
same `kind: "invalid-key"`. The guard only saves a doomed round trip, so it's an
_optimisation_ — and an optimisation must not reshape the public contract. Keeping it at
the request site also means one error channel for the whole "your key doesn't work"
family (empty, malformed, revoked, expired, wrong scope), only the first of which is
knowable without the network; avoids a throw during render once the client is built in a
`useMemo`; and leaves key-less endpoints (e.g. `/v2/build`) constructible.

---

## The big one: the browser can't send an `Authorization` header

The Python handler sent `Authorization: Bearer <key>`. **That approach cannot work from a
browser**, and this is the single largest divergence in the port.

A cross-origin `GET` carrying only "safe" headers is a **simple request** — the browser
sends it immediately and just checks `Access-Control-Allow-Origin` on the way back. Adding
an `Authorization` header makes it a **preflighted request**: the browser must first send
an `OPTIONS` probe and be granted permission. Verified against the live API:

```
$ curl -i -X OPTIONS 'https://api.guildwars2.com/v2/characters' \
    -H 'Origin: http://localhost:5173' \
    -H 'Access-Control-Request-Method: GET' \
    -H 'Access-Control-Request-Headers: authorization'

HTTP/2 404
content-type: text/html
        ← no access-control-allow-origin header at all
```

The probe 404s with no CORS headers, so the browser blocks the real request before it ever
leaves. The wiki says so outright: the Bearer form is _"not available for browser-based
clients due to CORS restrictions and lack of preflight request support"_, while
`?access_token=` _"circumvents CORS preflight requirements"_. The same trap applies to
`X-Schema-Version` — so `v=latest` is a query param too.

The plain `GET` is fine: real responses (200 **and** 401) carry
`access-control-allow-origin: *`.

**This is the mistake that would pass every test we write and still break in production** —
MSW doesn't enforce CORS. It's guarded only by the `NOTE` in the class docstring.

Docs: [MDN — CORS: preflighted requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS#preflighted_requests) ·
[API:API key](https://wiki.guildwars2.com/wiki/API:API_key) ·
[API:2](https://wiki.guildwars2.com/wiki/API:2)

---

## `fetch` is not `requests`

1. **`fetch` does not reject on 4xx/5xx.** A 401 is a perfectly successful promise with
   `response.ok === false`. Checking `ok` yourself is the missing `raise_for_status()` —
   forget it and every error body sails on as if it were data.
2. **`fetch` rejects only on transport failure** (offline, DNS, CORS block), with a
   deliberately vague `TypeError` — it can't say "CORS" without leaking cross-origin info.
3. **`.json()` is itself async and can reject** — the body is a stream, and a proxy error
   page or captive portal returns `200 text/html`. It needs its own `try`/`catch`,
   separate from the status check.
4. **There is no `timeout:` option.** Cancellation is a general mechanism:
   `AbortSignal.timeout(ms)` passed as `{ signal }`. It rejects with a `DOMException` whose
   **`.name` is `"TimeoutError"`** — distinguish by `.name`, not `instanceof`, because a
   manual `.abort()` yields `"AbortError"` from the same class.
5. **Response headers are readable only if the server lists them in
   `Access-Control-Expose-Headers`.** GW2 exposes just
   `X-Content-Type-Options, X-Rate-Limit-Limit` — so **`Retry-After` is unreadable from
   JS**, and any backoff we wrote would be guessing. (We chose fail-fast + user retry
   anyway.)

Docs: [MDN — Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) ·
[Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) ·
[AbortSignal.timeout()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)

---

## The API key leaked into three error messages

The first draft interpolated the `URL` object into its error text. A `URL` stringifies to
its **full href** — query string included — and by that point the key was in
`searchParams`:

```
HTTP error 401 while requesting https://api.guildwars2.com/v2/characters?ids=all&v=latest&access_token=SECRET-KEY-1234-ABCD
```

A credential in plaintext, headed for logs, the UI, and any error reporter we ever add.
The fix keeps the useful half and drops the dangerous half:

```ts
const url = new URL(`${this.baseUrl}/${endpoint}`);
const urlString = url.origin + url.pathname; // safe: no query string
// NOTE: do not display `url` after this point — the key is about to go in.
```

Two structural points, both worth stealing generally:

- **Derive the safe form _before_ the secret goes in**, and note why. Then the rule is
  "never touch `url` below this line", which the next author can follow without knowing
  the reason.
- **Wrap, don't flatten.** `Gw2ApiError` forwards `{ cause }`, so the original error stays
  inspectable — there's no need to also splice `${String(error)}` into your own message,
  where it may drag the URL along with it.

---

## Errors: subclassing, `cause`, and `name`

```ts
export class Gw2ApiError extends Error {
  readonly kind: Gw2ErrorKind;
  readonly status?: number;

  constructor(kind, message, options?) {
    super(message, { cause: options?.cause }); // keep the original error
    this.kind = kind;
    this.status = options?.status;
    this.name = "Gw2ApiError"; // else stack traces just say "Error"
  }
}
```

- `extends Error` behaves correctly here because `target: es2023`. The
  `Object.setPrototypeOf(this, ...)` incantation you'll find in older articles is an
  **ES5 downlevel workaround** — not needed, and not a general requirement.
- `cause` (ES2022) is the mechanism for wrapping without swallowing. The UI switches on
  `kind`; a developer follows `.cause` down to `"invalid race: Dwarf"`.
- A `kind` union beats a bag of booleans: it's exhaustively checkable, and the mapping
  (401/403 → `invalid-key`, 429 → `rate-limited`, else → `server`) lives in one place.

Docs: [MDN — Error: cause](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause)

---

## Closing the `any` holes for good

`JSON.parse`, `.json()`, and `Array.isArray` are all typed to return `any` — a historical
choice predating `unknown` (TS 3.0). [Lesson 05](./05-phase1-csv-json-io.md) handled this
by remembering to annotate
`: unknown` at each call site. This lesson proved that discipline isn't enough: the
`Array.isArray` narrowing quietly produced `any[]` again, and **neither `tsc` nor ESLint
said a word**.

The general fix is `src/unknown-globals.d.ts` — **interfaces merge**, so re-declaring a
global interface adds an overload that wins during resolution, with no lib patching:

```ts
interface ArrayConstructor {
  isArray(arg: unknown): arg is unknown[];
}
interface JSON {
  parse(text: string, reviver?: ...): unknown;
}
interface Body {
  json(): Promise<unknown>; // `Body` is the base of BOTH Request and Response
}
```

- It's a **`.d.ts` with no imports/exports**, which keeps it in global scope.
  `moduleDetection: "force"` applies only to _non-declaration_ files, so it doesn't turn
  this into a module.
- Every failure it causes is a **compile error demanding a narrowing you should have
  written** — never a runtime change.
- Adopting it made the two existing manual `as unknown[]` casts redundant, and
  `no-unnecessary-type-assertion` **proved it by flagging both**.
- This is a known community pattern (the `ts-reset` library ships essentially this file);
  hand-rolled here to avoid a dependency and to keep the rationale in our own words.
- Cost, honestly: these signatures contradict MDN and every tutorial, so it's flagged in
  `CLAUDE.md` and documented in the file header.

**The `any` net was already tighter than expected.** `strictTypeChecked` enables the whole
`no-unsafe-*` family — a probe confirmed it flags unsafe assignment, argument, member
access, return, and explicit `any`. The reason our `any` slipped through is that the next
thing it touched was `parseCharacterShort(raw: unknown)` — and passing `any` to an
`unknown` parameter is **genuinely safe**, so the rule correctly stayed silent. Had the
loop body done `item.name`, `no-unsafe-member-access` would have fired instantly.

---

## Syntax reminders

**Ternary vs `??` vs the comma operator.** These get confused; only the first is a
conditional:

```ts
cond ? a : b; // conditional (ternary) — the one you usually want
a ?? b; // nullish coalescing: b only if a is null/undefined
(a, b); // comma operator: evaluate a, DISCARD it, return b
```

Used to report a type without lying about `null`:

```ts
`Expected an array of characters, got ${raw === null ? "null" : typeof raw}`;
```

No `String(...)` wrapper needed — `typeof` already returns a string, so both branches are
strings and `restrict-template-expressions` is satisfied.

**`typeof null === "object"`** — a bug from the original 1995 JS implementation (null was
stored with the object type tag), unfixable ever since because fixing it would break the
web. Hence the explicit `null` arm above.

**Cast the collection, not the iterator.** When you must re-close `any[]` to `unknown[]`
and still want indices:

```ts
for (const [index, item] of (raw as unknown[]).entries()) { ... }   // ✅
for (const [index, item] of raw.entries() as ArrayIterator<[number, unknown]>) { ... }  // ❌
```

The second works but hard-codes `ArrayIterator`, a **TypeScript lib-internal type name**
that was `IterableIterator<[number, T]>` before TS 5.6 — an upgrade can rename it out from
under you. Casting the array lets `entries()` infer everything.

_(With `unknown-globals.d.ts` in place this particular cast is unnecessary — `raw.entries()`
already yields `[number, unknown]`. The pattern still applies wherever an `any[]` shows up.)_

---

## Tooling notes

- **TypeScript 6.0 turns `strict` on by default.** Confirmed with a bare config carrying no
  flags: `noImplicitAny` and `strictNullChecks` both fired. We pinned `"strict": true`
  explicitly anyway — the house rule is to favour explicitness over defaults, and a pin
  can't be silently relaxed by a downgrade.
- **`erasableSyntaxOnly: true` bans constructor parameter properties.**
  `constructor(private apiKey: string)` looks like plain annotation but silently _generates_
  an assignment, so it isn't erasable. Declare and assign the fields explicitly.
- **`Response.json()` returns `any`**, so `strictTypeChecked`'s `no-unsafe-assignment` fires
  unless you annotate — the identical hole to `JSON.parse` from lesson 05. Now closed
  globally.

---

## The lesson that outranks the rest

After the first implementation, **`npm run typecheck` and `npm run lint` were both
completely clean — and the file had three blocking bugs**: the key leaked into three error
messages, the status mapping was missing entirely (`rate-limited` was unreachable, and an
expired key reported as a server fault), and a malformed body escaped as a raw
`SyntaxError` past the "everything is a `Gw2ApiError`" contract.

The toolchain proves code is _well-typed_. It never proves it's _correct_.

---

## Unit 2b — the test layer

`src/lib/gw2/api.test.ts` — 13 tests, all mocked through MSW (no real network). Covers the
happy path plus every `Gw2ErrorKind`: `invalid-key` (401/403 and the empty-key fail-fast),
`rate-limited` (429), `server` (500, asserting `.status`), `malformed` (three distinct
sources — see below), `network`, and `timeout`. Plus the two structural guards: no
`Authorization` header, and no API key in any error message.

**MSW wiring.** `msw` as a dev dependency; a shared `src/test/setup.ts` holds
`export const server = setupServer()` (no default handlers — each test registers its own
with `server.use(...)`) and the three lifecycle hooks: `beforeAll(server.listen({
onUnhandledRequest: "error" }))`, `afterEach(server.resetHandlers())`,
`afterAll(server.close())`. Registered via `setupFiles: ["./src/test/setup.ts"]` in
`vitest.config.ts`; environment stays `"node"` (MSW's `setupServer` intercepts Node's
native fetch — no jsdom needed). `onUnhandledRequest: "error"` is the guarantee: a stray
un-mocked request fails the test instead of hitting the real API. Handlers match the
**real** default URL (`https://api.guildwars2.com/v2/characters`) so the test exercises the
real config — no `baseUrl` override.

**`Omit<T, K>` — the wire-vs-domain type.** The happy-path test needs two shapes of the
same data: the **wire body** the mock returns (no `armor` — the real API doesn't send it;
`parseCharacterShort` _derives_ it from profession, `validators.ts:105`) and the **expected**
parsed result (armor present). The clean model is `Omit<CharacterInfoShort, "armor">[]` for
`wireBody`, then `expected` spreads each row and adds the one field as a **literal**:

```ts
const wireBody: Omit<CharacterInfoShort, "armor">[] = [ { name, race, ..., /* no armor */ } ];
const expected: CharacterInfoShort[] = [ { ...wireBody[0], armor: "Heavy" } ];
```

- `Omit` still type-checks every remaining field (a bad `race` fails to compile) — it solves
  the "type the JSON but drop one required field" problem that a bare object literal or an
  `as` cast can't.
- **Armor is a hardcoded literal, not `armorForProfession(...)`** — asserting the derivation,
  not recomputing it with the code under test (the lesson-05 rule).
- Honest caveat: the parser _ignores_ input armor, so stripping it is a **fidelity** fix
  (match the real endpoint), not a correctness one — it just costs nothing via `Omit`. On the
  real API the response has dozens of extra fields; mock only the subset the parser reads.

**Dead end — destructure-omit trips the linter.** `expected.map(({ armor, ...rest }) => rest)`
is the idiomatic strip and `tsc` accepts it (`noUnusedLocals` ignores rest-siblings), but
ESLint's `@typescript-eslint/no-unused-vars` flags the unused `armor` (`ignoreRestSiblings`
defaults to `false`). Flipping that rule is a lint-config loosening (house-rule "ask first"),
and unnecessary — the `Omit`-literal approach above needs no throwaway binding. `delete
row.armor` is also out: "the operand of a `delete` operator must be optional."

**Test hygiene reinforced.** `toStrictEqual` over `toEqual` (catches `undefined`-vs-absent on
the freshly built parse result); fixed `created` string over `new Date().toISOString()` (a
fixture reads as deterministic); don't comment the _language feature_ (`// Omit: ...`) —
comment the _domain reason_ (`// wire body has no armor; the parser derives it`).

**Asserting a thrown custom error — two idioms, one trap.** Reading a custom field like
`err.kind` needs the caught instance, so:

- `try { await fn(); expect.unreachable("should have thrown"); } catch (err) { if (!(err
instanceof Gw2ApiError)) throw err; expect(err.kind).toBe(...); }` — explicit, and the
  only form that also asserts the _type identity_. Two subtleties: `catch (err)` is typed
  `unknown` under strict (`useUnknownInCatchVariables`), so you must narrow before touching
  `.kind`; and `expect(err).toBeInstanceOf(...)` does **not** narrow for the type-checker
  (it's a runtime matcher). The `if (!(err instanceof ...)) throw err` line does both jobs —
  it narrows _and_ re-throws the `expect.unreachable` error on the no-throw path, so the
  test can't pass vacuously.
- `await expect(fn()).rejects.toMatchObject({ kind, status })` — terser, fails if the
  promise resolves, no `unknown`-narrowing. Trade-off: it does **not** assert
  `instanceof Gw2ApiError` (a plain object with those keys would match). Acceptable here
  because every non-OK status throws through the _same_ construction site the try/catch case
  already pins as a `Gw2ApiError`. Used B for most, A for one — a deliberate split.

**DRY the handler, not the assertions.** A `CHARACTERS_URL` constant plus a
`mockStatus(status)` helper (one `server.use(http.get(...))`) kills the most-repeated line
across the status tests. The _assertions_ stayed longhand — a premature `expectApiError()`
wrapper would have fought the `malformed` and request-inspection cases, which need different
bodies and checks. Extract the repetition that's actually stable; leave the rest.

**One `kind`, three code paths.** `malformed` is thrown from three places, each tested
separately: (1) `response.json()` itself rejects — mock a raw non-JSON 200
(`new HttpResponse("NotJSON", ...)`; `HttpResponse.json` _always_ emits valid JSON, so a raw
body is the only way to hit this); (2) valid JSON that isn't an array — the
`!Array.isArray(raw)` guard; (3) a valid array with one element that fails
`parseCharacterShort`. Identical assertions, different branches — coverage is about the path,
not the observable `kind`.

**Test the field you mean to break — mind validation order.** For path (3) the bad element
must be _otherwise complete_. `parseCharacterShort` checks `name`/`level`/`age`/`created`
(typeof) **before** the enum fields, so an element missing `level` fails on `"level must be a
number"` and never reaches the `race` check. Build it as
`{ ...character({ name: "BadChar" }), race: "Dwarf" }` — a full valid character with exactly
one field corrupted — then assert the wrapped **cause** to prove _which_ thing failed:
`cause: { message: "invalid race: Dwarf" }`. That pins causation _and_ exercises the
`Gw2ApiError` `{ cause }` forwarding, upgrading the test from "something failed" to "this
element failed."

**Gotcha — asymmetric matchers are typed `any`.** `expect.objectContaining(...)` /
`expect.stringContaining(...)` return `any`, so nesting them as object-literal values trips
`strictTypeChecked`'s `no-unsafe-assignment` — a **lint** error, silent to `tsc` (the same
type-vs-lint split as the `Response.json()` hole). Since `toMatchObject` already
partial-matches nested objects, a concrete literal (`cause: { message: "..." }`) is both
lint-clean and stricter. Reach for asymmetric matchers only when you genuinely need fuzzy
matching.

**Capturing the outgoing request — the CORS guard.** The one test MSW can't stand in for in
production: assert `request.headers.get("authorization")` is `null` and that `access_token`

- `v` live in `new URL(request.url).searchParams`. Capture the `Request` into a
  `let captured: Request | undefined` from inside the resolver, then after the awaited call
  narrow with `if (!captured) throw ...` — **not** `captured!`, which `no-non-null-assertion`
  (an error in this repo) forbids; the throw satisfies the rule _and_ narrows the type. MSW
  does **not** enforce CORS, so this is the _only_ automated guard for unit 2a's headline
  finding — every other query-param assertion would still pass even if we'd wrongly used a
  header.

## Open questions from 2a — resolved

- **Timeout rejection shape — confirmed.** Node rejects an `AbortSignal.timeout()` abort
  with a `DOMException` named `"TimeoutError"`. The timeout test (`delay("infinite")` +
  `timeoutMs: 20`) passes with `kind: "timeout"`, which only holds if
  `error instanceof DOMException && error.name === "TimeoutError"` matched — a genuine
  confirmation, since a different name would have mapped to `network` and failed the test.
- **`Request.json()` → `unknown` — never bit.** No handler inspects an incoming request
  body (all matching is on URL / query / headers), so the narrowing it would have forced in
  test code never came up.

## Next

Phase 2 is complete. Phase 3 — the React shell (Mantine skeleton, three routes, header
nav) — is the first framework code in the project. See `LEARNING.md` for the roadmap.
