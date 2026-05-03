import { openai } from "@workspace/integrations-openai-ai-server";
import type {
  RigorReportJson,
  AiSurveyJson,
  AiSurveyPassJson,
} from "@workspace/db";
import { logger } from "./logger";

export const AI_MODEL = "gpt-5.4";

const PERSONAS: { name: string; brief: string }[] = [
  { name: "The Skeptic", brief: "rigorously interrogates assumptions and demands evidence" },
  { name: "Domain Expert", brief: "deeply versed in the relevant field's prior literature and methods" },
  { name: "The Generalist", brief: "intelligent reader from outside the field assessing clarity and stakes" },
  { name: "The Methodologist", brief: "evaluates research design, statistics, and reproducibility" },
  { name: "The Outsider", brief: "creative thinker probing for unstated assumptions and overlooked angles" },
];

function clamp(n: unknown, lo: number, hi: number): number {
  const x = typeof n === "number" && Number.isFinite(n) ? n : lo;
  return Math.min(hi, Math.max(lo, x));
}

function safeJson<T>(text: string, fallback: T): T {
  try {
    const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(trimmed) as T;
  } catch {
    return fallback;
  }
}

export type PaperPayload = {
  title: string;
  abstract: string;
  body: string;
  fields: string[];
  references: { citation: string; url: string | null }[];
};

function paperPrompt(p: PaperPayload): string {
  const refs = p.references.length
    ? p.references.map((r, i) => `[${i + 1}] ${r.citation}${r.url ? ` (${r.url})` : ""}`).join("\n")
    : "(none provided)";
  return `Title: ${p.title}
Fields: ${p.fields.join(", ") || "(unspecified)"}

Abstract:
${p.abstract}

Body:
${p.body}

References:
${refs}`;
}

export async function generateRigorReport(p: PaperPayload): Promise<RigorReportJson> {
  const sys = `You are a meticulous referee writing in the spirit of Whitehead and Russell's Principia Mathematica — exacting, dispassionate, structurally rigorous. You evaluate scientific submissions across all fields. Score each axis 0-10 (10 = exceptional). Be candid; do not flatter. Respond with strict JSON only — no prose, no markdown fences.`;
  const user = `Evaluate this submission and return JSON with this exact shape:
{
  "logicScore": number,
  "methodologyScore": number,
  "citationsScore": number,
  "falsifiabilityScore": number,
  "noveltyScore": number,
  "critique": string,            // 3-6 sentences, structural assessment
  "strengths": string[],         // 2-5 short bullets
  "weaknesses": string[]         // 2-5 short bullets
}

Submission:
${paperPrompt(p)}`;

  const completion = await openai.chat.completions.create({
    model: AI_MODEL,
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  type Parsed = Partial<{
    logicScore: number;
    methodologyScore: number;
    citationsScore: number;
    falsifiabilityScore: number;
    noveltyScore: number;
    critique: string;
    strengths: string[];
    weaknesses: string[];
  }>;
  const parsed = safeJson<Parsed>(raw, {});
  const logicScore = clamp(parsed.logicScore, 0, 10);
  const methodologyScore = clamp(parsed.methodologyScore, 0, 10);
  const citationsScore = clamp(parsed.citationsScore, 0, 10);
  const falsifiabilityScore = clamp(parsed.falsifiabilityScore, 0, 10);
  const noveltyScore = clamp(parsed.noveltyScore, 0, 10);
  const overallScore =
    (logicScore + methodologyScore + citationsScore + falsifiabilityScore + noveltyScore) / 5;
  return {
    overallScore: Math.round(overallScore * 100) / 100,
    logicScore,
    methodologyScore,
    citationsScore,
    falsifiabilityScore,
    noveltyScore,
    critique: typeof parsed.critique === "string" ? parsed.critique : "",
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 6) : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses.map(String).slice(0, 6) : [],
  };
}

async function singlePersona(p: PaperPayload, persona: { name: string; brief: string }): Promise<AiSurveyPassJson> {
  const sys = `You are "${persona.name}" — ${persona.brief}. You are part of a multi-persona quick-survey on a citizen science submission. Voice the persona authentically. Respond with strict JSON only.`;
  const user = `Read the submission. Return JSON:
{
  "verdict": "endorse" | "mixed" | "reject",
  "confidence": number,   // 0..1
  "rationale": string     // 2-4 sentences in your persona's voice
}

Submission:
${paperPrompt(p)}`;
  const completion = await openai.chat.completions.create({
    model: AI_MODEL,
    max_completion_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  type Parsed = Partial<{ verdict: string; confidence: number; rationale: string }>;
  const parsed = safeJson<Parsed>(raw, {});
  const verdict: AiSurveyPassJson["verdict"] =
    parsed.verdict === "endorse" || parsed.verdict === "reject" ? parsed.verdict : "mixed";
  return {
    persona: persona.name,
    verdict,
    confidence: clamp(parsed.confidence, 0, 1),
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
  };
}

export async function generateAiSurvey(p: PaperPayload): Promise<AiSurveyJson> {
  const passes = await Promise.all(PERSONAS.map((persona) => singlePersona(p, persona)));
  const verdictWeights: Record<AiSurveyPassJson["verdict"], number> = {
    endorse: 1,
    mixed: 0.5,
    reject: 0,
  };
  const totalConfidence = passes.reduce((s, x) => s + x.confidence, 0) || 1;
  const weighted =
    passes.reduce((s, x) => s + verdictWeights[x.verdict] * x.confidence, 0) / totalConfidence;
  const confidence = clamp(weighted, 0, 1);
  const endorse = passes.filter((x) => x.verdict === "endorse").length;
  const reject = passes.filter((x) => x.verdict === "reject").length;
  const consensus =
    endorse > reject + 1
      ? "Personas largely endorse the submission, with some reservations."
      : reject > endorse + 1
        ? "Personas largely push back; the submission needs substantial revision."
        : "Personas are split — the submission has a real case to make and real holes to fill.";
  return {
    confidence: Math.round(confidence * 100) / 100,
    consensus,
    passes,
  };
}

export async function generateAiBundle(p: PaperPayload): Promise<{ rigor: RigorReportJson; survey: AiSurveyJson }> {
  try {
    const [rigor, survey] = await Promise.all([generateRigorReport(p), generateAiSurvey(p)]);
    return { rigor, survey };
  } catch (err) {
    logger.error({ err }, "AI generation failed; using heuristic fallback");
    const len = p.body.length + p.abstract.length;
    const refs = p.references.length;
    const base = clamp(4 + Math.log10(Math.max(len, 1)) + Math.min(refs, 6) * 0.3, 1, 9);
    const rigor: RigorReportJson = {
      overallScore: Math.round(base * 100) / 100,
      logicScore: base,
      methodologyScore: base,
      citationsScore: clamp(base + (refs >= 3 ? 1 : -1), 0, 10),
      falsifiabilityScore: base,
      noveltyScore: base,
      critique: "AI service unavailable — heuristic placeholder. Re-run analysis when service recovers.",
      strengths: ["Submission accepted into the queue"],
      weaknesses: ["AI critique pending"],
    };
    const survey: AiSurveyJson = {
      confidence: 0.5,
      consensus: "Awaiting full AI survey.",
      passes: PERSONAS.map((p) => ({ persona: p.name, verdict: "mixed", confidence: 0.5, rationale: "Pending." })),
    };
    return { rigor, survey };
  }
}
