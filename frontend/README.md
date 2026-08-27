# Prelegal frontend

A Next.js app that turns a short form into a complete, signable
[Common Paper Mutual NDA](https://commonpaper.com/standards/mutual-nda/1.0).

You fill in the cover page details, the agreement renders live beside the form,
and you download it as Markdown or PDF.

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

The app reads its templates from the repository's `templates/` directory, so it
has to run from inside the Prelegal checkout rather than on its own.

| Command         | What it does                       |
| --------------- | ---------------------------------- |
| `npm run dev`   | Development server on port 3000    |
| `npm run build` | Production build                   |
| `npm start`     | Serve the production build         |
| `npm run lint`  | ESLint                             |

## How the document is put together

The finished agreement is one Markdown string, rendered from two halves that are
treated very differently.

**The Standard Terms are reproduced verbatim.** They are the published Version
1.0 text, and changing their wording would change the agreement. The only
transformation is turning each `coverpage_link` span in the source template into
a Markdown link.

**The cover page is composed from your answers.** A filled cover page is a
different artifact from the blank one: it carries no bracketed instructions, no
`<label>` hints, and only the option each party actually chose.

### Defined terms stay names, not values

The Standard Terms refer back to the cover page by *name* — "solely for the
Purpose", never "solely for the Evaluating whether to enter into a business
relationship…". Substituting the value inline would produce broken prose, so
each reference stays a defined term and links to the cover-page heading that
defines it.

In the preview those references are interactive: hover one to see the value you
set, click it to jump to the field that controls it. It is the same wiring the
document itself relies on, made visible.

## Downloads

**Markdown** writes the same string the preview renders, so the two can never
drift.

**PDF** goes through the browser's print dialog with a print stylesheet that
reduces the page to the document alone. Choosing "Save as PDF" there produces
real, selectable, properly paginated text — a canvas-based exporter would bake
the agreement into a bitmap instead.

## Layout

```
app/
  page.tsx              Server component; reads the template, renders the creator
  layout.tsx            Fonts and metadata
  globals.css           Design tokens, document styles, print rules
components/
  NdaCreator.tsx        Client shell — holds field state, wires form to preview
  NdaForm.tsx           The cover-page form
  DocumentPreview.tsx   Markdown render, with live defined terms
  DownloadBar.tsx       Markdown and PDF actions
lib/nda/
  schema.ts             Field types, defaults, validation, defined-term table
  render.ts             Merges fields and standard terms into the document
  templates.ts          Server-only reader for ../templates
```

## Licensing

The templates under `templates/` come from
[Common Paper](https://github.com/CommonPaper) and are used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Generated documents
keep that attribution in their footer.
