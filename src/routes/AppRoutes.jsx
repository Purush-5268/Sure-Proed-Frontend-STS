import React, { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import SessionExpiredModal from "../components/common/SessionExpiredModal";
import GlobalLoader from "../components/common/GlobalLoader";
import { useTheme } from "../context/ThemeContext";

/* Layouts */
import PublicLayout from "../layouts/PublicLayout";
import StudentLayout from "../layouts/StudentLayout";
import AdminLayout from "../layouts/AdminLayout";
import MentorLayout from "../layouts/MentorLayout";
import TrusteeLayout from "../layouts/TrusteeLayout";

/* Auth & Public */
import Landing from "../pages/landing/Landing";
const Partners = lazy(() => import("../pages/landing/Partners"));
const Signup = lazy(() => import("../pages/signup/Signup"));
const Login = lazy(() => import("../pages/auth/Login"));
const ForgotPassword = lazy(() => import("../pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("../pages/auth/ResetPassword"));
const EmailVerification = lazy(() => import("../pages/auth/EmailVerification"));
const SetupPassword = lazy(() => import("../pages/auth/SetupPassword"));
const NotFound = lazy(() => import("../pages/errors/Error404"));
const OfferLetterVerify = lazy(() => import("../pages/public/OfferLetterVerify"));
const CohortChat = lazy(() => import("../pages/student/CohortChat"));
const OpenCohorts = lazy(() => import("../pages/landing/OpenCohorts"));
const CohortInfo = lazy(() => import("../pages/landing/CohortInfo"));

/* Theme Enforcer for Public Pages */
function ThemeEnforcer() {
  const location = useLocation();
  const { theme } = useTheme();

  useEffect(() => {
    const publicPaths = ['/', '/partners', '/login', '/signup', '/setup-password', '/forgot-password', '/reset-password', '/email-verification', '/open-cohorts'];
    const isPublic = publicPaths.includes(location.pathname) || location.pathname.startsWith('/verify-offer-letter') || location.pathname.startsWith('/certificate/verify') || location.pathname.startsWith('/cohort-info');

    const applyTheme = () => {
      if (isPublic) {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      }
    };

    applyTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') applyTheme();
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [location.pathname, theme]);

  return null;
}

/* Volunteer Trustee */
const VolunteerDashboard = lazy(() => import("../pages/trustee/volunteer/Dashboard"));
const VolunteerAlerts = lazy(() => import("../pages/trustee/volunteer/Alerts"));
const VolunteerSchedule = lazy(() => import("../pages/trustee/volunteer/Schedule"));
const VolunteerAttendance = lazy(() => import("../pages/trustee/volunteer/Attendance"));
const VolunteerUsers = lazy(() => import("../pages/trustee/volunteer/Users"));

/* Commercial Trustee */
const CommercialDashboard = lazy(() => import("../pages/trustee/commercial/Dashboard"));
const Announcements = lazy(() => import("../pages/trustee/commercial/Announcements"));
const Achievements = lazy(() => import("../pages/trustee/commercial/Achievements"));
const Updates = lazy(() => import("../pages/trustee/commercial/Updates"));

/* Student */
const StudentDashboard = lazy(() => import("../pages/student/Dashboard"));
const Profile = lazy(() => import("../pages/student/Profile"));
const ApplyCourse = lazy(() => import("../pages/student/ApplyCourse"));
const CourseDetails = lazy(() => import("../pages/student/CourseDetails"));
const ApplicationSuccess = lazy(() => import("../pages/student/ApplicationSuccess"));
const MyApplications = lazy(() => import("../pages/student/MyApplications"));
const ApplicationStatus = lazy(() => import("../pages/student/ApplicationStatus"));
const StudentSettings = lazy(() => import("../pages/student/Settings"));

const MyCohort = lazy(() => import("../pages/student/MyCohort"));
const ClassSchedule = lazy(() => import("../pages/student/ClassSchedule"));
const MentorDetails = lazy(() => import("../pages/student/MentorDetails"));
const Resources = lazy(() => import("../pages/student/Resources"));

const Attendance = lazy(() => import("../pages/student/Attendance"));
const AttendanceHistory = lazy(() => import("../pages/student/AttendanceHistory"));
const AnnouncementsHistory = lazy(() => import("../pages/student/AnnouncementsHistory"));

const AssignmentList = lazy(() => import("../pages/student/AssignmentList"));
const AssignmentDetails = lazy(() => import("../pages/student/AssignmentDetails"));
const AssignmentSubmission = lazy(() => import("../pages/student/AssignmentSubmission"));
const AssignmentFeedback = lazy(() => import("../pages/student/AssignmentFeedback"));
const Placements = lazy(() => import("../pages/student/Placements"));

const CertificateList = lazy(() => import("../pages/student/CertificateList"));
const CertificateView = lazy(() => import("../pages/student/CertificateView"));
const CertificateVerify = lazy(() => import("../pages/student/CertificateVerify"));

/* Exams */

/* Admin */
const Dashboard = lazy(() => import("../pages/admin/Dashboard"));

/* Student Management */
const Students = lazy(() => import("../pages/admin/Students"));
const StudentDetails = lazy(() => import("../pages/admin/StudentDetails"));
const AddStudent = lazy(() => import("../pages/admin/AddStudent"));
const EditStudent = lazy(() => import("../pages/admin/EditStudent"));

/* Course Management */
const Courses = lazy(() => import("../pages/admin/Courses"));
const AdminCourseDetails = lazy(() => import("../pages/admin/CourseDetails"));
const AddCourse = lazy(() => import("../pages/admin/AddCourse"));
const EditCourse = lazy(() => import("../pages/admin/EditCourse"));

/* Mentor Management */
const Mentors = lazy(() => import("../pages/admin/Mentors"));
const AdminMentorDetails = lazy(() => import("../pages/admin/MentorDetails"));
const AddMentor = lazy(() => import("../pages/admin/AddMentor"));
const EditMentor = lazy(() => import("../pages/admin/EditMentor"));

/* Trustee Management (Global) */
const Trustees = lazy(() => import("../pages/admin/Trustees"));
const AddTrustee = lazy(() => import("../pages/admin/AddTrustee"));
const TrusteeDetails = lazy(() => import("../pages/admin/TrusteeDetails"));

/* Company Management */
const Companies = lazy(() => import("../pages/admin/Companies"));
const CompanyDetails = lazy(() => import("../pages/admin/CompanyDetails"));
const AddCompany = lazy(() => import("../pages/admin/AddCompany"));
const EditCompany = lazy(() => import("../pages/admin/EditCompany"));

/* Application Management */
const Applications = lazy(() => import("../pages/admin/Applications"));
const ApplicationDetails = lazy(() => import("../pages/admin/ApplicationDetails"));
const ApproveApplication = lazy(() => import("../pages/admin/ApproveApplication"));
const RejectApplication = lazy(() => import("../pages/admin/RejectApplication"));

/* Exam Management */

/* Reports */
const Reports = lazy(() => import("../pages/admin/Reports"));
const StudentReport = lazy(() => import("../pages/admin/StudentReport"));
const CourseReport = lazy(() => import("../pages/admin/CourseReport"));
const RequestsSupport = lazy(() => import("../pages/admin/RequestsSupport"));

/* Cohort Management */
const Cohorts = lazy(() => import("../pages/admin/Cohorts"));
const CohortDetails = lazy(() => import("../pages/admin/CohortDetails"));
const AddCohort = lazy(() => import("../pages/admin/AddCohort"));
const EditCohort = lazy(() => import("../pages/admin/EditCohort"));

/* Session Scheduling */
const ScheduleClass = lazy(() => import("../pages/admin/ScheduleClass"));

/* Attendance Management */
const AttendanceManagement = lazy(() => import("../pages/admin/AttendanceManagement"));
const AttendanceDetails = lazy(() => import("../pages/admin/AttendanceDetails"));
const UpdateAttendance = lazy(() => import("../pages/admin/UpdateAttendance"));
const AttendanceHistoryAdmin = lazy(() => import("../pages/admin/AttendanceHistoryAdmin"));
const PermissionsAdmin = lazy(() => import("../pages/admin/PermissionsAdmin"));
const PermissionsStudent = lazy(() => import("../pages/student/PermissionsStudent"));

/* Assignment Management */
const AssignmentsAdmin = lazy(() => import("../pages/admin/AssignmentsAdmin"));
const AssignmentAdminDetails = lazy(() => import("../pages/admin/AssignmentAdminDetails"));
const AddAssignment = lazy(() => import("../pages/admin/AddAssignment"));
const EditAssignment = lazy(() => import("../pages/admin/EditAssignment"));
const AdminMentorAssignments = lazy(() => import("../pages/admin/MentorAssignments"));

/* Certificate Management */
const CertificatesAdmin = lazy(() => import("../pages/admin/CertificatesAdmin"));
const CertificateAdminDetails = lazy(() => import("../pages/admin/CertificateAdminDetails"));
const AddCertificate = lazy(() => import("../pages/admin/AddCertificate"));
const EditCertificate = lazy(() => import("../pages/admin/EditCertificate"));

/* Notification Management */
const Notifications = lazy(() => import("../pages/admin/Notifications"));
const NotificationDetails = lazy(() => import("../pages/admin/NotificationDetails"));
const AddNotification = lazy(() => import("../pages/admin/AddNotification"));
const EditNotification = lazy(() => import("../pages/admin/EditNotification"));

/* Settings */
const Settings = lazy(() => import("../pages/admin/Settings"));
const ProfileSettings = lazy(() => import("../pages/admin/ProfileSettings"));
const SecuritySettings = lazy(() => import("../pages/admin/SecuritySettings"));
const SystemSettings = lazy(() => import("../pages/admin/SystemSettings"));

/* Mentor */
const MentorDashboard = lazy(() => import("../pages/mentor/MentorDashboard"));
const MyCohorts = lazy(() => import("../pages/mentor/MyCohorts"));
const MentorCohortDetails = lazy(() => import("../pages/mentor/CohortDetails"));
const MentorClassSchedule = lazy(() => import("../pages/mentor/ClassSchedule"));
const MentorApplications = lazy(() => import("../pages/mentor/Applications"));
const MentorAssessments = lazy(() => import("../pages/mentor/Assessments"));
const MentorTasks = lazy(() => import("../pages/mentor/Tasks"));
const MeetingLinks = lazy(() => import("../pages/mentor/MeetingLinks"));
const EditMeetingLink = lazy(() => import("../pages/mentor/EditMeetingLink"));

const MyStudents = lazy(() => import("../pages/mentor/MyStudents"));
const MentorStudentDetails = lazy(() => import("../pages/mentor/StudentDetails"));
const MentorAttendance = lazy(() => import("../pages/mentor/Attendance"));
const MentorAttendanceHistory = lazy(() => import("../pages/mentor/AttendanceHistory"));
const MentorAssignments = lazy(() => import("../pages/mentor/Assignments"));
const MentorAssignmentFeedback = lazy(() => import("../pages/mentor/AssignmentFeedback"));
const CreateAssignment = lazy(() => import("../pages/mentor/Assignments/CreateAssignment"));
const MentorProfile = lazy(() => import("../pages/mentor/Profile"));
const MentorSettings = lazy(() => import("../pages/mentor/Settings"));

import ScrollToTop from "../components/common/ScrollToTop";

/* Exams */
const ExamInstructions = lazy(() => import("../pages/exams/ExamInstructions"));
const Exam = lazy(() => import("../pages/exams/Exam"));
const ExamResult = lazy(() => import("../pages/exams/ExamResult"));
const ProctorDashboard = lazy(() => import("../pages/exams/ProctorDashboard"));

/* Exam Management */
const Exams = lazy(() => import("../pages/admin/Exams"));
const ExamDetails = lazy(() => import("../pages/admin/ExamDetails"));
const AddExam = lazy(() => import("../pages/admin/AddExam"));
const EditExam = lazy(() => import("../pages/admin/EditExam"));
const ExamReport = lazy(() => import("../pages/admin/ExamReport"));
const QuestionBanks = lazy(() => import("../pages/admin/QuestionBanks"));
const ModuleTests = lazy(() => import("../pages/student/ModuleTests"));

function AppRoutes() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ThemeEnforcer />
      <SessionExpiredModal />
      <Suspense fallback={<GlobalLoader message="Loading module..." />}>
        <Routes>
          {/* ================= PUBLIC MODULE ================= */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/email-verification" element={<EmailVerification />} />
            <Route path="/setup-password" element={<SetupPassword />} />
            <Route path="/verify-offer-letter/:hash" element={<OfferLetterVerify />} />
            <Route path="/certificate/verify/:code" element={<CertificateVerify />} />
            <Route path="/open-cohorts" element={<OpenCohorts />} />
            <Route path="/cohort-info/:cohortId" element={<CohortInfo />} />
          </Route>

          {/* ================= STUDENT MODULE (PROTECTED) ================= */}
          <Route element={<ProtectedRoute allowedRoles={["STUDENT"]} redirectTo="/login" />}>
            <Route path="/student/exam" element={<Exam />} />
            <Route path="/student/exam-result" element={<ExamResult />} />
            
            <Route path="/student" element={<StudentLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<StudentDashboard />} />
              <Route path="profile" element={<Profile />} />
              <Route path="public-profile" element={<Profile />} />

              <Route path="courses" element={<ApplyCourse />} />
              <Route path="apply-course" element={<ApplyCourse />} />
              <Route path="course/:id" element={<CourseDetails />} />

              <Route path="applications" element={<MyApplications />} />
              <Route path="application-success" element={<ApplicationSuccess />} />
              <Route path="application-status" element={<ApplicationStatus />} />

              <Route path="cohort" element={<MyCohort />} />
              <Route path="cohorts" element={<MyCohort />} />
              <Route path="module-tests" element={<ModuleTests />} />
              
              <Route path="exam-instructions" element={<ExamInstructions />} />
              <Route path="class-schedule" element={<ClassSchedule />} />
              <Route path="mentor-details" element={<MentorDetails />} />
              <Route path="resources" element={<Resources />} />
              <Route path="course/:id" element={<CourseDetails />} />

              <Route path="attendance" element={<Attendance />} />
              <Route path="attendance-history" element={<AttendanceHistory />} />
              <Route path="permissions" element={<PermissionsStudent />} />
              <Route path="announcements" element={<AnnouncementsHistory />} />

              <Route path="assignments" element={<AssignmentList />} />
              <Route path="assignment-details" element={<AssignmentDetails />} />
              <Route path="assignment-submission" element={<AssignmentSubmission />} />
              <Route path="assignment-feedback" element={<AssignmentFeedback />} />
              
              <Route path="placements" element={<Placements />} />

              <Route path="certificates" element={<CertificateList />} />
              <Route path="certificate-view" element={<CertificateView />} />
              <Route path="certificate-verify" element={<CertificateVerify />} />
              {/* 🚨 FIX: Placed directly in the student block WITHOUT nesting /student inside /student */}
              <Route path="settings" element={<StudentSettings />} />
              <Route path="cohort-chat/:cohortId" element={<CohortChat />} />
            </Route>
          </Route>

          {/* ================= ADMIN MODULE (PROTECTED) ================= */}
          <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} redirectTo="/login" />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />

              {/* Students */}
              <Route path="students" element={<Students />} />
              <Route path="student-details/:id" element={<StudentDetails />} />
              <Route path="add-student" element={<AddStudent />} />
              <Route path="edit-student/:id" element={<EditStudent />} />

              {/* Mentors */}
              <Route path="mentors" element={<Mentors />} />
              <Route path="mentor-details/:id" element={<AdminMentorDetails />} />
              <Route path="add-mentor" element={<AddMentor />} />
              <Route path="edit-mentor/:id" element={<EditMentor />} />

              {/* Trustee Management */}
              <Route path="trustees" element={<Trustees />} />
              <Route path="add-trustee" element={<AddTrustee />} />
              <Route path="trustee-details/:id" element={<TrusteeDetails />} />

              {/* Companies */}
              <Route path="companies" element={<Companies />} />
              <Route path="company-details/:id" element={<CompanyDetails />} />
              <Route path="add-company" element={<AddCompany />} />
              <Route path="edit-company/:id" element={<EditCompany />} />

              {/* Courses */}
              <Route path="courses" element={<Courses />} />
              <Route path="course-details" element={<AdminCourseDetails />} />
              <Route path="course-details/:id" element={<AdminCourseDetails />} />
              <Route path="add-course" element={<AddCourse />} />
              <Route path="edit-course" element={<EditCourse />} />
              <Route path="edit-course/:id" element={<EditCourse />} />

              {/* Applications */}
              <Route path="applications" element={<Applications />} />
              <Route path="application-details/:id" element={<ApplicationDetails />} />
              <Route path="approve-application/:id" element={<ApproveApplication />} />
              <Route path="reject-application/:id" element={<RejectApplication />} />

              {/* Exams */}
              <Route path="exams" element={<Exams />} />
              <Route path="exam-details" element={<ExamDetails />} />
              <Route path="exam-details/:examId" element={<ExamDetails />} />
              <Route path="add-exam" element={<AddExam />} />
              <Route path="edit-exam" element={<EditExam />} />
              <Route path="edit-exam/:examId" element={<EditExam />} />
              <Route path="exam-report" element={<ExamReport />} />
              <Route path="question-banks" element={<QuestionBanks />} />
              <Route path="exam-proctoring" element={<ProctorDashboard />} />

              {/* Cohorts */}
              <Route path="cohorts" element={<Cohorts />} />
              <Route path="cohort-details" element={<CohortDetails />} />
              <Route path="cohort-details/:id" element={<CohortDetails />} />
              <Route path="add-cohort" element={<AddCohort />} />
              <Route path="edit-cohort" element={<EditCohort />} />
              <Route path="edit-cohort/:id" element={<EditCohort />} />

              {/* Session Scheduling */}
              <Route path="schedule" element={<ScheduleClass />} />

              {/* Attendance */}
              <Route path="attendance" element={<AttendanceManagement />} />
              <Route path="attendance-management" element={<AttendanceManagement />} />
              <Route path="attendance-details" element={<AttendanceDetails />} />
              <Route path="update-attendance" element={<UpdateAttendance />} />
              <Route path="attendance-history-admin" element={<AttendanceHistoryAdmin />} />
              <Route path="permissions" element={<PermissionsAdmin />} />

              {/* Assignments */}
              <Route path="assignments" element={<AssignmentsAdmin />} />
              <Route path="assignments-admin" element={<AssignmentsAdmin />} />
              <Route path="assignment-admin-details" element={<AssignmentAdminDetails />} />
              <Route path="add-assignment" element={<AddAssignment />} />
              <Route path="edit-assignment" element={<EditAssignment />} />
              <Route path="mentor-assignments" element={<AdminMentorAssignments />} />

              {/* Certificates */}
              <Route path="certificates" element={<CertificatesAdmin />} />
              <Route path="certificates-admin" element={<CertificatesAdmin />} />
              <Route path="certificate-admin-details" element={<CertificateAdminDetails />} />
              <Route path="add-certificate" element={<AddCertificate />} />
              <Route path="edit-certificate" element={<EditCertificate />} />

              {/* Notifications */}
              <Route path="notifications" element={<Notifications />} />
              <Route path="notification-details" element={<NotificationDetails />} />
              <Route path="add-notification" element={<AddNotification />} />
              <Route path="edit-notification" element={<EditNotification />} />

              {/* Reports */}
              <Route path="reports" element={<Reports />} />
              <Route path="student-report" element={<StudentReport />} />
              <Route path="course-report" element={<CourseReport />} />
              <Route path="exam-report" element={<ExamReport />} />
              <Route path="requests-support" element={<RequestsSupport />} />

              {/* Cohort Chat (Admin) */}
              <Route path="cohort-chat/:cohortId" element={<CohortChat />} />

              {/* Settings */}
              <Route path="settings" element={<Settings />} />
              <Route path="profile-settings" element={<ProfileSettings />} />
              <Route path="security-settings" element={<SecuritySettings />} />
              <Route path="system-settings" element={<SystemSettings />} />
            </Route>
          </Route>

          {/* ================= MENTOR MODULE (PROTECTED) ================= */}
          <Route element={<ProtectedRoute allowedRoles={["MENTOR"]} redirectTo="/login" />}>
            <Route path="/mentor" element={<MentorLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<MentorDashboard />} />
              <Route path="applications" element={<MentorApplications />} />
              <Route path="assessments" element={<MentorAssessments />} />
              <Route path="tasks" element={<MentorTasks />} />
              <Route path="cohorts" element={<MyCohorts />} />
              <Route path="cohort-details" element={<MentorCohortDetails />} />
              <Route path="class-schedule" element={<MentorClassSchedule />} />
              <Route path="meeting-links" element={<MeetingLinks />} />
              <Route path="edit-meeting-link" element={<EditMeetingLink />} />
              <Route path="students" element={<MyStudents />} />
              <Route path="student-details" element={<MentorStudentDetails />} />
              <Route path="attendance" element={<MentorAttendance />} />
              <Route path="attendance-history" element={<MentorAttendanceHistory />} />
              <Route path="assignments" element={<MentorAssignments />} />
              <Route path="create-assignment" element={<CreateAssignment />} />
              <Route path="assignment-submissions/:id" element={<MentorAssignmentFeedback />} />
              <Route path="assignment-feedback" element={<MentorAssignmentFeedback />} />
              <Route path="profile" element={<MentorProfile />} />
              <Route path="settings" element={<MentorSettings />} />
              <Route path="exam-proctoring" element={<ProctorDashboard />} />
            </Route>
          </Route>

          {/* ================= TRUSTEE MODULE (PROTECTED) ================= */}
          <Route element={<ProtectedRoute allowedRoles={["TRUSTEE", "VOLUNTEER"]} redirectTo="/login" />}>
            <Route path="/trustee" element={<TrusteeLayout />}>
              {/* 
                The index and dashboard paths are handled directly by TrusteeLayout.jsx 
                which securely redirects based on the trusteeType (VOLUNTEER vs COMMERCIAL). 
              */}
              <Route index element={null} />
              <Route path="dashboard" element={null} />

              {/* Volunteer Trustee */}
              <Route path="volunteer/dashboard" element={<VolunteerDashboard />} />
              <Route path="volunteer/alerts" element={<VolunteerAlerts />} />
              <Route path="volunteer/schedule" element={<VolunteerSchedule />} />
              <Route path="volunteer/attendance" element={<VolunteerAttendance />} />
              <Route path="volunteer/attendance-details" element={<AttendanceDetails />} />
              <Route path="volunteer/update-attendance" element={<UpdateAttendance />} />
              <Route path="volunteer/users" element={<VolunteerUsers />} />

              {/* Commercial Trustee */}
              <Route path="commercial/dashboard" element={<CommercialDashboard />} />
              <Route path="commercial/announcements" element={<Announcements />} />
              <Route path="commercial/achievements" element={<Achievements />} />
              <Route path="commercial/updates" element={<Updates />} />
            </Route>
          </Route>

          {/* ================= 404 NOT FOUND ================= */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default AppRoutes;
