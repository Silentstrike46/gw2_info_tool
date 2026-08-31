import { setupServer } from "msw/node";
import { beforeAll, afterEach, afterAll } from "vitest";
// Information on args and setup: https://mswjs.io/docs/integrations/node
export const server = setupServer(); // Common MSW server between tests

beforeAll(() => {
  // Prevent any unhandled/uncofigured endpoints from being called
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
