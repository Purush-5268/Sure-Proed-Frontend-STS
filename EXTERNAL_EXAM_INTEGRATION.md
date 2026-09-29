# Separate Examination Platform Contract

The examination platform owns questions, answers, evaluation, timer, and proctoring. SURE TRUST stores no submitted answers from that platform. It owns candidate authorization, the official result, qualification, journey progression, Django Admin records, and Android notifications.

## 1. Launch the candidate

The authenticated SURE TRUST student client requests a short-lived launch ticket:

```http
POST /api/exams/external-launch/
Authorization: Bearer <student-access-token>
Content-Type: application/json

{"application_id":"<application-uuid>"}
```

The response contains `launch_url`, `launch_ticket`, `application_id`, `exam_id`, and `attempt_id`. Open `launch_url` in the separate examination application.

## 2. Exchange the ticket

The examination backend exchanges the ticket within the configured five-minute lifetime:

```http
POST /api/exams/external-session/
Content-Type: application/json

{"launch_ticket":"<signed-ticket>"}
```

The response contains sanitized candidate/course identifiers, server-controlled start and expiry times, duration, pass percentage, and the result callback. It never contains SURE TRUST questions, correct answers, or candidate answers.

## 3. Publish the final result

Only the examination backend may call:

```http
POST /api/exams/external-result/
X-Exam-Timestamp: <unix-seconds>
X-Exam-Event-ID: <unique-result-event-id>
X-Exam-Signature: <hex-hmac-sha256>
Content-Type: application/json
```

Payload:

```json
{
  "attempt_id": "<attempt-uuid>",
  "application_id": "<application-uuid>",
  "exam_id": "<exam-uuid>",
  "marks_obtained": "45.00",
  "total_marks": "50.00",
  "submitted_at": "2026-08-15T16:45:00+05:30",
  "integrity_status": "PASSED",
  "proctoring_summary": {"tab_switches": 0}
}
```

The signature input is the exact raw request body prefixed by the timestamp and a period:

```text
hex(HMAC_SHA256(EXAM_PLATFORM_SHARED_SECRET, "<timestamp>." + raw_request_body))
```

The same event ID and identical payload may be retried safely. A different result after publication returns HTTP 409.

SURE TRUST calculates percentage and qualification, updates the Exam and Application, advances the student journey, and creates the personalized result notification. The examination platform must never send answers or set qualification directly.

## 4. Publish a module-test result

Module tests use the same HMAC headers and result-only rule. The examination platform
identifies the candidate with the issued student ID and assigned cohort; no application ID
or answer payload is accepted:

```http
POST /api/module-tests/external-result/
X-Exam-Timestamp: <unix-seconds>
X-Exam-Event-ID: <unique-result-event-id>
X-Exam-Signature: <hex-hmac-sha256>
Content-Type: application/json
```

```json
{
  "module_test_id": "<module-test-uuid>",
  "student_id": "STU-737C58",
  "cohort_id": "G31",
  "marks_obtained": "42.00",
  "total_marks": "50.00",
  "submitted_at": "2026-08-23T16:45:00+05:30",
  "integrity_status": "PASSED",
  "proctoring_summary": {"tab_switches": 0}
}
```

`student_id` and `cohort_id` accept either their UUIDs or their visible student/cohort
codes. SURE TRUST verifies that the student is actively enrolled in that course and cohort,
calculates percentage and pass/fail, exposes the result in Django Admin, and sends the
personalized Android notification. Duplicate delivery of the same signed event is idempotent.
