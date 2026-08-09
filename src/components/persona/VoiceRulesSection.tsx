"use client";

import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { RadioRow, TextInput } from "@/components/common/Field";
import { MicroLabel } from "@/components/common/MicroLabel";
import { newId } from "@/lib/ids";
import type { ExperienceItem, VoiceRule, VoiceRuleType } from "@/domain/persona/schema";
import { ListRow, Section } from "./section-chrome";

interface RuleProps {
  rules: VoiceRule[];
  onChange: (rules: VoiceRule[]) => void;
}

export function VoiceRulesSection({ rules, onChange }: RuleProps) {
  function update(id: string, changes: Partial<VoiceRule>) {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  }

  return (
    <Section
      id="voice-rules"
      title="Voice rules"
      intro="Hard rules about how this writer does and does not sound. The seeded ones are a starting position - delete anything you disagree with."
      action={
        <Button onClick={() => onChange([...rules, { id: newId(), rule: "", ruleType: "never", enabled: true }])}>
          Add rule
        </Button>
      }
    >
      <Card padding="24">
        {rules.map((rule) => (
          <ListRow key={rule.id} onRemove={() => onChange(rules.filter((r) => r.id !== rule.id))}>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="checkbox"
                checked={rule.enabled}
                aria-label="Rule enabled"
                onChange={(e) => update(rule.id, { enabled: e.target.checked })}
                className="accent-ink size-4 shrink-0"
              />
              <RadioRow<VoiceRuleType>
                name="Rule type"
                value={rule.ruleType}
                onChange={(ruleType) => update(rule.id, { ruleType })}
                options={[
                  { value: "never", label: "Never" },
                  { value: "prefer", label: "Prefer" },
                ]}
              />
              <TextInput
                value={rule.rule}
                onChange={(e) => update(rule.id, { rule: e.target.value })}
                placeholder="Something this writer never does"
                className="min-w-[240px] grow"
              />
            </div>
          </ListRow>
        ))}
      </Card>
    </Section>
  );
}

/* ------------------------------------------------------------- experience -- */

interface ExperienceProps {
  experience: ExperienceItem[];
  onChange: (experience: ExperienceItem[]) => void;
}

export function ExperienceSection({ experience, onChange }: ExperienceProps) {
  function update(id: string, changes: Partial<ExperienceItem>) {
    onChange(experience.map((e) => (e.id === id ? { ...e, ...changes } : e)));
  }

  return (
    <Section
      id="experience"
      title="Experience log"
      intro="Things this persona has genuinely done or used. The writer may only claim first-hand experience that appears here; everything else is written as observation."
      action={
        <Button onClick={() => onChange([...experience, { id: newId(), item: "", detail: "", occurredAt: "" }])}>
          Add experience
        </Button>
      }
    >
      <Card padding="24">
        {experience.length === 0 && (
          <p className="type-small text-ink-3">
            Empty. With nothing here the writer treats itself as a pure observer and never claims to have used
            anything - which is the safe default, not a gap.
          </p>
        )}

        {experience.map((item) => (
          <ListRow key={item.id} onRemove={() => onChange(experience.filter((e) => e.id !== item.id))}>
            <div className="space-y-2">
              <TextInput
                value={item.item}
                onChange={(e) => update(item.id, { item: e.target.value })}
                placeholder="Built a local-first note tool"
              />
              <TextInput
                value={item.detail}
                onChange={(e) => update(item.id, { detail: e.target.value })}
                placeholder="Plain text files, no sync service."
              />
              <div className="flex items-center gap-2">
                <MicroLabel>when</MicroLabel>
                <TextInput
                  mono
                  value={item.occurredAt}
                  onChange={(e) => update(item.id, { occurredAt: e.target.value })}
                  placeholder="March 2026"
                  className="max-w-[200px]"
                />
              </div>
              <TextInput
                mono
                value={(item.sourceUrls ?? []).join(", ")}
                onChange={(e) =>
                  update(item.id, {
                    sourceUrls: e.target.value
                      .split(",")
                      .map((url) => url.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Source URLs, separated by commas"
                aria-label={`Sources for ${item.item || "experience"}`}
              />
            </div>
          </ListRow>
        ))}
      </Card>
    </Section>
  );
}
