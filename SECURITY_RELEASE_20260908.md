# Notification and account isolation release

The Android companion release is 1.1.11-beta (version code 18).

Notification keys now identify a recipient's source event, rather than visible text. A database uniqueness constraint and recipient locks prevent concurrent duplicate inserts. Content edits retain the notification UUID, reset unread only when content changes, and queue delivery after commit. Announcement links enforce current audience access and cascade deletion; the data migration reconciles source-linked history and exact duplicate deliveries only.

API notification ownership is immutable. Read, unread, delete, bulk-read and update operations use authenticated ownership. Browser push carries generic text only, including for legacy subscriptions. Mobile push carries only an ID and the registered account session; deletion invalidation causes the app to remove inaccessible items. API responses are private and non-cacheable.

The audit also fixes administrator-profile access and writes, staff-mentor student-profile upserts, private company applicant/shortlist fields, volunteer task/help scope, and WebSocket access-token validation and ongoing authorization. The companion browser changes isolate caches, pending requests, token refresh, local/session data and component state across logins.

## VM comparison

VM baseline: c71acd57774cf5c1aeaf3df2fff77722b5734bce. Its uncommitted diff was saved before editing. The VM's blanket global volunteer access in common/access.py, accounts/views.py, cohorts/views.py and students/views.py is deliberately excluded: assignment scope and explicit global grants remain authoritative. Prior-permission payload support from attendance/views.py is integrated with UUID validation, cohort membership checks and transactional persistence. The VM category migration is retained, followed by a compatibility migration retaining existing EXECUTIVE values.

## Verification and production safety

Run the release regression suite with test_settings_isolated. PostgreSQL race verification uses test_settings_release_postgres and the separately provisioned sureproed_security_test_20260908 database; that configuration explicitly rejects the production database name. Test fixture creation occurs only in disposable test databases.

No production seeding, account creation, imports, password resets or real-user notification sends are part of this release. Before activation, preserve the VM diff and untracked files, make and validate a PostgreSQL backup, review migrations, and compare protected business-table fingerprints while services are stopped. Only notification reconciliation, schema migration metadata and the APK release record may change.

Existing public leadership/company listings are intentional public features; private account and recruitment fields remain protected. Existing credentials and APK signing identity remain unchanged. Do not describe generic browser push as private-text background delivery.

VM PostgreSQL verification passed 218 tests, including the concurrent insert/update race and legacy migration version reconciliation. The fresh PostgreSQL install exposed identical class_status additions on two historical attendance branches; both now tolerate the existing column without changing already-applied production migrations. WebSocket and streaming-media tests use real transaction boundaries on PostgreSQL. A stale attendance test now respects the existing explicit completion policy.

The VM's prior-permission invitations are preserved using validated recipients and an after-commit task that rechecks an existing active grant before external delivery. The Android release additionally fixes automatic logout on cancelled identity requests and transient refresh failures, and keeps sign-in mounted while resetting private account screens.

A concurrent VM update, b6ee5b54d (attendance changes), was compared and merged before release. Sunday scheduling and combined Batch 1/2 sessions are preserved, while combined recipients remain restricted to those batches and prior-permission grants require authorized scope. Legacy Batch 3/4 values remain compatible. The new LST reminder uses a valid notification type and stable source key, so its final reminder updates the original record. Blanket volunteer directory access remains excluded. The temporary backup helper accidentally included in that VM commit is removed from application source; its backup artifacts are preserved privately on the VM.
