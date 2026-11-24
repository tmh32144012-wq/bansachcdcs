import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Store, Users, Star, BookOpen, UserMinus } from 'lucide-react';
import { socialService } from '../../services/api';
import { useRealtime } from '../../context/RealtimeContext';
import BookCard from '../../components/BookCard/BookCard';
import TetBlossomsEffect from '../../effects/TetBlossomsEffect';
import './FavoritesPage.css';

const FavoritesPage = () => {
  const { toggleFollowShop } = useRealtime();
  const [activeTab, setActiveTab] = useState('shops');
  const [followedShops, setFollowedShops] = useState([]);
  const [wishlistBooks, setWishlistBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadFavorites = async () => {
    try {
      const [shopRes, bookRes] = await Promise.all([
        socialService.getFollowedShops(),
        socialService.getWishlist(),
      ]);
      setFollowedShops(shopRes.data?.data || []);
      setWishlistBooks(bookRes.data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  const handleUnfollow = async (shopId) => {
    await toggleFollowShop(shopId);
    setFollowedShops((prev) => prev.filter((s) => s.ShopID !== shopId));
  };

  return (
    <div className="favorites-tet-page max-w-7xl mx-auto px-4 py-8 relative">
      <TetBlossomsEffect count={12} />

      <div className="favorites-header mb-6 relative z-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#fef3c7]">❤️ Shop Theo Dõi & Sách Yêu Thích</h1>
          <p className="text-xs sm:text-sm text-amber-200 mt-1">
            Nhận thông báo tự động mỗi khi hiệu sách bạn theo dõi đăng bán cuốn sách mới
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('shops')}
            className={`favorites-tab-btn ${activeTab === 'shops' ? 'is-active' : ''}`}
          >
            <Store className="w-4 h-4" /> Shop đang theo dõi ({followedShops.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('books')}
            className={`favorites-tab-btn ${activeTab === 'books' ? 'is-active' : ''}`}
          >
            <Heart className="w-4 h-4" /> Sách yêu thích ({wishlistBooks.length})
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-16 text-stone-500">Đang tải danh sách...</p>
      ) : activeTab === 'shops' ? (
        followedShops.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-amber-200 relative z-10">
            <p className="font-bold text-[#7f1d1d]">Bạn chưa theo dõi Gian hàng nào</p>
            <Link to="/" className="inline-block mt-3 px-5 py-2 rounded-xl bg-[#b91c1c] text-amber-100 text-sm font-bold">
              Khám phá các Gian hàng nổi bật
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 relative z-10">
            {followedShops.map((shop) => (
              <div key={shop.ShopID} className="favorites-shop-card">
                <div className="flex items-start gap-3">
                  <img
                    src={shop.LogoUrl || 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=200&q=80'}
                    alt={shop.ShopName}
                    className="w-14 h-14 rounded-xl object-cover border-2 border-amber-400"
                  />
                  <div className="flex-1 min-w-0">
                    <Link to={`/shops/${shop.ShopID}`} className="font-bold text-base text-[#7f1d1d] hover:underline line-clamp-1">
                      {shop.ShopName}
                    </Link>
                    <p className="text-xs text-stone-600 line-clamp-2 mt-1">{shop.Description}</p>
                    <div className="flex items-center gap-3 text-xs text-amber-800 font-semibold mt-2">
                      <span className="inline-flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {shop.BookCount} sách</span>
                      <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {shop.FollowerCount}</span>
                      <span className="inline-flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400" /> {shop.AvgRating}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-amber-100 flex justify-between gap-2">
                  <Link
                    to={`/shops/${shop.ShopID}`}
                    className="flex-1 text-center py-2 rounded-xl bg-[#b91c1c] text-amber-100 text-xs font-bold hover:bg-[#991b1b]"
                  >
                    Ghé thăm Gian hàng
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleUnfollow(shop.ShopID)}
                    className="px-3 py-2 rounded-xl border border-amber-300 text-stone-600 hover:text-red-600 text-xs font-bold inline-flex items-center gap-1"
                  >
                    <UserMinus className="w-3.5 h-3.5" /> Bỏ theo dõi
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : wishlistBooks.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-amber-200 relative z-10">
          <p className="font-bold text-[#7f1d1d]">Chưa có cuốn sách yêu thích nào</p>
          <Link to="/shop" className="inline-block mt-3 px-5 py-2 rounded-xl bg-[#b91c1c] text-amber-100 text-sm font-bold">
            Đi thả tim sách hay
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 relative z-10">
          {wishlistBooks.map((book) => (
            <BookCard key={book.BookID} book={book} />
          ))}
        </div>
      )}
    </div>
  );
};

export default FavoritesPage;
