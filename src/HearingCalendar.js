import React, { useState } from 'react';

export default function HearingCalendar({ hearings, onSelectDate }) {
  const [currentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(null);

  // Agrupar audiências por data
  const hearingsByDate = {};
  hearings.forEach(hearing => {
    const date = new Date(hearing.data).toISOString().split('T')[0];
    if (!hearingsByDate[date]) {
      hearingsByDate[date] = [];
    }
    hearingsByDate[date].push(hearing);
  });

  // Função para renderizar um mês
  const renderMonth = (month) => {
    const firstDay = new Date(currentYear, month, 1);
    const lastDay = new Date(currentYear, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    const monthName = new Date(currentYear, month, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric'
    });

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }

    return (
      <div key={month} className="calendar-month">
        <h3>{monthName}</h3>
        <div className="calendar-weekdays">
          <div>Dom</div>
          <div>Seg</div>
          <div>Ter</div>
          <div>Qua</div>
          <div>Qui</div>
          <div>Sex</div>
          <div>Sab</div>
        </div>
        <div className="calendar-days">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="calendar-week">
              {week.map((day, dayIdx) => {
                if (!day) {
                  return <div key={`empty-${dayIdx}`} className="calendar-day empty"></div>;
                }

                const fullDate = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const hasHearings = hearingsByDate[fullDate] && hearingsByDate[fullDate].length > 0;
                const isSelected = selectedDate === fullDate;
                const count = hasHearings ? hearingsByDate[fullDate].length : 0;

                return (
                  <div
                    key={day}
                    className={`calendar-day ${hasHearings ? 'has-hearing' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedDate(fullDate);
                      if (onSelectDate) onSelectDate(fullDate, hearingsByDate[fullDate] || []);
                    }}
                  >
                    <span className="day-number">{day}</span>
                    {hasHearings && <span className="hearing-count">{count}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="hearing-calendar">
      <div className="calendar-grid">
        {Array.from({ length: 12 }).map((_, month) => renderMonth(month))}
      </div>

      {selectedDate && hearingsByDate[selectedDate] && (
        <div className="calendar-selected-hearings">
          <h3>Audiências em {new Date(selectedDate).toLocaleDateString('pt-BR')}</h3>
          <div className="hearings-list">
            {hearingsByDate[selectedDate].map(hearing => (
              <div key={hearing.id} className="hearing-detail-card">
                <div className="hearing-header">
                  <strong>{hearing.seiNumber}</strong>
                  <span className="hearing-time">{hearing.hora}</span>
                </div>
                <p className="hearing-objeto">{hearing.objeto}</p>
                <div className="hearing-info">
                  <span>📍 {hearing.setorResponsavel}</span>
                  {hearing.linkSessao && (
                    <a href={hearing.linkSessao} target="_blank" rel="noopener noreferrer" className="link-sessao">
                      Link →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
