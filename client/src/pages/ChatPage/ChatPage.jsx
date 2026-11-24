import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, MessageCircle, Store } from 'lucide-react';
import { chatService } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useRealtime } from '../../context/RealtimeContext';
import './ChatPage.css';

const ChatPage = () => {
  const { user } = useAuth();
  const { latestChatEvent } = useRealtime();
  const [searchParams] = useSearchParams();

  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(() => {
    const q = parseInt(searchParams.get('conversationId') || '0', 10);
    return q || null;
  });
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const loadConversations = async () => {
    try {
      const res = await chatService.getConversations();
      const list = res.data?.data || [];
      setConversations(list);
      if (!activeConvId && list.length > 0) {
        setActiveConvId(list[0].ConversationID);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (!activeConvId) return;
    chatService.getMessages(activeConvId).then((res) => {
      setMessages(res.data?.data || []);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    });
  }, [activeConvId]);

  // Nhận tin nhắn realtime qua SSE
  useEffect(() => {
    if (!latestChatEvent) return;
    if (latestChatEvent.ConversationID === activeConvId) {
      setMessages((prev) => {
        if (prev.some((m) => m.MessageID === latestChatEvent.MessageID)) return prev;
        return [...prev, latestChatEvent];
      });
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
    }
    loadConversations();
  }, [latestChatEvent]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !activeConvId) return;
    setSending(true);
    try {
      const res = await chatService.sendMessage(activeConvId, draft.trim());
      if (res.data?.data) {
        setMessages((prev) => [...prev, res.data.data]);
      }
      setDraft('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 60);
      loadConversations();
    } catch (err) {
      alert(err.response?.data?.message || 'Không gửi được tin nhắn.');
    } finally {
      setSending(false);
    }
  };

  const activeConv = conversations.find((c) => c.ConversationID === activeConvId);

  return (
    <div className="chat-tet-page max-w-6xl mx-auto px-4 py-8 relative">

      <h1 className="text-2xl font-extrabold text-[#7f1d1d] mb-5 flex items-center gap-2 relative z-10">
        <MessageCircle className="w-6 h-6 text-[#b91c1c]" /> Tin Nhắn Trực Tiếp (Người Mua ↔ Shop)
      </h1>

      <div className="chat-tet-shell grid grid-cols-1 md:grid-cols-12 relative z-10">
        {/* Danh sách hội thoại */}
        <aside className="md:col-span-4 border-r border-amber-200 bg-amber-50/50 overflow-y-auto">
          <div className="p-3.5 border-b border-amber-200 font-bold text-sm text-[#7f1d1d]">
            Cuộc trò chuyện ({conversations.length})
          </div>
          {conversations.length === 0 ? (
            <p className="p-6 text-xs text-stone-500 text-center">
              Chưa có cuộc trò chuyện nào. Hãy vào trang chi tiết sách hoặc Gian hàng bấm "Chat với Shop"!
            </p>
          ) : (
            conversations.map((c) => {
              const title = c.BuyerID === user?.userId ? c.ShopName : `${c.BuyerName} (Khách hỏi mua)`;
              return (
                <button
                  key={c.ConversationID}
                  type="button"
                  onClick={() => setActiveConvId(c.ConversationID)}
                  className={`w-full text-left p-3.5 border-b border-amber-100 hover:bg-amber-100/60 transition flex items-start gap-2.5 ${
                    activeConvId === c.ConversationID ? 'bg-red-50 border-l-4 border-l-[#b91c1c]' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#b91c1c] text-amber-100 flex items-center justify-center shrink-0">
                    <Store className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-bold text-[#3b1510] truncate">{title}</p>
                      {c.UnreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#b91c1c] text-white text-[10px] font-bold">
                          {c.UnreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 truncate mt-0.5">{c.LastMessage}</p>
                  </div>
                </button>
              );
            })
          )}
        </aside>

        {/* Khung chat */}
        <section className="md:col-span-8 flex flex-col bg-white">
          {!activeConv ? (
            <div className="flex-1 flex items-center justify-center text-sm text-stone-500 p-8">
              Chọn một cuộc trò chuyện bên trái để bắt đầu nhắn tin.
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-amber-200 bg-gradient-to-r from-[#991b1b] to-[#b91c1c] text-amber-100">
                <p className="font-bold text-sm">
                  {activeConv.BuyerID === user?.userId ? activeConv.ShopName : activeConv.BuyerName}
                </p>
                <p className="text-[11px] text-amber-200">Hội thoại trực tiếp thời gian thực</p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#fffaf0]">
                {messages.map((m) => {
                  const isMine = m.SenderID === user?.userId;
                  return (
                    <div key={m.MessageID} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`chat-bubble ${isMine ? 'is-mine' : 'is-other'}`}>
                        <p className="text-[10px] opacity-75 font-bold mb-0.5">{m.SenderName}</p>
                        <p className="text-sm whitespace-pre-wrap">{m.Content}</p>
                        <p className="text-[10px] opacity-60 text-right mt-1">
                          {new Date(m.CreatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={handleSend} className="p-3 border-t border-amber-200 flex gap-2 bg-white">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Nhập tin nhắn hỏi tình trạng sách, gáy sách, giao hàng..."
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-amber-300 text-sm focus:outline-none focus:border-[#b91c1c]"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="px-5 py-2.5 rounded-xl bg-[#b91c1c] text-amber-100 font-bold text-sm inline-flex items-center gap-1.5 hover:bg-[#991b1b]"
                >
                  <Send className="w-4 h-4" /> Gửi
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ChatPage;
