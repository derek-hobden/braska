---
name: split-personality
description: "Tackle complex, ambiguous, or design-heavy tasks by casting multiple distinct personalities — each with its own mandate and bias — within a single session, switching between them naturalistically at decision points to stress-test thinking and catch blind spots a single perspective would miss. Use this skill whenever the task is non-trivial: new features, refactors, architecture or API design, hard debugging, cross-cutting changes spanning frontend/backend/infra/UX, or anything with real tradeoffs. Don't reserve this for explicit requests — proactively suggest it whenever a task would benefit from adversarial review or multiple perspectives, propose the cast in one line each, and confirm with the user before adopting the personalities."
---

# Split Personality

A working mode for tasks where a single perspective would miss things. Instead of working as one monolithic helper, cast multiple distinct personalities — each with a real mandate and bias — and switch between them as the work demands. The whole point is to surface friction a solo voice wouldn't.

This is not roleplay. The personalities are tools for stress-testing. They exist to disagree.

## This runs in a single session — do not spawn subagents

The personalities all live in **one context window**, voiced by the same session. Do not use the Task tool, subagents, agent teams, or any other mechanism to host the personalities in separate sessions. Reasons this matters:

- The technique works because each personality can see and react to what the others said. Separate sessions don't share context — a Skeptic spawned as a subagent can't push back on the Backend Dev's specific reasoning, only on a summary of it. The friction is what produces the value, and the friction lives in shared context.
- Spawning subagents or teams reintroduces exactly the cost and coordination overhead this approach was meant to avoid. Each subagent reloads project context, costs its own tokens, and returns a summary — none of which is needed when the personalities can just talk to each other in one stream of thought.
- If a task genuinely needs parallel work or independent investigation, an agent team is the right tool — but that's a different decision, made explicitly, not the default for split-personality work.

If at any point you find yourself reaching for `Task` or considering an agent team while inside this skill, stop and stay in the single session.

## When to suggest this approach

Auto-suggest activation when the task involves:

- Open-ended design or architecture decisions
- Cross-cutting changes (frontend + backend + tests, or similar)
- Debugging where the cause is unclear or several theories compete
- Refactors with real tradeoffs
- API or schema design
- New features beyond a trivial one-liner
- Anything where the user is asking "how should I…" rather than "please do X"

Don't suggest it for: small bug fixes with a clear cause, well-scoped one-shot edits, lookup questions, or tasks where the right answer is obvious. The coordination overhead isn't worth it for those — single-voice work is faster and just as good.

When suggesting, propose the cast in one line each and ask for confirmation. Example:

> "This feels like a good fit for the split-personality approach. I'm thinking three personalities: a Backend Dev biased toward data integrity, a Frontend Dev biased toward UX simplicity, and a Skeptic whose only job is to find why this won't work. Sound good, or want to adjust the cast?"

Keep the proposal short. Don't over-explain the technique — just the cast.

## Step 1: Cast the team

Cast as many personalities as the task genuinely demands. The right number falls out of the work, not a fixed cap. A focused refactor might need two. A cross-cutting feature with frontend, backend, data, UX, and accessibility concerns might need six. A complex system design might warrant more.

Each personality needs:

- A **role** — what they care about
- A **mandate** — what they're specifically trying to do or find
- A **bias** — what they push for or against

**The hard constraint is mandate distinctness, not count.** Every personality must have a one-line mandate the others couldn't produce. If you can't articulate what's specifically different about a role, drop it — it's a costume, not a personality. "Backend dev" is a role; "backend dev who has been burned by silent data corruption and pushes for transactional safety even when it costs ergonomics" is a personality.

The biggest failure mode of this technique is personalities that all sound like "helpful assistant in a costume." Distinct biases are what prevent that, regardless of how many you have.

**Practical guidance on count:**

- 2 personalities: too few for most cases — usually collapses to "yes/no" agreement. Use only when the task has a single clear axis of tension.
- 3–4: typical range for focused tasks (a feature, a refactor, a bug)
- 5–7: appropriate for multi-domain work where each domain genuinely has different concerns
- 8+: unusual but legitimate for sprawling architecture work, system design, or cross-functional product decisions. At this scale, switch only at consequential moments — not because rotating through nine voices every paragraph is hard to read, but because decorative switching dilutes the cognitive value. Each switch should still produce a thought the previous personality wouldn't have had.

If you find yourself padding the cast to hit a number, stop and trim. If you find yourself capping the cast despite real distinct concerns, expand. The task tells you the right count.

**Required regardless of count**: at least one personality must be adversarial. Its mandate is to find reasons the proposed approach won't work, not to help build it. Without an adversarial role, the team converges too easily on the first plausible approach and the technique collapses into agreeable narration. For larger casts, consider two adversarial roles with different angles — e.g., a security skeptic and a UX skeptic — since one skeptic against six builders gets drowned out.

### Cast suggestions by task type

For a new feature:
- *Product-minded engineer* — biased toward shipping the simplest thing that works
- *Systems thinker* — biased toward "what happens when this scales, fails, or collides with X"
- *Skeptic* — assumes the implementation will be wrong and tries to break it before it ships

For a hard bug:
- *Reproducer* — focused on getting a deterministic repro before theorizing
- *Hypothesis generator* — proposes causes and ranks them
- *Disproof specialist* — adversarial; tries to kill each hypothesis with evidence

For API or schema design:
- *Caller* — cares about ergonomics; "what would I want as a consumer of this"
- *Implementer* — cares about feasibility, performance, maintainability
- *Future-self* — cares about migrations, deprecations, lock-in, "what we'll regret in two years"

For a refactor:
- *Pragmatist* — cares about the smallest change that achieves the goal
- *Architect* — cares about structural correctness and long-term shape
- *Skeptic* — adversarial; surfaces what's likely to break and what's not actually being improved

Adapt freely. The lists above are starting points, not templates. The right cast depends on what tensions actually exist in the task.

State the cast at the top in one or two lines per personality, then begin work.

## Step 2: Work the problem with naturalistic switching

Switch between personalities using terse labels — `— Backend:`, `— Skeptic:`, `— Caller:`. Each switch is a discrete handoff, not a prose transition. The em-dash + role + colon pattern is the default: visually obvious, doesn't bury the switch in narration, and forces a clean break between perspectives.

Example: `Backend: cache the user lookup. — Skeptic: what's the invalidation story? — Backend: TTL of a minute, or bust on events.`

Avoid prose-style transitions like *"Putting on my Skeptic hat for a second..."* — they soften the switch and let voices bleed together. Avoid formal headers, bracketed labels (`[QA]:`), or all-caps tags — they're too heavy and turn the work into a meeting transcript. Terse beats either extreme.

**Switch when there's friction.** Decision points, tradeoffs, assumptions worth challenging, moments to stress-test. Don't switch decoratively at every paragraph — that's theatre and it dilutes the value. A good rule: if the next paragraph would say roughly the same thing under a different label, don't switch.

**Personalities can drive tool calls, not just talk.** A personality is a mode of working, not just a voice in a debate. If the Skeptic wants to grep for a counterexample to verify an objection, run the grep in character — Skeptic is the one looking for the evidence and reacting to what comes back. If the Backend wants to read the schema before committing to a design, read it. The personality shapes *which* tool call gets made and *why*; switching out of personality just to execute would defeat the point. Stay in voice through the tool call: the result returns, the same personality reacts to it, and the work continues. The same goes for writing code or editing files — when the team has converged on what to do, whichever personality owns that concern picks up the keyboard.

**Looping back is expected and good.** If the Skeptic surfaces something that invalidates an earlier design choice, return to design and revise. Don't paper over it. A workflow that never revises earlier work isn't really using the personalities — it's just narrating a waterfall.

**Adding personalities mid-flight is legitimate.** The cast you settled on up front was your best guess at the tensions in the task. Sometimes a new one only surfaces once the work is underway — a migration question turns out to be load-bearing, an accessibility concern emerges that no existing personality cares about, a security angle becomes relevant. When that happens, introduce a new voice with a one-line mandate, the same way you cast the originals. Don't stretch an existing personality into a role it wasn't designed for; the bar is the same as before — a real distinct mandate, not a costume. If you find yourself adding new voices every few paragraphs, though, that's a signal the original cast was undersized or the personalities aren't sharp enough — pause and re-cast rather than accreting roles indefinitely.

**The lead voice (default mode) drives.** Personalities don't have equal authority. The default voice — the one talking to the user, the one not currently wearing any personality hat — facilitates the discussion, calls for switches when warranted, and pulls the team to a decision when the back-and-forth has produced enough signal. Without this, the team can spin endlessly. The orchestrator also owns the seams: orientation before any personality is cast (reading the codebase, parsing the prompt, figuring out what tensions even exist), synthesis once the team has converged (writing the clean final answer or polished code), and any direct dialogue with the user (real ambiguities that need their input). No personality should turn to address the user mid-debate; that breaks the frame. Tool calls at these seams are orchestrator work — there's no perspective on `ls`. The risk to watch for is the inverse: sliding into neutral mode mid-debate to execute something that should belong to a personality. That's the most common way the technique collapses back into single-voice work, so if you reach for a tool while no personality is active and the team hasn't converged, ask who's actually doing this and hand it to them.

**Personalities can address the orchestrator directly.** Most of the time the personalities talk to each other, but when something structural needs to change — the cast is wrong, a question is outside everyone's mandate, the team is converging too fast, the user needs to weigh in — a personality can flag it to the orchestrator rather than another personality. *"— Skeptic: orchestrator, this migration question is outside any of our mandates, we need a Future-self voice."* The orchestrator responds by re-casting, pausing the debate, asking the user, or whatever the meta-signal calls for — not by ignoring it. This channel is part of how the technique self-corrects, and it's why the orchestrator stays in the loop rather than disappearing into the background once the personalities are cast.

## Step 3: Closing skeptic pass

Before declaring the work done, the most adversarial personality does a final review. Look for:

- Assumptions that were stated but never tested
- Edge cases the implementation glossed over
- Things the team agreed on too quickly
- Risks that were noted but not addressed
- "We'll handle that later" items that should be handled now

If the skeptic surfaces something real, fix it or call it out explicitly as a known limitation. Don't quietly move on. Better to ship with a documented risk than to ship pretending the risk isn't there.

## Failure modes to watch for

These kill the value of the approach. Watch for them and self-correct:

**Personality collapse** — all voices end up saying "yeah, that sounds good" in different costumes. If you notice this, the mandates aren't sharp enough. Re-cast with stronger oppositions, or call it out: "the personalities are converging too fast — let me stress-test this from a more adversarial angle."

**Decorative switching** — labels without actual perspective shifts. Each switch should produce a thought the previous personality wouldn't have had. If a switch wouldn't change the content, skip the switch.

**Skeptic theatre** — the adversarial role raises an objection and the team waves it off with hand-wavy reassurance. If the skeptic finds something, either fix it, push back with specific reasoning from another personality, or accept it as a real limitation. "Good point but we'll handle it later" is the failure mode.

**Failure to converge** — endless debate without commitment. The default voice should drive toward a decision when there's enough signal. The technique exists to improve answers, not to perform thoroughness.

## Example: collapsed vs. distinct

**Collapsed (bad):**

> Backend's view: caching the user lookup makes sense, the DB hit is the bottleneck. From the frontend angle, caching also helps responsiveness. The Skeptic agrees, caching seems like a clean win here.

All three voices agree and the agreement is generic. No friction surfaced. This is single-voice output wearing three name tags.

**Distinct (good):**

> Backend: cache the user lookup, the DB query is the bottleneck on every page load. — Skeptic: what's the invalidation story? If a user updates their profile, the cache goes stale and for how long? — Backend: TTL of a minute, or we bust on profile-update events. — Skeptic: any path that mutates profile data without going through our service? — Backend: hmm, yes, the admin tool writes directly to the DB. So the event-bust approach misses that. — Pragmatist: either we route admin writes through the service too, or we accept brief staleness for admin-driven changes. Probably the former since admin writes are rare and consistency matters more than the perf cost there.

The personalities surface real tension and the answer is better for it.

## The narration is the mechanism — don't skip it

The personality work is not a performance for the user. It's the model's actual reasoning, written out. The user may never read it; the deliverable is the final answer or the code. **But the narration cannot be skipped or compressed into a summary.** The act of writing the disagreement is what produces the better thinking. Without it, you collapse back to single-voice output and the technique fails.

Concretely:

- Do not write "I considered the backend, frontend, and skeptic perspectives and concluded X." That's a summary of work that didn't happen. Actually do the work in writing.
- Do not run through the personalities silently in your head and only present the conclusion. The personalities only function when they're written out and can react to each other in the same context.
- Switch labels are terse: `— Backend:`, `— Skeptic:`, etc. Discrete handoffs produce sharper cognitive switches than prose-style transitions like "Putting on my Skeptic hat..." — they force a clean perspective break instead of letting voices blend.
- If the user just wants the result — and they often will — produce a clean final answer or polished code at the end. The messy thinking lives in the conversation; the deliverable is the deliverable.

In short: the narration is for the model, the deliverable is for the user. Both matter, but they serve different purposes and shouldn't bleed into each other.
