import { describe, expect, it } from "bun:test";
import {
  findNonSerializablePath,
  toPlainJson,
} from "@/utils/json-serialization";

describe("json-serialization", () => {
  it("allows shared plain object references (diamond DAG)", () => {
    const region = { sx: 1, sy: 2, sw: 16, sh: 16 };
    const value = {
      patternTiles: { fill: region },
      rules: [{ output: region }],
    };

    expect(findNonSerializablePath(value, "project")).toBeNull();
    expect(JSON.stringify(value)).toContain('"sx":1');

    const plain = toPlainJson(value);
    expect(plain.rules[0].output).toEqual(region);
    expect(plain.patternTiles.fill).toEqual(region);
    // Shared refs stay shared after clone (same clone instance).
    expect(plain.rules[0].output).toBe(plain.patternTiles.fill);
  });

  it("detects true ancestor cycles", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(findNonSerializablePath(value, "project")).toBe(
      "project.self (circular)",
    );
    expect(toPlainJson(value)).toEqual({ self: null });
  });

  it("detects DOM-like non-plain objects", () => {
    class FakeButton {
      type = "button";
    }
    const value = { target: new FakeButton() };

    expect(findNonSerializablePath(value, "project")).toBe(
      "project.target (FakeButton)",
    );
    expect(toPlainJson(value)).toEqual({ target: null });
  });

  it("rejects functions and non-finite numbers", () => {
    expect(findNonSerializablePath({ fn: () => 1 }, "root")).toBe(
      "root.fn (function)",
    );
    expect(findNonSerializablePath({ n: Number.NaN }, "root")).toBe(
      "root.n (number)",
    );
    expect(toPlainJson({ n: Number.POSITIVE_INFINITY, ok: 1 })).toEqual({
      n: null,
      ok: 1,
    });
  });
});
