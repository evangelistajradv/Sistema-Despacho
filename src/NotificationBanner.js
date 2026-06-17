import React, { useState, useEffect } from 'react';
import { getActiveBanners, removeBanner } from './notification-service';

export default function NotificationBanner() {
  const [banners, setBanners] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBanners([...getActiveBanners()]);
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const handleRemove = (id) => {
    removeBanner(id);
    setBanners(banners.filter(b => b.id !== id));
  };

  return (
    <div className="notification-banners">
      {banners.map((banner) => (
        <div key={banner.id} className={`banner banner-${banner.type}`}>
          <div className="banner-content">
            <span className="banner-icon">
              {banner.type === 'success' && '✅'}
              {banner.type === 'info' && 'ℹ️'}
              {banner.type === 'warning' && '⚠️'}
              {banner.type === 'error' && '❌'}
            </span>
            <span className="banner-message">{banner.message}</span>
          </div>
          <button
            className="banner-close"
            onClick={() => handleRemove(banner.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
