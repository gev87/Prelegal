# Prelegal frontend

A Next.js app that turns a short form into a complete, signable
[Common Paper Mutual NDA](https://commonpaper.com/standards/mutual-nda/1.0).

You fill in the cover page details, the agreement renders live beside the form,
and you download it as Markdown or PDF. There is also a login screen, which is
deliberately not a gate — see [Signing in](#signing-in).

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. Start the backend too if you want the login
screen to work — see [`backend/README.md`](../backend/README.md).

The app reads its templates from the repository's `templates/` directory, so it
has to run from inside the Prelegal checkout rather than on its own.

| Command         | What it does                       |
| --------------- | ---------------------------------- |
| `npm run dev`   | Development server on port 3000    |
| `npm run build` | Static export, into `out/`         |
| `npm run lint`  | ESLint                             |
| `npm run verify`| Typecheck, lint, test, build       |

## It builds to files, not a server

`npm run build` writes plain HTML, CSS and JavaScript to `out/`, which the
FastAPI backend serves. One process answers both the pages and the API, so the
browser calls `/api/...` with a relative path and no CORS is involved.

Three consequences worth knowing before changing anything here.

**The Standard Terms are baked in at build time.** `lib/nda/templates.ts` reads
them while the export is being produced, not while it is being served — so the
running container needs no `templates/` directory, and correcting a template
means rebuilding the image rather than restarting it.

**The effective date cannot be.** An exported page is rendered once and served
unchanged forever, so a date computed during the build would be the build's
date for every visitor afterwards. `app/nda-entry.tsx` withholds the creator
until the browser has supplied the real one. That also makes the date correct
in a way it never quite was before: it is the visitor's own calendar date now,
not the server's.

**`trailingSlash` is required, not cosmetic.** Without it the export writes
`out/login.html`, and a request for `/login` matches no file — the backend
answers with the 404 page instead of the login screen.

## Signing in

`/login` signs up and signs in against the backend for real, and shows the
errors it actually returns. It gates nothing: no session is issued, no route
checks for one, and "Continue without an account" goes straight to the
creator. The accounts it makes live in a database that is wiped on every
restart.

It is the one screen on the Prelegal brand palette — navy, purple and blue,
defined at the bottom of `globals.css`. The creator keeps its own dark
drafting chrome; the two sets of tokens do not overlap.

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
  page.tsx              Server component; reads the template at build time
  nda-entry.tsx         Withholds the creator until the browser supplies today
  login/page.tsx        The login screen — real calls, no gate
  layout.tsx            Fonts and metadata
  globals.css           Design tokens, document styles, print rules, login
components/
  NdaCreator.tsx        Client shell — holds field state, wires form to preview
  NdaForm.tsx           The cover-page form
  DocumentPreview.tsx   Markdown render, with live defined terms
  DownloadBar.tsx       Markdown and PDF actions
lib/
  api.ts                Where the API lives, in dev and in the container
  date.ts               Today, in the visitor's own calendar
  nda/
    schema.ts           Field types, defaults, validation, defined-term table
    render.ts           Merges fields and standard terms into the document
    templates.ts        Server-only reader for ../templates
test/
  unit/                 Schema, renderer, template reader, dates, API URLs
  components/           Form, preview and creator under jsdom
  app/                  The login screen and the date wrapper
  fixtures/             Shared field builders and a miniature template
docs/
  manual-test-plan.md   What the automated suite cannot reach
```

## Testing

```bash
npm test              # the whole suite, once
npm run test:watch    # re-run on change
npm run test:coverage # with a coverage report
npm run verify        # typecheck, lint, test, build
```

Vitest under jsdom. The suite leans on the layer where a mistake is most
expensive: `lib/nda/` produces the words of a signed agreement, so it is
covered exhaustively, including a snapshot of the whole rendered document and
a check that every cross-reference in `templates/mutual-nda.md` still matches a
term the cover page defines — the drift that would otherwise silently turn a
defined term into plain text.

Three things the suite deliberately does not cover, because a browser has to
do them: the print stylesheet's real output, what the OS does with a download,
and layout below 900px. Those live in `docs/manual-test-plan.md`.

## Licensing

The templates under `templates/` come from
[Common Paper](https://github.com/CommonPaper) and are used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Generated documents
keep that attribution in their footer.
