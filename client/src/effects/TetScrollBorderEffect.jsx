import React from 'react';
import './TetScrollBorderEffect.css';

/**
 * Hiệu ứng dải câu đối đỏ Tết cổ truyền trang trí 2 mép màn hình
 * (dành cho trang Chi tiết sách, Đơn hàng, Quản lý, Chat)
 */
const TetScrollBorderEffect = ({
  leftCouplet = 'XUÂN AN KHANG THỊNH VƯỢNG',
  rightCouplet = 'ĐỌC SÁCH HAY KHAI TRÍ TUỆ',
}) => {
  return (
    <div className="tet-couplet-layer" aria-hidden="true">
      <div className="tet-couplet-banner tet-couplet-left">
        <span className="tet-couplet-rod" />
        <p className="tet-couplet-text">{leftCouplet}</p>
        <span className="tet-couplet-rod" />
      </div>
      <div className="tet-couplet-banner tet-couplet-right">
        <span className="tet-couplet-rod" />
        <p className="tet-couplet-text">{rightCouplet}</p>
        <span className="tet-couplet-rod" />
      </div>
    </div>
  );
};

export default TetScrollBorderEffect;
