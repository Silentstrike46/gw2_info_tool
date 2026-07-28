/**
 * Client for the Guild Wars 2 API v2.
 *
 * API Doc: https://wiki.guildwars2.com/wiki/API:2
 */

import type { CharacterInfoShort } from "./types.ts";
import { parseCharacterShort } from "./validators.ts";

// ---------------------------------------------------------------------------
//                          Configuration
// ---------------------------------------------------------------------------

export const GW2_API_BASE_URL = "https://api.guildwars2.com/v2";

/** Matches the Python port's `timeout=20`. */
export const GW2_DEFAULT_TIMEOUT_MS = 20_000;

/** "latest" pins us to the newest response schema. See API:2 § Schema versions. */
export const GW2_DEFAULT_SCHEMA_VERSION = "latest";

export interface Gw2ApiClientOptions {
  /** Override the API host. Production configurability; tests use MSW instead. */
  readonly baseUrl?: string;
  /** ISO-8601 UTC datetime, or "latest". */
  readonly schemaVersion?: string;
  /** Abort the request after this many milliseconds. */
  readonly timeoutMs?: number;
}

// ---------------------------------------------------------------------------
//                          Errors
// ---------------------------------------------------------------------------

/**
 * Why a request failed, in terms the UI can act on.
 *
 * - `invalid-key`   401 or 403 — key is wrong, expired, or lacks the
 *                   `characters` scope. (The wiki documents 403; the live API
 *                   returns 401. Handle both.)
 * - `rate-limited`  429.
 * - `server`        Any other non-OK status; `status` carries the real code.
 * - `timeout`       The request exceeded `timeoutMs` and was aborted.
 * - `network`       `fetch` itself rejected: offline, DNS, or CORS block.
 * - `malformed`     A 200 whose body was not the shape we require.
 */
export type Gw2ErrorKind =
  | "invalid-key"
  | "rate-limited"
  | "server"
  | "timeout"
  | "network"
  | "malformed";

/**
 * A GW2 API failure, tagged with a `kind` the caller can switch on.
 *
 * NOTE: The request URL carries the API key in its query string, so it must
 * never appear in `message` — error text reaches logs and the UI.
 */
export class Gw2ApiError extends Error {
  readonly kind: Gw2ErrorKind;
  /** HTTP status, when the failure came from a response. */
  readonly status?: number;

  constructor(
    kind: Gw2ErrorKind,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    // forward `cause` so the original error is not lost.
    super(message, { cause: options?.cause });
    this.kind = kind;
    this.status = options?.status;
    this.name = "Gw2ApiError"; // Shows up on stack trace
  }
}

// ---------------------------------------------------------------------------
//                          Client
// ---------------------------------------------------------------------------

/**
 * Talks to the GW2 API on behalf of one account.
 *
 * NOTE: The key and schema version go in the **query string**, not headers.
 * A cross-origin request carrying `Authorization` (or `X-Schema-Version`)
 * becomes a *preflighted* request, and the GW2 backend answers the browser's
 * OPTIONS probe with a bare 404 — no CORS headers — so the real request never
 * leaves. `?access_token=` keeps it a *simple* request, which the API does
 * allow (`access-control-allow-origin: *`).
 * See https://wiki.guildwars2.com/wiki/API:API_key
 */
export class Gw2ApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly schemaVersion: string;
  private readonly timeoutMs: number;

  constructor(apiKey: string, options: Gw2ApiClientOptions = {}) {
    // Invalid keys are rejected by the API, so we don't need to validate them here.
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl ?? GW2_API_BASE_URL;
    this.schemaVersion = options.schemaVersion ?? GW2_DEFAULT_SCHEMA_VERSION;
    this.timeoutMs = options.timeoutMs ?? GW2_DEFAULT_TIMEOUT_MS;
  }

  /**
   * Fetch every character on the account, fully validated.
   *
   * API Doc: https://wiki.guildwars2.com/wiki/API:2/characters
   *
   * @returns One `CharacterInfoShort` per character, in the order the API
   *   returned them. An account with no characters yields `[]`.
   * @throws {Gw2ApiError} On any transport, status, or validation failure.
   */
  async fetchCharacters(): Promise<CharacterInfoShort[]> {
    const raw = await this.request("characters", { ids: "all" });
    if (!Array.isArray(raw)) {
      throw new Gw2ApiError(
        "malformed",
        `Expected an array of characters, got ${raw === null ? "null" : typeof raw}`,
      );
    }
    const result: CharacterInfoShort[] = [];
    for (const [index, item] of raw.entries()) {
      try {
        result.push(parseCharacterShort(item));
      } catch (cause) {
        throw new Gw2ApiError(
          "malformed",
          `Failed to parse character at index ${String(index)}.`,
          {
            cause,
          },
        );
      }
    }
    return result;
  }

  /**
   * GET an endpoint and return its parsed JSON body.
   *
   * Shared by every endpoint method, so each one inherits the key handling,
   * timeout, status mapping, and `any`-to-`unknown` re-closing for free.
   *
   * @param endpoint - Path below the base URL, e.g. `"characters"`.
   * @param params - Extra query parameters, e.g. `{ ids: "all" }`.
   * @returns The decoded body, typed `unknown` — the caller must validate it.
   * @throws {Gw2ApiError} On an empty key, transport failure, or non-OK status.
   */
  private async request(
    endpoint: string,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    // Fail fast on whitespace-only keys, before any network call
    if (this.apiKey.trim() === "") {
      throw new Gw2ApiError(
        "invalid-key",
        "API key is empty or whitespace-only",
      );
    }

    const url = new URL(`${this.baseUrl}/${endpoint}`);
    const urlString = url.origin + url.pathname;
    // NOTE: Do not display URL after this point, or API key will be leaked in logs.
    // The `Gw2ApiError` message must never include the key. Use `urlString` for
    // logging instead.

    const searchParams = url.searchParams;
    for (const [key, value] of Object.entries(params)) {
      searchParams.set(key, value);
    }
    searchParams.set("v", this.schemaVersion);
    searchParams.set("access_token", this.apiKey);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new Gw2ApiError(
          "timeout",
          `Request to ${urlString} timed out after ${String(this.timeoutMs)}ms`,
          { cause: error },
        );
      }
      throw new Gw2ApiError(
        "network",
        `Network error while requesting ${urlString}.`,
        { cause: error },
      );
    }

    if (!response.ok) {
      let kind: Gw2ErrorKind;
      const message = `HTTP error ${String(response.status)} while requesting ${urlString}`;
      if (response.status === 401 || response.status === 403) {
        kind = "invalid-key";
      } else if (response.status === 429) {
        kind = "rate-limited";
      } else {
        kind = "server";
      }
      throw new Gw2ApiError(kind, message, { status: response.status });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new Gw2ApiError(
        "malformed",
        `Failed to parse JSON from ${urlString}`,
        { cause: error },
      );
    }
    return body;
  }
}
