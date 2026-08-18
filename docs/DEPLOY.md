# Deploying LeapFrog

LeapFrog is **local-first by design** (docs/DESIGN.md §4): `npm run seed && npm run dev`
runs the whole product on a laptop with zero keys. This guide covers running it as a
containerized, password-protected deployment — locally with Docker Compose, and hosted
on Render for a shareable link.

The whole app ships as **one image** with two roles (see [`Dockerfile`](../Dockerfile)):

- **web** — the Next.js UI (`docker/entrypoint-web.sh`)
- **worker** — the pipeline stages on a schedule (`docker/entrypoint-worker.sh` →
  `docker/scheduler.sh`)

Both roles open the **same SQLite file** on a shared volume. That single file is the
system of record, the BM25 index (FTS5), and the vector index (sqlite-vec) all at once —
which is what makes the app portable, and also the one thing that shapes every deploy
decision below.

---

## 1. Local: Docker Compose (true separated services)

Two independent containers (web + worker) sharing one Docker volume — the intended
cloud shape, on a laptop.

```bash
# Optional: password-protect the local URL and/or run the live pipeline.
export DEMO_USER=demo DEMO_PASS=leapfrog
# export INGEST_LIVE=1 OPENROUTER_API_KEY=sk-or-...

docker compose up --build
```

Open <http://localhost:3000>. On first boot the **web** container seeds the demo
snapshot (downloads the ~30 MB embedding model once, cached under the volume); the
**worker** container waits for the DB, runs a pipeline pass immediately, then repeats
every `SCHEDULE_INTERVAL_SECONDS` (default 6h). Each pass writes a heartbeat next to
the SQLite file, surfaced at `/api/health` (`scheduler.stale` flips after two missed
intervals) — check that instead of container logs to confirm the pipeline is ticking.

| Var | Default | Purpose |
|---|---|---|
| `DEMO_USER` / `DEMO_PASS` | empty (gate off) | HTTP Basic Auth for the URL |
| `LEAPFROG_ALLOW_PUBLIC` | empty | Set `1` to run a *production* build with the gate off on purpose (otherwise it fails closed) |
| `INGEST_LIVE` | `0` | `1` runs the real fetch→enrich→embed pipeline (needs `OPENROUTER_API_KEY`) |
| `SCHEDULE_INTERVAL_SECONDS` | `21600` | Worker pipeline cadence |
| `LEAPFROG_DB_PATH` | `/data/leapfrog.sqlite` | DB location on the shared volume |

---

## 2. Hosted: Render (the shareable link)

### One-time steps

1. Push this branch to GitHub.
2. In Render: **New → Blueprint**, point it at the repo. Render reads
   [`render.yaml`](../render.yaml) and provisions a Docker **web service** with a 1 GB
   persistent disk mounted at `/data`.
3. Set the secret env vars in the dashboard (they are `sync: false`, never committed):
   - `DEMO_USER`, `DEMO_PASS` — the credentials you send the reviewer.
   - `APP_BASE_URL` — your Render URL, e.g. `https://leapfrog.onrender.com` (used for
     email deep links).
   - Only if going live: `OPENROUTER_API_KEY` (+ optional `GITHUB_TOKEN`, `NVD_API_KEY`,
     `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`) and flip `INGEST_LIVE=1`.
4. Deploy. First boot seeds the demo DB onto the disk; `/api/health` reports healthy
   while it does.

### The link to send

```
URL:      https://<your-service>.onrender.com
Username: <DEMO_USER>
Password: <DEMO_PASS>
```

The Basic-auth gate ([`apps/web/src/middleware.ts`](../apps/web/src/middleware.ts))
covers every route except `/api/health` and static assets. It **fails closed in
production**: a hosted build with `DEMO_USER`/`DEMO_PASS` unset returns `503` rather than
serving the app openly (a forgotten secret should not expose a metered `/api/ask`). To run
a hosted demo without a gate deliberately, set `LEAPFROG_ALLOW_PUBLIC=1`.

### Why one service instead of web + worker?

A Render persistent disk attaches to **exactly one** service, and the web app must read
the SQLite file. So the pipeline scheduler co-locates inside the web container
(`RUN_SCHEDULER=1`) rather than running as a second service. This is the same
shared-SQLite coupling Compose makes visible locally — and the precise reason the
production scale-out path is Postgres.

---

## 3. Scale-out path (when SQLite is outgrown)

Everything above keeps SQLite, which is the right call for a demo. To run web and
worker as independently scaled, truly separate services (multiple instances, no shared
disk), the one real migration is the storage layer:

- **DB** → Postgres, via a Drizzle dialect swap (the ORM tables port cleanly).
- **Retrieval** → this is the real work: FTS5 (BM25) and sqlite-vec are SQLite-specific,
  so hybrid retrieval is re-implemented on `pgvector` + Postgres full-text
  (`tsvector`/`ts_rank`, or a BM25 extension), and the corpus is re-embedded.
- **Scheduler** → replace `docker/scheduler.sh` with a managed trigger (Render Cron,
  EventBridge, or Container Apps Jobs) hitting a stateless worker.

At that point the app is a standard stateless web tier + stateless worker + managed
Postgres — deployable as separated services on Render, ECS Fargate, Azure Container
Apps, or Kubernetes without the single-file constraint.
