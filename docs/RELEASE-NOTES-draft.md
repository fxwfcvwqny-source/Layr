# Layr 3.10.0

Release notes for version 3.10.0.

## Highlights

- Templates and symbols are placed by clicking on the sheet; templates are groups that move and scale as a whole.
- Select tool: group/ungroup, align and distribute, smart guides, object mini bar, z-order, Tab through objects.
- Bold, italic, underline and highlight for selected words only.
- Images: free stretch with the side handles, non-destructive crop.
- Page sidebar: add pages, drag to reorder, jump to a page by number.
- Merging PDFs keeps Layr objects editable.
- New symbol group "Storage & backup" (RAID, NAS, tape, backup server and more).
- Character autocorrect and a special character picker; new save status indicator.

## New

### Templates and symbols
- Click-to-place: choose a template, then click on the sheet (drag sizes it). A ghost preview follows the pointer; Esc or right-click cancels, Shift keeps it armed.
- Templates are groups (`gid`): a click selects the whole template, move, scale and copy keep it together. Alt+click or double-click selects one part.
- Include/extend buttons without a selected line arm the arrow tool with a dashed open-arrow preset and label.
- Symbol group "Storage & backup": RAID 0/1/5/6/10, NAS, backup server, tape, cloud backup, snapshot, replication, external disk, SAN switch.
- RAID symbols show the level as an editable label inside the symbol (double-click).
- Symbol group "Math & logic": ≥ ≤ ≠ ≈ ± × ÷ → ⇒ ∞ √ ∑.

### Select tool
- Shift+click adds a whole group to the selection; a label at the selection shows "N Objekte gewählt" (also announced to screen readers).
- Ctrl+G groups the selection (`gg`), Ctrl+Shift+G ungroups; also in the context menu.
- Align and distribute treat templates and user groups as one unit.
- Smart guides while moving and while resizing corners, with snapping to the 36 pt page margins; Alt switches them off briefly.
- Object mini bar above the selection: duplicate, delete, lock, colour, order, align. F6 moves focus to it, Esc leaves.
- Alt on a corner handle resizes from the centre.
- Z-order: Ctrl+] / Ctrl+[ one step, Ctrl+Shift+] / Ctrl+Shift+[ to front/back; layout-independent alternatives Ctrl+Shift+Up/Down and Ctrl+Alt+Shift+Up/Down. Groups move as a block.
- Tab / Shift+Tab step through the objects of the page (reading order, groups as one stop, announced to screen readers); Esc leaves.
- Double-click edits an object in every placement and shape tool.

### Text
- Partial formatting: bold, italic, underline and highlight for the selected characters (`sty` runs), with a mixed state in the toggles; undo/redo restores it.
- Sidebar text section: bold, italic, underline and background toggles that show their state, can be switched off and apply to the selection. New text boxes inherit italic and background.
- Character autocorrect: `->` to arrow, `<-`, `<->`, `=>`, `--` to en dash, `...`, (c), (r), (tm), `+-`, `!=`. Backspace or Ctrl+Z right after undoes it. Only at word boundaries; not in options, operators, URLs and enumerations.
- Special character picker: Ctrl+Shift+K or the quick bar button (remappable in the shortcut list).
- Table rows grow downward when a cell text needs more lines; the table stays inside the page.
- Ruler rotates around its centre; angle field in the panel; Shift snaps to 15 degrees.

### Images
- Side handles stretch one dimension (free, non-proportional); double-click on a handle resets the aspect ratio.
- Crop mode (button, double-click, Shift+C) with non-destructive crop fractions; Tab selects the edge, arrows move it (Shift: 10 pt); the size is shown in mm.

### Pages and navigation
- Page sidebar: add pages with + and with insert strips between thumbnails, drag to reorder, lazy thumbnails.
- Page selector "Seite 3 / 12": type a number and press Enter. Floating, in the preview, or off. Ctrl+Alt+G focuses it.
- Merge keeps Layr objects editable (embedded originals are used), joins notes and to-dos, and keeps filled form values.

### Settings and design
- Save status indicator next to the file name: icon or text variant; unsaved is red; error state.
- Sidebar tips: a floating hint beside the panel while a control is focused or hovered.
- Numbers in the interface (page, zoom, value labels, counters) use the interface font with tabular figures; code, keys and tables keep the mono font.
- Transparent Layr icon for the window, taskbar and exe, with hand-tuned 16 and 24 px variants. The installer and the Store keep the black tile.

### Accessibility
- Live-region announcements for selection count, Tab stops, crop edges and armed templates.
- Pressed state on armed template tiles; all new switches are keyboard accessible and work in light, dark and forced-colors.

## Fixes

- Sheet no longer shifts sideways while typing (scrollbar gutter reserved).
- Lost pointer events (window focus, tablet) no longer leave stale drags or missing ink layers.
- Long notes and to-dos are no longer cut off when read back from the PDF (notes up to 5 million characters; 5000 to-dos like in 3.9.0, each up to 20000 characters).
- Merge: text boxes and other Layr objects stay editable; falls back to the saved pages when the embedded original cannot be loaded or has a different page count.
- Tables grow with their content instead of clipping, and refit after font size and column changes.
- Local recovery key includes a content fingerprint, so two different files with the same name and size cannot restore each other's annotations. Old data is adopted and the old key is removed.
- Double-click that follows a saved edit no longer undoes it; dblclick undo works with a capped history.
- Typing during the short wait of the text tool opens the box and keeps the character.
- Pen strokes are not mistaken for double-clicks.
- Armed template and include preset are cancelled on tab open/switch/close and ignore Esc while a dialog or draft is open.

## Settings added

| Setting (de) | Default | Where |
|---|---|---|
| Doppelklick bearbeitet in allen Werkzeugen | on | Settings menu |
| Objektleiste am gewählten Objekt | on | Settings menu |
| Tab wechselt zwischen Objekten | on | Settings menu |
| Autokorrektur für Zeichen (→, –, …) | on (Zeichen ersetzen) | Schreiben & Rechtschreibung |
| Speicheranzeige (Symbol / Text) | Symbol | Design |
| Seitenwahl (Unten schwebend / In der Seitenvorschau / Aus) | Unten schwebend | Design |
| Tipps in der Seitenleiste | on | Design |

## Changes of behaviour

- Templates are placed by clicking on the sheet, not in the page centre; this is always on (no switch).
- Double-click edits an object in every tool, not only in the select tool.
- Tab cycles through the objects of the page; Esc returns to normal Tab navigation.
- The page-move arrows at the thumbnails are gone (drag, Alt+Up/Down or the context menu still work).
- Text-box background and italic are stored per run when set for selected words only.
- Interface numbers use a new font (IBM Plex Sans, tabular figures).
- The save status indicator looks different (icon by default, red when unsaved).
- Autocorrect replaces typed character sequences; undo with Backspace or Ctrl+Z.
- Clicking a template part selects the whole template (Alt+click: one part); always on.
- Images always have side handles; tables always grow with their text.
- Header menus File, View and Settings are grouped under section headings, capped in height (they scroll) and every entry has its own icon.
- Removed from the drafts: the topology templates and the "editable topology nodes" setting (the topology tiles place the old single symbols again).
- Guides (existing switch, default on) now also work while resizing corners and snap to the 36 pt margins; the switch is now also in the Settings menu.

## Known limits

- Rotated text gets axis-aligned highlight boxes.
- Text background is not drawn for stacked text; stacked text does not use the per-word runs.
- Special characters such as arrows and maths symbols come from a fallback system font if the chosen font lacks them.
- Cropping only hides the rest of an image; the whole image stays in the saved file (use Redact to remove content for good).
- Bookmarks (outlines) are lost when pages are rebuilt or reordered (pdf-lib has no API for them); Layr warns once per move when the document has some.
- The text layer is not available in split view and presentation mode.
- Alt+click / Alt+drag may be taken by the window manager on some Linux desktops (KDE, Xfce); the same actions are available without Alt where possible.
- With the "Night mode for pages" switch on, the sheet option "White" is shown dark.
- Under Wayland/GNOME the window icon comes from the .desktop file and stays black.
- New symbols (group "Storage & backup") are unknown to older versions: they are not shown there and are removed when the file is saved again in an older version.
- Older versions keep at most 5000 to-dos.
- Local recovery data from 3.9.0 has no content fingerprint: if two files with the same name and size were edited unsaved, the file opened first takes it over.
- Ctrl+Alt+Shift+Up/Down may be taken by the window manager on some Linux desktops.

## Also since 3.9.0: notes for users of older versions

- Files saved by 3.10 open in older versions, but new fields are ignored there:
  - Partial formatting (`sty`): the whole box is shown without per-word style; editing such a box in an older version can leave formatting at outdated positions.
  - Crop (`crop`): the crop is ignored and the full image is squeezed into the cropped box (distorted).
  - User groups (`gg`): ignored but kept. A part duplicated in an older version keeps its group id, so in 3.10 original and copy form one group; use Alt+click to select a single part.
- Old documents open unchanged in 3.10. Local recovery data from 3.9.0 is adopted on first access.
- Flathub is not pursued; the Flatpak files point at v3.9.0.

# Earlier: Layr 3.9.0

Release notes for version 3.9.0.

### Fixes

- Text selection: the text layer has an `endOfContent` element kept behind the selection anchor, so dragging across pages no longer selects the whole next page.
- The toolbox "More" button no longer looks permanently active; its `aria-expanded` state is reset when the menu closes or another menu opens.
- Floating toolbar: left placement now works.
- Quick bar: buttons missing from an older saved design are inserted at their default position instead of after Delete.
- Double-click on a device box or its caption edits the device instead of a docked line crossing it (limited to docked lines).
- Dark symbols stay visible in forced-colors mode.
- Symbol tile images shrink with narrow tiles.
- Test suite: smoke test flake fixed (isolated profile, stale `dense.pdf` objects), geometric check for dense-page drag selection, toolbar position checks.
- Sheet colour "Night" is no longer inverted twice when the "Night mode for pages" switch is on.

### New

- Text selection bar: appears on selected PDF text with Copy and Highlight; one click on a colour swatch (or confirming a custom colour) highlights the selection at once in that colour, and the Highlight button reuses the last colour.
- Text quick bar: italic (Ctrl+I) and text background colour.
- Fixed toolbar is centred over the sheet from 1200 px window width; density Large applies from 1360 px (below that the old layout is kept).

### Design

- Symbol tiles: one label, uniform 72x48 size, no baked-in label in the image.
- Table tile appears only under Shapes, as a 32 px icon in the symbol style.

### Known limits

- Rotated text gets axis-aligned highlight boxes.
- Text background is not drawn for stacked text.
- Special characters such as arrows and maths symbols come from a fallback system font if the chosen font lacks them.
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
