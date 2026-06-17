import { Navigate, useLocation } from "react-router-dom";
import { getAdminToken } from "../services/api";

function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = getAdminToken();

  if (!token) {
    return <Navigate to="/login" replace state={{ redirectTo: location.pathname + location.search }} />;
  }

  return children;
}

export default ProtectedRoute;
