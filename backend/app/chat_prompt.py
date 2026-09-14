"""
The instructions the assistant works from, for the Mutual NDA.

A module of its own, and a pure function, because the prompt is the part of
this feature most likely to be wrong and the part least pleasant to debug
through a network call. ``tests/test_chat_prompt.py`` reads it directly.

The prompt carries three things the model cannot work out for itself: what
the fields mean in a Mutual NDA, which of them the user has actually settled,
and what today's date is.

PL-6 left this file writing the NDA's prompt by hand while ten other document
types get theirs generated from descriptors in ``document_prompt``. The field
guide below is the reason: the NDA's cover page has two independent terms and
two modes, and the note that one does not imply the other is worth more than
any descriptor could carry. What this file no longer owns is the prose every
document type shares — how to end a turn, how to report a change, what to do
when the person wanted a different document — which lives in
``document_prompt`` and is imported, so those rules cannot hold for ten types
and quietly miss the eleventh.
"""

from __future__ import annotations

from app.document_prompt import (
    ENDING_YOUR_TURN,
    HOW_TO_ANSWER,
    closing,
    how_to_talk,
    intro,
    render_confirmed,
    render_outstanding,
    switching_section,
    today_section,
)
from app.document_types import MUTUAL_NDA
from app.nda_fields import (
    MAX_TERM_YEARS,
    MIN_TERM_YEARS,
    US_STATES,
    FieldPath,
    NdaFields,
)

#: What each field is, in the terms a drafter would use. The model is asking
#: a person about their business relationship, not reading them a form, so
#: every entry says what the answer is *for*.
FIELD_GUIDE = """\
- purpose: why the two sides are exchanging confidential information.
- effectiveDate (YYYY-MM-DD): the day the agreement starts.
- mndaTermMode: "fixed" if the arrangement to exchange information ends on a
  date, "until-terminated" if it runs until somebody ends it.
- mndaTermYears (a whole number, {min}-{max}): how many years that runs.
  Meaningless unless mndaTermMode is "fixed".
- confidentialityMode: "fixed" if the duty to keep the information secret
  expires, "perpetual" if it never does. This outlives the term above and is
  a separate question — do not assume one from the other.
- confidentialityYears (a whole number, {min}-{max}): how many years that
  duty lasts. Meaningless unless confidentialityMode is "fixed".
- governingLaw: one US state, spelled out in full, whose law governs.
- jurisdiction: where disputes are heard, such as "New Castle, DE".
- modifications: any changes to the standard terms. Usually empty, and an
  empty answer is a perfectly good one.
- partyOne and partyTwo, each with company, signatoryName, signatoryTitle
  and noticeAddress. The notice address is where legal notices are sent: an
  email address or a postal address.\
""".format(min=MIN_TERM_YEARS, max=MAX_TERM_YEARS)

#: Every leaf of the NDA cover page, as plain strings, in the order it reads.
_PATHS: tuple[str, ...] = tuple(path.value for path in FieldPath)


def build_system_prompt(fields: NdaFields, confirmed: set[FieldPath], today: str) -> str:
    """The system message for one turn."""
    settled = {str(path) for path in confirmed}
    return f"""\
{intro("Mutual NDA")}

{today_section(today, "If nobody names an effective date, suggest today's.")}

# The fields you are filling in

{FIELD_GUIDE}

# The states you may choose from

{", ".join(US_STATES)}

# Settled so far

{render_confirmed(fields, settled, _PATHS)}

# Still to ask about

{render_outstanding(settled, _PATHS)}

{how_to_talk("partyOne.signatoryName")}

{switching_section(MUTUAL_NDA, "Mutual NDA")}

{ENDING_YOUR_TURN}

{HOW_TO_ANSWER}

{closing(MUTUAL_NDA)}\
"""
