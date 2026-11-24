import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Heart,
  Store,
  MessageCircle,
  BookOpen,
  Star,
  CheckCircle2,
  Flag,
  X,
  Tag,
  ShieldCheck,
  HelpCircle,
  Send,
  Trash2,
} from 'lucide-react';
import {
  bookService,
  chatService,
  reviewService,
  questionService,
  uploadFilesToServer,
  formatVND,
} from '../../services/api';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import './BookDetailPage.css';

const BookDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user, isAuthenticated } = useAuth();
  const { wishlistIds, followedShopIds, toggleWishlist, toggleFollowShop } = useRealtime();

  const [book, setBook] = useState(null);
  const [selectedImage, setSelectedImage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [replyTexts, setReplyTexts] = useState({});
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  // Đánh giá trực tiếp trên trang chi tiết sách (nếu đã mua & nhận hàng)
  const [eligibleOrders, setEligibleOrders] = useState([]);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '', images: [] });
  const [submittingReview, setSubmittingReview] = useState(false);

  // Hỏi đáp sản phẩm (Q&A công khai)
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [askingQuestion, setAskingQuestion] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState({});

  const loadBook = async () => {
    try {
      const [bookRes, qRes] = await Promise.all([
        bookService.getBookById(id),
        questionService.getBookQuestions(id).catch(() => ({ data: { data: [] } })),
      ]);
      const data = bookRes.data?.data;
      setBook(data);
      setSelectedImage(data?.CoverImage || data?.galleryImages?.[0] || '');
      setQuestions(qRes.data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBook();
  }, [id]);

  useEffect(() => {
    if (!isAuthenticated || !id) {
      setEligibleOrders([]);
      return;
    }
    reviewService
      .getEligibleOrders(id)
      .then((res) => setEligibleOrders(res.data?.data?.eligibleOrders || []))
      .catch(() => setEligibleOrders([]));
  }, [isAuthenticated, id]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  if (loading) {
    return <div className="py-20 text-center text-stone-500">Đang tải thông tin sách...</div>;
  }

  if (!book) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <p className="text-xl font-bold text-[#7f1d1d]">Không tìm thấy cuốn sách này.</p>
        <Link to="/shop" className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold">
          Quay lại Chợ Sách
        </Link>
      </div>
    );
  }

  const allImages = [...new Set([book.CoverImage, ...(book.galleryImages || [])].filter(Boolean))];
  const isWishlisted = wishlistIds.has(book.BookID);
  const isFollowingShop = followedShopIds.has(book.ShopID);
  const isFlashActive =
    book.IsFlashSale &&
    book.FlashSalePrice !== null &&
    (!book.FlashSaleEnd || new Date(book.FlashSaleEnd) > new Date());
  const finalPrice = isFlashActive
    ? Number(book.FlashSalePrice)
    : book.DiscountPrice !== null && book.DiscountPrice !== undefined
      ? Number(book.DiscountPrice)
      : Number(book.Price);

  const handleChatShop = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      const res = await chatService.startConversation(book.ShopID);
      const convId = res.data?.data?.ConversationID;
      navigate(convId ? `/chat?conversationId=${convId}` : '/chat');
    } catch (err) {
      showToast(err.response?.data?.message || 'Không thể mở hội thoại với Shop.');
    }
  };

  const handleFollowShop = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    try {
      const data = await toggleFollowShop(book.ShopID);
      setBook((prev) => ({ ...prev, ShopFollowerCount: data.followerCount }));
      showToast(data.isFollowing ? `Đã theo dõi ${book.ShopName}!` : 'Đã bỏ theo dõi Shop.');
    } catch (_) {}
  };

  const handleReplyReview = async (reviewId) => {
    const content = replyTexts[reviewId];
    if (!content?.trim()) return;
    try {
      await reviewService.replyReview(reviewId, content);
      setReplyTexts((prev) => ({ ...prev, [reviewId]: '' }));
      showToast('Đã gửi phản hồi đánh giá!');
      loadBook();
    } catch (err) {
      showToast(err.response?.data?.message || 'Không thể phản hồi.');
    }
  };

  const handleReportReview = async (reviewId) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    const reason = window.prompt('Nhập lý do báo cáo đánh giá vi phạm này:');
    if (!reason) return;
    try {
      await reviewService.reportReview(reviewId, reason);
      showToast('Đã gửi báo cáo lên Quản lý kiểm duyệt.');
    } catch (err) {
      showToast(err.response?.data?.message || 'Lỗi gửi báo cáo.');
    }
  };

  const handleSubmitInlineReview = async (e) => {
    e.preventDefault();
    if (!eligibleOrders[0]) return;
    setSubmittingReview(true);
    try {
      await reviewService.createReview({
        orderId: eligibleOrders[0].OrderID,
        bookId: book.BookID,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
        images: reviewForm.images,
      });
      setReviewForm({ rating: 5, comment: '', images: [] });
      setEligibleOrders((prev) => prev.slice(1));
      showToast('Cảm ơn bạn đã gửi đánh giá cuốn sách!');
      loadBook();
    } catch (err) {
      showToast(err.response?.data?.message || 'Không thể gửi đánh giá.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAskQuestion = async (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!newQuestion.trim()) return;
    setAskingQuestion(true);
    try {
      await questionService.askQuestion(book.BookID, newQuestion.trim());
      setNewQuestion('');
      showToast('Đã gửi câu hỏi tới Gian hàng!');
      loadBook();
    } catch (err) {
      showToast(err.response?.data?.message || 'Không thể gửi câu hỏi.');
    } finally {
      setAskingQuestion(false);
    }
  };

  const handleAnswerQuestion = async (questionId) => {
    const ans = answerDrafts[questionId];
    if (!ans?.trim()) return;
    try {
      await questionService.answerQuestion(questionId, ans.trim());
      setAnswerDrafts((prev) => ({ ...prev, [questionId]: '' }));
      showToast('Đã gửi câu trả lời!');
      loadBook();
    } catch (err) {
      showToast(err.response?.data?.message || 'Không thể trả lời câu hỏi.');
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Xóa câu hỏi này?')) return;
    try {
      await questionService.deleteQuestion(questionId);
      setQuestions((prev) => prev.filter((q) => q.QuestionID !== questionId));
      showToast('Đã xóa câu hỏi.');
    } catch (err) {
      showToast(err.response?.data?.message || 'Không thể xóa câu hỏi.');
    }
  };

  const isCanAnswerQa =
    user && (user.userId === book.ShopOwnerID || user.role === 'Admin' || user.role === 'Manager');

  return (
    <div className="book-detail-page max-w-7xl mx-auto px-4 py-8 relative">
      {toast && <div className="book-detail-toast">{toast}</div>}

      {/* Khối chi tiết chính */}
      <div className="book-detail-card grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        {/* Cột ảnh + Đọc thử */}
        <div className="lg:col-span-5 space-y-3">
          <div className="rounded-2xl overflow-hidden border-2 border-amber-300 bg-amber-50 aspect-[3/4]">
            <img
              src={selectedImage || 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=600&q=80'}
              alt={book.Title}
              className="w-full h-full object-cover"
            />
          </div>

          {allImages.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedImage(img)}
                  className={`w-16 h-20 rounded-lg overflow-hidden border-2 shrink-0 ${
                    selectedImage === img ? 'border-[#b91c1c]' : 'border-amber-200'
                  }`}
                >
                  <img src={img} alt="thumb" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {book.previewImages?.length > 0 && (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="w-full py-2.5 rounded-xl bg-amber-100 border border-amber-400 text-[#7f1d1d] font-bold text-sm hover:bg-amber-200 inline-flex items-center justify-center gap-2"
            >
              <BookOpen className="w-4 h-4" /> Đọc thử {book.previewImages.length} trang mẫu
            </button>
          )}
        </div>

        {/* Cột thông tin mua hàng */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-red-100 text-[#991b1b] text-xs font-bold">
              {book.BookCondition || 'Mới 100%'}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold">
              {book.Format || 'Bìa mềm'}
            </span>
            {isFlashActive && (
              <span className="px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-red-600 text-white text-xs font-extrabold">
                🔥 Đang Flash Sale Tết
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#3b1510]">{book.Title}</h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-stone-600">
            <span className="inline-flex items-center gap-1 font-bold text-amber-600">
              <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
              {book.AvgRating > 0 ? book.AvgRating : '5.0'} ({book.ReviewCount || 0} đánh giá)
            </span>
            <span>|</span>
            <span>Đã bán <strong>{book.SoldCount || 0}</strong></span>
            <span>|</span>
            <span>Kho còn: <strong className="text-[#b91c1c]">{book.Stock}</strong> cuốn</span>
          </div>

          {/* Giá */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-red-50 to-amber-50 border border-amber-300 flex items-baseline gap-3">
            <span className="text-3xl font-extrabold text-[#b91c1c]">{formatVND(finalPrice)}</span>
            {Number(book.Price) > finalPrice && (
              <span className="text-base text-stone-400 line-through">{formatVND(book.Price)}</span>
            )}
          </div>

          {/* Voucher riêng của Shop */}
          {book.shopVouchers?.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-stone-600">Voucher của Shop:</span>
              {book.shopVouchers.map((v) => (
                <span key={v.VoucherID} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 border border-dashed border-[#b91c1c] text-xs font-bold text-[#991b1b]">
                  <Tag className="w-3 h-3" /> {v.Code}
                </span>
              ))}
            </div>
          )}

          {/* Chọn số lượng & Mua */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="inline-flex items-center border border-amber-400 rounded-xl overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="px-3.5 py-2.5 font-bold hover:bg-amber-50"
              >
                -
              </button>
              <span className="px-4 font-bold text-sm">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(book.Stock || 1, q + 1))}
                className="px-3.5 py-2.5 font-bold hover:bg-amber-50"
              >
                +
              </button>
            </div>

            <button
              type="button"
              disabled={book.Stock <= 0}
              onClick={() => {
                addToCart(book, quantity);
                showToast(`Đã thêm ${quantity} cuốn vào giỏ hàng!`);
              }}
              className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-gradient-to-r from-[#b91c1c] to-[#991b1b] text-amber-100 font-extrabold text-sm border border-amber-400 hover:brightness-110 inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <ShoppingCart className="w-4 h-4" /> Thêm vào giỏ hàng
            </button>

            <button
              type="button"
              onClick={async () => {
                if (!isAuthenticated) { navigate('/login'); return; }
                const res = await toggleWishlist(book.BookID);
                showToast(res ? 'Đã lưu vào Sách yêu thích!' : 'Đã bỏ khỏi Sách yêu thích.');
              }}
              className={`p-3 rounded-xl border ${
                isWishlisted ? 'bg-red-50 border-red-400 text-red-600' : 'bg-white border-amber-300 text-stone-600'
              }`}
              title="Yêu thích sách"
            >
              <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-current' : ''}`} />
            </button>
          </div>

          {/* Thông số xuất bản */}
          <div className="grid grid-cols-2 gap-2.5 text-xs bg-[#fffaf0] p-4 rounded-xl border border-amber-200 mt-2">
            <div><span className="text-stone-500">Tác giả:</span> <strong>{book.AuthorNames || 'Đang cập nhật'}</strong></div>
            <div><span className="text-stone-500">Nhà xuất bản:</span> <strong>{book.PublisherName || 'Đang cập nhật'}</strong></div>
            <div><span className="text-stone-500">Mã ISBN:</span> <strong>{book.ISBN}</strong></div>
            <div><span className="text-stone-500">Năm xuất bản:</span> <strong>{book.PublicationYear || '—'}</strong></div>
            <div><span className="text-stone-500">Số trang:</span> <strong>{book.PageCount || '—'}</strong></div>
            <div><span className="text-stone-500">Thể loại:</span> <strong>{book.CategoryNames || '—'}</strong></div>
          </div>

          <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>VitaBook Đảm Bảo: Thanh toán trước được Sàn giữ tiền hộ (Escrow), cho phép khiếu nại hoàn tiền nếu sách rách hoặc sai mô tả.</span>
          </div>
        </div>
      </div>

      {/* KHUNG THÔNG TIN GIAN HÀNG (SHOP) */}
      <div className="book-detail-shop-bar mt-6 relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <img
              src={book.ShopLogo || 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=200&q=80'}
              alt={book.ShopName}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400"
            />
            <div>
              <Link to={`/shops/${book.ShopID}`} className="font-bold text-lg text-[#7f1d1d] hover:underline">
                {book.ShopName}
              </Link>
              <p className="text-xs text-stone-600">{book.ShopAddress}</p>
              <div className="flex items-center gap-3 text-xs text-amber-800 font-semibold mt-1">
                <span>📚 {book.ShopBookCount} sản phẩm</span>
                <span>❤️ {book.ShopFollowerCount} người theo dõi</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleFollowShop}
              className={`px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                isFollowingShop
                  ? 'bg-amber-100 text-[#7f1d1d] border border-amber-400'
                  : 'bg-[#b91c1c] text-amber-100 hover:bg-[#991b1b]'
              }`}
            >
              {isFollowingShop ? <CheckCircle2 className="w-4 h-4" /> : <Heart className="w-4 h-4" />}
              {isFollowingShop ? 'Đang theo dõi' : 'Theo dõi Shop'}
            </button>

            <button
              type="button"
              onClick={handleChatShop}
              className="px-4 py-2 rounded-xl bg-amber-500 text-[#450a0a] text-xs font-extrabold hover:bg-amber-400 inline-flex items-center gap-1.5"
            >
              <MessageCircle className="w-4 h-4" /> Chat với Shop
            </button>

            <Link
              to={`/shops/${book.ShopID}`}
              className="px-4 py-2 rounded-xl border border-amber-400 bg-white text-[#7f1d1d] text-xs font-bold hover:bg-amber-50 inline-flex items-center gap-1.5"
            >
              <Store className="w-4 h-4" /> Xem Gian Hàng
            </Link>
          </div>
        </div>
      </div>

      {/* MÔ TẢ SÁCH */}
      <div className="book-detail-card mt-6">
        <h2 className="text-xl font-bold text-[#1f1712] mb-3 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#9b1c1c]" /> Giới thiệu nội dung sách
        </h2>
        <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">
          {book.Description || 'Chưa có mô tả chi tiết cho cuốn sách này.'}
        </p>
      </div>

      {/* ĐÁNH GIÁ TỪ NGƯỜI ĐÃ MUA HÀNG */}
      <div className="book-detail-card mt-6">
        <h2 className="text-xl font-bold text-[#1f1712] mb-4 flex items-center gap-2">
          <Star className="w-5 h-5 text-[#b45309] fill-[#d97706]" />
          Đánh giá từ bạn đọc đã mua ({book.reviews?.length || 0})
        </h2>

        {/* Form viết đánh giá trực tiếp cho khách đã nhận sách */}
        {eligibleOrders.length > 0 && (
          <form
            onSubmit={handleSubmitInlineReview}
            className="mb-6 p-4 rounded-xl bg-[#faf6f0] border border-[#e5d8c5] space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-[#1f1712]">
                Viết đánh giá cho đơn #{eligibleOrders[0].OrderID}
              </p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewForm((f) => ({ ...f, rating: star }))}
                    className={`text-xl leading-none ${star <= reviewForm.rating ? 'text-[#d97706]' : 'text-stone-300'}`}
                    aria-label={`${star} sao`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={3}
              required
              value={reviewForm.comment}
              onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))}
              placeholder="Chia sẻ cảm nhận về chất lượng in ấn, tình trạng sách và đóng gói..."
              className="w-full p-3 rounded-lg border border-[#d9cec0] bg-white text-sm outline-none focus:border-[#9b1c1c]"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={async (e) => {
                  const urls = await uploadFilesToServer(e.target.files);
                  setReviewForm((f) => ({ ...f, images: [...f.images, ...urls] }));
                }}
                className="text-xs text-stone-600"
              />
              <button
                type="submit"
                disabled={submittingReview}
                className="px-4 py-2 rounded-lg bg-[#9b1c1c] text-white text-xs font-bold hover:bg-[#7f1d1d] disabled:opacity-60"
              >
                {submittingReview ? 'Đang gửi...' : 'Gửi đánh giá'}
              </button>
            </div>
          </form>
        )}

        {!book.reviews || book.reviews.length === 0 ? (
          <p className="text-sm text-stone-500">Chưa có đánh giá nào. Hãy đặt mua và là người đầu tiên chia sẻ cảm nhận!</p>
        ) : (
          <div className="space-y-4">
            {book.reviews.map((rev) => (
              <div key={rev.ReviewID} className="p-4 rounded-xl bg-[#fffaf0] border border-amber-200">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-sm text-[#3b1510]">{rev.ReviewerName}</span>
                    <span className="ml-2 text-xs text-emerald-700 font-semibold">✓ Đã mua hàng</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500 font-bold text-sm">{'★'.repeat(rev.Rating)}{'☆'.repeat(5 - rev.Rating)}</span>
                    <button
                      type="button"
                      onClick={() => handleReportReview(rev.ReviewID)}
                      className="text-xs text-stone-400 hover:text-red-600"
                      title="Báo cáo đánh giá vi phạm"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-stone-700 mt-2">{rev.Comment}</p>
                {rev.images?.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {rev.images.map((img, idx) => (
                      <img key={idx} src={img} alt="review" className="w-16 h-16 rounded-lg object-cover border border-amber-300" />
                    ))}
                  </div>
                )}

                {rev.SellerReply ? (
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 border-l-4 border-[#b91c1c] text-xs">
                    <p className="font-bold text-[#991b1b]">Phản hồi từ {book.ShopName}:</p>
                    <p className="text-stone-700 mt-0.5">{rev.SellerReply}</p>
                  </div>
                ) : (
                  user?.userId === book.ShopOwnerID && (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={replyTexts[rev.ReviewID] || ''}
                        onChange={(e) => setReplyTexts((p) => ({ ...p, [rev.ReviewID]: e.target.value }))}
                        placeholder="Viết phản hồi của Shop..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-amber-300 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleReplyReview(rev.ReviewID)}
                        className="px-3 py-1.5 rounded-lg bg-[#b91c1c] text-amber-100 text-xs font-bold"
                      >
                        Gửi phản hồi
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HỎI ĐÁP CÔNG KHAI VỀ SÁCH (Q&A) */}
      <div className="book-detail-card mt-6">
        <h2 className="text-xl font-bold text-[#1f1712] mb-4 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-[#9b1c1c]" />
          Hỏi đáp về cuốn sách ({questions.length})
        </h2>

        <form onSubmit={handleAskQuestion} className="flex flex-col sm:flex-row gap-2.5 mb-5">
          <input
            type="text"
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            placeholder={
              isAuthenticated
                ? 'Đặt câu hỏi về tình trạng sách, năm tái bản, phụ kiện kèm theo...'
                : 'Đăng nhập để đặt câu hỏi cho Gian hàng...'
            }
            className="flex-1 px-3.5 py-2.5 rounded-lg border border-[#d9cec0] bg-[#fdfbf8] text-sm outline-none focus:border-[#9b1c1c] focus:bg-white"
          />
          <button
            type="submit"
            disabled={askingQuestion}
            className="px-4 py-2.5 rounded-lg bg-[#9b1c1c] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-[#7f1d1d] disabled:opacity-60"
          >
            <Send className="w-3.5 h-3.5" />
            {askingQuestion ? 'Đang gửi...' : 'Gửi câu hỏi'}
          </button>
        </form>

        {questions.length === 0 ? (
          <p className="text-sm text-stone-500">Chưa có câu hỏi nào cho cuốn sách này.</p>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => (
              <div key={q.QuestionID} className="p-4 rounded-xl bg-[#faf6f0] border border-[#ebe2d5]">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[#1f1712]">{q.Question}</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Hỏi bởi <strong>{q.AskerName}</strong> • {new Date(q.CreatedAt).toLocaleString('vi-VN')}
                    </p>
                  </div>
                  {(user?.userId === q.UserID || user?.role === 'Admin' || user?.role === 'Manager') && (
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(q.QuestionID)}
                      className="text-stone-400 hover:text-red-600 p-1"
                      title="Xóa câu hỏi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {q.Answer ? (
                  <div className="mt-3 pl-3 border-l-2 border-[#9b1c1c] text-xs text-stone-700">
                    <p className="font-bold text-[#9b1c1c]">
                      Phản hồi từ {q.AnsweredByName || book.ShopName}:
                    </p>
                    <p className="mt-0.5 leading-relaxed">{q.Answer}</p>
                  </div>
                ) : (
                  isCanAnswerQa && (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={answerDrafts[q.QuestionID] || ''}
                        onChange={(e) => setAnswerDrafts((p) => ({ ...p, [q.QuestionID]: e.target.value }))}
                        placeholder="Nhập câu trả lời của Shop..."
                        className="flex-1 px-3 py-1.5 rounded-lg border border-[#d9cec0] bg-white text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleAnswerQuestion(q.QuestionID)}
                        className="px-3 py-1.5 rounded-lg bg-[#9b1c1c] text-white text-xs font-bold"
                      >
                        Trả lời
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL ĐỌC THỬ SÁCH */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#fffaf0] border-2 border-amber-500 rounded-2xl max-w-3xl w-full max-h-[88vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 bg-[#991b1b] text-amber-100">
              <span className="font-bold">📖 Đọc thử: {book.Title}</span>
              <button type="button" onClick={() => setPreviewOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              {book.previewImages.map((img, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-xs font-bold text-stone-500">Trang mẫu #{i + 1}</p>
                  <img src={img} alt={`preview-${i}`} className="w-full rounded-xl border border-amber-300" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookDetailPage;
