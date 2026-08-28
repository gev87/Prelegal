"use client";

import type { ReactNode } from "react";

import {
  MAX_TERM_YEARS,
  MIN_TERM_YEARS,
  US_STATES,
  type FieldErrors,
  type NdaFields,
  type Party,
  type PartySlot,
} from "@/lib/nda/schema";

interface NdaFormProps {
  fields: NdaFields;
  /** Only the errors worth showing yet — see NdaCreator. */
  errors: FieldErrors;
  flashedFieldId: string | null;
  onChange: (patch: Partial<NdaFields>) => void;
  onPartyChange: (slot: PartySlot, patch: Partial<Party>) => void;
  onFieldBlur: (name: string) => void;
}

export default function NdaForm({
  fields,
  errors,
  flashedFieldId,
  onChange,
  onPartyChange,
  onFieldBlur,
}: NdaFormProps) {
  const flashed = (id: string) => (flashedFieldId === id ? " field-flash" : "");

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <p className="form-intro">
        These answers become the cover page. The standard terms are Common Paper&rsquo;s
        Version 1.0 and stay as published &mdash; they refer back to whatever you set
        here.
      </p>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">The agreement</legend>

        <div className={`field${flashed("field-purpose")}`} id="field-purpose">
          <label className="field-label" htmlFor="purpose">
            Purpose
          </label>
          <span className="field-hint">How confidential information may be used.</span>
          <textarea
            id="purpose"
            className={`textarea${errors.purpose ? " textarea-invalid" : ""}`}
            value={fields.purpose}
            rows={3}
            onChange={(event) => onChange({ purpose: event.target.value })}
            onBlur={() => onFieldBlur("purpose")}
          />
          <FieldError message={errors.purpose} />
        </div>

        <div
          className={`field${flashed("field-effective-date")}`}
          id="field-effective-date"
        >
          <label className="field-label" htmlFor="effective-date">
            Effective date
          </label>
          <input
            id="effective-date"
            type="date"
            className={`input${errors.effectiveDate ? " input-invalid" : ""}`}
            value={fields.effectiveDate}
            onChange={(event) => onChange({ effectiveDate: event.target.value })}
            onBlur={() => onFieldBlur("effectiveDate")}
          />
          <FieldError message={errors.effectiveDate} />
        </div>

        <fieldset className={`field${flashed("field-mnda-term")}`} id="field-mnda-term">
          <legend className="field-label">MNDA term</legend>
          <span className="field-hint">How long the agreement itself lasts.</span>
          <div className="choices">
            <div
              className={`choice${fields.mndaTermMode === "fixed" ? " choice-selected" : ""}`}
            >
              <input
                type="radio"
                id="mnda-term-fixed"
                name="mnda-term"
                checked={fields.mndaTermMode === "fixed"}
                onChange={() => onChange({ mndaTermMode: "fixed" })}
              />
              <span className="choice-body">
                <label htmlFor="mnda-term-fixed">Expires</label>
                <input
                  type="number"
                  className={`input input-narrow${errors.mndaTermYears ? " input-invalid" : ""}`}
                  aria-label="Years until the MNDA expires"
                  min={MIN_TERM_YEARS}
                  max={MAX_TERM_YEARS}
                  value={yearsValue(fields.mndaTermYears)}
                  disabled={fields.mndaTermMode !== "fixed"}
                  onChange={(event) =>
                    onChange({ mndaTermYears: parseYears(event.target.value) })
                  }
                  onBlur={() => onFieldBlur("mndaTermYears")}
                />
                <label htmlFor="mnda-term-fixed">years from the effective date</label>
              </span>
            </div>

            <label
              className={`choice${fields.mndaTermMode === "until-terminated" ? " choice-selected" : ""}`}
            >
              <input
                type="radio"
                name="mnda-term"
                checked={fields.mndaTermMode === "until-terminated"}
                onChange={() => onChange({ mndaTermMode: "until-terminated" })}
              />
              <span className="choice-body">
                Continues until terminated in accordance with the terms of this MNDA
              </span>
            </label>
          </div>
          <FieldError message={errors.mndaTermYears} />
        </fieldset>

        <fieldset
          className={`field${flashed("field-confidentiality")}`}
          id="field-confidentiality"
        >
          <legend className="field-label">Term of confidentiality</legend>
          <span className="field-hint">
            How long information stays protected. It can outlast the agreement, and
            trade secrets stay protected for as long as they remain trade secrets.
          </span>
          <div className="choices">
            <div
              className={`choice${fields.confidentialityMode === "fixed" ? " choice-selected" : ""}`}
            >
              <input
                type="radio"
                id="confidentiality-fixed"
                name="confidentiality"
                checked={fields.confidentialityMode === "fixed"}
                onChange={() => onChange({ confidentialityMode: "fixed" })}
              />
              <span className="choice-body">
                <input
                  type="number"
                  className={`input input-narrow${errors.confidentialityYears ? " input-invalid" : ""}`}
                  aria-label="Years information stays confidential"
                  min={MIN_TERM_YEARS}
                  max={MAX_TERM_YEARS}
                  value={yearsValue(fields.confidentialityYears)}
                  disabled={fields.confidentialityMode !== "fixed"}
                  onChange={(event) =>
                    onChange({ confidentialityYears: parseYears(event.target.value) })
                  }
                  onBlur={() => onFieldBlur("confidentialityYears")}
                />
                <label htmlFor="confidentiality-fixed">
                  years from the effective date
                </label>
              </span>
            </div>

            <label
              className={`choice${fields.confidentialityMode === "perpetual" ? " choice-selected" : ""}`}
            >
              <input
                type="radio"
                name="confidentiality"
                checked={fields.confidentialityMode === "perpetual"}
                onChange={() => onChange({ confidentialityMode: "perpetual" })}
              />
              <span className="choice-body">In perpetuity</span>
            </label>
          </div>
          <FieldError message={errors.confidentialityYears} />
        </fieldset>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">Governing law</legend>

        <div
          className={`field${flashed("field-governing-law")}`}
          id="field-governing-law"
        >
          <label className="field-label" htmlFor="governing-law">
            Governing law
          </label>
          <span className="field-hint">
            The state whose law applies. Delaware is the common default.
          </span>
          <select
            id="governing-law"
            className={`select${errors.governingLaw ? " select-invalid" : ""}`}
            value={fields.governingLaw}
            onChange={(event) => onChange({ governingLaw: event.target.value })}
            onBlur={() => onFieldBlur("governingLaw")}
          >
            {US_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          <FieldError message={errors.governingLaw} />
        </div>

        <div className={`field${flashed("field-jurisdiction")}`} id="field-jurisdiction">
          <label className="field-label" htmlFor="jurisdiction">
            Jurisdiction
          </label>
          <span className="field-hint">
            The courts that hear any dispute, as a city or county and state.
          </span>
          <input
            id="jurisdiction"
            className={`input${errors.jurisdiction ? " input-invalid" : ""}`}
            value={fields.jurisdiction}
            placeholder="New Castle, DE"
            onChange={(event) => onChange({ jurisdiction: event.target.value })}
            onBlur={() => onFieldBlur("jurisdiction")}
          />
          <FieldError message={errors.jurisdiction} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="modifications">
            Modifications to the standard terms
          </label>
          <span className="field-hint">
            Anything changed from Version 1.0. Leave empty for none.
          </span>
          <textarea
            id="modifications"
            className="textarea"
            rows={2}
            value={fields.modifications}
            onChange={(event) => onChange({ modifications: event.target.value })}
          />
        </div>
      </fieldset>

      <PartyFieldset
        slot="partyOne"
        legend="Party 1"
        party={fields.partyOne}
        errors={errors}
        flashed={flashed}
        onPartyChange={onPartyChange}
        onFieldBlur={onFieldBlur}
      />
      <PartyFieldset
        slot="partyTwo"
        legend="Party 2"
        party={fields.partyTwo}
        errors={errors}
        flashed={flashed}
        onPartyChange={onPartyChange}
        onFieldBlur={onFieldBlur}
      />
    </form>
  );
}

interface PartyFieldsetProps {
  slot: PartySlot;
  legend: string;
  party: Party;
  errors: FieldErrors;
  flashed: (id: string) => string;
  onPartyChange: (slot: PartySlot, patch: Partial<Party>) => void;
  onFieldBlur: (name: string) => void;
}

function PartyFieldset({
  slot,
  legend,
  party,
  errors,
  flashed,
  onPartyChange,
  onFieldBlur,
}: PartyFieldsetProps) {
  const prefix = slot === "partyOne" ? "party-one" : "party-two";

  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend">{legend}</legend>

      <div className={`field${flashed(`field-${prefix}-company`)}`} id={`field-${prefix}-company`}>
        <label className="field-label" htmlFor={`${prefix}-company`}>
          Company
        </label>
        <input
          id={`${prefix}-company`}
          className={`input${errors[`${slot}.company`] ? " input-invalid" : ""}`}
          value={party.company}
          placeholder="Acme, Inc."
          onChange={(event) => onPartyChange(slot, { company: event.target.value })}
          onBlur={() => onFieldBlur(`${slot}.company`)}
        />
        <FieldError message={errors[`${slot}.company`]} />
      </div>

      <div className="party-grid">
        <div className={`field${flashed(`field-${prefix}-name`)}`} id={`field-${prefix}-name`}>
          <label className="field-label" htmlFor={`${prefix}-name`}>
            Signed by
          </label>
          <input
            id={`${prefix}-name`}
            className={`input${errors[`${slot}.signatoryName`] ? " input-invalid" : ""}`}
            value={party.signatoryName}
            placeholder="Dana Reyes"
            onChange={(event) =>
              onPartyChange(slot, { signatoryName: event.target.value })
            }
            onBlur={() => onFieldBlur(`${slot}.signatoryName`)}
          />
          <FieldError message={errors[`${slot}.signatoryName`]} />
        </div>

        <div className="field">
          <label className="field-label" htmlFor={`${prefix}-title`}>
            Title
          </label>
          <input
            id={`${prefix}-title`}
            className="input"
            value={party.signatoryTitle}
            placeholder="Chief Executive Officer"
            onChange={(event) =>
              onPartyChange(slot, { signatoryTitle: event.target.value })
            }
          />
        </div>
      </div>

      <div className={`field${flashed(`field-${prefix}-notice`)}`} id={`field-${prefix}-notice`}>
        <label className="field-label" htmlFor={`${prefix}-notice`}>
          Notice address
        </label>
        <span className="field-hint">An email or postal address. Where legal notices go.</span>
        <textarea
          id={`${prefix}-notice`}
          className={`textarea${errors[`${slot}.noticeAddress`] ? " textarea-invalid" : ""}`}
          rows={2}
          value={party.noticeAddress}
          placeholder="legal@acme.com"
          onChange={(event) =>
            onPartyChange(slot, { noticeAddress: event.target.value })
          }
          onBlur={() => onFieldBlur(`${slot}.noticeAddress`)}
        />
        <FieldError message={errors[`${slot}.noticeAddress`]} />
      </div>
    </fieldset>
  );
}

function FieldError({ message }: { message?: string }): ReactNode {
  if (!message) return null;
  return <span className="field-error">{message}</span>;
}

/** An emptied number input reads as NaN, which validation reports as invalid. */
function parseYears(value: string): number {
  return Number.parseInt(value, 10);
}

/** ...and NaN has to render as an empty box rather than the text "NaN". */
function yearsValue(years: number): number | string {
  return Number.isNaN(years) ? "" : years;
}
