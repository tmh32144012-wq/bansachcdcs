import React, { useEffect, useRef } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import './TetCaptcha.css';

const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const generateCaptchaCode = (length = 5) => {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)];
  }
  return code;
};

/**
 * Component Mã xác nhận CAPTCHA phát sinh ngẫu nhiên vẽ bằng Canvas (phong cách giấy Tết)
 */
const TetCaptcha = ({ code, value, onChange, onRefresh, error = '', loading = false }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Nền giấy vàng Tết
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#fef3c7');
    grad.addColorStop(0.5, '#fde68a');
    grad.addColorStop(1, '#fed7aa');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    if (!code) {
      ctx.fillStyle = '#991b1b';
      ctx.font = '700 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(loading ? 'Đang tải mã...' : 'Nhấn Đổi mã', width / 2, height / 2);
      return;
    }

    // Vẽ đường nhiễu chống đọc tự động
    for (let i = 0; i < 6; i += 1) {
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(185, 28, 28, 0.32)' : 'rgba(180, 83, 9, 0.35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(Math.random() * width, Math.random() * height);
      ctx.bezierCurveTo(
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height
      );
      ctx.stroke();
    }

    // Vẽ chấm nhiễu lấp lánh
    for (let i = 0; i < 34; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(153, 27, 27, 0.25)' : 'rgba(217, 119, 6, 0.35)';
      ctx.beginPath();
      ctx.arc(Math.random() * width, Math.random() * height, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Vẽ từng ký tự có xoay nghiêng & màu sắc khác nhau
    const charColors = ['#991b1b', '#7f1d1d', '#b45309', '#be123c', '#9a3412'];
    const step = width / (code.length + 1);
    for (let i = 0; i < code.length; i += 1) {
      const ch = code[i];
      ctx.save();
      const x = step * (i + 1) + (Math.random() * 6 - 3);
      const y = height / 2 + (Math.random() * 8 - 4);
      const angle = (Math.random() * 0.46 - 0.23);
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.font = '800 24px "Playfair Display", Georgia, serif';
      ctx.fillStyle = charColors[i % charColors.length];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
      ctx.shadowBlur = 2;
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    }
  }, [code, loading]);

  return (
    <div className="tet-captcha-wrapper">
      <label className="tet-captcha-label">
        <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
        Mã xác nhận bảo mật (CAPTCHA) *
      </label>

      <div className="tet-captcha-row">
        <canvas
          ref={canvasRef}
          width={168}
          height={46}
          className="tet-captcha-canvas"
          title="Nhấn nút bên cạnh để đổi mã mới"
        />
        <button
          type="button"
          onClick={onRefresh}
          className="tet-captcha-refresh"
          title="Phát sinh mã CAPTCHA ngẫu nhiên mới"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Đổi mã</span>
        </button>
      </div>

      <input
        type="text"
        required
        maxLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="Nhập 5 ký tự hiển thị ở trên..."
        className="tet-captcha-input"
        autoComplete="off"
      />

      {error && <p className="tet-captcha-error">{error}</p>}
    </div>
  );
};

export default TetCaptcha;
