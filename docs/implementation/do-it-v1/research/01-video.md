# 01 - Reference video findings

File: docs/implementation/do-it-v1/videoplayback.mp4 (34:18, 640x360). Transcript via OpenAI Whisper (606 segments).
Full transcript: scratchpad/video/out.txt

## Headline: this is NOT an Engine/squad/persona video
It is an IndyDevDan (Dan Disler, agenticengineer.com, "Tactical Agentic Coding") talk titled by theme
"Forget loop engineering - build AI Developer Workflows (ADWs) / a software factory".
No product UI is demoed (no Engine, no Claude Code, no agent board). Everything on screen is animated flow diagrams
(built in an "animaid"/Mermaid-based animated-diagram web app, shown at 29:45-30:00, localhost:6273) over stock footage, plus a YouTube channel page.
It shows a PATTERN, not a tool. There are no personas, squads, or manager agent that delegates by chat.

## Core thesis
- Three "actors of value creation": Engineers, Agents, Code (03:38). Reliability: code > engineers > agents (04:35). Code is free of token cost, deterministic, instant (04:04-04:13).
- "Loop engineering" is a rebrand of the SDLC; the right unit is an AI Developer Workflow (ADW): prompt in -> workflow (code + agents) -> results out (01:00-01:08).
- "Build the system that builds the system" (11:30, 22:15). Work at the "agentic layer", not the app layer (21:56).
- Human only at the two ends: prompting/planning and review/validation (07:09-07:19).

## Pattern progression (timestamps)
1. 04:50 engineer prompts LLM, reviews.
2. 05:20-05:50 add code node: linter; pass/fail condition routes failure back to build agent = first "loop".
3. 06:00-07:05 add formatter, typecheck, tests; results fed back to build agent until all pass.
4. 07:40 fold all checks into a single Test Agent; fail -> context back to Build Agent; pass -> engineer review -> ship (cue frame 7:55). "Adding compute to add confidence."
5. 08:23 add Planner: plan -> build -> test -> review -> merge -> ship.
6. 09:08 deterministic code spawns N git worktrees, each running the full pipeline in parallel (isolation, no tripping).
7. 10:36 upgrade worktrees to per-agent SANDBOXES (own computer); human can jump into a sandbox to review (10:52); then merge + ship (cue frame 9:50 shows 3 sandboxes, each Planner->Build<->Test->Engineer Review -> Merge -> Ship).
8. 12:01 Kanban/ticket system as input wrapper (from support/product/engineers). Code moves ticket status between phases (13:45-14:16: code moves ticket to Planning; Scout agent -> Plan agent; code updates ticket; Build agent -> status Building -> Test -> CI/CD (code) -> pass/fail back to build -> human review -> ship).
9. 15:23 Production-down hotfix workflow: ticket to Slack/Teams -> engineer prompts Scout agent -> Hotfix agent ("surgical", templated expertise, just get fix out) -> human Approve/Reject gate (16:35) -> on approve, N parallel sandboxes RACE, first passing wins (16:50) -> fail returns to hotfix agent + human -> validate -> ship.
10. 17:49 Software factory: ticket lands -> Start Factory (code) -> Status: In Progress (code) -> Factory Router Agent (could be one LLM call or deterministic code, 19:40-19:50) classifies hotfix/feature/bug/chore -> Setup Sandbox (code) -> routes to a specialised workflow per type (cue frame 20:40). Model tiering per workflow: SOTA for scout/planner, workhorse for build (20:41-20:50); chore = single lightweight agent + lint + CI + review (20:59-21:09).

## How delegation / hand-off / state works (as stated)
- Delegation is a ROUTER + fixed pipelines, not a free-form manager agent. The "factory router agent" (19:40) picks which pre-built ADW runs. Dan says router "could just be a simple LLM call or deterministic code".
- Agents are narrow single-purpose nodes: scout, planner, build, test, hotfix, router. Specialization = "template your engineering into the workflow" (24:58-25:38). He pushes against out-of-box generic agents (25:04) and mentions "agent experts" (hotfix has "specialized mental memory", 16:09; 33:14-33:25) as a paid-course topic.
- Hand-off/state: tickets (Kanban) are the state carrier; deterministic code moves status (planning -> building -> testing). Intermediate results need "a place for all the results in between each step" (30:45 - this is "context engineering"). Fail loops reuse the SAME SESSION ID via an agent SDK (27:27).
- Separation of concerns: do NOT make one big skill that calls lint at the end; use the Agent SDK to run build agent, then CODE runs linter, then feed failure back (27:12-27:37). "Otherwise you just have an agent calling code." Skill-based workflows OK to start, but move to code when productionizing (28:38-28:55, 30:08-30:26).
- Context separation: split agents (frontend/backend, build/test) so context moves between agents and code (28:21-28:32).
- Classic engineering still applies: isolatable, decoupled, single interface; each node testable (31:24-31:49).

## Visibility / UI worth copying
- Not a dashboard. The only UI shown: (a) animated flow diagram renderer (Mermaid-like; left pane = Mermaid text + scene list "Three Actors", "Build, Lint Loop", "Kanban Sandbox Workflow", "Hot Fix Workflow", "The Software Factory", "AI Developer Workflow"; right pane = animated node graph; cue frame 29:50). Idea to copy: render each ADW as a living diagram (nodes = code/agent/human; edges labelled pass/fail/approve/reject).
- Visual grammar worth copying: three node kinds with distinct styles - Human = yellow rounded pill, Agent = orange rectangle with robot icon, Code = green diamond; red x = fail/loop back, green check = pass; sandbox = grouped swim-lane box ("Agent Sandbox 1..3").
- Approvals: explicit Approve/Reject human node (hotfix, 16:35) and Engineer Review node before ship. "Best teams will drop engineering review" eventually (21:09; "ZTE" mentioned, not explained).
- Kanban board is mentioned as input/state UI, but no board is actually displayed.

## Advice (26:45-31:55)
1. Keep it simple (KISS); start with prompt -> build -> lint, add nodes for real problems.
2. Design the ADW by doing the work yourself first, step through each node, then diagram it (Mermaid) (29:02-30:05).
3. Use agents AND code; code for the deterministic parts (30:08-31:15). "agents plus code beats either alone".
Plug: Tactical Agentic Coding course (8 lessons) + "Agentic Horizon" (multi-agent orchestration, agent experts); blog "Thinking in Threads".

## Notable quotes
- "Forget about loop engineering. Focus your valuable engineering time and tokens on building AI developer workflows." (01:11)
- "You and I always show up at the ends... prompting/planning and reviewing/validation." (07:09)
- "Scale your compute to scale your impact" / "adding compute to add confidence" (07:48-07:51)
- "You have to separate your code and your agents. Otherwise, you just have an agent calling code." (27:31)
- "Agentic engineering is knowing your system works so well, you don't have to look." (25:58)
- "Work trees are a great place to start, not a great place to end." (10:30)
- "Code is the unsung hero... no token costs" (04:11-04:26)

## Key frames (saved in scratchpad/video/frames/)
Base: /private/tmp/claude-501/-Users-macbook-Workspace-Devotts-do-it/32f75886-b090-419b-b001-75f954ae10e7/scratchpad/video/frames/
1. cue_0001.jpg (~05:45) Build Agent <-> Test Agent loop: "fail: loop back" / pass -> Engineer Review -> Ship; yellow Engineer Prompt pill at left.
2. cue_0003.jpg (~09:50) Deterministic code diamond fanning out to 3 Agent Sandboxes, each Planner -> Build <-> Test -> Engineer Review, merging to Merge -> Ship.
3. cue_0005.jpg (~13:55) Ticket pipeline: Status: Building/Testing code diamonds around Build/Test agents, CI/CD diamond, Engineer Review.
4. cue_0006.jpg (~16:45) Hotfix: Scout Agent -> Hot Fix Agent -> Approve/Reject human node -> "Build Sandbox" diamond -> parallel Build Agents; reject loops back.
5. cue_0007.jpg (~19:55) Software factory: Start Factory -> Status: In Progress -> Factory Router Agent -> Setup Sandbox -> branches hotfix/feature/bug/chore.
6. cue_0009.jpg (~29:50) The animated-diagram tool: Mermaid text left, scene list, animated Human -> prompt -> Claude -> spawns Agent -> ships Response, writes SQLite.
Also: frame_0013.jpg ("Your actors of value creation": Engineers / Agents / Code), frame_0018.jpg title card "YOUR SOFTWARE FACTORY". (frame_0013, 0018 etc. copied from the first pass.)
Note: scene-detect frames are sparse for animated diagram segments; cue frames are the useful ones.

## Applicability to do-it (my read, flagged as inference)
- Maps well: do-it as the ADW/router layer: ticket/goal -> router -> pick pre-built pipeline (plan-it -> build-it -> review-it -> conclude-it) -> human gates only at ends + approve/reject on risky paths.
- Video's position CONTRADICTS the "persona-agents managing subagents" idea in one way: it favours deterministic code for routing/status/hand-offs and narrow task agents; the manager is a router (LLM call or code), not a persona. Worth deciding: personas as specialised node templates (hotfix agent, planner) is compatible; personas as free-form managers is not shown here.
- Steal: node-kind visual grammar (human/agent/code), pass/fail edges, per-type workflows with model tiering, parallel sandbox racing with first-pass-wins, same-session-id fail loops via Agent SDK, living flow diagram as the visibility UI.
- Nothing here about Engine, squads, or live status boards. If Fernando believes the video shows Engine squads, it may be the wrong file or he is thinking of something else.
