import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flame, Store, Sparkles, Tag, ArrowRight, Heart, CheckCircle2, Users, BookOpen } from 'lucide-react';
import { bookService, shopService, voucherService, catalogService, formatVND } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import BookCard from '../../components/BookCard/BookCard';
import TetBlossomsEffect from '../../effects/TetBlossomsEffect';
import TetLanternsEffect from '../../effects/TetLanternsEffect';
import './HomePage.css';

const HomePage = () => {
  const { isAuthenticated } = useAuth();
  const { followedShopIds, toggleFollowShop } = useRealtime();
  const navigate = useNavigate();

  const [flashBooks, setFlashBooks] = useState([]);
  const [featuredBooks, setFeaturedBooks] = useState([]);
  const [shops, setShops] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [copiedCode, setCopiedCode] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const [flashRes, bookRes, shopRes, voucherRes, catRes] = await Promise.all([
          bookService.getBooks({ flashSale: 'true', limit: 4 }),
          bookService.getBooks({ limit: 8, sort: 'bestselling' }),
          shopService.getPublicShops(),
          voucherService.getVouchers(),
          catalogService.getCategories(),
        ]);
        setFlashBooks(flashRes.data?.data || []);
        setFeaturedBooks(bookRes.data?.data || []);
        setShops(shopRes.data?.data || []);
        setVouchers((voucherRes.data?.data || []).slice(0, 4));
        setCategories(catRes.data?.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadHomeData();
  }, []);

  const handleCopyVoucher = (code) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2000);
  };

  const handleFollow = async (shopId) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      const res = await toggleFollowShop(shopId);
      setShops((prev) =>
        prev.map((s) => (s.ShopID === shopId ? { ...s, FollowerCount: res.followerCount } : s))
      );
    } catch (_) {}
  };

  return (
    <div className="home-tet-page relative">
      {/* Giữ nhẹ không khí Tết tinh tế trên Trang chủ: hoa rơi thưa + đôi đèn lồng */}
      <TetBlossomsEffect count={10} />
      <TetLanternsEffect leftChar="Phúc" rightChar="Lộc" />

      {/* HERO BANNER TẾT CỔ TRUYỀN TINH TẾ */}
      <section className="home-hero-banner">
        <div className="max-w-7xl mx-auto px-4 py-12 md:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          <div className="lg:col-span-7 space-y-5">
            <span className="home-tet-eyebrow">
              Hội Sách Xuân Đinh Mùi 2027 • Sàn Sách Đa Gian Hàng
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-[#fff8eb] leading-tight">
              Khai Xuân Tri Thức <br />
              <span className="text-[#e6c67c]">Gieo Lộc Sách Hay</span>
            </h1>
            <p className="text-[#f5ead6]/90 text-sm sm:text-base max-w-xl leading-relaxed">
              Mua bán sách mới, sách cũ tuyển chọn và ấn phẩm quý từ hàng trăm hiệu sách uy tín trên toàn quốc.
              Thanh toán QR an toàn (Escrow) hoặc COD, theo dõi hành trình vận chuyển từng chặng.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/shop" className="home-cta-gold">
                Khám phá Chợ Sách <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/seller" className="home-cta-outline">
                <Store className="w-4 h-4" /> Mở Gian Hàng Bán Sách
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="home-couplet-card">
              <div className="text-center border-b border-amber-200/20 pb-3 mb-4">
                <span className="text-[11px] uppercase tracking-[0.16em] text-[#e6c67c] font-semibold">Lì Xì Đầu Xuân VitaBook</span>
                <h3 className="font-serif text-xl font-bold text-[#fff8eb] mt-1">Ưu Đãi Khai Xuân Đang Mở</h3>
              </div>
              <div className="space-y-2.5">
                {vouchers.map((v) => (
                  <div key={v.VoucherID} className="home-voucher-mini">
                    <div>
                      <p className="text-xs font-bold text-[#f3dca8] flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" /> {v.Code}
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px]">{v.Scope}</span>
                      </p>
                      <p className="text-xs text-[#f5ead6]/80 mt-0.5">{v.Title}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyVoucher(v.Code)}
                      className="px-3 py-1.5 rounded-lg bg-[#d4a346] text-[#2b0c0c] text-xs font-bold hover:bg-[#e1b45a] shrink-0"
                    >
                      {copiedCode === v.Code ? 'Đã chép' : 'Lưu mã'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-12 relative z-10">
        {/* DANH MỤC SÁCH */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-[#1f1712]">Danh Mục Sách Mùa Xuân</h2>
            <Link to="/shop" className="text-sm font-semibold text-[#9b1c1c] hover:underline flex items-center gap-1">
              Xem tất cả <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {categories.map((cat) => (
              <Link
                key={cat.CategoryID}
                to={`/shop?category=${cat.CategoryID}`}
                className="home-category-card"
              >
                <BookOpen className="w-5 h-5 text-[#9b1c1c] mb-2" />
                <span className="text-xs font-semibold text-[#1f1712] text-center line-clamp-2">{cat.CategoryName}</span>
                <span className="text-[11px] text-stone-500 mt-0.5">{cat.BookCount} cuốn</span>
              </Link>
            ))}
          </div>
        </section>

        {/* FLASH SALE TẾT */}
        {flashBooks.length > 0 && (
          <section className="home-flash-section">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5 pb-3 border-b border-[#efe6d9]">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-[#fdf2f2] border border-[#f5c2c2] text-[#9b1c1c]">
                  <Flame className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="text-2xl font-bold text-[#1f1712]">Flash Sale Khai Xuân</h2>
                  <p className="text-xs text-stone-500">Ưu đãi giới hạn theo khung giờ đầu năm Đinh Mùi 2027</p>
                </div>
              </div>
              <Link to="/shop?flashSale=true" className="text-sm font-semibold text-[#9b1c1c] hover:underline flex items-center gap-1">
                Xem toàn bộ ưu đãi <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {flashBooks.map((book) => (
                <BookCard key={book.BookID} book={book} />
              ))}
            </div>
          </section>
        )}

        {/* GIAN HÀNG UY TÍN */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-2xl font-bold text-[#1f1712]">Gian Hàng Sách Nổi Bật</h2>
              <p className="text-xs text-stone-500 mt-0.5">Theo dõi hiệu sách yêu thích để nhận thông báo khi có ấn phẩm mới</p>
            </div>
            <Link to="/favorites" className="text-sm font-semibold text-[#9b1c1c] hover:underline flex items-center gap-1">
              Shop đang theo dõi <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {shops.map((shop) => {
              const isFollowing = followedShopIds.has(shop.ShopID);
              return (
                <div key={shop.ShopID} className="home-shop-card">
                  <div className="flex items-start gap-3">
                    <img
                      src={shop.LogoUrl || 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=200&q=80'}
                      alt={shop.ShopName}
                      className="w-14 h-14 rounded-xl object-cover border border-[#e2d4c1] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <Link to={`/shops/${shop.ShopID}`} className="font-bold text-base text-[#1f1712] hover:text-[#9b1c1c] line-clamp-1">
                        {shop.ShopName}
                      </Link>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[#fbf6ec] border border-[#e5cfa8] text-[#854d0e]">
                        {shop.ShopType === 'Official' ? 'Mall Chính Hãng' : shop.ShopType === 'Bookstore' ? 'Hiệu Sách Uy Tín' : 'Nhà Bán Cá Nhân'}
                      </span>
                      <p className="text-xs text-stone-600 line-clamp-2 mt-1.5">{shop.Description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#efe7dc] text-xs text-stone-600">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <BookOpen className="w-3.5 h-3.5 text-stone-400" /> {shop.BookCount} sách
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium">
                        <Users className="w-3.5 h-3.5 text-stone-400" /> {shop.FollowerCount} theo dõi
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFollow(shop.ShopID)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition inline-flex items-center gap-1 ${
                        isFollowing
                          ? 'bg-[#fbf6ec] text-[#9b1c1c] border border-[#dfc99f]'
                          : 'bg-[#9b1c1c] text-white hover:bg-[#7f1d1d]'
                      }`}
                    >
                      {isFollowing ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Heart className="w-3.5 h-3.5" />}
                      {isFollowing ? 'Đang theo dõi' : 'Theo dõi'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SÁCH BÁN CHẠY TOÀN SÀN */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold text-[#1f1712]">Tủ Sách Đọc Nhiều Dịp Tết</h2>
            <Link to="/shop" className="text-sm font-semibold text-[#9b1c1c] hover:underline flex items-center gap-1">
              Xem thêm <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {loading ? (
            <p className="text-center py-12 text-stone-500">Đang tải tủ sách Tết...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {featuredBooks.map((book) => (
                <BookCard key={book.BookID} book={book} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HomePage;
