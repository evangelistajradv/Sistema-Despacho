import React, { useState, useEffect } from 'react';
import { db } from './firebase-config';
import { collection, onSnapshot, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';

// Central de Notificações (sino) — lê as notificações persistidas no Firebase.
// Como as notificações ficam no banco, elas aparecem aqui mesmo quando chegaram
// como push no celular, e o estado de "lida" fica sincronizado entre os canais
// e entre os dispositivos do mesmo usuário.
export default function NotificationCenter({
  currentUser,
  setActiveTab,
  setSelectedAccompaniment,
  setSelectedDeadline,
  setSelectedHearing,
  setSelectedDoe,
  accompEdits,
  setAccompEdits,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(
      collection(db, 'notificacoes'),
      (snap) => {
        const all = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          // só notificações destinadas a este usuário e não "limpas" por ele
          .filter((n) => (!n.audience || n.audience.includes(currentUser)))
          .filter((n) => !(n.clearedBy || []).includes(currentUser))
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
          .slice(0, 100);
        setNotifications(all);
      },
      (err) => console.warn('⚠️ Erro ao carregar notificações:', err.message)
    );
    return () => unsub();
  }, [currentUser]);

  const isRead = (n) => !!(n.readBy && n.readBy[currentUser]);
  const unreadCount = notifications.filter((n) => !isRead(n)).length;

  const markRead = async (n) => {
    if (isRead(n)) return;
    try {
      await updateDoc(doc(db, 'notificacoes', n.id), { [`readBy.${currentUser}`]: true });
      // se houver push nativo ainda exibido no aparelho, fecha-o (sincroniza canais)
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLOSE_NOTIF', tag: n.id });
      }
    } catch (e) {
      console.warn('⚠️ Falha ao marcar como lida:', e.message);
    }
  };

  // Marca todas as notificações não lidas como lidas
  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !isRead(n));
    for (const n of unread) {
      await markRead(n);
    }
  };

  // Redireciona pro item que gerou a notificação e marca como lida
  const handleNotificationClick = async (n) => {
    await markRead(n);

    // Redireciona para a aba e seleciona o item
    if (setActiveTab && n.tab) {
      setActiveTab(n.tab);

      // Se há um itemId, abre o item específico
      if (n.itemId) {
        if (n.tab === 'acompanhamentos' && setSelectedAccompaniment) {
          try {
            const snap = await getDoc(doc(db, 'acompanhamentos', n.itemId));
            if (snap.exists()) {
              setSelectedAccompaniment({ id: snap.id, ...snap.data() });
              if (setAccompEdits) setAccompEdits({});
            }
          } catch (e) {
            console.warn('⚠️ Erro ao carregar acompanhamento:', e.message);
          }
        } else if (n.tab === 'prazos' && setSelectedDeadline) {
          try {
            const snap = await getDoc(doc(db, 'prazos', n.itemId));
            if (snap.exists()) {
              setSelectedDeadline({ id: snap.id, ...snap.data() });
            }
          } catch (e) {
            console.warn('⚠️ Erro ao carregar prazo:', e.message);
          }
        } else if (n.tab === 'audiencias' && setSelectedHearing) {
          try {
            const snap = await getDoc(doc(db, 'audiencias', n.itemId));
            if (snap.exists()) {
              setSelectedHearing({ id: snap.id, ...snap.data() });
            }
          } catch (e) {
            console.warn('⚠️ Erro ao carregar audiência:', e.message);
          }
        } else if (n.tab === 'doe' && setSelectedDoe) {
          try {
            const snap = await getDoc(doc(db, 'doe', n.itemId));
            if (snap.exists()) {
              setSelectedDoe({ id: snap.id, ...snap.data() });
            }
          } catch (e) {
            console.warn('⚠️ Erro ao carregar DOE:', e.message);
          }
        }
      }
    }

    setIsOpen(false);
  };

  const handleClearRead = async () => {
    const lidas = notifications.filter((n) => isRead(n));
    for (const n of lidas) {
      try {
        await updateDoc(doc(db, 'notificacoes', n.id), { clearedBy: arrayUnion(currentUser) });
      } catch (e) {
        console.warn('⚠️ Falha ao limpar notificação:', e.message);
      }
    }
  };

  return (
    <>
      <button
        className={`notification-bell ${isOpen ? 'active' : ''} ${unreadCount > 0 ? 'blinking' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={`${unreadCount} nova${unreadCount !== 1 ? 's' : ''}`}
      >
        <i className="ti ti-bell"></i>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-overlay" onClick={() => setIsOpen(false)}>
          <div className="notification-modal" onClick={(e) => e.stopPropagation()}>
            <div className="notification-header">
              <h3>Notificações</h3>
              <button className="close-btn" onClick={() => setIsOpen(false)}>✕</button>
            </div>

            {notifications.length === 0 ? (
              <div className="notification-empty">
                <p>Nenhuma notificação</p>
              </div>
            ) : (
              <>
                <div className="notification-list">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`notification-item ${isRead(notif) ? 'read' : 'unread'}`}
                      onClick={() => handleNotificationClick(notif)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="notification-icon">{notif.icon || '🔔'}</div>
                      <div className="notification-content">
                        <h4>{notif.title}</h4>
                        {notif.main && <p className="notification-main">{notif.main}</p>}
                        {notif.secondary && <p className="notification-secondary">{notif.secondary}</p>}
                        <span className="notification-time">
                          {notif.createdAt
                            ? new Date(notif.createdAt).toLocaleString('pt-BR')
                            : ''}
                        </span>
                      </div>
                      {!isRead(notif) && <div className="notification-unread-dot"></div>}
                    </div>
                  ))}
                </div>

                <div className="notification-footer">
                  {notifications.some((n) => !isRead(n)) && (
                    <button className="mark-all-btn" onClick={markAllAsRead}>
                      Ler todas
                    </button>
                  )}
                  {notifications.some((n) => isRead(n)) && (
                    <button className="clear-btn" onClick={handleClearRead}>
                      Limpar lidas
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
