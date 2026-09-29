# Sure ProEd Platform Backend - API Documentation

Comprehensive API documentation for the Sure ProEd Platform MVP backend built with Django REST Framework, JWT Authentication, and OpenAPI 3.0.

---

## 🚀 Base URL & Server Information

- **Local Base URL**: `http://127.0.0.1:8000/` or `http://localhost:8000/`
- **Default Content Type**: `application/json`
- **Authentication Header**: `Authorization: Bearer <access_jwt_token>`

---

## 🔑 Authentication Endpoints

JWT token authentication is managed via `rest_framework_simplejwt`.

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/token/` | Obtain access and refresh JWT tokens | No |
| `POST` | `/api/auth/token/refresh/` | Refresh an expired access token using refresh token | No |

### Obtain Token Request Example
`POST /api/auth/token/`
```json
{
  "email": "admin@suretrust.local",
  "password": "Admin@123"
}
```
**Response (200 OK):**
```json
{
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
}
```

---

## 🔗 LinkedIn Social Auth (Post-Profile Connection)

Allow users who have created an account/profile to link their verified LinkedIn account via OAuth 2.0.

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/auth/linkedin/connect/` | Get official LinkedIn OAuth2 redirect URL | Yes (`Bearer <token>`) |
| `POST` | `/api/auth/linkedin/callback/` | Submit authorization `code` to link LinkedIn profile | Yes (`Bearer <token>`) |
| `POST` | `/api/auth/linkedin/disconnect/` | Unlink LinkedIn account from profile | Yes (`Bearer <token>`) |

### 1. Get Redirect URL
`GET /api/auth/linkedin/connect/`
**Response (200 OK):**
```json
{
  "authorization_url": "https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=...&redirect_uri=...&scope=openid+profile+email"
}
```

### 2. Connect LinkedIn Account Callback
`POST /api/auth/linkedin/callback/`
```json
{
  "code": "AUTH_CODE_FROM_LINKEDIN_REDIRECT"
}
```
**Response (200 OK):**
```json
{
  "detail": "LinkedIn account successfully connected.",
  "is_linkedin_connected": true,
  "linkedin_id": "789101112",
  "linkedin_url": "https://www.linkedin.com/in/789101112"
}
```

---


## 📖 OpenAPI & Interactive UI Docs

| Method | Endpoint | Format / Type | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/schema/` | OpenAPI 3.0 JSON/YAML | Raw OpenAPI specification schema |
| `GET` | `/api/docs/` | Interactive Swagger UI | Web UI to test and interact with endpoints |
| `GET` | `/api/redoc/` | ReDoc Documentation | Clean, structured API reader interface |

---

## 📦 Core Resource Endpoints

All list endpoints support pagination (`PAGE_SIZE: 20`). Standard permission policy: `IsAuthenticatedOrReadOnly` (Public Read, Authenticated Write).

### 1. User Accounts (`/api/users/`)
- `GET /api/users/` - List user accounts
- `POST /api/users/` - Create a new user (`STUDENT`, `MENTOR`, `TRUSTEE`, `COMPANY`, `ADMIN`)
- `GET /api/users/{id}/` - Retrieve user detail by UUID
- `PUT / PATCH /api/users/{id}/` - Update user details
- `DELETE /api/users/{id}/` - Remove user account

### 2. Student Profiles (`/api/students/`)
- `GET /api/students/` - List student profiles (filters: `student_code`, `specialization`, `graduation_year`)
- `POST /api/students/` - Create student profile attached to user
- `GET /api/students/{id}/` - Retrieve student profile details
- `PUT / PATCH /api/students/{id}/` - Update student profile details

### 3. Internship Courses (`/api/courses/`)
- `GET /api/courses/` - List 6-month internship offerings (24-week training + project structure)
- `POST /api/courses/` - Create new course offering (Admin only)
- `GET /api/courses/{id}/` - Retrieve course details and curriculum
- `PUT / PATCH /api/courses/{id}/` - Update course

### 4. Cohorts (`/api/cohorts/`)
- `GET /api/cohorts/` - List course batches/cohorts (e.g. `G01` for Java, VLSI)
- `POST /api/cohorts/` - Create cohort and assign mentors
- `GET /api/cohorts/{id}/` - Retrieve cohort details
- `PUT / PATCH /api/cohorts/{id}/` - Update cohort schedule / meeting link

### 5. Student Applications (`/api/applications/`)
- `GET /api/applications/` - List internship applications
- `POST /api/applications/` - Submit application for a course
- `GET /api/applications/{id}/` - Application status and qualification score
- `PUT / PATCH /api/applications/{id}/` - Progress application status (`APPLIED`, `SCREENING_PENDING`, `QUALIFIED`, `COHORT_ASSIGNED`)

### 6. Screening Question Bank (`/api/questions/`)
- `GET /api/questions/` - List evaluation questions (domain, difficulty, tags)
- `POST /api/questions/` - Add new question to bank

### 7. Question Bank (`/api/question-banks/`)
Manages structured JSON question paper sets (Paper A, B, C, D) for Pre-Screening and Cohort Module tests with direct UUID recognition for Cohort and Pre-Screening Exam.
- `GET /api/question-banks/` - List question banks (filters: `bank_type`, `course`, `cohort`, `exam`, `module_test`, `difficulty`, `is_ai_generated`)
- `POST /api/question-banks/` - Create a new question bank with Paper Sets A/B/C/D
- `GET /api/question-banks/{id}/` - Retrieve full question bank and all paper sets
- `GET /api/question-banks/{id}/paper/{set_code}/` - Retrieve a single paper set (e.g. `paper/A/`) for candidate/student test UI
- `GET /api/question-banks/by-cohort/{cohort_uuid}/` - Lookup active question banks assigned to a Cohort UUID
- `GET /api/question-banks/by-exam/{exam_uuid}/` - Lookup active question bank assigned to a Pre-Screening Exam UUID
- `POST /api/question-banks/generate/` - AI Question Generator endpoint (accepts `course_id`, `cohort_id`, `exam_id`, `module_id`, `module_test_id`)

### 8. Student Exams (`/api/exams/`)
- `GET /api/exams/` - List assigned qualification/evaluation exams
- `GET /api/exams/{id}/` - Retrieve exam details and questions

### 8. Attendance Tracking (`/api/attendance/`)
- `GET /api/attendance/` - List class attendance logs
- `POST /api/attendance/` - Record attendance for cohort attendees

### 9. Assignments & Submissions (`/api/assignments/`, `/api/submissions/`)
- `GET /api/assignments/` - List cohort assignments
- `POST /api/assignments/` - Create assignment
- `GET /api/submissions/` - List student submissions
- `POST /api/submissions/` - Submit assignment solution & record evaluation marks

### 10. Certificates (`/api/certificates/`)
- `GET /api/certificates/` - List issued completion certificates
- `POST /api/certificates/` - Issue certificate with verification code

### 11. Partner Companies (`/api/companies/`)
- `GET /api/companies/` - List hiring partner companies
- `POST /api/companies/` - Add partner company and manage shortlisted student profiles

---

## 🛠️ Postman Collection Testing

A pre-configured Postman collection is included in the workspace at [postman/Sure-ProEd-Platform.postman_collection.json](file:///c:/Users/tumma/Downloads/Suretrust_Backend/postman/Sure-ProEd-Platform.postman_collection.json).

### Steps to import & run in Postman:
1. Open Postman -> Click **Import** -> Select `postman/Sure-ProEd-Platform.postman_collection.json`.
2. Set Collection Variable `base_url` to `http://localhost:8000`.
3. Execute `Auth - Obtain Token` with:
   - `email`: `admin@suretrust.local`
   - `password`: `Admin@123`
4. Copy the returned `access` token into the `token` variable.
5. All requests will automatically authenticate using `Bearer {{token}}`.

---

## 👤 Seeded Test Credentials

| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@suretrust.local` | `Admin@123` |
| **Mentor** | `mentor@suretrust.local` | `Mentor@123` |
