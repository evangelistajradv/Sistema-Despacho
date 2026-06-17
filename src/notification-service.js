// ═══════════════════════════════════════════════════════════════════
// SERVIÇO DE NOTIFICAÇÕES CENTRALIZADAS
// ═══════════════════════════════════════════════════════════════════

let notificationStore = {
  accompaniments: [],
  hearings: [],
  banners: []
};

/**
 * Adicionar notificação de acompanhamento
 */
export const addAccompanimentNotification = (accompaniment, type = 'updated') => {
  const notification = {
    id: `acc-${accompaniment.id}-${Date.now()}`,
    type: type, // 'updated' ou 'verified'
    accompaniment,
    timestamp: new Date(),
    read: false
  };

  notificationStore.accompaniments.unshift(notification);
  return notification;
};

/**
 * Adicionar notificação de audiência
 */
export const addHearingNotification = (hearing, type = 'upcoming') => {
  const notification = {
    id: `hear-${hearing.id}-${Date.now()}`,
    type: type, // 'upcoming_5days' ou 'upcoming_1day'
    hearing,
    timestamp: new Date(),
    read: false
  };

  notificationStore.hearings.unshift(notification);
  return notification;
};

/**
 * Obter notificações de acompanhamento não lidas
 */
export const getUnreadAccompanimentNotifications = () => {
  return notificationStore.accompaniments.filter(n => !n.read);
};

/**
 * Obter notificações de audiência não lidas
 */
export const getUnreadHearingNotifications = () => {
  return notificationStore.hearings.filter(n => !n.read);
};

/**
 * Obter todas as notificações de acompanhamento
 */
export const getAllAccompanimentNotifications = () => {
  return notificationStore.accompaniments;
};

/**
 * Obter todas as notificações de audiência
 */
export const getAllHearingNotifications = () => {
  return notificationStore.hearings;
};

/**
 * Marcar notificação como lida
 */
export const markNotificationAsRead = (id) => {
  const accNotif = notificationStore.accompaniments.find(n => n.id === id);
  if (accNotif) {
    accNotif.read = true;
    return;
  }

  const hearNotif = notificationStore.hearings.find(n => n.id === id);
  if (hearNotif) {
    hearNotif.read = true;
  }
};

/**
 * Limpar notificações lidas
 */
export const clearReadNotifications = (type = 'all') => {
  if (type === 'all' || type === 'accompaniments') {
    notificationStore.accompaniments = notificationStore.accompaniments.filter(n => !n.read);
  }
  if (type === 'all' || type === 'hearings') {
    notificationStore.hearings = notificationStore.hearings.filter(n => !n.read);
  }
};

/**
 * Adicionar banner (toast)
 */
export const addBanner = (message, type = 'info', duration = 4000) => {
  const banner = {
    id: `banner-${Date.now()}`,
    message,
    type, // 'info', 'success', 'warning', 'error'
    timestamp: new Date()
  };

  notificationStore.banners.push(banner);

  // Auto-remover após duration
  if (duration > 0) {
    setTimeout(() => {
      removeBanner(banner.id);
    }, duration);
  }

  return banner;
};

/**
 * Remover banner
 */
export const removeBanner = (id) => {
  notificationStore.banners = notificationStore.banners.filter(b => b.id !== id);
};

/**
 * Obter banners ativos
 */
export const getActiveBanners = () => {
  return notificationStore.banners;
};

