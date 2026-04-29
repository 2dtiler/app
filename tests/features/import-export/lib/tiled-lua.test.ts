import { assert, test } from "vitest";
import {
  convertJsonLikeToTiledLua,
  convertTiledLuaToJsonLike,
  encodeTiledLuaDocument,
  parseTiledLuaDocument,
} from "@/features/import-export/lib/tiled-lua";

function decodeText(value: Uint8Array) {
  return new TextDecoder().decode(value);
}

test("Tiled Lua helpers round-trip escaped values and reject unsupported documents", () => {
  const encoded = encodeTiledLuaDocument({
    plain: 1,
    list: [true, null, 3.5],
    nested: { child: "ok" },
    "two words": 'line 1\n"line 2"',
  });

  const encodedText = decodeText(encoded);
  assert.match(encodedText, /\["two words"\] = "line 1\\n\\"line 2\\""/);

  const parsed = parseTiledLuaDocument<Record<string, unknown>>(
    encoded,
    "fixture",
  );
  assert.deepEqual(parsed, {
    plain: 1,
    list: [true, null, 3.5],
    nested: { child: "ok" },
    "two words": 'line 1\n"line 2"',
  });

  assert.deepEqual(
    convertJsonLikeToTiledLua({ sample: [1, 2, 3], omit: undefined }),
    {
      arrayValues: [],
      objectValues: {
        sample: {
          arrayValues: [1, 2, 3],
          objectValues: {},
        },
      },
    },
  );

  assert.throws(
    () =>
      convertTiledLuaToJsonLike({
        objectValues: { named: 1 },
        arrayValues: [2],
      }),
    /Mixed keyed and array Lua tables are not supported/,
  );
  assert.throws(
    () => convertJsonLikeToTiledLua(new Date()),
    /Unsupported value/,
  );
  assert.throws(() => encodeTiledLuaDocument("oops"), /top-level table/);
});
