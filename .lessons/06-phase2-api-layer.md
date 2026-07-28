# Lesson 06 — Phase 2: the API layer (`fetch`, CORS, and closing the `any` holes)

_Date: 2026-07-28. Porting the Python `GW2APIRequestHandler` to `src/lib/gw2/api.ts`:
`Gw2ApiClient` + `Gw2ApiError`, plus a project-wide tightening of the standard-library
`any` signatures. Still framework-agnostic — no React._

> **In progress.** Unit 2a (the client) is done. Unit 2b — MSW mocking and `api.test.ts` —
> is still to come, and gets appended here.

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

## Open thread for next session

**Unit 2b — MSW.** Install `msw` as a dev dependency, wire `setupServer` with the
request-lifecycle hooks, and write `api.test.ts`: the happy path, each error `kind`, the
absence of an `Authorization` header, and that no message contains the key. Two things to
settle there:

- Whether Node's `fetch` really rejects a timeout with a `DOMException` named
  `"TimeoutError"` — `api.ts` currently assumes it does, and the test will confirm or
  refute it empirically.
- `Body.json()` now returns `unknown` for `Request` too, so MSW handlers that inspect an
  incoming body will need narrowing in test code as well.
