# 📌 Sure ProEd Platform - API Endpoints Quick Reference Guide

A complete, human-readable directory of all REST API endpoints available in the **Sure ProEd Platform Backend**.

---

## 🌐 Live Interactive API Documentation Links

| Documentation Interface | URL Path | Format / Tool | Description |
| :--- | :--- | :--- | :--- |
| **Interactive Swagger UI** | [`/api/docs/`](http://localhost:8000/api/docs/) | Swagger UI | Live API tester & request runner |
| **ReDoc Reader** | [`/api/redoc/`](http://localhost:8000/api/redoc/) | ReDoc | Clean, structured API reference reader |
| **OpenAPI Schema** | [`/api/schema/`](http://localhost:8000/api/schema/) | JSON / YAML | Raw OpenAPI 3.0 specification |

---

## 📊 Complete API Endpoints Summary Matrix

| Category | HTTP Method | Endpoint URL Path | Description | Authorization |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication** | `POST` | `/api/auth/token/` | Obtain Access & Refresh JWT Tokens | Public |
| | `POST` | `/api/auth/token/refresh/` | Refresh Access Token using Refresh Token | Public |
| **LinkedIn Auth** | `GET` | `/api/auth/linkedin/connect/` | Get LinkedIn OAuth 2.0 Authorization URL | `Bearer <Token>` |
| | `POST` | `/api/auth/linkedin/callback/` | Submit OAuth `code` to link LinkedIn Profile | `Bearer <Token>` |
| | `POST` | `/api/auth/linkedin/disconnect/` | Unlink LinkedIn profile from account | `Bearer <Token>` |
| **Users** | `GET` | `/api/users/` | List all user accounts | `Bearer <Token>` |
| | `POST` | `/api/users/` | Register new user account | Public / Admin |
| | `GET` | `/api/users/{id}/` | Retrieve user details by UUID | `Bearer <Token>` |
| | `PUT` / `PATCH` | `/api/users/{id}/` | Update user details | `Bearer <Token>` |
| | `DELETE` | `/api/users/{id}/` | Delete user account | Admin |
| **Students** | `GET` | `/api/students/` | List student profiles (filter by code/degree) | `Bearer <Token>` |
| | `POST` | `/api/students/` | Create student profile | `Bearer <Token>` |
| | `GET` | `/api/students/{id}/` | Retrieve student profile details | `Bearer <Token>` |
| | `PUT` / `PATCH` | `/api/students/{id}/` | Update student profile | `Bearer <Token>` |
| **Courses** | `GET` | `/api/courses/` | List 6-month internship courses (Cached) | Public |
| | `POST` | `/api/courses/` | Create new course offering | Admin |
| | `GET` | `/api/courses/{id}/` | Retrieve course details & curriculum | Public |
| | `PUT` / `PATCH` | `/api/courses/{id}/` | Update course details | Admin |
| | `GET` | `/api/courses/catalog/` | List all course curriculum PDF files with download URLs | **Public** |
| **Cohorts** | `GET` | `/api/cohorts/` | List course batches/cohorts | `Bearer <Token>` |
| | `POST` | `/api/cohorts/` | Create new cohort batch | Admin |
| | `GET` | `/api/cohorts/{id}/` | Retrieve cohort schedule & meeting link | `Bearer <Token>` |
| | `PUT` / `PATCH` | `/api/cohorts/{id}/` | Update cohort details | Admin / Mentor |
| **Applications** | `GET` | `/api/applications/` | List student internship applications | `Bearer <Token>` |
| | `POST` | `/api/applications/` | Submit course application | `Bearer <Token>` |
| | `GET` | `/api/applications/{id}/` | Retrieve application status | `Bearer <Token>` |
| | `POST` | `/api/applications/{id}/assign-cohort/` | Assign qualified student to cohort | Admin |
| | `POST` | `/api/applications/{id}/check-completion/` | Evaluate attendance & marks for certificate | Admin / Mentor |
| **Question Bank** | `GET` | `/api/question-banks/` | List all question banks (Filter: `bank_type`, `course`, `cohort`, `exam`) | `Bearer <Token>` |
| | `POST` | `/api/question-banks/` | Create question bank with Paper Sets A/B/C/D | Admin / Mentor |
| | `GET` | `/api/question-banks/{id}/` | Retrieve question bank and all paper sets | `Bearer <Token>` |
| | `GET` | `/api/question-banks/{id}/paper/{set_code}/` | Get specific paper set (A, B, C, D) for test frontend | `Bearer <Token>` |
| | `GET` | `/api/question-banks/by-cohort/{cohort_uuid}/` | Get active question bank assigned to Cohort UUID | `Bearer <Token>` |
| | `GET` | `/api/question-banks/by-exam/{exam_uuid}/` | Get active question bank assigned to Pre-Screening Exam UUID | `Bearer <Token>` |
| | `POST` | `/api/question-banks/generate/` | AI-assisted question paper generator (links Cohort/Exam UUIDs) | Admin / Mentor |
| **Questions** | `GET` | `/api/questions/` | List screening question bank | Admin / Mentor |
| | `POST` | `/api/questions/` | Add question to question bank | Admin |
| **Exams** | `GET` | `/api/exams/` | List screening/evaluation exams | `Bearer <Token>` |
| | `POST` | `/api/exams/` | Create new screening exam | Admin |
| | `GET` | `/api/exams/{id}/` | Retrieve exam questions & details | `Bearer <Token>` |
| **Attendance** | `GET` | `/api/attendance/` | List class attendance records | Admin / Mentor |
| | `POST` | `/api/attendance/` | Record cohort class attendance | Admin / Mentor |
| **Assignments** | `GET` | `/api/assignments/` | List cohort assignments | `Bearer <Token>` |
| | `POST` | `/api/assignments/` | Create new cohort assignment | Admin / Mentor |
| **Submissions** | `GET` | `/api/submissions/` | List student assignment submissions | `Bearer <Token>` |
| | `POST` | `/api/submissions/` | Submit assignment solution | Student |
| | `PUT` / `PATCH` | `/api/submissions/{id}/` | Grade submission & record marks | Admin / Mentor |
| **Certificates** | `GET` | `/api/certificates/` | List issued completion certificates | `Bearer <Token>` |
| | `POST` | `/api/certificates/` | Issue verified completion certificate | Admin |
| | `GET` | `/api/certificates/verify/?code=XXX` | Public certificate verification | Public |
| **Companies** | `GET` | `/api/companies/` | List hiring partner companies | `Bearer <Token>` |
| | `POST` | `/api/companies/` | Create company profile & shortlist students | Admin / Company |

---

## 🔑 Authentication & Headers

Every request to protected endpoints must include the standard `Authorization` header:

```http
Authorization: Bearer <access_jwt_token>
Content-Type: application/json
```

### 1. Token Request Payload
`POST /api/auth/token/`
```json
{
  "email": "student@example.com",
  "password": "Password@123"
}
```

### 2. Token Response Payload (200 OK)
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
}
```

---

## ⚡ Rate Limits & Throttling

The backend enforces rate limiting **per individual IP address**:

| User Type | Rate Limit | Behavior on Limit Exceeded |
| :--- | :--- | :--- |
| **Anonymous (`AnonRateThrottle`)** | `30 requests / minute` | `429 Too Many Requests` |
| **Authenticated (`UserRateThrottle`)** | `120 requests / minute` | `429 Too Many Requests` |

---

## 🚦 HTTP Status Code Reference

| Status Code | Meaning | Cause |
| :--- | :--- | :--- |
| `200 OK` | Success | Request succeeded cleanly |
| `201 Created` | Created | New entity successfully created |
| `400 Bad Request` | Validation Error | Missing fields or invalid request data |
| `401 Unauthorized` | Unauthenticated | Missing or expired JWT Bearer token |
| `403 Forbidden` | Permission Denied | User role lacks permissions (e.g. Student calling Admin endpoint) |
| `404 Not Found` | Not Found | Resource or endpoint path does not exist |
| `429 Too Many Requests` | Throttled | Rate limit exceeded for IP/User |
| `500 Server Error` | Backend Fault | Unhandled exception (Logged to SigNoz) |
