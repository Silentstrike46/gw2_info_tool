import { describe, it, expect } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { server } from "../../test/setup";
import type { CharacterInfoShort } from "./types.ts";
import { character } from "../../testutils.ts";
import { Gw2ApiClient, Gw2ApiError } from "./api.ts";

const CHARACTERS_URL = "https://api.guildwars2.com/v2/characters";

/** Answer the characters endpoint with `status` and an empty body. */
function mockStatus(status: number): void {
  server.use(
    http.get(CHARACTERS_URL, () => new HttpResponse(null, { status })),
  );
}

describe("Gw2ApiClient - fetchCharacters", () => {
  it("returns two validated CharacterInfoShort when request is valid.", async () => {
    const wireBody: Omit<CharacterInfoShort, "armor">[] = [
      {
        name: "Char1",
        race: "Charr",
        gender: "Male",
        profession: "Revenant",
        level: 80,
        age: 0,
        created: "2024-01-01T00:00:00.000Z",
      },
      {
        name: "Char2",
        race: "Sylvari",
        gender: "Female",
        profession: "Elementalist",
        level: 80,
        age: 0,
        created: "2024-01-01T00:00:00.000Z",
      },
    ];
    const expectedCharacters: CharacterInfoShort[] = [
      { ...wireBody[0], armor: "Heavy" },
      { ...wireBody[1], armor: "Light" },
    ];
    server.use(
      http.get(CHARACTERS_URL, () => {
        return HttpResponse.json(wireBody);
      }),
    );
    const client = new Gw2ApiClient("FakeAPIKey");
    const retData = await client.fetchCharacters();
    expect(retData).toStrictEqual(expectedCharacters);
  });

  it.each([401, 403] as const)(
    "throws invalid-key error when receiving status code (%s)",
    async (statusCode) => {
      mockStatus(statusCode);
      const client = new Gw2ApiClient("FakeAPIKey");
      try {
        await client.fetchCharacters();
        expect.unreachable("should have thrown");
      } catch (err) {
        if (!(err instanceof Gw2ApiError)) throw err;
        expect(err.kind).toBe("invalid-key");
      }
    },
  );

  it("throws rate-limited error when receiving status code 429", async () => {
    mockStatus(429);
    const client = new Gw2ApiClient("FakeAPIKey");
    await expect(client.fetchCharacters()).rejects.toMatchObject({
      kind: "rate-limited",
    });
  });

  it("throws server error when receiving status code 500", async () => {
    mockStatus(500);
    const client = new Gw2ApiClient("FakeAPIKey");
    await expect(client.fetchCharacters()).rejects.toMatchObject({
      kind: "server",
      status: 500,
    });
  });

  it("throws malformed error when a 200 body is not JSON", async () => {
    server.use(
      http.get(CHARACTERS_URL, () => {
        return new HttpResponse("NotJSON", { status: 200 });
      }),
    );
    const client = new Gw2ApiClient("FakeAPIKey");
    await expect(client.fetchCharacters()).rejects.toMatchObject({
      kind: "malformed",
    });
  });

  it("throws malformed error when the JSON is not an array", async () => {
    server.use(
      http.get(CHARACTERS_URL, () => {
        return HttpResponse.json({ not: "aJSONBody" });
      }),
    );
    const client = new Gw2ApiClient("FakeAPIKey");
    await expect(client.fetchCharacters()).rejects.toMatchObject({
      kind: "malformed",
    });
  });

  it("throws malformed error when an array element fails validation", async () => {
    // One invalid element ("Dwarf" is not a Race) among valid ones.
    const wireBody: unknown[] = [
      character({ name: "GoodChar" }),
      { ...character({ name: "BadChar" }), race: "Dwarf" },
    ];
    server.use(
      http.get(CHARACTERS_URL, () => {
        return HttpResponse.json(wireBody);
      }),
    );
    const client = new Gw2ApiClient("FakeAPIKey");
    await expect(client.fetchCharacters()).rejects.toMatchObject({
      kind: "malformed",
      // The wrapped cause proves the failure came from this element, not elsewhere.
      // toMatchObject partial-matches nested objects, so this checks cause.message.
      cause: { message: "invalid race: Dwarf" },
    });
  });

  it("throws invalid-key for an empty key without sending a request", async () => {
    // If the fail-fast guard is broken and a request escapes, this handler
    // fails the test loudly.
    server.use(
      http.get(CHARACTERS_URL, () => {
        expect.unreachable("no request should be sent for an empty key");
      }),
    );
    const client = new Gw2ApiClient("   ");
    await expect(client.fetchCharacters()).rejects.toMatchObject({
      kind: "invalid-key",
    });
  });

  it("throws network error when fetch itself fails", async () => {
    server.use(http.get(CHARACTERS_URL, () => HttpResponse.error()));
    const client = new Gw2ApiClient("FakeAPIKey");
    await expect(client.fetchCharacters()).rejects.toMatchObject({
      kind: "network",
    });
  });

  it("sends key and schema as query params, never an Authorization header", async () => {
    let captured: Request | undefined;
    server.use(
      http.get(CHARACTERS_URL, ({ request }) => {
        captured = request;
        return HttpResponse.json([]);
      }),
    );
    const client = new Gw2ApiClient("secret-key-123");
    await client.fetchCharacters();

    if (!captured) throw new Error("handler was not called");
    expect(captured.headers.get("authorization")).toBeNull();
    const params = new URL(captured.url).searchParams;
    expect(params.get("access_token")).toBe("secret-key-123");
    expect(params.get("v")).toBe("latest");
  });

  it("never includes the API key in the error message", async () => {
    const apiKey = "super-secret-key-abcd-1234";
    mockStatus(500);
    const client = new Gw2ApiClient(apiKey);
    try {
      await client.fetchCharacters();
      expect.unreachable("should have thrown");
    } catch (err) {
      if (!(err instanceof Gw2ApiError)) throw err;
      expect(err.message).not.toContain(apiKey);
    }
  });

  it("throws timeout error when the request exceeds timeoutMs", async () => {
    server.use(
      http.get(CHARACTERS_URL, async () => {
        await delay("infinite");
        return HttpResponse.json([]);
      }),
    );
    const client = new Gw2ApiClient("FakeAPIKey", { timeoutMs: 20 });
    await expect(client.fetchCharacters()).rejects.toMatchObject({
      kind: "timeout",
    });
  });
});
