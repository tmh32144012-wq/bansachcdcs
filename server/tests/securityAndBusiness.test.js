const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCaptchaChallenge,
  verifyCaptchaChallenge,
  createSseTicket,
  consumeSseTicket,
  validateImageMagicBytes,
  buildCorsOptions,
} = require('../utils/security');
const { createRateLimiter } = require('../middleware/rateLimit');
const { calcVoucherDiscount, mergeOrderItems } = require('../controllers/orderController');
const { getQrScanBaseUrls } = require('../utils/networkHelper');

test('Server CAPTCHA: xác thực đúng 1 lần và chặn dùng lại (anti-replay)', () => {
  const challenge = createCaptchaChallenge(5);
  assert.equal(challenge.code.length, 5);
  assert.ok(challenge.captchaToken);

  // Nhập sai mã -> từ chối
  const wrong = verifyCaptchaChallenge(challenge.captchaToken, 'ZZZZZ');
  assert.equal(wrong.valid, false);

  // Nhập đúng mã (không phân biệt hoa/thường) -> hợp lệ
  const ok = verifyCaptchaChallenge(challenge.captchaToken, challenge.code.toLowerCase());
  assert.equal(ok.valid, true);

  // Dùng lại token đã tiêu thụ -> bị chặn
  const replay = verifyCaptchaChallenge(challenge.captchaToken, challenge.code);
  assert.equal(replay.valid, false);
});

test('SSE Ticket: dùng 1 lần và không thể tái sử dụng', () => {
  const ticket = createSseTicket(42);
  assert.ok(ticket && ticket.length >= 32);

  assert.equal(consumeSseTicket(ticket), 42);
  assert.equal(consumeSseTicket(ticket), null);
  assert.equal(consumeSseTicket('invalid-ticket'), null);
});

test('Magic Bytes ảnh: chấp nhận ảnh hợp lệ và chặn tệp giả mạo', () => {
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
  const validGif = Buffer.from('GIF89a000000', 'ascii');
  const validWebp = Buffer.from('RIFF1234WEBP', 'ascii');
  const fakeScript = Buffer.from('<script>alert(1)</script>', 'utf8');

  assert.equal(validateImageMagicBytes(validPng, 'image/png'), true);
  assert.equal(validateImageMagicBytes(validJpg, 'image/jpeg'), true);
  assert.equal(validateImageMagicBytes(validGif, 'image/gif'), true);
  assert.equal(validateImageMagicBytes(validWebp, 'image/webp'), true);

  assert.equal(validateImageMagicBytes(fakeScript, 'image/png'), false);
  assert.equal(validateImageMagicBytes(validPng, 'image/jpeg'), false);
});

test('Rate Limiter: cho phép trong ngưỡng và chặn 429 khi vượt ngưỡng', () => {
  const limiter = createRateLimiter({ windowMs: 10000, max: 2, keyPrefix: 'test-rl' });
  let passed = 0;
  let blockedStatus = null;

  const makeReq = () => ({ headers: {}, ip: '127.0.0.9' });
  const makeRes = () => ({
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      blockedStatus = code;
      return { json: () => {} };
    },
  });

  limiter(makeReq(), makeRes(), () => { passed += 1; });
  limiter(makeReq(), makeRes(), () => { passed += 1; });
  limiter(makeReq(), makeRes(), () => { passed += 1; });

  assert.equal(passed, 2);
  assert.equal(blockedStatus, 429);
});

test('CORS Whitelist: cho phép localhost dev và chặn domain lạ', () => {
  const opts = buildCorsOptions();

  opts.origin('http://localhost:5173', (err, allowed) => {
    assert.equal(err, null);
    assert.equal(allowed, true);
  });

  opts.origin('https://evil-site.example', (err) => {
    assert.ok(err instanceof Error);
    assert.match(err.message, /CORS:/);
  });
});

test('Order helpers: gộp bookId trùng và tính giảm giá Voucher chính xác', () => {
  const merged = mergeOrderItems([
    { bookId: 5, quantity: 2 },
    { bookId: '5', quantity: 3 },
    { bookId: 9, quantity: 1 },
  ]);
  assert.equal(merged.valid, true);
  assert.deepEqual(merged.items, [
    { bookId: 5, quantity: 5 },
    { bookId: 9, quantity: 1 },
  ]);

  assert.equal(mergeOrderItems([]).valid, false);
  assert.equal(mergeOrderItems([{ bookId: 1, quantity: 0 }]).valid, false);

  // Voucher phần trăm có trần MaxDiscount
  const percentVoucher = { DiscountType: 'Percent', DiscountValue: 20, MaxDiscount: 30000, MinOrderValue: 100000 };
  assert.equal(calcVoucherDiscount(percentVoucher, 90000), 0);
  assert.equal(calcVoucherDiscount(percentVoucher, 120000), 24000);
  assert.equal(calcVoucherDiscount(percentVoucher, 300000), 30000);

  // Voucher cố định không vượt quá giá trị đơn
  const fixedVoucher = { DiscountType: 'Fixed', DiscountValue: 50000, MinOrderValue: 0 };
  assert.equal(calcVoucherDiscount(fixedVoucher, 35000), 35000);
});

test('QR Payment URL helper & ISO QR Matrix generator: sinh ma trận QR hợp lệ cho link điện thoại', async () => {
  const urls = getQrScanBaseUrls({ protocol: 'http' });
  assert.ok(urls.localBaseUrl.startsWith('http://localhost:'));
  assert.ok(urls.lanBaseUrl.startsWith('http://'));

  const { generateQrMatrix } = await import('../../client/src/utils/qrCodeGenerator.js');
  const sampleUrl = 'http://192.168.1.15:5000/api/orders/qr-pay/a1b2c3d4e5f6a7b8c9d0e1f2';
  const qr = generateQrMatrix(sampleUrl);

  assert.equal(qr.version, 4); // 66 byte -> Version 4 (33x33)
  assert.equal(qr.size, 33);
  assert.equal(qr.matrix.length, 33);
  assert.equal(qr.matrix[0].length, 33);

  // Kiểm tra 3 góc Finder Pattern (7x7) và Dark Module chuẩn ISO
  assert.equal(qr.matrix[0][0], true);
  assert.equal(qr.matrix[3][3], true);
  assert.equal(qr.matrix[0][qr.size - 1], true);
  assert.equal(qr.matrix[qr.size - 1][0], true);
  assert.equal(qr.matrix[4 * qr.version + 9][8], true);

  // Kiểm tra Timing Pattern (hàng 6 xen kẽ đen/trắng)
  assert.equal(qr.matrix[6][8], true);
  assert.equal(qr.matrix[6][9], false);
  assert.equal(qr.matrix[6][10], true);
});
