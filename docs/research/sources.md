# Research sources

Last reviewed: 2026-07-10.

These sources informed the decisions; they are lenses, not substitutes for
measurement. The books provide durable architecture reasoning. Current product
and browser behavior was checked against primary platform documentation.

## O'Reilly architecture and systems sources

### Fundamentals of Software Architecture, 2nd Edition

Mark Richards and Neal Ford, 2025.

- [Chapter 5: Identifying Architectural Characteristics](https://learning.oreilly.com/library/view/fundamentals-of-software/9781098175504/ch05.html) — translate “fast,” “reliable,” and “easy to evolve” into a small, measurable set of driving qualities.
- [Chapter 11: Modular Monolith Architecture](https://learning.oreilly.com/library/view/fundamentals-of-software/9781098175504/ch11.html) — preserve domain boundaries and automated dependency rules without paying speculative distributed-systems cost.
- [Chapter 19: Choosing the Appropriate Architecture Style](https://learning.oreilly.com/library/view/fundamentals-of-software/9781098175504/ch19.html) — choose the simplest least-worst style for today's proven needs and name exit conditions.
- [Chapter 21: Architectural Decisions](https://learning.oreilly.com/library/view/fundamentals-of-software/9781098175504/ch21.html) — record context, consequences, compliance, and evidence that would supersede a choice.

Applied here: one modular repository with two initial deployables, explicit
package seams, ADRs, and measurable triggers before adding services or repos.

### Designing Data-Intensive Applications, 2nd Edition

Martin Kleppmann and Chris Riccomini, 2026.

- [Chapter 2: Defining Nonfunctional Requirements](https://learning.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ch02.html) — use workload-specific percentiles, bounded queues, and fault-versus-failure outcomes.
- [Chapter 5: Encoding and Evolution](https://learning.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ch05.html) — protocol compatibility is deployment architecture; retries require deduplication because a timeout is ambiguous.
- [Chapter 9: The Trouble with Distributed Systems](https://learning.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/ch09.html) — connections break, messages duplicate, processes pause, and clocks disagree.

Applied here: idempotent command IDs, versioned messages, server deadlines,
reconnect snapshots, bounded event tails, and no claim of exactly-once delivery.

### Release It!, 2nd Edition

Michael T. Nygard, 2018.

- [Chapter 3: Stabilize Your System](https://learning.oreilly.com/library/view/release-it-2nd/9781680504552/f_0026.xhtml) — design explicit failure modes and preserve the critical user journey.
- [Chapter 5: Stability Patterns](https://learning.oreilly.com/library/view/release-it-2nd/9781680504552/f_0047.xhtml) — timeouts, bulkheads, backpressure, load shedding, bounded queues, and malicious dependency tests.
- [Chapter 9: Interconnect](https://learning.oreilly.com/library/view/release-it-2nd/9781680504552/f_0083.xhtml) — admission control must happen before queues and sockets collapse.

Applied here: one slow receiver is isolated, drawing traffic is bounded and
batched, retries use backoff/jitter, and actor recovery is tested under eviction.

### Domain boundaries, evolution, and AI

- Vlad Khononov, [Learning Domain-Driven Design](https://learning.oreilly.com/library/view/learning-domain-driven-design/9781098100124/) (2021) — keep state transitions and invariants in a cohesive aggregate; a logical domain boundary does not automatically require a microservice; event sourcing carries real evolution and deletion costs.
- Neal Ford, Rebecca Parsons, Pramod Sadalage, and Zhamak Dehghani, [Building Evolutionary Architectures, 2nd Edition](https://learning.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/) (2022), Chapter 2 — an architecture claim becomes useful when an objective fitness function can falsify it.
- Chip Huyen, [AI Engineering](https://learning.oreilly.com/library/view/ai-engineering/9781098166298/) (2024), [Chapter 1](https://learning.oreilly.com/library/view/ai-engineering/9781098166298/ch01.html) and [Chapter 10](https://learning.oreilly.com/library/view/ai-engineering/9781098166298/ch10.html) — start with the smallest end-to-end system; model calls are probabilistic components that need validation, observability, feedback, cost limits, and deterministic fallbacks.

Applied here: room rules form one consistency boundary, full event sourcing is
deferred, fitness functions guard architecture, and future AI sits behind a
validated `WordSource` with a curated fallback.

## Current platform documentation

### Cloudflare Durable Objects and Workers

- [Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/) — model one object around one coordination atom such as a game session; avoid a global singleton.
- [WebSockets in Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) — a room can coordinate connected clients; hibernatable WebSockets reduce idle cost, and batching reduces high-frequency overhead.
- [Durable Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/) — in-memory state disappears across hibernation, eviction, restart, and deployment; durable truth must be stored.
- [Durable Object storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/) — each object has private transactional, strongly consistent storage; new namespaces should use SQLite-backed storage.
- [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/) — alarms provide at-least-once execution and retries, so handlers must be idempotent.
- [SQLite-backed storage alarm behavior](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#alarms) — alarms can run late during maintenance or failover, so the stored game deadline remains authoritative.
- [Testing Durable Objects](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/) — eviction can be forced in tests to prove restoration from storage.
- [Next.js on Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) — a possible future single-provider deployment path; the current decision does not require web and realtime to share one deployable.

Applied here: one Durable Object per room, SQLite-backed room state, alarms for
eventual phase progression, and Hibernation WebSockets. Platform limits still
need load tests; “supports many sockets” is not a capacity proof for this game.

### Browser behavior

- [MDN: WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) — the browser API has no built-in backpressure; `bufferedAmount` must inform a bounded sending policy.
- [MDN: VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) — the on-screen keyboard can shrink the visual viewport without changing the layout viewport.
- [MDN: Using Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events) — one input model supports touch, pen, and mouse drawing; `touch-action` prevents the canvas gesture from becoming page panning.
- [MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) — background pages and timers can be throttled; visibility is a reconnect signal, not proof that a socket survived.
- [MDN: `pageshow`](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event) and [MDN: `online`](https://developer.mozilla.org/en-US/docs/Web/API/Window/online_event) — returning from page cache or network loss should trigger a live-socket check.
- [web.dev: Back/forward cache](https://web.dev/articles/bfcache) — page restoration has its own lifecycle and should resume state instead of assuming a fresh lobby.
- [WebKit: Pointer Events and Visual Viewport in Safari](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/) — Safari exposes the input and visible-viewport primitives needed for the mobile layout, but real-device regression tests remain necessary.
- [Next.js App Router documentation](https://nextjs.org/docs/app) — current web application structure and client/server component model.

Applied here: local optimistic ink, explicit send-buffer limits, reconnect on
visibility/page/network restoration, Pointer Events, and a guess composer
positioned against the visual rather than merely the layout viewport.

## Decisions versus hypotheses

Source-backed principles do not prove product-specific thresholds. The modular
starting point, authoritative room, identity/socket separation, vector model,
and validation boundary are decisions. Player cap, latency budgets, reconnect
grace, mobile visible-area threshold, scoring constants, and Cloudflare capacity
are hypotheses that must be tested and can be revised without abandoning those
principles.
