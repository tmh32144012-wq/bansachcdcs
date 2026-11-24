import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Bảo vệ Route theo đăng nhập hoặc danh sách vai trò (Customer, Manager, Admin)
 */
const ProtectedRoute = ({ children, allowedRoles = null, requireAdmin = false }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 border-4 border-[#b91c1c] border-t-[#f59e0b] rounded-full animate-spin" />
        <p className="text-sm text-[#7f1d1d] font-medium">Đang tải dữ liệu Xuân VitaBook...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user?.role !== 'Admin') {
    return <Navigate to="/" replace />;
  }

  if (Array.isArray(allowedRoles) && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
