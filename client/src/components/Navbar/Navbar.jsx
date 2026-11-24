import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ShoppingCart,
  Bell,
  MessageCircle,
  Heart,
  Store,
  ShieldCheck,
  ClipboardCheck,
  Search,
  LogOut,
  Package,
  User,
  KeyRound,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useRealtime } from '../../context/RealtimeContext';
import AccountSecurityModal from '../AccountSecurityModal/AccountSecurityModal';
import './Navbar.css';

const Navbar = () => {
  const { user, isAuthenticated, isAdmin, isManager, logout } = useAuth();
  const { cartCount } = useCart();
  const { notifications, unreadNotifCount, markNotificationRead, markAllNotificationsRead } = useRealtime();
  const navigate = useNavigate();

  const [searchKeyword, setSearchKeyword] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchKeyword.trim();
    navigate(q ? `/shop?search=${encodeURIComponent(q)}` : '/shop');
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="tet-navbar">
      {/* Dải thông báo Tết trên cùng */}
      <div className="tet-topbar">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold tracking-wide">Xuân Đinh Mùi 2027 — Sàn Sách Đa Gian Hàng VitaBook</span>
            <Link to="/seller" className="tet-topbar-link hidden sm:inline-flex items-center gap-1">
              <Store className="w-3.5 h-3.5" /> Kênh Người Bán
            </Link>
            {(isManager || isAdmin) && (
              <Link to="/manager" className="tet-topbar-link inline-flex items-center gap-1 font-semibold text-amber-200">
                <ClipboardCheck className="w-3.5 h-3.5" /> Bảng Quản Lý (Manager)
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin" className="tet-topbar-link inline-flex items-center gap-1 font-semibold text-yellow-200">
                <ShieldCheck className="w-3.5 h-3.5" /> Quản Trị Sàn (Admin)
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-amber-100/90">Mã TET2027 giảm 15% • FREESHIPTET miễn phí vận chuyển</span>
          </div>
        </div>
      </div>

      {/* Thanh điều hướng chính */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
          <div className="tet-logo-badge">
            <BookOpen className="w-6 h-6 text-[#fef3c7]" />
          </div>
          <div>
            <span className="tet-logo-title">VitaBook</span>
            <span className="block text-[10px] tracking-widest uppercase text-amber-200/90 font-semibold">
              Chợ Sách Xuân Việt
            </span>
          </div>
        </Link>

        {/* Thanh tìm kiếm */}
        <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-xl tet-search-form">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="Tìm tên sách, tác giả, ISBN hoặc tên gian hàng..."
            className="tet-search-input"
          />
          <button type="submit" className="tet-search-btn" aria-label="Tìm kiếm">
            <Search className="w-4 h-4" />
            <span>Tìm</span>
          </button>
        </form>

        {/* Cụm tiện ích bên phải */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link to="/shop" className="hidden lg:inline-flex tet-nav-pill">
            Cửa hàng
          </Link>

          {isAuthenticated && (
            <>
              <Link to="/favorites" className="tet-icon-btn" title="Shop theo dõi & Sách yêu thích">
                <Heart className="w-5 h-5" />
              </Link>

              <Link to="/chat" className="tet-icon-btn" title="Tin nhắn với Shop">
                <MessageCircle className="w-5 h-5" />
              </Link>

              {/* Chuông thông báo realtime */}
              <div className="relative" ref={notifRef}>
                <button
                  type="button"
                  onClick={() => setNotifOpen((prev) => !prev)}
                  className="tet-icon-btn relative"
                  title="Thông báo"
                >
                  <Bell className="w-5 h-5" />
                  {unreadNotifCount > 0 && (
                    <span className="tet-badge-count">{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</span>
                  )}
                </button>

                {notifOpen && (
                  <div className="tet-notif-dropdown">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#ebe2d5] bg-[#faf6f0]">
                      <span className="font-bold text-sm text-[#1f1712]">Thông báo ({unreadNotifCount} mới)</span>
                      {unreadNotifCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          className="text-xs text-[#b91c1c] hover:underline font-semibold"
                        >
                          Đọc tất cả
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-amber-100">
                      {notifications.length === 0 ? (
                        <p className="p-6 text-center text-sm text-stone-500">Chưa có thông báo nào.</p>
                      ) : (
                        notifications.map((n) => (
                          <button
                            key={n.NotificationID}
                            type="button"
                            onClick={() => {
                              markNotificationRead(n.NotificationID);
                              setNotifOpen(false);
                              if (n.LinkUrl) navigate(n.LinkUrl);
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-amber-50 transition ${
                              !n.IsRead ? 'bg-red-50/60' : ''
                            }`}
                          >
                            <p className="text-xs font-bold text-[#7f1d1d]">{n.Title}</p>
                            <p className="text-xs text-stone-600 mt-0.5 line-clamp-2">{n.Message}</p>
                            <p className="text-[10px] text-stone-400 mt-1">
                              {new Date(n.CreatedAt).toLocaleString('vi-VN')}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Giỏ hàng */}
          <Link to="/cart" className="tet-icon-btn relative" title="Giỏ hàng">
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && <span className="tet-badge-count">{cartCount}</span>}
          </Link>

          {/* Tài khoản */}
          {isAuthenticated ? (
            <div className="hidden sm:flex items-center gap-1.5 ml-1 pl-2 border-l border-amber-200/25">
              <Link to="/orders" className="tet-icon-btn" title="Đơn hàng của tôi">
                <Package className="w-4 h-4" />
              </Link>
              <Link to="/profile" className="tet-user-chip" title="Hồ sơ cá nhân & Bảo mật">
                <User className="w-4 h-4 text-[#e6c67c]" />
                <div className="leading-tight">
                  <span className="block text-xs font-bold max-w-[110px] truncate">{user?.fullName}</span>
                  <span className="block text-[10px] text-amber-100/80">{user?.role}</span>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setSecurityOpen(true)}
                className="tet-icon-btn"
                title="Đổi mật khẩu nhanh"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              <button type="button" onClick={handleLogout} className="tet-icon-btn" title="Đăng xuất">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2 ml-1">
              <Link to="/login" className="tet-btn-outline">
                Đăng nhập
              </Link>
              <Link to="/register" className="tet-btn-gold">
                Đăng ký
              </Link>
            </div>
          )}

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((p) => !p)}
            className="sm:hidden tet-icon-btn"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden px-4 pb-4 space-y-2 bg-[#7f1d1d] border-t border-amber-500/30">
          <form onSubmit={handleSearchSubmit} className="flex gap-2 pt-3">
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="Tìm sách, tác giả, shop..."
              className="flex-1 px-3 py-2 rounded-lg text-sm text-stone-900"
            />
            <button type="submit" className="px-3 py-2 rounded-lg bg-amber-500 text-[#5c0b0b] font-bold text-sm">
              Tìm
            </button>
          </form>
          <div className="flex flex-wrap gap-2 pt-2 text-xs">
            <Link to="/shop" onClick={() => setMobileMenuOpen(false)} className="tet-nav-pill">Cửa hàng</Link>
            <Link to="/seller" onClick={() => setMobileMenuOpen(false)} className="tet-nav-pill">Kênh Người Bán</Link>
            {isAuthenticated ? (
              <>
                <Link to="/profile" onClick={() => setMobileMenuOpen(false)} className="tet-nav-pill">Hồ sơ</Link>
                <Link to="/orders" onClick={() => setMobileMenuOpen(false)} className="tet-nav-pill">Đơn hàng</Link>
                {(isManager || isAdmin) && (
                  <Link to="/manager" onClick={() => setMobileMenuOpen(false)} className="tet-nav-pill">Quản Lý</Link>
                )}
                {isAdmin && (
                  <Link to="/admin" onClick={() => setMobileMenuOpen(false)} className="tet-nav-pill">Admin</Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSecurityOpen(true);
                  }}
                  className="tet-nav-pill"
                >
                  Đổi mật khẩu
                </button>
                <button type="button" onClick={handleLogout} className="tet-nav-pill bg-red-950">Đăng xuất</button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="tet-btn-outline">Đăng nhập</Link>
                <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="tet-btn-gold">Đăng ký</Link>
              </>
            )}
          </div>
        </div>
      )}

      {securityOpen && (
        <AccountSecurityModal
          onClose={() => setSecurityOpen(false)}
          onLoggedOutAll={() => navigate('/login')}
        />
      )}
    </header>
  );
};

export default Navbar;
