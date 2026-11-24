import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, socialService } from '../services/api';
import { useAuth } from './AuthContext';

const RealtimeContext = createContext(null);

export const RealtimeProvider = ({ children }) => {
  const { isAuthenticated, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [followedShopIds, setFollowedShopIds] = useState(new Set());
  const [latestChatEvent, setLatestChatEvent] = useState(null);
  const [latestQrPaymentEvent, setLatestQrPaymentEvent] = useState(null);

  const fetchSocialData = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadNotifCount(0);
      setWishlistIds(new Set());
      setFollowedShopIds(new Set());
      return;
    }

    try {
      const [notifRes, wishRes, followRes] = await Promise.all([
        socialService.getNotifications(),
        socialService.getWishlist(),
        socialService.getFollowedShops(),
      ]);
      if (notifRes.data?.success) {
        setNotifications(notifRes.data.data || []);
        setUnreadNotifCount(notifRes.data.unreadCount || 0);
      }
      if (wishRes.data?.success) {
        setWishlistIds(new Set((wishRes.data.data || []).map((b) => b.BookID)));
      }
      if (followRes.data?.success) {
        setFollowedShopIds(new Set((followRes.data.data || []).map((s) => s.ShopID)));
      }
    } catch (_) {}
  }, [isAuthenticated]);

  useEffect(() => {
    fetchSocialData();
  }, [fetchSocialData]);

  // Kết nối Server-Sent Events (SSE) bằng ticket ngắn hạn dùng 1 lần (không lộ JWT trên URL)
  useEffect(() => {
    if (!isAuthenticated || !token) return undefined;

    let cancelled = false;
    let es = null;

    const connectSse = async () => {
      try {
        const ticketRes = await socialService.createSseTicket();
        const ticket = ticketRes.data?.data?.ticket;
        if (!ticket || cancelled) return;

        es = new EventSource(`${API_BASE_URL}/social/stream?ticket=${encodeURIComponent(ticket)}`);

        es.addEventListener('notification', (event) => {
          try {
            const notif = JSON.parse(event.data);
            setNotifications((prev) => [notif, ...prev].slice(0, 40));
            setUnreadNotifCount((c) => c + 1);
          } catch (_) {}
        });

        es.addEventListener('chat_message', (event) => {
          try {
            const msg = JSON.parse(event.data);
            setLatestChatEvent({ ...msg, _ts: Date.now() });
          } catch (_) {}
        });

        es.addEventListener('qr_payment_confirmed', (event) => {
          try {
            const payload = JSON.parse(event.data);
            setLatestQrPaymentEvent({ ...payload, _ts: Date.now() });
          } catch (_) {}
        });

        es.addEventListener('qr_payment_failed', (event) => {
          try {
            const payload = JSON.parse(event.data);
            setLatestQrPaymentEvent({ ...payload, _ts: Date.now() });
          } catch (_) {}
        });
      } catch (_) {}
    };

    connectSse();

    return () => {
      cancelled = true;
      if (es) es.close();
    };
  }, [isAuthenticated, token]);

  const toggleWishlist = async (bookId) => {
    const res = await socialService.toggleWishlist(bookId);
    const isNow = res.data?.data?.isWishlisted;
    setWishlistIds((prev) => {
      const next = new Set(prev);
      if (isNow) next.add(bookId);
      else next.delete(bookId);
      return next;
    });
    return isNow;
  };

  const toggleFollowShop = async (shopId) => {
    const res = await socialService.toggleFollowShop(shopId);
    const isNow = res.data?.data?.isFollowing;
    setFollowedShopIds((prev) => {
      const next = new Set(prev);
      if (isNow) next.add(shopId);
      else next.delete(shopId);
      return next;
    });
    return res.data?.data;
  };

  const markNotificationRead = async (id) => {
    await socialService.markRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.NotificationID === id ? { ...n, IsRead: true } : n))
    );
    setUnreadNotifCount((prev) => Math.max(0, prev - 1));
  };

  const markAllNotificationsRead = async () => {
    await socialService.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, IsRead: true })));
    setUnreadNotifCount(0);
  };

  return (
    <RealtimeContext.Provider
      value={{
        notifications,
        unreadNotifCount,
        wishlistIds,
        followedShopIds,
        latestChatEvent,
        latestQrPaymentEvent,
        refreshSocialData: fetchSocialData,
        toggleWishlist,
        toggleFollowShop,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = () => {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime phải dùng bên trong RealtimeProvider');
  return ctx;
};
