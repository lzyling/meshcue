# Security

MeshCue runs a local HTTP server and asks a person to open it in their own
browser. That is the whole exposure, and this document describes it — not as a
footnote, but because admitting a browser is the first thing a new user runs
into, and a step you cannot see the reason for is a step you cannot trust.

## What listens, and where

By default the workbench binds `127.0.0.1`. Nothing outside the machine can
reach it.

LAN mode exists because the person reviewing a model is often not sitting at the
machine that generated it. It binds **one verified private IPv4 address**:

- `0.0.0.0` and public addresses are never bound.
- `REVIEW_HOST=lan` picks an address only when exactly one private interface is
  a candidate. With several, it refuses and asks to be told which — guessing
  would publish a review on a network nobody chose.
- An explicit address must itself be private (RFC 1918 ranges, verified at bind
  time).

Model publishing goes over a local Unix socket, not the HTTP surface. A browser
cannot change which version is displayed.

## How a browser is admitted

LAN mode always requires authorization. There is no mode where a private address
is served without it.

1. The agent creates a **single-use grant**, valid for **15 minutes**, for a
   client IPv4 the user has confirmed. The address is never inferred from the
   first visitor or a User-Agent string.
2. Issuing a new grant immediately invalidates any unused earlier one. Browsers
   already admitted are not evicted.
3. The browser exchanges the grant for an `HttpOnly`, `SameSite=Strict` session
   cookie. Credentials never travel in a URL, a form, or the conversation.
4. The session lasts **30 days of disuse**. Ordinary use renews it; there is no
   hourly cut-off in the middle of a review. Restarting the service keeps
   existing authorizations.

Raw credentials are never written to disk. Only non-replayable SHA-256
verifiers are persisted. A grant is checked with a constant-time comparison; a
session cookie is never compared at all, it is looked up by the digest of what
the browser sent.

Revoking is targeted or total, and neither touches review data: drafts, marks
and version locks survive a revocation.

## How long the listener itself lasts

The thirty days above belong to the authorization, not to the exposure. An
instance nobody has used for **24 hours reclaims itself** and stops listening,
so a review that was forgotten is not a LAN service with a month of trust
behind it — it is a closed port. Reopening the project restores the models,
the drafts and the marks; what expires is the URL.

Polling does not count as use. The page asks for state every 2.2 seconds and
heartbeats every 10, which is some 47,000 requests a day from a tab nobody is
looking at; counting those would keep alive exactly the instance this exists to
collect. Use means a trusted pointer or key event in a visible tab, a fetch of
the model bytes, or a write that changes the round.

`REVIEW_IDLE_HOURS` (or `idleHours` in config) moves the deadline. **Setting it
to `0` turns reclaiming off** and restores the old behaviour of listening until
something external stops the process. A value that cannot be read falls back to
24 hours rather than to "never".

## What is protected

Models, state, annotations, receipts and downloads all require authorization.
The page shell and a health endpoint are public. Health carries no model,
annotation or authorization data; it does report the version, process id,
instance id and how close this instance is to reclaiming itself, which is what
lets a caller tell a reclaimed review apart from a crashed one.

Writes have to come from the workbench, and are refused three ways before
authorization is even considered: the `Host` header must match the address the
service bound, a cross-site `Origin` or `Sec-Fetch-Site` is rejected, and an
`X-Review-Client` header no cross-origin form can set is required. Responses
carry `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`, and
every `/api/` response is `no-store`.

`retain` is worth stating plainly: it shortens the version strip, and that is a
**display rule, not an access rule**. A hidden version keeps its draft, its
marks and its file, and a browser already holding a session can still fetch it.
Nothing is revoked by hiding it, because nothing was meant to be.

## What MeshCue does not do

- It never asks for, stores or displays host credentials. The CLI uses the
  host's own configuration.
- It does not open the local agent socket to the network.
- It does not treat a successful bind as a usable entry point. Until a browser
  is admitted, an agent should say the review is not yet reachable rather than
  hand over a URL that will refuse.

## Reporting a vulnerability

Email **kelvenlinglzy@gmail.com** with what you found and how to reproduce it.
Please do not open a public issue for anything that exposes review data or the
authorization path.

---

The Chinese design notes behind these rules — including why long-lived browser
trust replaced a 60-minute expiry, and the LAN admission flow in detail — are in
[docs/zh/BROWSER-TRUST.md](docs/zh/BROWSER-TRUST.md) and
[docs/zh/LAN-ADMISSION.md](docs/zh/LAN-ADMISSION.md).

All three files were re-checked against `server/access.mjs`, `server/network.mjs`,
`server/idle.mjs` and the route table in `server/index.mjs` for **0.13.1**. The
previous pass was for 0.10.0, before an instance could reclaim itself, which is
why that section is new here rather than an edit.
