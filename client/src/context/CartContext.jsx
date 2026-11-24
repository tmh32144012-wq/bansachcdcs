import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';
import { cartService } from '../services/api';

const CartContext = createContext(null);
const STORAGE_KEY = 'bookstore_cart_v2';

export const CartProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  const [cartItems, setCartItems] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const hydratedUserIdRef = useRef(null);
  const skipNextSyncRef = useRef(false);

  // Luôn lưu cache ở localStorage cho khách vãng lai & load nhanh
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cartItems));
    } catch (_) {}
  }, [cartItems]);

  // Khi đăng nhập: hợp nhất giỏ hàng local với dbo.CartItems & cập nhật giá/tồn kho mới nhất từ server
  useEffect(() => {
    const uid = user?.userId || null;
    if (!isAuthenticated || !uid) {
      hydratedUserIdRef.current = null;
      return;
    }
    if (hydratedUserIdRef.current === uid) return;
    hydratedUserIdRef.current = uid;

    let cancelled = false;
    const syncOnLogin = async () => {
      try {
        const localSaved = (() => {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
          } catch {
            return [];
          }
        })();

        const serverRes = await cartService.getCart();
        const serverItems = serverRes.data?.data || [];

        if (localSaved.length > 0) {
          // Hợp nhất local + server rồi đồng bộ lại DB để lấy giá/tồn kho chuẩn
          const mergedMap = new Map();
          for (const it of serverItems) {
            mergedMap.set(it.bookId, { bookId: it.bookId, quantity: it.quantity, selected: it.selected !== false });
          }
          for (const it of localSaved) {
            const prev = mergedMap.get(it.bookId);
            mergedMap.set(it.bookId, {
              bookId: it.bookId,
              quantity: Math.max(prev?.quantity || 0, it.quantity || 1),
              selected: it.selected !== false,
            });
          }
          const syncedRes = await cartService.syncCart(Array.from(mergedMap.values()));
          if (!cancelled && syncedRes.data?.success) {
            skipNextSyncRef.current = true;
            setCartItems(syncedRes.data.data || []);
          }
        } else if (!cancelled) {
          skipNextSyncRef.current = true;
          setCartItems(serverItems);
        }
      } catch (_) {}
    };

    syncOnLogin();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.userId]);

  // Đồng bộ thay đổi giỏ hàng lên DB (debounce 400ms) khi đã đăng nhập
  useEffect(() => {
    if (!isAuthenticated || !user?.userId || hydratedUserIdRef.current !== user.userId) return undefined;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return undefined;
    }

    const timer = setTimeout(() => {
      const payload = cartItems.map((i) => ({
        bookId: i.bookId,
        quantity: i.quantity,
        selected: i.selected !== false,
      }));
      cartService.syncCart(payload).catch(() => {});
    }, 400);

    return () => clearTimeout(timer);
  }, [cartItems, isAuthenticated, user?.userId]);

  const addToCart = (book, quantity = 1) => {
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const isFlashActive =
      book.IsFlashSale &&
      book.FlashSalePrice !== null &&
      book.FlashSalePrice !== undefined &&
      (!book.FlashSaleEnd || new Date(book.FlashSaleEnd) > new Date());

    const unitPrice = isFlashActive
      ? Number(book.FlashSalePrice)
      : book.DiscountPrice !== null && book.DiscountPrice !== undefined
        ? Number(book.DiscountPrice)
        : Number(book.Price);

    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.bookId === book.BookID);
      if (existingIndex > -1) {
        const updated = [...prev];
        const currentQty = updated[existingIndex].quantity;
        const maxStock = book.Stock ?? updated[existingIndex].stock ?? 99;
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: Math.min(currentQty + qty, maxStock),
          stock: maxStock,
          unitPrice,
          selected: true,
        };
        return updated;
      }

      return [
        ...prev,
        {
          bookId: book.BookID,
          shopId: book.ShopID || 1,
          shopName: book.ShopName || 'VitaBook Mall Chính Hãng',
          title: book.Title,
          isbn: book.ISBN,
          coverImage: book.CoverImage,
          authorNames: book.AuthorNames,
          bookCondition: book.BookCondition || 'Mới 100%',
          price: Number(book.Price),
          unitPrice,
          stock: book.Stock ?? 99,
          quantity: Math.min(qty, book.Stock ?? 99),
          selected: true,
        },
      ];
    });
  };

  const updateQuantity = (bookId, newQuantity) => {
    const qty = parseInt(newQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      removeFromCart(bookId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.bookId === bookId ? { ...item, quantity: Math.min(qty, item.stock || 99) } : item
      )
    );
  };

  const toggleSelectItem = (bookId) => {
    setCartItems((prev) =>
      prev.map((item) => (item.bookId === bookId ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleSelectShop = (shopId) => {
    setCartItems((prev) => {
      const shopItems = prev.filter((i) => i.shopId === shopId);
      const allSelected = shopItems.every((i) => i.selected !== false);
      return prev.map((item) =>
        item.shopId === shopId ? { ...item, selected: !allSelected } : item
      );
    });
  };

  const removeFromCart = (bookId) => {
    setCartItems((prev) => prev.filter((item) => item.bookId !== bookId));
  };

  const removeSelectedItems = () => {
    setCartItems((prev) => prev.filter((item) => item.selected === false));
  };

  const clearCart = () => setCartItems([]);

  const groupedByShop = useMemo(() => {
    const map = new Map();
    for (const item of cartItems) {
      const sId = item.shopId || 1;
      if (!map.has(sId)) {
        map.set(sId, {
          shopId: sId,
          shopName: item.shopName || 'VitaBook Mall',
          items: [],
        });
      }
      map.get(sId).items.push(item);
    }
    return Array.from(map.values());
  }, [cartItems]);

  const selectedItems = useMemo(
    () => cartItems.filter((item) => item.selected !== false),
    [cartItems]
  );

  const cartCount = useMemo(
    () => cartItems.reduce((total, item) => total + item.quantity, 0),
    [cartItems]
  );

  const cartSubtotal = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [selectedItems]
  );

  return (
    <CartContext.Provider
      value={{
        cartItems,
        selectedItems,
        groupedByShop,
        cartCount,
        cartSubtotal,
        addToCart,
        updateQuantity,
        toggleSelectItem,
        toggleSelectShop,
        removeFromCart,
        removeSelectedItems,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart phải được sử dụng bên trong CartProvider');
  }
  return context;
};
