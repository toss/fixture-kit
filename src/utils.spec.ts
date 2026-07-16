import { describe, expect, it } from "vitest";
import { isPlainObject } from "./utils.js";

describe("isPlainObject", () => {
  it("should return true for an object literal", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("should return true for a null-prototype object", () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it("should return false for null", () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it("should return false for an array", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(["a"])).toBe(false);
  });

  it("should return false for exotic objects", () => {
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject(/regex/)).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new (class {})())).toBe(false);
  });

  it("should return false for primitives", () => {
    expect(isPlainObject("string")).toBe(false);
    expect(isPlainObject(1)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject(Symbol("s"))).toBe(false);
  });

  it("should return false for a function", () => {
    expect(isPlainObject(() => {})).toBe(false);
  });
});
