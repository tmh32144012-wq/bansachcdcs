import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('bookstore_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/login') && !currentPath.includes('/register')) {
        localStorage.removeItem('bookstore_token');
        localStorage.removeItem('bookstore_user');
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Helper chuyển FileList từ <input type="file"> sang DataURL và gọi API upload lên server/uploads
 */
export const uploadFilesToServer = async (fileList) => {
  const files = Array.from(fileList || []);
  if (files.length === 0) return [];

  const dataUrls = await Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
          reader.readAsDataURL(file);
        })
    )
  );

  const res = await api.post('/uploads/images', { images: dataUrls });
  return res.data?.data?.urls || [];
};

export const formatVND = (amount) =>
  `${Number(amount || 0).toLocaleString('vi-VN')}đ`;

export const authService = {
  getCaptcha: () => api.get('/auth/captcha'),
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getMe: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  changePassword: (data) => api.put('/auth/change-password', data),
  logoutAll: () => api.post('/auth/logout-all'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
};

export const bookService = {
  getBooks: (params) => api.get('/books', { params }),
  getBookById: (id) => api.get(`/books/${id}`),
  createBook: (bookData) => api.post('/books', bookData),
  updateBook: (id, bookData) => api.put(`/books/${id}`, bookData),
  deleteBook: (id) => api.delete(`/books/${id}`),
};

export const shopService = {
  getPublicShops: () => api.get('/shops'),
  getShopById: (id) => api.get(`/shops/${id}`),
};

export const sellerService = {
  registerShop: (data) => api.post('/seller/register-shop', data),
  getMyShop: () => api.get('/seller/my-shop'),
  updateMyShop: (data) => api.put('/seller/my-shop', data),
  getMyBooks: () => api.get('/seller/books'),
  createBook: (data) => api.post('/seller/books', data),
  updateBook: (id, data) => api.put(`/seller/books/${id}`, data),
  toggleBookVisibility: (id) => api.patch(`/seller/books/${id}/visibility`),
  getSellerOrders: () => api.get('/seller/orders'),
  updateSellerOrderStatus: (id, data) => api.put(`/seller/orders/${id}/status`, data),
  getWallet: () => api.get('/seller/wallet'),
  requestWithdrawal: (data) => api.post('/seller/wallet/withdraw', data),
};

export const managerService = {
  getOverview: () => api.get('/manager/overview'),
  getShops: (params) => api.get('/manager/shops', { params }),
  reviewShop: (id, data) => api.put(`/manager/shops/${id}/review`, data),
  getBooks: (params) => api.get('/manager/books', { params }),
  reviewBook: (id, data) => api.put(`/manager/books/${id}/review`, data),
  toggleFlashSale: (id, data) => api.put(`/manager/books/${id}/flash-sale`, data),
  getOrders: (params) => api.get('/manager/orders', { params }),
  addTrackingEvent: (orderId, data) => api.post(`/manager/orders/${orderId}/tracking`, data),
  getDisputes: () => api.get('/manager/disputes'),
  resolveDispute: (id, data) => api.put(`/manager/disputes/${id}/resolve`, data),
  getReviews: () => api.get('/manager/reviews'),
  moderateReview: (id, data) => api.put(`/manager/reviews/${id}`, data),
};

export const adminService = {
  getStats: () => api.get('/admin/stats'),
  getOrders: (params) => api.get('/admin/orders', { params }),
  getUsers: () => api.get('/admin/users'),
  createManager: (data) => api.post('/admin/users/manager', data),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  getSettings: () => api.get('/admin/settings'),
  updateSettings: (settings) => api.put('/admin/settings', { settings }),
  getWithdrawals: () => api.get('/admin/withdrawals'),
  processWithdrawal: (id, data) => api.put(`/admin/withdrawals/${id}`, data),
  getAuditLogs: () => api.get('/admin/audit-logs'),
  createPublisher: (data) => api.post('/admin/publishers', data),
  deletePublisher: (id) => api.delete(`/admin/publishers/${id}`),
};

export const catalogService = {
  getPublicSettings: () => api.get('/public-settings'),
  getCategories: () => api.get('/categories'),
  createCategory: (data) => api.post('/categories', data),
  updateCategory: (id, data) => api.put(`/categories/${id}`, data),
  deleteCategory: (id) => api.delete(`/categories/${id}`),
  getAuthors: () => api.get('/authors'),
  createAuthor: (data) => api.post('/authors', data),
  updateAuthor: (id, data) => api.put(`/authors/${id}`, data),
  deleteAuthor: (id) => api.delete(`/authors/${id}`),
  getPublishers: () => api.get('/publishers'),
};

export const orderService = {
  createOrder: (orderData) => api.post('/orders', orderData),
  getMyOrders: () => api.get('/orders/my-orders'),
  getQrPaymentStatus: (token) => api.get(`/orders/qr-status/${token}`),
  simulateQrPayment: (token) => api.post(`/orders/qr-simulate/${token}`),
  createQrSession: (orderId) => api.post(`/orders/${orderId}/qr-session`),
  confirmReceived: (id) => api.put(`/orders/${id}/confirm-received`),
  cancelOrder: (id, reason) => api.put(`/orders/${id}/cancel`, { reason }),
};

export const voucherService = {
  getVouchers: (params) => api.get('/vouchers', { params }),
  createVoucher: (data) => api.post('/vouchers', data),
  deleteVoucher: (id) => api.delete(`/vouchers/${id}`),
};

export const reviewService = {
  getEligibleOrders: (bookId) => api.get(`/reviews/eligible/${bookId}`),
  createReview: (data) => api.post('/reviews', data),
  replyReview: (id, sellerReply) => api.put(`/reviews/${id}/reply`, { sellerReply }),
  reportReview: (id, reason) => api.put(`/reviews/${id}/report`, { reason }),
};

export const questionService = {
  getBookQuestions: (bookId) => api.get(`/books/${bookId}/questions`),
  askQuestion: (bookId, question) => api.post(`/books/${bookId}/questions`, { question }),
  answerQuestion: (questionId, answer) => api.put(`/books/questions/${questionId}/answer`, { answer }),
  deleteQuestion: (questionId) => api.delete(`/books/questions/${questionId}`),
};

export const cartService = {
  getCart: () => api.get('/cart'),
  syncCart: (items) => api.put('/cart/sync', { items }),
  clearCart: () => api.delete('/cart'),
};

export const disputeService = {
  createDispute: (data) => api.post('/disputes', data),
  getMyDisputes: () => api.get('/disputes/my'),
};

export const socialService = {
  createSseTicket: () => api.post('/social/sse-ticket'),
  toggleFollowShop: (shopId) => api.post(`/social/follow-shop/${shopId}`),
  getFollowedShops: () => api.get('/social/followed-shops'),
  toggleWishlist: (bookId) => api.post(`/social/wishlist/${bookId}`),
  getWishlist: () => api.get('/social/wishlist'),
  getNotifications: () => api.get('/social/notifications'),
  markRead: (id) => api.put(`/social/notifications/${id}/read`),
  markAllRead: () => api.put('/social/notifications/read-all'),
};

export const chatService = {
  getConversations: () => api.get('/chat/conversations'),
  startConversation: (shopId) => api.post('/chat/conversations', { shopId }),
  getMessages: (conversationId) => api.get(`/chat/conversations/${conversationId}/messages`),
  sendMessage: (conversationId, content) => api.post(`/chat/conversations/${conversationId}/messages`, { content }),
};

export default api;
