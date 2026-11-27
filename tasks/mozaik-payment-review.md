# HelixBox Solana: Mozaik Payment Review

When a paid model call times out, the developer needs to know whether the first payment went through before trying again. Add a **Mozaik Payment Review** action beside the existing agent experience. Codex, Claude, OpenCode and the live Solana checkout keep working as they do today. This action reviews payment evidence; it doesn't buy anything.

## Build and verify

1. **Run two real Mozaik agents.** Add an isolated TypeScript runtime for a quote reviewer and a settlement reviewer. Start both independently on the same request, share findings through Mozaik events/state, and show timestamps that establish overlap. Pin the package and verify the installed API; npm currently reports `@mozaik-ai/core` 6.0.0. Use real inference with a server-side key for the submitted run, not scripted agent replies.
2. **Return an evidence-backed decision.** The quote reviewer checks asset, recipient, amount, expiry and session budget while the settlement reviewer checks payment identity and status. Show `ready for human review`, `already paid`, or `hold`. Confirmed settlement prevents a retry; incomplete data or either reviewer failing means hold. The deterministic code owns the decision; model output explains it and links back to the quote, policy or ledger entry. Test clean, already-paid, missing-evidence and timeout cases, plus the actual overlap.
3. **Wire it into the app.** Put Payment Review next to the existing agent experience. Show both agents' status, findings and evidence in the phone UI. Use a separate review entry point with no access to wallet keys, production accounts, the checkout endpoints or facilitator settlement. Run the app and build the Android bundle; verify the complete review path and normal navigation. Don't publish an app build or change the production payment flags.
4. **Make it reproducible for judges.** Document dependency setup, server/agent prerequisites, one command to start the review, and how to reproduce the clean and duplicate cases. Use clearly labeled synthetic payment records or public read-only evidence. Real agents and real app execution, no fabricated output, no real money moved by the entry. Identify event-built work separately from the pre-existing app.

## Judging checks

- Finance usefulness (30): show a retry that would have requested a second payment and why the reviewers hold it.
- Mozaik concurrency (30): two overlapping agent runs; a settlement finding changes the review outcome while the agents share one request.
- Execution (25): clean setup from the README; verify both the review and existing app build.
- Financial data care (15): amounts and decisions trace to named sources; synthetic records are labeled; uncertainty never becomes a confirmed result.

[JigJoy official rules](https://build.jigjoy.ai/rules) · [Scoring rubric](https://build.jigjoy.ai/tracks/finance) · [Mozaik upstream](https://github.com/jigjoy-ai/mozaik)
