# Evidence And Records

Use this guide when a CPLayout panel task needs current facts, external references, source ledgers, task logs, prompt registry entries, or durable knowledge updates.

## Source Hierarchy

1. Workspace contracts: `AGENTS.md`, repo-local skills, ADRs, docs, task logs, known gaps, and checked-in source.
2. Official product or API documentation.
3. Vendor documentation, standards, manufacturer docs, or primary regulatory pages.
4. Local command outputs and generated validation artifacts.
5. Secondary sources only as pointers to primary sources.

External docs verify external product facts. Local files, `git status`, tests, and line-numbered source reads verify current workspace state.

## OpenAI And Codex Facts

Use OpenAI docs MCP tools first for OpenAI products, Codex, subagents, config, models, reasoning, APIs, SDKs, and Apps SDK facts.

Useful official pages:

- `https://developers.openai.com/codex/guides/agents-md`
- `https://developers.openai.com/codex/subagents`
- `https://developers.openai.com/codex/config-reference`
- `https://developers.openai.com/codex/learn/best-practices`

Fallback web browsing, if needed, must stay on official OpenAI domains.

## Fact Classification

Use these labels in panel outputs and records:

- `Verified facts`: directly supported by a cited local file, command output, official doc, or primary source.
- `Assumptions`: working defaults chosen to continue safely.
- `Unknowns`: unresolved gaps that block stronger claims or future work.
- `Unverified claims`: claims that must not be represented as true until a source or validation proves them.

## Knowledge Gap Table

```markdown
| Gap | Why it matters | Source to check | Status |
| --- | --- | --- | --- |
| Unknown fact or contract | Risk or blocked decision | Local file, command, official doc, or primary source | Open, verified, or unresolved |
```

## Source Ledger Template

```markdown
| Source ID | Source | Accessed | Verified use and limits |
| --- | --- | --- | --- |
| SRC-001 | `URL` or local command | YYYY-MM-DD | What this verifies; what it does not prove. |
```

## Task Log Template

```markdown
# NNNN Task Title

Date: YYYY-MM-DD
Owner: role
Status: planned, in-progress, complete, blocked, or partial

## Scope

- In scope item.
- Out of scope item.

## Evidence

- Source or command.

## Validation

- Command: result.

## Remaining Gaps

- Gap or `None`.
```

## Prompt Registry Entry Template

```markdown
| Prompt ID | Intent summary | Expected output artifact | Risk level |
| --- | --- | --- | --- |
| prompt-id | What the prompt asks for | Findings, patch, research note, or validation report | Low, Medium, High, or Xhigh |
```

Risk levels:

- `Low`: formatting, indexing, or local-only review with no durable side effects.
- `Medium`: documentation, knowledge-base changes, skill changes, or non-runtime code changes.
- `High`: architecture, storage, map/provider, native runtime, deployment, credentials, release, or safety gates.
- `Xhigh`: release arbitration, severe reviewer disagreement, security/safety/native verification disputes.
