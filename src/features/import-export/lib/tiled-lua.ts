import { decodeText } from "@/features/import-export/lib/tiled-xml-utils";
import type { TiledLuaTable, TiledLuaValue } from "@/types";

const LUA_KEYWORDS = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);

function isTiledLuaTable(
  value: TiledLuaValue | unknown,
): value is TiledLuaTable {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "arrayValues" in value &&
    "objectValues" in value,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

class TiledLuaParser {
  private index = 0;
  private readonly source: string;
  private readonly label: string;

  constructor(source: string, label: string) {
    this.source = source;
    this.label = label;
  }

  parseDocument() {
    this.skipIgnorable();
    this.expectKeyword("return");
    this.skipIgnorable();

    const table = this.parseTable();

    this.skipIgnorable();
    if (!this.isAtEnd()) {
      this.fail("Unexpected content after Lua table.");
    }

    return table;
  }

  private parseValue(): TiledLuaValue {
    this.skipIgnorable();

    const next = this.peek();
    if (next === "{") {
      return this.parseTable();
    }
    if (next === '"' || next === "'") {
      return this.parseString();
    }
    if (next === "-" || this.isDigit(next)) {
      return this.parseNumber();
    }

    const identifier = this.tryParseIdentifier();
    if (identifier !== null) {
      if (identifier === "true") {
        return true;
      }
      if (identifier === "false") {
        return false;
      }
      if (identifier === "nil") {
        return null;
      }
      this.fail(`Unsupported Lua value '${identifier}'.`);
    }

    this.fail("Expected a Lua value.");
  }

  private parseTable(): TiledLuaTable {
    this.expectChar("{");
    this.skipIgnorable();

    const table: TiledLuaTable = {
      arrayValues: [],
      objectValues: {},
    };

    while (!this.isAtEnd()) {
      this.skipIgnorable();
      if (this.peek() === "}") {
        this.index += 1;
        return table;
      }

      this.parseFieldInto(table);
      this.skipIgnorable();

      const separator = this.peek();
      if (separator === "," || separator === ";") {
        this.index += 1;
        this.skipIgnorable();
        if (this.peek() === "}") {
          this.index += 1;
          return table;
        }
        continue;
      }

      if (separator === "}") {
        this.index += 1;
        return table;
      }

      this.fail("Expected ',' or '}' after Lua table field.");
    }

    this.fail("Unterminated Lua table.");
  }

  private parseFieldInto(table: TiledLuaTable) {
    this.skipIgnorable();

    if (this.peek() === "[") {
      const key = this.parseBracketKey();
      this.skipIgnorable();
      this.expectChar("=");
      this.skipIgnorable();
      table.objectValues[String(key)] = this.parseValue();
      return;
    }

    const startIndex = this.index;
    const identifier = this.tryParseIdentifier();
    if (identifier !== null) {
      const afterIdentifier = this.index;
      this.skipIgnorable();
      if (this.peek() === "=") {
        if (
          identifier === "true" ||
          identifier === "false" ||
          identifier === "nil"
        ) {
          this.fail(
            "Boolean and nil literals cannot be used as bare Lua table keys.",
          );
        }
        this.index += 1;
        this.skipIgnorable();
        table.objectValues[identifier] = this.parseValue();
        return;
      }

      this.index = startIndex;
      if (
        identifier === "true" ||
        identifier === "false" ||
        identifier === "nil"
      ) {
        table.arrayValues.push(this.parseValue());
        return;
      }

      this.index = afterIdentifier;
      this.fail(`Unsupported Lua expression '${identifier}'.`);
    }

    table.arrayValues.push(this.parseValue());
  }

  private parseBracketKey() {
    this.expectChar("[");
    this.skipIgnorable();

    const next = this.peek();
    let key: string | number;

    if (next === '"' || next === "'") {
      key = this.parseString();
    } else if (next === "-" || this.isDigit(next)) {
      key = this.parseNumber();
    } else {
      const identifier = this.tryParseIdentifier();
      if (identifier === null) {
        this.fail("Expected a Lua table key inside brackets.");
      }
      key = identifier;
    }

    this.skipIgnorable();
    this.expectChar("]");
    return key;
  }

  private parseString() {
    const quote = this.peek();
    if (quote !== '"' && quote !== "'") {
      this.fail("Expected a Lua string.");
    }

    this.index += 1;
    let value = "";

    while (!this.isAtEnd()) {
      const character = this.peek();
      this.index += 1;

      if (character === quote) {
        return value;
      }

      if (character === "\\") {
        if (this.isAtEnd()) {
          this.fail("Unterminated Lua escape sequence.");
        }

        const escaped = this.peek();
        this.index += 1;

        switch (escaped) {
          case "\\":
            value += "\\";
            break;
          case '"':
            value += '"';
            break;
          case "'":
            value += "'";
            break;
          case "n":
            value += "\n";
            break;
          case "r":
            value += "\r";
            break;
          case "t":
            value += "\t";
            break;
          default:
            value += escaped;
            break;
        }
        continue;
      }

      value += character;
    }

    this.fail("Unterminated Lua string.");
  }

  private parseNumber() {
    const remainder = this.source.slice(this.index);
    const match = remainder.match(
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/,
    );
    if (!match) {
      this.fail("Expected a Lua number.");
    }

    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      this.fail(`Invalid Lua number '${match[0]}'.`);
    }
    return value;
  }

  private tryParseIdentifier() {
    const remainder = this.source.slice(this.index);
    const match = remainder.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (!match) {
      return null;
    }

    this.index += match[0].length;
    return match[0];
  }

  private expectKeyword(keyword: string) {
    const startIndex = this.index;
    const parsed = this.tryParseIdentifier();
    if (parsed !== keyword) {
      this.index = startIndex;
      this.fail(`Expected '${keyword}'.`);
    }
  }

  private expectChar(expected: string) {
    if (this.peek() !== expected) {
      this.fail(`Expected '${expected}'.`);
    }
    this.index += 1;
  }

  private skipIgnorable() {
    while (!this.isAtEnd()) {
      const character = this.peek();

      if (/\s/.test(character)) {
        this.index += 1;
        continue;
      }

      if (character === "-" && this.peek(1) === "-") {
        this.index += 2;

        if (this.peek() === "[" && this.peek(1) === "[") {
          this.index += 2;
          while (!this.isAtEnd()) {
            if (this.peek() === "]" && this.peek(1) === "]") {
              this.index += 2;
              break;
            }
            this.index += 1;
          }
          continue;
        }

        while (!this.isAtEnd() && this.peek() !== "\n") {
          this.index += 1;
        }
        continue;
      }

      break;
    }
  }

  private peek(offset = 0) {
    return this.source[this.index + offset] ?? "";
  }

  private isDigit(value: string) {
    return value >= "0" && value <= "9";
  }

  private isAtEnd() {
    return this.index >= this.source.length;
  }

  private fail(message: string): never {
    throw new Error(
      `Invalid ${this.label} Lua document at ${this.index + 1}: ${message}`,
    );
  }
}

function escapeLuaString(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
}

function isBareLuaIdentifier(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) && !LUA_KEYWORDS.has(value);
}

function formatLuaKey(value: string) {
  if (isBareLuaIdentifier(value)) {
    return value;
  }

  return `["${escapeLuaString(value)}"]`;
}

function stringifyLuaValue(
  value: TiledLuaValue,
  indentLevel: number,
  indentation: string,
): string {
  if (value === null) {
    return "nil";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot encode non-finite number in Lua document.");
    }
    return String(value);
  }
  if (typeof value === "string") {
    return `"${escapeLuaString(value)}"`;
  }

  return stringifyLuaTable(value, indentLevel, indentation);
}

function stringifyLuaTable(
  table: TiledLuaTable,
  indentLevel: number,
  indentation: string,
): string {
  const indent = indentation.repeat(indentLevel);
  const childIndent = indentation.repeat(indentLevel + 1);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(table.objectValues)) {
    lines.push(
      `${childIndent}${formatLuaKey(key)} = ${stringifyLuaValue(
        value,
        indentLevel + 1,
        indentation,
      )}`,
    );
  }

  for (const value of table.arrayValues) {
    lines.push(
      `${childIndent}${stringifyLuaValue(value, indentLevel + 1, indentation)}`,
    );
  }

  if (lines.length === 0) {
    return "{}";
  }

  return `{\n${lines.join(",\n")}\n${indent}}`;
}

export function parseTiledLuaTableDocument(data: Uint8Array, label: string) {
  const source = decodeText(data).replace(/^\uFEFF/, "");
  return new TiledLuaParser(source, label).parseDocument();
}

export function convertTiledLuaToJsonLike(value: TiledLuaValue): unknown {
  if (!isTiledLuaTable(value)) {
    return value;
  }

  const objectEntries = Object.entries(value.objectValues);
  if (objectEntries.length > 0 && value.arrayValues.length > 0) {
    throw new Error("Mixed keyed and array Lua tables are not supported.");
  }

  if (objectEntries.length === 0) {
    return value.arrayValues.map((entry) => convertTiledLuaToJsonLike(entry));
  }

  return Object.fromEntries(
    objectEntries.map(([key, entryValue]) => [
      key,
      convertTiledLuaToJsonLike(entryValue),
    ]),
  );
}

export function convertJsonLikeToTiledLua(value: unknown): TiledLuaValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      arrayValues: value.map((entry) => convertJsonLikeToTiledLua(entry)),
      objectValues: {},
    };
  }

  if (!isPlainObject(value)) {
    throw new Error("Unsupported value for Lua conversion.");
  }

  const objectValues: Record<string, TiledLuaValue> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue === undefined) {
      continue;
    }
    objectValues[key] = convertJsonLikeToTiledLua(entryValue);
  }

  return {
    arrayValues: [],
    objectValues,
  };
}

export function parseTiledLuaDocument<T>(data: Uint8Array, label: string) {
  const table = parseTiledLuaTableDocument(data, label);
  const value = convertTiledLuaToJsonLike(table);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label} Lua document.`);
  }
  return value as T;
}

export function encodeTiledLuaDocument(value: unknown, indentation = "  ") {
  const root = convertJsonLikeToTiledLua(value);
  if (!isTiledLuaTable(root)) {
    throw new Error("Tiled Lua documents must encode a top-level table.");
  }

  return new TextEncoder().encode(
    `return ${stringifyLuaTable(root, 0, indentation)}\n`,
  );
}
