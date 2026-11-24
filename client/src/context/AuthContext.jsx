import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('bookstore_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('bookstore_token') || null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem('bookstore_token');
    localStorage.removeItem('bookstore_user');
    setToken(null);
    setUser(null);
  }, []);

  const updateSessionToken = useCallback((newToken) => {
    if (!newToken) return;
    localStorage.setItem('bookstore_token', newToken);
    setToken(newToken);
  }, []);

  const refreshUser = useCallback(async () => {
    const activeToken = localStorage.getItem('bookstore_token');
    if (!activeToken) return null;
    try {
      const res = await authService.getMe();
      if (res.data?.success) {
        setUser(res.data.data);
        localStorage.setItem('bookstore_user', JSON.stringify(res.data.data));
        return res.data.data;
      }
    } catch {
      logout();
    }
    return null;
  }, [logout]);

  useEffect(() => {
    const verifyAuth = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      await refreshUser();
      setLoading(false);
    };
    verifyAuth();
  }, [token, refreshUser]);

  const login = async (email, password, captchaToken, captchaInput) => {
    const res = await authService.login({ email, password, captchaToken, captchaInput });
    const { token: newToken, user: userData } = res.data.data;
    localStorage.setItem('bookstore_token', newToken);
    localStorage.setItem('bookstore_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const register = async (payload) => {
    const res = await authService.register(payload);
    const { token: newToken, user: userData } = res.data.data;
    localStorage.setItem('bookstore_token', newToken);
    localStorage.setItem('bookstore_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const logoutAll = async () => {
    try {
      await authService.logoutAll();
    } finally {
      logout();
    }
  };

  const isAdmin = user?.role === 'Admin';
  const isManager = user?.role === 'Manager';
  const isStaff = isAdmin || isManager;
  const isAuthenticated = Boolean(user && token);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated,
        isAdmin,
        isManager,
        isStaff,
        login,
        register,
        logout,
        logoutAll,
        updateSessionToken,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth phải được sử dụng bên trong AuthProvider');
  }
  return context;
};
