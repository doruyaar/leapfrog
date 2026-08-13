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

Live ingestion (optional) needs `OPENAI_API_KEY` and `INGEST_LIVE=1`.

## Fetching sources

The ingestion adapters (RSS/Atom, GitHub Releases, NVD) can be run on their own —
useful for smoke-testing a new source before adding it to the catalog:

```bash
npm run fetch -- --max 3                  # every catalog source
npm run fetch -- --match sonatype         # one vendor
npm run fetch -- --kind nvd --json        # machine-readable output
```

No API keys are required. `GITHUB_TOKEN` (60 → 5,000 requests/hour) and `NVD_API_KEY`
(5 → 50 requests/30s) raise the rate limits when set.
