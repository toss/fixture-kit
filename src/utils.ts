/**
 * A plain object is one whose prototype is `Object.prototype` or `null`.
 *
 * In a fixture tree, only plain objects are treated as nested directories.
 * Exotic objects (Date, RegExp, class instances, arrays, …) are rejected
 * rather than being silently walked as an empty tree.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
