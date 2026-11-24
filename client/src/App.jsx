import React, { Suspense, lazy } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar/Navbar';
import Footer from './components/Footer/Footer';
import ProtectedRoute from './components/ProtectedRoute';

// Code-splitting theo từng trang bằng React.lazy để giảm mạnh dung lượng bundle ban đầu
const HomePage = lazy(() => import('./pages/HomePage/HomePage'));
const ShopPage = lazy(() => import('./pages/ShopPage/ShopPage'));
const BookDetailPage = lazy(() => import('./pages/BookDetailPage/BookDetailPage'));
const VendorShopPage = lazy(() => import('./pages/VendorShopPage/VendorShopPage'));
const CartCheckoutPage = lazy(() => import('./pages/CartCheckoutPage/CartCheckoutPage'));
const OrdersHistoryPage = lazy(() => import('./pages/OrdersHistoryPage/OrdersHistoryPage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage/FavoritesPage'));
const ChatPage = lazy(() => import('./pages/ChatPage/ChatPage'));
const SellerCenterPage = lazy(() => import('./pages/SellerCenterPage/SellerCenterPage'));
const ManagerDashboardPage = lazy(() => import('./pages/ManagerDashboardPage/ManagerDashboardPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage/AdminDashboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage/ProfilePage'));
const LoginPage = lazy(() => import('./pages/LoginPage/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage/RegisterPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage/NotFoundPage'));

const PageLoader = () => (
  <div className="min-h-[55vh] flex items-center justify-center text-sm text-stone-500">
    Đang tải trang...
  </div>
);

const App = () => {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  return (
    <div className="min-h-screen flex flex-col tet-bg-pattern">
      {!isAuthPage && <Navbar />}
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/books/:id" element={<BookDetailPage />} />
            <Route path="/shops/:shopId" element={<VendorShopPage />} />
            <Route path="/cart" element={<CartCheckoutPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Các trang yêu cầu đăng nhập */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <OrdersHistoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/favorites"
              element={
                <ProtectedRoute>
                  <FavoritesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <ChatPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/seller"
              element={
                <ProtectedRoute>
                  <SellerCenterPage />
                </ProtectedRoute>
              }
            />

            {/* Trang Tác nhân Quản lý (Manager & Admin) */}
            <Route
              path="/manager"
              element={
                <ProtectedRoute allowedRoles={['Manager', 'Admin']}>
                  <ManagerDashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Trang Quản trị cấp cao (Admin) */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['Admin']}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Trang 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </main>
      {!isAuthPage && <Footer />}
    </div>
  );
};

export default App;
