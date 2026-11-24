import React, { useMemo } from 'react';
import './TetAuthSceneEffect.css';

/**
 * Hiệu ứng không gian Tết Cổ Truyền rực rỡ riêng cho màn hình Đăng Nhập & Đăng Ký:
 * - Ánh hào quang mặt trời Xuân phía sau form
 * - Cành hoa đào & hoa mai vươn từ 2 góc trên
 * - Đôi đèn lồng đỏ lớn phát sáng đung đưa
 * - Đôi câu đối đỏ thư pháp 2 bên
 * - Cánh hoa mai/đào + bao lì xì + đồng xu vàng rơi lấp lánh
 */
const TetAuthSceneEffect = () => {
  const floatingItems = useMemo(() => {
    const symbols = ['🌼', '🌸', '🧧', '✨', '🌼', '🌸', '🪙', '🌸'];
    return Array.from({ length: 26 }, (_, idx) => ({
      id: idx,
      symbol: symbols[idx % symbols.length],
      left: `${(idx * 29 + 3) % 98}%`,
      delay: `${(idx * 0.65) % 10}s`,
      duration: `${7.5 + (idx % 6) * 1.3}s`,
      size: `${0.95 + (idx % 4) * 0.22}rem`,
    }));
  }, []);

  return (
    <div className="tet-auth-scene" aria-hidden="true">
      {/* Hào quang mặt trời Xuân xoay chậm */}
      <div className="tet-auth-sunburst" />

      {/* Cành hoa đào góc trái trên */}
      <svg className="tet-auth-branch tet-auth-branch-left" viewBox="0 0 260 180" fill="none">
        <path d="M-10 20 C 60 35, 130 55, 220 115" stroke="#5c2818" strokeWidth="6" strokeLinecap="round" />
        <path d="M70 42 C 110 20, 155 15, 200 32" stroke="#5c2818" strokeWidth="4" strokeLinecap="round" />
        <path d="M120 65 C 115 100, 135 125, 168 148" stroke="#5c2818" strokeWidth="3.5" strokeLinecap="round" />
        {/* Hoa đào hồng */}
        <g fill="#fda4af">
          <circle cx="88" cy="34" r="9" />
          <circle cx="152" cy="24" r="10" />
          <circle cx="195" cy="34" r="8" />
          <circle cx="148" cy="80" r="11" />
          <circle cx="205" cy="108" r="9" />
          <circle cx="160" cy="140" r="8" />
        </g>
        <g fill="#fef08a">
          <circle cx="88" cy="34" r="3" />
          <circle cx="152" cy="24" r="3.5" />
          <circle cx="195" cy="34" r="2.8" />
          <circle cx="148" cy="80" r="3.8" />
          <circle cx="205" cy="108" r="3" />
          <circle cx="160" cy="140" r="2.8" />
        </g>
      </svg>

      {/* Cành hoa mai vàng góc phải trên */}
      <svg className="tet-auth-branch tet-auth-branch-right" viewBox="0 0 260 180" fill="none">
        <path d="M270 20 C 200 35, 130 55, 40 115" stroke="#5c2818" strokeWidth="6" strokeLinecap="round" />
        <path d="M190 42 C 150 20, 105 15, 60 32" stroke="#5c2818" strokeWidth="4" strokeLinecap="round" />
        <path d="M140 65 C 145 100, 125 125, 92 148" stroke="#5c2818" strokeWidth="3.5" strokeLinecap="round" />
        {/* Hoa mai vàng */}
        <g fill="#facc15">
          <circle cx="172" cy="34" r="9" />
          <circle cx="108" cy="24" r="10" />
          <circle cx="65" cy="34" r="8" />
          <circle cx="112" cy="80" r="11" />
          <circle cx="55" cy="108" r="9" />
          <circle cx="100" cy="140" r="8" />
        </g>
        <g fill="#b45309">
          <circle cx="172" cy="34" r="3" />
          <circle cx="108" cy="24" r="3.5" />
          <circle cx="65" cy="34" r="2.8" />
          <circle cx="112" cy="80" r="3.8" />
          <circle cx="55" cy="108" r="3" />
          <circle cx="100" cy="140" r="2.8" />
        </g>
      </svg>

      {/* Đôi đèn lồng lớn 2 bên */}
      <div className="tet-auth-lantern tet-auth-lantern-left">
        <div className="tet-auth-lantern-rope" />
        <div className="tet-auth-lantern-cap" />
        <div className="tet-auth-lantern-globe">
          <span>XUÂN</span>
        </div>
        <div className="tet-auth-lantern-cap" />
        <div className="tet-auth-lantern-tassel" />
      </div>

      <div className="tet-auth-lantern tet-auth-lantern-right">
        <div className="tet-auth-lantern-rope" />
        <div className="tet-auth-lantern-cap" />
        <div className="tet-auth-lantern-globe">
          <span>PHÚC</span>
        </div>
        <div className="tet-auth-lantern-cap" />
        <div className="tet-auth-lantern-tassel" />
      </div>

      {/* Đôi câu đối đỏ 2 bên màn hình lớn */}
      <div className="tet-auth-couplet tet-auth-couplet-left">
        <span>CHÚC MỪNG NĂM MỚI AN KHANG</span>
      </div>
      <div className="tet-auth-couplet tet-auth-couplet-right">
        <span>KHAI XUÂN ĐỌC SÁCH VẠN LỘC</span>
      </div>

      {/* Hoa mai, hoa đào, lì xì & xu vàng rơi */}
      {floatingItems.map((item) => (
        <span
          key={item.id}
          className="tet-auth-fall-item"
          style={{
            left: item.left,
            animationDelay: item.delay,
            animationDuration: item.duration,
            fontSize: item.size,
          }}
        >
          {item.symbol}
        </span>
      ))}

      {/* Viền mây lành vàng phía dưới cùng */}
      <div className="tet-auth-bottom-glow" />
    </div>
  );
};

export default TetAuthSceneEffect;
