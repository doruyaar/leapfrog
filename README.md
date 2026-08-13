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
