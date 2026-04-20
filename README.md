# 2dtiler

2dtiler is a free, open source 2D level, tileset, and pixel workflow editor built for game developers who are tired of jumping between a dozen separate tools.

It is designed to replace large parts of the day-to-day workflow usually split across map editors, tileset tools, palette utilities, lightweight image editors, export helpers, and asset generation tools. Instead of stitching together 10+ apps for one project, you can keep the work in one place.

## Why 2dtiler

- Free to use
- MIT licensed
- Runs locally in the browser
- Covers maps, tilesets, image editing, palettes, and export workflows in one app
- Built for fast iteration with keyboard shortcuts, layered editing, and asset import/export

2dtiler is a practical replacement for many common 2D production workflows people currently handle with tools like Tiled, Ogmo, Aseprite palette utilities, lightweight raster editors, standalone export tools, and other specialist pixel-art utilities.

## Features

### Map and tileset workflow

- Create and edit tile maps with layered content
- Work with tilesets and reusable tile assets
- Paint, erase, fill, and terrain-fill maps
- Use image layers and object rendering inside the editor
- Resize maps and work with multiple asset types in one project

### Import and export

- Export full projects as `.2dp`
- Export single maps as `.2dm`
- Export single tilesets as `.2dt`
- Import and export raster images including PNG, JPG, WEBP, BMP, and GIF
- Export with format-specific options like transparency and quality where supported

### Image and palette tools

- Built-in image editor for tile and image asset workflows
- Palette parsing and conversion utilities
- Support for GIMP `.gpl` palettes
- Support for ASE palette files used in Aseprite workflows

### Editor experience

- Keyboard shortcuts for tools, brush sizes, zoom, undo/redo, save, find/replace, and clipboard actions
- Auto-save and manual save flows
- Progressive web app setup with service worker updates
- Runs as a local web app during development and can be deployed as a static frontend

### AI-assisted asset generation

- Built-in AI asset generation UI for tilesets, sprites, backgrounds, icons, UI assets, and VFX
- Supports multiple generation providers and prompt-driven asset configuration

## Free and Open Source

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

## Tech Stack

- React
- TypeScript
- Vite
- Bun for local workflow commands

## Status

2dtiler is actively evolving. The repository includes ongoing work around import/export, AI asset tooling, tileset management, map management, and broader editor workflows.
