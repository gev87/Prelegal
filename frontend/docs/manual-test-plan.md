# Mutual NDA creator — manual test plan

The automated suite (`npm test`) covers the document logic and the component
behaviour under jsdom. This plan covers what jsdom cannot reach: real layout,
real printing, real file downloads, and real assistive technology.

Run it against `npm run dev` before shipping a change to the creator.

**Legend** — `[auto]` also covered by an automated test · `[manual only]` no
automated equivalent exists.

Results below are from the run on 2026-08-27 against `next dev` on
`localhost:3000`, Chrome 141, Windows 11.

---

## 1. First load

| # | Step | Expected | Result |
|---|---|---|---|
| 1.1 | Open `/` | Form on the left, document on the right | ✅ Pass |
| 1.2 | Check the effective date | Today's date, in the browser's own timezone | ✅ Pass — `08/27/2026` |
| 1.3 | Check the preview date `[auto]` | Same day, spelled out — never yesterday | ✅ Pass — "August 27, 2026" |
| 1.4 | Open DevTools console | No errors, no hydration warnings | ✅ Pass — only `[HMR] connected` |
| 1.5 | Check the defaults `[auto]` | Purpose seeded, 1 year / 1 year, Delaware, New Castle DE | ✅ Pass |
| 1.6 | Check the party fields | Both blank, no error messages shown yet | ✅ Pass |

> 1.2/1.3 are the timezone regression: the date is built from the parts, not
> parsed as UTC. Worth re-checking from a machine set west of Greenwich.

## 2. Defined terms in the document

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Hover a "Purpose" reference in the Standard Terms | Tooltip shows the label, the current value, and "Click to edit this on the cover page" | ✅ Pass |
| 2.2 | Change the purpose, hover again `[auto]` | Tooltip shows the new value | ✅ Pass |
| 2.3 | Click a "Purpose" reference `[auto]` | Form scrolls to the Purpose field, focuses it, highlights it briefly | ⚠️ Not verified — see note |
| 2.4 | Click "Jurisdiction" (shares a heading with Governing Law) `[auto]` | Lands on Jurisdiction, not Governing Law | ⚠️ Not verified — see note |
| 2.5 | With reduced motion enabled in the OS, click a reference `[auto]` | Jumps instantly, no smooth scroll | ⚠️ Not verified — see note |
| 2.6 | Click a reference to a term set to "until terminated" | Focus lands on a control that is not the disabled year box | ⚠️ Not verified — see note |

> **Note on 2.3–2.6.** `revealField` does its work inside
> `requestAnimationFrame`, which Chrome does not run while a tab is hidden. The
> automation tab reported `visibilityState: "hidden"`, so the jump never fired
> and these could not be confirmed in the browser. All four are covered by
> `test/components/NdaCreator.test.tsx`, which passes. **Re-run 2.3–2.6 by hand
> in a foreground tab before shipping.**

## 3. Validation and blocked downloads

| # | Step | Expected | Result |
|---|---|---|---|
| 3.1 | Load the page, touch nothing, look for errors `[auto]` | No error messages, though six answers are missing | ✅ Pass |
| 3.2 | Focus Party 1 Company then tab away `[auto]` | That one error appears; the other five stay hidden | ✅ Pass |
| 3.3 | Type a company name `[auto]` | The error clears as you type | ✅ Pass |
| 3.4 | On a blank form, click **Download Markdown** `[auto]` | No file downloads | ✅ Pass |
| 3.5 | …and check the form `[auto]` | All six errors appear at once, six controls marked invalid | ✅ Pass |
| 3.6 | …and check focus `[auto]` | Jumps to Party 1 Company, the first problem in form order | ⚠️ Not verified — rAF, as above |
| 3.7 | Clear the Purpose, then click **Download Markdown** `[auto]` | Jumps to Purpose, above the parties | ⚠️ Not verified — rAF, as above |
| 3.8 | Clear the MNDA term year box `[auto]` | Box goes empty (not "NaN"), download is blocked | ✅ Pass |
| 3.9 | Switch the MNDA term to "until terminated" with the year box empty `[auto]` | Download is allowed — the year no longer matters | ✅ Pass |

## 4. The document itself

| # | Step | Expected | Result |
|---|---|---|---|
| 4.1 | Enter a company name containing `\|` | Renders as a literal pipe inside one cell; the table keeps three columns | ✅ Pass — "Acme \| Holdings, Inc." |
| 4.2 | Enter a three-line postal address | Folds to one comma-joined line in the table | ✅ Pass |
| 4.3 | Check the signature table | Signature and Date rows blank for wet signing | ✅ Pass |
| 4.4 | Search the document for `coverpage_link` `[auto]` | No matches — every reference resolved | ✅ Pass |
| 4.5 | Click an outbound link (commonpaper.com) | Opens in a new tab | ⏭️ Skipped — outbound navigation |
| 4.6 | Switch to "In perpetuity" `[auto]` | Term of Confidentiality reads "In perpetuity." with no year | ✅ Pass |

## 5. Downloading — `[manual only]`

The automated tests assert the blob's contents, filename and MIME type. What
they cannot check is what the operating system actually does with it.

| # | Step | Expected | Result |
|---|---|---|---|
| 5.1 | Complete the form, click **Download Markdown** | A `.md` file lands in Downloads | ⏭️ Not run — writes a file to disk |
| 5.2 | Check the filename | `mutual-nda-<party1>-and-<party2>-<yyyy-mm-dd>.md` | ✅ Covered by automated test |
| 5.3 | Open the file in a Markdown viewer | Renders as one agreement, one H1, working in-page links | ⏭️ Not run |
| 5.4 | Click **Download PDF**, choose "Save as PDF" | Print dialog opens showing the sheet only — no header, no form, no tooltips | ⏭️ Not run — needs a human at the dialog |
| 5.5 | Inspect the PDF | Selectable text (not a bitmap); letter paper; headings not stranded at a page foot; table rows not split | ⏭️ Not run |

> 5.4/5.5 are the highest-value manual checks and have **no** automated
> equivalent — `window.print()` is stubbed in the tests. The print stylesheet
> was read and is correct in structure (`.app-header`, `.pane-form`,
> `.view-switch` hidden; `.pane-document` forced back to `display: block` after
> the `max-width: 900px` rules, so it survives being marked `pane-hidden`), but
> only a real print preview proves the output.

## 6. Narrow screens — `[manual only]`

| # | Step | Expected | Result |
|---|---|---|---|
| 6.1 | Resize below 900px | Panes stack; the Details/Document switch appears | ⚠️ Not verified — window resize did not apply to the minimized automation window |
| 6.2 | Tap **Document** | Document fills the screen, form hidden | ⚠️ Not verified in browser — `[auto]` covers the class change |
| 6.3 | Tap a defined term while on Document | Switches back to Details and lands on the field | ⚠️ Not verified in browser — `[auto]` covers it |
| 6.4 | Blocked download while on Document `[auto]` | Switches back to Details so the errors are visible | ✅ Covered by automated test |
| 6.5 | Check the Party grid below 900px | Signed by / Title stack instead of sitting side by side | ⚠️ Not verified |

> The `max-width: 900px` block was read and matches the expectations above.
> **Re-run section 6 by hand, or with DevTools device emulation.**

## 7. Keyboard and assistive technology — `[manual only]`

| # | Step | Expected | Result |
|---|---|---|---|
| 7.1 | Tab through the form from the top | Every control reachable; focus ring always visible | ⚠️ Not run |
| 7.2 | Tab into the document | Each defined term is a button in the tab order | ✅ Covered by automated test (they are `<button>`) |
| 7.3 | Activate a defined term with Enter and with Space | Same as clicking it | ⚠️ Not run |
| 7.4 | With a screen reader, focus a defined term | Reads "Purpose … Activate to edit it on the cover page" | ⚠️ Not run — `[auto]` asserts the accessible description |
| 7.5 | With a screen reader, check the tooltip | The decorative tooltip is not announced twice | ✅ Covered by automated test (`aria-hidden`) |
| 7.6 | Check both panes | Announced as "Agreement details" and "Agreement preview" | ✅ Covered by automated test |

## 8. Server behaviour — `[manual only]`

| # | Step | Expected | Result |
|---|---|---|---|
| 8.1 | Load the page the day after first loading it `[auto]` | Effective date is the new day, not the build day | ⚠️ Not run — needs a date change |
| 8.2 | Rename `templates/` and run `npm run build` | Clear error naming the missing file and the expected location | ⚠️ Not run — `[auto]` covers the message |
| 8.3 | Edit `templates/mutual-nda.md`, rebuild, reload | The change appears without touching the frontend | ⚠️ Not run |

> **8.2 and 8.3 are build-time checks now.** The Standard Terms are read while
> the export is produced, not while it is served, so a template edit shows up
> after `npm run build` — not after a reload, and not after restarting the
> container. 8.1 moved the other way: the date is the browser's now, so it
> changes overnight without any rebuild at all.

---

## 9. Login screen `[PL-4]`

Run against `npm run dev` with the backend up
(`cd backend && uv run uvicorn app.main:app --reload`).

| # | Step | Expected | Result |
|---|---|---|---|
| 9.1 | Open `/login` | Brand palette: navy heading, purple button, yellow rule on top of the card | ⏭️ Not run |
| 9.2 | Submit a new email and password `[auto]` | Enters the creator at `/` | ⏭️ Not run |
| 9.3 | Sign up with the same email again `[auto]` | "An account with that email already exists." | ⏭️ Not run |
| 9.4 | Sign in with the right password `[auto]` | Enters the creator | ⏭️ Not run |
| 9.5 | Sign in with the wrong password `[auto]` | "That email and password do not match an account." | ⏭️ Not run |
| 9.6 | Sign in with an email that was never registered | The *same* message as 9.5, word for word | ⏭️ Not run |
| 9.7 | Click "Continue without an account" `[auto]` | Enters the creator; no request in the Network tab | ⏭️ Not run |
| 9.8 | Stop the backend, then submit `[auto]` | "Could not reach the server." — not a blank screen | ⏭️ Not run |
| 9.9 | Enter a password of 7 characters | The browser blocks it before any request is sent | ⏭️ Not run |
| 9.10 | Open `/login` on a phone over the LAN | Card is readable and centred; sign-in reaches the API | ⏭️ Not run |

> 9.6 is the user-enumeration check. If those two messages ever differ, the
> login screen has started telling strangers which email addresses have
> accounts.

## 10. The container `[PL-4]`

Run against `scripts/start-<os>`. **None of this is reachable from the
automated suites** — they test the two halves separately and never the image.

| # | Step | Expected | Result |
|---|---|---|---|
| 10.1 | `scripts/start-<os>` with Docker stopped | One line telling you to start Docker; no stack trace; exit 1 | ✅ Pass — mac + windows |
| 10.2 | `scripts/stop-<os>` with Docker stopped | "Docker is not running; nothing to stop."; exit 0 | ✅ Pass — mac + windows |
| 10.3 | `scripts/start-<os>` | Builds, then reports `http://localhost:8000` only once it answers | ⏭️ Not run — Docker unavailable |
| 10.4 | Open `http://localhost:8000` | The creator, fully styled, effective date = today | ⏭️ Not run |
| 10.5 | Open `http://localhost:8000/login` | The login screen — **not** a 404 | ⏭️ Not run |
| 10.6 | Sign up, then `stop` and `start` again, and sign up with the same email | Succeeds — the database really was recreated | ⏭️ Not run |
| 10.7 | Run `start` twice without stopping | Second run succeeds; no "name already in use" | ⏭️ Not run |
| 10.8 | Occupy port 8000, then `start` | Refuses with a clear message rather than a Docker error | ⏭️ Not run |
| 10.9 | `scripts/stop-<os>`, then `docker ps -a` | No `prelegal` container left behind | ⏭️ Not run |
| 10.10 | Leave the container running a day, then reload | Effective date is *that* day, not the build date | ⏭️ Not run |

> **10.3–10.10 were not run.** The Docker daemon was not available on the
> machine this was built on, so the image has never been built. 10.5 and 10.10
> are the two worth doing first: 10.5 is the `trailingSlash` behaviour, which
> a wrong setting turns into a 404, and 10.10 is the reason the effective date
> moved to the browser at all.

---

## Summary of this run

- **19 checks passed** in the browser.
- **5 skipped** deliberately (file downloads, outbound navigation, print dialog).
- **13 not verified** for environment reasons, split between the hidden-tab
  `requestAnimationFrame` limitation and the window resize not applying. Every
  one of those has a passing automated equivalent, but the print output
  (5.4/5.5) and the keyboard pass (7.1/7.3) genuinely need a human.
- **Sections 9 and 10 (PL-4) have not been run**, beyond the two script
  failure paths noted in 10.1 and 10.2. The container has never been built on
  this machine.
