import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, Search, RotateCcw, Flame } from 'lucide-react';
import { bookService, catalogService } from '../../services/api';
import BookCard from '../../components/BookCard/BookCard';
import TetBlossomsEffect from '../../effects/TetBlossomsEffect';
import './ShopPage.css';

const CONDITIONS = ['', 'Mới 100%', 'Cũ như mới (95%)', 'Cũ tốt (85%)', 'Bản hiếm / Giới hạn'];

const ShopPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalItems: 0 });
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    category: searchParams.get('category') || '',
    author: searchParams.get('author') || '',
    condition: searchParams.get('condition') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    flashSale: searchParams.get('flashSale') === 'true',
    sort: searchParams.get('sort') || 'newest',
    page: parseInt(searchParams.get('page') || '1', 10),
  });

  useEffect(() => {
    Promise.all([catalogService.getCategories(), catalogService.getAuthors()]).then(([catRes, authRes]) => {
      setCategories(catRes.data?.data || []);
      setAuthors(authRes.data?.data || []);
    });
  }, []);

  useEffect(() => {
    const fetchBooks = async () => {
      setLoading(true);
      try {
        const params = {
          page: filters.page,
          limit: 12,
          sort: filters.sort,
        };
        if (filters.search) params.search = filters.search;
        if (filters.category) params.category = filters.category;
        if (filters.author) params.author = filters.author;
        if (filters.condition) params.condition = filters.condition;
        if (filters.minPrice) params.minPrice = filters.minPrice;
        if (filters.maxPrice) params.maxPrice = filters.maxPrice;
        if (filters.flashSale) params.flashSale = 'true';

        const res = await bookService.getBooks(params);
        setBooks(res.data?.data || []);
        setPagination(res.data?.pagination || { page: 1, totalPages: 1, totalItems: 0 });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchBooks();
  }, [filters]);

  const updateFilter = (patch) => {
    const next = { ...filters, ...patch, page: patch.page ?? 1 };
    setFilters(next);
    const sp = new URLSearchParams();
    if (next.search) sp.set('search', next.search);
    if (next.category) sp.set('category', next.category);
    if (next.condition) sp.set('condition', next.condition);
    if (next.flashSale) sp.set('flashSale', 'true');
    if (next.sort && next.sort !== 'newest') sp.set('sort', next.sort);
    setSearchParams(sp);
  };

  const resetFilters = () => {
    updateFilter({
      search: '',
      category: '',
      author: '',
      condition: '',
      minPrice: '',
      maxPrice: '',
      flashSale: false,
      sort: 'newest',
      page: 1,
    });
  };

  return (
    <div className="shop-tet-page max-w-7xl mx-auto px-4 py-8 relative">
      <TetBlossomsEffect count={10} />

      <div className="shop-tet-header mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#fef3c7]">🏮 Chợ Sách Toàn Sàn VitaBook</h1>
          <p className="text-xs sm:text-sm text-amber-200 mt-1">
            Tìm thấy <strong>{pagination.totalItems}</strong> đầu sách đã được Quản lý kiểm duyệt lên kệ
          </p>
        </div>
        <select
          value={filters.sort}
          onChange={(e) => updateFilter({ sort: e.target.value })}
          className="px-3 py-2 rounded-xl bg-[#fffaf0] text-[#3b1510] text-sm font-semibold border border-amber-400"
        >
          <option value="newest">Mới nhất</option>
          <option value="bestselling">Bán chạy nhất</option>
          <option value="price_asc">Giá tăng dần</option>
          <option value="price_desc">Giá giảm dần</option>
          <option value="title_asc">Tên A → Z</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        {/* Bộ lọc bên trái */}
        <aside className="lg:col-span-3">
          <div className="shop-filter-card space-y-4">
            <div className="flex items-center justify-between border-b border-amber-200 pb-3">
              <span className="font-bold text-[#7f1d1d] inline-flex items-center gap-1.5">
                <Filter className="w-4 h-4" /> Bộ lọc nâng cao
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-[#b91c1c] hover:underline inline-flex items-center gap-1 font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Đặt lại
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">Từ khóa (Sách / Tác giả / Shop)</label>
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) => updateFilter({ search: e.target.value })}
                  placeholder="Nhập từ khóa..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-amber-300 text-sm focus:outline-none focus:border-[#b91c1c]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">Danh mục</label>
              <select
                value={filters.category}
                onChange={(e) => updateFilter({ category: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm bg-white"
              >
                <option value="">Tất cả danh mục</option>
                {categories.map((c) => (
                  <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">Tác giả</label>
              <select
                value={filters.author}
                onChange={(e) => updateFilter({ author: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm bg-white"
              >
                <option value="">Tất cả tác giả</option>
                {authors.map((a) => (
                  <option key={a.AuthorID} value={a.AuthorID}>{a.AuthorName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">Tình trạng sách</label>
              <select
                value={filters.condition}
                onChange={(e) => updateFilter({ condition: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-amber-300 text-sm bg-white"
              >
                {CONDITIONS.map((cond) => (
                  <option key={cond || 'all'} value={cond}>{cond || 'Tất cả tình trạng'}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">Khoảng giá (VNĐ)</label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Từ"
                  value={filters.minPrice}
                  onChange={(e) => updateFilter({ minPrice: e.target.value })}
                  className="px-2.5 py-2 rounded-xl border border-amber-300 text-sm"
                />
                <input
                  type="number"
                  placeholder="Đến"
                  value={filters.maxPrice}
                  onChange={(e) => updateFilter({ maxPrice: e.target.value })}
                  className="px-2.5 py-2 rounded-xl border border-amber-300 text-sm"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-red-50 border border-red-200 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.flashSale}
                onChange={(e) => updateFilter({ flashSale: e.target.checked })}
                className="accent-[#b91c1c] w-4 h-4"
              />
              <span className="text-xs font-bold text-[#991b1b] inline-flex items-center gap-1">
                <Flame className="w-4 h-4 text-amber-600" /> Chỉ hiện sách Flash Sale Tết
              </span>
            </label>
          </div>
        </aside>

        {/* Danh sách sách */}
        <section className="lg:col-span-9">
          {loading ? (
            <div className="py-16 text-center text-stone-500">Đang tải danh sách sách...</div>
          ) : books.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-amber-200">
              <p className="text-lg font-bold text-[#7f1d1d]">Không tìm thấy cuốn sách nào phù hợp</p>
              <p className="text-sm text-stone-500 mt-1">Thử bỏ bớt điều kiện lọc hoặc tìm bằng từ khóa khác.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {books.map((book) => (
                  <BookCard key={book.BookID} book={book} />
                ))}
              </div>

              {pagination.totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-8">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => updateFilter({ page: p })}
                      className={`w-9 h-9 rounded-xl font-bold text-sm ${
                        p === pagination.page
                          ? 'bg-[#b91c1c] text-amber-100 border border-amber-400'
                          : 'bg-white border border-amber-300 text-[#7f1d1d] hover:bg-amber-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ShopPage;
