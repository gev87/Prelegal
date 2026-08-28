import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import NdaForm from "@/components/NdaForm";
import {
  MAX_TERM_YEARS,
  MIN_TERM_YEARS,
  US_STATES,
  type FieldErrors,
  type NdaFields,
} from "@/lib/nda/schema";
import { completeFields } from "../fixtures/fields";

function renderForm(
  overrides: {
    fields?: Partial<NdaFields>;
    errors?: FieldErrors;
    flashedFieldId?: string | null;
  } = {},
) {
  const onChange = vi.fn();
  const onPartyChange = vi.fn();
  const onFieldBlur = vi.fn();

  const view = render(
    <NdaForm
      fields={completeFields(overrides.fields)}
      errors={overrides.errors ?? {}}
      flashedFieldId={overrides.flashedFieldId ?? null}
      onChange={onChange}
      onPartyChange={onPartyChange}
      onFieldBlur={onFieldBlur}
    />,
  );

  return { ...view, onChange, onPartyChange, onFieldBlur };
}

describe("NdaForm", () => {
  it("shows every cover-page answer in a labelled control", () => {
    renderForm();

    expect(screen.getByLabelText("Purpose")).toBeInTheDocument();
    expect(screen.getByLabelText("Effective date")).toBeInTheDocument();
    expect(screen.getByLabelText("Governing law")).toBeInTheDocument();
    expect(screen.getByLabelText("Jurisdiction")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Modifications to the standard terms"),
    ).toBeInTheDocument();
  });

  it("shows the current values", () => {
    renderForm({ fields: { purpose: "Evaluating a deal.", jurisdiction: "Travis, TX" } });

    expect(screen.getByLabelText("Purpose")).toHaveValue("Evaluating a deal.");
    expect(screen.getByLabelText("Jurisdiction")).toHaveValue("Travis, TX");
    expect(screen.getByLabelText("Effective date")).toHaveValue("2026-03-14");
  });

  it("gives every form group the id the error mapping jumps to", () => {
    const { container } = renderForm();

    for (const id of [
      "field-purpose",
      "field-effective-date",
      "field-mnda-term",
      "field-confidentiality",
      "field-governing-law",
      "field-jurisdiction",
      "field-party-one-company",
      "field-party-one-name",
      "field-party-one-notice",
      "field-party-two-company",
      "field-party-two-name",
      "field-party-two-notice",
    ]) {
      expect(container.querySelector(`#${id}`), id).not.toBeNull();
    }
  });

  it("does not submit the page when Enter is pressed in a text field", async () => {
    const user = userEvent.setup();
    const submit = vi.fn();
    const { container } = renderForm();
    container.querySelector("form")?.addEventListener("submit", submit);

    await user.type(screen.getByLabelText("Jurisdiction"), "{Enter}");

    expect(submit).toHaveBeenCalledTimes(0);
  });

  describe("editing", () => {
    it("reports each keystroke in the purpose", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm({ fields: { purpose: "" } });

      await user.type(screen.getByLabelText("Purpose"), "Hi");

      expect(onChange).toHaveBeenNthCalledWith(1, { purpose: "H" });
    });

    it("reports a change of governing law", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm();

      await user.selectOptions(screen.getByLabelText("Governing law"), "New York");

      expect(onChange).toHaveBeenCalledWith({ governingLaw: "New York" });
    });

    it("routes party edits to the right slot", async () => {
      const user = userEvent.setup();
      const { onPartyChange } = renderForm();

      const [companyOne, companyTwo] = screen.getAllByLabelText("Company");
      await user.type(companyOne, "X");
      await user.type(companyTwo, "Y");

      expect(onPartyChange).toHaveBeenNthCalledWith(1, "partyOne", {
        company: "Acme, Inc.X",
      });
      expect(onPartyChange).toHaveBeenNthCalledWith(2, "partyTwo", {
        company: "Globex CorporationY",
      });
    });

    it("marks a field touched when it loses focus", async () => {
      const user = userEvent.setup();
      const { onFieldBlur } = renderForm();

      await user.click(screen.getByLabelText("Purpose"));
      await user.tab();

      expect(onFieldBlur).toHaveBeenCalledWith("purpose");
    });

    it("does not mark the optional title field touched, as it cannot error", async () => {
      const user = userEvent.setup();
      const { onFieldBlur } = renderForm();

      await user.click(screen.getAllByLabelText("Title")[0]);
      await user.tab();

      expect(onFieldBlur).not.toHaveBeenCalledWith("partyOne.signatoryTitle");
    });
  });

  describe("the governing law select", () => {
    it("offers every state plus DC", () => {
      renderForm();

      expect(screen.getByLabelText("Governing law")).toHaveDisplayValue("Delaware");
      expect(
        screen.getByLabelText<HTMLSelectElement>("Governing law").options,
      ).toHaveLength(US_STATES.length);
    });
  });

  describe("the MNDA term", () => {
    it("selects the fixed option and enables its year box", () => {
      renderForm({ fields: { mndaTermMode: "fixed", mndaTermYears: 5 } });

      const years = screen.getByLabelText("Years until the MNDA expires");

      expect(years).toBeEnabled();
      expect(years).toHaveValue(5);
    });

    it("disables the year box when the term runs until terminated", () => {
      renderForm({ fields: { mndaTermMode: "until-terminated" } });

      expect(screen.getByLabelText("Years until the MNDA expires")).toBeDisabled();
    });

    it("bounds the year box to the permitted range", () => {
      renderForm();

      const years = screen.getByLabelText("Years until the MNDA expires");

      expect(years).toHaveAttribute("min", String(MIN_TERM_YEARS));
      expect(years).toHaveAttribute("max", String(MAX_TERM_YEARS));
    });

    it("switches to the until-terminated option when it is chosen", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm();

      await user.click(
        screen.getByRole("radio", {
          name: /Continues until terminated/,
        }),
      );

      expect(onChange).toHaveBeenCalledWith({ mndaTermMode: "until-terminated" });
    });

    it("renders an emptied year box as blank rather than the text NaN", () => {
      renderForm({ fields: { mndaTermYears: Number.NaN } });

      expect(screen.getByLabelText("Years until the MNDA expires")).toHaveValue(null);
      expect(screen.queryByDisplayValue("NaN")).toBeNull();
    });

    it("reports a cleared year box as a value validation will reject", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm({ fields: { mndaTermYears: 5 } });

      await user.clear(screen.getByLabelText("Years until the MNDA expires"));

      expect(onChange).toHaveBeenCalledWith({ mndaTermYears: Number.NaN });
    });
  });

  describe("the term of confidentiality", () => {
    it("disables the year box in perpetual mode", () => {
      renderForm({ fields: { confidentialityMode: "perpetual" } });

      expect(
        screen.getByLabelText("Years information stays confidential"),
      ).toBeDisabled();
    });

    it("switches to perpetual when it is chosen", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm();

      await user.click(screen.getByRole("radio", { name: "In perpetuity" }));

      expect(onChange).toHaveBeenCalledWith({ confidentialityMode: "perpetual" });
    });

    it("keeps the two term choices independent", () => {
      renderForm({
        fields: { mndaTermMode: "until-terminated", confidentialityMode: "fixed" },
      });

      expect(screen.getByLabelText("Years until the MNDA expires")).toBeDisabled();
      expect(screen.getByLabelText("Years information stays confidential")).toBeEnabled();
    });
  });

  describe("errors", () => {
    it("shows nothing when there are no errors", () => {
      const { container } = renderForm();

      expect(container.querySelectorAll(".field-error")).toHaveLength(0);
    });

    it("shows the message next to the field it belongs to", () => {
      renderForm({ errors: { purpose: "Describe how it may be used." } });

      expect(screen.getByText("Describe how it may be used.")).toBeInTheDocument();
    });

    it("marks the invalid control so it reads as invalid visually", () => {
      renderForm({ errors: { purpose: "Required." } });

      expect(screen.getByLabelText("Purpose").className).toContain("textarea-invalid");
    });

    it("marks only the party that has the error", () => {
      renderForm({ errors: { "partyTwo.company": "Enter the company." } });

      const [companyOne, companyTwo] = screen.getAllByLabelText("Company");

      expect(companyOne.className).not.toContain("input-invalid");
      expect(companyTwo.className).toContain("input-invalid");
    });

    it("shows one message per error", () => {
      const { container } = renderForm({
        errors: { purpose: "A.", jurisdiction: "B.", "partyOne.company": "C." },
      });

      expect(container.querySelectorAll(".field-error")).toHaveLength(3);
    });
  });

  describe("the flash highlight", () => {
    it("marks only the field being pointed at", () => {
      const { container } = renderForm({ flashedFieldId: "field-jurisdiction" });

      expect(container.querySelector("#field-jurisdiction")?.className).toContain(
        "field-flash",
      );
      expect(container.querySelector("#field-purpose")?.className).not.toContain(
        "field-flash",
      );
    });

    it("marks nothing when no field is being pointed at", () => {
      const { container } = renderForm({ flashedFieldId: null });

      expect(container.querySelectorAll(".field-flash")).toHaveLength(0);
    });
  });
});
