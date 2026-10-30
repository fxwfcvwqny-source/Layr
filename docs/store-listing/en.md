# Microsoft Store: Layr PDF listing (English)

Store product name: **Layr PDF** (the app itself is still called Layr). Store ID `9NKHS6PSNHTC`, https://apps.microsoft.com/detail/9NKHS6PSNHTC. The reserved name must equal `displayName` in `package.json` (`Layr PDF`).

All texts to paste into Partner Center.

## Short description (max. 100 characters)

Annotate, draw, sign and take notes on PDFs. Local, no account needed.

## Description

Layr is a program for PDF files: annotate, draw, highlight, sign, fill in forms and take notes. Everything stays on your device. There is no account, no advertising and no telemetry.

Layr also helps with technical documents: organisation charts and network diagrams from ready-made templates, calculators for subnets and number systems, code blocks with syntax colours and a diagram tool.

Dictation works offline. The first time, Layr asks for your confirmation and then downloads a speech model (about 490 MB) once from github.com and checks it. After that, your speech is recognised only on your device. Audio and text never leave the computer.

Updates come through the Microsoft Store.

Privacy: see PRIVACY.md in the project (linked in the listing).

## Features (max. 20, each max. 200 characters)

1. Offline dictation: speech is turned into text locally, with punctuation. German, English and more languages.
2. Open several PDFs in tabs and switch with Ctrl+Tab.
3. Text, arrows, shapes and pen directly on PDFs, with fonts, lists and text boxes.
4. Pen and highlighter with shape recognition: a held stroke snaps to a line, circle, rectangle or triangle.
5. Insert, resize and move images (PNG, JPG, WebP, GIF, SVG).
6. Tables, code blocks and a symbol library (UML, flowcharts, network symbols) for technical documents.
7. Organisation charts and network diagrams from ready-made templates; connector lines stay attached to the boxes.
8. IT calculators (number systems, data sizes, battery runtime) and subnet calculator for IPv4 and IPv6.
9. Fill in PDF forms and create your own form fields that other PDF programs can fill in.
10. Signatures: draw, type or scan them and keep them on your device.
11. Spell checking in German and English with your own dictionary.
12. Notes and tasks saved inside the PDF. Export to Markdown.
13. Redaction that really removes the content from the file.
14. Text recognition (OCR) for scanned PDFs, completely on your device.
15. Open, save and protect password-protected PDFs.
16. Compare two PDFs: removed text in red, new text in green.
17. Rotate, sort, merge pages and extract them as a new PDF.
18. Print (Ctrl+P), also single pages or a selection, with all annotations, forms and signatures.
19. Presentation mode (F5) with laser pointer, split view and night mode.
20. Your own keyboard shortcuts and toolbar. Recently opened files can be remembered or switched off.

## Search terms (max. 7)

PDF, annotate PDF, sign PDF, notes, dictation, diagram, subnet

## What's new in 3.10.0

• Place templates and symbols by clicking on the sheet; templates are groups that move and scale as a whole.
• Select tool: group (Ctrl+G), align and distribute, smart guides, object bar, z-order, Tab through objects.
• Bold, italic, underline and highlight for selected words only.
• Stretch and crop images.
• Page preview: add pages, drag to reorder, jump to a page by number.
• Merging keeps Layr objects editable.
• New symbols for storage and backup (RAID, NAS, tape, backup server).
• Character autocorrect (→, –, …) and a special character picker.
• New save status indicator, sidebar tips, tables that grow with their text.
• New behaviours that could get in the way can be switched off in Settings.

## What's new (first version)

First version in the Microsoft Store. Updates come through the Store.

## Screenshots

Required: at least 1366 x 768 pixels, PNG or JPG. Recommended: 1920 x 1080. Planned: 6 screenshots. Details: `screenshots/README.md`.

1. Main view with an open PDF and toolbar. Caption: "Annotate, draw and highlight PDFs"
2. Dictation into a text box. Caption: "Dictation: speech is turned into text locally"
3. Organisation chart from a template. Caption: "Organisation charts from ready-made templates"
4. Network diagram with IP addresses. Caption: "Network diagrams with IP addresses"
5. Subnet calculator. Caption: "Calculate subnets and place the result on the page"
6. Fill in a form and place a signature. Caption: "Fill in forms and sign"

## Age rating (IARC questionnaire)

Category: Productivity / Utilities. Expected rating: PEGI 3, USK 0.

- Violence, sexuality, language, drugs, gambling: no
- Users can interact or exchange content with each other: no
- Location is used: no
- In-app purchases: no
- Access to the open internet (browser, search): no. Layr has no browser. It only downloads two fixed files, and only after the user confirms.
- Personal data is collected: no

## Notes for certification

- No account or login needed.
- Test steps: File > Open, then pick any PDF. Auto-save is on by default and saves changes to the opened file (switch it off in the header); the original content stays embedded in the PDF.
- Dictation: Ctrl+Shift+D or the microphone button. The first time, Layr asks whether to download the speech model (about 490 MB, github.com/k2-fsa/sherpa-onnx). The download is checked with a checksum. Then allow microphone access. Recognition runs locally.
- Text recognition (OCR) runs offline and needs no download.
- The Store version has no in-app update check. Updates come through the Store.
- No network access except the two downloads above and, when you use the German spell checker, a one-time dictionary download (about 1 MB, registry.npmjs.org).

## runFullTrust justification

Electron desktop app (Win32) that reads and writes user-chosen PDF files, runs a local speech-recognition helper process and extracts the speech model with the built-in Windows tar.exe.

## Licence

Layr is free software under the GNU General Public License v3.0 or later (GPL-3.0-or-later). Source code and licence: https://github.com/fxwfcvwqny-source/Layr/blob/main/LICENSE
