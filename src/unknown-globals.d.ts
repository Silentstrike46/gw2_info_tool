/**
 * Project-wide tightening of standard-library types that return `any`.
 *
 * WHY THIS EXISTS
 * ---------------
 * A handful of built-ins are typed to return `any` — a historical choice, made
 * before `unknown` existed (TypeScript 3.0). `any` is not "some type we don't
 * know"; it is "stop type-checking here", and it spreads silently to everything
 * the value touches. That makes the three functions below the exact places where
 * untrusted outside data enters this app: parsed JSON, an HTTP response body,
 * and an array whose element type nobody has established.
 *
 * `unknown` expresses the same "we don't know" honestly, but forces a narrowing
 * (a type guard, or one of our validators) before the value can be used. So we
 * re-declare these three to return `unknown` and let the compiler insist on the
 * check, instead of relying on every author remembering to annotate `: unknown`
 * at each call site — which is easy to miss precisely when it matters.
 *
 * HOW IT WORKS
 * ------------
 * `interface` declarations MERGE. Re-declaring a global interface here adds an
 * overload to the one in TypeScript's own lib files, and the later declaration
 * wins during overload resolution — so no lib files are patched or forked.
 * This file is a declaration file (`.d.ts`) with no imports or exports, which is
 * what keeps it in global scope; `moduleDetection: "force"` in tsconfig.app.json
 * applies only to NON-declaration files, so it does not turn this into a module.
 *
 * WHAT TO EXPECT
 * --------------
 * Every failure this causes is a compile error demanding a narrowing that should
 * have been written anyway — never a runtime change. Nothing here emits code.
 *
 * NOTE FOR NEWCOMERS: these signatures deliberately differ from the ones you
 * will find in MDN or any tutorial. That is intentional, and local to this
 * project. This is a known community pattern (the `ts-reset` library ships
 * essentially this file); we hand-roll it to avoid the dependency.
 */

interface ArrayConstructor {
  /**
   * Narrows `unknown` to `unknown[]` rather than `any[]`.
   *
   * The stock signature is `isArray(arg: any): arg is any[]`, so the guard that
   * proves you have an array simultaneously discards the element type — the
   * loop body silently becomes unchecked.
   */
  isArray(arg: unknown): arg is unknown[];
}

interface JSON {
  /**
   * Returns `unknown` rather than `any`.
   *
   * Parsed JSON is the canonical untrusted value: its shape is whatever was in
   * the string, and nothing has verified it.
   */
  parse(
    text: string,
    reviver?: (this: unknown, key: string, value: unknown) => unknown,
  ): unknown;
}

interface Body {
  /**
   * Returns `Promise<unknown>` rather than `Promise<any>`.
   *
   * `Body` is the shared base of both `Request` and `Response`, so this covers
   * reading a response body AND inspecting a request body (relevant in tests).
   */
  json(): Promise<unknown>;
}
