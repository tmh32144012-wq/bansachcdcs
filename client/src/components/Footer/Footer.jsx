import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Store, ShieldCheck, Truck } from 'lucide-react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="tet-footer">
      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-6 h-6 text-amber-300" />
            <span className="font-serif text-xl font-bold text-amber-100">VitaBook Xuân</span>
          </div>
          <p className="text-sm text-amber-100/80 leading-relaxed">
            Sàn thương mại điện tử đa gian hàng chuyên biệt về Sách — kết nối nhà xuất bản, hiệu sách uy tín và cộng đồng yêu sách khắp Việt Nam.
          </p>
        </div>

        <div>
          <h4 className="tet-footer-heading">Khám phá sàn sách</h4>
          <ul className="space-y-2 text-sm text-amber-100/80">
            <li><Link to="/shop" className="hover:text-amber-300">Tất cả đầu sách</Link></li>
            <li><Link to="/shop?flashSale=true" className="hover:text-amber-300">Flash Sale Khai Xuân</Link></li>
            <li><Link to="/favorites" className="hover:text-amber-300">Shop theo dõi & Yêu thích</Link></li>
            <li><Link to="/orders" className="hover:text-amber-300">Theo dõi hành trình đơn</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="tet-footer-heading">Dành cho đối tác</h4>
          <ul className="space-y-2 text-sm text-amber-100/80">
            <li><Link to="/seller" className="hover:text-amber-300 flex items-center gap-1.5"><Store className="w-4 h-4" /> Đăng ký mở Gian hàng</Link></li>
            <li><Link to="/manager" className="hover:text-amber-300 flex items-center gap-1.5"><Truck className="w-4 h-4" /> Kiểm duyệt & Vận chuyển</Link></li>
            <li><Link to="/admin" className="hover:text-amber-300 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Quản trị hệ thống</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="tet-footer-heading">Cam kết ngày Tết</h4>
          <div className="tet-footer-blessing">
            <p className="font-serif font-bold text-[#e6c67c] text-base">Chúc Mừng Năm Mới Đinh Mùi 2027</p>
            <p className="text-xs text-[#f5ead6]/80 mt-1 leading-relaxed">
              An Khang Thịnh Vượng — Vạn Sự Như Ý. Hỗ trợ thanh toán trước bằng mã QR an toàn (Escrow) hoặc COD khi nhận sách.
            </p>
          </div>
        </div>
      </div>
      <div className="tet-footer-bottom">
        © {new Date().getFullYear()} VitaBook Marketplace • Node.js + React.js + SQL Server
      </div>
    </footer>
  );
};

export default Footer;
