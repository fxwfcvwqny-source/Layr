# Layr 3.9.0 (draft release notes)

Release notes for version 3.9.0.

## Fixes

- Text selection: the text layer has an `endOfContent` element kept behind the selection anchor, so dragging across pages no longer selects the whole next page.
- The toolbox "More" button no longer looks permanently active; its `aria-expanded` state is reset when the menu closes or another menu opens.
- Floating toolbar: left placement now works.
- Quick bar: buttons missing from an older saved design are inserted at their default position instead of after Delete.
- Double-click on a device box or its caption edits the device instead of a docked line crossing it (limited to docked lines).
- Dark symbols stay visible in forced-colors mode.
- Symbol tile images shrink with narrow tiles.
- Test suite: smoke test flake fixed (isolated profile, stale `dense.pdf` objects), geometric check for dense-page drag selection, toolbar position checks.
- Sheet colour "Night" is no longer inverted twice when the "Night mode for pages" switch is on.

## New

- Text selection bar: appears on selected PDF text with Copy and Highlight; one click on a colour swatch (or confirming a custom colour) highlights the selection at once in that colour, and the Highlight button reuses the last colour.
- Text quick bar: italic (Ctrl+I) and text background colour.
- Fixed toolbar is centred over the sheet from 1200 px window width; density Large applies from 1360 px (below that the old layout is kept).
- Topology templates (star, ring, bus, tree, mesh) built from real devices with their own labels and docked lines; every device is editable. The bus template has a shared backbone.

## Design

- Symbol tiles: one label, uniform 72x48 size, no baked-in label in the image.
- Table tile appears only under Shapes, as a 32 px icon in the symbol style.

## Known limits

- Rotated text gets axis-aligned highlight boxes.
- Text background is not drawn for stacked text.
- Special characters such as arrows and maths symbols come from a fallback system font if the chosen font lacks them.
- In Layr versions before 3.10, editing a text box that has partial formatting (`sty`) can leave the formatting at outdated positions.
- Reordering pages (also by drag in the page preview) still drops bookmarks; Layr warns once per move when the document has some.
- Bold, italic, underline and highlight can be set for selected words only (stored per text box as `sty` runs). Older Layr versions ignore the runs and show the whole box without per-run style. Stacked text does not use the runs.
- Old single topology symbols are not editable inside their nodes.
- In Layr versions before 3.10, a duplicated part of a template keeps its group id, so in 3.10 original and copy form one group; use Alt+Click to select a single part.
- Bookmarks (outlines) are lost when pages are rebuilt (pdf-lib has no API for them).
- The text layer is not available in split view and presentation mode.
- With the "Night mode for pages" switch on, the sheet option "White" is shown dark (the switch inverts all pages). A clearer behaviour is planned.

# Earlier: Layr 3.8.8

Release notes for version 3.8.8.

### Fixes

- Dictation button did nothing while a text box was open: the editor was closed by the same click.
- Updates: a failing installer start (blocked or locked file) no longer crashes the app with an error dialog; failures are written to `update-log.txt`; downloads and update checks have timeouts; a page reload during a download no longer deletes it.
- Text boxes stay on the page when moved, resized or typed into; very long words without spaces are broken by characters instead of running off the page (also in table cells and notes).
- Table cell text: wraps and stays inside its row, can be copied (Ctrl+C on a table copies the cell text), the cell editor matches the drawn text and supports selecting with the mouse.
- Laser pointer: much cheaper drawing (no canvas blur) to stop stuttering on laptops.
- Page grid ("Seiten ordnen") with many pages: no more flicker or lost drag, auto-scroll at the edges, dropping outside the dialog ends the drag, Escape during a drag no longer risks deleting a page.
- Extracting pages with "remove from file" can no longer lose pages: the new tab is created and marked unsaved first, the source is shortened afterwards; scans and extracts are never replaced silently by the next opened file.
- Page changes (move, delete, rotate, insert) are serialized, tell you when they were not applied, and keep title, author and dates; whole-document undo steps are capped.
- Choosing colours on the text quick bar works when the text is long.
- Faster theme switch: transitions are only suspended when the theme really changes.
- Update install: while a download runs, a refused terminal install shows the download state instead of doing nothing.
- Update check: a stuck check ends after a timeout.
- Tab moves focus normally again; hiding all bars is now Ctrl+. (changeable in the shortcut list).
- Tab no longer hides the bars (use Ctrl+.). Ctrl+. also works on layouts where "." needs Shift (e.g. AZERTY).
- Page move without flicker.
- Dialog focus handling: Tab stays inside open dialogs (also from text fields); focus returns to the button that opened a dialog, also when it is closed directly.
- Flatpak detection: the Flatpak version, like the Store version, runs without its own update check.

### Removed

- The "clear page" button (it also removed locked objects).
- The measure tool (`G`, "Messen"). Measure lines already in a document stay as they are.
- The separate text select tool (`Y`). Its job is done by the select tool now.

### New

- Copy and paste annotation objects (text boxes, symbols, shapes, arrows) with Ctrl+C / Ctrl+V.
- Copy PDF text with the normal select tool: drag over PDF text (I-beam cursor), Ctrl+C copies; hold Alt to lasso over text; the separate text select tool (`Y`) is gone.
- Line labels: lines and arrows can carry a label (double click); one-click presets for `«include»` and `«extend»`.
- Arrows: several arrows on the same side of a shape are spread apart automatically; fixed anchor points (3 per side) on rectangular shapes.
- Lock objects (right click): a locked object keeps its position and size; optional setting to let clicks pass through locked objects so other symbols can be placed on top.
- Setting: keep or release the selection after placing a new object.
- Tables: handles on all four edges to resize only the outer row or column.
- Sidebar: move pages up and down with buttons or Alt+Up / Alt+Down; the moves are applied as one undo step.
- New UML symbols: node, artifact.
- Text rotation snaps to 15 degree steps (hold Alt for a free angle) and shows the angle while rotating; "Straighten" (double click on the handle or context menu) resets it.
- Outline docking points on all shapes: 12 per round or polygon shape, 3 per side on rectangles.
- Split view: columns line up (same scale and spacing).
- Text quick bar: choose and reorder the buttons and pick a look (Design settings).

- Stroke slider: the value label has a fixed width so the slider no longer jumps under the pointer; arrow keys change the slider value instead of moving the selected object.
- Page thumbnails are no longer clipped in narrow windows; table edges can be resized on every table; switches in dialogs keep their labels in narrow windows; invalid saved design values are reset to defaults.
- Security: Electron 44.9.3 (fixes a known certificate advisory); update and download test switches only work in unpackaged builds; the microphone permission check also verifies the page origin; reserved Windows file names are rejected; only the three newest local crash reports are kept.
- Microsoft Store preparation: a Store build mode switches the self-updater off (updates come through the Store); `docs/STORE.md`, `PRIVACY.md`, listing texts and an unsigned AppX workflow are included. The GitHub version is unchanged.

### Design

- Calmer light and dark themes, flat surfaces without glass, no gradients and no dot grid.
- Compact toolbar; bundled IBM Plex Sans interface font.
- New interface icons (Phosphor Icons, MIT) in toolbar, menus, dialogs and the text bar; the UML/IT symbols on the page are unchanged.
- Icons use the Phosphor bold weight for crisp lines on scaled Windows displays.
- Text quick bar shows the colour at the caret and has a size setting.
- Smaller default text quick bar.
- Sharper symbol tiles on scaled displays; the More button uses three plain dots.
- Buttons, segmented controls, selects and text fields use filled surfaces instead of 1 px outlines; checkboxes and sliders are drawn by the app. Edges stay sharp on scaled Windows displays.
- Redrawn pixel-grid icons for select, ellipse, split view and the More tools button; toolbar and header icons are snapped to whole pixels so lines stay crisp.

### Known limits

- Bar colour 'Accent' with light accent colours (orange, coral, gold, green) has reduced text contrast in some places; the default bar styles are fine.
- Bookmarks (outlines) are still lost when pages are rebuilt (pdf-lib has no API for them).
- Older Layr versions place an arrow end with a fixed anchor (`t1`, ...) at the centre of the shape.
- The text layer is not available in split view and presentation mode.

### Still planned before release

- Free lines and dividers in tables.
