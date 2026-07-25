/**
 * Utility functions for assertions.
 */

/**
 * Assert that the condition is true, and throw an error if not.
 *
 * @param condition - condition to assert is true
 * @param message - Message to throw should condition fail
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
