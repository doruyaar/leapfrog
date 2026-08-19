# Pitfalls

Challenges hit while building, and how each was resolved. Short and honest.

## 1. "Sources disagree" false alarm on refinements

**Problem.** Two posts from Docker's own blog series (both `Docker — security`)
were flagged as "Sources disagree". The diff stage was right — the later post
*updated* Docker's recorded positioning — but the brief composer turned every
`update` event with both items in the brief into a disagreement panel. A
follow-up refining an earlier account is the record evolving, not two sources
contradicting each other.

**Solution.** Only surface a conflict when the two statements actually make
*opposing claims*, measured deterministically (`brief/contradiction.ts`),
regardless of who published them: a negation flip on a shared term ("supports X"
vs "does not support X"), opposite-polarity terms on one axis (raised vs lowered
vs flat, launched vs discontinued, confirms vs denies), or diverging figures of
the same kind (amounts, percentages, versions) — all gated on the statements
sharing enough content words to be about the same thing. The detected evidence
is shown in the conflict's note. Applies to both the deterministic and LLM
paths; a mere refinement is dropped, and the insight's "Compared to previous
state" diff still shows the change. Prompt rule updated, bumped to `brief-llm@2`.

**Known trade-off, and the live-mode answer.** A contradiction phrased entirely
outside these measures (pure paraphrase) slips past the lexical rules. In live
mode an LLM judge closes that gap: the chat model (`OPENROUTER_CHAT_MODEL`,
prompt `conflict@1`) decides contradict/consistent, and its verdict is only
trusted when it quotes a verbatim opposing span from each statement — anything
ungrounded falls back to the deterministic measures, which also remain the full
zero-key path. Either way the change history still records every update.

## 2. Local embedding model OOM on Render (512 MB)

**Problem.** The demo-mode local embedder (transformers.js) loaded model weights
into memory that exceeded Render's 512 MB instance, crashing the service on pipeline run.

**Solution.** Use the OpenRouter embedding model (`OPENROUTER_EMBEDDING_MODEL`)
in the hosted deployment instead of the local fallback, and raise the instance to
2 GB RAM for headroom. The local model remains the zero-key fallback for running
on a developer machine.
