import React, { useMemo } from 'react';
import './TetBlossomsEffect.css';

/**
 * Hiệu ứng hoa mai vàng & hoa đào hồng rơi nhẹ ngày Tết Cổ Truyền
 */
const TetBlossomsEffect = ({ count = 18 }) => {
  const petals = useMemo(() => {
    return Array.from({ length: count }, (_, idx) => {
      const isMai = idx % 2 === 0;
      return {
        id: idx,
        type: isMai ? 'mai' : 'dao',
        left: `${(idx * 37) % 100}%`,
        delay: `${(idx * 0.9) % 11}s`,
        duration: `${9 + (idx % 7) * 1.4}s`,
        size: 14 + (idx % 4) * 4,
      };
    });
  }, [count]);

  return (
    <div className="tet-blossoms-layer" aria-hidden="true">
      {petals.map((p) => (
        <span
          key={p.id}
          className={`tet-petal tet-petal-${p.type}`}
          style={{
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        >
          {p.type === 'mai' ? '🌼' : '🌸'}
        </span>
      ))}
    </div>
  );
};

export default TetBlossomsEffect;
