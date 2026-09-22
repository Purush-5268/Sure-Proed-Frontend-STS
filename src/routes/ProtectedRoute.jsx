import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import GlobalLoader from "../components/common/GlobalLoader";
import Error403 from "../pages/errors/Error403";

function ProtectedRoute({ allowedRoles, redirectTo = "/login" }) {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <GlobalLoader message="Restoring Session..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && user?.role) {
    const isAdvisor = user.role === "ADVISOR" || (user.role === "TRUSTEE" && user.admin_category === "ADVISORY");
    const effectiveRole = isAdvisor ? "ADVISOR" : user.role;

    if (!allowedRoles.includes(effectiveRole)) {
      return <Error403 />;
    }
  }

  return <Outlet />;
}

export default ProtectedRoute;
