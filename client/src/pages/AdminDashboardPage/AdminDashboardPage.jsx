import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Users,
  Wallet,
  Settings,
  FolderTree,
  ScrollText,
  FileSpreadsheet,
  UserPlus,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
} from 'lucide-react';
import { adminService, catalogService, formatVND } from '../../services/api';
import './AdminDashboardPage.css';

const AdminDashboardPage = () => {
  const [activeTab, setActiveTab] = useState('finance');
  const [stats, setStats] = useState({ summary: {}, topShops: [] });
  const [users, setUsers] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [settingsMap, setSettingsMap] = useState({
    CommissionRate: '5',
    ShippingFeeEconomy: '15000',
    ShippingFeeStandard: '30000',
    ShippingFeeExpress: '50000',
  });
  const [auditLogs, setAuditLogs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [publishers, setPublishers] = useState([]);
  const [notice, setNotice] = useState('');

  // Form tạo tài khoản Quản lý (Manager)
  const [managerForm, setManagerForm] = useState({ fullName: '', email: '', password: '', phone: '' });
  // Form thêm nhanh Danh mục / Tác giả / NXB
  const [newCategory, setNewCategory] = useState('');
  const [newAuthor, setNewAuthor] = useState({ authorName: '', bio: '' });
  const [newPublisher, setNewPublisher] = useState('');

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const loadAll = async () => {
    try {
      const [stRes, uRes, wRes, setRes, logRes, catRes, authRes, pubRes] = await Promise.all([
        adminService.getStats(),
        adminService.getUsers(),
        adminService.getWithdrawals(),
        adminService.getSettings(),
        adminService.getAuditLogs(),
        catalogService.getCategories(),
        catalogService.getAuthors(),
        catalogService.getPublishers(),
      ]);
      setStats(stRes.data?.data || { summary: {}, topShops: [] });
      setUsers(uRes.data?.data || []);
      setWithdrawals(wRes.data?.data || []);
      const sObj = {};
      for (const row of setRes.data?.data || []) {
        sObj[row.SettingKey] = row.SettingValue;
      }
      setSettingsMap((prev) => ({ ...prev, ...sObj }));
      setAuditLogs(logRes.data?.data || []);
      setCategories(catRes.data?.data || []);
      setAuthors(authRes.data?.data || []);
      setPublishers(pubRes.data?.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const rows = (stats.topShops || []).map((s) => ({
      'Mã Shop': s.ShopID,
      'Tên Gian Hàng': s.ShopName,
      'Loại hình': s.ShopType,
      'Số đơn': s.OrderCount,
      'Tổng GMV (VNĐ)': Number(s.ShopRevenue || 0),
      'Hoa hồng nộp sàn (VNĐ)': Number(s.CommissionPaid || 0),
      'Số dư Ví hiện tại (VNĐ)': Number(s.WalletBalance || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BaoCaoTaiChinh');
    XLSX.writeFile(wb, `VitaBook_Admin_Finance_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleCreateManager = async (e) => {
    e.preventDefault();
    try {
      const res = await adminService.createManager(managerForm);
      flash(res.data?.message || 'Đã tạo tài khoản Manager!');
      setManagerForm({ fullName: '', email: '', password: '', phone: '' });
      loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Không thể tạo tài khoản Manager.');
    }
  };

  const handleUpdateUser = async (userId, patch) => {
    try {
      await adminService.updateUser(userId, patch);
      flash('Đã cập nhật trạng thái/vai trò tài khoản.');
      loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Lỗi cập nhật tài khoản.');
    }
  };

  const handleProcessWithdrawal = async (txId, status) => {
    const note = window.prompt(status === 'Completed' ? 'Mã giao dịch chuyển khoản (tùy chọn):' : 'Lý do từ chối yêu cầu rút tiền:');
    if (status === 'Rejected' && !note) return;
    try {
      const res = await adminService.processWithdrawal(txId, { status, note: note || '' });
      flash(res.data?.message || 'Đã xử lý yêu cầu rút tiền.');
      loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Lỗi xử lý rút tiền.');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await adminService.updateSettings(settingsMap);
      flash(res.data?.message || 'Đã lưu cấu hình sàn!');
      loadAll();
    } catch (err) {
      flash(err.response?.data?.message || 'Không thể lưu cấu hình.');
    }
  };

  const summary = stats.summary || {};

  return (
    <div className="admin-tet-page max-w-7xl mx-auto px-4 py-8 relative">
      {/* Header Admin */}
      <div className="admin-header mb-6">
        <div>
          <span className="text-xs uppercase tracking-widest text-amber-200 font-semibold">Quản Trị Cấp Cao • Super Admin</span>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#fef3c7] mt-1">
            Bảng Điều Khiển Quản Trị Toàn Sàn VitaBook
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/manager" className="px-4 py-2 rounded-xl bg-amber-400 text-[#450a0a] font-extrabold text-xs">
            Mở Khu Quản Lý (Manager)
          </Link>
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-4 py-2 rounded-xl border border-amber-300 text-amber-100 font-bold text-xs inline-flex items-center gap-1.5 hover:bg-white/10"
          >
            <FileSpreadsheet className="w-4 h-4" /> Xuất Báo Cáo Excel
          </button>
        </div>
      </div>

      {notice && (
        <div className="mb-4 p-3.5 rounded-xl bg-[#fbf6ec] border border-[#dfc99f] text-[#7f1d1d] font-semibold text-sm">
          {notice}
        </div>
      )}

      {/* KPI tổng quan */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 relative z-10">
        <div className="admin-kpi-card">
          <span className="text-xs text-stone-500 font-semibold">Tổng GMV toàn sàn</span>
          <strong className="text-xl text-[#b91c1c]">{formatVND(summary.TotalGMV)}</strong>
        </div>
        <div className="admin-kpi-card">
          <span className="text-xs text-stone-500 font-semibold">Doanh thu Hoa hồng sàn</span>
          <strong className="text-xl text-emerald-700">{formatVND(summary.TotalCommissionEarned)}</strong>
        </div>
        <div className="admin-kpi-card">
          <span className="text-xs text-stone-500 font-semibold">Gian hàng / Sách mở bán</span>
          <strong className="text-xl text-[#7f1d1d]">{summary.ApprovedShops || 0} Shop / {summary.ApprovedBooks || 0} Sách</strong>
        </div>
        <div className="admin-kpi-card">
          <span className="text-xs text-stone-500 font-semibold">Yêu cầu rút tiền chờ duyệt</span>
          <strong className="text-xl text-amber-700">{summary.PendingWithdrawals || 0} lệnh</strong>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 relative z-10">
        {[
          { id: 'finance', label: 'Tài chính & Top Shop', icon: BarChart3 },
          { id: 'users', label: `Tài khoản & Manager (${users.length})`, icon: Users },
          { id: 'withdrawals', label: `Duyệt Rút Tiền (${summary.PendingWithdrawals || 0})`, icon: Wallet },
          { id: 'settings', label: 'Cấu hình % Hoa hồng & Ship', icon: Settings },
          { id: 'catalog', label: 'Danh mục / Tác giả / NXB', icon: FolderTree },
          { id: 'audit', label: 'Nhật ký Kiểm duyệt (Audit)', icon: ScrollText },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`admin-tab-btn ${activeTab === t.id ? 'is-active' : ''}`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: TÀI CHÍNH & TOP SHOP */}
      {activeTab === 'finance' && (
        <div className="admin-card overflow-x-auto relative z-10">
          <h2 className="font-bold text-lg text-[#7f1d1d] mb-4">📊 Hiệu suất kinh doanh & Hoa hồng theo từng Gian hàng</h2>
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-amber-200 text-xs text-[#7f1d1d]">
                <th className="py-2.5 px-2">Gian hàng</th>
                <th className="py-2.5 px-2">Loại</th>
                <th className="py-2.5 px-2">Số đơn</th>
                <th className="py-2.5 px-2">Tổng GMV</th>
                <th className="py-2.5 px-2">Hoa hồng sàn thu</th>
                <th className="py-2.5 px-2">Số dư Ví Shop</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {(stats.topShops || []).map((s) => (
                <tr key={s.ShopID}>
                  <td className="py-3 px-2 font-bold text-[#3b1510]">{s.ShopName}</td>
                  <td className="py-3 px-2 text-xs">{s.ShopType}</td>
                  <td className="py-3 px-2">{s.OrderCount}</td>
                  <td className="py-3 px-2 font-bold text-[#b91c1c]">{formatVND(s.ShopRevenue)}</td>
                  <td className="py-3 px-2 font-bold text-emerald-700">{formatVND(s.CommissionPaid)}</td>
                  <td className="py-3 px-2 font-semibold">{formatVND(s.WalletBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: QUẢN LÝ TÀI KHOẢN & TẠO MANAGER */}
      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10">
          <form onSubmit={handleCreateManager} className="lg:col-span-4 admin-card space-y-3 h-fit">
            <h3 className="font-bold text-[#7f1d1d] flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" /> Tạo Tài Khoản Quản Lý (Manager)
            </h3>
            <input type="text" required placeholder="Họ tên Quản lý" value={managerForm.fullName} onChange={(e) => setManagerForm((f) => ({ ...f, fullName: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            <input type="email" required placeholder="Email đăng nhập" value={managerForm.email} onChange={(e) => setManagerForm((f) => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            <input type="password" required minLength={6} placeholder="Mật khẩu (>= 6 ký tự)" value={managerForm.password} onChange={(e) => setManagerForm((f) => ({ ...f, password: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            <input type="text" placeholder="Số điện thoại" value={managerForm.phone} onChange={(e) => setManagerForm((f) => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            <button type="submit" className="w-full py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm">
              Tạo Tài Khoản Manager
            </button>
          </form>

          <div className="lg:col-span-8 admin-card overflow-x-auto">
            <h3 className="font-bold text-[#7f1d1d] mb-3">Danh sách toàn bộ người dùng</h3>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-amber-200 text-[#7f1d1d]">
                  <th className="py-2">Người dùng</th>
                  <th className="py-2">Vai trò</th>
                  <th className="py-2">Gian hàng</th>
                  <th className="py-2 text-right">Khóa / Phân quyền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {users.map((u) => (
                  <tr key={u.UserID}>
                    <td className="py-2.5">
                      <p className="font-bold text-sm text-[#3b1510]">{u.FullName}</p>
                      <p className="text-stone-500">{u.Email}</p>
                    </td>
                    <td className="py-2.5">
                      <select
                        value={u.Role}
                        onChange={(e) => handleUpdateUser(u.UserID, { role: e.target.value })}
                        className="px-2 py-1 rounded-lg border border-amber-300 bg-white font-bold"
                      >
                        <option value="Customer">Customer</option>
                        <option value="Manager">Manager</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </td>
                    <td className="py-2.5">{u.ShopName ? `${u.ShopName} (${u.ShopStatus})` : '—'}</td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleUpdateUser(u.UserID, { isActive: !u.IsActive })}
                        className={`px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1 ${
                          u.IsActive ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {u.IsActive ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        {u.IsActive ? 'Khóa' : 'Mở khóa'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DUYỆT YÊU CẦU RÚT TIỀN */}
      {activeTab === 'withdrawals' && (
        <div className="admin-card space-y-3 relative z-10">
          <h2 className="font-bold text-lg text-[#7f1d1d]">💸 Danh sách yêu cầu rút tiền từ Ví Shop</h2>
          {withdrawals.length === 0 ? (
            <p className="text-sm text-stone-500 py-8 text-center">Chưa có yêu cầu rút tiền nào.</p>
          ) : (
            withdrawals.map((w) => (
              <div key={w.TransactionID} className="p-4 rounded-xl bg-[#fffaf0] border border-amber-200 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs space-y-0.5">
                  <p className="font-bold text-sm text-[#7f1d1d]">
                    Shop "{w.ShopName}" ({w.OwnerName}) — Rút <span className="text-[#b91c1c]">{formatVND(w.Amount)}</span>
                  </p>
                  <p className="text-stone-700">🏦 Thông tin nhận tiền: <strong>{w.BankInfo}</strong></p>
                  <p className="text-stone-500">Trạng thái: <strong>{w.Status}</strong> • {new Date(w.CreatedAt).toLocaleString('vi-VN')}</p>
                </div>
                {w.Status === 'Pending' && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleProcessWithdrawal(w.TransactionID, 'Completed')} className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Duyệt chuyển khoản
                    </button>
                    <button type="button" onClick={() => handleProcessWithdrawal(w.TransactionID, 'Rejected')} className="px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-bold inline-flex items-center gap-1">
                      <XCircle className="w-4 h-4" /> Từ chối (Hoàn ví)
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: CẤU HÌNH SÀN */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="admin-card max-w-xl space-y-4 relative z-10">
          <h2 className="font-bold text-lg text-[#7f1d1d]">⚙️ Cấu hình Phí Hoa Hồng & Phí Vận Chuyển Sàn</h2>
          <div>
            <label className="text-xs font-bold block mb-1">Phần trăm phí hoa hồng sàn (%)</label>
            <input type="number" step="0.5" min="0" max="50" value={settingsMap.CommissionRate} onChange={(e) => setSettingsMap((s) => ({ ...s, CommissionRate: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold block mb-1">Ship Tiết kiệm (đ)</label>
              <input type="number" value={settingsMap.ShippingFeeEconomy} onChange={(e) => setSettingsMap((s) => ({ ...s, ShippingFeeEconomy: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1">Ship Nhanh (đ)</label>
              <input type="number" value={settingsMap.ShippingFeeStandard} onChange={(e) => setSettingsMap((s) => ({ ...s, ShippingFeeStandard: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold block mb-1">Ship Hỏa tốc (đ)</label>
              <input type="number" value={settingsMap.ShippingFeeExpress} onChange={(e) => setSettingsMap((s) => ({ ...s, ShippingFeeExpress: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm" />
            </div>
          </div>
          <button type="submit" className="px-6 py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm">
            Lưu cấu hình toàn sàn
          </button>
        </form>
      )}

      {/* TAB 5: DANH MỤC / TÁC GIẢ / NXB */}
      {activeTab === 'catalog' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 relative z-10">
          {/* Danh mục */}
          <div className="admin-card space-y-3">
            <h3 className="font-bold text-[#7f1d1d]">📂 Danh mục ({categories.length})</h3>
            <div className="flex gap-2">
              <input type="text" placeholder="Tên danh mục mới..." value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="flex-1 px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs" />
              <button
                type="button"
                onClick={async () => {
                  if (!newCategory.trim()) return;
                  await catalogService.createCategory({ categoryName: newCategory });
                  setNewCategory('');
                  loadAll();
                }}
                className="px-3 py-1.5 rounded-lg bg-[#b91c1c] text-amber-100 text-xs font-bold"
              >
                Thêm
              </button>
            </div>
            <ul className="space-y-1.5 text-xs max-h-72 overflow-y-auto">
              {categories.map((c) => (
                <li key={c.CategoryID} className="flex justify-between p-2 rounded-lg bg-amber-50">
                  <span>{c.CategoryName} ({c.BookCount})</span>
                  <button type="button" onClick={async () => { await catalogService.deleteCategory(c.CategoryID); loadAll(); }} className="text-red-600 font-bold">Xóa</button>
                </li>
              ))}
            </ul>
          </div>

          {/* Tác giả */}
          <div className="admin-card space-y-3">
            <h3 className="font-bold text-[#7f1d1d]">✍️ Tác giả ({authors.length})</h3>
            <div className="flex gap-2">
              <input type="text" placeholder="Tên tác giả..." value={newAuthor.authorName} onChange={(e) => setNewAuthor((a) => ({ ...a, authorName: e.target.value }))} className="flex-1 px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs" />
              <button
                type="button"
                onClick={async () => {
                  if (!newAuthor.authorName.trim()) return;
                  await catalogService.createAuthor(newAuthor);
                  setNewAuthor({ authorName: '', bio: '' });
                  loadAll();
                }}
                className="px-3 py-1.5 rounded-lg bg-[#b91c1c] text-amber-100 text-xs font-bold"
              >
                Thêm
              </button>
            </div>
            <ul className="space-y-1.5 text-xs max-h-72 overflow-y-auto">
              {authors.map((a) => (
                <li key={a.AuthorID} className="flex justify-between p-2 rounded-lg bg-amber-50">
                  <span>{a.AuthorName}</span>
                  <button type="button" onClick={async () => { await catalogService.deleteAuthor(a.AuthorID); loadAll(); }} className="text-red-600 font-bold">Xóa</button>
                </li>
              ))}
            </ul>
          </div>

          {/* NXB */}
          <div className="admin-card space-y-3">
            <h3 className="font-bold text-[#7f1d1d]">🏛️ Nhà xuất bản ({publishers.length})</h3>
            <div className="flex gap-2">
              <input type="text" placeholder="Tên NXB mới..." value={newPublisher} onChange={(e) => setNewPublisher(e.target.value)} className="flex-1 px-2.5 py-1.5 rounded-lg border border-amber-300 text-xs" />
              <button
                type="button"
                onClick={async () => {
                  if (!newPublisher.trim()) return;
                  await adminService.createPublisher({ publisherName: newPublisher });
                  setNewPublisher('');
                  loadAll();
                }}
                className="px-3 py-1.5 rounded-lg bg-[#b91c1c] text-amber-100 text-xs font-bold"
              >
                Thêm
              </button>
            </div>
            <ul className="space-y-1.5 text-xs max-h-72 overflow-y-auto">
              {publishers.map((p) => (
                <li key={p.PublisherID} className="flex justify-between p-2 rounded-lg bg-amber-50">
                  <span>{p.PublisherName}</span>
                  <button type="button" onClick={async () => { await adminService.deletePublisher(p.PublisherID); loadAll(); }} className="text-red-600 font-bold">Xóa</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* TAB 6: NHẬT KÝ KIỂM DUYỆT (AUDIT LOGS) */}
      {activeTab === 'audit' && (
        <div className="admin-card space-y-2.5 relative z-10">
          <h2 className="font-bold text-lg text-[#7f1d1d] mb-2">📜 Nhật ký hoạt động Quản lý & Quản trị (Audit Logs)</h2>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-stone-500">Chưa có bản ghi nhật ký nào.</p>
          ) : (
            auditLogs.map((log) => (
              <div key={log.LogID} className="p-3 rounded-xl bg-[#fffaf0] border border-amber-200 text-xs flex flex-wrap justify-between gap-2">
                <div>
                  <span className="font-bold text-[#7f1d1d]">[{log.ActorRole}] {log.ActorName}</span>
                  <span className="mx-1.5 px-2 py-0.5 rounded bg-amber-200 text-amber-950 font-bold">{log.Action}</span>
                  <span className="text-stone-700">{log.Details}</span>
                </div>
                <span className="text-stone-400">{new Date(log.CreatedAt).toLocaleString('vi-VN')}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboardPage;
