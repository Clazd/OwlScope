"use client";

import { Card } from "@/components/common/Card";
import { Field, TextInput } from "@/components/common/Field";
import type { Persona } from "@/domain/persona/schema";
import { Section } from "./section-chrome";

interface Props {
  persona: Persona;
  onChange: (changes: Partial<Persona>) => void;
}

export function IdentitySection({ persona, onChange }: Props) {
  return (
    <Section
      id="identity"
      title="Identity"
      intro="Who the writer is. Everything generated is grounded in this record rather than in the last thing you typed."
    >
      <Card padding="24">
        <Field label="Name">
          <TextInput
            value={persona.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Nova"
          />
        </Field>

        <Field label="One-line description">
          <TextInput
            value={persona.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Writes about AI, software and the odd corners of both."
          />
        </Field>

        <Field
          label="Identity statement"
          hint="First person, in your own words. This is the sentence the writer reasons from."
        >
          <textarea
            value={persona.identityStatement}
            onChange={(e) => onChange({ identityStatement: e.target.value })}
            rows={3}
            placeholder="I am someone deeply interested in…"
            className="type-body w-full rounded-control border border-rule-strong bg-surface px-3 py-2 text-ink placeholder:text-ink-3"
          />
        </Field>

        <Field label="Target audience">
          <TextInput
            value={persona.audience}
            onChange={(e) => onChange({ audience: e.target.value })}
            placeholder="Engineers and product people who build things."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary language">
            <TextInput
              mono
              value={persona.primaryLanguage}
              onChange={(e) => onChange({ primaryLanguage: e.target.value })}
              placeholder="en"
            />
          </Field>
          <Field label="Secondary language" hint="Optional.">
            <TextInput
              mono
              value={persona.secondaryLanguage ?? ""}
              onChange={(e) => onChange({ secondaryLanguage: e.target.value || null })}
              placeholder="—"
            />
          </Field>
        </div>

        <Field label="Geographic or cultural focus" hint="Optional. Leave empty for none.">
          <TextInput
            value={persona.focus ?? ""}
            onChange={(e) => onChange({ focus: e.target.value || null })}
            placeholder="—"
          />
        </Field>
      </Card>
    </Section>
  );
}
