I want to create a 2d tileset and map generator app in client-side react and pixi.js

## Concept

You upload 2d tileset images that you can use to generate maps you can use for 2d games written in javascript. Similiar to Tiled (mapeditor.org)

## Design

Simple sci fi look. Orange and black being the dominant colors. Use compact design to allow more viewport size to be used for displaying tilesets and maps. Dont use custom fonts.

Layout should be a full width toolbar at the top with the following options:

- File
  - New Project
  - Import
    - Project
    - Map
    - Tileset
  - Export
    - Project
    - Map
    - Tileset
  - Settings
- Edit
  - Undo
  - Redo
- Help
  - About
  - Keyboard Shortcuts
  - Submit Bug

And then after the toolbar, the screen should be split in vertical halves with a resizable divider in between:

- Left Half, where you can upload and select tilesets
- Right Half, where you can upload and paint maps from brushes selected in the left half

The right half should also be split into 2 vertical sections with a resizable divider in between:

- The main area of the right half should be the map area where you can paint using tiles selected from the left half
- Then there should be a layers area where you can select which layer is active and add/remove/order the layers

I want to use Shadcn (https://ui.shadcn.com/) for my components.

## Database

Everything should be stored locally using tanstack db to allow realtime database sync.

## Features

### Project Management

When you first open the app, you should get a modal that allows you to:

- Create a new project
- Import Existing project
- Show Existing projects with buttons to open/export/delete

Projects shold be imported/exported into a custom, highly compact binary format. I'd like the extension to be .2dp. Any tilesets/maps,layers etc. with their corresponding images should be stored in this project format.

### Tilesets

In the left area, you should have a toolbar where the user can select a brush size: 8px, 16px, 32px, 48px, 64px, 128px.
Then you should have zoom buttons to zoom in and out.
At the top of the tileset area, there should be a little Plus icon to add tileset. Once you've selected to add a tileset, you should be able to select any image from your hard drive, and then it will fill the tileset area. Then based on the size of the brush you can select an area i.e. 8px x 8px in the tileset area and then brush with it in the right area (map area).
There should be tabs at the top of the tileset area where the user can navigate their uploaded tilsets, with options to delete or rename the tabs (by double clicking on it)
To the left of the tabs should be a Tileset Group dropdown. Initially all tilesets will just be added to "Main" Group, but you should be able to select "Add Tileset Group" from the dropdown and then create a new tileset group. You should be able to delete tileset groups. This should allow easy switching between tileset tabs by switching to different tileset groups.

### Maps Area

In the right area should be a maps area where you can also have "Map Groups" and each map should be a tab. But in this area you should be able to paint on a grid from brushes you select in the left tileset area.

There should be a toolbar above the maps area with the following options:

- Map Options: Set the map width and height in tile size. For example if your brush size is 8px and you select the the map width to be 2 tiles wide. Then the map will be 16px wide.

- Zoom In/Out
- Paint Tool with a dropdown for 1x1, 2x2, 3x3, 4x4, 5x5. When you have the paint tool selected you should be able to paint in the map area with the selected brush from the tileset area
- Fill Tool. Selecting this option will fill all the empty spaces in the grid with the selected brush, and also adhere to some collision detection. For example when you have a square of tiles and you click with the fill tool selected in the middle of the square, it should only fill the inside of the square.
- Eraser tool: This should work the same as the paint tool with the dropdowns. But when selected it should delete tiles from the map area.

### Layers

To the right of the right area we will have a toolbox area for layers. Layers can be moved up/down/deleted/renamed and created. You should also be able to Show/Hide Layers and lock layers. The layers should work the same as any Image Editing app like photoshop. If you click that you want to create a layer, it should show a modal. For now we only allow one type: "Tile Layer". Only one layer can be selected at a time. If you paint in the right pane, those changes should only affect the current layer. When you re-order layers it should respect transparency.

### Settings

When you open settings from File -> Settings. It should only have one toggle option for now: Save every minute

### Undo/Redo

Undo/Redo is one of the trickiest parts of this app. I would like to use https://github.com/mutativejs/travels which is an undo/redo library which stores only changes, not full snapshots. I've included the documentation for it in ./TRAVELS.md Any changes you do to a project should have the ability to be undone/redone. In the case of painting tiles for example. Since we dont want to store full binary blobs in the undo/redo history, please store those in Indexeddb with unique ids and then store the ids in the redo/undo history. And remember to clean up IndexedDB when items are no longer needed in undo/redo stack. Use travels' support for storing undo/redo in Indexeddb - please dont use memory. You should have max 50 undo steps

## Critical

- Any destructuve action should present the user with an alert dialog to make sure the user wants to intentially remove something
- Use tooltips for all icons
- Performance is really important to me, so please don't use easy solutions just to achieve a goal. Really consider performance implications when maps/tilesets grow to 1000s of tiles/maps.
