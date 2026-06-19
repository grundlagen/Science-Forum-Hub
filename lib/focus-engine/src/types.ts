/**
 * Focus Guard — shared vocabulary.
 *
 * Focus Guard is a deep-work companion for the Science Forum Hub. Reading a
 * dense paper, writing a rigorous review, or untangling a flawed proof are all
 * cognitively demanding, attention-hungry acts. Focus Guard's job is to help a
 * researcher *protect* a block of attention and then *learn* from it.
 *
 * Every type and constant in this package is traceable to a piece of attention
 * or motivation psychology. The intent is not to gamify or to manufacture
 * compulsion — it is to lower the friction of doing focused work and to give
 * honest, non-punitive feedback afterwards. See `BASIS` strings throughout.
 */

/**
 * A timeboxing strategy. Each preset encodes a different, evidence-informed
 * rhythm of work and rest. Users pick one (autonomy — Self-Determination
 * Theory, Deci & Ryan 2000); Focus Guard never forces a cadence.
 */
export type FocusTechnique =
  | "pomodoro" // 25/5 cycles (Cirillo)
  | "ultradian" // ~90 min work blocks following the Basic Rest-Activity Cycle (Kleitman)
  | "flowtime" // work until focus naturally ebbs, then rest proportionally
  | "deep_work" // long, single-task, distraction-free blocks (Newport)
  | "custom"; // user-defined work/break minutes

/**
 * What kind of cognitive work the session is for. Mode shifts the recommended
 * block length: generative work (writing, synthesizing) benefits from longer,
 * uninterrupted runways; consumptive work (reading) tolerates shorter cycles.
 */
export type FocusMode =
  | "reading" // reading a paper
  | "reviewing" // casting a structured review / vote
  | "writing" // authoring a paper or revision
  | "commenting" // threaded critique
  | "synthesizing" // cross-paper synthesis, literature mapping
  | "exploring"; // open-ended browsing of the feed

/** Lifecycle of a focus session. */
export type SessionState =
  | "planned" // intention set, not yet started
  | "active" // currently in a work block
  | "paused" // temporarily suspended (a break, or stepped away)
  | "completed" // ended at or beyond plan
  | "abandoned"; // ended early without finishing the intention

/**
 * How forcefully the guard intervenes on a context-switch attempt.
 * Environment design beats willpower (the more reliable lever for self-control
 * is reducing friction/temptation, not "trying harder"), so stricter levels
 * remove the choice rather than nagging.
 */
export type GuardLevel =
  | "gentle" // surfaces a reminder, never blocks
  | "standard" // warns and asks for confirmation on a switch
  | "strict"; // blocks non-target navigation until a break or session end

/**
 * Circadian preference. Analytic, error-sensitive work is best done at one's
 * peak; administrative work at the trough; insight work during recovery
 * (Pink 2018, summarizing Horne-Östberg MEQ chronotype research).
 */
export type Chronotype =
  | "lark" // morning peak
  | "third_bird" // mid-morning peak (the ~60-80% of people in the middle)
  | "owl"; // evening peak

/** A discrete thing that happened inside a session. */
export type FocusEventKind =
  | "distraction" // an unmanaged pull of attention (penalized)
  | "parked_thought" // an intrusive thought written down to release it (Zeigarnik) — barely penalized
  | "pause"
  | "resume"
  | "break_start"
  | "break_end"
  | "milestone" // a chunk of the intention completed (immediate feedback — flow)
  | "note"
  | "guard_trip"; // the guard intercepted a context switch

/** How fully the session's stated intention was realised. */
export type IntentionOutcome = "completed" | "partial" | "not_met" | "unset";

/** Qualitative band a 0-100 score falls into, for UI copy and color. */
export type ScoreTier = "exemplary" | "strong" | "solid" | "developing" | "scattered";
