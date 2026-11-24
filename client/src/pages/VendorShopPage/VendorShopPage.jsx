import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, CheckCircle2, MessageCircle, MapPin, Star, Tag, BookOpen } from 'lucide-react';
import { shopService, chatService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import BookCard from '../../components/BookCard/BookCard';
import TetLanternsEffect from '../../effects/TetLanternsEffect';
import './VendorShopPage.css';

const VendorShopPage = () => {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { followedShopIds, toggleFollowShop } = useRealtime();

  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState('');

  useEffect(() => {
    const loadShop = async () => {
      try {
        const res = await shopService.getShopById(shopId);
        setShop(res.data?.data || null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadShop();
  }, [shopId]);

  if (loading) return <div className="py-20 text-center text-stone-500">Đang tải Gian hàng...</div>;
  if (!shop) return <div className="py-20 text-center font-bold text-[#7f1d1d]">Không tìm thấy Gian hàng này.</div>;

  const isFollowing = followedShopIds.has(shop.ShopID) || shop.isFollowing;

  const handleFollow = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      const res = await toggleFollowShop(shop.ShopID);
      setShop((prev) => ({
        ...prev,
        FollowerCount: res.followerCount,
        isFollowing: res.isFollowing,
      }));
    } catch (_) {}
  };

  const handleChat = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      const res = await chatService.startConversation(shop.ShopID);
      navigate(`/chat?conversationId=${res.data?.data?.ConversationID}`);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thể bắt đầu trò chuyện.');
    }
  };

  return (
    <div className="vendor-shop-page max-w-7xl mx-auto px-4 py-8 relative">
      <TetLanternsEffect leftChar="Tài" rightChar="Lộc" />

      {/* Header Gian hàng */}
      <div className="vendor-shop-banner relative z-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <img
              src={shop.LogoUrl || 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=200&q=80'}
              alt={shop.ShopName}
              className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-300 shadow-lg"
            />
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-[#450a0a] text-[11px] font-extrabold">
                {shop.ShopType === 'Official' ? 'VitaBook Mall' : shop.ShopType === 'Bookstore' ? 'Hiệu Sách Uy Tín' : 'Gian Hàng Cá Nhân'}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#fef3c7] mt-1">{shop.ShopName}</h1>
              <p className="text-xs text-amber-200 flex items-center gap-1 mt-1">
                <MapPin className="w-3.5 h-3.5" /> {shop.PickupAddress}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleFollow}
              className={`px-5 py-2.5 rounded-xl font-extrabold text-sm inline-flex items-center gap-2 transition ${
                isFollowing
                  ? 'bg-amber-200 text-[#5c0b0b]'
                  : 'bg-amber-400 text-[#450a0a] hover:bg-amber-300'
              }`}
            >
              {isFollowing ? <CheckCircle2 className="w-4 h-4" /> : <Heart className="w-4 h-4" />}
              {isFollowing ? 'Đang theo dõi' : '+ Theo dõi Shop'}
            </button>
            <button
              type="button"
              onClick={handleChat}
              className="px-5 py-2.5 rounded-xl border border-amber-300 text-amber-100 font-bold text-sm hover:bg-white/10 inline-flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" /> Chat ngay
            </button>
          </div>
        </div>

        <p className="text-sm text-amber-100/90 mt-4 max-w-3xl">{shop.Description}</p>

        <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-amber-400/30 max-w-lg text-center">
          <div>
            <p className="text-xl font-extrabold text-amber-300">{shop.BookCount}</p>
            <p className="text-xs text-amber-100/80">Đầu sách đang bán</p>
          </div>
          <div>
            <p className="text-xl font-extrabold text-amber-300">{shop.FollowerCount}</p>
            <p className="text-xs text-amber-100/80">Người theo dõi</p>
          </div>
          <div>
            <p className="text-xl font-extrabold text-amber-300 inline-flex items-center gap-1">
              <Star className="w-4 h-4 fill-amber-300" /> {shop.AvgRating}
            </p>
            <p className="text-xs text-amber-100/80">Đánh giá Shop</p>
          </div>
        </div>
      </div>

      {/* Voucher riêng của Shop */}
      {shop.vouchers?.length > 0 && (
        <section className="mt-6 relative z-10">
          <h2 className="text-lg font-bold text-[#7f1d1d] mb-3">🧧 Mã giảm giá riêng của Gian hàng</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {shop.vouchers.map((v) => (
              <div key={v.VoucherID} className="vendor-voucher-card">
                <div>
                  <p className="text-sm font-extrabold text-[#b91c1c] inline-flex items-center gap-1">
                    <Tag className="w-4 h-4" /> {v.Code}
                  </p>
                  <p className="text-xs text-stone-700 mt-0.5">{v.Title}</p>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Đơn tối thiểu {Number(v.MinOrderValue).toLocaleString('vi-VN')}đ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(v.Code);
                    setCopiedCode(v.Code);
                    setTimeout(() => setCopiedCode(''), 1800);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#b91c1c] text-amber-100 text-xs font-bold shrink-0"
                >
                  {copiedCode === v.Code ? 'Đã lưu' : 'Sao chép'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Danh sách sách của Shop */}
      <section className="mt-8 relative z-10">
        <h2 className="text-xl font-bold text-[#7f1d1d] mb-4 flex items-center gap-2">
          <BookOpen className="w-5 h-5" /> Sách đang bày bán ({shop.books?.length || 0})
        </h2>
        {shop.books?.length === 0 ? (
          <p className="p-10 text-center bg-white rounded-2xl border border-amber-200 text-stone-500">
            Gian hàng chưa có cuốn sách nào được mở bán.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {shop.books.map((book) => (
              <BookCard key={book.BookID} book={book} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default VendorShopPage;
