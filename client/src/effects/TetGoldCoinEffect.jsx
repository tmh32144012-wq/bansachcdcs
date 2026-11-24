import React from 'react';
import './TetGoldCoinEffect.css';

/**
 * Hiệu ứng đồng tiền xu vàng tài lộc nhẹ nhàng cho Kênh Người Bán (Seller Center)
 */
const TetGoldCoinEffect = () => {
  const coins = [
    { id: 1, left: '5%', delay: '0s', duration: '12s' },
    { id: 2, left: '93%', delay: '2.5s', duration: '10.5s' },
    { id: 3, left: '12%', delay: '5s', duration: '14s' },
    { id: 4, left: '88%', delay: '6.5s', duration: '13s' },
  ];

  return (
    <div className="tet-gold-coin-layer" aria-hidden="true">
      {coins.map((c) => (
        <span
          key={c.id}
          className="tet-gold-coin"
          style={{ left: c.left, animationDelay: c.delay, animationDuration: c.duration }}
        >
          <span className="tet-gold-coin-hole" />
        </span>
      ))}
    </div>
  );
};

export default TetGoldCoinEffect;
