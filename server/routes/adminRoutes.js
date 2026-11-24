const express = require('express');
const router = express.Router();
const {
  getAdminDashboardStats,
  getUsers,
  createManagerAccount,
  updateUserRoleOrStatus,
  getSystemSettings,
  updateSystemSettings,
  getWithdrawals,
  processWithdrawal,
  getAuditLogs,
  createPublisher,
  deletePublisher,
} = require('../controllers/adminController');
const { getAllOrdersForTracking } = require('../controllers/managerController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

router.use(authenticateToken, authorizeRoles('Admin'));

router.get('/stats', getAdminDashboardStats);
router.get('/orders', getAllOrdersForTracking);

router.get('/users', getUsers);
router.post('/users/manager', createManagerAccount);
router.put('/users/:id', updateUserRoleOrStatus);

router.get('/settings', getSystemSettings);
router.put('/settings', updateSystemSettings);

router.get('/withdrawals', getWithdrawals);
router.put('/withdrawals/:id', processWithdrawal);

router.get('/audit-logs', getAuditLogs);

router.post('/publishers', createPublisher);
router.delete('/publishers/:id', deletePublisher);

module.exports = router;
