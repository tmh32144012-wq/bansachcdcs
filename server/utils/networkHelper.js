const os = require('os');

const VIRTUAL_IFACE_PATTERN = /(virtual|vmware|vbox|hyper-v|vethernet|wsl|docker|loopback|tailscale|zerotier|hamachi|bluetooth)/i;

/**
 * Tự động tìm địa chỉ IPv4 nội bộ (Wi-Fi / LAN) của máy tính để điện thoại cùng mạng Wi-Fi
 * có thể quét mã QR và gọi thẳng tới Backend (thay vì localhost vốn không truy cập được từ điện thoại).
 */
const detectLanIpv4 = () => {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!Array.isArray(addrs)) continue;
    const isVirtual = VIRTUAL_IFACE_PATTERN.test(name);

    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue; // link-local APIPA

      let score = 0;
      if (!isVirtual) score += 50;
      if (/wi-?fi|wlan|wireless/i.test(name)) score += 30;
      else if (/ethernet|en\d|eth\d/i.test(name)) score += 20;

      if (addr.address.startsWith('192.168.')) score += 15;
      else if (addr.address.startsWith('10.')) score += 10;
      else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(addr.address)) score += 8;

      candidates.push({ name, address: addr.address, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address || null;
};

/**
 * Trả về URL gốc dùng để tạo QR (ưu tiên PUBLIC_SERVER_URL -> IP LAN Wi-Fi -> request host)
 */
const getQrScanBaseUrls = (req) => {
  const port = process.env.PORT || 5000;
  const protocol = req?.protocol || 'http';
  const localBaseUrl = `${protocol}://localhost:${port}`;

  if (process.env.PUBLIC_SERVER_URL && process.env.PUBLIC_SERVER_URL.trim()) {
    const pub = process.env.PUBLIC_SERVER_URL.trim().replace(/\/+$/, '');
    return { lanBaseUrl: pub, localBaseUrl, detectedIp: null };
  }

  const detectedIp = detectLanIpv4();
  const lanBaseUrl = detectedIp ? `${protocol}://${detectedIp}:${port}` : localBaseUrl;
  return { lanBaseUrl, localBaseUrl, detectedIp };
};

module.exports = {
  detectLanIpv4,
  getQrScanBaseUrls,
};
