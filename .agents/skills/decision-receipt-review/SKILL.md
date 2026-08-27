---
name: decision-receipt-review
description: Verify, compare, import, or render local Decision Receipts when reviewing an AI-research result, PR, RFC, or ADR. Use only for receipt operations; it does not browse, establish source truth, or authorize external actions.
---

# Decision Receipt Review

Keep the review local and evidence-scoped.

- Prefer the connected `decision-receipt` MCP tools. If unavailable, use `decision-receipt-mcp` through a compatible host or `web-task-agent receipt verify|compare|import` locally.
- Verify both receipts before comparing or rendering them. Report the exact path, claim ID, source ID, signature, or hash that fails.
- Treat `integrity verified` as a byte/signature statement, never as proof that a source, claim, or decision is true, complete, authorized, representative, or fresh.
- For a decision change, separate source, claim, policy, model, prompt, and decision changes. Reopen the local excerpts before recommending reliance.
- Import only the provider-neutral adapter contract. Refuse cookies, sessions, credentials, authenticated URLs, provider prompts, executable instructions, or unapproved private evidence.
- Write only inside the user-authorized workspace. Do not enable comments, network access, browser control, shell execution, or external writes through receipt operations.
- End with the strongest contradiction, the decision's invalidation condition, and the smallest next validation.
