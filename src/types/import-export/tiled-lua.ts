export type TiledLuaPrimitive = boolean | number | string | null;

export interface TiledLuaTable {
  arrayValues: TiledLuaValue[];
  objectValues: Record<string, TiledLuaValue>;
}

export type TiledLuaValue = TiledLuaPrimitive | TiledLuaTable;