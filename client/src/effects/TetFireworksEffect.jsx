import React, { useEffect, useRef } from 'react';
import './TetFireworksEffect.css';

/**
 * Hiệu ứng Pháo Hoa Đêm Giao Thừa nâng cao:
 * - Tên lửa bay vút lên trời có đuôi sáng
 * - Nổ tung nhiều tầng màu sắc rực rỡ (vàng kim, đỏ son, hồng đào, cam lửa)
 * - Bấm chuột bất kỳ đâu trên nền để bắn thêm pháo hoa!
 */
const TetFireworksEffect = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let animId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const palettes = [
      ['#fde047', '#f59e0b', '#fef9c3'],
      ['#fb7185', '#f43f5e', '#fde68a'],
      ['#fb923c', '#facc15', '#ffffff'],
      ['#fda4af', '#fef08a', '#ef4444'],
    ];

    const rockets = [];
    const sparks = [];

    const explode = (x, y) => {
      const palette = palettes[Math.floor(Math.random() * palettes.length)];
      const count = 48;
      for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.16 - 0.08);
        const speed = 1.6 + Math.random() * 4.2;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          decay: 0.011 + Math.random() * 0.01,
          color: palette[i % palette.length],
          size: 1.8 + Math.random() * 2.2,
          trail: [],
        });
      }
      // Vòng sáng trung tâm nổ phụ
      for (let i = 0; i < 16; i += 1) {
        const angle = (Math.PI * 2 * i) / 16;
        const speed = 1.1 + Math.random() * 1.4;
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          decay: 0.018,
          color: '#ffffff',
          size: 1.6,
          trail: [],
        });
      }
    };

    const launchRocket = (targetX, targetY) => {
      const startX = targetX !== undefined ? targetX : width * (0.12 + Math.random() * 0.76);
      const endY = targetY !== undefined ? targetY : height * (0.14 + Math.random() * 0.36);
      rockets.push({
        x: startX,
        y: height + 10,
        vx: (Math.random() - 0.5) * 1.4,
        vy: -(8.5 + Math.random() * 3.5),
        targetY: endY,
        trail: [],
      });
    };

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    const handleClick = (e) => {
      if (e.target.closest('form, button, input, a')) return;
      explode(e.clientX, e.clientY);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('click', handleClick);

    // Bắn sẵn 2 quả ngay lúc vào trang
    setTimeout(() => explode(width * 0.2, height * 0.25), 250);
    setTimeout(() => explode(width * 0.8, height * 0.28), 650);

    let frame = 0;
    const render = () => {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      frame += 1;
      if (frame % 42 === 1) {
        launchRocket();
      }

      // Cập nhật tên lửa bay lên
      for (let i = rockets.length - 1; i >= 0; i -= 1) {
        const r = rockets[i];
        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > 8) r.trail.shift();

        r.x += r.vx;
        r.y += r.vy;
        r.vy += 0.12;

        ctx.beginPath();
        for (let j = 0; j < r.trail.length; j += 1) {
          const pt = r.trail[j];
          if (j === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.75)';
        ctx.lineWidth = 2.4;
        ctx.stroke();

        ctx.fillStyle = '#fef9c3';
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.8, 0, Math.PI * 2);
        ctx.fill();

        if (r.y <= r.targetY || r.vy >= -1.2) {
          explode(r.x, r.y);
          rockets.splice(i, 1);
        }
      }

      // Cập nhật tia pháo hoa tỏa ra
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const s = sparks[i];
        s.trail.push({ x: s.x, y: s.y });
        if (s.trail.length > 5) s.trail.shift();

        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.982;
        s.vy = s.vy * 0.982 + 0.045;
        s.alpha -= s.decay;

        if (s.alpha <= 0) {
          sparks.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = s.alpha * 0.65;
        ctx.beginPath();
        for (let j = 0; j < s.trail.length; j += 1) {
          const pt = s.trail[j];
          if (j === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.size * 0.7;
        ctx.stroke();

        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('click', handleClick);
    };
  }, []);

  return <canvas ref={canvasRef} className="tet-fireworks-canvas" aria-hidden="true" />;
};

export default TetFireworksEffect;
