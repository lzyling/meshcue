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
verifiers are persisted, and comparisons are constant-time.

Revoking is targeted or total, and neither touches review data: drafts, marks
and version locks survive a revocation.

## What is protected

Models, state, annotations, receipts and downloads all require authorization.
The page shell and a health endpoint carrying no model data are public — enough
to tell whether the service is up, and nothing more.

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
[docs/zh/LAN-ADMISSION.md](docs/zh/LAN-ADMISSION.md). Both were re-checked
against `server/access.mjs` and `server/network.mjs` for 0.10.0.
