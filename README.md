# 2dtiler

2dtiler is a free, open source 2D level, tileset, pixel asset, palette, and export workflow editor for game developers who are tired of jumping between a dozen separate tools.

It is designed to replace large parts of the day-to-day workflow usually split across map editors, tileset tools, palette utilities, lightweight image editors, export helpers, and asset generation tools. Instead of stitching together 10+ apps for one project, you can keep the work in one local browser workspace.

## Why 2dtiler

- Free to use
- MIT licensed
- Runs locally in the browser
- Covers maps, tilesets, image editing, palettes, AI-assisted asset generation, and export workflows in one app
- Built for fast iteration with keyboard shortcuts, layered editing, terrain-aware painting, autosave, and project import/export

2dtiler is a practical replacement for many common 2D production workflows people currently handle with tools like Tiled, Ogmo, Aseprite palette utilities, lightweight raster editors, standalone export tools, and other specialist pixel-art utilities.

## Standout features

### Map and tileset workflow

- Create and edit tile maps with layered content
- Paint, erase, fill, select, and autotile maps from the toolbar
- Use brush sizes from `1x1` through `5x5` for paint, erase, and autotile work
- Organize maps with tile layers, image layers, object layers, and layer groups
- Place object metadata such as rectangles, points, ellipses, polygons, and text objects
- Use image layers for backgrounds, large art elements, or non-grid artwork
- Resize maps and work with multiple asset types in one project

### Autotile and terrain tools

- Configure autotile terrain rules on tilesets
- Use standard, diagonal, sparse, and 16-slot Wang autotile preset workflows
- Paint terrain from the Autotile tool so neighboring tiles update together
- Use terrain fill when a region should be filled from reusable weighted tile sets
- Preserve native autotile metadata through 2D Tiler project and tileset files
- Round-trip supported two-color edge Wang metadata through Tiled tileset files

### Image editor and palette tools

- Built-in image editor for tile, sprite, and lightweight raster asset workflows
- Pixel tools for pencil, eraser, paint bucket, line, rectangle, contour, selection, crop, move, and blur work
- Brush sizes from `1` through `16` pixels for drawing tools
- Full RGBA color support
- Palette parsing and conversion utilities
- Palette import support for GIMP `.gpl`, Adobe ASE, Aseprite palette data, JASC `.pal`, Paint.NET `.txt`, and plain `.hex` lists

### AI-assisted asset generation

- Built-in AI asset generation UI for tilesets, sprite sheets, backgrounds, item icons, UI elements, and VFX
- Provider-backed generation support for OpenAI, Google Gemini, xAI, and Together AI model families
- Asset-specific prompt controls for tile terrain, sprite roles, animation states, backgrounds, icons, UI elements, and VFX
- Style and palette controls for pixel art, vector, hand-painted, cel-shaded, watercolor, vibrant, pastel, muted, monochrome, neon, and earth-tone directions
- Reference-image input on models that support image-to-image workflows

### Import and export

| Asset type | Supported workflows                                                                                                                                                                                                                                                                                   |
| :--------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project    | Native 2D Tiler project import/export as `.2dp`                                                                                                                                                                                                                                                       |
| Map        | Native `.2dm`, raster image import/export, Phaser-ready `.json` bundles, Tiled map import/export, Godot 4 `.tscn` import/export, Unity Tilemap prefab bundle import/export, GameMaker room import/export, Defold tilemap or collection import/export, tIDE map import/export, Mappy FMP import/export |
| Tileset    | Native `.2dt`, raster image import/export, Tiled tileset import/export, Defold tile source import/export, Godot 4 tileset export, Unity sprite sheet bundle import/export                                                                                                                             |

Raster image workflows support PNG, JPG, WebP, BMP, and GIF where the selected import or export path allows it.

Tiled project container import/export is planned, but current Tiled support focuses on map and tileset files.

### Editor experience

- Autosave and manual save flows
- Undo and redo history for editor changes
- Quick export shortcuts for the active map and active tileset
- Find and replace for tile editing workflows
- Copy, cut, paste, delete, flip, zoom, and brush-size shortcuts
- Progressive web app setup with service worker updates
- Dark and light theme support

## Keyboard shortcuts

| Shortcut                                  | Action                          |
| :---------------------------------------- | :------------------------------ |
| `S`                                       | Select tool                     |
| `B`                                       | Paint tool                      |
| `A`                                       | Autotile tool                   |
| `E`                                       | Erase tool                      |
| `G`                                       | Fill tool                       |
| `1` through `5`                           | Brush sizes `1x1` through `5x5` |
| `Ctrl+Z` / `Cmd+Z`                        | Undo                            |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` / `Ctrl+Y` | Redo                            |
| `Ctrl+S` / `Cmd+S`                        | Manual save                     |
| `Ctrl+Shift+E` / `Cmd+Shift+E`            | Quick export active map         |
| `Ctrl+Shift+B` / `Cmd+Shift+B`            | Quick export active tileset     |
| `Ctrl+H` / `Cmd+H`                        | Open find and replace           |
| `Ctrl+C` / `Cmd+C`                        | Copy tile selection             |
| `Ctrl+X` / `Cmd+X`                        | Cut tile selection              |
| `Ctrl+V` / `Cmd+V`                        | Paste tile selection            |
| `Delete` / `Backspace`                    | Delete current selection        |
| `H`                                       | Flip hovered tile horizontally  |
| `V`                                       | Flip hovered tile vertically    |
| `+` / `=`                                 | Zoom in on the map              |
| `-`                                       | Zoom out on the map             |

## Free and open source

2dtiler is completely free and released under the MIT License. You can use it, modify it, and contribute improvements without paying for the editor itself.

See [LICENSE](./LICENSE) for the full license text.

## Installation

### Requirements

- [Bun](https://bun.sh/)

### Local development

1. Clone the repository.
2. Install dependencies:

```bash
bun install
```

3. Start the development server:

```bash
bun run dev
```

4. Open the local URL printed by Vite in your browser.

### Production build

```bash
bun run build
```

### Lint the project

```bash
bun run lint
```

### Run tests with coverage

```bash
bun run test
```

### Preview the production build

```bash
bun run preview
```

## Contributing

Contributions are welcome.

1. Fork the repository or create a feature branch.
2. Make your changes.
3. Run the checks locally:

```bash
bun run lint
bun run build
```

4. Open a pull request with a clear summary of the change.

If you are proposing a bigger feature, keep the pull request focused and explain the workflow problem it solves.

## Tech stack

- React
- TypeScript
- Vite
- Bun for local workflow commands
- Zustand, travels, and IndexedDB-backed local persistence
- Astro and Tailwind on the public website

## Status

2dtiler is actively evolving. The repository includes ongoing work around import/export compatibility, AI asset tooling, tileset management, map management, terrain workflows, image editing, and broader editor workflows.
