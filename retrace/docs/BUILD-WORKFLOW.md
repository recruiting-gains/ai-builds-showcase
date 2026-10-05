# Build workflow

This graph records the development process, not a permanent agent service or scheduler shipped in the product.

```mermaid
flowchart TD
  A[Inspect reference source and evidence] --> B[Define original scope and data contract]
  B --> C[Review desktop and phone composition]
  C --> D[Build replay interface]
  C --> E[Build API and local bridge]
  C --> F[Prepare promo direction and media]
  D --> G[Exercise a complete working slice]
  E --> G
  G --> H{Tests and independent review pass?}
  H -->|No, within two correction passes| I[Correct specific failure]
  I --> H
  H -->|Budget exhausted or external blocker| J[Save checkpoint and resume step]
  H -->|Yes| K[Publish source and deploy]
  K --> L[Verify public URL and private fixture path]
  L --> M[Capture actual interface]
  F --> N[Blender composition and Runway contribution]
  M --> N
  N --> O{Export and reopen checks pass?}
  O -->|No, within media budget| P[Correct the specific media issue]
  P --> O
  O -->|Blocked| J
  O -->|Yes| Q[Deliver video, editable source, and evidence]
```

Frontend, backend, and media have separate owners. Shared resources have one writer at a time. Review is independent of implementation. Checkpoints record versions, observed outcomes, budgets, and exact resume steps; they exclude credentials and private reasoning.

Agent-checked limits for this run: application four hours/120 action groups, release one hour/30 groups, media two hours/60 groups; two corrective passes per phase. Media uses no more than 200 existing Runway credits, two visual candidates, two narration takes, and one music generation. Limits are workflow procedures, not runtime guarantees.
