import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { ToastContainer } from "react-toastify"
import { setupToasts } from "./utils/toastSetup"
import "react-toastify/dist/ReactToastify.css"
import Login from "./components/Login"
import Logout from "./components/Logout"
import GlobalPhotoViewer from "./components/GlobalPhotoViewer"
import ProtectedRoute from "./context/ProtectedRoute"
import { ByLevel } from "./pages/monitor/monitorLevel"
import PageLoader from "./components/PageLoader"
import AdminLayout from "./layouts/AdminLayout"
import LeaderLayout from "./layouts/LeaderLayout"
import MonitorLayout from "./layouts/MonitorLayout"
import PlatformLayout from "./layouts/PlatformLayout"
import UserAdminLayout from "./layouts/UserAdminLayout"
import UserLayout from "./layouts/UserLayout"
import PlatformSchoolShell from "./layouts/PlatformSchoolShell"
import StickyTables from "./components/StickyTables"
import SchoolStatsShell, { ViewerStatsShell } from "./components/SchoolStatsShell"
// Sahifalar marshrut bo'yicha alohida chunk sifatida kech yuklanadi (barrel orqali emas — u bo'linishni buzadi)
const Profile = lazy(() => import("./components/Profile"))
const ViewerDashboard = lazy(() => import("./pages/user/ViewerDashboard"))
const SchoolDashboard = lazy(() => import("./pages/admin/SchoolDashboard"))
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"))
const AdminAttandance = lazy(() => import("./pages/admin/AdminAttandance"))
const AdminCameras = lazy(() => import("./pages/admin/AdminCameras"))
const AdminAIEvidence = lazy(() => import("./pages/admin/AdminAIEvidence"))
const AdminParents = lazy(() => import("./pages/admin/AdminParents"))
const AdminLiveView = lazy(() => import("./pages/admin/AdminLiveView"))
const AdminClassrooms = lazy(() => import("./pages/admin/AdminClassrooms"))
const AdminClassroomDetail = lazy(() => import("./pages/admin/AdminClassroomDetail"))
const AdminEmployeeAnalytics = lazy(() => import("./pages/admin/AdminEmployeeAnalytics"))
const AdminEntryExit = lazy(() => import("./pages/admin/AdminEntryExit"))
const AdminFaceControl = lazy(() => import("./pages/admin/AdminFaceControl"))
const AdminAdmins = lazy(() => import("./pages/admin/AdminAdmins"))
const AdminClassControl = lazy(() => import("./pages/admin/AdminClassControl"))
const AdminRegulation = lazy(() => import("./pages/admin/AdminRegulation"))
const AdminReports = lazy(() => import("./pages/admin/AdminReports"))
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"))
const AdminStudents = lazy(() => import("./pages/admin/AdminStudents"))
const AdminUserCameras = lazy(() => import("./pages/admin/AdminUserCameras"))
const AdminUserEntryExit = lazy(() => import("./pages/admin/AdminUserEntryExit"))
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"))
const Sinf = lazy(() => import("./pages/admin/Sinf"))
const SinfDetail = lazy(() => import("./pages/admin/SinfDetail"))
const LeaderUsers = lazy(() => import("./pages/leader/LeaderUsers"))
const RegionReports = lazy(() => import("./pages/monitor/RegionReports"))
const MonitorMap = lazy(() => import("./pages/monitor/MonitorMap"))
const MonitorDistricts = lazy(() => import("./pages/monitor/MonitorDistricts"))
const MonitorDistrictHub = lazy(() => import("./pages/monitor/MonitorDistrictHub"))
const MonitorAI = lazy(() => import("./pages/monitor/MonitorAI"))
const MonitorAlerts = lazy(() => import("./pages/monitor/MonitorAlerts"))
const MonitorArrival = lazy(() => import("./pages/monitor/MonitorArrival"))
const MonitorCameraEvents = lazy(() => import("./pages/monitor/MonitorCameraEvents"))
const MonitorCameraHealth = lazy(() => import("./pages/monitor/MonitorCameraHealth"))
const MonitorClassRanking = lazy(() => import("./pages/monitor/MonitorClassRanking"))
const MonitorClassroomAnalysis = lazy(() => import("./pages/monitor/MonitorClassroomAnalysis"))
const MonitorClassroomDetail = lazy(() => import("./pages/monitor/MonitorClassroomDetail"))
const MonitorLate = lazy(() => import("./pages/monitor/MonitorLate"))
const MonitorLeaves = lazy(() => import("./pages/monitor/MonitorLeaves"))
const MonitorLive = lazy(() => import("./pages/monitor/MonitorLive"))
const MonitorLists = lazy(() => import("./pages/monitor/MonitorLists"))
const MonitorRisk = lazy(() => import("./pages/monitor/MonitorRisk"))
const MonitorCameras = lazy(() => import("./pages/monitor/MonitorCameras"))
const MonitorClasses = lazy(() => import("./pages/monitor/MonitorClasses"))
const MonitorCompare = lazy(() => import("./pages/monitor/MonitorCompare"))
const MonitorDashboard = lazy(() => import("./pages/monitor/MonitorDashboard"))
const MonitorRanking = lazy(() => import("./pages/monitor/MonitorRanking"))
const MonitorGradeClass = lazy(() => import("./pages/monitor/MonitorGradeClass"))
const MonitorGradeDetail = lazy(() => import("./pages/monitor/MonitorGradeDetail"))
const MonitorGrades = lazy(() => import("./pages/monitor/MonitorGrades"))
const MonitorPerson = lazy(() => import("./pages/monitor/MonitorPerson"))
const MonitorProfile = lazy(() => import("./pages/monitor/MonitorProfile"))
const MonitorReports = lazy(() => import("./pages/monitor/MonitorReports"))
const MonitorSchoolDetail = lazy(() => import("./pages/monitor/MonitorSchoolDetail"))
const MonitorSchools = lazy(() => import("./pages/monitor/MonitorSchools"))
const MonitorTrend = lazy(() => import("./pages/monitor/MonitorTrend"))
const MonitorStaff = lazy(() => import("./pages/monitor/MonitorAttendance").then(m => ({ default: m.MonitorStaff })))
const MonitorStudents = lazy(() => import("./pages/monitor/MonitorAttendance").then(m => ({ default: m.MonitorStudents })))
const RegionCameraEvents = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionCameraEvents })))
const RegionGrades = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionGrades })))
const RegionAlerts = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionAlerts })))
const RegionCameras = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionCameras })))
const RegionClassrooms = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionClassrooms })))
const RegionLate = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionLate })))
const RegionLeaves = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionLeaves })))
const RegionRisk = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionRisk })))
const RegionStaff = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionStaff })))
const RegionStudents = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionStudents })))
const RegionTrend = lazy(() => import("./pages/monitor/RegionPages").then(m => ({ default: m.RegionTrend })))
const PlatformAuditLog = lazy(() => import("./pages/platform/PlatformAuditLog"))
const PlatformBranding = lazy(() => import("./pages/platform/PlatformBranding"))
const PlatformGrades = lazy(() => import("./pages/platform/PlatformGrades"))
const PlatformHikAccounts = lazy(() => import("./pages/platform/PlatformHikAccounts"))
const PlatformHikCameras = lazy(() => import("./pages/platform/PlatformHikCameras"))
const PlatformHikFaceControl = lazy(() => import("./pages/platform/PlatformHikFaceControl"))
const PlatformHome = lazy(() => import("./pages/platform/PlatformHome"))
const PlatformMonitors = lazy(() => import("./pages/platform/PlatformMonitors"))
const AdminFaces = lazy(() => import("./pages/admin/AdminFaces"))
const AdminFaceLive = lazy(() => import("./pages/admin/AdminFaceLive"))
const PlatformAI = lazy(() => import("./pages/platform/PlatformAI"))
const PlatformFederation = lazy(() => import("./pages/platform/PlatformFederation"))
const PlatformSchools = lazy(() => import("./pages/platform/PlatformSchools"))
const PlatformSchoolCameras = lazy(() => import("./pages/platform/PlatformSchoolCameras"))
const PlatformSchoolControl = lazy(() => import("./pages/platform/PlatformSchoolControl"))
const PlatformTelegram = lazy(() => import("./pages/platform/PlatformTelegram"))
const PlatformDistricts = lazy(() => import("./pages/platform/PlatformDistricts"))
const UserAttandance = lazy(() => import("./pages/user/UserAttandance"))
const UserComments = lazy(() => import("./pages/user/UserComments"))
const UserSinf = lazy(() => import("./pages/user/UserSinf"))

setupToasts()

const App = () => {
  return (
    <BrowserRouter>
      <StickyTables />
      <GlobalPhotoViewer />
      <ToastContainer position="top-right" autoClose={3000} limit={3} newestOnTop pauseOnFocusLoss={false} />

      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/logout" element={<Logout />} />
        {/* PLATFORMA (superadmin — maktablarni boshqaradi, hech qaysi maktabga bog'lanmagan) */}
        <Route
          path="/platform"
          element={
            <ProtectedRoute allowedRoles={["superadmin"]}>
              <PlatformLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<PlatformHome />} />
          <Route path="schools" element={<PlatformSchools />} />
          <Route path="statistics" element={<Navigate to="/platform/school-control" replace />} />
          <Route path="school-control" element={<PlatformSchoolControl />} />
          <Route path="grades" element={<PlatformGrades />} />
          <Route path="monitors" element={<PlatformMonitors />} />
          <Route path="federation" element={<PlatformFederation />} />
          <Route path="ai" element={<PlatformAI />} />
          <Route path="hik-accounts" element={<PlatformHikAccounts />} />
          <Route path="hik-cameras" element={<PlatformHikCameras />} />
          <Route path="hik-facecontrol" element={<PlatformHikFaceControl />} />
          <Route path="school-cameras" element={<PlatformSchoolCameras />} />
          <Route path="audit-log" element={<PlatformAuditLog />} />
          <Route path="branding" element={<PlatformBranding />} />
          <Route path="telegram" element={<PlatformTelegram />} />
          <Route path="districts" element={<PlatformDistricts />} />
          <Route path="region-monitors" element={<PlatformMonitors level="region" />} />
          <Route path="map" element={<MonitorMap />} />

          {/* Maktab ichiga "kirish" — superadmin o'sha maktabning admini
              (/user) nima qila olsa, XUDDI SHU sahifalarni shu yerning
              o'zida (/platform ichida, PlatformSidebar bilan) ko'radi.
              PlatformSchoolShell orqaga chiqquncha `token`ni o'sha maktab
              taqlid (impersonation) tokeniga almashtirib turadi */}
          <Route path="schools/:schoolId" element={<PlatformSchoolShell />}>
            <Route index element={<SchoolDashboard />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="users/:id/analytics" element={<AdminEmployeeAnalytics />} />
            <Route path="sinf" element={<Sinf />} />
            <Route path="sinf/:id" element={<SinfDetail />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="students" element={<AdminStudents />} />
            <Route path="attandance" element={<AdminAttandance />} />
            <Route path="entry-exit" element={<AdminEntryExit />} />
            <Route path="regulation" element={<AdminRegulation />} />
            <Route path="profile" element={<Profile />} />
            <Route path="camera" element={<AdminCameras />} />
            <Route path="facecontrol" element={<AdminFaceControl />} />
            <Route path="classrooms" element={<AdminClassrooms />} />
<Route path="kuzatuv" element={<AdminAIEvidence />} />
<Route path="faces" element={<AdminFaces />} />
<Route path="faces/live" element={<AdminFaceLive />} />
<Route path="parents" element={<AdminParents />} />
<Route path="live" element={<AdminLiveView />} />
<Route path="nazorat" element={<AdminClassControl />} />
            <Route path="classrooms/:sinfId" element={<AdminClassroomDetail />} />
            <Route path="admin" element={<AdminAdmins />} />
            <Route element={<SchoolStatsShell />}>
            <Route path="grades" element={<MonitorGrades />} />
            <Route path="grades/:grade" element={<MonitorGradeDetail />} />
            <Route path="grades/:grade/:sinfId" element={<MonitorGradeClass />} />
            <Route path="late" element={<MonitorLate />} />
            <Route path="leaves" element={<MonitorLeaves />} />
            <Route path="risk" element={<MonitorRisk />} />
            <Route path="alerts" element={<MonitorAlerts />} />
            <Route path="trend" element={<MonitorTrend />} />
            <Route path="people/:kind/:id" element={<MonitorPerson />} />
          </Route>
          <Route path="comments" element={<UserComments />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        </Route>
        {/* MONITOR (barcha maktablar bo'yicha umumiy nazorat — faqat o'qish) */}
        <Route
          path="/monitor"
          element={
            <ProtectedRoute allowedRoles={["monitor"]}>
              <MonitorLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<MonitorDashboard />} />
          <Route path="schools" element={<MonitorSchools />} />
          <Route path="schools/:id" element={<MonitorSchoolDetail />} />
          <Route path="people/:kind/:id" element={<MonitorPerson />} />
          <Route path="students" element={<ByLevel region={<RegionStudents />} district={<MonitorStudents />} />} />
          <Route path="staff" element={<ByLevel region={<RegionStaff />} district={<MonitorStaff />} />} />
          <Route path="classes" element={<MonitorClasses />} />
          <Route path="trend" element={<ByLevel region={<RegionTrend />} district={<MonitorTrend />} />} />
          <Route path="ranking" element={<MonitorRanking />} />
          <Route path="compare" element={<MonitorCompare />} />
          <Route path="cameras" element={<MonitorCameras />} />
          <Route path="reports" element={<ByLevel region={<RegionReports />} district={<MonitorReports />} />} />
          <Route path="alerts" element={<ByLevel region={<RegionAlerts />} district={<MonitorAlerts />} />} />
          <Route path="live" element={<MonitorLive />} />
          <Route path="lists" element={<MonitorLists />} />
          <Route path="late" element={<ByLevel region={<RegionLate />} district={<MonitorLate />} />} />
          <Route path="leaves" element={<ByLevel region={<RegionLeaves />} district={<MonitorLeaves />} />} />
          <Route path="risk" element={<ByLevel region={<RegionRisk />} district={<MonitorRisk />} />} />
          <Route path="arrival" element={<MonitorArrival />} />
          <Route path="class-ranking" element={<MonitorClassRanking />} />
          <Route path="grades" element={<ByLevel region={<RegionGrades />} district={<MonitorGrades />} />} />
          <Route path="grades/:grade" element={<MonitorGradeDetail />} />
          <Route path="grades/:grade/:sinfId" element={<MonitorGradeClass />} />
          <Route path="classrooms" element={<ByLevel region={<RegionClassrooms />} district={<MonitorClassroomAnalysis />} />} />
          <Route path="classrooms/:schoolId/:sinfId" element={<MonitorClassroomDetail />} />
          <Route path="camera-events" element={<ByLevel region={<RegionCameraEvents />} district={<MonitorCameraEvents />} />} />
          <Route path="camera-health" element={<ByLevel region={<RegionCameras />} district={<MonitorCameraHealth />} />} />
          <Route path="map" element={<MonitorMap />} />
          <Route path="schools-map" element={<MonitorMap panel />} />
          <Route path="districts" element={<ByLevel region={<MonitorDistricts />} district={<Navigate to="/monitor" replace />} />} />
          <Route path="districts/:name" element={<ByLevel region={<MonitorDistrictHub />} district={<Navigate to="/monitor" replace />} />} />
          <Route path="ai" element={<MonitorAI />} />
          <Route path="profile" element={<MonitorProfile />} />
        </Route>
        {/* Super ADMIN */}
        <Route
          path="/user"
          element={
            <ProtectedRoute allowedRoles={["user"]}>
              <UserAdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<SchoolDashboard />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="users/:id/analytics" element={<AdminEmployeeAnalytics />} />
          <Route path="sinf" element={<Sinf />} />
          <Route path="sinf/:id" element={<SinfDetail />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="students" element={<AdminStudents />} />
          <Route path="attandance" element={<AdminAttandance />} />
          <Route path="entry-exit" element={<AdminEntryExit />} />
          <Route path="regulation" element={<AdminRegulation />} />
          <Route path="profile" element={<Profile />} />
          <Route path="camera" element={<AdminCameras />} />
          <Route path="facecontrol" element={<AdminFaceControl />} />
          <Route path="classrooms" element={<AdminClassrooms />} />
<Route path="kuzatuv" element={<AdminAIEvidence />} />
<Route path="faces" element={<AdminFaces />} />
<Route path="faces/live" element={<AdminFaceLive />} />
<Route path="parents" element={<AdminParents />} />
<Route path="live" element={<AdminLiveView />} />
<Route path="nazorat" element={<AdminClassControl />} />
          <Route path="classrooms/:sinfId" element={<AdminClassroomDetail />} />
          <Route element={<SchoolStatsShell />}>
            <Route path="grades" element={<MonitorGrades />} />
            <Route path="grades/:grade" element={<MonitorGradeDetail />} />
            <Route path="grades/:grade/:sinfId" element={<MonitorGradeClass />} />
            <Route path="late" element={<MonitorLate />} />
            <Route path="leaves" element={<MonitorLeaves />} />
            <Route path="risk" element={<MonitorRisk />} />
            <Route path="alerts" element={<MonitorAlerts />} />
            <Route path="trend" element={<MonitorTrend />} />
            <Route path="people/:kind/:id" element={<MonitorPerson />} />
          </Route>
          <Route path="comments" element={<UserComments />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
        {/* ADMIN */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<SchoolDashboard />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="users/:id/analytics" element={<AdminEmployeeAnalytics />} />
          <Route path="sinf" element={<Sinf />} />
          <Route path="sinf/:id" element={<SinfDetail />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="students" element={<AdminStudents />} />
          <Route path="attandance" element={<AdminAttandance />} />
          <Route path="entry-exit" element={<AdminUserEntryExit />} />
          <Route path="regulation" element={<AdminRegulation />} />
          <Route path="profile" element={<Profile />} />
          <Route path="camera" element={<AdminUserCameras />} />
          <Route path="facecontrol" element={<AdminFaceControl />} />
          <Route path="classrooms" element={<AdminClassrooms />} />
<Route path="kuzatuv" element={<AdminAIEvidence />} />
<Route path="faces" element={<AdminFaces />} />
<Route path="faces/live" element={<AdminFaceLive />} />
<Route path="parents" element={<AdminParents />} />
<Route path="live" element={<AdminLiveView />} />
<Route path="nazorat" element={<AdminClassControl />} />
          <Route path="classrooms/:sinfId" element={<AdminClassroomDetail />} />
          <Route element={<SchoolStatsShell />}>
            <Route path="grades" element={<MonitorGrades />} />
            <Route path="grades/:grade" element={<MonitorGradeDetail />} />
            <Route path="grades/:grade/:sinfId" element={<MonitorGradeClass />} />
            <Route path="late" element={<MonitorLate />} />
            <Route path="leaves" element={<MonitorLeaves />} />
            <Route path="risk" element={<MonitorRisk />} />
            <Route path="alerts" element={<MonitorAlerts />} />
            <Route path="trend" element={<MonitorTrend />} />
            <Route path="people/:kind/:id" element={<MonitorPerson />} />
          </Route>
          <Route path="comments" element={<UserComments />} />
        </Route>
        {/* VIEWER */}
        <Route
          path="/viewer"
          element={
            <ProtectedRoute allowedRoles={["viewer"]}>
              <UserLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ViewerDashboard />} />
          <Route path="entry-exit" element={<UserAttandance />} />
          <Route element={<ViewerStatsShell />}>
            <Route path="grades" element={<MonitorGrades />} />
            <Route path="grades/:grade" element={<MonitorGradeDetail />} />
            <Route path="grades/:grade/:sinfId" element={<MonitorGradeClass />} />
            <Route path="late" element={<MonitorLate />} />
            <Route path="leaves" element={<MonitorLeaves />} />
            <Route path="risk" element={<MonitorRisk />} />
            <Route path="people/:kind/:id" element={<MonitorPerson />} />
          </Route>
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* LEADER */}
        <Route
          path="/leader"
          element={
            <ProtectedRoute allowedRoles={["leader"]}>
              <LeaderLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<LeaderUsers />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="users/:id/analytics" element={<AdminEmployeeAnalytics />} />
          <Route path="sinf" element={<UserSinf />} />
          <Route path="sinf/:id" element={<SinfDetail />} />
          <Route path="attandance" element={<AdminAttandance />} />
          <Route path="entry-exit" element={<UserAttandance />} />
          <Route path="profile" element={<Profile />} />
          <Route path="comments" element={<UserComments />} />
        </Route>
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App

