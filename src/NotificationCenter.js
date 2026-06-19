import React, { useState, useEffect } from 'react';
import { db } from './firebase-config';
import { collection, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';

// Central de Notificações (sino) — lê as notificações persistidas no Firebase.
// Como as notificações ficam no banco, elas aparecem aqui mesmo quando chegaram
// como push no celular, e o estado de "lida" fica sincronizado entre os canais
// e entre os dispositivos do mesmo usuário.
export default function NotificationCenter({ currentUser }) {
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
                      onClick={() => markRead(notif)}
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

                {notifications.some((n) => isRead(n)) && (
                  <div className="notification-footer">
                    <button className="clear-btn" onClick={handleClearRead}>
                      Limpar lidas
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
