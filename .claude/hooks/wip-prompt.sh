#!/bin/bash
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
INPUT=$(cat)

PROMPT=$(printf '%s' "$INPUT" | jq -r '.prompt // ""')
WIP="$PROJECT_DIR/work-in-progress.html"
BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
TS=$(date -u +"%Y-%m-%dT%H:%MZ")

is_default() {
  case "$1" in main|master|develop|trunk|"") return 0 ;; *) return 1 ;; esac
}

if is_default "$BRANCH"; then
  exit 0
fi

if [ -f "$WIP" ]; then
  WIP_AGE=$(( ($(date +%s) - $(stat -f %m "$WIP" 2>/dev/null || stat -c %Y "$WIP" 2>/dev/null || date +%s)) / 60 ))
  SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // ""')
  STATE_DIR="$PROJECT_DIR/.claude/state"
  RULES_MARKER="$STATE_DIR/wip-rules-shown"
  SHOW_FULL=1
  if [ -n "$SESSION_ID" ] && [ -f "$RULES_MARKER" ] && [ "$(cat "$RULES_MARKER" 2>/dev/null)" = "$SESSION_ID" ]; then
    SHOW_FULL=0
  fi

  if [ "$SHOW_FULL" -eq 1 ]; then
    mkdir -p "$STATE_DIR"
    [ -n "$SESSION_ID" ] && printf '%s' "$SESSION_ID" > "$RULES_MARKER"
    RULES_BLOCK="FULL UPDATE RULES (shown once per session, digest after):
(1) tick completed subtasks class=\"done\" and advance the class=\"active\" marker to the exact next subtask;
(2) DEFERRING — if you push a subtask to later, mark it class=\"deferred\", add an inline <em>Deferred YYYY-MM-DDTHH:MMZ — reason; revisit when …</em>, AND add a matching Follow-ups entry. Never fudge deferred items as done; never leave them silently pending;
(3) update the top-of-file <p class=\"status\"> line whenever a milestone advances OR a subtask is deferred — Status must reflect TRUTH, never round up, always flag deferrals;
(4) when something passes the Runbook's verify check, add an anchor commit under Runbook so future agents can git-bisect;
(5) log significant decisions in Decisions, rejected approaches as a new .dont entry in Don'ts, mid-stream pivots in Course corrections, subagent findings in Subagent notes;
(6) CASCADE COMPLETION — when every direct child of a parent <li> is class=\"done\" OR class=\"deferred\", mark that parent class=\"done\" too, recursively upward (deferred children count as resolved for cascade);
(7) SIZE DISCIPLINE — once a milestone <li> becomes class=\"done\", wrap its nested <ul class=\"check\"> in <details><summary>Milestone X — name (N done[, M deferred]) — anchor <commit></summary>...</details> — include the deferred count when M > 0;
(8) TASKS LIST — every <ul> inside the Tasks section MUST carry class=\"check\" (including every nested sub-<ul> under a task <li>). No bare <ul>. The wip-edit hook flags any bare <ul> in Tasks;
(9) QUESTIONS — Questions section holds Q&A pair blocks. APPEND new questions at the bottom; when you answer one, MUTATE its block in place to fill in the <p class=\"answer\"> and the <time class=\"answered\">, and drop the .open class from the .q div. Never delete a resolved question. Decisions section is for a-priori choices that were not first raised as a question;
(10) ORDERING — every timelined section (Anchor commits, Questions [new ones only], Decisions, Don'ts, Course corrections, Subagent notes, Follow-ups) is ASCENDING chronological order: APPEND new entries at the BOTTOM. Never prepend. EXCEPTION: in Questions, answering an existing open question is an in-place mutation, not a re-order;
(11) TIMESTAMPS — every timestamp in this file uses YYYY-MM-DDTHH:MMZ (UTC, no seconds). This covers <time> elements, Deferred inline markers, Follow-up date prefixes, and Anchor commit dates. Run \`date -u +\"%Y-%m-%dT%H:%MZ\"\` to get the current value.
NEVER rewrite the Original prompt section. Touch the file only when there is something meaningful to record."
  else
    RULES_BLOCK="WIP rules: Tick done • Advance active • Update status • Defer with reason + Follow-up • Cascade parents • Fold completed milestones • Anchor commits • Tasks <ul> class=\"check\" always • Questions append; answer in place (never delete) • Timestamps YYYY-MM-DDTHH:MMZ everywhere • Ascending order • Never touch Original prompt. (Full rules shown once per session — already shown earlier in this session.)"
  fi

  MSG="work-in-progress.html (\`$WIP\`) was last updated ${WIP_AGE}m ago. Keep it fresh as you work the user's latest prompt.

${RULES_BLOCK}"

  jq -n --arg msg "$MSG" '{
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: $msg
    }
  }'
  exit 0
fi

# NOTE: use `read -r -d ''` rather than `TEMPLATE=$(cat <<'HTML' ... HTML)` —
# bash 3.2 (the macOS system bash) has a parser bug where apostrophes inside a
# heredoc body that's inside $(...) are tracked as if they opened single-quoted
# strings. Any future edit to the heredoc body that changes apostrophe count
# would silently break the script. `read -r -d ''` reads the heredoc directly
# into the variable and sidesteps the bug. `|| true` is needed because `read`
# returns non-zero when it hits EOF without finding the delimiter.
read -r -d '' TEMPLATE <<'HTML' || true
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Work in Progress — {{BRANCH}}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 80ch; margin: 2rem auto; padding: 0 1rem; color: #222; line-height: 1.5; }
  h1, h2 { border-bottom: 1px solid #ddd; padding-bottom: .25rem; }
  .meta { color: #777; font-size: .9rem; }
  .status { font-weight: 600; color: #0d47a1; margin: 0 0 1.5rem; padding: .5rem .9rem; background: #e3f2fd; border-left: 3px solid #1565c0; border-radius: 3px; }
  blockquote { border-left: 3px solid #888; padding: .25rem .9rem; color: #444; background: #fafafa; }
  ul.check { list-style: none; padding-left: .5rem; }
  ul.check ul { padding-left: 1.5rem; margin: .1rem 0; }
  ul.check li { padding: .1rem 0; }
  ul.check li.done { color: #888; text-decoration: line-through; }
  ul.check li.active { font-weight: bold; }
  ul.check li.deferred { color: #888; }
  ul.check li::before { content: "☐ "; }
  ul.check li.done::before { content: "☑ "; color: #2e7d32; text-decoration: none; }
  ul.check li.active::before { content: "▶ "; color: #1565c0; }
  ul.check li.deferred::before { content: "⏸ "; color: #f57c00; text-decoration: none; }
  ul.check li.deferred em { font-style: normal; color: #f57c00; }
  .story { display: block; font-style: italic; color: #555; font-size: .9rem; padding-left: 1.5rem; }
  .testref { display: block; font-family: ui-monospace, "SF Mono", monospace; color: #2e7d32; font-size: .85rem; padding-left: 1.5rem; }
  .entry { border-left: 2px solid #ccc; padding: .25rem .9rem; margin: .5rem 0; }
  .entry time { color: #999; font-size: .85rem; display: block; }
  .entry.dont { border-left-color: #c62828; }
  .entry.dont strong { color: #c62828; }
  .qna { padding-left: 0; }
  .qna .q { border-left: 2px solid #ccc; padding: .25rem .9rem; margin: .5rem 0; }
  .qna .q.open { border-left-color: #f57c00; }
  .qna .q p { margin: .15rem 0; }
  .qna .q time { color: #999; font-size: .85rem; display: block; }
  .qna .q .answer { margin: .3rem 0 0; }
  .qna .q.open .answer em { color: #f57c00; }
  details summary { cursor: pointer; padding: .2rem 0; }
  code { background: #f3f3f3; padding: 0 .2rem; border-radius: 3px; }
  pre.cmd { background: #f3f3f3; padding: .35rem .6rem; margin: .15rem 0; border-radius: 3px; font-size: .9rem; overflow-x: auto; }
</style>
</head>
<body>
<h1>Work in Progress — branch <code>{{BRANCH}}</code></h1>
<p class="meta">Started {{TS}}. Live workplan maintained by Claude Code across sessions, compactions, and subagents.</p>

<p class="status"><!-- ONE LINE: where work ACTUALLY stands + last verified state. Never round up. Flag any deferrals.
       Examples:
         "M0–M2 done. M3 active (Enemy Variety). Verified at commit a1b2c3."
         "M0–M6 complete (anchor db23821). M4 has 1 deferral (Whip+Knife synergy — see Follow-ups)."
         "M0 done; M1 active (paused on env setup). 0 deferrals."
       Update every time a milestone advances OR a subtask is deferred. --></p>

<h2>Original prompt</h2>
<blockquote>
{{PROMPT_HTML}}
</blockquote>

<h2>Referenced files / attachments</h2>
<ul>
  <!-- Path-like things the user mentioned, screenshots, design docs, sample data files.
       <li><code>/path/to/file</code> — what it is and how it's used</li>
       Tip: if the file lives in a tempdir (e.g. /var/folders/...), copy it locally first so it survives. -->
</ul>

<h2>Runbook</h2>
<p><strong>Run:</strong></p>
<pre class="cmd"><!-- shortest path to start the project. e.g.
    npm run dev           # web app  → http://localhost:5173
    npm run dev:api       # API      → http://localhost:3000
    docker compose up -d db && npm run dev   # API + DB
    cargo run             # Rust binary
--></pre>
<p><strong>Test:</strong></p>
<pre class="cmd"><!-- npm test  /  pytest  /  cargo test  /  go test ./... --></pre>
<p><strong>Verify (acceptance check for current state):</strong></p>
<ul>
  <!-- Manual checks to confirm the system works right now. One bullet per check, observable from outside the code.
       <li>Open dev URL; Game scene renders; FPS counter ≥ 55 in devtools Performance tab.</li>
       <li>POST /users with {name:"a", email:"a@b.c"}; expect 201; body.id is a UUID.</li>
       <li>Click Save in app; toast appears within 500ms; new row visible in `notes` table.</li> -->
</ul>
<p><strong>Anchor commits</strong> (known-good per milestone — used for bisect when things regress):</p>
<ul>
  <!-- ASCENDING chronological order: oldest at top, newest appended at the bottom.
       <li>M0 done: <code>a1b2c3d</code> (2026-05-13T14:32Z)</li> -->
</ul>

<h2>Plan</h2>
<ol>
  <!-- Ordered milestones with one-line descriptions. The Tasks section breaks each into fine-grained subtasks. -->
</ol>

<h2>Questions</h2>
<div class="qna">
  <!-- Q&A pair blocks. Each .q div holds the question, the answer (or "unanswered"), and one or two <time> elements.
       APPEND new questions at the bottom in ascending chronological order.
       When you answer one, MUTATE the block IN PLACE: fill in the <p class="answer">, add a <time class="answered">,
       and remove the "open" class from the .q div. NEVER delete a resolved question — they are part of the workplan history.
       (Decisions section is for a-priori choices that were NOT first raised as a question.)

       <div class="q open">
         <p><strong>Q:</strong> User IDs — server-assigned (snowflake) or client UUIDs?</p>
         <p class="answer"><em>unanswered</em></p>
         <time class="asked">2026-05-14T14:32Z</time>
       </div>
       <div class="q">
         <p><strong>Q:</strong> WebGL or Canvas2D for biome backgrounds? Decide before M4.</p>
         <p class="answer"><strong>A:</strong> Canvas2D — simpler perf budget on mobile; biomes are tile-blits not shader-heavy.</p>
         <time class="asked">2026-05-14T14:32Z</time>
         <time class="answered">2026-05-14T15:10Z</time>
       </div>
  -->
</div>

<h2>Follow-ups (deferred work)</h2>
<ul>
  <!-- Known work intentionally PUSHED OUT to a later session/iteration. Distinct from Questions (those are unknowns awaiting decisions).
       Each entry: what was deferred, why, and when/under-what-condition to revisit. ASCENDING chronological order: oldest at top, newest APPENDED at the bottom.
       <li>2026-05-13T14:32Z — Whip+Knife synergy (M4) — blocked on unlock-condition (see Questions); revisit when evolution registry exists.</li>
       <li>2026-05-14T09:05Z — Mobile virtual joystick — desktop-first launch; revisit after web users validated.</li>
       When a follow-up is picked up and completed, remove its entry and add a Decisions entry capturing the resolution. -->
</ul>

<h2>Tasks</h2>
<!--
   STRUCTURE: nested <ul class="check"> with milestones as outer <li> and subtasks as inner <li>.
   EVERY <ul> in this section MUST carry class="check" — including every nested sub-<ul>. Bare <ul> here flags an error in the wip-edit hook.

   PER SUBTASK include:
     1. The task text on the <li>
     2. <span class="story">Story: As <actor>, when I <action>, then <observable result>.</span>
     3. <span class="testref">test: path/to/test.ext::testName</span>   — when applicable (see TESTS below)

   STATUS CLASSES:
     class="active"   — exact subtask in progress right now (mark exactly one across the whole file)
     class="done"     — completed; story verified AND any referenced test passes
     class="deferred" — KNOWN and intentionally pushed to later. Add an inline <em>Deferred YYYY-MM-DDTHH:MMZ — reason; revisit when …</em> AND list it in Follow-ups.
     (no class)       — pending (will be done this session)

   CASCADE COMPLETION rule: when every direct child of a parent <li> is class="done" OR class="deferred", mark that parent <li> class="done" too (recursively up the tree). Deferred children DO NOT block cascade — they are intentional out-of-scope, recorded honestly in the summary count and in Follow-ups.

   SIZE DISCIPLINE: once a milestone <li> becomes class="done", wrap its nested <ul> in <details><summary>Milestone X — name (N done[, M deferred]) — anchor &lt;commit&gt;</summary>...</details> so the file stays scannable for the next session. Always include the deferred count when M > 0. Open milestones stay unfolded.

   TESTS GUIDANCE (red→green→refactor selectively):
     ALWAYS test: pure logic — formulas, registries, weighted choice, validation, parsers, mappers, reducers.
     SOMETIMES test: scene/service boot smoke (does the thing start without throwing?), invariants (pool size ≤ N), perf budgets (FPS over 5s ≥ 55, p95 latency ≤ X).
     RARELY test: end-to-end via Playwright/Cypress — one canonical happy-path flow per feature, not every input.
     SKIP test: purely visual polish, one-off prompts, throwaway scripts. The Runbook's Verify section captures manual checks instead.

   EXAMPLES (domain-neutral — use the one that matches the project):

     Game subtask (with test):
       <li class="active">Player WASD movement
         <span class="story">Story: As a player, when I hold W, my character moves up at 200 px/s while held.</span>
         <span class="testref">test: tests/player.spec.ts::movesUpOnW</span>
       </li>

     API subtask (with test):
       <li>Create user endpoint
         <span class="story">Story: As an API client, when I POST /users with {name, email}, then I receive 201 and a body containing the new user's id.</span>
         <span class="testref">test: tests/users.spec.ts::createsUser</span>
       </li>

     App+DB subtask (with E2E test):
       <li>Persist notes
         <span class="story">Story: As a signed-in user, when I click Save, my note text is written to the notes table and a success toast appears within 500ms.</span>
         <span class="testref">test: tests/notes.e2e.ts::saveRoundTrip</span>
       </li>

     Visual/manual subtask (no test — covered by Verify):
       <li>Game Over screen styling
         <span class="story">Story: As a player, when my HP hits 0, a centered Game Over panel fades in within 300ms.</span>
       </li>

     Deferred subtask:
       <li class="deferred">Weapon synergy: Whip + Knife → Thousand Edge
         <span class="story">Story: As a player, when I max both Whip and Knife, they fuse into a single evolved weapon.</span>
         <em>Deferred 2026-05-13T14:32Z — blocked on unlock-condition (see Questions); revisit when evolution registry exists.</em>
       </li>

     Folded completed milestone with a deferral (sub-<ul> still class="check"):
       <li class="done">M4 — Content
         <details><summary>Milestone 4 — Content (3 done, 1 deferred) — anchor 0c5f375</summary>
           <ul class="check">
             <li class="done">Whip, Knife, Garlic weapons</li>
             <li class="done">Skeleton, Demon enemy types</li>
             <li class="deferred">Weapon synergy <em>Deferred 2026-05-13T14:32Z — blocked on unlock-condition; revisit when evolution registry exists.</em></li>
           </ul>
         </details>
       </li>

     Folded completed milestone (sub-<ul> still class="check"):
       <li class="done">Milestone 0 — Scaffold
         <details><summary>Milestone 0 — Scaffold (6/6 done) — anchor a1b2c3d</summary>
           <ul class="check">
             <li class="done">Init project</li>
             <li class="done">Wire boot scene</li>
           </ul>
         </details>
       </li>
-->
<ul class="check">
</ul>

<h2>Decisions</h2>
<!-- A-priori choices (NOT first raised as a question — those live in the Questions section). Include rejected alternatives inline so the reasoning survives.
     ASCENDING chronological order: oldest at top, newest APPENDED at the bottom. Never prepend.
     <div class="entry"><time>2026-05-14T14:32Z</time><strong>Title</strong> — Chose X because Y. Rejected Z because W.</div> -->

<h2>Don'ts / rejected approaches</h2>
<!-- Approaches we tried (or seriously considered) and ruled out. Saves future agents from re-trying.
     ASCENDING chronological order: oldest at top, newest APPENDED at the bottom. Never prepend.
     <div class="entry dont"><time>2026-05-14T14:32Z</time><strong>Don't:</strong> use nipplejs. Tried; no compatible version. Build virtual joystick as Phaser Graphics instead.</div> -->

<h2>Course corrections / challenges</h2>
<!-- Mid-stream pivots and obstacles. Distinct from Decisions (a-priori choices) and Don'ts (rejected things). Use for "we thought X, hit Y, switched to Z" narratives.
     ASCENDING chronological order: oldest at top, newest APPENDED at the bottom. Never prepend.
     <div class="entry"><time>2026-05-14T14:32Z</time>What went wrong; what we changed.</div> -->

<h2>Subagent notes</h2>
<!-- Findings from spawned subagents — they don't share the main conversation context so this is where they leave breadcrumbs.
     ASCENDING chronological order: oldest at top, newest APPENDED at the bottom. Never prepend.
     <div class="entry"><time>2026-05-14T14:32Z</time><strong>agent name</strong> — What was investigated, what was concluded, cite source files (path:line).</div> -->
</body>
</html>
HTML

MSG=$(printf '%s' "work-in-progress.html does NOT yet exist on branch \`$BRANCH\`. Before doing the work the user just asked for, create \`$WIP\` capturing the task state.

The user's prompt (verbatim) was:

---
$PROMPT
---

Steps to take BEFORE acting on the prompt:

1. Append \`work-in-progress.html\` to \`$PROJECT_DIR/.gitignore\` if not already present (create .gitignore if missing).

2. Create \`$WIP\` using the HTML skeleton below. Replace \`{{BRANCH}}\` with \`$BRANCH\`, \`{{TS}}\` with \`$TS\`, and \`{{PROMPT_HTML}}\` with the user's prompt above (HTML-escape \`<\`, \`>\`, \`&\`; preserve linebreaks via <br>).

3. Fill in these sections before starting the work:
   - <p class=\"status\">: ONE LINE: where work ACTUALLY stands + last verified state. Never round up. Flag any deferrals. Initial value: \"Scaffolding from prompt. 0 milestones complete, 0 deferrals.\"
   - Referenced files / attachments: anything path-like in the prompt (file paths, screenshots, design docs). If a file is in a tempdir (e.g. /var/folders/...), copy it into the project first so it survives.
   - Runbook → Run / Test / Verify / Anchor commits: start with what you know (the planned run command if you know the stack). Verify checks should be observable from outside the code. Anchor commits start empty; add entries as milestones complete.
   - Plan: ordered milestones with one-line descriptions.
   - Questions: list any UNKNOWNS you have right now as Q&A blocks in the <div class=\"qna\"> container. Each unanswered question is a <div class=\"q open\"> with a <p><strong>Q:</strong> ...</p>, a <p class=\"answer\"><em>unanswered</em></p>, and a <time class=\"asked\">YYYY-MM-DDTHH:MMZ</time>. Surface unknowns explicitly; never silently assume.
   - Follow-ups (deferred work): start empty; populate as you intentionally defer subtasks.
   - Tasks: nested <ul class=\"check\">. Each milestone breaks into fine-grained subtasks. For every significant subtask attach a <span class=\"story\">Story: As <actor>, when I <action>, then <observable result>.</span> Add a <span class=\"testref\">test: path::name</span> when the subtask is testable per the TESTS GUIDANCE in the skeleton comment. Mark the FIRST subtask you're about to start as class=\"active\". Subtask state vocabulary: class=\"active\" (one only) / class=\"done\" / class=\"deferred\" / no class (pending).

4. Then proceed with the actual work. As you go:
   - Tick subtasks class=\"done\" when story verified AND test passes (where applicable).
   - Advance the class=\"active\" marker to the next in-progress subtask — there should be exactly one active at any time.
   - DEFERRING: if you decide to push a subtask to later, mark it class=\"deferred\", add an inline <em>Deferred YYYY-MM-DDTHH:MMZ — reason; revisit when …</em>, AND add a matching entry to the Follow-ups section. Never silently leave it pending or fudge it as done.
   - Update the <p class=\"status\"> line whenever a milestone advances OR a subtask is deferred. The status must reflect TRUTH, including deferrals.
   - CASCADE COMPLETION: when every direct child of a parent <li> is class=\"done\" OR class=\"deferred\", mark that parent class=\"done\" too, recursively upward. Deferred children count as resolved for cascade purposes.
   - SIZE DISCIPLINE: once a milestone goes class=\"done\", fold its nested <ul> inside <details><summary>Milestone X — name (N done[, M deferred]) — anchor <commit></summary>...</details>. Include the deferred count when M > 0.
   - Add Decisions entries when you make a non-obvious choice (note rejected alternatives).
   - Add Don'ts entries when an approach was tried/considered and rejected — so it's not re-tried.
   - Add Course corrections when you change direction mid-stream.
   - Add Subagent notes when a spawned agent reports findings.
   - Questions: APPEND new questions at the bottom of <div class=\"qna\"> as new <div class=\"q open\"> blocks. When answering a question, MUTATE its block in place: fill in the <p class=\"answer\">, add a <time class=\"answered\">YYYY-MM-DDTHH:MMZ</time>, and remove the \"open\" class from the .q div. Never delete a resolved question.
   - When a Follow-up is picked up and finished, remove it from Follow-ups and add a Decisions entry (or, if it had a Question, mutate that Q&A pair instead).
   - After every milestone, add an Anchor commit entry under Runbook.
   - TIMESTAMPS: every timestamp uses YYYY-MM-DDTHH:MMZ (UTC, no seconds). Get the current value with \`date -u +\"%Y-%m-%dT%H:%MZ\"\`.

5. ORDERING RULE for every timelined section (Anchor commits, Questions [new ones only], Decisions, Don'ts, Course corrections, Subagent notes, Follow-ups): ASCENDING chronological order. Always APPEND new entries at the BOTTOM. Never prepend. The latest entry is at the bottom of its section. EXCEPTION: in Questions, filling in the answer to an existing open question is an in-place mutation, not a re-order.

6. VERIFY YOUR OWN EDITS to this file before declaring done. Read the relevant section back after editing. Common bugs: duplicated milestone blocks, stale active markers, parent <li> not cascaded, mismatched (N/N) summaries, entries prepended at the top instead of appended at the bottom.

NEVER rewrite the Original prompt section. This file is your durable memory across compactions, clears, new sessions, and subagents. Treat it as the source of truth for what the task is and where it stands.

HTML skeleton:

\`\`\`html
$TEMPLATE
\`\`\`")

jq -n --arg msg "$MSG" '{
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit",
    additionalContext: $msg
  }
}'
