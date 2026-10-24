# Layr 3.8.5 (draft release notes)

Work in progress on branch `fix/mic-and-updater`. This file is updated while the work goes on and is meant to become the release notes.

## Fixes

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

## Removed

- The "clear page" button (it also removed locked objects).
- The measure tool (`G`, "Messen"). Measure lines already in a document stay as they are.
- The separate text select tool (`Y`). Its job is done by the select tool now.

## New

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

- Security: Electron 44.9.3 (fixes a known certificate advisory); update and download test switches only work in unpackaged builds; the microphone permission check also verifies the page origin; reserved Windows file names are rejected; only the three newest local crash reports are kept.
- Microsoft Store preparation: a Store build mode switches the self-updater off (updates come through the Store); `docs/STORE.md`, `PRIVACY.md`, listing texts and an unsigned AppX workflow are included. The GitHub version is unchanged.

## Design

- Calmer light and dark themes, flat surfaces without glass, no gradients and no dot grid.
- Compact toolbar; bundled IBM Plex Sans interface font.
- New interface icons (Phosphor Icons, MIT) in toolbar, menus, dialogs and the text bar; the UML/IT symbols on the page are unchanged.
- Icons use the Phosphor bold weight for crisp lines on scaled Windows displays.
- Text quick bar shows the colour at the caret and has a size setting.
- Smaller default text quick bar.
- Sharper symbol tiles on scaled displays; the More button uses three plain dots.
- Buttons, segmented controls, selects and text fields use filled surfaces instead of 1 px outlines; checkboxes and sliders are drawn by the app. Edges stay sharp on scaled Windows displays.
- Redrawn pixel-grid icons for select, ellipse, split view and the More tools button; toolbar and header icons are snapped to whole pixels so lines stay crisp.

## Known limits

- Bookmarks (outlines) are still lost when pages are rebuilt (pdf-lib has no API for them).
- Older Layr versions place an arrow end with a fixed anchor (`t1`, ...) at the centre of the shape.
- The text layer is not available in split view and presentation mode.

## Still planned before release

- Free lines and dividers in tables.
