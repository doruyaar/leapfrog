# LeapFrog — Product Scenarios

Both scenarios are built on **real 2026 events** so every screen shows verifiable data with
live source links. They illustrate the product's proactive-first flow end to end.

## The product in one picture (proactive-first)

```mermaid
journey
    title A day with LeapFrog — Maya, CI Analyst
    section 08:30 — Proactive
      Slack alert, critical competitor CVE: 3: LeapFrog
      Opens Today's Brief, 5 ranked items: 5: Maya
      Reads "why it matters": 5: Maya
    section 09:00 — Investigate
      Drills into competitor page: 4: Maya
      Asks follow-up in chat, gets cited answer: 5: Maya
    section 09:15 — Act
      Regenerates the competitor battlecard: 5: Maya
      Shares brief link with Sales: 5: Maya, Tom
    section Later — Passive
      Tom checks battlecard before a deal call: 5: Tom
      Dana reviews weekly trends and matrix: 4: Dana
```

## Scenario 1 — Competitor security incident (Nexus CVE-2026-3199 / CVE-2026-5189)

Two critical CVEs (CVSS 9.4 RCE and 9.2 hardcoded credential) disclosed against
Sonatype Nexus Repository in April 2026.

```mermaid
sequenceDiagram
    actor Maya as Maya (CI Analyst)
    participant Pipe as Pipeline (nightly)
    participant Brief as Today's Brief
    participant Ask as Ask LeapFrog
    participant Card as Battlecard

    Pipe->>Pipe: NVD adapter picks up CVE-2026-3199 (CVSS 9.4)
    Pipe->>Pipe: enrich → category=Security, vendor=Sonatype,<br/>impact=5, "why it matters" written
    Pipe-->>Maya: Slack alert (impact ≥ 4) before she's at her desk
    Maya->>Brief: opens Today's Brief
    Brief-->>Maya: #1 item: Nexus RCE, rationale + NVD/Sonatype citations
    Maya->>Ask: "Which Nexus versions are affected, and what's our angle?"
    Ask-->>Maya: grounded answer: 3.22.1–3.90.x affected, fixed in 3.91.0,<br/>angle: unified-platform security story, cited
    Maya->>Card: regenerate Sonatype battlecard
    Card-->>Maya: updated "Recent security track record" section, sources footnoted
    Maya-->>Maya: shares battlecard + brief link with Sales team
```

**The point being demonstrated:** the system found it, scored it, explained it, and produced
a sales-ready artifact — before the analyst asked anything.

## Scenario 2 — Strategic product move (GitLab Artifact Registry rollout)

GitLab is rolling out a new Artifact Registry through 2026 — a head-on move into the
artifact-management market. Slower-burning than a CVE, caught as a **trend**.

```mermaid
sequenceDiagram
    actor Dana as Dana (VP PMM)
    actor Maya as Maya (CI Analyst)
    participant Pipe as Pipeline
    participant Brief as Weekly view
    participant Matrix as Comparison Matrix

    Pipe->>Pipe: GitLab handbook/blog RSS: Artifact Registry ADRs,<br/>rate-limit design, rollout posts
    Pipe->>Pipe: enrich → category=Product, vendor=GitLab, impact=4
    Brief-->>Maya: recurring GitLab registry signals surfaced across the week
    Maya->>Matrix: reviews "Artifact management" axis
    Matrix-->>Maya: suggested update: GitLab moving 'partial' → 'native registry (rollout)'
    Maya->>Matrix: accepts suggestion (human-in-the-loop, never auto-applied)
    Dana->>Brief: opens weekly digest for QBR prep
    Brief-->>Dana: trend summary: "GitLab investing in artifact management,<br/>phased rate-limit rollout" + citations
```

**The point being demonstrated:** not just alerting — trend detection, a living comparison
matrix, and a human-in-the-loop for anything that changes stated positioning.

## Information architecture (what the user sees)

```mermaid
flowchart TD
    HOME["Today's Brief (home)<br/>ranked, scored, cited"] --> ITEM["Signal detail<br/>summary, impact rationale,<br/>source links"]
    HOME --> FEED["All Signals<br/>filter: vendor / category / date"]
    NAV["Sidebar (platform-style)"] --> HOME
    NAV --> COMP["Competitors<br/>per-vendor timeline"]
    NAV --> MATRIX["Comparison Matrix<br/>focus vendor vs. field"]
    NAV --> CARDS["Battlecards<br/>generate / refresh / export"]
    NAV --> ASKP["Ask LeapFrog<br/>chat with citations"]
    NAV --> SRC["Sources (admin)<br/>add feed, run ingest now"]
    COMP --> CARDS
```
