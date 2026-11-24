import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ArrowLeft, Search } from 'lucide-react';
import './NotFoundPage.css';

const NotFoundPage = () => {
  return (
    <div className="notfound-page max-w-2xl mx-auto px-4 py-20 text-center">
      <div className="notfound-card">
        <div className="notfound-icon">
          <BookOpen className="w-8 h-8 text-[#9b1c1c]" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-[#b45309]">Lỗi 404</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#1f1712] mt-2">
          Không tìm thấy trang bạn yêu cầu
        </h1>
        <p className="text-sm text-stone-600 mt-3 leading-relaxed">
          Đường dẫn có thể đã thay đổi hoặc cuốn sách bạn đang tìm hiện không còn trên kệ. Mời bạn quay lại Trang chủ hoặc duyệt Chợ sách Xuân Đinh Mùi 2027.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <Link to="/" className="notfound-btn-primary">
            <ArrowLeft className="w-4 h-4" /> Về Trang chủ
          </Link>
          <Link to="/shop" className="notfound-btn-secondary">
            <Search className="w-4 h-4" /> Khám phá Chợ sách
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
