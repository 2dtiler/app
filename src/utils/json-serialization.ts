const PLAIN_OBJECT_PROTO = Object.prototype;

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === PLAIN_OBJECT_PROTO;
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "Array";
  if (typeof value === "object") {
    const ctor = (value as object).constructor?.name;
    return ctor && ctor !== "Object" ? ctor : "Object";
  }
  return typeof value;
}

/**
 * Walk a value tree and return the first path that JSON.stringify cannot handle.
 * Shared plain-object references (diamonds) are allowed; only true ancestor cycles
 * and non-JSON values are reported.
 */
export function findNonSerializablePath(
  value: unknown,
  path = "root",
  ancestors = new Set<object>(),
): string | null {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return `${path} (${describeValue(value)})`;
    }
    return null;
  }

  if (typeof value === "bigint" || typeof value === "symbol") {
    return `${path} (${describeValue(value)})`;
  }

  if (typeof value === "function") {
    return `${path} (function)`;
  }

  if (typeof value !== "object") {
    return `${path} (${describeValue(value)})`;
  }

  if (ancestors.has(value)) {
    return `${path} (circular)`;
  }

  if (Array.isArray(value)) {
    ancestors.add(value);
    for (let index = 0; index < value.length; index += 1) {
      const nested = findNonSerializablePath(
        value[index],
        `${path}[${index}]`,
        ancestors,
      );
      if (nested) {
        ancestors.delete(value);
        return nested;
      }
    }
    ancestors.delete(value);
    return null;
  }

  if (!isPlainObject(value)) {
    return `${path} (${describeValue(value)})`;
  }

  ancestors.add(value);
  for (const [key, nestedValue] of Object.entries(value)) {
    const nested = findNonSerializablePath(
      nestedValue,
      `${path}.${key}`,
      ancestors,
    );
    if (nested) {
      ancestors.delete(value);
      return nested;
    }
  }
  ancestors.delete(value);

  return null;
}

function clonePlainJson(
  value: unknown,
  clones: WeakMap<object, unknown>,
  ancestors: Set<object>,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint" ||
    typeof value === "undefined"
  ) {
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  if (ancestors.has(value)) {
    return null;
  }

  const existingClone = clones.get(value);
  if (existingClone) {
    return existingClone;
  }

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    clones.set(value, clone);
    ancestors.add(value);
    for (const item of value) {
      clone.push(clonePlainJson(item, clones, ancestors));
    }
    ancestors.delete(value);
    return clone;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const clone: Record<string, unknown> = {};
  clones.set(value, clone);
  ancestors.add(value);
  for (const [key, nestedValue] of Object.entries(value)) {
    clone[key] = clonePlainJson(nestedValue, clones, ancestors);
  }
  ancestors.delete(value);
  return clone;
}

/**
 * Deep-clone only JSON-safe data. Shared plain references are preserved as
 * shared clones. True cycles and class/DOM instances become null.
 */
export function toPlainJson<T>(value: T): T {
  return clonePlainJson(value, new WeakMap(), new Set()) as T;
}
