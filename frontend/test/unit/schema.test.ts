import { describe, expect, it } from "vitest";

import {
  createDefaultFields,
  DEFAULT_PURPOSE,
  DEFINED_TERMS,
  DEFINED_TERM_BY_LABEL,
  ERROR_FIELD_IDS,
  MAX_TERM_YEARS,
  MIN_TERM_YEARS,
  US_STATES,
  validateFields,
} from "@/lib/nda/schema";
import { completeFields, party } from "../fixtures/fields";

describe("createDefaultFields", () => {
  it("seeds the Common Paper defaults and the supplied effective date", () => {
    const fields = createDefaultFields("2026-01-31");

    expect(fields).toMatchObject({
      purpose: DEFAULT_PURPOSE,
      effectiveDate: "2026-01-31",
      mndaTermMode: "fixed",
      mndaTermYears: 1,
      confidentialityMode: "fixed",
      confidentialityYears: 1,
      governingLaw: "Delaware",
      jurisdiction: "New Castle, DE",
      modifications: "",
    });
  });

  it("starts both parties blank", () => {
    const fields = createDefaultFields("2026-01-31");

    expect(fields.partyOne).toEqual(party());
    expect(fields.partyTwo).toEqual(party());
  });

  it("gives each party its own object so editing one never edits the other", () => {
    const fields = createDefaultFields("2026-01-31");

    fields.partyOne.company = "Acme, Inc.";

    expect(fields.partyTwo.company).toBe("");
  });

  it("does not share party objects between two calls", () => {
    const first = createDefaultFields("2026-01-31");
    const second = createDefaultFields("2026-01-31");

    first.partyOne.company = "Acme, Inc.";

    expect(second.partyOne.company).toBe("");
  });

  it("defaults the governing law to a state the select can actually show", () => {
    expect(US_STATES).toContain(createDefaultFields("2026-01-31").governingLaw);
  });
});

describe("validateFields", () => {
  it("reports nothing for a complete cover page", () => {
    expect(validateFields(completeFields())).toEqual({});
  });

  it("reports every missing answer on a blank form at once", () => {
    const errors = validateFields(createDefaultFields("2026-01-31"));

    expect(Object.keys(errors).sort()).toEqual([
      "partyOne.company",
      "partyOne.noticeAddress",
      "partyOne.signatoryName",
      "partyTwo.company",
      "partyTwo.noticeAddress",
      "partyTwo.signatoryName",
    ]);
  });

  describe("purpose", () => {
    it("rejects an empty purpose", () => {
      expect(validateFields(completeFields({ purpose: "" }))).toHaveProperty("purpose");
    });

    it("rejects a purpose that is only whitespace", () => {
      expect(validateFields(completeFields({ purpose: "   \n\t " }))).toHaveProperty(
        "purpose",
      );
    });

    it("accepts a purpose padded with whitespace", () => {
      expect(validateFields(completeFields({ purpose: "  Evaluating.  " }))).toEqual({});
    });
  });

  describe("effective date", () => {
    it.each(["2026-03-14", "2024-02-29", "2000-02-29", "1999-12-31"])(
      "accepts the real date %s",
      (effectiveDate) => {
        expect(validateFields(completeFields({ effectiveDate }))).toEqual({});
      },
    );

    it.each([
      ["an empty string", ""],
      ["a non-date", "not a date"],
      ["a single-digit month", "2026-3-14"],
      ["a slash-separated date", "2026/03/14"],
      ["a US-ordered date", "03-14-2026"],
      ["month 13", "2026-13-01"],
      ["month 00", "2026-00-10"],
      ["day 00", "2026-01-00"],
      ["day 32", "2026-01-32"],
      ["Feb 30", "2026-02-30"],
      ["Feb 29 in a common year", "2026-02-29"],
      ["Feb 29 in a non-leap centurial year", "1900-02-29"],
      ["April 31", "2026-04-31"],
      ["a datetime", "2026-03-14T00:00:00Z"],
      ["trailing whitespace", "2026-03-14 "],
    ])("rejects %s", (_label, effectiveDate) => {
      expect(validateFields(completeFields({ effectiveDate }))).toHaveProperty(
        "effectiveDate",
      );
    });
  });

  describe("MNDA term years", () => {
    it.each([MIN_TERM_YEARS, 2, 50, MAX_TERM_YEARS])(
      "accepts %i years in fixed mode",
      (mndaTermYears) => {
        expect(validateFields(completeFields({ mndaTermYears }))).toEqual({});
      },
    );

    it.each([
      ["zero", 0],
      ["a negative count", -1],
      ["one above the maximum", MAX_TERM_YEARS + 1],
      ["a fraction", 1.5],
      ["NaN, as an emptied number input reads", Number.NaN],
      ["Infinity", Number.POSITIVE_INFINITY],
    ])("rejects %s in fixed mode", (_label, mndaTermYears) => {
      expect(validateFields(completeFields({ mndaTermYears }))).toHaveProperty(
        "mndaTermYears",
      );
    });

    it("ignores the year count entirely in until-terminated mode", () => {
      const fields = completeFields({
        mndaTermMode: "until-terminated",
        mndaTermYears: Number.NaN,
      });

      expect(validateFields(fields)).toEqual({});
    });

    it("names the permitted range in the message", () => {
      const errors = validateFields(completeFields({ mndaTermYears: 0 }));

      expect(errors.mndaTermYears).toContain(String(MIN_TERM_YEARS));
      expect(errors.mndaTermYears).toContain(String(MAX_TERM_YEARS));
    });
  });

  describe("confidentiality years", () => {
    it.each([MIN_TERM_YEARS, 7, MAX_TERM_YEARS])(
      "accepts %i years in fixed mode",
      (confidentialityYears) => {
        expect(validateFields(completeFields({ confidentialityYears }))).toEqual({});
      },
    );

    it.each([0, -3, MAX_TERM_YEARS + 1, 2.5, Number.NaN])(
      "rejects %s years in fixed mode",
      (confidentialityYears) => {
        expect(validateFields(completeFields({ confidentialityYears }))).toHaveProperty(
          "confidentialityYears",
        );
      },
    );

    it("ignores the year count entirely in perpetual mode", () => {
      const fields = completeFields({
        confidentialityMode: "perpetual",
        confidentialityYears: Number.NaN,
      });

      expect(validateFields(fields)).toEqual({});
    });
  });

  describe("governing law and jurisdiction", () => {
    it.each(["", "  "])("rejects a governing law of %j", (governingLaw) => {
      expect(validateFields(completeFields({ governingLaw }))).toHaveProperty(
        "governingLaw",
      );
    });

    it.each(["", "  "])("rejects a jurisdiction of %j", (jurisdiction) => {
      expect(validateFields(completeFields({ jurisdiction }))).toHaveProperty(
        "jurisdiction",
      );
    });
  });

  describe("parties", () => {
    it.each(["partyOne", "partyTwo"] as const)(
      "requires company, signatory name and notice address for %s",
      (slot) => {
        const errors = validateFields(completeFields({ [slot]: party() }));

        expect(Object.keys(errors).sort()).toEqual([
          `${slot}.company`,
          `${slot}.noticeAddress`,
          `${slot}.signatoryName`,
        ]);
      },
    );

    it("does not require a signatory title", () => {
      const fields = completeFields();
      fields.partyOne.signatoryTitle = "";

      expect(validateFields(fields)).toEqual({});
    });

    it("rejects a party whose answers are only whitespace", () => {
      const fields = completeFields({
        partyOne: party({ company: " ", signatoryName: "\t", noticeAddress: "\n" }),
      });

      expect(Object.keys(validateFields(fields))).toHaveLength(3);
    });

    it("reports each party independently", () => {
      const errors = validateFields(completeFields({ partyTwo: party() }));

      expect(Object.keys(errors).every((key) => key.startsWith("partyTwo."))).toBe(true);
    });
  });

  it("never mutates the fields it is given", () => {
    const fields = completeFields({ purpose: "  padded  " });
    const before = structuredClone(fields);

    validateFields(fields);

    expect(fields).toEqual(before);
  });
});

describe("error-to-field mapping", () => {
  it("maps every error validation can produce to a form group", () => {
    const everyError = validateFields({
      ...createDefaultFields("not-a-date"),
      purpose: "",
      governingLaw: "",
      jurisdiction: "",
      mndaTermYears: Number.NaN,
      confidentialityYears: Number.NaN,
    });

    for (const name of Object.keys(everyError)) {
      expect(ERROR_FIELD_IDS).toHaveProperty(name);
    }
  });

  it("lists the field groups in the order the form reads top to bottom", () => {
    expect(Object.keys(ERROR_FIELD_IDS)).toEqual([
      "purpose",
      "effectiveDate",
      "mndaTermYears",
      "confidentialityYears",
      "governingLaw",
      "jurisdiction",
      "partyOne.company",
      "partyOne.signatoryName",
      "partyOne.noticeAddress",
      "partyTwo.company",
      "partyTwo.signatoryName",
      "partyTwo.noticeAddress",
    ]);
  });
});

describe("defined terms", () => {
  it("keys every entry by its own key", () => {
    for (const [key, term] of Object.entries(DEFINED_TERMS)) {
      expect(term.key).toBe(key);
    }
  });

  it("indexes every term by label", () => {
    for (const term of Object.values(DEFINED_TERMS)) {
      expect(DEFINED_TERM_BY_LABEL[term.label]).toBe(term);
    }
  });

  it("gives each term a distinct label, since labels are the lookup key", () => {
    const labels = Object.values(DEFINED_TERMS).map((term) => term.label);

    expect(new Set(labels).size).toBe(labels.length);
  });

  it("distinguishes governing law from jurisdiction, which share an anchor", () => {
    expect(DEFINED_TERMS.governingLaw.anchor).toBe(DEFINED_TERMS.jurisdiction.anchor);
    expect(DEFINED_TERM_BY_LABEL["Governing Law"].fieldId).toBe("field-governing-law");
    expect(DEFINED_TERM_BY_LABEL.Jurisdiction.fieldId).toBe("field-jurisdiction");
  });

  it("points every anchor at a fragment", () => {
    for (const term of Object.values(DEFINED_TERMS)) {
      expect(term.anchor.startsWith("#")).toBe(true);
    }
  });
});

describe("US_STATES", () => {
  it("covers the fifty states plus the District of Columbia", () => {
    expect(US_STATES).toHaveLength(51);
  });

  it("has no duplicates", () => {
    expect(new Set(US_STATES).size).toBe(US_STATES.length);
  });

  it("is alphabetically ordered, as the select renders it in order", () => {
    expect([...US_STATES]).toEqual([...US_STATES].sort((a, b) => a.localeCompare(b)));
  });
});
