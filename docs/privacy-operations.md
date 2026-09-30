# Privacy operations

The public notice is at `/privacitat`. The operator confirmed Roger Clotet and
roger@clotet.dev as the controller and privacy contact on 29 September 2026.

## Error monitoring assessment

Purpose: detect and repair failures that prevent people from playing Garbuix.
Server logs alone cannot identify browser rendering and loading failures. Error
class, stack location, timestamp and release are sufficient to group failures;
player identity and the content of their activity are unnecessary.

The shared `sentry-privacy.ts` configuration disables automatic collection of
identity, cookies, headers, bodies, query parameters, database values, AI content,
local variables and source context. It disables breadcrumbs and automatic session
reporting. Tracing and replay are not installed/enabled. Log and metric submissions
are dropped. The final error hook admits exception messages and technical error
metadata and strips attachments. Exception messages are preserved for diagnosis;
they are not scrubbed for personal data. Keep credentials, names, email addresses
and player-supplied text out of exception messages.

This is a proposed legitimate-interests assessment, not a completed legal review.
Players reasonably expect broken gameplay to be repaired, but would not expect
session recording or their messages to be transmitted for this purpose. Mini is
also used by children, which needs particular weight in the balancing assessment.
Errors are not linked to accounts; the recipient still sees the source IP at the
network layer. Disabling SDK identity collection does not make delivery anonymous.
Confirm the actual browser storage/network behavior and applicable device-access
rules before concluding that consent is unnecessary.

## Confirmed Sentry account details

The operator confirmed on 29 September 2026:

- Sentry's Data Processing Addendum has been reviewed and accepted.
- The organization uses the Free plan, with 30-day error-event retention.

The public notice states this retention period. Retention is determined by the
plan, not configured in the SDK. Recheck the notice when changing plans. This
period describes error events, not every category of provider data or backups.

## Remaining operator follow-up

These have not been verified or changed through this repository:

- Review Sentry's subprocessors and international transfer arrangements.
- Verify EU project storage. The configured DSN is an EU ingestion endpoint,
  which alone does not establish that every processing operation stays in the EU.
- Review Sentry's IP storage and server-side data-scrubbing settings as an
  additional control, including reports received before these changes.
- Identify the hosting provider and its retention, backups and processor terms.
- Approve the legitimate-interest/device-access
  assessment, accounting for children using Mini.
- Handle access, erasure and objection requests via the published email address.
  The app has no automatic account-deletion UI; delete relevant database records,
  consider backups and explain any required retention when fulfilling a request.

References:
- [Sentry GDPR guidance](https://sentry.io/trust/privacy/gdpr-best-practices/)
- [EDPB legitimate-interest guidance](https://www.edpb.europa.eu/public-consultations/guidelines-12024-on-processing-of-personal-data-based-on-article-61f-gdpr_en)
- [AEPD cookie guidance](https://www.aepd.es/guias/guia-cookies.pdf)
