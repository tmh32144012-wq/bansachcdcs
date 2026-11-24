import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ShoppingCart, Star, Store, Flame } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import { formatVND } from '../../services/api';
import './BookCard.css';

const BookCard = ({ book }) => {
  const { addToCart } = useCart();
  const { isAuthenticated } = useAuth();
  const { wishlistIds, toggleWishlist } = useRealtime();
  const navigate = useNavigate();

  const isWishlisted = wishlistIds.has(book.BookID);
  const isFlashActive =
    book.IsFlashSale &&
    book.FlashSalePrice !== null &&
    book.FlashSalePrice !== undefined &&
    (!book.FlashSaleEnd || new Date(book.FlashSaleEnd) > new Date());

  const finalPrice = isFlashActive
    ? Number(book.FlashSalePrice)
    : book.DiscountPrice !== null && book.DiscountPrice !== undefined
      ? Number(book.DiscountPrice)
      : Number(book.Price);

  const discountPercent =
    Number(book.Price) > finalPrice
      ? Math.round(((Number(book.Price) - finalPrice) / Number(book.Price)) * 100)
      : 0;

  const handleToggleWishlist = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      await toggleWishlist(book.BookID);
    } catch (_) {}
  };

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (book.Stock > 0) {
      addToCart(book, 1);
    }
  };

  return (
    <div className="tet-book-card group">
      <Link to={`/books/${book.BookID}`} className="block relative overflow-hidden bg-amber-50 aspect-[3/4]">
        <img
          src={book.CoverImage || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=600&q=80'}
          alt={book.Title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Badge giảm giá / Flash Sale */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          {isFlashActive && (
            <span className="tet-badge-flash">
              <Flame className="w-3 h-3" /> Flash Sale
            </span>
          )}
          {discountPercent > 0 && <span className="tet-badge-discount">-{discountPercent}%</span>}
        </div>

        {/* Badge tình trạng sách */}
        {book.BookCondition && book.BookCondition !== 'Mới 100%' && (
          <span className="tet-badge-condition">{book.BookCondition}</span>
        )}

        {/* Nút yêu thích */}
        <button
          type="button"
          onClick={handleToggleWishlist}
          className={`tet-wishlist-btn ${isWishlisted ? 'is-active' : ''}`}
          title={isWishlisted ? 'Bỏ yêu thích' : 'Thêm vào sách yêu thích'}
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-current' : ''}`} />
        </button>
      </Link>

      <div className="p-3.5 flex flex-col flex-1">
        {/* Tên Shop */}
        <Link
          to={`/shops/${book.ShopID || 1}`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:text-[#b91c1c] mb-1 truncate"
        >
          <Store className="w-3 h-3 shrink-0" />
          <span className="truncate">{book.ShopName || 'VitaBook Mall'}</span>
        </Link>

        <Link to={`/books/${book.BookID}`} className="font-bold text-sm text-[#3b1510] hover:text-[#b91c1c] line-clamp-2 min-h-[2.5rem]">
          {book.Title}
        </Link>

        <p className="text-xs text-stone-500 truncate mt-0.5">{book.AuthorNames || 'Nhiều tác giả'}</p>

        {/* Đánh giá & Đã bán */}
        <div className="flex items-center justify-between text-[11px] text-stone-500 mt-2">
          <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
            {book.AvgRating > 0 ? book.AvgRating : '5.0'}
          </span>
          <span>Đã bán {book.SoldCount || 0}</span>
        </div>

        {/* Giá & Nút thêm giỏ */}
        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-base font-extrabold text-[#b91c1c]">{formatVND(finalPrice)}</p>
            {Number(book.Price) > finalPrice && (
              <p className="text-[11px] text-stone-400 line-through">{formatVND(book.Price)}</p>
            )}
          </div>
          <button
            type="button"
            disabled={book.Stock <= 0}
            onClick={handleAddToCart}
            className="tet-cart-mini-btn"
            title={book.Stock > 0 ? 'Thêm vào giỏ hàng' : 'Hết hàng'}
          >
            <ShoppingCart className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BookCard;
