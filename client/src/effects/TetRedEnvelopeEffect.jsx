import React from 'react';
import './TetRedEnvelopeEffect.css';

/**
 * Hiệu ứng bao lì xì bay nhẹ mang lộc xuân cho trang Giỏ hàng & Thanh toán
 */
const TetRedEnvelopeEffect = () => {
  const envelopes = [
    { id: 1, left: '6%', delay: '0s', duration: '11s' },
    { id: 2, left: '22%', delay: '3s', duration: '13s' },
    { id: 3, left: '78%', delay: '1.5s', duration: '12s' },
    { id: 4, left: '91%', delay: '4.5s', duration: '10.5s' },
  ];

  return (
    <div className="tet-lixi-layer" aria-hidden="true">
      {envelopes.map((item) => (
        <div
          key={item.id}
          className="tet-lixi-float"
          style={{ left: item.left, animationDelay: item.delay, animationDuration: item.duration }}
        >
          <span className="tet-lixi-flap" />
          <span className="tet-lixi-seal">Lộc</span>
        </div>
      ))}
    </div>
  );
};

export default TetRedEnvelopeEffect;
