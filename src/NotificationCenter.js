import React, { useState, useEffect } from 'react';
import {
  getAllAccompanimentNotifications,
  getAllHearingNotifications,
  getAllDeadlineNotifications,
  markNotificationAsRead,
  clearReadNotifications
} from './notification-service';

export default function NotificationCenter({ currentUser, USUARIOS }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    updateNotifications();
    const interval = setInterval(updateNotifications, 1000);
    return () => clearInterval(interval);
  }, []);

  const updateNotifications = () => {
    const accompNotifs = getAllAccompanimentNotifications();
    const hearingNotifs = getAllHearingNotifications();
    const deadlineNotifs = getAllDeadlineNotifications();
    const allNotifs = [...accompNotifs, ...hearingNotifs, ...deadlineNotifs].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );
    setNotifications(allNotifs);
    setUnreadCount(allNotifs.filter(n => !n.read).length);
  };

  const handleNotificationClick = (notification) => {
    markNotificationAsRead(notification.id);
    updateNotifications();
  };

  const handleClearRead = () => {
    clearReadNotifications('all');
    updateNotifications();
  };

  const getNotificationTitle = (notification) => {
    if (notification.accompaniment) {
      return `📍 Processo nº ${notification.accompaniment.numeroProcesso}`;
    } else if (notification.deadline) {
      return `⚖️ Prazo: ${notification.deadline.numeroPJE || notification.deadline.numeroSEI}`;
    } else if (notification.hearing) {
      return `📅 Audiência - ${notification.hearing.seiNumber}`;
    }
  };

  const getNotificationDetails = (notification) => {
    if (notification.accompaniment) {
      return {
        main: notification.accompaniment.objeto,
        secondary: `Setor: ${notification.accompaniment.setorAtual}`,
        icon: notification.type === 'updated' ? '📍' : '✅'
      };
    } else if (notification.deadline) {
      return {
        main: notification.deadline.objeto || 'Prazo judicial',
        secondary: `Vence em ${notification.daysLeft} dia(s) — ${new Date(notification.deadline.prazoFatal).toLocaleDateString('pt-BR')}`,
        icon: '⚖️'
      };
    } else if (notification.hearing) {
      const daysUntil = Math.ceil(
        (new Date(notification.hearing.data) - new Date()) / (1000 * 60 * 60 * 24)
      );
      return {
        main: notification.hearing.objeto,
        secondary: `Data: ${new Date(notification.hearing.data).toLocaleDateString('pt-BR')} - ${daysUntil} dias`,
        icon: '📅'
      };
    }
  };

  return (
    <>
      <button
        className={`notification-bell ${isOpen ? 'active' : ''} ${unreadCount > 0 ? 'blinking' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={`${unreadCount} nova${unreadCount !== 1 ? 's' : ''}`}
      >
        🔔
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-overlay" onClick={() => setIsOpen(false)}>
          <div className="notification-modal" onClick={e => e.stopPropagation()}>
            <div className="notification-header">
              <h3>🔔 Notificações</h3>
              <button className="close-btn" onClick={() => setIsOpen(false)}>✕</button>
            </div>

            {notifications.length === 0 ? (
              <div className="notification-empty">
                <p>Nenhuma notificação</p>
              </div>
            ) : (
              <>
                <div className="notification-list">
                  {notifications.map((notif) => {
                    const details = getNotificationDetails(notif);
                    return (
                      <div
                        key={notif.id}
                        className={`notification-item ${notif.read ? 'read' : 'unread'}`}
                        onClick={() => handleNotificationClick(notif)}
                      >
                        <div className="notification-icon">{details.icon}</div>
                        <div className="notification-content">
                          <h4>{getNotificationTitle(notif)}</h4>
                          <p className="notification-main">{details.main}</p>
                          <p className="notification-secondary">{details.secondary}</p>
                          <span className="notification-time">
                            {new Date(notif.timestamp).toLocaleTimeString('pt-BR')}
                          </span>
                        </div>
                        {!notif.read && <div className="notification-unread-dot"></div>}
                      </div>
                    );
                  })}
                </div>

                {notifications.some(n => n.read) && (
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
