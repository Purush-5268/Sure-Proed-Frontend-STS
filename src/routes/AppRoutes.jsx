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
import Signup from "../pages/signup/Signup";
import Login from "../pages/auth/Login";
import ForgotPassword from "../pages/auth/ForgotPassword";
import ResetPassword from "../pages/auth/ResetPassword";
import EmailVerification from "../pages/auth/EmailVerification";
import SetupPassword from "../pages/auth/SetupPassword";
import NotFound from "../pages/errors/Error404";
import OfferLetterVerify from "../pages/public/OfferLetterVerify";
import CohortChat from "../pages/student/CohortChat";

/* Theme Enforcer for Public Pages */
function ThemeEnforcer() {
  const location = useLocation();
  const { theme } = useTheme();

  useEffect(() => {
    const publicPaths = ['/', '/login', '/signup', '/setup-password', '/forgot-password', '/reset-password', '/email-verification'];
    const isPublic = publicPaths.includes(location.pathname) || location.pathname.startsWith('/verify-offer-letter') || location.pathname.startsWith('/certificate/verify');

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
import VolunteerAlerts from "../pages/trustee/volunteer/Alerts";
import VolunteerSchedule from "../pages/trustee/volunteer/Schedule";
import VolunteerAttendance from "../pages/trustee/volunteer/Attendance";
import VolunteerUsers from "../pages/trustee/volunteer/Users";

/* Commercial Trustee */
const CommercialDashboard = lazy(() => import("../pages/trustee/commercial/Dashboard"));
import Announcements from "../pages/trustee/commercial/Announcements";
import Achievements from "../pages/trustee/commercial/Achievements";
import Updates from "../pages/trustee/commercial/Updates";

/* Student */
const StudentDashboard = lazy(() => import("../pages/student/Dashboard"));
import Profile from "../pages/student/Profile";
import ApplyCourse from "../pages/student/ApplyCourse";
import CourseDetails from "../pages/student/CourseDetails";
import ApplicationSuccess from "../pages/student/ApplicationSuccess";
import MyApplications from "../pages/student/MyApplications";
import ApplicationStatus from "../pages/student/ApplicationStatus";
import StudentSettings from "../pages/student/Settings";

import MyCohort from "../pages/student/MyCohort";
import ClassSchedule from "../pages/student/ClassSchedule";
import MentorDetails from "../pages/student/MentorDetails";

import Attendance from "../pages/student/Attendance";
import AttendanceHistory from "../pages/student/AttendanceHistory";

import AssignmentList from "../pages/student/AssignmentList";
import AssignmentDetails from "../pages/student/AssignmentDetails";
import AssignmentSubmission from "../pages/student/AssignmentSubmission";
import AssignmentFeedback from "../pages/student/AssignmentFeedback";
const Placements = lazy(() => import("../pages/student/Placements"));

import CertificateList from "../pages/student/CertificateList";
import CertificateView from "../pages/student/CertificateView";
import CertificateVerify from "../pages/student/CertificateVerify";

/* Exams */

/* Admin */
const Dashboard = lazy(() => import("../pages/admin/Dashboard"));

/* Student Management */
import Students from "../pages/admin/Students";
import StudentDetails from "../pages/admin/StudentDetails";
import AddStudent from "../pages/admin/AddStudent";
import EditStudent from "../pages/admin/EditStudent";

/* Course Management */
import Courses from "../pages/admin/Courses";
import AdminCourseDetails from "../pages/admin/CourseDetails";
import AddCourse from "../pages/admin/AddCourse";
import EditCourse from "../pages/admin/EditCourse";

/* Mentor Management */
import Mentors from "../pages/admin/Mentors";
import AdminMentorDetails from "../pages/admin/MentorDetails";
import AddMentor from "../pages/admin/AddMentor";
import EditMentor from "../pages/admin/EditMentor";

/* Trustee Management (Global) */
import Trustees from "../pages/admin/Trustees";
import AddTrustee from "../pages/admin/AddTrustee";
import TrusteeDetails from "../pages/admin/TrusteeDetails";

/* Company Management */
import Companies from "../pages/admin/Companies";
import CompanyDetails from "../pages/admin/CompanyDetails";
import AddCompany from "../pages/admin/AddCompany";
import EditCompany from "../pages/admin/EditCompany";

/* Application Management */
import Applications from "../pages/admin/Applications";
import ApplicationDetails from "../pages/admin/ApplicationDetails";
import ApproveApplication from "../pages/admin/ApproveApplication";
import RejectApplication from "../pages/admin/RejectApplication";

/* Exam Management */

/* Reports */
import Reports from "../pages/admin/Reports";
import StudentReport from "../pages/admin/StudentReport";
import CourseReport from "../pages/admin/CourseReport";
import RequestsSupport from "../pages/admin/RequestsSupport";

/* Cohort Management */
import Cohorts from "../pages/admin/Cohorts";
import CohortDetails from "../pages/admin/CohortDetails";
import AddCohort from "../pages/admin/AddCohort";
import EditCohort from "../pages/admin/EditCohort";

/* Session Scheduling */
import ScheduleClass from "../pages/admin/ScheduleClass";

/* Attendance Management */
import AttendanceManagement from "../pages/admin/AttendanceManagement";
import AttendanceDetails from "../pages/admin/AttendanceDetails";
import UpdateAttendance from "../pages/admin/UpdateAttendance";
import AttendanceHistoryAdmin from "../pages/admin/AttendanceHistoryAdmin";
import PermissionsAdmin from "../pages/admin/PermissionsAdmin";
import PermissionsStudent from "../pages/student/PermissionsStudent";

/* Assignment Management */
import AssignmentsAdmin from "../pages/admin/AssignmentsAdmin";
import AssignmentAdminDetails from "../pages/admin/AssignmentAdminDetails";
import AddAssignment from "../pages/admin/AddAssignment";
import EditAssignment from "../pages/admin/EditAssignment";
import AdminMentorAssignments from "../pages/admin/MentorAssignments";

/* Certificate Management */
import CertificatesAdmin from "../pages/admin/CertificatesAdmin";
import CertificateAdminDetails from "../pages/admin/CertificateAdminDetails";
import AddCertificate from "../pages/admin/AddCertificate";
import EditCertificate from "../pages/admin/EditCertificate";

/* Notification Management */
import Notifications from "../pages/admin/Notifications";
import NotificationDetails from "../pages/admin/NotificationDetails";
import AddNotification from "../pages/admin/AddNotification";
import EditNotification from "../pages/admin/EditNotification";

/* Settings */
import Settings from "../pages/admin/Settings";
import ProfileSettings from "../pages/admin/ProfileSettings";
import SecuritySettings from "../pages/admin/SecuritySettings";
import SystemSettings from "../pages/admin/SystemSettings";

/* Mentor */
const MentorDashboard = lazy(() => import("../pages/mentor/MentorDashboard"));
import MyCohorts from "../pages/mentor/MyCohorts";
import MentorCohortDetails from "../pages/mentor/CohortDetails";
import MentorClassSchedule from "../pages/mentor/ClassSchedule";
import MentorApplications from "../pages/mentor/Applications";
import MentorAssessments from "../pages/mentor/Assessments";
import MentorTasks from "../pages/mentor/Tasks";
import MeetingLinks from "../pages/mentor/MeetingLinks";
import EditMeetingLink from "../pages/mentor/EditMeetingLink";

import MyStudents from "../pages/mentor/MyStudents";
import MentorStudentDetails from "../pages/mentor/StudentDetails";
import MentorAttendance from "../pages/mentor/Attendance";
import MentorAttendanceHistory from "../pages/mentor/AttendanceHistory";
import MentorAssignments from "../pages/mentor/Assignments";
import MentorAssignmentFeedback from "../pages/mentor/AssignmentFeedback";
import CreateAssignment from "../pages/mentor/Assignments/CreateAssignment";
import MentorProfile from "../pages/mentor/Profile";
import MentorSettings from "../pages/mentor/Settings";

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
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/email-verification" element={<EmailVerification />} />
            <Route path="/setup-password" element={<SetupPassword />} />
            <Route path="/verify-offer-letter/:hash" element={<OfferLetterVerify />} />
            <Route path="/certificate/verify/:code" element={<CertificateVerify />} />
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
              <Route path="course/:id" element={<CourseDetails />} />

              <Route path="attendance" element={<Attendance />} />
              <Route path="attendance-history" element={<AttendanceHistory />} />
              <Route path="permissions" element={<PermissionsStudent />} />

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
