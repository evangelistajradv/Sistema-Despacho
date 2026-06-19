import React, { useState, useEffect } from 'react';
import './App.css';
import emailjs from '@emailjs/browser';
import { EMAILJS_CONFIG } from './emailjs-config';
import { db, storage } from './firebase-config';
import { collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import NotificationCenter from './NotificationCenter';
import NotificationBanner from './NotificationBanner';
import HearingCalendar from './HearingCalendar';
import { addBanner } from './notification-service';

const USUARIOS = {
  master: { nome: 'João Evangelista', role: 'master', permissions: ['ver', 'criar', 'editar', 'deletar', 'decidir', 'comentar'] },
  secretario: { nome: 'Feliphe Araújo', role: 'secretario', permissions: ['ver', 'decidir', 'comentar', 'acompanhar', 'despachar'] },
  chefe_gab: { nome: 'Marwin', role: 'chefe_gab', permissions: ['ver', 'decidir', 'comentar', 'acompanhar', 'despachar'] },
  servidora: { nome: 'Isamayla', role: 'servidora', permissions: ['ver', 'editar', 'criar', 'comentar'] },
  estagiaria: { nome: 'Maria Clara', role: 'estagiaria', permissions: ['ver', 'editar', 'criar', 'comentar'] }
};

export default function SistemaDespacho() {
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginUser, setLoginUser] = useState('master');
  const [loginPass, setLoginPass] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [pendingAuto, setPendingAuto] = useState(null); // login automático aguardando config
  const [configLoaded, setConfigLoaded] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [activeTab, setActiveTab] = useState('despacho-gab');
  const [processes, setProcesses] = useState([]);
  const [accompaniments, setAccompaniments] = useState([]);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [selectedAccompaniment, setSelectedAccompaniment] = useState(null);
  const [showDiligenceModal, setShowDiligenceModal] = useState(false);
  const [diligenceText, setDiligenceText] = useState('');
  const [newProcessMode, setNewProcessMode] = useState(false);
  const [newAccompanimentMode, setNewAccompanimentMode] = useState(false);
  const [hearings, setHearings] = useState([]);
  const [selectedHearing, setSelectedHearing] = useState(null);
  const [newHearingMode, setNewHearingMode] = useState(false);
  const [doePublications, setDoePublications] = useState([]);
  const [selectedDoe, setSelectedDoe] = useState(null);
  const [newDoeMode, setNewDoeMode] = useState(false);
  const [doeEmails, setDoeEmails] = useState([]);
  const [accompEmails, setAccompEmails] = useState([]);
  const [newDoeEmail, setNewDoeEmail] = useState('');
  const [newAccompEmail, setNewAccompEmail] = useState('');
  const [showDoeEmailModal, setShowDoeEmailModal] = useState(false);
  const [showAccompEmailModal, setShowAccompEmailModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState(null); // null | 'features' | 'notifications'
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [userPasswords, setUserPasswords] = useState({
    master: '123456', secretario: '123456', chefe_gab: '123456', servidora: '123456', estagiaria: '123456'
  });

  const [newProcess, setNewProcess] = useState({ numero: '', objeto: '', parteInteressada: '', analise: '' });
  const [newAccompaniment, setNewAccompaniment] = useState({ objeto: '', numeroProcesso: '', setorAnterior: '', dataSetorAnterior: '', setorAtual: '', dataSetorAtual: '', status: '' });
  const [newHearing, setNewHearing] = useState({ seiNumber: '', data: '', hora: '', objeto: '', linkSessao: '', setorResponsavel: '', servidoresDesignados: '', emailsNotificacao: '' });
  const [newDoe, setNewDoe] = useState({ dataPublicacao: '', dataDisponibilizacao: '', numeroDiario: '', conteudo: '' });
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [showObservationsModal, setShowObservationsModal] = useState(false);
  const [observationText, setObservationText] = useState('');
  const [hearingViewMode, setHearingViewMode] = useState('list');
  const [pushEnabled, setPushEnabled] = useState(false); // eslint-disable-line no-unused-vars
  const [pushStatusMsg, setPushStatusMsg] = useState('');
  // Estado local de edição dos campos do acompanhamento (evita salvar no Firebase a cada tecla)
  const [accompEdits, setAccompEdits] = useState({});

  // Prazos Judiciais
  const [deadlines, setDeadlines] = useState([]);
  const [selectedDeadline, setSelectedDeadline] = useState(null);
  const [newDeadlineMode, setNewDeadlineMode] = useState(false);
  const [newDeadline, setNewDeadline] = useState({ numeroPJE: '', numeroSEI: '', prazoFatal: '', tipoPrazo: 'longo', objeto: '' });

  // Edição inline de audiências
  const [hearingEdits, setHearingEdits] = useState({});

  // Configuração de quais usuários recebem push por tipo (gerenciado pelo master)
  const DEFAULT_PUSH_CONFIG = {
    audiencias:      { master: false, secretario: false, chefe_gab: false, servidora: true,  estagiaria: true  },
    acompanhamentos: { master: false, secretario: true,  chefe_gab: true,  servidora: false, estagiaria: false },
    doe:             { master: false, secretario: true,  chefe_gab: true,  servidora: false, estagiaria: false },
    prazos:          { master: true,  secretario: true,  chefe_gab: true,  servidora: true,  estagiaria: true  },
  };
  const [pushNotifConfig, setPushNotifConfig] = useState(DEFAULT_PUSH_CONFIG);

  // Configuração de quais abas cada usuário pode visualizar (gerenciado pelo master)
  const TABS = [
    { id: 'despacho-gab',    label: 'Despachos',         icon: 'ti-gavel' },
    { id: 'acompanhamentos', label: 'Acompanhamentos',   icon: 'ti-map-pin' },
    { id: 'audiencias',      label: 'Audiências',        icon: 'ti-calendar-event' },
    { id: 'doe',             label: 'DOE/PI',            icon: 'ti-news' },
    { id: 'prazos',          label: 'Prazos Judiciais',  icon: 'ti-scale' },
  ];
  const DEFAULT_TAB_VISIBILITY = TABS.reduce((acc, t) => {
    acc[t.id] = { master: true, secretario: true, chefe_gab: true, servidora: true, estagiaria: true };
    return acc;
  }, {});
  const [tabVisibility, setTabVisibility] = useState(DEFAULT_TAB_VISIBILITY);

  // master sempre vê tudo; demais respeitam a configuração (default = visível)
  const tabVisible = (tabId) => currentUser === 'master' || tabVisibility[tabId]?.[currentUser] !== false;

  // Permissões configuráveis pelo master (leitura/criação/edição/exclusão).
  // O default vem das permissões fixas em USUARIOS.
  const PERMISSION_ACTIONS = [
    { key: 'ver',     label: 'Leitura' },
    { key: 'criar',   label: 'Criação' },
    { key: 'editar',  label: 'Edição' },
    { key: 'deletar', label: 'Exclusão' },
  ];
  const DEFAULT_USER_PERMISSIONS = Object.keys(USUARIOS).reduce((acc, role) => {
    acc[role] = PERMISSION_ACTIONS.reduce((p, a) => {
      p[a.key] = USUARIOS[role].permissions.includes(a.key);
      return p;
    }, {});
    return acc;
  }, {});
  const [userPermissions, setUserPermissions] = useState(DEFAULT_USER_PERMISSIONS);

  // ─── Helpers para Push Notifications ───────────────────────────────────────

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  };

  const registerPushSubscription = async (userRole) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatusMsg('❌ Navegador não suporta notificações push');
      return;
    }
    const vapidKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setPushStatusMsg('❌ Chave VAPID não configurada no servidor');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatusMsg('❌ Permissão de notificação negada');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const subData = subscription.toJSON();
      const docRef = doc(db, 'pushSubscriptions', userRole);
      const existing = await getDoc(docRef);
      let subs = existing.exists() ? (existing.data().subscriptions || []) : [];
      subs = subs.filter((s) => s.endpoint !== subData.endpoint);
      subs.push(subData);
      await setDoc(docRef, { subscriptions: subs });
      setPushEnabled(true);
      setPushStatusMsg('✅ Este dispositivo está registrado para notificações');
      console.log('✅ Push subscription registrada para:', userRole);
    } catch (e) {
      setPushStatusMsg(`❌ Falhou: ${e.message}`);
      console.warn('⚠️ Push subscription falhou:', e.message);
    }
  };

  const sendPushForType = async (type, notification) => {
    if (!process.env.REACT_APP_VAPID_PUBLIC_KEY) return;
    try {
      const config = pushNotifConfig[type] || {};
      const roles = Object.entries(config).filter(([, enabled]) => enabled).map(([role]) => role);
      if (roles.length === 0) return;
      const allSubs = [];
      for (const role of roles) {
        const snap = await getDoc(doc(db, 'pushSubscriptions', role));
        if (snap.exists()) allSubs.push(...(snap.data().subscriptions || []));
      }
      if (allSubs.length === 0) return;
      await fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptions: allSubs, notification }),
      });
    } catch (e) {
      console.warn('⚠️ sendPushForType falhou:', e.message);
    }
  };

  // Cria uma notificação persistida no Firebase (aparece no sino/Central para todos
  // os usuários do público-alvo) e dispara o push para os mesmos usuários.
  // Como o sino lê do Firebase e o push carrega o id do documento, marcar como lida
  // em qualquer um dos canais reflete no outro.
  const createNotification = async (category, { title, main, secondary, icon, tab }) => {
    try {
      const config = pushNotifConfig[category] || {};
      const audience = Object.entries(config).filter(([, on]) => on).map(([role]) => role);
      if (audience.length === 0) return;

      const ref = await addDoc(collection(db, 'notificacoes'), {
        category,
        title: title || '',
        main: main || '',
        secondary: secondary || '',
        icon: icon || '🔔',
        tab: tab || '',
        audience,
        readBy: {},
        clearedBy: [],
        createdAt: new Date().toISOString(),
      });

      // push para os mesmos usuários, carregando o id da notificação (tag = notifId)
      // para permitir sincronizar o estado de "lida" entre celular e sino.
      sendPushForType(category, {
        title: title || 'ASSTEC',
        body: `${main || ''}${secondary ? '\n' + secondary : ''}`.substring(0, 150),
        tab: tab || '',
        tag: ref.id,
        notifId: ref.id,
      });
    } catch (e) {
      console.warn('⚠️ createNotification falhou:', e.message);
    }
  };

  const parseEmails = (emailString) => {
    if (!emailString) return [];
    return emailString.split(/[,;]/).map(e => e.trim()).filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  };

  // ─── Segurança: hash de senha (SHA-256) ────────────────────────────────────
  const hashPassword = async (text) => {
    try {
      const enc = new TextEncoder().encode(text);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Sem WebCrypto (contexto não seguro): mantém comportamento legado
      return text;
    }
  };
  const isHash = (s) => typeof s === 'string' && /^[a-f0-9]{64}$/i.test(s);

  // Carrega o login salvo no localStorage se ainda válido (1 ano = 365 dias).
  // Novo formato guarda apenas um token (hash da senha) — nunca a senha legível.
  useEffect(() => {
    const saved = localStorage.getItem('asstec_login');
    if (!saved) return;
    try {
      const data = JSON.parse(saved);
      const ageDays = (Date.now() - data.timestamp) / (1000 * 60 * 60 * 24);
      if (ageDays >= 365) { localStorage.removeItem('asstec_login'); return; }
      if (data.user) setLoginUser(data.user);
      setRememberMe(true);
      if (data.token) {
        // formato novo: login automático após a config carregar
        setPendingAuto({ user: data.user, token: data.token });
      } else if (data.pass) {
        // formato antigo (senha em base64): apenas pré-preenche o campo
        try { setLoginPass(decodeURIComponent(escape(atob(data.pass)))); }
        catch { try { setLoginPass(atob(data.pass)); } catch (e) { /* ignora */ } }
      }
    } catch (e) {
      console.warn('Erro ao carregar login salvo:', e);
    }
  }, []);

  // Tema - apenas local (preferência de cada dispositivo)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // EmailJS
  useEffect(() => {
    if (EMAILJS_CONFIG.PUBLIC_KEY && EMAILJS_CONFIG.PUBLIC_KEY !== 'SEU_PUBLIC_KEY_AQUI') {
      try { emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY); console.log('✅ EmailJS inicializado'); }
      catch (e) { console.warn('⚠️ Erro EmailJS:', e.message); }
    }
  }, []);

  // Firebase - Sincronização em tempo real entre TODOS os usuários
  useEffect(() => {
    console.log('🔥 Conectando ao Firebase...');

    const unsubProcesses = onSnapshot(
      collection(db, 'processos'),
      (snap) => { setProcesses(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      (err) => { console.error('❌ Erro processos Firebase:', err.message); }
    );
    const unsubAcc = onSnapshot(
      collection(db, 'acompanhamentos'),
      (snap) => { setAccompaniments(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      (err) => { console.error('❌ Erro acompanhamentos Firebase:', err.message); }
    );
    const unsubHearings = onSnapshot(
      collection(db, 'audiencias'),
      (snap) => { setHearings(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      (err) => { console.error('❌ Erro audiências Firebase:', err.message); }
    );
    const unsubDoe = onSnapshot(
      collection(db, 'doe'),
      (snap) => { setDoePublications(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      (err) => { console.error('❌ Erro DOE Firebase:', err.message); }
    );
    const unsubDeadlines = onSnapshot(
      collection(db, 'prazos'),
      (snap) => { setDeadlines(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      (err) => { console.error('❌ Erro prazos Firebase:', err.message); }
    );
    const unsubConfig = onSnapshot(
      doc(db, 'config', 'dados'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          console.log('✅ Config carregada do Firebase:', data);
          if (data.doeEmails) setDoeEmails(data.doeEmails);
          if (data.accompEmails) setAccompEmails(data.accompEmails);
          if (data.userPasswords) setUserPasswords(data.userPasswords);
          if (data.pushNotifConfig) setPushNotifConfig(data.pushNotifConfig);
          if (data.tabVisibility) setTabVisibility(data.tabVisibility);
          if (data.userPermissions) setUserPermissions(data.userPermissions);
        } else {
          console.log('ℹ️ Config ainda não existe no Firebase - será criada ao salvar');
        }
        setConfigLoaded(true);
      },
      (err) => { console.error('❌ Erro config Firebase:', err.message); setConfigLoaded(true); }
    );

    return () => { unsubProcesses(); unsubAcc(); unsubHearings(); unsubDoe(); unsubDeadlines(); unsubConfig(); };
  }, []);

  const saveConfig = async (newDoeEmails, newAccompEmails, newPasswords, newPushConfig, newTabVisibility, newUserPermissions) => {
    try {
      const payload = {
        doeEmails: newDoeEmails !== null ? newDoeEmails : doeEmails,
        accompEmails: newAccompEmails !== null ? newAccompEmails : accompEmails,
        userPasswords: newPasswords !== null ? newPasswords : userPasswords,
        pushNotifConfig: newPushConfig !== undefined ? newPushConfig : pushNotifConfig,
        tabVisibility: newTabVisibility !== undefined ? newTabVisibility : tabVisibility,
        userPermissions: newUserPermissions !== undefined ? newUserPermissions : userPermissions,
      };
      console.log('💾 Salvando config no Firebase:', payload);
      await setDoc(doc(db, 'config', 'dados'), payload, { merge: true });
      console.log('✅ Config salva com sucesso!');
    } catch (e) {
      console.error('❌ ERRO ao salvar config no Firebase:', e.message);
      alert('Erro ao salvar no banco de dados. Verifique o console (F12) e as regras do Firebase.');
    }
  };

  const finishLogin = (role) => {
    setAuthenticated(true);
    setCurrentUser(role);
    setLoginPass('');
    setPendingAuto(null);
    setTimeout(() => registerPushSubscription(role), 1500);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const user = USUARIOS[loginUser];
    if (!user) { alert('Usuário inválido'); return; }
    const stored = userPasswords[loginUser];
    const typedHash = await hashPassword(loginPass);
    // aceita hash novo OU senha em texto puro (formato antigo, durante a migração)
    const ok = stored === typedHash || stored === loginPass;
    if (!ok) { alert('Usuário ou senha inválida'); return; }

    // migra automaticamente senhas em texto puro para hash no banco
    if (stored === loginPass && !isHash(stored)) {
      const upgraded = { ...userPasswords, [loginUser]: typedHash };
      setUserPasswords(upgraded);
      saveConfig(null, null, upgraded);
    }

    if (rememberMe) {
      // guarda apenas o token (hash) — nunca a senha legível
      try {
        localStorage.setItem('asstec_login', JSON.stringify({
          user: loginUser,
          token: typedHash,
          timestamp: Date.now(),
        }));
      } catch (err) {
        console.warn('Não foi possível salvar o login neste dispositivo:', err.message);
      }
    } else {
      localStorage.removeItem('asstec_login');
    }
    finishLogin(loginUser);
  };

  // Login automático quando há credencial lembrada (token) e a config já carregou
  useEffect(() => {
    if (!pendingAuto || authenticated || !configLoaded) return;
    let cancelled = false;
    (async () => {
      const stored = userPasswords[pendingAuto.user];
      if (!stored) return;
      const ok = stored === pendingAuto.token || (await hashPassword(stored)) === pendingAuto.token;
      if (ok && !cancelled) finishLogin(pendingAuto.user);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuto, configLoaded, userPasswords, authenticated]);

  // Navegação a partir do clique em notificação push (service worker envia mensagem)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE') {
        const { tab, notifId } = event.data;
        if (tab) setActiveTab(tab);
        // clicar no push do celular marca a notificação como lida no sino também
        if (notifId && currentUser) {
          updateDoc(doc(db, 'notificacoes', notifId), { [`readBy.${currentUser}`]: true })
            .catch((e) => console.warn('⚠️ Falha ao marcar push como lido:', e.message));
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [currentUser]);

  // Navega para aba correta se app foi aberto por clique em notificação (?tab=...)
  useEffect(() => {
    if (!authenticated) return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) setActiveTab(tab);
    const notifId = params.get('notifId');
    if (notifId && currentUser) {
      updateDoc(doc(db, 'notificacoes', notifId), { [`readBy.${currentUser}`]: true })
        .catch(() => {});
    }
  }, [authenticated, currentUser]);

  // Se a aba ativa não for permitida para o usuário, redireciona para a primeira visível
  useEffect(() => {
    if (!authenticated) return;
    if (!tabVisible(activeTab)) {
      const first = TABS.find((t) => tabVisible(t.id));
      if (first) setActiveTab(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, currentUser, tabVisibility, activeTab]);

  const handleLogout = () => { setAuthenticated(false); setCurrentUser(null); setLoginPass(''); };

  const can = (action) => {
    if (!currentUser) return false;
    if (currentUser === 'master') return true; // master tem acesso total
    // ações configuráveis pelo master (leitura/criação/edição/exclusão)
    const configurable = ['ver', 'criar', 'editar', 'deletar'];
    if (configurable.includes(action)) {
      const cfg = userPermissions[currentUser];
      if (cfg && typeof cfg[action] === 'boolean') return cfg[action];
    }
    return USUARIOS[currentUser]?.permissions.includes(action);
  };

  const createNewProcess = async () => {
    if (!newProcess.numero || !newProcess.objeto) { alert('Preencha campos obrigatórios'); return; }
    if (loading) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'processos'), {
        type: 'gabinete', numero: newProcess.numero, objeto: newProcess.objeto,
        parteInteressada: newProcess.parteInteressada, analise: newProcess.analise,
        dataEntrada: new Date().toISOString().split('T')[0], status: 'pendente',
        dataDespacho: null, despachado: false, motivo: ''
      });
      setNewProcess({ numero: '', objeto: '', parteInteressada: '', analise: '' });
      setNewProcessMode(false);
    } catch (e) { console.error('❌ Erro:', e.message); alert('Erro ao salvar. Verifique as regras do Firebase.'); }
    finally { setLoading(false); }
  };

  const deleteProcess = async (id) => { await deleteDoc(doc(db, 'processos', id)); setSelectedProcess(null); };

  const createNewAccompaniment = async () => {
    if (!newAccompaniment.objeto || !newAccompaniment.numeroProcesso) { alert('Preencha campos obrigatórios'); return; }
    if (loading) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'acompanhamentos'), {
        ...newAccompaniment, dataUltimaEdicao: new Date().toISOString().split('T')[0], verificacaoAtualizada: false
      });
      setNewAccompaniment({ objeto: '', numeroProcesso: '', setorAnterior: '', dataSetorAnterior: '', setorAtual: '', dataSetorAtual: '', status: '' });
      setNewAccompanimentMode(false);
    } catch (e) { console.error('❌ Erro:', e.message); alert('Erro ao salvar. Verifique as regras do Firebase.'); }
    finally { setLoading(false); }
  };

  const updateAccompaniment = async (id, updatedData) => {
    const updated = { ...updatedData, dataUltimaEdicao: new Date().toISOString().split('T')[0], verificacaoAtualizada: false };
    await updateDoc(doc(db, 'acompanhamentos', id), updated);
    const newSelected = { ...selectedAccompaniment, ...updated };
    setSelectedAccompaniment(newSelected);

    // Envia notificações com detalhes da mudança
    const fieldLabels = {
      objeto: 'Descrição',
      setorAnterior: 'Setor Anterior',
      dataSetorAnterior: 'Data Setor Anterior',
      setorAtual: 'Setor Atual',
      dataSetorAtual: 'Data Setor Atual',
      status: 'Status'
    };

    const changedFields = Object.entries(updatedData)
      .map(([key, value]) => `${fieldLabels[key] || key}: ${value || '(vazio)'}`)
      .join(' • ');

    if (notifEnabled('acompanhamentos')) {
      addBanner(`📍 ${newSelected.numeroProcesso} atualizado`, 'info');
    }
    createNotification('acompanhamentos', {
      title: '📍 Nova movimentação',
      icon: '📍',
      main: `Processo ${newSelected.numeroProcesso}`,
      secondary: changedFields.substring(0, 120),
      tab: 'acompanhamentos',
    });
  };

  const notifEnabled = (type) => pushNotifConfig[type]?.[currentUser] !== false;

  const updateVerification = async (id) => {
    const hoje = new Date().toISOString().split('T')[0];
    await updateDoc(doc(db, 'acompanhamentos', id), { verificacaoAtualizada: true, dataUltimaVerificacao: hoje });
    const newSelected = { ...selectedAccompaniment, verificacaoAtualizada: true, dataUltimaVerificacao: hoje };
    setSelectedAccompaniment(newSelected);
    // Apenas verificação (sem movimentação/edição de dados): NÃO dispara nenhuma
    // notificação — nem sino, nem banner, nem push. (requisito 1)
  };

  const deleteAccompaniment = async (id) => { await deleteDoc(doc(db, 'acompanhamentos', id)); setSelectedAccompaniment(null); };

  const handleDispatch = (action) => {
    if (action === 'prosseguimento') { setShowObservationsModal(true); }
    else if (action === 'diligencia') { setShowDiligenceModal(true); }
    else { finalizarDespacho(action, ''); }
  };

  const finalizarDespacho = async (action, diligencia, observacoes = '') => {
    const updatedProcess = {
      despachado: true, dataDespacho: new Date().toISOString().split('T')[0],
      motivo: action === 'diligencia' ? diligencia : action,
      status: action === 'prosseguimento' ? 'deferido' : action === 'nao-autorizo' ? 'indeferido' : 'diligencia'
    };
    if (observacoes) updatedProcess.observacoes = observacoes;
    await updateDoc(doc(db, 'processos', selectedProcess.id), updatedProcess);
    setSelectedProcess({ ...selectedProcess, ...updatedProcess });
    setShowDiligenceModal(false);
    setDiligenceText('');
    setShowObservationsModal(false);
    setObservationText('');
  };

  const createNewHearing = async () => {
    if (!newHearing.seiNumber || !newHearing.data) { alert('Preencha campos obrigatórios'); return; }
    if (loading) return;
    setLoading(true);
    try {
      const hearing = { ...newHearing, emailsNotificacao: parseEmails(newHearing.emailsNotificacao) };
      await addDoc(collection(db, 'audiencias'), hearing);
      // NÃO enviar email imediatamente - o verificador vai enviar nos prazos certos
      setNewHearing({ seiNumber: '', data: '', hora: '', objeto: '', linkSessao: '', setorResponsavel: '', servidoresDesignados: '', emailsNotificacao: '' });
      setNewHearingMode(false);
    } catch (e) { console.error('❌ Erro:', e.message); alert('Erro ao salvar. Verifique as regras do Firebase.'); }
    finally { setLoading(false); }
  };

  const deleteHearing = async (id) => { await deleteDoc(doc(db, 'audiencias', id)); setSelectedHearing(null); };

  const [loading, setLoading] = useState(false);

  const createNewDoe = async () => {
    if (!newDoe.dataPublicacao || !newDoe.conteudo) { alert('Preencha campos obrigatórios'); return; }
    if (loading) return; // Evitar duplo clique
    
    setLoading(true);
    const emailsParaEnvio = [...doeEmails];
    
    try {
      const doe = { ...newDoe, criadoEm: new Date().toISOString() };
      await addDoc(collection(db, 'doe'), doe);

      // Manter apenas 7 últimos - deletar os mais velhos
      const sorted = [...doePublications].sort((a, b) => new Date(b.dataPublicacao) - new Date(a.dataPublicacao));
      if (sorted.length >= 7) {
        for (const old of sorted.slice(6)) {
          await deleteDoc(doc(db, 'doe', old.id));
        }
      }

      if (emailsParaEnvio.length > 0) sendDoeNotification(doe, emailsParaEnvio);

      if (notifEnabled('doe')) {
        addBanner(`📰 DOE/PI publicado — Diário #${newDoe.numeroDiario || 'S/N'}`, 'info');
      }
      createNotification('doe', {
        title: '📰 Nova Publicação no DOE',
        icon: '📰',
        main: `Diário #${newDoe.numeroDiario || 'S/N'} — ${new Date(newDoe.dataPublicacao).toLocaleDateString('pt-BR')}`,
        secondary: `${newDoe.conteudo.replace(/\*([^*]+)\*/g, '$1').substring(0, 100)}...`,
        tab: 'doe',
      });

      setNewDoe({ dataPublicacao: '', dataDisponibilizacao: '', numeroDiario: '', conteudo: '' });
      setNewDoeMode(false);
    } catch (e) {
      console.error('❌ Erro ao criar DOE:', e.message);
      alert('Erro ao salvar. Verifique as regras do Firebase.');
    } finally {
      setLoading(false);
    }
  };

  const deleteDoe = async (id) => { await deleteDoc(doc(db, 'doe', id)); setSelectedDoe(null); };

  const addDoeEmail = async () => {
    const emails = parseEmails(newDoeEmail);
    const updated = [...doeEmails, ...emails.filter(e => !doeEmails.includes(e))];
    setDoeEmails(updated);
    await saveConfig(updated, null, null);
    setNewDoeEmail('');
  };

  const removeDoeEmail = async (email) => {
    const updated = doeEmails.filter(e => e !== email);
    setDoeEmails(updated);
    await saveConfig(updated, null, null);
  };

  const addAccompEmail = async () => {
    const emails = parseEmails(newAccompEmail);
    const updated = [...accompEmails, ...emails.filter(e => !accompEmails.includes(e))];
    setAccompEmails(updated);
    await saveConfig(null, updated, null);
    setNewAccompEmail('');
  };

  const removeAccompEmail = async (email) => {
    const updated = accompEmails.filter(e => e !== email);
    setAccompEmails(updated);
    await saveConfig(null, updated, null);
  };

  const formatDoeContent = (content) => {
    if (!content) return '';
    // Substitui quebras duplas/triplas por marcador
    let text = content.replace(/\n{2,}/g, '|||PARAGRAPH|||');
    // Limpa quebras simples restantes
    text = text.replace(/\n/g, ' ');
    // Divide por parágrafo
    const paragraphs = text.split('|||PARAGRAPH|||').filter(p => p.trim());
    return paragraphs
      .map(para => {
        const formatted = para
          .trim()
          .replace(/\*([^*]+)\*/g, '<strong style="font-weight:700">$1</strong>');
        return `<div style="margin-bottom:1rem; line-height:1.7; font-size:14px">${formatted}</div>`;
      })
      .join('');
  };

  const sendDoeNotification = async (doe, emailsList) => {
    try {
      const recipientEmails = (emailsList || []).map(e => String(e).trim()).filter(e => e.length > 0);
      if (recipientEmails.length === 0) return;
      const formattedContent = formatDoeContent(doe.conteudo);
      for (const email of recipientEmails) {
        await emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATES.DOE, {
          to_email: email, to_name: email,
          publication_date: new Date(doe.dataPublicacao).toLocaleDateString('pt-BR'),
          diary_number: doe.numeroDiario || 'S/N',
          content: formattedContent
        }, EMAILJS_CONFIG.PUBLIC_KEY);
        console.log('✅ Email DOE enviado para:', email);
      }
    } catch (e) { console.error('❌ Erro DOE:', e.text || e.message); }
  };

  // ─── Upload de PDFs (Firebase Storage) ─────────────────────────────────────
  const validatePdf = (file) => {
    if (!file) return false;
    if (file.type !== 'application/pdf') { alert('Selecione um arquivo PDF.'); return false; }
    if (file.size > 15 * 1024 * 1024) { alert('PDF muito grande (máximo 15 MB).'); return false; }
    return true;
  };

  const uploadPdf = async (file, pathPrefix) => {
    const safeName = file.name.replace(/[^\w.\-() ]+/g, '_');
    const path = `${pathPrefix}/${Date.now()}-${safeName}`;
    const r = storageRef(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    return { url, nome: file.name, storagePath: path, adicionadoEm: new Date().toISOString() };
  };

  // Anexa PDF a uma entidade que guarda os anexos no campo `documentos` (processos, acompanhamentos)
  const handleUploadDoc = async (e, collectionName, entity, setEntity) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!validatePdf(file) || !entity?.id) return;
    setUploadingDoc(true);
    try {
      const meta = await uploadPdf(file, `${collectionName}/${entity.id}`);
      const docs = [...(entity.documentos || []), meta];
      await updateDoc(doc(db, collectionName, entity.id), { documentos: docs });
      setEntity((prev) => ({ ...prev, documentos: docs }));
    } catch (err) {
      console.error('❌ Erro upload PDF:', err);
      alert('Erro ao enviar o PDF. Verifique as regras do Firebase Storage. ' + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleRemoveDoc = async (collectionName, entity, setEntity, index) => {
    const docs = entity.documentos || [];
    const target = docs[index];
    const updated = docs.filter((_, i) => i !== index);
    await updateDoc(doc(db, collectionName, entity.id), { documentos: updated });
    setEntity((prev) => ({ ...prev, documentos: updated }));
    if (target?.storagePath) {
      try { await deleteObject(storageRef(storage, target.storagePath)); } catch (e) { /* arquivo já removido */ }
    }
  };

  // Anexa um único PDF a uma publicação do DOE
  const handleUploadDoePdf = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!validatePdf(file) || !selectedDoe?.id) return;
    setUploadingDoc(true);
    try {
      const meta = await uploadPdf(file, `doe/${selectedDoe.id}`);
      const upd = { pdfUrl: meta.url, pdfNome: meta.nome, pdfPath: meta.storagePath };
      await updateDoc(doc(db, 'doe', selectedDoe.id), upd);
      setSelectedDoe((prev) => ({ ...prev, ...upd }));
    } catch (err) {
      console.error('❌ Erro upload PDF DOE:', err);
      alert('Erro ao enviar o PDF. Verifique as regras do Firebase Storage. ' + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleRemoveDoePdf = async () => {
    const path = selectedDoe?.pdfPath;
    await updateDoc(doc(db, 'doe', selectedDoe.id), { pdfUrl: null, pdfNome: null, pdfPath: null });
    setSelectedDoe((prev) => ({ ...prev, pdfUrl: null, pdfNome: null, pdfPath: null }));
    if (path) {
      try { await deleteObject(storageRef(storage, path)); } catch (e) { /* arquivo já removido */ }
    }
  };

  // Bloco reutilizável de anexos em PDF (processos / acompanhamentos)
  const renderAttachments = (collectionName, entity, setEntity) => (
    <div className="info-box">
      <label>📎 Documentos Anexados (PDF)</label>
      <div className="attachments">
        {(entity.documentos || []).length > 0 ? (
          (entity.documentos || []).map((docItem, i) => (
            <div key={i} className="attachment-item">
              <a href={docItem.url} target="_blank" rel="noopener noreferrer" className="attachment-link">
                <i className="ti ti-file-type-pdf"></i><span>{docItem.nome}</span>
              </a>
              {can('editar') && (
                <button type="button" className="attachment-remove" title="Remover"
                  onClick={() => handleRemoveDoc(collectionName, entity, setEntity, i)}>✕</button>
              )}
            </div>
          ))
        ) : (
          <p className="attachment-empty">Nenhum documento anexado</p>
        )}
        {can('editar') && (
          <label className={`upload-btn ${uploadingDoc ? 'disabled' : ''}`}>
            <i className="ti ti-upload"></i> {uploadingDoc ? 'Enviando...' : 'Enviar PDF'}
            <input type="file" accept="application/pdf" disabled={uploadingDoc}
              onChange={(e) => handleUploadDoc(e, collectionName, entity, setEntity)} style={{ display: 'none' }} />
          </label>
        )}
      </div>
    </div>
  );

  // Verificar audiências e enviar emails nos prazos certos (5 dias e 1 dia antes)
  // Usa flags no Firestore (notificado5dias / notificado1dia) para evitar emails duplicados
  useEffect(() => {
    if (hearings.length === 0) return;

    const checkAndSendHearingEmails = async () => {
      const now = new Date();
      for (const hearing of hearings) {
        if (!hearing.emailsNotificacao || hearing.emailsNotificacao.length === 0) continue;
        const hearingDate = new Date(hearing.data);
        const daysUntil = Math.floor((hearingDate - now) / (1000 * 60 * 60 * 24));

        const deveEnviar5 = daysUntil === 5 && !hearing.notificado5dias;
        const deveEnviar1 = daysUntil === 1 && !hearing.notificado1dia;

        if (!deveEnviar5 && !deveEnviar1) continue;

        const diasMsg = deveEnviar5 ? '5 dias' : 'AMANHÃ';
        const templateId = deveEnviar5 ? EMAILJS_CONFIG.TEMPLATES.HEARING_5DAYS : EMAILJS_CONFIG.TEMPLATES.HEARING_1DAY;
        try {
          const recipientEmails = hearing.emailsNotificacao.map(e => String(e).trim()).filter(e => e.length > 0);
          for (const email of recipientEmails) {
            await emailjs.send(EMAILJS_CONFIG.SERVICE_ID, templateId, {
              to_email: email, to_name: email,
              hearing_date: new Date(hearing.data).toLocaleDateString('pt-BR'),
              hearing_time: hearing.hora || 'A definir',
              process_number: hearing.seiNumber,
              conference_link: hearing.linkSessao || 'Link não informado'
            }, EMAILJS_CONFIG.PUBLIC_KEY);
          }
          // Marca no Firestore que a notificação já foi enviada (evita duplicidade entre dispositivos)
          const flag = deveEnviar5 ? { notificado5dias: true } : { notificado1dia: true };
          await updateDoc(doc(db, 'audiencias', hearing.id), flag);

          // Notificação (sino + push) — disparada uma única vez, junto do flag
          if (notifEnabled('audiencias')) {
            addBanner(`📅 Audiência ${hearing.seiNumber} em ${diasMsg}!`, 'warning');
          }
          createNotification('audiencias', {
            title: `📅 Audiência em ${diasMsg}`,
            icon: '📅',
            main: `Processo ${hearing.seiNumber}`,
            secondary: `${new Date(hearing.data).toLocaleDateString('pt-BR')} às ${hearing.hora || 'horário a definir'}`,
            tab: 'audiencias',
          });
          console.log(`✅ Email audiência (${deveEnviar5 ? 5 : 1} dias antes) enviado e flag salvo`);
        } catch (e) {
          console.error('❌ Erro audiência:', e.text || e.message);
        }
      }
    };

    checkAndSendHearingEmails();
    const interval = setInterval(checkAndSendHearingEmails, 3600000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hearings]);

  // Verificar prazos judiciais e disparar notificações
  useEffect(() => {
    if (deadlines.length === 0) return;
    const checkDeadlines = async () => {
      const now = new Date();
      for (const dl of deadlines) {
        if (!dl.prazoFatal) continue;
        const prazoDate = new Date(dl.prazoFatal + 'T23:59:59');
        const daysLeft = Math.ceil((prazoDate - now) / (1000 * 60 * 60 * 24));
        if (daysLeft < 0) continue;

        const isShort = dl.tipoPrazo === 'curto';
        const notifDays = isShort ? [5, 3, 2] : [10, 5, 3];
        const flagMap = { 10: 'notificado10dias', 5: 'notificado5dias', 3: 'notificado3dias', 2: 'notificado2dias' };

        for (const d of notifDays) {
          if (daysLeft === d && !dl[flagMap[d]]) {
            try {
              // marca o flag primeiro (evita duplicidade entre dispositivos)
              await updateDoc(doc(db, 'prazos', dl.id), { [flagMap[d]]: true });
              if (notifEnabled('prazos')) {
                addBanner(`⚖️ Prazo ${dl.numeroPJE || dl.numeroSEI} vence em ${d} dia(s)!`, 'warning');
              }
              createNotification('prazos', {
                title: `⚖️ Prazo Judicial — ${d} dia(s)`,
                icon: '⚖️',
                main: `Processo ${dl.numeroPJE || dl.numeroSEI}`,
                secondary: `${dl.objeto ? dl.objeto.substring(0, 80) + ' — ' : ''}Vence em ${new Date(dl.prazoFatal).toLocaleDateString('pt-BR')}`,
                tab: 'prazos',
              });
            } catch (e) { console.warn('⚠️ Erro ao marcar flag prazo:', e.message); }
          }
        }
      }
    };
    checkDeadlines();
    const interval = setInterval(checkDeadlines, 3600000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlines]);

  const updateHearing = async (id, updatedData) => {
    await updateDoc(doc(db, 'audiencias', id), updatedData);
    setSelectedHearing(prev => ({ ...prev, ...updatedData }));
  };

  const createNewDeadline = async () => {
    if (!newDeadline.numeroPJE || !newDeadline.prazoFatal) { alert('Preencha os campos obrigatórios'); return; }
    if (loading) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'prazos'), {
        ...newDeadline,
        criadoEm: new Date().toISOString(),
        notificado10dias: false, notificado5dias: false,
        notificado3dias: false, notificado2dias: false
      });
      setNewDeadline({ numeroPJE: '', numeroSEI: '', prazoFatal: '', tipoPrazo: 'longo', objeto: '' });
      setNewDeadlineMode(false);
    } catch (e) { console.error('❌ Erro:', e.message); alert('Erro ao salvar. Verifique as regras do Firebase.'); }
    finally { setLoading(false); }
  };

  const deleteDeadline = async (id) => { await deleteDoc(doc(db, 'prazos', id)); setSelectedDeadline(null); };

  const handleChangePassword = async () => {
    setPasswordError(''); setPasswordMessage('');
    if (!currentPassword || !newPassword || !confirmPassword) { setPasswordError('Preencha todos os campos'); return; }
    const stored = userPasswords[currentUser];
    const curHash = await hashPassword(currentPassword);
    const okCurrent = stored === curHash || stored === currentPassword;
    if (!okCurrent) { setPasswordError('Senha atual incorreta'); return; }
    if (newPassword.length < 6) { setPasswordError('Nova senha deve ter no mínimo 6 caracteres'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('As senhas não coincidem'); return; }
    const newHash = await hashPassword(newPassword);
    const updatedPasswords = { ...userPasswords, [currentUser]: newHash };
    setUserPasswords(updatedPasswords);
    await saveConfig(null, null, updatedPasswords);
    // se este dispositivo lembra o login, atualiza o token para a nova senha
    try {
      const saved = localStorage.getItem('asstec_login');
      if (saved) {
        const d = JSON.parse(saved);
        if (d.user === currentUser) {
          delete d.pass;
          d.token = newHash;
          d.timestamp = Date.now();
          localStorage.setItem('asstec_login', JSON.stringify(d));
        }
      }
    } catch (e) { /* ignora */ }
    setPasswordMessage('Senha alterada com sucesso!');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setTimeout(() => { setPasswordMessage(''); setShowSettings(false); }, 2000);
  };

  if (!authenticated) {
    return (
      <div className="login-container" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/passaros-wallpaper.jpg)` }}>
        <div className="login-overlay"></div>
        <form className="login-form" onSubmit={handleLogin}>
          <div className="logo-login"><span className="logo-icon">⚖️</span><h1>ASSTEC</h1></div>
          <p className="login-subtitle">Sistema de Gestão Processual</p>
          <div className="form-group">
            <label htmlFor="usuario">Usuário</label>
            <select id="usuario" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} className="login-input">
              <option value="master">Master</option>
              <option value="secretario">{USUARIOS.secretario.nome}</option>
              <option value="chefe_gab">{USUARIOS.chefe_gab.nome}</option>
              <option value="servidora">{USUARIOS.servidora.nome}</option>
              <option value="estagiaria">{USUARIOS.estagiaria.nome}</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="senha">Senha</label>
            <input id="senha" type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} placeholder="Digite sua senha" className="login-input" />
          </div>
          <div className="form-group" style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'1.2rem'}}>
            <input id="remember" type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} style={{width:'16px', height:'16px', cursor:'pointer'}} />
            <label htmlFor="remember" style={{margin:0, fontSize:'13px', fontWeight:'500', color:'var(--neutral-600)', cursor:'pointer'}}>
              Lembrar login e senha (1 ano)
            </label>
          </div>
          <button type="submit" className="login-button">Entrar no Sistema</button>
          <p className="login-footer">Credenciais: Use a senha <strong>123456</strong></p>
        </form>
      </div>
    );
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="logo-btn" onClick={() => setActiveTab('despacho-gab')} title="Voltar ao início">
            <span className="logo-icon"><i className="ti ti-scale"></i></span>
            <div className="logo-text"><h2>ASSTEC</h2><p>Gestão Processual</p></div>
          </button>
        </div>
        <nav className="sidebar-nav">
          {TABS.filter(tab => tabVisible(tab.id)).map(tab => (
            <button key={tab.id} className={`nav-item ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              <span className="icon"><i className={`ti ${tab.icon}`}></i></span><span className="label">{tab.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <p className="user-name">{USUARIOS[currentUser]?.nome}</p>
            <p className="user-role">{USUARIOS[currentUser]?.role}</p>
          </div>
          <div className="sidebar-actions">
            <NotificationCenter currentUser={currentUser} USUARIOS={USUARIOS} />
            <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Configurações"><i className="ti ti-settings"></i></button>
            <button className="btn-icon" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Alternar tema"><i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`}></i></button>
            <button className="btn-icon btn-logout" onClick={handleLogout} title="Sair"><i className="ti ti-logout"></i></button>
          </div>
        </div>
      </aside>

      <div className="main-wrapper">
        <main className="main-content">
          <div className="content-area">
            {activeTab === 'despacho-gab' && (
              <>
                {newProcessMode ? (
                  <div className="form-card">
                    <h3>Novo Despacho</h3>
                    <div className="form-grid">
                      <div className="form-group"><label>Número Processo *</label><input type="text" placeholder="2024.001.GAB" value={newProcess.numero} onChange={(e) => setNewProcess({...newProcess, numero: e.target.value})} /></div>
                      <div className="form-group"><label>Parte Interessada</label><input type="text" placeholder="Secretaria..." value={newProcess.parteInteressada} onChange={(e) => setNewProcess({...newProcess, parteInteressada: e.target.value})} /></div>
                    </div>
                    <div className="form-group"><label>Objeto *</label><textarea placeholder="Descrição..." value={newProcess.objeto} onChange={(e) => setNewProcess({...newProcess, objeto: e.target.value})} /></div>
                    <div className="form-group"><label>Análise Jurídica</label><textarea placeholder="Parecer..." value={newProcess.analise} onChange={(e) => setNewProcess({...newProcess, analise: e.target.value})} /></div>
                    <div className="form-actions">
                      <button className="btn-primary" onClick={createNewProcess} disabled={loading}>{loading ? 'Salvando...' : 'Criar'}</button>
                      <button className="btn-secondary" disabled={loading} onClick={() => {setNewProcessMode(false); setNewProcess({ numero: '', objeto: '', parteInteressada: '', analise: '' });}}>Cancelar</button>
                    </div>
                  </div>
                ) : selectedProcess ? (
                  <div className="detail-card">
                    <button className="back-button" onClick={() => setSelectedProcess(null)}>← Voltar</button>
                    <div className={`card-header ${selectedProcess.despachado ? 'despachado' : ''}`}>
                      <div><h2>{selectedProcess.numero}</h2><span className={`badge status-${selectedProcess.status}`}>{selectedProcess.status}</span></div>
                      {can('deletar') && (<button className="btn-delete" onClick={() => deleteProcess(selectedProcess.id)}>🗑️</button>)}
                    </div>
                    {selectedProcess.despachado && (
                      <div className="info-box dispatch">
                        <p><strong>Despachado:</strong> {selectedProcess.dataDespacho}</p>
                        <p><strong>Decisão:</strong> {selectedProcess.motivo}</p>
                      </div>
                    )}
                    <div className="info-grid">
                      <div className="info-item"><label>Objeto</label><p>{selectedProcess.objeto}</p></div>
                      <div className="info-item"><label>Parte</label><p>{selectedProcess.parteInteressada}</p></div>
                      <div className="info-item"><label>Data Entrada</label><p>{selectedProcess.dataEntrada}</p></div>
                      <div className="info-item"><label>Status</label><p>{selectedProcess.status}</p></div>
                    </div>
                    <div className="info-box"><label>Análise Jurídica</label><p>{selectedProcess.analise || 'Sem análise'}</p></div>
                    {selectedProcess.observacoes && (
                      <div className="info-box">
                        <label>📝 Observações do Despacho</label>
                        <p style={{whiteSpace: 'pre-wrap'}}>{selectedProcess.observacoes}</p>
                      </div>
                    )}
                    {renderAttachments('processos', selectedProcess, setSelectedProcess)}
                    {can('despachar') && !selectedProcess.despachado && (
                      <div className="action-buttons">
                        <button className="btn-approve" onClick={() => handleDispatch('prosseguimento')}>✓ Prosseguimento</button>
                        <button className="btn-request" onClick={() => handleDispatch('diligencia')}>📋 Diligência</button>
                        <button className="btn-deny" onClick={() => handleDispatch('nao-autorizo')}>✗ Não Autorizo</button>
                      </div>
                    )}
                    {showDiligenceModal && (
                      <div className="modal-overlay">
                        <div className="modal-box">
                          <h4>Solicitar Diligência</h4>
                          <textarea value={diligenceText} onChange={(e) => setDiligenceText(e.target.value)} placeholder="Descreva..." />
                          <div className="modal-actions">
                            <button className="btn-primary" onClick={() => finalizarDespacho('diligencia', diligenceText)}>Confirmar</button>
                            <button className="btn-secondary" onClick={() => {setShowDiligenceModal(false); setDiligenceText('');}}>Cancelar</button>
                          </div>
                        </div>
                      </div>
                    )}
                    {showObservationsModal && (
                      <div className="modal-overlay">
                        <div className="modal-box">
                          <h4>Observações do Despacho</h4>
                          <p style={{fontSize: '13px', color: '#666', marginBottom: '12px'}}>Informe observações (opcional) para disponibilizar à equipe.</p>
                          <textarea value={observationText} onChange={(e) => setObservationText(e.target.value)} placeholder="Digite observações..." style={{minHeight: '120px'}} />
                          <div className="modal-actions">
                            <button className="btn-primary" onClick={() => finalizarDespacho('prosseguimento', '', observationText)}>Despachar com Observações</button>
                            <button className="btn-secondary" onClick={() => finalizarDespacho('prosseguimento', '', '')}>Despachar sem Observações</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="list-view">
                    <div className="list-header">
                      <h3>Despachos de Gabinete</h3>
                      {can('criar') && (<button className="btn-new" onClick={() => setNewProcessMode(true)}>+ Novo Despacho</button>)}
                    </div>
                    {processes.length === 0 ? (<p className="empty-state">Nenhum processo</p>) : (
                      processes.map(process => (
                        <div key={process.id} className={`card-item ${process.despachado ? 'despachado' : ''}`} style={{position: 'relative'}}>
                          <button onClick={() => setSelectedProcess(process)} style={{width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0}}>
                            <div className="card-top"><strong>{process.numero}</strong><span className={`badge status-${process.status}`}>{process.status}</span></div>
                            <p className="card-text">{process.objeto.substring(0, 120)}</p>
                            {process.parteInteressada && <p className="card-text"><strong>Parte Interessada:</strong> {process.parteInteressada}</p>}
                            {process.analise && <p className="card-text"><strong>Obs. Assessoria:</strong> {process.analise.substring(0, 100)}{process.analise.length > 100 ? '...' : ''}</p>}
                            <span className="card-date">{process.dataEntrada}</span>
                            {process.despachado && <p className="card-dispatch">✓ Despachado em {process.dataDespacho}</p>}
                          </button>
                          {(process.documentos || []).length > 0 && (
                            <div style={{marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ddd'}}>
                              <div style={{fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: '#2c5aa0'}}>📎 Documentos:</div>
                              {(process.documentos || []).map((documento, i) => (
                                <a key={i} href={documento.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{display: 'block', padding: '6px', marginBottom: '4px', backgroundColor: 'var(--neutral-200)', borderRadius: '4px', color: '#2c5aa0', fontSize: '12px', textDecoration: 'none'}}>
                                  📄 {documento.nome}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'acompanhamentos' && (
              <>
                {newAccompanimentMode ? (
                  <div className="form-card">
                    <h3>Novo Acompanhamento</h3>
                    <div className="form-grid">
                      <div className="form-group"><label>Número Processo *</label><input type="text" placeholder="2024.001.GAB" value={newAccompaniment.numeroProcesso} onChange={(e) => setNewAccompaniment({...newAccompaniment, numeroProcesso: e.target.value})} /></div>
                    </div>
                    <div className="form-group"><label>Objeto *</label><textarea placeholder="Descrição..." value={newAccompaniment.objeto} onChange={(e) => setNewAccompaniment({...newAccompaniment, objeto: e.target.value})} /></div>
                    <div className="form-grid">
                      <div className="form-group"><label>Setor Anterior</label><input type="text" placeholder="Ex: Secretaria X" value={newAccompaniment.setorAnterior} onChange={(e) => setNewAccompaniment({...newAccompaniment, setorAnterior: e.target.value})} /></div>
                      <div className="form-group"><label>Data</label><input type="date" value={newAccompaniment.dataSetorAnterior} onChange={(e) => setNewAccompaniment({...newAccompaniment, dataSetorAnterior: e.target.value})} /></div>
                    </div>
                    <div className="form-grid">
                      <div className="form-group"><label>Setor Atual</label><input type="text" placeholder="Ex: ASSTEC" value={newAccompaniment.setorAtual} onChange={(e) => setNewAccompaniment({...newAccompaniment, setorAtual: e.target.value})} /></div>
                      <div className="form-group"><label>Data</label><input type="date" value={newAccompaniment.dataSetorAtual} onChange={(e) => setNewAccompaniment({...newAccompaniment, dataSetorAtual: e.target.value})} /></div>
                    </div>
                    <div className="form-group"><label>Status</label><textarea placeholder="Descreva..." value={newAccompaniment.status} onChange={(e) => setNewAccompaniment({...newAccompaniment, status: e.target.value})} /></div>
                    <div className="form-actions">
                      <button className="btn-primary" onClick={createNewAccompaniment} disabled={loading}>{loading ? 'Salvando...' : 'Criar'}</button>
                      <button className="btn-secondary" disabled={loading} onClick={() => {setNewAccompanimentMode(false); setNewAccompaniment({ objeto: '', numeroProcesso: '', setorAnterior: '', dataSetorAnterior: '', setorAtual: '', dataSetorAtual: '', status: '' });}}>Cancelar</button>
                    </div>
                  </div>
                ) : selectedAccompaniment ? (
                  <div className="detail-card">
                    <button className="back-button" onClick={() => { setSelectedAccompaniment(null); setAccompEdits({}); }}>← Voltar</button>
                    <div className="card-header"><h2>{selectedAccompaniment.numeroProcesso}</h2></div>
                    <div className="form-section">
                      {/* onChange atualiza só o estado local; onBlur salva no Firebase */}
                      <div className="form-group"><label>Objeto</label><textarea
                        value={accompEdits.objeto ?? selectedAccompaniment.objeto}
                        onChange={(e) => setAccompEdits((p) => ({ ...p, objeto: e.target.value }))}
                        onBlur={() => accompEdits.objeto !== undefined && updateAccompaniment(selectedAccompaniment.id, { objeto: accompEdits.objeto })}
                      /></div>
                      <div className="form-grid">
                        <div className="form-group"><label>Setor Anterior</label><input type="text"
                          value={accompEdits.setorAnterior ?? selectedAccompaniment.setorAnterior}
                          onChange={(e) => setAccompEdits((p) => ({ ...p, setorAnterior: e.target.value }))}
                          onBlur={() => accompEdits.setorAnterior !== undefined && updateAccompaniment(selectedAccompaniment.id, { setorAnterior: accompEdits.setorAnterior })}
                        /></div>
                        <div className="form-group"><label>Data</label><input type="date"
                          value={accompEdits.dataSetorAnterior ?? selectedAccompaniment.dataSetorAnterior}
                          onChange={(e) => updateAccompaniment(selectedAccompaniment.id, { dataSetorAnterior: e.target.value })}
                        /></div>
                      </div>
                      <div className="form-grid">
                        <div className="form-group"><label>Setor Atual</label><input type="text"
                          value={accompEdits.setorAtual ?? selectedAccompaniment.setorAtual}
                          onChange={(e) => setAccompEdits((p) => ({ ...p, setorAtual: e.target.value }))}
                          onBlur={() => accompEdits.setorAtual !== undefined && updateAccompaniment(selectedAccompaniment.id, { setorAtual: accompEdits.setorAtual })}
                        /></div>
                        <div className="form-group"><label>Data</label><input type="date"
                          value={accompEdits.dataSetorAtual ?? selectedAccompaniment.dataSetorAtual}
                          onChange={(e) => updateAccompaniment(selectedAccompaniment.id, { dataSetorAtual: e.target.value })}
                        /></div>
                      </div>
                      <div className="form-group"><label>Status</label><textarea
                        value={accompEdits.status ?? selectedAccompaniment.status}
                        onChange={(e) => setAccompEdits((p) => ({ ...p, status: e.target.value }))}
                        onBlur={() => accompEdits.status !== undefined && updateAccompaniment(selectedAccompaniment.id, { status: accompEdits.status })}
                      /></div>
                    </div>
                    {renderAttachments('acompanhamentos', selectedAccompaniment, setSelectedAccompaniment)}
                    <div className="footer-info">
                      <p>Última Movimentação: <strong>{selectedAccompaniment.dataUltimaEdicao || '—'}</strong></p>
                      {selectedAccompaniment.dataUltimaVerificacao && (
                        <p>Última Verificação: <strong>{selectedAccompaniment.dataUltimaVerificacao}</strong></p>
                      )}
                      {!selectedAccompaniment.verificacaoAtualizada && (
                        <button className="btn-verify" onClick={() => updateVerification(selectedAccompaniment.id)}>✓ Verificação Atualizada</button>
                      )}
                      {selectedAccompaniment.verificacaoAtualizada && (<span className="verify-done">✓ Verificado</span>)}
                      <button className="btn-delete" onClick={() => deleteAccompaniment(selectedAccompaniment.id)}>🗑️</button>
                    </div>
                  </div>
                ) : (
                  <div className="list-view">
                    <div className="list-header">
                      <h3>Acompanhamentos Especiais</h3>
                      <div className="header-buttons">
                        <button className="btn-settings" onClick={() => setShowAccompEmailModal(!showAccompEmailModal)}>⚙️ Emails</button>
                        <button className="btn-new" onClick={() => setNewAccompanimentMode(true)}>+ Novo</button>
                      </div>
                    </div>
                    {showAccompEmailModal && (
                      <div className="email-config">
                        <h4>Configurar Emails para Acompanhamento</h4>
                        <p className="email-hint">Separe múltiplos emails com vírgula ou ponto-e-vírgula</p>
                        <div className="email-input-group">
                          <input type="text" value={newAccompEmail} onChange={(e) => setNewAccompEmail(e.target.value)} placeholder="email1@example.com, email2@example.com" />
                          <button className="btn-add" onClick={addAccompEmail}>Adicionar</button>
                        </div>
                        <div className="email-list">
                          {accompEmails.map((email, i) => (
                            <div key={i} className="email-tag"><span>{email}</span><button onClick={() => removeAccompEmail(email)}>✕</button></div>
                          ))}
                        </div>
                      </div>
                    )}
                    {accompaniments.length === 0 ? (<p className="empty-state">Nenhum acompanhamento</p>) : (
                      accompaniments.map(acc => (
                        <div key={acc.id} onClick={() => { setSelectedAccompaniment(acc); setAccompEdits({}); }} className="card-item">
                          <div className="card-top"><strong>{acc.numeroProcesso}</strong></div>
                          <p className="card-text"><strong>Objeto:</strong> {acc.objeto}</p>
                          <p className="card-text"><strong>Setor Anterior:</strong> {acc.setorAnterior} ({acc.dataSetorAnterior})</p>
                          <p className="card-text"><strong>Setor Atual:</strong> {acc.setorAtual} ({acc.dataSetorAtual})</p>
                          <p className="card-text"><strong>Status:</strong> {acc.status}</p>
                          {acc.dataUltimaEdicao && <p className="card-text"><strong>Última Movimentação:</strong> {acc.dataUltimaEdicao}</p>}
                          {acc.dataUltimaVerificacao && <p className="card-text"><strong>Última Verificação:</strong> {acc.dataUltimaVerificacao}</p>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'audiencias' && (
              <>
                {!newHearingMode && !selectedHearing && (
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
                    <button
                      className={`btn-settings ${hearingViewMode === 'list' ? 'active' : ''}`}
                      onClick={() => setHearingViewMode('list')}
                      style={{ background: hearingViewMode === 'list' ? 'var(--primary-main)' : 'var(--neutral-100)', color: hearingViewMode === 'list' ? 'white' : 'var(--primary-main)' }}
                    >
                      📋 Por Processo
                    </button>
                    <button
                      className={`btn-settings ${hearingViewMode === 'timeline' ? 'active' : ''}`}
                      onClick={() => setHearingViewMode('timeline')}
                      style={{ background: hearingViewMode === 'timeline' ? 'var(--primary-main)' : 'var(--neutral-100)', color: hearingViewMode === 'timeline' ? 'white' : 'var(--primary-main)' }}
                    >
                      ⏳ Próxima → Remota
                    </button>
                    <button
                      className={`btn-settings ${hearingViewMode === 'calendar' ? 'active' : ''}`}
                      onClick={() => setHearingViewMode('calendar')}
                      style={{ background: hearingViewMode === 'calendar' ? 'var(--primary-main)' : 'var(--neutral-100)', color: hearingViewMode === 'calendar' ? 'white' : 'var(--primary-main)' }}
                    >
                      📅 Calendário
                    </button>
                  </div>
                )}

                {newHearingMode ? (
                  <div className="form-card">
                    <h3>Nova Audiência</h3>
                    <div className="form-grid">
                      <div className="form-group"><label>Processo SEI *</label><input type="text" placeholder="12345.2024.001" value={newHearing.seiNumber} onChange={(e) => setNewHearing({...newHearing, seiNumber: e.target.value})} /></div>
                      <div className="form-group"><label>Data *</label><input type="date" value={newHearing.data} onChange={(e) => setNewHearing({...newHearing, data: e.target.value})} /></div>
                      <div className="form-group"><label>Hora</label><input type="time" value={newHearing.hora} onChange={(e) => setNewHearing({...newHearing, hora: e.target.value})} /></div>
                    </div>
                    <div className="form-group"><label>Objeto</label><textarea placeholder="Descrição..." value={newHearing.objeto} onChange={(e) => setNewHearing({...newHearing, objeto: e.target.value})} /></div>
                    <div className="form-grid">
                      <div className="form-group"><label>Link Sessão</label><input type="url" placeholder="https://..." value={newHearing.linkSessao} onChange={(e) => setNewHearing({...newHearing, linkSessao: e.target.value})} /></div>
                      <div className="form-group"><label>Setor Responsável</label><input type="text" placeholder="ASSTEC" value={newHearing.setorResponsavel} onChange={(e) => setNewHearing({...newHearing, setorResponsavel: e.target.value})} /></div>
                    </div>
                    <div className="form-group"><label>Servidores</label><textarea placeholder="Nomes..." value={newHearing.servidoresDesignados} onChange={(e) => setNewHearing({...newHearing, servidoresDesignados: e.target.value})} /></div>
                    <div className="form-group"><label>Emails para Notificação</label><input type="text" placeholder="email1@example.com, email2@example.com" value={newHearing.emailsNotificacao} onChange={(e) => setNewHearing({...newHearing, emailsNotificacao: e.target.value})} /></div>
                    <div className="form-actions">
                      <button className="btn-primary" onClick={createNewHearing} disabled={loading}>{loading ? 'Salvando...' : 'Criar'}</button>
                      <button className="btn-secondary" disabled={loading} onClick={() => {setNewHearingMode(false); setNewHearing({seiNumber: '', data: '', hora: '', objeto: '', linkSessao: '', setorResponsavel: '', servidoresDesignados: '', emailsNotificacao: ''});}}>Cancelar</button>
                    </div>
                  </div>
                ) : selectedHearing ? (
                  <div className="detail-card">
                    <button className="back-button" onClick={() => { setSelectedHearing(null); setHearingEdits({}); }}>← Voltar</button>
                    <div className="card-header"><h2>📅 {selectedHearing.seiNumber}</h2><span className="badge">{new Date(selectedHearing.data).toLocaleDateString('pt-BR')} às {selectedHearing.hora}</span></div>
                    {can('editar') ? (
                      <div className="form-section">
                        <div className="form-group"><label>Objeto</label><textarea
                          value={hearingEdits.objeto ?? selectedHearing.objeto}
                          onChange={(e) => setHearingEdits(p => ({ ...p, objeto: e.target.value }))}
                          onBlur={() => hearingEdits.objeto !== undefined && updateHearing(selectedHearing.id, { objeto: hearingEdits.objeto })}
                        /></div>
                        <div className="form-grid">
                          <div className="form-group"><label>Data</label><input type="date"
                            value={hearingEdits.data ?? selectedHearing.data}
                            onChange={(e) => updateHearing(selectedHearing.id, { data: e.target.value })}
                          /></div>
                          <div className="form-group"><label>Hora</label><input type="time"
                            value={hearingEdits.hora ?? selectedHearing.hora}
                            onChange={(e) => updateHearing(selectedHearing.id, { hora: e.target.value })}
                          /></div>
                        </div>
                        <div className="form-grid">
                          <div className="form-group"><label>Setor Responsável</label><input type="text"
                            value={hearingEdits.setorResponsavel ?? selectedHearing.setorResponsavel}
                            onChange={(e) => setHearingEdits(p => ({ ...p, setorResponsavel: e.target.value }))}
                            onBlur={() => hearingEdits.setorResponsavel !== undefined && updateHearing(selectedHearing.id, { setorResponsavel: hearingEdits.setorResponsavel })}
                          /></div>
                          <div className="form-group"><label>Link Sessão</label><input type="url"
                            value={hearingEdits.linkSessao ?? selectedHearing.linkSessao}
                            onChange={(e) => setHearingEdits(p => ({ ...p, linkSessao: e.target.value }))}
                            onBlur={() => hearingEdits.linkSessao !== undefined && updateHearing(selectedHearing.id, { linkSessao: hearingEdits.linkSessao })}
                          /></div>
                        </div>
                        <div className="form-group"><label>Servidores Designados</label><textarea
                          value={hearingEdits.servidoresDesignados ?? selectedHearing.servidoresDesignados}
                          onChange={(e) => setHearingEdits(p => ({ ...p, servidoresDesignados: e.target.value }))}
                          onBlur={() => hearingEdits.servidoresDesignados !== undefined && updateHearing(selectedHearing.id, { servidoresDesignados: hearingEdits.servidoresDesignados })}
                        /></div>
                      </div>
                    ) : (
                      <>
                        <div className="info-grid">
                          <div className="info-item"><label>Objeto</label><p>{selectedHearing.objeto}</p></div>
                          <div className="info-item"><label>Setor</label><p>{selectedHearing.setorResponsavel}</p></div>
                          <div className="info-item"><label>Link</label><p>{selectedHearing.linkSessao ? <a href={selectedHearing.linkSessao} target="_blank" rel="noopener noreferrer">Acessar →</a> : '-'}</p></div>
                        </div>
                        <div className="info-box"><label>Servidores</label><p>{selectedHearing.servidoresDesignados}</p></div>
                      </>
                    )}
                    {selectedHearing.emailsNotificacao && selectedHearing.emailsNotificacao.length > 0 && (
                      <div className="info-box"><label>Emails para Notificação</label><p>{Array.isArray(selectedHearing.emailsNotificacao) ? selectedHearing.emailsNotificacao.join(', ') : selectedHearing.emailsNotificacao}</p></div>
                    )}
                    {can('deletar') && (<button className="btn-delete" onClick={() => deleteHearing(selectedHearing.id)}>🗑️ Deletar</button>)}
                  </div>
                ) : hearingViewMode === 'calendar' ? (
                  <HearingCalendar
                    hearings={hearings}
                    onSelectDate={(date, hearingsOnDate) => {}}
                  />
                ) : (
                  <div className="list-view">
                    <div className="list-header"><h3>Audiências</h3><button className="btn-new" onClick={() => setNewHearingMode(true)}>+ Nova</button></div>
                    {hearings.length === 0 ? (<p className="empty-state">Nenhuma audiência</p>) : (
                      hearings.sort((a, b) => new Date(a.data) - new Date(b.data)).map(hearing => (
                        <div key={hearing.id} onClick={() => setSelectedHearing(hearing)} className="card-item">
                          <div className="card-top"><strong>{hearing.seiNumber}</strong><span className="badge">{new Date(hearing.data).toLocaleDateString('pt-BR')}</span></div>
                          {hearing.objeto && <p className="card-text"><strong>Objeto:</strong> {hearing.objeto}</p>}
                          {hearing.hora && <p className="card-text"><strong>Hora:</strong> {hearing.hora}</p>}
                          {hearing.setorResponsavel && <p className="card-text"><strong>Setor:</strong> {hearing.setorResponsavel}</p>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'doe' && (
              <>
                {newDoeMode ? (
                  <div className="form-card">
                    <h3>Nova Publicação DOE/PI</h3>
                    <div className="form-grid">
                      <div className="form-group"><label>Data Publicação *</label><input type="date" value={newDoe.dataPublicacao} onChange={(e) => setNewDoe({...newDoe, dataPublicacao: e.target.value})} /></div>
                      <div className="form-group"><label>Data Disponibilização</label><input type="date" value={newDoe.dataDisponibilizacao} onChange={(e) => setNewDoe({...newDoe, dataDisponibilizacao: e.target.value})} /></div>
                    </div>
                    <div className="form-group"><label>Número Diário</label><input type="text" placeholder="12345" value={newDoe.numeroDiario} onChange={(e) => setNewDoe({...newDoe, numeroDiario: e.target.value})} /></div>
                    <div className="form-group">
                      <label>Conteúdo *</label>
                      <textarea placeholder="Cole o conteúdo do DOE aqui...&#10;&#10;Use *texto* para deixar em negrito." value={newDoe.conteudo} onChange={(e) => setNewDoe({...newDoe, conteudo: e.target.value})} style={{minHeight: '200px', fontFamily: 'monospace', fontSize: '13px'}} />
                      <p style={{fontSize: '11px', color: 'var(--neutral-400)', marginTop: '4px'}}>💡 Use *texto* para negrito — ex: <em>*SEMARH*</em> vira <strong>SEMARH</strong></p>
                    </div>
                    <div className="form-actions">
                      <button className="btn-primary" onClick={createNewDoe} disabled={loading}>
                        {loading ? 'Salvando...' : 'Criar'}
                      </button>
                      <button className="btn-secondary" disabled={loading} onClick={() => {setNewDoeMode(false); setNewDoe({ dataPublicacao: '', dataDisponibilizacao: '', numeroDiario: '', conteudo: '' });}}>Cancelar</button>
                    </div>
                  </div>
                ) : selectedDoe ? (
                  <div className="detail-card">
                    <button className="back-button" onClick={() => setSelectedDoe(null)}>← Voltar</button>
                    <div className="card-header"><h2>DOE/PI</h2></div>
                    <div className="info-grid">
                      <div className="info-item"><label>Data Publicação</label><p>{selectedDoe.dataPublicacao}</p></div>
                      {selectedDoe.numeroDiario && <div className="info-item"><label>Número Diário</label><p>{selectedDoe.numeroDiario}</p></div>}
                      <div className="info-item"><label>Data Disponibilização</label><p>{selectedDoe.dataDisponibilizacao || 'N/A'}</p></div>
                    </div>
                    <div className="info-box">
                      <label>Conteúdo</label>
                      <div className="doe-content" dangerouslySetInnerHTML={{ __html: formatDoeContent(selectedDoe.conteudo) }} />
                    </div>
                    <div className="info-box">
                      <label>📎 DOE em PDF</label>
                      <div className="attachments">
                        {selectedDoe.pdfUrl ? (
                          <div className="attachment-item">
                            <a href={selectedDoe.pdfUrl} target="_blank" rel="noopener noreferrer" className="attachment-link">
                              <i className="ti ti-file-type-pdf"></i><span>{selectedDoe.pdfNome || 'DOE.pdf'}</span>
                            </a>
                            {can('editar') && (
                              <button type="button" className="attachment-remove" title="Remover" onClick={handleRemoveDoePdf}>✕</button>
                            )}
                          </div>
                        ) : (
                          <p className="attachment-empty">Nenhum PDF anexado</p>
                        )}
                        {can('editar') && !selectedDoe.pdfUrl && (
                          <label className={`upload-btn ${uploadingDoc ? 'disabled' : ''}`}>
                            <i className="ti ti-upload"></i> {uploadingDoc ? 'Enviando...' : 'Anexar DOE em PDF'}
                            <input type="file" accept="application/pdf" disabled={uploadingDoc}
                              onChange={handleUploadDoePdf} style={{ display: 'none' }} />
                          </label>
                        )}
                      </div>
                    </div>
                    <button className="btn-delete" onClick={() => deleteDoe(selectedDoe.id)}>🗑️ Deletar</button>
                  </div>
                ) : (
                  <div className="list-view">
                    <div className="list-header">
                      <h3>DOE/PI</h3>
                      <div className="header-buttons">
                        <button className="btn-settings" onClick={() => setShowDoeEmailModal(!showDoeEmailModal)}>⚙️ Emails</button>
                        <button className="btn-new" onClick={() => setNewDoeMode(true)}>+ Nova Publicação</button>
                      </div>
                    </div>
                    {showDoeEmailModal && (
                      <div className="email-config">
                        <h4>Configurar Emails para DOE/PI</h4>
                        <p className="email-hint">Separe múltiplos emails com vírgula ou ponto-e-vírgula</p>
                        <div className="email-input-group">
                          <input type="text" value={newDoeEmail} onChange={(e) => setNewDoeEmail(e.target.value)} placeholder="email1@example.com, email2@example.com" />
                          <button className="btn-add" onClick={addDoeEmail}>Adicionar</button>
                        </div>
                        <div className="email-list">
                          {doeEmails.map((email, i) => (
                            <div key={i} className="email-tag"><span>{email}</span><button onClick={() => removeDoeEmail(email)}>✕</button></div>
                          ))}
                        </div>
                      </div>
                    )}
                    {doePublications.length === 0 ? (<p className="empty-state">Nenhuma publicação</p>) : (
                      doePublications.sort((a, b) => new Date(b.dataPublicacao) - new Date(a.dataPublicacao)).map(doe => (
                        <div key={doe.id} onClick={() => setSelectedDoe(doe)} className="card-item">
                          <div className="card-top"><strong>Diário #{doe.numeroDiario || 'S/N'}</strong><span className="badge">{new Date(doe.dataPublicacao).toLocaleDateString('pt-BR')}</span></div>
                          <div className="doe-preview" dangerouslySetInnerHTML={{ __html: formatDoeContent(doe.conteudo) }} />
                          {doe.pdfUrl && <p className="card-text" style={{marginTop:'8px', color:'var(--primary-main)', fontWeight:600}}><i className="ti ti-file-type-pdf"></i> PDF anexado</p>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
            {activeTab === 'prazos' && (
              <>
                {newDeadlineMode ? (
                  <div className="form-card">
                    <h3>Novo Prazo Judicial</h3>
                    <div className="form-grid">
                      <div className="form-group"><label>Número PJE *</label><input type="text" placeholder="0001234-56.2024.8.00.0000" value={newDeadline.numeroPJE} onChange={(e) => setNewDeadline({...newDeadline, numeroPJE: e.target.value})} /></div>
                      <div className="form-group"><label>Número SEI</label><input type="text" placeholder="00130.000001/2024-00" value={newDeadline.numeroSEI} onChange={(e) => setNewDeadline({...newDeadline, numeroSEI: e.target.value})} /></div>
                    </div>
                    <div className="form-group"><label>Objeto / Descrição</label><textarea placeholder="Descreva o prazo..." value={newDeadline.objeto} onChange={(e) => setNewDeadline({...newDeadline, objeto: e.target.value})} /></div>
                    <div className="form-grid">
                      <div className="form-group"><label>Prazo Fatal *</label><input type="date" value={newDeadline.prazoFatal} onChange={(e) => setNewDeadline({...newDeadline, prazoFatal: e.target.value})} /></div>
                      <div className="form-group">
                        <label>Tipo de Prazo</label>
                        <select value={newDeadline.tipoPrazo} onChange={(e) => setNewDeadline({...newDeadline, tipoPrazo: e.target.value})} style={{width:'100%', padding:'10px 12px', border:'1px solid var(--neutral-300)', borderRadius:'8px', fontSize:'14px', background:'var(--bg-card)', color:'var(--text-primary)'}}>
                          <option value="longo">Longo (notif. em 10, 5 e 3 dias)</option>
                          <option value="curto">Curto — 5 a 10 dias (notif. em 5, 3 e 2 dias)</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-actions">
                      <button className="btn-primary" onClick={createNewDeadline} disabled={loading}>{loading ? 'Salvando...' : 'Criar'}</button>
                      <button className="btn-secondary" disabled={loading} onClick={() => { setNewDeadlineMode(false); setNewDeadline({ numeroPJE: '', numeroSEI: '', prazoFatal: '', tipoPrazo: 'longo', objeto: '' }); }}>Cancelar</button>
                    </div>
                  </div>
                ) : selectedDeadline ? (
                  <div className="detail-card">
                    <button className="back-button" onClick={() => setSelectedDeadline(null)}>← Voltar</button>
                    <div className="card-header">
                      <h2>⚖️ {selectedDeadline.numeroPJE || selectedDeadline.numeroSEI}</h2>
                      <span className={`badge ${new Date(selectedDeadline.prazoFatal) < new Date() ? 'status-indeferido' : 'status-pendente'}`}>
                        {new Date(selectedDeadline.prazoFatal) < new Date() ? 'Vencido' : `Vence em ${Math.ceil((new Date(selectedDeadline.prazoFatal + 'T23:59:59') - new Date()) / (1000 * 60 * 60 * 24))} dia(s)`}
                      </span>
                    </div>
                    <div className="info-grid">
                      {selectedDeadline.numeroPJE && <div className="info-item"><label>Número PJE</label><p>{selectedDeadline.numeroPJE}</p></div>}
                      {selectedDeadline.numeroSEI && <div className="info-item"><label>Número SEI</label><p>{selectedDeadline.numeroSEI}</p></div>}
                      <div className="info-item"><label>Prazo Fatal</label><p>{new Date(selectedDeadline.prazoFatal).toLocaleDateString('pt-BR')}</p></div>
                      <div className="info-item"><label>Tipo de Prazo</label><p>{selectedDeadline.tipoPrazo === 'curto' ? 'Curto (5–10 dias)' : 'Longo'}</p></div>
                    </div>
                    {selectedDeadline.objeto && <div className="info-box"><label>Objeto</label><p>{selectedDeadline.objeto}</p></div>}
                    {can('deletar') && (<button className="btn-delete" onClick={() => deleteDeadline(selectedDeadline.id)}>🗑️ Deletar</button>)}
                  </div>
                ) : (
                  <div className="list-view">
                    <div className="list-header">
                      <h3>Controle de Prazos Judiciais</h3>
                      {can('criar') && (<button className="btn-new" onClick={() => setNewDeadlineMode(true)}>+ Novo Prazo</button>)}
                    </div>
                    {deadlines.length === 0 ? (<p className="empty-state">Nenhum prazo cadastrado</p>) : (
                      [...deadlines].sort((a, b) => new Date(a.prazoFatal) - new Date(b.prazoFatal)).map(dl => {
                        const daysLeft = Math.ceil((new Date(dl.prazoFatal + 'T23:59:59') - new Date()) / (1000 * 60 * 60 * 24));
                        const vencido = daysLeft < 0;
                        const urgente = !vencido && daysLeft <= 3;
                        const alerta = !vencido && daysLeft <= 7;
                        return (
                          <div key={dl.id} onClick={() => setSelectedDeadline(dl)} className="card-item" style={{ borderLeft: `4px solid ${vencido ? 'var(--accent-red)' : urgente ? '#e85d04' : alerta ? '#f48c06' : 'var(--primary-main)'}` }}>
                            <div className="card-top">
                              <strong>{dl.numeroPJE || dl.numeroSEI}</strong>
                              <span className={`badge ${vencido ? 'status-indeferido' : urgente ? 'status-diligencia' : 'status-pendente'}`}>
                                {vencido ? 'VENCIDO' : daysLeft === 0 ? 'HOJE!' : `${daysLeft} dia(s)`}
                              </span>
                            </div>
                            {dl.objeto && <p className="card-text"><strong>Objeto:</strong> {dl.objeto.substring(0, 120)}</p>}
                            {dl.numeroSEI && dl.numeroPJE && <p className="card-text"><strong>SEI:</strong> {dl.numeroSEI}</p>}
                            <p className="card-text"><strong>Prazo Fatal:</strong> {new Date(dl.prazoFatal).toLocaleDateString('pt-BR')}</p>
                            <p className="card-text"><strong>Tipo:</strong> {dl.tipoPrazo === 'curto' ? 'Curto' : 'Longo'}</p>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {showSettings && (
        <div className="modal-overlay">
          <div className="settings-modal">
            <div className="settings-header">
              <h3>⚙️ Configurações</h3>
              <button className="close-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="settings-content">
              <div className="settings-section">
                <h4>🎨 Tema</h4>
                <div className="theme-selector">
                  <button className={`theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')}><span>☀️</span><span>Claro</span></button>
                  <button className={`theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}><span>🌙</span><span>Escuro</span></button>
                </div>
              </div>
              <div className="settings-section">
                <h4>🔐 Alterar Senha</h4>
                <div className="form-group"><label>Senha Atual</label><input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Digite sua senha atual" /></div>
                <div className="form-group"><label>Nova Senha</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Digite a nova senha" /></div>
                <div className="form-group"><label>Confirmar Nova Senha</label><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirme a nova senha" /></div>
                {passwordError && <p className="error-message">{passwordError}</p>}
                {passwordMessage && <p className="success-message">{passwordMessage}</p>}
                <button className="btn-primary" onClick={handleChangePassword}>Alterar Senha</button>
              </div>
              <div className="settings-section">
                <h4>📱 Status de Notificações deste Dispositivo</h4>
                {pushStatusMsg ? (
                  <p style={{fontSize:'13px', padding:'10px 14px', borderRadius:'8px', background: pushStatusMsg.startsWith('✅') ? 'rgba(5,150,105,0.1)' : 'rgba(220,38,38,0.1)', color: pushStatusMsg.startsWith('✅') ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight:'600'}}>
                    {pushStatusMsg}
                  </p>
                ) : (
                  <p style={{fontSize:'13px', color:'var(--neutral-400)'}}>Verificando...</p>
                )}
                <button className="btn-secondary" style={{marginTop:'10px', width:'auto'}} onClick={() => registerPushSubscription(currentUser)}>
                  🔄 Registrar este dispositivo
                </button>
              </div>

              <div className="settings-section">
                <h4>👤 Informações da Conta</h4>
                <div className="info-line"><span>Usuário:</span><strong>{currentUser}</strong></div>
                <div className="info-line"><span>Nome:</span><strong>{USUARIOS[currentUser]?.nome}</strong></div>
                <div className="info-line"><span>Função:</span><strong>{USUARIOS[currentUser]?.role}</strong></div>
              </div>

              {currentUser === 'master' && (
                <div className="settings-section">
                  <h4>🛠️ Administração</h4>

                  {/* Configuração de Funcionalidades (visibilidade das abas) */}
                  <button
                    className={`settings-accordion-btn ${settingsPanel === 'features' ? 'open' : ''}`}
                    onClick={() => setSettingsPanel(settingsPanel === 'features' ? null : 'features')}
                  >
                    <span><i className="ti ti-layout-grid" style={{marginRight:'8px'}}></i>Configuração de Funcionalidades</span>
                    <i className={`ti ${settingsPanel === 'features' ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
                  </button>
                  {settingsPanel === 'features' && (
                    <div className="settings-accordion-body">
                      <p style={{fontSize:'12px', color:'var(--text-secondary)', marginBottom:'1rem', lineHeight:'1.5'}}>
                        Marque quais usuários podem <strong>visualizar</strong> cada aba. O usuário master sempre vê todas.
                      </p>
                      {TABS.map((tab) => (
                        <div key={tab.id} className="push-config-block">
                          <div className="push-config-title">
                            <strong><i className={`ti ${tab.icon}`} style={{marginRight:'6px'}}></i>{tab.label}</strong>
                          </div>
                          <div className="push-config-users">
                            {Object.entries(USUARIOS).map(([role, info]) => {
                              if (role === 'master') return null; // master sempre vê tudo
                              const checked = tabVisibility[tab.id]?.[role] !== false;
                              const toggle = async () => {
                                const updated = {
                                  ...tabVisibility,
                                  [tab.id]: { ...tabVisibility[tab.id], [role]: !checked }
                                };
                                setTabVisibility(updated);
                                await saveConfig(null, null, null, undefined, updated);
                              };
                              return (
                                <label key={role} className={`push-user-chip ${checked ? 'active' : ''}`}>
                                  <input type="checkbox" checked={checked} onChange={toggle} style={{display:'none'}} />
                                  {info.nome}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Configurações de Notificação (push/sino/banners por usuário) */}
                  <button
                    className={`settings-accordion-btn ${settingsPanel === 'notifications' ? 'open' : ''}`}
                    onClick={() => setSettingsPanel(settingsPanel === 'notifications' ? null : 'notifications')}
                  >
                    <span><i className="ti ti-bell-cog" style={{marginRight:'8px'}}></i>Configurações de Notificação</span>
                    <i className={`ti ${settingsPanel === 'notifications' ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
                  </button>
                  {settingsPanel === 'notifications' && (
                    <div className="settings-accordion-body">
                      <p style={{fontSize:'12px', color:'var(--text-secondary)', marginBottom:'1rem', lineHeight:'1.5'}}>
                        Controla <strong>push no celular</strong>, <strong>central de notificações</strong> (sino) e <strong>banners</strong> de cada usuário.
                        Para o push funcionar, o usuário precisa ter feito login pelo celular ao menos uma vez.
                      </p>
                      {[
                        { key: 'audiencias',      label: 'Audiências', icon: 'ti-calendar-event', desc: '5 e 1 dia antes' },
                        { key: 'acompanhamentos', label: 'Acompanhamentos', icon: 'ti-map-pin', desc: 'quando atualizado' },
                        { key: 'doe',             label: 'DOE/PI', icon: 'ti-news', desc: 'nova publicação' },
                        { key: 'prazos',          label: 'Prazos Judiciais', icon: 'ti-scale', desc: '10, 5, 3 e 2 dias antes' },
                      ].map(({ key, label, icon, desc }) => (
                        <div key={key} className="push-config-block">
                          <div className="push-config-title">
                            <strong><i className={`ti ${icon}`} style={{marginRight:'6px'}}></i>{label}</strong>
                            <span className="push-config-desc">{desc}</span>
                          </div>
                          <div className="push-config-users">
                            {Object.entries(USUARIOS).map(([role, info]) => {
                              const checked = pushNotifConfig[key]?.[role] || false;
                              const toggle = async () => {
                                const updated = {
                                  ...pushNotifConfig,
                                  [key]: { ...pushNotifConfig[key], [role]: !checked }
                                };
                                setPushNotifConfig(updated);
                                await saveConfig(null, null, null, updated);
                              };
                              return (
                                <label key={role} className={`push-user-chip ${checked ? 'active' : ''}`}>
                                  <input type="checkbox" checked={checked} onChange={toggle} style={{display:'none'}} />
                                  {info.nome}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Permissões de Usuário (leitura/criação/edição/exclusão) */}
                  <button
                    className={`settings-accordion-btn ${settingsPanel === 'permissions' ? 'open' : ''}`}
                    onClick={() => setSettingsPanel(settingsPanel === 'permissions' ? null : 'permissions')}
                  >
                    <span><i className="ti ti-user-shield" style={{marginRight:'8px'}}></i>Permissões de Usuário</span>
                    <i className={`ti ${settingsPanel === 'permissions' ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
                  </button>
                  {settingsPanel === 'permissions' && (
                    <div className="settings-accordion-body">
                      <p style={{fontSize:'12px', color:'var(--text-secondary)', marginBottom:'1rem', lineHeight:'1.5'}}>
                        Defina o que cada usuário pode fazer: <strong>leitura</strong>, <strong>criação</strong>, <strong>edição</strong> e <strong>exclusão</strong>. O master tem sempre acesso total.
                      </p>
                      {Object.entries(USUARIOS).map(([role, info]) => {
                        if (role === 'master') return null; // master tem acesso total
                        return (
                          <div key={role} className="push-config-block">
                            <div className="push-config-title">
                              <strong><i className="ti ti-user" style={{marginRight:'6px'}}></i>{info.nome}</strong>
                            </div>
                            <div className="push-config-users">
                              {PERMISSION_ACTIONS.map(({ key, label }) => {
                                const checked = userPermissions[role]?.[key] === true;
                                const toggle = async () => {
                                  const updated = {
                                    ...userPermissions,
                                    [role]: { ...userPermissions[role], [key]: !checked }
                                  };
                                  setUserPermissions(updated);
                                  await saveConfig(null, null, null, undefined, undefined, updated);
                                };
                                return (
                                  <label key={key} className={`push-user-chip ${checked ? 'active' : ''}`}>
                                    <input type="checkbox" checked={checked} onChange={toggle} style={{display:'none'}} />
                                    {label}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <NotificationBanner />

      {/* Barra de ações fixa no rodapé — visível apenas no mobile */}
      <div className="mobile-bottom-bar">
        <span className="mobile-user-label">{USUARIOS[currentUser]?.nome}</span>
        <NotificationCenter currentUser={currentUser} USUARIOS={USUARIOS} />
        <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Configurações"><i className="ti ti-settings"></i></button>
        <button className="btn-icon" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Tema"><i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`}></i></button>
        <button className="btn-icon btn-logout" onClick={handleLogout} title="Sair"><i className="ti ti-logout"></i></button>
      </div>
    </div>
  );
}
