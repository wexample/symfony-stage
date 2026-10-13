# Document editor shell — "Google Slides" layout (pages on the side, document in the centre)

Opened: 2026-10-09
Updated: 2026-10-09
Author: agent:archeology-drawers

## Read this first — status of this todo

> **This is a proposal for discussion, not an order to code.** It comes from the 2026-10 "bottom of the drawers" archaeology pass. Read it, then discuss it with the owner: every design choice below is to be challenged and validated **before** any code is written. Do not start implementing on your own.
>
> - **Before anything else**: `/home/weeger/Desktop/WIP/WEB/WEXAMPLE/PACKAGES/PHP/.wex/local/package-agent-intro.md` — where you stand in the suite, what a package must look like, how to work, and how to judge a drawer todo.
> - Context: `/home/weeger/Desktop/WIP/WEB/WEXAMPLE/NETWORK/local/network/.wex/knowledge/readme/archeology/index.md.j2`, `sources.md.j2`, and the drawers page linked below.
> - Safety: `NETWORK/local/network` runs on production data — read its code only, never run anything against it. Anonymize anything taken from it. Never copy secrets found in its history.

Drawers page: `/home/weeger/Desktop/WIP/WEB/WEXAMPLE/NETWORK/local/network/.wex/knowledge/readme/archeology/drawers-screens.md.j2`, section 1 (and section 2 for the older master–detail variant).

## What it is

In May 2022 the owner started, in network, an editor laid out like Google Slides: a scrolling strip of page thumbnails on the left (A4 portrait, soft shadow, selected one outlined 6px blue `#5d9cec`), a toolbar on top, a black stage in the centre where the current page was meant to be drawn, a properties panel on the right, a footer under the stage. The document is a JSON list of pages, each with absolutely positioned fields (`{ pages: [ { id, fields: [ { type: 'input', top, left, width, height } ] } ] }`), meant to be laid over PDF pages (membership forms, documents to sign). Only the layout, thumbnails, page selection and an "open" tool button that logs to the console were written; the stage never drew anything.

## Where the sources are

All read-only.

- Branch checkout: `/home/weeger/Desktop/WIP/WEB/WEXAMPLE/NETWORK/archeo/trees/develop-pdf-editor/project/front/pages/pdf/` (`editor.html.twig`, `vue/editor/{editor,page}.{vue,vue.twig,scss}`, `vue/editor/tool/{tool,open}.*`) and `…/project/src/Controller/PdfEditorController.php`, `…/project/src/Wex/BaseBundle/Resources/css/partials/_container.scss`.
- Identical copy after merge: `/home/weeger/Desktop/WIP/WEB/WEXAMPLE/NETWORK/archeo/trees/develop-131-fos-user/front/pages/pdf/`.
- History (in `/home/weeger/Desktop/WIP/WEB/WEXAMPLE/NETWORK/archeo/repo.git`): `git show 6a7d91b52` (Create editor layout), `git show c117e1174` (Editor buttons), `git show 81dc8d9f9` (Pages display), `git show 132210ace` (Page select).
- Older master–detail precedent (16rem search column + detail pane, 2019): `git show 11368b879:project/templates/pages/admin/user/list.html.twig`, `git show 2d3f9eb73:project/assets/css/partials/_content_side_nav.scss`.
- Related context: GitLab issues `/home/weeger/Desktop/WIP/WEB/WEXAMPLE/NETWORK/archeo/gitlab/issues/006.md` (membership form PDF), `090.md` (online signature of documents).

## What to recover

Not code — the **layout and interaction contract**:

1. Five regions: page rail (left, ~16rem, vertical scroll, 2rem padding, 3rem gaps), toolbar (top), stage (centre, dark), properties (right, ~16rem), footer (under the stage). Full viewport, each region scrolls on its own.
2. Thumbnails keep the page ratio (A4 portrait = 29.7/21) and show which one is current; clicking selects; the first page is selected on open.
3. A document model = ordered pages, each with positioned fields (type + box). Units must be decided (the sample's 10/10/20/5 reads as percentages of the page).
4. One component per tool, all sharing a base (name label, click handler).

## Proposed modern shape (suggestion)

- `symfony-stage` already gives the centre surface: elements `{ id, x, y, width, height }` with selection, drag, keyboard nudge, marquee, undo/redo (`assets/components/stage/stage.vue`, `assets/js/Class/StageHistory.ts`, `assets/js/Helper/StageGeometry.ts`). A page of the document = one stage whose elements are the fields, with the page (a PDF page image or any background) drawn as a region or under the world.
- Add a **shell component** around it, e.g. `stage-editor` (name to discuss): slots `pages` (rail), `toolbar`, `properties`, `footer`, default slot = the stage. Thumbnails rendered from the same model at small scale (the stage in read-only mode, or a lighter preview).
- `v-model:pages` on the shell, `v-model:elements` per page on the stage, `selectedPageId`, events `select-page`, `add-page`, `remove-page`, `reorder-pages` (drag in the rail — new, not in the 2022 code).
- The properties panel edits the selected element(s) (type, box, label, signer…), fed by the stage's `update:selection`.
- First consumer to discuss: `symfony-signature` (place signature / initials / date / text fields per signer on each page of an `EnvelopeDocument`), or a form-filling overlay for membership PDFs. PDF page rasterisation would come from the PDF service (`SERVICES/local/pdf-factory`), not PHP.
- Alternative home if the owner prefers: the shell as a generic `symfony-design-system` layout (it is not stage-specific: the 2019 master–detail list used the same side column idea).

## Open questions

- Is the target use field placement for signatures, filling PDF forms, or a real slide/document editor (text, images)?
- Shell in `symfony-stage` or in `symfony-design-system` (layout) with the stage as one possible centre?
- Units of the field boxes: page percentages, PDF points, or stage pixels at a reference scale?
- Do thumbnails need to be live (re-render on each change) or snapshots?
- Should the rail support drag-to-reorder, add/duplicate/delete page (as Slides does)?
