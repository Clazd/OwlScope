"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/common/Button";
import { Card } from "@/components/common/Card";
import { DiffList, type DiffEntry } from "@/components/common/DiffList";
import { MicroLabel } from "@/components/common/MicroLabel";
import { useToast } from "@/components/common/Toast";
import type { PersonaImportOutput, PersonaImportSource } from "@/domain/persona/import-schema";
import type { PersonaSnapshot } from "@/domain/persona/schema";
import { Section } from "./section-chrome";

const MEMORY_PROFILE_PROMPT = `Create a portable profile of me for a separate AI writing assistant, using only personal context that is actually available to you now.

First, state which kinds of context you were able to use: this conversation, saved memories, referenced past chats, custom instructions, or files. Do not say you reviewed all of my chats unless you truly had access to all of them. If a detail is uncertain, label it as an inference with low, medium, or high confidence.

Then summarize what you know about:
- who I am and what I do
- the audiences I want to help
- subjects I genuinely know, with specific subtopics
- projects, tools, products, or methods I have personally built, tested, or used
- stable beliefs and opinions I repeatedly express
- topics, claims, or styles I avoid
- how I naturally communicate: formality, detail, humour, energy, technical depth, first-person voice, questions, hooks, emoji, hashtags, and typical structure
- exact writing samples that I wrote, only if you can quote them accurately
- public URLs I previously supplied that genuinely belong to me or support my experience

Separate explicit facts from your interpretations. Do not flatter me, diagnose me, fill gaps from stereotypes, invent writing samples, or invent URLs. Mark contradictions and missing information clearly.

Return one self-contained profile in readable Markdown with these headings: Context used, Identity, Audience, Knowledge areas, Content pillars, Beliefs, Boundaries, Voice, First-hand experience, My writing samples, Source URLs, Uncertainties, and Missing information.`;

const INTERVIEW_PROMPT = `Help me create a portable profile for an AI writing assistant.

Start by summarizing what you already know about me from the context you can actually access. State whether that came from this chat, saved memories, referenced past chats, custom instructions, or files. Do not claim access to conversations you cannot inspect.

Interview me one question at a time. Cover:
- who I am, what I do, and the audience I want to help
- subjects I genuinely know, including specific subtopics and my level of first-hand experience
- stable beliefs and opinions I am comfortable publishing
- topics or claims I do not want the assistant to make
- how I naturally speak and write: formality, detail, humour, energy, technical depth, hooks, questions, emoji, hashtags, and first-person voice
- projects, products, tools, and methods I have personally built, tested, or used, including roughly when
- writing samples and public URLs that genuinely belong to me or support my experience

Do not flatter me, diagnose my personality, invent facts, or fill gaps from stereotypes. Clearly separate what I explicitly told you from your uncertain interpretations. Keep exact URLs unchanged and mark unknown fields as unknown.

When the interview is complete, return one self-contained profile. JSON is welcome, but readable Markdown is also fine. Include identity, audience, knowledge areas, content pillars, beliefs, boundaries, voice preferences, first-hand experience, writing samples, source URLs, uncertainties, and anything you intentionally left out.`;

const JSON_EXPORT_PROMPT = `Export what you currently know about me as portable JSON for a separate AI writing assistant.

Use only context genuinely available to you now. Before the JSON, write one short sentence naming the context types you could access: current conversation, saved memories, referenced past chats, custom instructions, or files. Never claim you searched every chat unless that is actually true.

The JSON must have these top-level keys:
{
  "identity": { "name": null, "description": null, "languages": [], "audience": null, "focus": null, "identityStatement": null },
  "knowledgeAreas": [{ "name": "", "description": "", "subtopics": [], "confidence": "high|medium|low", "basis": "explicit|inferred" }],
  "beliefs": [{ "statement": "", "strength": "mild|moderate|strong", "confidence": "high|medium|low" }],
  "boundaries": [],
  "voice": { "description": "", "preferences": [], "never": [], "switches": {} },
  "firstHandExperience": [{ "item": "", "detail": "", "when": "", "sourceUrls": [] }],
  "writingSamples": [{ "text": "", "owner": "me|someone else", "source": "" }],
  "sourceUrls": [],
  "contradictions": [],
  "uncertainties": [],
  "unknowns": []
}

Use null or an empty array when information is unavailable. Do not invent facts, personality traits, writing, dates, or URLs. Quote my writing only when you can reproduce my actual words accurately. Keep explicit facts separate from inferred patterns.`;

const PROMPT_EXAMPLES = [
  {
    title: "Use what ChatGPT remembers",
    description: "Best first step. Exports supported facts and labels uncertain patterns.",
    prompt: MEMORY_PROFILE_PROMPT,
  },
  {
    title: "Remember, then interview me",
    description: "Fills important gaps one question at a time before producing the profile.",
    prompt: INTERVIEW_PROMPT,
  },
  {
    title: "Strict JSON export",
    description: "Useful when you want a portable structured backup as well as an import.",
    prompt: JSON_EXPORT_PROMPT,
  },
] as const;

interface ImportResponse {
  proposal: PersonaImportOutput;
  snapshot: PersonaSnapshot;
  changes: DiffEntry[];
  sources: PersonaImportSource[];
  runId: string;
  usage: {
    model: string;
    tokensIn: number;
    tokensOut: number;
    costEstimate: number;
    sandbox: boolean;
  };
}

interface Props {
  snapshot: PersonaSnapshot;
  onUseProposal: (snapshot: PersonaSnapshot) => void;
}

function proposalCoverage(proposal: PersonaImportOutput): string[] {
  const items: string[] = [];
  const identityValues = Object.values(proposal.identity).filter((value) => value !== null && value.trim().length > 0);
  const sliderCount = Object.values(proposal.sliders).filter((value) => value !== null).length;
  const switchCount = Object.values(proposal.switches).filter((value) => value !== null).length;

  if (identityValues.length > 0) items.push("Identity");
  if (proposal.pillars.length > 0) items.push(`${proposal.pillars.length} pillar${proposal.pillars.length === 1 ? "" : "s"}`);
  if (proposal.beliefs.length > 0) items.push(`${proposal.beliefs.length} belief${proposal.beliefs.length === 1 ? "" : "s"}`);
  if (proposal.boundaries.length > 0) items.push(`${proposal.boundaries.length} boundar${proposal.boundaries.length === 1 ? "y" : "ies"}`);
  if (proposal.voiceRules.length > 0) items.push(`${proposal.voiceRules.length} voice rule${proposal.voiceRules.length === 1 ? "" : "s"}`);
  if (sliderCount > 0) items.push(`${sliderCount} voice slider${sliderCount === 1 ? "" : "s"}`);
  if (switchCount > 0) items.push(`${switchCount} voice switch${switchCount === 1 ? "" : "es"}`);
  if (proposal.experience.length > 0) items.push(`${proposal.experience.length} experience item${proposal.experience.length === 1 ? "" : "s"}`);
  if (proposal.writingSamples.length > 0) items.push(`${proposal.writingSamples.length} writing sample${proposal.writingSamples.length === 1 ? "" : "s"}`);
  return items;
}

export function PersonaInbox({ snapshot, onUseProposal }: Props) {
  const toast = useToast();
  const [input, setInput] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const analysedFrom = useRef<PersonaSnapshot | null>(null);
  const coverage = result ? proposalCoverage(result.proposal) : [];

  async function copyPrompt(prompt: string, label: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.show(`Copied ${label.toLowerCase()}.`);
    } catch {
      toast.show("The prompt could not be copied.", "failure");
    }
  }

  function resetInbox() {
    setInput("");
    setResult(null);
    analysedFrom.current = null;
    toast.show("Persona inbox reset. Your saved Brain was not changed.");
  }

  async function analyse() {
    if (input.trim().length < 20) {
      toast.show("Paste a little more detail first.", "failure");
      return;
    }
    const base = snapshot;
    analysedFrom.current = base;
    setAnalysing(true);
    setResult(null);
    try {
      const response = await fetch("/api/persona/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, snapshot: base }),
      });
      const body = (await response.json()) as ImportResponse & { error?: string };
      if (!response.ok) {
        toast.show(body.error ?? "The profile could not be analysed.", "failure");
        return;
      }
      setResult(body);
      toast.show(
        body.changes.length > 0
          ? `Prepared ${body.changes.length} proposed Brain change${body.changes.length === 1 ? "" : "s"}.`
          : "Nothing new was found in that profile.",
      );
    } catch (error) {
      toast.show(`The profile could not be analysed: ${(error as Error).message}`, "failure");
    } finally {
      setAnalysing(false);
    }
  }

  function useProposal() {
    if (!result) return;
    const addedSamples = result.snapshot.samples.length - snapshot.samples.length;
    if (analysedFrom.current !== snapshot) {
      toast.show("The Brain changed after this preview. Analyse the paste again so no edits are overwritten.", "failure");
      setResult(null);
      return;
    }
    onUseProposal(result.snapshot);
    setResult(null);
    toast.show(
      addedSamples > 0 && !result.snapshot.fingerprint
        ? "Added the proposal and writing samples. Review the diff, then analyse Voice fingerprint."
        : "Added the proposal to your draft. Review the diff, then save it as a new version.",
    );
  }

  return (
    <Section
      id="inbox"
      title="Persona inbox"
      intro="Paste a ChatGPT profile, notes, interview answers, Markdown, or JSON. The AI turns meaning into a reviewable Brain proposal; it never saves directly."
      action={<Button onClick={() => copyPrompt(MEMORY_PROFILE_PROMPT, "memory profile prompt")}>Copy best prompt</Button>}
    >
      <Card padding="24">
        <MicroLabel strong>Prompts to use in ChatGPT</MicroLabel>
        <p className="type-small mt-2 max-w-[700px] text-ink-3">
          ChatGPT may reference useful past context without retaining every detail. These prompts make it disclose what it could access and distinguish remembered facts from inference.
        </p>
        <div className="mt-4 divide-y divide-rule">
          {PROMPT_EXAMPLES.map((example) => (
            <details key={example.title} className="group py-3 first:pt-0 last:pb-0">
              <summary className="cursor-pointer list-none rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ink">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="type-body-strong text-ink">{example.title}</p>
                    <p className="type-small mt-1 text-ink-3">{example.description}</p>
                  </div>
                  <span aria-hidden className="type-data text-ink-3 group-open:rotate-45">+</span>
                </div>
              </summary>
              <div className="mt-3 rounded-control border border-rule bg-surface-sunken p-3">
                <pre className="type-data max-h-[320px] overflow-auto whitespace-pre-wrap text-ink-2">{example.prompt}</pre>
                <Button className="mt-3" onClick={() => copyPrompt(example.prompt, example.title)}>
                  Copy this prompt
                </Button>
              </div>
            </details>
          ))}
        </div>
      </Card>

      <Card padding="24" className="mt-4">
        <label htmlFor="persona-inbox-input" className="type-body-strong text-ink">
          Tell the Brain about you
        </label>
        <p className="type-small mt-1 text-ink-3">
          Perfect JSON is unnecessary. Include links only when they genuinely describe your work or experience; at most five are read.
        </p>
        <textarea
          id="persona-inbox-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Paste a profile, messy JSON, or write naturally: I build…, I know…, I believe…, never write…, my style is…"
          rows={10}
          maxLength={50_000}
          className="type-body mt-4 w-full resize-y rounded-control border border-rule-strong bg-surface px-3 py-3 text-ink placeholder:text-ink-3"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={analyse} disabled={analysing || input.trim().length < 20}>
            {analysing ? "Reading your profile" : "Prepare Brain changes"}
          </Button>
          <Button variant="quiet" onClick={resetInbox} disabled={!input && !result}>
            Reset inbox
          </Button>
          <MicroLabel>{input.length.toLocaleString()} / 50,000 characters</MicroLabel>
        </div>
      </Card>

      {result && (
        <div className="mt-4 space-y-4">
          <Card padding="24">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
              <div>
                <MicroLabel strong>AI proposal</MicroLabel>
                <p className="type-body mt-2 max-w-[680px] text-ink">{result.proposal.summary}</p>
              </div>
              <MicroLabel>{result.usage.model}{result.usage.sandbox ? " · sandbox" : ""}</MicroLabel>
            </div>

            <div className="border-b border-rule py-4">
              <MicroLabel strong>Will update</MicroLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {coverage.map((item) => (
                  <span key={item} className="type-small rounded-pill border border-rule-strong px-3 py-1 text-ink-2">
                    {item}
                  </span>
                ))}
                {coverage.length === 0 && (
                  <span className="type-small text-ink-3">No concrete Brain fields yet.</span>
                )}
              </div>
              <p className="type-small mt-2 text-ink-3">
                Voice descriptions update rules, sliders and switches. Voice fingerprint updates only after real
                writing samples are added and analysed.
              </p>
            </div>

            <div className="max-h-[520px] overflow-y-auto py-4">
              <DiffList entries={result.changes} />
            </div>

            {(result.proposal.uncertainties.length > 0 || result.proposal.ignored.length > 0) && (
              <div className="grid gap-4 border-t border-rule pt-4 sm:grid-cols-2">
                {result.proposal.uncertainties.length > 0 && (
                  <div>
                    <MicroLabel strong>Needs your judgement</MicroLabel>
                    <ul className="type-small mt-2 list-disc space-y-1 pl-4 text-ink-2">
                      {result.proposal.uncertainties.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
                {result.proposal.ignored.length > 0 && (
                  <div>
                    <MicroLabel strong>Not imported</MicroLabel>
                    <ul className="type-small mt-2 list-disc space-y-1 pl-4 text-ink-2">
                      {result.proposal.ignored.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>

          {result.sources.length > 0 && (
            <Card padding="24">
              <MicroLabel strong>Source check</MicroLabel>
              <ul className="mt-3 divide-y divide-rule">
                {result.sources.map((source) => (
                  <li key={source.url} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="type-body-strong text-ink">{source.title ?? source.url}</span>
                      <MicroLabel>{source.status}</MicroLabel>
                    </div>
                    <a href={source.url} target="_blank" rel="noreferrer" className="type-data break-all text-ink-2 underline">
                      {source.url}
                    </a>
                    <p className="type-small mt-1 text-ink-3">{source.message}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={useProposal} disabled={result.changes.length === 0}>
              Add proposal to Brain draft
            </Button>
            <Button variant="quiet" onClick={() => setResult(null)}>Discard proposal</Button>
            <MicroLabel>Nothing is saved until you approve the normal Brain version diff.</MicroLabel>
          </div>
        </div>
      )}
    </Section>
  );
}
