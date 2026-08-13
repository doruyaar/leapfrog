# LeapFrog

Competitive-intelligence platform for the software-supply-chain / artifact-management
market — proactive daily briefs, grounded Q&A, a comparison matrix, and battlecards.

> Design is complete; code lands per the [build plan](docs/diagrams/build-plan.md).

- **Design:** [`docs/DESIGN.md`](docs/DESIGN.md)
- **Architecture:** [`docs/diagrams/architecture.md`](docs/diagrams/architecture.md)
- **Product scenarios:** [`docs/diagrams/product-scenarios.md`](docs/diagrams/product-scenarios.md)
- **Build plan & tasks:** [`docs/diagrams/build-plan.md`](docs/diagrams/build-plan.md)
- **Decisions:** [`docs/adr/`](docs/adr/)

## Quick start (coming with M1)

```bash
npm install
npm run seed     # loads bundled demo data — no API key required
npm run dev      # open http://localhost:3000
```

Live ingestion (optional) needs `OPENROUTER_API_KEY` and `INGEST_LIVE=1`. Embeddings run
locally (transformers.js), so no embeddings key is required. Models are configurable —
copy [`.env.example`](.env.example) to `.env` and swap `OPENROUTER_CHAT_MODEL` /
`OPENROUTER_ENRICH_MODEL` for any OpenRouter model without touching code.

## Running the pipeline

`npm run ingest` runs the pipeline as far as it is built — fetch, normalize, dedupe,
persist — into `data/leapfrog.sqlite` (migrations included, so a fresh clone works):

```bash
npm run ingest                            # every catalog source
npm run ingest -- --match sonatype        # one vendor
npm run ingest -- --kind nvd --max 5      # one adapter, 5 items per source
```

Re-running is a no-op: sources are keyed on their locator and items on a canonical-URL
hash, so nothing is stored twice. Each source keeps its own fetch cursor, so later runs
only ask for new items.

`npm run fetch` is the same fetch with no database writes — useful for smoke-testing a
new source before adding it to the catalog:

```bash
npm run fetch -- --max 3                  # every catalog source
npm run fetch -- --kind nvd --json        # machine-readable output
```

No API keys are required. `GITHUB_TOKEN` (60 → 5,000 requests/hour) and `NVD_API_KEY`
(5 → 50 requests/30s) raise the rate limits when set.
