import React, { useEffect, useRef } from 'react';
import './TetCursorSparkleEffect.css';

/**
 * Hiệu ứng bụi vàng & đốm sáng lấp lánh theo con trỏ chuột (Tết Cổ Truyền)
 */
const TetCursorSparkleEffect = () => {
  const containerRef = useRef(null);

  useEffect(() => {
    let lastTime = 0;

    const handleMove = (e) => {
      const now = Date.now();
      if (now - lastTime < 35) return;
      lastTime = now;

      const container = containerRef.current;
      if (!container) return;

      const dot = document.createElement('span');
      dot.className = 'tet-cursor-sparkle';
      const symbols = ['✦', '✧', '•', '❀'];
      dot.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
      dot.style.setProperty('--dx', `${(Math.random() - 0.5) * 34}px`);
      dot.style.setProperty('--dy', `${-10 - Math.random() * 24}px`);

      container.appendChild(dot);
      setTimeout(() => {
        dot.remove();
      }, 720);
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return <div ref={containerRef} className="tet-cursor-sparkle-layer" aria-hidden="true" />;
};

export default TetCursorSparkleEffect;
