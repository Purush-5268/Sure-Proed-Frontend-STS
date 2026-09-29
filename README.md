# Sure ProEd Platform - Backend API

![Django](https://img.shields.io/badge/Django-5.1-092E20?logo=django&logoColor=white)
![Django REST Framework](https://img.shields.io/badge/DRF-3.15-red?logo=django&logoColor=white)
![JWT Auth](https://img.shields.io/badge/Auth-SimpleJWT-orange)
![OpenAPI 3.0](https://img.shields.io/badge/API_Docs-Swagger_%26_ReDoc-blue?logo=swagger)
![Database](https://img.shields.io/badge/Database-PostgreSQL_192.168.0.72-4169E1?logo=postgresql)
![Celery](https://img.shields.io/badge/Task_Queue-Celery_%26_Redis-green?logo=celery)

Official Backend Service for the **Sure ProEd Platform**, operated by Sure Trust to provide free online education, domain training, and 6-month structured internship programs.

---

## 📋 Platform Overview & System Design

The Sure ProEd platform manages the complete end-to-end student journey from initial registration to course completion and certificate verification.

### 🔄 The Student & Staff Registration Journey Flow

```text
  ┌─────────────────────────────────────────────────────────┐
  │ 1. User Fills Registration Form                         │
  │    - Validates First & Last Name (No Numbers/Emojis)    │
  │    - Validates Strong Password Complexity Rules         │
  └───────────────────────────┬─────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────┐
  │ 2. Email Verification OTP Request                       │
  │    - Student: Sent to primary Email                     │
  │    - Staff (@suretrust.local): Sent to Mapped Email     │
  │    - Staged: NO database record created yet!            │
  └───────────────────────────┬─────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────┐
  │ 3. Submit 6-Digit Email OTP                             │
  │    - OTP Matched & Verified                            │
  │    - User Record & Student Profile Created in DB        │
  │    - JWT Tokens Issued + Account Verified Badge         │
  └───────────────────────────┬─────────────────────────────┘
                              │
                              ▼
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │ 4. Apply for │ ──> │ 5. Screening │ ──> │  6. Cohort   │
  │    Course    │     │     Exam     │     │  Assignment  │
  └──────────────┘     └──────────────┘     └──────────────┘
                                                   │
                                                   ▼
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │ 9. Verified  │ <── │ 8. Submit    │ <── │  7. Attend   │
  │ Certificate  │     │ Assignments  │     │   Classes    │
  └──────────────┘     └──────────────┘     └──────────────┘
```

### 👥 System User Roles
- **Student**: Registers, verifies email via OTP, completes screening exams, attends cohort sessions, submits assignments.
- **Mentor / Volunteer**: Staff member with internal staff email domains (`@suretrust.org`, `@suretrust.dev`, `@suretrust.local`, `@suretrust.tester`, `@suretrust.advisory`, `@suretrust.admin`, `@sureproed.mentor`, `@suretrust.vol`) verified via their personal `mapped_email`. Conducts classes, tracks attendance, evaluates submissions.
- **Admin**: Manages course offerings, creates cohorts, oversees applications, issues certificates, reviews support tickets.
- **Company**: Hiring partners who discover public student profiles and shortlist candidates.
- **Trustee**: Platform governance and high-level analytics access.

---

## 🔒 Platform Validation & Security Policies

### 1. 📧 Staged Email OTP Registration Policy
- **Zero Ghost Users**: No user account is written to the database until the user enters a valid, unexpired 6-digit OTP sent to their email.
- **Staff Domain Protection**:
  - Reserved Staff Domains: `@suretrust.org`, `@suretrust.dev`, `@suretrust.local`, `@suretrust.tester`, `@suretrust.advisory`, `@suretrust.admin`, `@sureproed.mentor`, and `@suretrust.vol`.
  - Reserved strictly for staff roles (Mentor, Volunteer, Admin, Trustee, Advisory). Students cannot register using staff domains.
  - Verification OTP for staff email accounts is automatically dispatched to their personal **`mapped_email`** inbox for verification.

### 2. 🔑 Strong Password Engine (`common.validators.StrongPasswordValidator`)
All user passwords (registration, reset, admin changes) are strictly validated against:
- **Length**: Minimum 8 characters.
- **Complexity**: Must contain at least 1 Uppercase (`A-Z`), 1 Lowercase (`a-z`), 1 Number (`0-9`), and 1 Special Symbol (`!@#$%^&*`).
- **Emoji Blocking**: Emojis (e.g. 😁, 🔥) and non-ASCII unicode characters are blocked.
- **Pattern Blocking**: Common weak sequences (`1234567890`, `qwertyuiop`, `password123`, `suretrust`) are rejected.
- **Similarity Check**: Password cannot contain substrings of the user's `email`, `first_name`, `last_name`, `mapped_email`, or `phone_number`.

### 3. 👤 Strict Name Validation (`common.validators.validate_name`)
- **No Digits**: Numbers (`0-9`) are forbidden in `first_name` and `last_name`.
- **No Emojis or Special Characters**: Emojis, underscores, and symbols like `@`, `!`, `#` are blocked.
- **Allowed Syntax**: Only letters (`a-z`, `A-Z`), spaces, hyphens (`Anne-Marie`), dots (`Dr. Smith`), and apostrophes (`O'Connor`) are allowed.

### 4. 📁 Unique Disk Filename Policy
Uploaded media files (photos, resumes, offer letters, evidence) are automatically saved with unique hashed filenames (e.g. `STU123456_a1b2c3d4.pdf`) to prevent disk collisions.

### 5. 🛡️ Admin-Only Swagger & API Documentation Policy
- **Strict Role Isolation**: OpenAPI Schema (`/api/schema/`), Swagger UI (`/api/docs/`), and ReDoc (`/api/redoc/`) are restricted **strictly to Admins** (`user.role == 'ADMIN'` or `user.is_superuser = True`).
- **Access Guardrails**:
  - Unauthenticated browser visitors are automatically redirected to the admin login portal: `/secure-admin/login/?next=/api/docs/`.
  - Non-admin authenticated users (Students, Mentors, Volunteers, Trustees) are rejected with `403 Forbidden`.
- **Supported Authentication Methods**: Django Session Cookies, HTTP Basic Auth, and JWT Bearer Tokens (`Authorization: Bearer <access_token>`).

### 6. 🔗 LinkedIn SSO & OAuth Account Matching Policy
- **No Automatic Account Creation**: Users attempting to log in with an unlinked or unregistered LinkedIn profile are **blocked from auto-registering**.
- **Error Response & Guidance**:
  - **REST API (`POST /api/auth/linkedin/callback/`)**: Returns HTTP `404 Not Found`:
    ```json
    {
      "error": "No account found matching this LinkedIn profile. Please register for an account first or connect your LinkedIn from your profile settings.",
      "is_registered": false
    }
    ```
  - **Browser Redirect (`GET /api/auth/linkedin/callback/`)**: Redirects to the frontend login page with a descriptive `?error=...` parameter (or `suretrust://linkedin-oauth?status=error` for mobile).
- **Personal Mapped Email Matching**: Automatically matches staff/mentor accounts via `mapped_email` so mentors logging in with their personal LinkedIn account match their verified staff account rather than creating duplicate student accounts.
- **Account Linking**: Existing users connect LinkedIn securely from within their profile settings while authenticated.

---

## 🛠️ Technology Stack & Architecture

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | Django 5.1 & Django REST Framework | Modular monolith architecture |
| **Authentication** | JWT (SimpleJWT) & Email OTP Verification | Staged registration, Bearer token security & LinkedIn OAuth 2.0 |
| **Application Server** | Gunicorn with UvicornWorker (Port `8000`) | Production ASGI HTTP & WebSocket server |
| **Database** | PostgreSQL (`192.168.0.72:5432`) / SQLite3 | Persistent connections (`CONN_MAX_AGE=60`) |
| **Caching & Broker** | Redis | Celery broker (DB 0), Celery results (DB 1), API/session cache (DB 2) |
| **Task Processing** | Celery & Celery Beat | Asynchronous background jobs (email, OTPs, attendance sync) |
| **Email Service** | ZeptoMail SMTP | Transactional notifications, OTP password reset & verification |
| **Google Integration** | Admin SDK Reports API & Calendar API | Official Google Meet attendance analysis & Meet link scheduling |
| **API Docs** | drf-spectacular | Automated OpenAPI 3.0, Swagger UI & ReDoc |

📄 **Original Platform Specification**: PDF specification is available in the repo at [`api_documentation/Sure ProEd Platform.pdf`](./api_documentation/Sure%20ProEd%20Platform.pdf).

---

## 🌟 Key Platform Features & Endpoints

### 1. 🔐 Staged OTP Email Verification & Auth
- `POST /api/auth/send-verification-otp/` — Send 6-digit OTP to student email (or staff `mapped_email`).
- `POST /api/auth/verify-email-otp/` — Verify OTP code and create verified `User` row in DB.
- `POST /api/users/forgot_password_request/` & `POST /api/users/forgot_password_confirm/` — 6-digit OTP email password reset.
- `GET /api/auth/linkedin/connect/`, `POST /api/auth/linkedin/callback/` — LinkedIn OAuth2 SSO.

### 2. 📚 Cohort Management & Filtering
- `GET /api/cohorts/?course=<id>` — Filter cohorts by course ID with lightweight payloads and `DjangoFilterBackend`.

### 3. 📝 Question Bank & Paper Sets (`/api/question-banks/`)
- Pre-Screening & Module Test question banks with structured JSON paper sets (**Paper A, B, C, D**).
- `GET /api/question-banks/` — List question banks (filters: `bank_type`, `course`, `cohort`, `difficulty`, `is_ai_generated`).
- `GET /api/question-banks/<id>/paper/<set_code>/` — Retrieve individual paper set (e.g. `paper/A/`) for candidate test frontend.
- `POST /api/question-banks/generate/` — Idempotent AI question generator endpoint. Repeated posts for the same course/cohort/module/exam scope reuse the existing bank.
- Each question is generated by `AI_GENERATOR_*`, then independently answered by `AI_VERIFIER_*`. The question is stored only when both answers match and verifier confidence meets `AI_VERIFIER_MIN_CONFIDENCE`.
- Django admin shows the stored question text, four options, correct answer, verifier result, and confidence before publication.
- Django admin's **Add Question Bank** page provides **Save and generate AI papers once**. Select Pre-Screening plus its course/optional cohort, or Module Test plus its course/cohort/module, choose the AI paper-set count, and press the button. The button enables AI mode automatically. Existing or concurrent requests for the exact same scope are reused instead of posting duplicate generation jobs.

### 3. 📥 User Support Request & Helpdesk System (`/api/requests/`)
- Support form for **Students**, **Mentors**, and **Volunteers** with tracking numbers (`REQ-XXXXXX`), file attachments, and resolution notes.
- Admin CSV exports and filtering built into [`https://api.sureproed.com/secure-admin/common/userrequest/`](https://api.sureproed.com/secure-admin/common/userrequest/).

### 4. 📅 Attendance Tracking & Audit System (`/api/attendance/`)
- **Google Workspace Admin SDK Integration**:
  - `GET /api/attendance/<session_id>/official-attendance/` — Audit Google Meet participant log matching participant email, join/leave duration, and attendance verification.
  - Granular scope filtering by `scope` parameter (`all`, `domain`, `course`, `cohort`).
- **Class Types & Automated Meet Scheduling**:
  - Supports `DOMAIN` (Course-specific session), `LST` (Life Skills & Soft Skills Training), `CELEBRATION` (Platform webinars), and `INTERPRETER` sessions.
  - Automated Google Meet link creation (`generate_google_meet`) via Google Calendar API integration.
- **Attendance Policy & Auto-Suspension**:
  - Student attendance percentage is tracked across mandatory sessions.
  - Failing to maintain attendance thresholds or missing consecutive mandatory classes triggers automated status suspension (`SUSPENDED`).
- **Styled Excel Export & Dashboard Summaries**:
  - `GET /api/attendance/export_excel/` — Formatted `.xlsx` spreadsheet export with 12-hour AM/PM timestamps, attendance stats, and auto-adjusted columns.
  - Mentor Attendance Summary (`mentor_attendance_summary` in Admin & API) displaying total classes conducted and attendance metrics.

### 5. 📊 Student Dashboard Statistics
- `GET /api/students/statistics/` — Real-time metrics aggregator for active cohort, exam scores, and attendance percentage.

---

## ⚡ Low-Latency & Performance Optimizations

- **Composite Database Indexes**: Added composite B-Tree indexes on `User`, `UserRequest`, `Announcement`, and `Notification` models.
- **SQL JOIN Optimizations (`select_related` / `prefetch_related`)**: Replaced N+1 query patterns across ViewSets.
- **Persistent DB Connections (`CONN_MAX_AGE=60`)**: Eliminates per-request TCP handshake overhead.
- **Redis API Cache**: Versioned course-catalog responses and Django sessions use Redis DB 2.
- **Bounded API Payloads**: DRF page-number pagination returns at most 25 records per response by default.

---

## 📖 Interactive API Documentation & Endpoint Directory (🔒 Admin Only)

Access the live interactive API documentation when logged in as an **Admin** (`role == 'ADMIN'` or `is_superuser = True`). Unauthenticated browser visits automatically redirect to `/secure-admin/login/?next=...`.

| Interface | URL Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| **Swagger UI** | [`https://api.sureproed.com/api/docs/`](https://api.sureproed.com/api/docs/) | 🔒 **Admin Only** | Interactive API explorer, request tester & JWT Bearer tester |
| **ReDoc** | [`https://api.sureproed.com/api/redoc/`](https://api.sureproed.com/api/redoc/) | 🔒 **Admin Only** | Structured API documentation reader |
| **OpenAPI Schema** | [`https://api.sureproed.com/api/schema/`](https://api.sureproed.com/api/schema/) | 🔒 **Admin Only** | Raw OpenAPI 3.0 YAML/JSON specification |

> [!NOTE]
> Authenticate via active Django session in your browser or supply an Admin JWT token: `Authorization: Bearer <admin_access_token>`.

📁 **Documentation Files Folder**:
- 📌 **API Endpoints Directory Guide**: [`api_documentation/ENDPOINTS_QUICK_REFERENCE.md`](./api_documentation/ENDPOINTS_QUICK_REFERENCE.md)
- Google Meet Handoff Spec: [`GOOGLE_MEET_ATTENDANCE_HANDOFF.md`](./GOOGLE_MEET_ATTENDANCE_HANDOFF.md)
- OpenAPI JSON Schema: [`api_documentation/openapi.json`](./api_documentation/openapi.json)

---

## ☁️ Cloud VM Server Deployment Guide (`106.51.129.34:2222`)

Follow these steps to pull and deploy this repository on your Cloud Linux VM (`dev1@106.51.129.34` port `2222`):

```bash
# 1. Connect to Cloud VM
ssh -p 2222 dev1@106.51.129.34

# 2. Navigate to Project Directory & Activate Virtual Environment
cd ~/pradeep-backend
source venv/bin/activate

# 3. Pull Latest Code
git pull origin Pradeep-Backend-v1

# 4. Install updated requirements
pip install -r requirements.txt

# 5. Apply Database Migrations
python manage.py migrate

# 6. Keep production hostnames and the admin URL in .env (never in view code)
# DEBUG=False
# ALLOWED_HOSTS=api.sureproed.com,localhost,127.0.0.1
# ADMIN_ALLOWED_HOSTS=api.sureproed.com
# ADMIN_PORTAL_URL=https://api.sureproed.com/secure-admin/
# USE_X_FORWARDED_HOST=False
# SECURE_SSL_REDIRECT=True

# 7. Install the managed Gunicorn service used by the private upstream proxy
sudo install -D -m 0644 deployment/systemd/gunicorn.service.d/override.conf \
  /etc/systemd/system/gunicorn.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart gunicorn

# 8. Allow the private reverse-proxy gateway and block every other source on 8000
sudo ufw allow 2222/tcp
sudo ufw delete allow 8000/tcp
sudo ufw allow proto tcp from 192.168.0.99 to any port 8000
sudo ufw deny 8000/tcp
sudo ufw --force enable

# 9. Validate and reload the domain-only Nginx fallback configuration
sudo install -m 0644 deployment/nginx/sureproed.conf \
  /etc/nginx/sites-available/sureproed
sudo nginx -t
sudo systemctl reload nginx
```

The production VM currently receives proxied domain traffic on port 8000 from
the private upstream gateway `192.168.0.99`. Gunicorn therefore listens on the
VM interface, while UFW allows that gateway and denies every other source on
port 8000. The Django admin host middleware independently permits only the DNS
names configured in `ADMIN_ALLOWED_HOSTS`.

---

## 🔐 Secure Admin Portal (`/secure-admin/`)

The admin portal features **Email Verification Badges** (`VERIFIED` Green / `UNVERIFIED` Red) and optional **2FA TOTP** protection:
- **Admin Portal URL**: [`https://api.sureproed.com/secure-admin/`](https://api.sureproed.com/secure-admin/)
- **Start Test Hub**: [`https://api.sureproed.com/secure-admin/exams/starttest/`](https://api.sureproed.com/secure-admin/exams/starttest/)
- **Question Bank AI Review**: [`https://api.sureproed.com/secure-admin/question_bank/questionbank/`](https://api.sureproed.com/secure-admin/question_bank/questionbank/)

The legacy Jitsi-style **Exam proctoring rooms** model is intentionally hidden
from Django admin. Google Meet scheduling and attendance remain available in
the attendance workflow, while historical exam-attempt references are retained
internally so old assessment records are not corrupted.

Deleting a user now cascades through personal profiles, applications, exams,
notifications, feedback, support content, and other user-owned rows. Shared
courses, cohorts, classes, assignments, and job references are retained but
their creator/conductor attribution is set to `NULL`, preventing one staff
account deletion from erasing records belonging to other users. Email-only OTP
rows are purged as part of account deletion.

### Start Test Hub workflow

The Start Test Hub deliberately uses the standard Django admin layout and
theme. Its overview and course dropdown share one pre-screening eligibility
definition (`APPLIED` and `EXAM_PENDING`), so the
overview total always equals the sum of the published-course counts.

Legacy applications created before automatic Question Bank generation can be
repaired from their Django admin change page with **Prepare/reuse AI screening
bank**. The action creates or reuses one course-scoped bank without creating a
premature exam schedule. After generation reaches `APPROVED`, review the stored
papers and click **Publish verified papers** on the Question Bank. Returning to
the application then shows an empty schedule inline and automatically selects
the sole published course bank and its first paper. The administrator can set
the time window and release gate normally. Concurrent repair clicks reuse the
same bank and never dispatch duplicate generation jobs.

For module tests, selections are dependent and server-validated:

1. Select a published course.
2. Select an active cohort belonging to that course.
3. Select an active module belonging to that course.
4. Select an approved, open module-test question bank matching that exact
   course, cohort, and module.

The server rejects stale or edited cross-course selections. Pre-screening bulk
release likewise acts only on the explicitly selected eligible applications
and an approved, open question bank for their course.

Scheduling a cohort module test also creates its Google Calendar event and
Google Meet link automatically. The attendee list is restricted to enrolled
students and mentors in the selected cohort. Submitting the exact same
course/cohort/module/question-bank window again reuses the stored module test;
the Calendar event ID is updated rather than creating a duplicate meeting.
The release gate stays locked if neither Calendar nor an existing cohort Meet
link can provide a usable URL. The live-window monitor exposes the Meet link,
and **Close** immediately expires the local exam window and locks student
access while retaining the meeting details for audit.

Course prerequisites can be edited without resubmitting existing cohorts.
Cohort batch codes such as `G1-26` are unique within a course (not globally),
and the Course admin links to the separately managed cohort list instead of
embedding editable started-cohort rows. Failed AI Question Banks with no
candidate attempt history expose **Delete failed unused bank**; cleanup locks
and detaches unused schedules and removes empty legacy rooms, while immutable
attempt history remains protected. AI HTTP failures now retain the safe Gemini
status and message so invalid models, credentials, or quota errors can be
diagnosed from the admin record. Gemini calls are also serialized per API key
and model through the shared cache, and `429 RESOURCE_EXHAUSTED` responses wait
for Google's retry interval instead of consuming all generation attempts
immediately. `AI_GEMINI_MIN_REQUEST_INTERVAL_SECONDS` defaults to `3.2` for the
20-request free-tier window and can be adjusted for a paid quota.

Failed AI Question Banks are automatically queued for safe Celery cleanup after
`FAILED_QUESTION_BANK_RETENTION_HOURS` (one hour by default). Celery Beat also
sweeps eligible failures every 30 minutes, covering broker outages or missed
callbacks. Cleanup applies to failures from automatic application/course
generation, cohort/module workflows, admin generation, and API regeneration.
It deletes only banks without candidate attempt history; protected audit banks
are retained, while unused schedules are locked and detached first.

Before a bank reaches final `FAILED` state, Celery retries the same Question
Bank row (so it never creates a duplicate paper) up to
`AI_QUESTION_BANK_MAX_RETRIES`, with a linearly increasing delay based on
`AI_QUESTION_BANK_RETRY_DELAY_MINUTES`. The defaults are two whole-bank retries
after 10 and 20 minutes; failed-bank cleanup starts only after those retries are
exhausted. Each question still has its own `AI_MAX_ATTEMPTS_PER_QUESTION` retry
budget inside every bank attempt.

Approved banks expose **Share with course cohorts** in Django admin.
Pre-screening banks are course-wide and therefore require no copies. For a
module-test bank, the operation creates unpublished draft copies only for
eligible cohorts belonging to the same course and reuses an existing bank for
the same course/cohort/module scope, making repeated clicks idempotent.

The Start Test Hub always displays the pre-screening bulk-start gate after a
course is selected. If no approved open bank exists, it shows the latest bank's
generation/publication state and a **Prepare/reuse AI Question Bank** or
**Review and publish Question Bank** action. The bulk start button remains
visibly disabled until that safety prerequisite is satisfied instead of
disappearing without explanation.

Start Test Hub `datetime-local` defaults are generated in the configured Django
timezone (`Asia/Kolkata`). Values entered by the administrator remain
authoritative: bulk scheduling overwrites each selected candidate's start/end
window, marks an existing schedule as rescheduled, retains one Meet per course
cohort, and updates the linked Google Calendar event with the new times and the
selected candidate attendees.

In the pre-screening launcher, **Authorize/start exam** is one consistent gate:
when checked, bulk scheduling sets both `is_released` and `admin_started_at` for
every selected candidate. The student `start-internal` endpoint validates both
flags plus the configured start/end window, and the Hub displays **Started**
only when both server-side gates are open.

Legacy pre-screening banks that still carry a cohort value are also considered
reusable for their course. The Hub explicitly asks the administrator to either
**Reuse existing Question Bank** or **Generate new AI Question Bank**. Reuse
cancels an empty unused AI job, validates every stored paper, promotes the bank
to the course-wide approved/open bank, returns to the Hub with it selected, and
immediately enables bulk start;
the AI choice reuses any in-flight generation job so repeated clicks cannot
spend quota on duplicate questions.

---

## 🎓 Course & Cohort Business Lifecycle Rules

1. **Cohort Creation Prerequisite**:
   - A new Cohort can **only** be created if its associated Course is set to `PUBLISHED`.
   - Creating a cohort for a Course in `DRAFT`, `ARCHIVED`, or `CANCELLED` status is blocked at both model clean (`Cohort.clean`), Django Admin form, and REST API serializer layers.
2. **Application Portal Cohort Visibility**:
   - Only cohorts in `OPEN` status are visible to candidates on the student application portal.
   - Cohorts transitioning to `DRAFT`, `TRAINING`, `INTERNSHIP`, `SOFT_SKILLS`, `COMPLETED`, or `CANCELLED` are automatically hidden from student application dropdowns and candidate registration.
3. **Automatic Course Cancellation Cascade**:
   - When a Course status is updated to `CANCELLED`, all active/open cohorts under that course are automatically transitioned to `CANCELLED`.
   - All open student applications for those cohorts are transitioned to `CANCELLED`, immediately closing any pending admissions.

---

## ⚡ Bulk Pre-Screening Exam Scheduling System

Administrators can schedule pre-screening exams for hundreds of candidates simultaneously via two interfaces:

### 1. Cohort-Wide Mass Scheduling (`/secure-admin/applications/prescreening/bulk-schedule-cohort/`)
- **Interactive Scope Selection**: Dynamic cascading dropdowns filter Cohorts and approved Question Banks based on the chosen Course.
- **Live Pre-Flight Counter**: Calls `/secure-admin/applications/prescreening/bulk-schedule-count/` in real time to display the exact number of eligible candidates before submitting.
- **Schedule Override Safeguards**:
  - Targets **`APPLIED`** candidates by default.
  - Candidates already in **`EXAM_PENDING`**, completed, or passed are protected and excluded by default.
  - Includes an explicit **`⚠️ Override Existing Exam Schedules`** checkbox to reschedule existing candidates only when intentionally checked.
- **Single Cohort Google Meet Master Link**:
  - Auto-prefills the cohort's master `meeting_link`. All candidates scheduled in the cohort share that single meeting link.
  - Student emails are added as direct attendees in the Google Calendar event with `guestsCanInviteOthers=False` and `guestsCanModify=False`.
  - Host controls set to **Restricted** ensure only invited candidate emails can enter directly.
- **Candidate Access Revocation**:
  - `PreScreening` tracks `calendar_event_id`.
  - Cancelling or revoking a candidate calls `remove_candidate_from_screening_meet`, patching the Google Calendar event to remove the student's email from `attendees`.

### 2. Selection-Based Bulk Actions
- Available in both **Pre-Screening Admin** (`/secure-admin/applications/prescreening/`) and **Applications Admin** (`/secure-admin/applications/application/`).
- Allows selecting specific applicant rows via checkboxes $\rightarrow$ Action: **"⚡ Bulk Schedule Selected Candidates"** $\rightarrow$ opens an intermediate confirmation form with slot inputs, paper set selection, and notification toggles.

---

## ⚙️ Cohort-Side Pre-Screening & Interview Controls

Default pre-screening exam schedules and interview requirements are managed at the **Cohort** level:
- **`default_screening_at`**: Batch-specific exam date & time. New applications assigned to this cohort receive this schedule automatically.
- **`requires_interview`**: Boolean toggle per cohort. When unchecked, qualified candidates skip the interview stage and advance directly to student role verification and onboarding.
- Configurable directly from **Cohort Admin** (`/secure-admin/cohorts/cohort/`) under the dedicated **"Pre-Screening & Interview Controls"** fieldset.

---

### ➕ How to Provision a New Team Member for Admin Access

```bash
# 1. Create Django Staff User
python manage.py shell -c "from accounts.models import User; User.objects.create_user(email='newuser@suretrust.org', password='SecureP@ssw0rd2026!', is_staff=True, role='ADMIN'); print('Admin user created!')"

# 2. Setup 2FA TOTP Device
python manage.py setup_2fa newuser@suretrust.org --password "SecureP@ssw0rd2026!"
```
