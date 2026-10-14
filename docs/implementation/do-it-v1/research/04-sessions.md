# How Fernando works: Engine-Core sessions, 2026-09-14 to 2026-10-14

Sources: ledger `.agents/history/INDEX.md` (112 rows dated >= 09-14), session cards, and user messages extracted from ~199 transcripts across `~/.claude`, `-8fai`, `-8ftools`, `-anm` and `-loudr` (about 19.7k user-role messages, of which most are automated pings). No secrets included.

## (a) Timeline and counts

- Ledger rows >= 09-14: 112. By alias: claudinho 45, claude8ftools 25, claudeloudr 19, claude8fai 16, claudeanm 6, opencodeott 1 (tooling).
- Status, by ledger text: about 57 "shipped", 26 "concluded", 9 "partial", the rest handed-off, planned, paused or stalled. Roughly 60-65% ended in prod or merged. The honest-partial pattern is common: "shipped-partial 18/20", "PARTIAL 12/18", "BUILT-NOT-SHIPPED".
- Pace: 1-9 session cards a day. Peaks were 09-14 (9, the closeout orchestrator and its children), 09-21 (9), 09-20 (7) and 10-05 (7).
- Parallelism: the transcript-hours with the most distinct active sessions were 16 sessions across 3 aliases (10-06 00h) and 14 sessions across 2 aliases (09-23, 09-28). A normal day runs 2-4 aliases at once, with a conductor plus 2-5 exec sessions. Subagent fan-out sits on top of that: lanes, workers and deployers.
- Topic arcs, in order:
  - Week 1 (09-14 to 09-21): closeout of 7 packages, then overengineering-chat-investigation, praxya-radar-refinement, warehouse/meta-ads, ontology-governed-variables, alimento-diario/Postiz, video-kernel, and backlog drains on 09-14, 09-15, 09-19, 09-20 and 09-22.
  - Week 2 (09-22 to 09-30): secretario-whatsapp-v2, a2a-native-call, her0 new tenant, ZeroClaw removal, engine-deploy-speed, and radar v2/v3.
  - Week 3 (10-01 to 10-08): backlog drain, control-tower (CT), p2p_personas, ct-p2p orchestrators 1-9, engine-dev-squad W1/W2, backbone-seats.
  - Week 4 (10-09 to 10-14): tenant-workspace-vms pt3-pt8, ct-p2p orch 10-13, hackathon-1012 drains, multi-console, Loudr ads-reports.
- Command frequency in user messages (includes injected text, so read as relative): /conclude-it 966, /build-it 568, /deploy-router 394, /engine-deploy 251, /review-it 221, /iterate 173, /read-chat 115, /next-session-prompt 53, /reconcile-it 23, /plan-it 22.
- Tenants: fernando-ott (fo) is the canary. her0 and praxya are the follow-on tenants, and a deploy is "3 tenants" or "x3". Praxya serves a real client (Moretti, bosslife), so it is gated harder.

## (b) Workflow archetypes, with his phrasing

1. **Brain-dump, then /plan-it, then a G4 ratify gate, then /next-session-prompt, then a fresh /build-it session, then /conclude-it.** Example: "Let's plan-it @docs/implementation/overengineering-chat-investigation ... Use fable or the higher model as the orchestrator ... who really executes it is the subagents". Planning ends with CONTRACT v1.x, a frozen epic and case count, and a PLAN-REVIEW.md that he ratifies. Then: "give me the /next-session-prompt and I will run the session orchestrator and subagents in another session and then /conclude-it". Instances: secretario-whatsapp-v2, p2p-personas, video-kernel, praxya-v2, backbone-seats, run-supervisor.
2. **Paste-in /build-it /goal with DoD (the executor shape).** It is always the same skeleton: `/build-it /goal <outcome>`, then "Before anything, read in order: 1..3", "For more context: /read-chat '<session>'", "DoD: ...", "Out of scope / do not touch: ...", and a binding TOKEN DISCIPLINE block. Examples: "/build-it /goal Ship the p2p persona highway W0-W2 ... on fernando-ott", and "Ship the safe, owner-free leftovers from hackathon-1012".
3. **Overnight run with a self-heartbeat.** He goes to sleep and the run pings every 10-30 min (`[ct3 resilience ping]`, `twv pt5 ping ... If session-limited, reschedule +10 min`). Hitting the limit while he sleeps is explicitly fine: "anyway you hit the limit, and when it is back I'll be sleeping, so go on!" and "I'm on my cellphone and I'll go sleep, can you continue the work without me?". One run logged 14+ usage-limit resets.
4. **Weekly backlog drain marathon.** "Tell me about all of these cards still in backlog folder ... 107 cards. let's tackle them?" The orchestrator runs on the top model, with "the others lower models pra economizarmos tokens e session limit". Output is dispositions (drained, archived, parked), 20+ PRs and several deploy waves. Drains ran on 09-14, 09-15, 09-19, 09-20, 09-22, 09-23 and 10-01, and the hackathon drains on 10-12 and 10-13. Cards are archived to `0-done`.
5. **Review-it with CDP, looping into the builder session.** "Your /goal is to /review-it the implementation ... Use chrome CDP to execute the ROTEIRO-TESTE.html. The problems you find, sendMessage to the session ... /iterate and /build-it there ... until 100% pass and we are finally able to /conclude-it." This is a reviewer-builder ping-pong between two sessions, ending in a "ROTEIRO 10/0/3" style verdict.
6. **Live bug report from the product, investigate-only first.** He pastes a chat URL, a screenshot, or a WhatsApp message from a partner (Leo/Léo). Examples: "Investigue o pq o Secretário está dizendo que não está recebendo as mensagens completas", and "(nao faça nenhuma mudança, quero entender)". Then comes the fix, a deploy, and a live retest. Typical results: root cause found, "built-not-shipped", or a premise corrected.
7. **Cross-session continuation after a usage limit or a compact.** "the session 'praxya-radar-refinement-pt3' stopped due hit weekly limit /read-chat '...' Continue here". Also: "Our current session is almost without limits ... I'd like to move to another subscription where you can finish what you are doing". Numbered runs (pt2..pt8, orchestrator-1..13) carry state through KICKOFF-PTn.md, HANDOFF-PTn.md and `.taskstate/`.
8. **Conductor over children, cross-session messages.** A conductor ("closeout-130926-orchestrator", "engine-core-46") sends KICKOFFs to child sessions with a named model ("you are memory-caos-w3-exec (model sonnet)"). It runs cheap pings: "Conductor ping. Keep it cheap. 1) ListAgents: are X and Y alive? ... If a child is idle and blocked or stalled...". Instances: closeout (7 children, 12 deploys), ct-p2p orchestrators 1-13, and an overnight conductor for twv plus ct-p2p.
9. **Deploy coordination.** "go ahead. check /deploy-router before deploy, we still have other session running", "now you have priority let the other session know /deploy-router", and "Do the deploys in parallel so we can free the deploy run to the other sessions." Policy is one deploy per run, at the end ("deploy once at end"), canary on fo first, then her0/praxya.
10. **Reconcile / cleanup.** "/reconcile-it ... only the things related to p2p and ct that is garbage that is already in main. Be careful to not delete code that we didn't ship." Result: a "main-only workspace", with 29 refs deleted and rescue branches landed or dropped.
11. **Owner-pack Q&A.** The run ends with a "Needs Fernando" section or an OWNER-PACK. He replies with terse numbered answers: "1 - I am rebooting right now ... OD-2 - yes OD-22 - yes OD-13 - Merge 4 - contabo dashboard is logged in in chrome CDP, you can do it now." Another example: "1. approve free build-box disk 2. do not rotate 3. roll out everybody".
12. **Tool/harness R&D side quest.** "verifique o que gasta menos token quando o claude manipula/faz uso do browser" (claude-in-chrome vs CDP vs browser-use+jev), and the OpenCode parity setup. They end as decisions, with no code shipped.

## (c) Recurring corrections, frustrations and rules

- **Token / weekly-limit burn.**
  - "you basically already use 50% of my weekly session in 5 hours" (09-26).
  - "In only 6 hours, it consumed 1/3 of my weekly usage ... Investigate what was the main reason" (09-27).
  - "really concern we are spending unecessary token on this" (09-29).
  - The 09-22 deploy complaint: "now it seems to be really time and token consume".
  - Result: a binding TOKEN DISCIPLINE block in every kickoff. Context ceiling 150K, thin conductor, tee output to files, tier models, no polling above 50K context, no resuming idle workers. It cites "burned 1/3 of a weekly limit because coordinators ran at 500K-965K context and a finished session kept polling".
- **Model tiering.** "are you using the lower models? are you hallucinating?" and "who is using fable? stop right now! only opus 5.5 at the top". Other lines: "essa sessao é a orchestradora usando fable. as outras, rode com lower models", and "try to use as much as you can subagents sonnet to save tokens". Sonnet-to-Opus escalations were recorded, for example "3 sonnet→opus escalations" on a2a-exec. He also asked for "double check com o fable para ter certeza se é isso o diagnostico".
- **Over-thoroughness / slowness.** "será que vc não está sendo muito preciosista?" (a stress test with a 3h limit) and "why this is taking so long?". The 09-22 deploy complaint also targeted the full test suite: "the one that most consume tokens and time was the 'Full test suite' ... a light version or an option to skip".
- **"Done" that is not done / not archived.** This is the most repeated complaint. "if you conclude everything, why I still see the implementations not in 0-done?", "make sure you really conclude and drain everything", "why @docs/implementation/engine-deploy-speed folder isn't in 0-done?", and "if all is done, why tenant-workspace-vms, p2p_personas, canais-fo-retest aren't in 0-done?". Also "meta-ads: not deletable yet ... so we didn't accomplish one of the DoDs".
- **Unverified claims.** He insists on proof from the live system: "check yourself", "you click using chrome CDP and you monitor the results both in meta ... and in Engine praxya", "change one campaign to an absurd ROI number ... Run this test yourself using chrome CDP", and "monitor for 5 minutes if this approval will be applied". The ledger shows the same concern, with a "[REAL] probe" requirement, "N/M VERIFIED", and "3-leg verified".
- **Test pollution.** "Vejo que ainda tem cards do seu teste que você não deletou. pode limpar antes pra eu testar?"
- **Stale or dead sessions and processes.** "is ct-p2p-orchestrator-13 still doing anything?", "I still see [image], pode matar?", "did you conclude it here? clean up worktree and branch?", and "I have a sleepat programed to run in 3H, stop it". Before restarting his machine he asks "let me know if ... ran the /conclude-it ... is safe so I can restart and he has context to continue".
- **Parallel-session collisions.** "we have another session ... running right now. wait it or communicate to it when you need to deploy using /deploy-router". Other lines: "I have another deploy to run in another session", and "make sure all tenants have the same version (unless one of the current other session are doing canary tests)". Also "ask other sessions for priority", and "be aware of the session ... running in claudeanm subscription". Ledger incidents: a dead reconcile roll, a UI-loop rollback, and a deploy "BLOCKED-DRIFT".
- **Misreading his instructions.** "no, I didn't say to loop every 12h. I said to continue the 10 min loop interval in the next 12h". He also got an unexpected "compacting conversation" in a brand-new session.
- **Secrets hygiene.** Ledger flags such as "3 secret leaks to rotate" and "root-pw leak to rotate", plus the `.secrets/` convention. He decides whether to rotate: "do not rotate".
- **Product-trust bugs he walks himself.** Approve buttons missing in Mission Control (a 3-bug approval-loop family), duplicate or unlinkable cards, and the radar queue showing another client's cards.
- **Binding repo rules.** GitHub CI is billing-blocked, so the local pre-push gate is the merge gate and a red Actions run is never a regression. Capabilities must be data, not code. Ledger cards are checked before /read-chat. Models are tiered. Finished subagents are reaped.

## (d) Manual glue an orchestrator could automate

- Typing the `/build-it /goal ... Before anything, read in order ... DoD ... Out of scope ...` prompt by hand, or generating it with /next-session-prompt, then pasting it into a fresh session under a specific alias. The same TOKEN DISCIPLINE block is re-pasted every time.
- Choosing which subscription/alias to run on, and moving work when one runs dry. Today this is manual: "move to another subscription".
- Recovering after usage-limit death. Today it is hand-written wake prompts: "Your claude.ai usage limit has reset. Continue the task...", "pt5 ping: read NEXT.md and continue", and `/read-chat` continuation. A run produced 14+ reset notices and 100+ identical 20-min ping messages that each re-read context. This should be a durable scheduler keyed to the reset time, not a chat message.
- Polling: "is X still doing anything?", "are you still monitoring every 15 min?". A run registry with heartbeat/liveness would answer this without a transcript.
- Handoffs and cross-session messages: KICKOFF/HANDOFF/NEXT.md files, `sendMessage` between a reviewer and a builder, and `/read-chat` to learn what a sibling did.
- Deploy mutex: running `/deploy-router` before every `/engine-deploy`, asking another session for priority, and sequencing the fo-then-her0-then-praxya canary.
- The "why isn't it in 0-done?" check. Moving a package to `0-done`, updating the backlog, the STATUS board, the ledger card (both tiers), the ClickUp re-attribution, and the CONCLUDE_REPORT.html. It is run per session today and is often incomplete.
- Owner-pack triage: collecting every "needs Fernando" item from many sessions into one numbered question list, then routing his terse answers back to the right session.
- Running the ROTEIRO-TESTE.html CDP walk, then pasting results back to the builder session.
- Reporting: he asks for HTML status reports ("give me an html status on how we are", "roteiro-test.html").
- Cleanup: deleting test cards and fixtures, reaping subagents and worktrees, `/reconcile-it` after bursts, and killing leftover processes.

## (e) Decision style

- **Delegates:** implementation, model choice below the top tier, branch/worktree cleanup (unmerged branches are protected: "delete merged, keep unmerged, give me the list"), deploy sequencing ("go ahead"), and test-data cleanup. His standing instruction is "green light, take decisions", and he accepts honest partials. He values a run that corrects a wrong premise over one that does the wrong thing.
- **Approves himself:** plan ratification at G4 (CONTRACT/PLAN-REVIEW), any production flag flip or feature-flag enablement on a real client (owner gates), credential rotation ("do not rotate"), spending ("Sim, coloca mais 5 dolares"), destructive or irreversible deletes, merging changes that touch client-facing behavior, and anything involving Moretti or Léo as external users.
- **Answers tersely:** numbered one-word replies ("yes", "Merge", "monitor", "keep", "superseded", "close it"). He gets lost when asked something abstract ("I don't get it what you want with ...", "explain more"). A decision should come with a recommendation and a reason: "what do you recommend ... and why we need a limit?"
- **Asks "recommend X or Y"** when choosing structure: new implementation versus continuing in the same session. He wants the cost and the tradeoff in his terms.
- **Pushes verification onto the system** ("you click, you monitor") rather than clicking himself, but does hands-on product walks on fo and reports what he saw with screenshots.
- **Prefers the work split by session:** a planning session, an orchestrator, and exec children, with one conclude per session and a prompt handed to the next.

## (f) Candidate do-it use cases (from real sessions)

1. **Overnight DoD build with limit-proof resume.**
   - Trigger: `/build-it /goal Ship the p2p persona highway W0-W2 ... DoD ...` (10-02).
   - Stages: grounding, lanes on sonnet, adversarial verify on opus, a single end deploy, [REAL] probes, report.
   - Pain removed: hand-written resume pings and polling, the repeated TOKEN DISCIPLINE paste, and the "who is still running" check.
2. **Weekly backlog drain.**
   - Trigger: "Tell me about all of these cards still in backlog ... 107 cards. let's tackle them?"
   - Stages: verify-before-build discovery, batched owner gate, waves, deploy trains, archive, per-card status table.
   - Pain removed: the "why do I still see N items?" loop, plus archive and ledger bookkeeping.
3. **Plan, ratify, handoff, build.**
   - Trigger: "Let's plan-it @docs/implementation/<x>" followed by "give me the /next-session-prompt".
   - Stages: ground, research fan-out, CONTRACT freeze, human G4 gate, auto-generate the kickoff, start the build session on the least-used alias.
   - Pain removed: copy-pasting the kickoff prompt into the right account by hand.
4. **Review/builder loop.**
   - Trigger: "Your /goal is to /review-it the implementation ... Use chrome CDP to execute the ROTEIRO-TESTE.html ... send to the builder session ... until 100% pass".
   - Stages: CDP walk, findings, fix, retest, loop until green, conclude.
   - Pain removed: manual relay between two sessions, and unverified "done".
5. **Live-bug investigate-then-fix.**
   - Trigger: a pasted chat URL or screenshot, "Investigue o pq ... (nao faça nenhuma mudança)".
   - Stages: read-only root cause, premise check, a "proceed?" approval, fix PR, local gate, deploy to fo, a live CDP proof that is watched for N minutes, then widen to her0 and praxya.
   - Pain removed: his "check yourself" demand and the deploy collisions. Example: the Mission Control approval loop or the truncated WhatsApp message.
6. **Coordinated multi-tenant deploy train.**
   - Trigger: "ship it / go ahead, check /deploy-router, we still have other session running".
   - Stages: deploy-router lock, canary on fo, wait for green, her0, praxya, 3-leg verification, rollback if red.
   - Pain removed: parallel-session collisions and slow, token-heavy deploys.
7. **Reconcile and conclude.**
   - Trigger: "/reconcile-it after the parallel ships of 10-06/07" or "when everything is done, run /reconcile-it".
   - Stages: inventory branches and worktrees, classify, one approval gate, delete or rescue, ledger card, move to 0-done, reap subagents.
   - Pain removed: stale worktrees, forgotten 0-done moves, and orphan processes.
8. **Owner-pack router.**
   - Trigger: end-of-run "Needs Fernando" lists from several sessions.
   - Stages: aggregate into one numbered question sheet with recommendations, parse terse replies, dispatch the answers to the waiting sessions or a resume.
   - Pain removed: the questions that are currently scattered and have to be answered one session at a time.
9. **Usage and cost post-mortem.**
   - Trigger: "In only 6 hours, it consumed 1/3 of my weekly usage ... Investigate".
   - Stages: per-session context-size and poll-count audit, a recommendation, and a guardrail patch.
   - Pain removed: the manual transcript archaeology.

## Evidence pointers
- Ledger: `/Users/macbook/Workspace/Engine/Engine-Core/.agents/history/INDEX.md` and the alias card folders.
- Binding token rules appear in the 10-13 hackathon-1012 round-2 kickoff, in the `claudinho` transcript.
- Repo rules: `/Users/macbook/Workspace/Engine/Engine-Core/CLAUDE.md`. Repo skills include engine-deploy, deploy-router, new-feature, review-pr and engine-session-debrief.
- Not read: `.fable-it-reports`, `.build-it-reports`, `.plan-it`, `.review-it` and the individual cards. The analysis rests on the INDEX plus transcript user messages.
