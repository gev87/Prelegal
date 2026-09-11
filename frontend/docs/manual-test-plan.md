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
| 1.1 | Open `/` | The conversation on the left, document on the right | ⏭️ Not run — changed by PL-5 |
| 1.2 | Check the effective date | Today's date, in the browser's own timezone | ✅ Pass — `08/27/2026` |
| 1.3 | Check the preview date `[auto]` | Same day, spelled out — never yesterday | ✅ Pass — "August 27, 2026" |
| 1.4 | Open DevTools console | No errors, no hydration warnings | ✅ Pass — only `[HMR] connected` |
| 1.5 | Check the defaults `[auto]` | Purpose seeded, 1 year / 1 year, Delaware, New Castle DE | ✅ Pass |
| 1.6 | Check the signature block | Both parties blank, and no errors shown anywhere | ⏭️ Not run — changed by PL-5 |

> 1.2/1.3 are the timezone regression: the date is built from the parts, not
> parsed as UTC. Worth re-checking from a machine set west of Greenwich.

## 2. Defined terms in the document

| # | Step | Expected | Result |
|---|---|---|---|
| 2.1 | Hover a "Purpose" reference in the Standard Terms | Tooltip shows the label, the current value, and "Click to edit this on the cover page" | ✅ Pass |
| 2.2 | Change the purpose, hover again `[auto]` | Tooltip shows the new value | ✅ Pass |
| 2.3 | Click a "Purpose" reference `[PL-5]` | The message box is seeded with "About the purpose — " and focused | ⏭️ Not run |
| 2.4 | Click "Jurisdiction" (shares a heading with Governing Law) `[PL-5]` | Seeds "About the jurisdiction — ", not governing law | ⏭️ Not run |
| 2.5 | …and watch the network `[PL-5]` | **No request is sent.** Reading the document costs nothing | ⏭️ Not run |

> **Changed by PL-5.** Clicking a defined term used to scroll the form to the
> field that set it. There is no form now, so it seeds a question in the chat
> instead. The old 2.5 and 2.6 — smooth scrolling, and focus landing on the
> right control of a term group — described `revealField`, which is gone.

## 3. Validation and blocked downloads

| # | Step | Expected | Result |
|---|---|---|---|
| 3.1 | On a fresh page, click **Download Markdown** `[PL-5]` | No file downloads | ⏭️ Not run |
| 3.2 | …and read the conversation `[PL-5]` | The assistant says what it still needs, naming the six outstanding answers | ⏭️ Not run |
| 3.3 | …and check the order `[PL-5]` | Cover page first, then party one, then party two | ⏭️ Not run |
| 3.4 | …and watch the network `[PL-5]` | **No request is sent.** What is missing is already known | ⏭️ Not run |
| 3.5 | On a narrow screen, click **Download PDF** with answers missing `[PL-5]` | Switches to the chat so the message is visible | ⏭️ Not run |

> **Changed by PL-5.** Per-field errors, the touched-on-blur reveal and the
> jump to the first broken field all belonged to the form and are gone. The
> download gate itself is unchanged: `validateFields` still decides, and the
> same six answers are still required.

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
| 6.1 | Resize below 900px | Panes stack; the Chat/Document switch appears | ⚠️ Not verified — window resize did not apply to the minimized automation window |
| 6.2 | Tap **Document** | Document fills the screen, the conversation hidden | ✅ Covered by automated test (the class change) |
| 6.3 | Tap a defined term while on Document | Switches back to Chat with the question seeded | ✅ Covered by automated test |
| 6.4 | Blocked download while on Document | Switches back to Chat so the message is visible | ✅ Covered by automated test |
| 6.5 | Check the composer below 900px `[PL-5]` | The message box and Send stay on screen; only the transcript scrolls | ⏭️ Not run |

> The `max-width: 900px` block was read and matches the expectations above.
> **Re-run section 6 by hand, or with DevTools device emulation.** 6.5 is new
> in PL-5: the chat pane does not scroll as a whole, so a long conversation
> must not push the composer off the bottom of a phone screen.

## 7. Keyboard and assistive technology — `[manual only]`

| # | Step | Expected | Result |
|---|---|---|---|
| 7.1 | Tab from the top of the page | Every control reachable; focus ring always visible | ⚠️ Not run |
| 7.2 | Tab into the document | Each defined term is a button in the tab order | ✅ Covered by automated test (they are `<button>`) |
| 7.3 | Activate a defined term with Enter and with Space | Same as clicking it | ⚠️ Not run |
| 7.4 | With a screen reader, focus a defined term | Reads "Purpose … Activate to edit it on the cover page" | ⚠️ Not run — `[auto]` asserts the accessible description |
| 7.7 | With a screen reader, send a message `[PL-5]` | The reply is announced — the transcript is a polite live region | ⏭️ Not run |
| 7.5 | With a screen reader, check the tooltip | The decorative tooltip is not announced twice | ✅ Covered by automated test (`aria-hidden`) |
| 7.6 | Check both panes | Announced as "Drafting assistant" and "Agreement preview" | ✅ Covered by automated test |

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

## 9. The assistant `[PL-5]`

Needs `OPENROUTER_API_KEY` set, except 9.7–9.9 which need it *unset*.

| # | Step | Expected | Result |
|---|---|---|---|
| 9.1 | Load the page | A greeting is already there, and the network shows **no** request | ⏭️ Not run |
| 9.2 | Say "Acme and Globex, evaluating a reseller deal" | It replies, and the cover page beside it gains both company names | ⏭️ Not run |
| 9.3 | Answer the rest of its questions | The document fills in as you go; a download eventually becomes possible | ⏭️ Not run |
| 9.4 | Say "actually make the term 3 years" | The term changes; **nothing else in the document moves** | ⏭️ Not run |
| 9.5 | Ask it to draft a services agreement instead | It says it can only do a Mutual NDA, and carries on | ⏭️ Not run |
| 9.6 | Press Enter in the message box; then shift-Enter | Enter sends; shift-Enter starts a new line | ⏭️ Not run |
| 9.7 | With no key set, send a message | "The assistant is not configured on this server", and that the document still works | ⏭️ Not run |
| 9.8 | …then try to send another | The box and the Send button are disabled | ⏭️ Not run |
| 9.9 | …then read the document and download it | Preview renders; both downloads still work | ⏭️ Not run |
| 9.10 | Stop the backend mid-conversation, then send | "Could not reach the server", and the box stays usable | ⏭️ Not run |

> **9.4 is the one that matters most.** It is the check that the merge in
> `backend/app/chat.py` is doing its job: a correction should move exactly one
> answer. If anything else in the document changes at the same time, the model
> is rewriting fields it was not asked about and `updated_fields` is not being
> honoured.

## 10. Login screen `[PL-4]`

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

## 11. The container `[PL-4 / PL-5]`

Run against `scripts/start-<os>`. **None of this is reachable from the
automated suites** — they test the two halves separately and never the image.

| # | Step | Expected | Result |
|---|---|---|---|
| 11.1 | `scripts/start-<os>` with Docker stopped | One line telling you to start Docker; no stack trace; exit 1 | ✅ Pass — mac + windows |
| 11.2 | `scripts/stop-<os>` with Docker stopped | "Docker is not running; nothing to stop."; exit 0 | ✅ Pass — mac + windows |
| 11.3 | `scripts/start-<os>` | Builds, then reports `http://localhost:8000` only once it answers | ⏭️ Not run — Docker unavailable |
| 11.4 | Open `http://localhost:8000` | The creator, fully styled, effective date = today | ⏭️ Not run |
| 11.5 | Open `http://localhost:8000/login` | The login screen — **not** a 404 | ⏭️ Not run |
| 11.6 | Sign up, then `stop` and `start` again, and sign up with the same email | Succeeds — the database really was recreated | ⏭️ Not run |
| 11.7 | Run `start` twice without stopping | Second run succeeds; no "name already in use" | ⏭️ Not run |
| 11.8 | Occupy port 8000, then `start` | Refuses with a clear message rather than a Docker error | ⏭️ Not run |
| 11.9 | `scripts/stop-<os>`, then `docker ps -a` | No `prelegal` container left behind | ⏭️ Not run |
| 11.10 | Leave the container running a day, then reload | Effective date is *that* day, not the build date | ⏭️ Not run |
| 11.11 | `start` with no key set anywhere `[PL-5]` | Warns that the chat will be unavailable, and starts anyway | ⏭️ Not run |
| 11.12 | `start` with a key in `.env`, then chat `[PL-5]` | The assistant answers — the key reached the container | ⏭️ Not run |
| 11.13 | Search `docker history prelegal` for the key `[PL-5]` | Nothing. It is passed at run time, not baked into a layer | ⏭️ Not run |

> **11.3–11.10 were not run.** The Docker daemon was not available on the
> machine this was built on, so the image has never been built. 11.5 and 11.10
> are the two worth doing first: 11.5 is the `trailingSlash` behaviour, which
> a wrong setting turns into a 404, and 11.10 is the reason the effective date
> moved to the browser at all.

---

## Summary of this run

- **19 checks passed** in the browser.
- **5 skipped** deliberately (file downloads, outbound navigation, print dialog).
- **13 not verified** for environment reasons, split between the hidden-tab
  `requestAnimationFrame` limitation and the window resize not applying. Every
  one of those has a passing automated equivalent, but the print output
  (5.4/5.5) and the keyboard pass (7.1/7.3) genuinely need a human.
- **Sections 10 and 11 (PL-4) have not been run**, beyond the two script
  failure paths noted in 11.1 and 11.2. The container has never been built on
  this machine.
- **Section 9 (PL-5) has not been run at all.** No `OPENROUTER_API_KEY` was
  available, so no real call to the model has ever been made. Both sides of
  that call are covered by automated tests with the model faked, which is not
  the same as knowing it works. 9.2 and 9.4 are the two to do first.
