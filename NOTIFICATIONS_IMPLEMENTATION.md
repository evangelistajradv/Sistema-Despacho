# 📢 Sistema de Notificações - Guia de Implementação

## 📋 O que foi criado

### Componentes
- ✅ `src/notification-service.js` — Serviço centralizador de notificações
- ✅ `src/NotificationCenter.js` — Modal de central de notificações (com sino piscante)
- ✅ `src/NotificationBanner.js` — Banners flutuantes (toasts)
- ✅ `src/HearingCalendar.js` — Calendário anual de audiências
- ✅ `src/App.css` — Estilos completos

---

## 🔧 Como Integrar no App.js

### 1. Importar os componentes e serviço

```javascript
import NotificationCenter from './NotificationCenter';
import NotificationBanner from './NotificationBanner';
import HearingCalendar from './HearingCalendar';
import {
  addAccompanimentNotification,
  addHearingNotification,
  addBanner
} from './notification-service';
```

### 2. Adicionar estados

Não precisa! O serviço gerencia tudo internamente.

### 3. Renderizar no JSX

#### A. Central de Notificações (na sidebar ou header)
```jsx
{/* Para Acompanhamentos - Chefe de Gabinete e Secretário */}
{(currentUser === 'chefe_gab' || currentUser === 'secretario') && (
  <NotificationCenter 
    type="accompaniments" 
    currentUser={currentUser}
    USUARIOS={USUARIOS}
  />
)}

{/* Para Audiências - Master, Estagiária e Servidor */}
{(currentUser === 'master' || currentUser === 'estagiaria' || currentUser === 'servidora') && (
  <NotificationCenter 
    type="hearings" 
    currentUser={currentUser}
    USUARIOS={USUARIOS}
  />
)}
```

#### B. Banner de Notificações (no final do layout)
```jsx
<NotificationBanner />
```

#### C. Calendário de Audiências (na aba de audiências)
```jsx
{/* Adicionar opção de visualização */}
{viewMode === 'calendar' && (
  <HearingCalendar 
    hearings={hearings}
    onSelectDate={(date, hearingsOnDate) => {
      console.log('Audiências em', date, hearingsOnDate);
    }}
  />
)}
```

---

## 🎯 Triggers de Notificações

### Para Acompanhamentos (Chefe e Secretário)

Após `updateAccompaniment()`:
```javascript
const updateAccompaniment = async (id, updatedData) => {
  // ... código existente ...
  
  // Adicionar notificação
  addAccompanimentNotification(selectedAccompaniment, 'updated');
  addBanner(
    `✏️ Acompanhamento ${selectedAccompaniment.numeroProcesso} foi atualizado`,
    'info'
  );
};
```

Após `updateVerification()`:
```javascript
const updateVerification = async (id) => {
  // ... código existente ...
  
  // Adicionar notificação
  addAccompanimentNotification(selectedAccompaniment, 'verified');
  addBanner(
    `✅ Verificação do processo ${selectedAccompaniment.numeroProcesso} atualizada`,
    'success'
  );
};
```

### Para Audiências (Master, Estagiária, Servidor)

Quando 5 dias antes:
```javascript
// No useEffect que verifica audiências
if (daysUntil === 5 && !hearing.notificado5dias) {
  addHearingNotification(hearing, 'upcoming_5days');
  addBanner(
    `📅 Audiência ${hearing.seiNumber} em 5 dias!`,
    'warning'
  );
}
```

Quando 1 dia antes:
```javascript
if (daysUntil === 1 && !hearing.notificado1dia) {
  addHearingNotification(hearing, 'upcoming_1day');
  addBanner(
    `📅 Audiência ${hearing.seiNumber} AMANHÃ!`,
    'warning'
  );
}
```

---

## 📱 Visualizações de Audiências

### Adicionar opções de visualização na aba de Audiências

```jsx
{activeTab === 'audiencias' && (
  <>
    {/* Seletor de visualização */}
    <div className="view-selector">
      <button 
        className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
        onClick={() => setViewMode('list')}
      >
        📋 Por Processo
      </button>
      <button 
        className={`view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
        onClick={() => setViewMode('timeline')}
      >
        ⏳ Próxima → Remota
      </button>
      <button 
        className={`view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
        onClick={() => setViewMode('calendar')}
      >
        📅 Calendário
      </button>
    </div>

    {/* Renderizar conforme visualização */}
    {viewMode === 'list' && /* código existente */}
    {viewMode === 'timeline' && (
      <div className="list-view">
        {/* Audiências ordenadas por data próxima → remota */}
        {[...hearings]
          .sort((a, b) => new Date(a.data) - new Date(b.data))
          .map(hearing => (
            /* Renderizar card */
          ))}
      </div>
    )}
    {viewMode === 'calendar' && (
      <HearingCalendar hearings={hearings} />
    )}
  </>
)}
```

---

## 🎨 Estilos CSS Inclusos

Todos os estilos necessários já foram adicionados ao `App.css`:
- ✅ `.notification-bell` — Sino com animação de piscar
- ✅ `.notification-modal` — Modal da central
- ✅ `.banner` — Estilos dos banners flutuantes
- ✅ `.calendar-*` — Calendário anual
- ✅ Responsividade mobile

---

## 📊 Exemplo Completo de Integração

```javascript
// 1. Importar
import NotificationCenter from './NotificationCenter';
import NotificationBanner from './NotificationBanner';
import HearingCalendar from './HearingCalendar';
import {
  addAccompanimentNotification,
  addBanner
} from './notification-service';

// 2. Adicionar estado para visualização (se necessário)
const [viewMode, setViewMode] = useState('list'); // para audiências

// 3. Renderizar componentes
return (
  <div className="app-container">
    {/* Sidebar com notificação */}
    {(currentUser === 'chefe_gab' || currentUser === 'secretario') && (
      <NotificationCenter type="accompaniments" currentUser={currentUser} />
    )}

    {/* Main content */}
    <main>
      {/* Aba de audiências com calendário */}
      {activeTab === 'audiencias' && viewMode === 'calendar' && (
        <HearingCalendar hearings={hearings} />
      )}

      {/* ... resto do código ... */}
    </main>

    {/* Banners flutuantes */}
    <NotificationBanner />
  </div>
);

// 4. Usar notificações
const handleAccompanimentChange = () => {
  // ... atualizar acompanhamento ...
  addAccompanimentNotification(accompaniment, 'updated');
  addBanner('Acompanhamento atualizado!', 'success');
};
```

---

## ⚙️ Configurações por Usuário

### Acompanhamentos
```javascript
// Chefe de Gabinete: VÊ notificações
if (currentUser === 'chefe_gab') {
  // <NotificationCenter type="accompaniments" />
}

// Secretário: VÊ notificações
if (currentUser === 'secretario') {
  // <NotificationCenter type="accompaniments" />
}

// Outros: NÃO veem
```

### Audiências
```javascript
// Master, Estagiária, Servidor: VÊ notificações
if (['master', 'estagiaria', 'servidora'].includes(currentUser)) {
  // <NotificationCenter type="hearings" />
}

// Outros: NÃO veem
```

---

## 🚀 Próximos Passos

1. ✅ Integrar componentes no App.js
2. ✅ Adicionar triggers de notificação onde necessário
3. ✅ Testar com diferentes usuários
4. ✅ Validar permissões por usuário
5. ✅ Testar responsividade mobile

---

## 💡 Dicas

- O serviço `notification-service.js` é completamente agnóstico — funciona em qualquer lugar
- Banners auto-removem após 4 segundos (configurável)
- Central de notificações NÃO auto-limpa (conforme solicitado)
- Calendário é totalmente interativo e responsivo
- Todos os componentes têm temas claro/escuro automáticos

---

**Tudo pronto para integração!** 🎉
