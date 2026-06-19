import React, { useState, useEffect } from 'react';
import './App.css';
import emailjs from '@emailjs/browser';
import { EMAILJS_CONFIG } from './emailjs-config';
import { db, storage, authReady, auth, roleEmail } from './firebase-config';
import { collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential, setPersistence,
  browserLocalPersistence, browserSessionPersistence, onAuthStateChanged, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup,
} from 'firebase/auth';
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

// Painel inicial (dashboard) — o que aparece é configurável pelo master
const DEFAULT_DASHBOARD_CONFIG = {
  showPendentes: true, showPrazos: true, showAudiencias: true, showAcompanhamentos: true,
  diasAcompanhamento: 7, diasPrazoAlerta: 7,
};

export default function SistemaDespacho() {
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [loginUser, setLoginUser] = useState('master');
  const [loginPass, setLoginPass] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [authChecked, setAuthChecked] = useState(false); // já conferiu se há sessão real salva pelo Firebase
  const [restoredUser, setRestoredUser] = useState(null); // usuário real (não anônimo) restaurado pelo Firebase
  const [userEmails, setUserEmails] = useState({}); // { role: email } — e-mail real cadastrado por cada pessoa
  const [emailRegistered, setEmailRegistered] = useState({}); // { role: true } — já completou o cadastro do e-mail
  const [forceReRegister, setForceReRegister] = useState({}); // { role: true } — master autorizou recadastro sem senha atual
  const [customUsers, setCustomUsers] = useState({}); // { role: { nome, criadoEm } } — usuários criados pelo master (também usado para renomear os 5 originais)
  const [newUserName, setNewUserName] = useState('');
  // Todos os usuários do sistema: os 5 originais + os criados pelo master.
  // customUsers por último para também permitir renomear um usuário original.
  const ALL_USERS = { ...USUARIOS, ...customUsers };
  const [regEmail, setRegEmail] = useState('');
  const [regCurrentPass, setRegCurrentPass] = useState('');
  const [regNewPass, setRegNewPass] = useState('');
  const [regConfirmPass, setRegConfirmPass] = useState('');
  const [regError, setRegError] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [activeTab, setActiveTab] = useState('painel');
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
  const [newDocLink, setNewDocLink] = useState({ url: '', nome: '' });
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [linkTarget, setLinkTarget] = useState(null); // { collectionName, entity, setEntity }
  const [newProcessDocs, setNewProcessDocs] = useState([]); // anexos escolhidos antes de criar o despacho
  const [newDoeDocs, setNewDoeDocs] = useState([]); // anexos escolhidos antes de criar a publicação do DOE
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

  const [dashboardConfig, setDashboardConfig] = useState(DEFAULT_DASHBOARD_CONFIG);

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
    { id: 'painel',          label: 'Painel',            icon: 'ti-layout-dashboard' },
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
    { key: 'ver',       label: 'Leitura' },
    { key: 'criar',     label: 'Criação' },
    { key: 'editar',    label: 'Edição' },
    { key: 'deletar',   label: 'Exclusão' },
    { key: 'despachar', label: 'Despachar' },
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

  // Urgência de um prazo fatal: usado no Painel e na lista de Prazos Judiciais.
  const prazoStatus = (prazoFatal) => {
    const daysLeft = Math.ceil((new Date(prazoFatal + 'T23:59:59') - new Date()) / (1000 * 60 * 60 * 24));
    const vencido = daysLeft < 0;
    const urgente = !vencido && daysLeft <= 3;
    const alerta = !vencido && daysLeft <= 7;
    const cor = vencido ? 'var(--accent-red)' : urgente ? '#e85d04' : alerta ? '#f48c06' : 'var(--primary-main)';
    const label = vencido ? 'VENCIDO' : daysLeft === 0 ? 'HOJE!' : `${daysLeft} dia(s)`;
    return { daysLeft, vencido, urgente, alerta, cor, label };
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
  // Restaura a sessão real do Firebase Authentication (substitui o antigo
  // "lembrar login" via localStorage — agora o próprio Firebase mantém a
  // sessão do usuário entre acessos, de forma segura).
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthChecked(true);
      setRestoredUser(user && !user.isAnonymous ? user : null);
    });
    return () => unsub();
  }, []);

  // Descobre a quem pertence a sessão restaurada (por e-mail real cadastrado,
  // ou pelo e-mail técnico antigo de quem ainda não recadastrou) e entra
  // automaticamente. Só decide depois que a config (e-mails) já carregou.
  useEffect(() => {
    if (!restoredUser || authenticated || !configLoaded) return;
    const role = Object.keys(ALL_USERS).find((r) => userEmails[r] === restoredUser.email)
      || Object.keys(ALL_USERS).find((r) => roleEmail(r) === restoredUser.email);
    if (role) finishLogin(role);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredUser, configLoaded, userEmails, authenticated]);

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

  // config/dados pode ser lido com a sessão anônima, mesmo antes do login real
  // (é o que permite migrar a senha antiga na primeira vez que cada um entra).
  useEffect(() => {
    let cancelled = false;
    let unsubConfig;

    authReady.then(() => {
      if (cancelled) return;
      unsubConfig = onSnapshot(
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
            if (data.userEmails) setUserEmails(data.userEmails);
            if (data.emailRegistered) setEmailRegistered(data.emailRegistered);
            if (data.forceReRegister) setForceReRegister(data.forceReRegister);
            if (data.customUsers) setCustomUsers(data.customUsers);
            if (data.dashboardConfig) setDashboardConfig({ ...DEFAULT_DASHBOARD_CONFIG, ...data.dashboardConfig });
          } else {
            console.log('ℹ️ Config ainda não existe no Firebase - será criada ao salvar');
          }
          setConfigLoaded(true);
        },
        (err) => { console.error('❌ Erro config Firebase:', err.message); setConfigLoaded(true); }
      );
    });

    return () => { cancelled = true; unsubConfig && unsubConfig(); };
  }, []);

  // Demais coleções exigem o login real (e-mail/senha) — só assina depois que
  // o usuário entra no sistema.
  useEffect(() => {
    if (!authenticated) return;
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

    return () => { unsubProcesses(); unsubAcc(); unsubHearings(); unsubDoe(); unsubDeadlines(); };
  }, [authenticated]);

  // Salva a config no Firebase. Recebe só os campos que mudaram (overrides);
  // o restante é preenchido com o valor atual em memória.
  const saveConfig = async (overrides = {}) => {
    try {
      const payload = {
        doeEmails, accompEmails, userPasswords, pushNotifConfig, tabVisibility, userPermissions,
        userEmails, emailRegistered, forceReRegister, customUsers, dashboardConfig,
        ...overrides,
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
    setTimeout(() => registerPushSubscription(role), 1500);
  };

  // Login normal: só aparece depois que a pessoa já cadastrou seu e-mail real.
  const handleLogin = async (e) => {
    e.preventDefault();
    const role = loginUser;
    if (!ALL_USERS[role]) { alert('Usuário inválido'); return; }
    if (!loginPass) { alert('Digite sua senha'); return; }
    const email = userEmails[role];
    if (!email) { alert('Cadastre seu e-mail primeiro.'); return; }

    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
    } catch (e) { /* navegador sem suporte a persistência; segue com o padrão */ }

    try {
      await signInWithEmailAndPassword(auth, email, loginPass);
      finishLogin(role);
    } catch (err) {
      console.error('❌ Erro de login:', err.message);
      alert('Usuário ou senha inválida');
    }
  };

  // Confere se a senha digitada é mesmo a da pessoa que diz ser aquele papel:
  // tenta a senha antiga (hash salvo no Firestore) ou, se ela já tiver feito a
  // migração da semana passada, a senha da conta técnica sintética.
  const verifyLegacyIdentity = async (role, password) => {
    const stored = userPasswords[role];
    const typedHash = await hashPassword(password);
    if (stored && (stored === typedHash || stored === password)) return true;
    try { await signInWithEmailAndPassword(auth, roleEmail(role), password); return true; }
    catch (e) { return false; }
  };

  // Vincula um e-mail (e, se for por e-mail/senha, cria a conta real) ao papel
  // escolhido, marca como cadastrado e entra. Usado tanto pelo cadastro manual
  // quanto pelo "Entrar com Google".
  const finishRegistration = async (role, email) => {
    const newEmails = { ...userEmails, [role]: email };
    const newRegistered = { ...emailRegistered, [role]: true };
    const newForce = { ...forceReRegister, [role]: false };
    const newLegacyPasswords = { ...userPasswords, [role]: null };
    setUserEmails(newEmails); setEmailRegistered(newRegistered); setForceReRegister(newForce); setUserPasswords(newLegacyPasswords);
    await saveConfig({ userEmails: newEmails, emailRegistered: newRegistered, forceReRegister: newForce, userPasswords: newLegacyPasswords });
    finishLogin(role);
  };

  // Cadastro do e-mail real + nova senha — aparece automaticamente no próximo
  // login de quem ainda não fez isso (emailRegistered[role] ainda não é true).
  // Por segurança, exige a senha atual (antiga ou já migrada) para provar que é
  // a própria pessoa — exceto quando o master autoriza um recadastro sem ela
  // (forceReRegister), para quem perdeu a senha antiga.
  const handleRegisterEmail = async (e) => {
    e.preventDefault();
    const role = loginUser;
    setRegError('');
    if (!regEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail)) { setRegError('Digite um e-mail válido'); return; }
    if (regNewPass.length < 6) { setRegError('A nova senha deve ter no mínimo 6 caracteres'); return; }
    if (regNewPass !== regConfirmPass) { setRegError('As senhas não coincidem'); return; }

    if (!forceReRegister[role]) {
      if (!regCurrentPass) { setRegError('Digite sua senha atual'); return; }
      if (!(await verifyLegacyIdentity(role, regCurrentPass))) { setRegError('Senha atual incorreta'); return; }
    }

    try {
      try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      } catch (e) { /* ignora */ }
      await createUserWithEmailAndPassword(auth, regEmail, regNewPass);
      setRegEmail(''); setRegCurrentPass(''); setRegNewPass(''); setRegConfirmPass('');
      await finishRegistration(role, regEmail);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setRegError('Esse e-mail já está cadastrado em outra conta do sistema.');
      } else {
        setRegError('Erro ao cadastrar: ' + err.message);
      }
    }
  };

  // Entrar/cadastrar com a Conta Google. Na tela de cadastro, exige a senha
  // atual antes de abrir o popup do Google (prova de identidade), a não ser
  // que o master tenha autorizado o recadastro sem ela. Na tela de login
  // normal (já cadastrado), só confere se essa conta Google é a vinculada.
  const handleGoogleAuth = async ({ isRegistration }) => {
    const role = loginUser;
    setRegError('');
    if (isRegistration && !forceReRegister[role]) {
      if (!regCurrentPass) { setRegError('Digite sua senha atual para confirmar que é você'); return; }
      if (!(await verifyLegacyIdentity(role, regCurrentPass))) { setRegError('Senha atual incorreta'); return; }
    }
    try {
      try {
        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      } catch (e) { /* ignora */ }
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const googleEmail = result.user.email;

      if (isRegistration) {
        const existingRole = Object.keys(userEmails).find((r) => userEmails[r] === googleEmail);
        if (existingRole && existingRole !== role) {
          setRegError(`Essa conta Google já está vinculada a ${ALL_USERS[existingRole]?.nome}.`);
          await signOut(auth);
          return;
        }
        setRegCurrentPass('');
        await finishRegistration(role, googleEmail);
      } else {
        const matchedRole = Object.keys(ALL_USERS).find((r) => userEmails[r] === googleEmail);
        if (matchedRole) {
          finishLogin(matchedRole);
        } else {
          alert('Essa conta Google ainda não está vinculada a nenhum usuário. Cadastre-se primeiro digitando sua senha atual.');
          await signOut(auth);
        }
      }
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') return;
      const msg = 'Erro ao entrar com Google: ' + err.message;
      if (isRegistration) setRegError(msg); else alert(msg);
    }
  };

  // "Esqueci minha senha" — manda o link oficial do Firebase para o e-mail já cadastrado.
  const handleForgotPassword = async () => {
    setForgotMsg('');
    const email = userEmails[loginUser];
    if (!email) { setForgotMsg('Cadastre seu e-mail primeiro fazendo login normalmente.'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      setForgotMsg(`Enviamos um link de redefinição para ${email}.`);
    } catch (err) {
      setForgotMsg('Erro ao enviar e-mail: ' + err.message);
    }
  };

  // ─── Ações do master sobre credenciais de outros usuários ──────────────────
  const sendResetTo = async (role) => {
    const email = userEmails[role];
    if (!email) { alert('Esse usuário ainda não cadastrou um e-mail.'); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Link de redefinição enviado para ${email}.`);
    } catch (e) {
      alert('Erro ao enviar: ' + e.message);
    }
  };

  const forceRoleReRegister = async (role) => {
    if (!window.confirm(`Forçar ${ALL_USERS[role]?.nome} a cadastrar um novo e-mail e senha no próximo login, sem precisar da senha atual?`)) return;
    const newRegistered = { ...emailRegistered, [role]: false };
    const newForce = { ...forceReRegister, [role]: true };
    setEmailRegistered(newRegistered); setForceReRegister(newForce);
    await saveConfig({ emailRegistered: newRegistered, forceReRegister: newForce });
    alert(`Pronto. No próximo login, ${ALL_USERS[role]?.nome} vai cadastrar um e-mail e senha novos.`);
  };

  // ─── Criar / renomear / remover usuários (master) ───────────────────────────
  const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const createUser = async () => {
    const nome = newUserName.trim();
    if (!nome) { alert('Digite o nome do novo usuário'); return; }
    const base = slugify(nome) || 'usuario';
    let key = base, n = 2;
    while (ALL_USERS[key]) { key = `${base}_${n}`; n++; }

    const newCustom = { ...customUsers, [key]: { nome, role: key, criadoEm: new Date().toISOString() } };
    // Permissões básicas de início (leitura liberada; o resto o master ajusta no painel de Permissões)
    const newPerms = { ...userPermissions, [key]: { ver: true, criar: false, editar: false, deletar: false, despachar: false } };
    setCustomUsers(newCustom); setUserPermissions(newPerms);
    await saveConfig({ customUsers: newCustom, userPermissions: newPerms });
    setNewUserName('');
    alert(`Usuário "${nome}" criado! No primeiro login, essa pessoa vai cadastrar e-mail e senha (ou entrar com Google).`);
  };

  const renameUser = async (role) => {
    const atual = ALL_USERS[role]?.nome || '';
    const novo = window.prompt('Novo nome de exibição:', atual);
    if (!novo || !novo.trim() || novo.trim() === atual) return;
    const newCustom = { ...customUsers, [role]: { ...(customUsers[role] || { role }), nome: novo.trim() } };
    setCustomUsers(newCustom);
    await saveConfig({ customUsers: newCustom });
  };

  const deleteCustomUser = async (role) => {
    if (USUARIOS[role]) { alert('Não é possível remover um dos usuários originais do sistema.'); return; }
    if (!window.confirm(`Remover o usuário "${ALL_USERS[role]?.nome}"? Essa pessoa não vai mais conseguir entrar no sistema.`)) return;
    const newCustom = { ...customUsers }; delete newCustom[role];
    const newEmails = { ...userEmails }; delete newEmails[role];
    const newRegistered = { ...emailRegistered }; delete newRegistered[role];
    const newForce = { ...forceReRegister }; delete newForce[role];
    const newPerms = { ...userPermissions }; delete newPerms[role];
    const newPasswords = { ...userPasswords }; delete newPasswords[role];
    setCustomUsers(newCustom); setUserEmails(newEmails); setEmailRegistered(newRegistered);
    setForceReRegister(newForce); setUserPermissions(newPerms); setUserPasswords(newPasswords);
    await saveConfig({
      customUsers: newCustom, userEmails: newEmails, emailRegistered: newRegistered,
      forceReRegister: newForce, userPermissions: newPerms, userPasswords: newPasswords,
    });
  };

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

  const handleLogout = () => {
    signOut(auth).catch((e) => console.warn('Erro ao sair:', e.message));
    setAuthenticated(false); setCurrentUser(null); setLoginPass('');
  };

  const can = (action) => {
    if (!currentUser) return false;
    if (currentUser === 'master') return true; // master tem acesso total
    // ações configuráveis pelo master (leitura/criação/edição/exclusão)
    const configurable = ['ver', 'criar', 'editar', 'deletar', 'despachar'];
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
      const docRef = await addDoc(collection(db, 'processos'), {
        type: 'gabinete', numero: newProcess.numero, objeto: newProcess.objeto,
        parteInteressada: newProcess.parteInteressada, analise: newProcess.analise,
        dataEntrada: new Date().toISOString().split('T')[0], status: 'pendente',
        dataDespacho: null, despachado: false, motivo: ''
      });
      if (newProcessDocs.length > 0) {
        const docs = [];
        for (const d of newProcessDocs) {
          docs.push(d.tipo === 'pdf'
            ? await uploadPdf(d.file, `processos/${docRef.id}`)
            : { url: d.url, nome: d.nome, tipo: 'link', adicionadoEm: new Date().toISOString() });
        }
        await updateDoc(docRef, { documentos: docs });
      }
      setNewProcess({ numero: '', objeto: '', parteInteressada: '', analise: '' });
      setNewProcessDocs([]);
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
      const docRef = await addDoc(collection(db, 'doe'), doe);

      if (newDoeDocs.length > 0) {
        const docs = [];
        for (const d of newDoeDocs) {
          docs.push(d.tipo === 'pdf'
            ? await uploadPdf(d.file, `doe/${docRef.id}`)
            : { url: d.url, nome: d.nome, tipo: 'link', adicionadoEm: new Date().toISOString() });
        }
        await updateDoc(docRef, { documentos: docs });
      }

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
      setNewDoeDocs([]);
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
    await saveConfig({ doeEmails: updated });
    setNewDoeEmail('');
  };

  const removeDoeEmail = async (email) => {
    const updated = doeEmails.filter(e => e !== email);
    setDoeEmails(updated);
    await saveConfig({ doeEmails: updated });
  };

  const addAccompEmail = async () => {
    const emails = parseEmails(newAccompEmail);
    const updated = [...accompEmails, ...emails.filter(e => !accompEmails.includes(e))];
    setAccompEmails(updated);
    await saveConfig({ accompEmails: updated });
    setNewAccompEmail('');
  };

  const removeAccompEmail = async (email) => {
    const updated = accompEmails.filter(e => e !== email);
    setAccompEmails(updated);
    await saveConfig({ accompEmails: updated });
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

  // Remove o PDF antigo (formato anterior, anexo único) de uma publicação do DOE.
  // Novos anexos do DOE usam o campo `documentos` (renderAttachments), igual aos despachos.
  const handleRemoveDoePdf = async () => {
    const path = selectedDoe?.pdfPath;
    await updateDoc(doc(db, 'doe', selectedDoe.id), { pdfUrl: null, pdfNome: null, pdfPath: null });
    setSelectedDoe((prev) => ({ ...prev, pdfUrl: null, pdfNome: null, pdfPath: null }));
    if (path) {
      try { await deleteObject(storageRef(storage, path)); } catch (e) { /* arquivo já removido */ }
    }
  };

  // Adiciona um link de documento (Google Drive, OneDrive, etc.) ao campo `documentos`
  const addDocLink = async () => {
    if (!linkTarget) return;
    const { collectionName, entity, setEntity } = linkTarget;
    const url = newDocLink.url.trim();
    const nome = newDocLink.nome.trim() || url;
    if (!url) { alert('Cole o link do documento'); return; }
    const docs = [...(entity.documentos || []), { url, nome, tipo: 'link', adicionadoEm: new Date().toISOString() }];
    await updateDoc(doc(db, collectionName, entity.id), { documentos: docs });
    setEntity((prev) => ({ ...prev, documentos: docs }));
    setNewDocLink({ url: '', nome: '' });
    setShowAddDocModal(false);
    setLinkTarget(null);
  };

  // Bloco reutilizável de anexos (processos / acompanhamentos).
  // allowLink = true também permite anexar um link, além de enviar PDF.
  const renderAttachments = (collectionName, entity, setEntity, allowLink = false) => (
    <div className="info-box">
      <label>📎 Documentos Anexados</label>
      <div className="attachments">
        {(entity.documentos || []).length > 0 ? (
          (entity.documentos || []).map((docItem, i) => (
            <div key={i} className="attachment-item">
              <a href={docItem.url} target="_blank" rel="noopener noreferrer" className="attachment-link">
                <i className={`ti ${docItem.tipo === 'link' ? 'ti-link' : 'ti-file-type-pdf'}`}></i><span>{docItem.nome}</span>
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
          <div className="attachment-actions">
            <label className={`upload-btn ${uploadingDoc ? 'disabled' : ''}`}>
              <i className="ti ti-upload"></i> {uploadingDoc ? 'Enviando...' : 'Enviar PDF'}
              <input type="file" accept="application/pdf" disabled={uploadingDoc}
                onChange={(e) => handleUploadDoc(e, collectionName, entity, setEntity)} style={{ display: 'none' }} />
            </label>
            {allowLink && (
              <button type="button" className="link-btn"
                onClick={() => { setLinkTarget({ collectionName, entity, setEntity }); setNewDocLink({ url: '', nome: '' }); setShowAddDocModal(true); }}>
                <i className="ti ti-link"></i> Adicionar link
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Bloco de anexos (PDF + link) ANTES de o registro existir — usado nas telas
  // de criação de despacho e de publicação do DOE. Fica em memória; os PDFs só
  // são enviados ao Storage quando o registro é efetivamente criado.
  const renderPendingAttachments = (pendingDocs, setPendingDocs) => (
    <div className="form-group">
      <label>📎 Documentos (opcional)</label>
      <div className="attachments">
        {pendingDocs.length > 0 ? (
          pendingDocs.map((d, i) => (
            <div key={i} className="attachment-item">
              <span className="attachment-link">
                <i className={`ti ${d.tipo === 'link' ? 'ti-link' : 'ti-file-type-pdf'}`}></i><span>{d.nome}</span>
              </span>
              <button type="button" className="attachment-remove" title="Remover"
                onClick={() => setPendingDocs(pendingDocs.filter((_, idx) => idx !== i))}>✕</button>
            </div>
          ))
        ) : (
          <p className="attachment-empty">Nenhum documento adicionado</p>
        )}
        <div className="attachment-actions">
          <label className="upload-btn">
            <i className="ti ti-upload"></i> Selecionar PDF
            <input type="file" accept="application/pdf" style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!validatePdf(file)) return;
                setPendingDocs([...pendingDocs, { tipo: 'pdf', file, nome: file.name }]);
              }} />
          </label>
          <button type="button" className="link-btn" onClick={() => {
            const url = window.prompt('Cole o link do documento:');
            if (!url) return;
            const nome = window.prompt('Nome do documento (opcional):', url) || url;
            setPendingDocs([...pendingDocs, { tipo: 'link', url, nome }]);
          }}>
            <i className="ti ti-link"></i> Adicionar link
          </button>
        </div>
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

  // Troca de senha via Firebase Authentication: precisa reautenticar com a
  // senha atual antes de poder definir a nova (exigência de segurança do
  // próprio Firebase — evita que alguém com a sessão aberta troque a senha
  // sem saber a atual).
  const handleChangePassword = async () => {
    setPasswordError(''); setPasswordMessage('');
    if (!currentPassword || !newPassword || !confirmPassword) { setPasswordError('Preencha todos os campos'); return; }
    if (newPassword.length < 6) { setPasswordError('Nova senha deve ter no mínimo 6 caracteres'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('As senhas não coincidem'); return; }
    try {
      const cred = EmailAuthProvider.credential(userEmails[currentUser], currentPassword);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updatePassword(auth.currentUser, newPassword);
      setPasswordMessage('Senha alterada com sucesso!');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => { setPasswordMessage(''); setShowSettings(false); }, 2000);
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPasswordError('Senha atual incorreta');
      } else {
        setPasswordError('Erro ao alterar senha: ' + err.message);
      }
    }
  };

  if (!authenticated) {
    if (!authChecked || !configLoaded) {
      // Evita o "flash" da tela errada enquanto o Firebase confere se já existe
      // uma sessão salva e a config (e-mails cadastrados) termina de carregar.
      return <div className="login-container" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/passaros-wallpaper.jpg)` }}><div className="login-overlay"></div></div>;
    }

    const needsRegistration = !emailRegistered[loginUser];

    if (needsRegistration) {
      return (
        <div className="login-container" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/passaros-wallpaper.jpg)` }}>
          <div className="login-overlay"></div>
          <form className="login-form" onSubmit={handleRegisterEmail}>
            <div className="logo-login"><span className="logo-icon">⚖️</span><h1>ASSTEC</h1></div>
            <p className="login-subtitle">Cadastre seu e-mail para continuar</p>
            <div className="form-group">
              <label htmlFor="usuario-reg">Usuário</label>
              <select id="usuario-reg" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} className="login-input">
                {Object.entries(ALL_USERS).map(([role, info]) => (
                  <option key={role} value={role}>{role === 'master' ? 'Master' : info.nome}</option>
                ))}
              </select>
            </div>
            {!forceReRegister[loginUser] && (
              <div className="form-group">
                <label htmlFor="reg-senha-atual">Sua senha atual</label>
                <input id="reg-senha-atual" type="password" value={regCurrentPass} onChange={(e) => setRegCurrentPass(e.target.value)} placeholder="A senha que você já usa" className="login-input" />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="reg-email">Seu e-mail</label>
              <input id="reg-email" type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="seuemail@exemplo.com" className="login-input" />
            </div>
            <div className="form-group">
              <label htmlFor="reg-senha-nova">Nova senha</label>
              <input id="reg-senha-nova" type="password" value={regNewPass} onChange={(e) => setRegNewPass(e.target.value)} placeholder="Mínimo 6 caracteres" className="login-input" />
            </div>
            <div className="form-group" style={{marginBottom:'1.2rem'}}>
              <label htmlFor="reg-senha-confirma">Confirmar nova senha</label>
              <input id="reg-senha-confirma" type="password" value={regConfirmPass} onChange={(e) => setRegConfirmPass(e.target.value)} placeholder="Repita a nova senha" className="login-input" />
            </div>
            {regError && <p className="login-footer" style={{color:'var(--danger-main, #dc2626)'}}>{regError}</p>}
            <button type="submit" className="login-button">Cadastrar e Entrar</button>
            <div className="login-divider"><span>ou</span></div>
            <button type="button" className="google-btn" onClick={() => handleGoogleAuth({ isRegistration: true })}>
              <i className="ti ti-brand-google"></i> Entrar com Google
            </button>
            <p className="login-footer">
              {forceReRegister[loginUser]
                ? 'Cadastro liberado pelo master — defina seu e-mail (ou use o Google) e uma nova senha.'
                : 'Confirme sua senha atual e cadastre seu e-mail (digitando uma senha nova, ou pelo Google). Da próxima vez, você entra direto.'}
            </p>
          </form>
        </div>
      );
    }

    return (
      <div className="login-container" style={{ backgroundImage: `url(${process.env.PUBLIC_URL}/passaros-wallpaper.jpg)` }}>
        <div className="login-overlay"></div>
        <form className="login-form" onSubmit={handleLogin}>
          <div className="logo-login"><span className="logo-icon">⚖️</span><h1>ASSTEC</h1></div>
          <p className="login-subtitle">Sistema de Gestão Processual</p>
          <div className="form-group">
            <label htmlFor="usuario">Usuário</label>
            <select id="usuario" value={loginUser} onChange={(e) => { setLoginUser(e.target.value); setForgotMsg(''); }} className="login-input">
              {Object.entries(ALL_USERS).map(([role, info]) => (
                <option key={role} value={role}>{role === 'master' ? 'Master' : info.nome}</option>
              ))}
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
          <div className="login-divider"><span>ou</span></div>
          <button type="button" className="google-btn" onClick={() => handleGoogleAuth({ isRegistration: false })}>
            <i className="ti ti-brand-google"></i> Entrar com Google
          </button>
          <button type="button" className="link-btn" style={{marginTop:'10px', width:'100%', justifyContent:'center'}} onClick={handleForgotPassword}>
            Esqueci minha senha
          </button>
          {forgotMsg && <p className="login-footer">{forgotMsg}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="logo-btn" onClick={() => setActiveTab('painel')} title="Voltar ao início">
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
            <p className="user-name">{ALL_USERS[currentUser]?.nome}</p>
            <p className="user-role">{ALL_USERS[currentUser]?.role}</p>
          </div>
          <div className="sidebar-actions">
            <NotificationCenter currentUser={currentUser} USUARIOS={ALL_USERS} />
            <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Configurações"><i className="ti ti-settings"></i></button>
            <button className="btn-icon" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Alternar tema"><i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`}></i></button>
            <button className="btn-icon btn-logout" onClick={handleLogout} title="Sair"><i className="ti ti-logout"></i></button>
          </div>
        </div>
      </aside>

      <div className="main-wrapper">
        <main className="main-content">
          <div className="content-area">
            {activeTab === 'painel' && (() => {
              const pendentes = processes.filter((p) => !p.despachado);
              const prazosOrdenados = [...deadlines]
                .filter((dl) => dl.prazoFatal)
                .map((dl) => ({ ...dl, _status: prazoStatus(dl.prazoFatal) }))
                .filter((dl) => dl._status.daysLeft <= dashboardConfig.diasPrazoAlerta)
                .sort((a, b) => a._status.daysLeft - b._status.daysLeft);
              const hoje = new Date();
              const fimSemana = new Date(); fimSemana.setDate(fimSemana.getDate() + 7);
              const audienciasSemana = [...hearings]
                .filter((h) => h.data && new Date(h.data) >= hoje && new Date(h.data) <= fimSemana)
                .sort((a, b) => new Date(a.data) - new Date(b.data));
              const limiteMovimentacao = new Date(); limiteMovimentacao.setDate(limiteMovimentacao.getDate() - dashboardConfig.diasAcompanhamento);
              const acompanhamentosMovimentados = [...accompaniments]
                .filter((acc) => acc.dataUltimaEdicao && new Date(acc.dataUltimaEdicao) >= limiteMovimentacao)
                .sort((a, b) => new Date(b.dataUltimaEdicao) - new Date(a.dataUltimaEdicao));

              return (
                <div className="list-view">
                  <div className="list-header"><h3>📊 Painel</h3></div>

                  <div className="dashboard-kpis">
                    {dashboardConfig.showPendentes && tabVisible('despacho-gab') && (
                      <button type="button" className="kpi-card" onClick={() => setActiveTab('despacho-gab')}>
                        <span className="kpi-value">{pendentes.length}</span>
                        <span className="kpi-label"><i className="ti ti-gavel"></i> Despachos pendentes</span>
                      </button>
                    )}
                    {dashboardConfig.showPrazos && tabVisible('prazos') && (
                      <button type="button" className="kpi-card" onClick={() => setActiveTab('prazos')}>
                        <span className="kpi-value">{prazosOrdenados.length}</span>
                        <span className="kpi-label"><i className="ti ti-scale"></i> Prazos vencendo (até {dashboardConfig.diasPrazoAlerta}d)</span>
                      </button>
                    )}
                    {dashboardConfig.showAudiencias && tabVisible('audiencias') && (
                      <button type="button" className="kpi-card" onClick={() => setActiveTab('audiencias')}>
                        <span className="kpi-value">{audienciasSemana.length}</span>
                        <span className="kpi-label"><i className="ti ti-calendar-event"></i> Audiências esta semana</span>
                      </button>
                    )}
                    {dashboardConfig.showAcompanhamentos && tabVisible('acompanhamentos') && (
                      <button type="button" className="kpi-card" onClick={() => setActiveTab('acompanhamentos')}>
                        <span className="kpi-value">{acompanhamentosMovimentados.length}</span>
                        <span className="kpi-label"><i className="ti ti-map-pin"></i> Acompanhamentos movimentados</span>
                      </button>
                    )}
                  </div>

                  {dashboardConfig.showPrazos && tabVisible('prazos') && (
                    <div className="dashboard-widget">
                      <h4><i className="ti ti-scale"></i> Prazos vencendo</h4>
                      {prazosOrdenados.length === 0 ? (
                        <p className="dashboard-empty">Nenhum prazo vencendo nos próximos {dashboardConfig.diasPrazoAlerta} dias.</p>
                      ) : (
                        prazosOrdenados.slice(0, 8).map((dl) => (
                          <div key={dl.id} onClick={() => { setActiveTab('prazos'); setSelectedDeadline(dl); }}
                            className="card-item" style={{ borderLeft: `4px solid ${dl._status.cor}` }}>
                            <div className="card-top">
                              <strong>{dl.numeroPJE || dl.numeroSEI}</strong>
                              <span className={`badge ${dl._status.vencido ? 'status-indeferido' : dl._status.urgente ? 'status-diligencia' : 'status-pendente'}`}>{dl._status.label}</span>
                            </div>
                            {dl.objeto && <p className="card-text">{dl.objeto.substring(0, 100)}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {dashboardConfig.showAcompanhamentos && tabVisible('acompanhamentos') && (
                    <div className="dashboard-widget">
                      <h4><i className="ti ti-map-pin"></i> Acompanhamentos com movimentação recente</h4>
                      <p className="push-config-desc" style={{marginBottom:'10px'}}>Últimos {dashboardConfig.diasAcompanhamento} dias</p>
                      {acompanhamentosMovimentados.length === 0 ? (
                        <p className="dashboard-empty">Nenhuma movimentação nos últimos {dashboardConfig.diasAcompanhamento} dias.</p>
                      ) : (
                        acompanhamentosMovimentados.slice(0, 8).map((acc) => (
                          <div key={acc.id} onClick={() => { setActiveTab('acompanhamentos'); setSelectedAccompaniment(acc); setAccompEdits({}); }} className="card-item">
                            <div className="card-top">
                              <strong>{acc.numeroProcesso}</strong>
                              <span className="badge status-pendente">{new Date(acc.dataUltimaEdicao).toLocaleDateString('pt-BR')}</span>
                            </div>
                            {acc.objeto && <p className="card-text"><strong>Objeto:</strong> {acc.objeto.substring(0, 100)}</p>}
                            <p className="card-text"><strong>Setor Atual:</strong> {acc.setorAtual || '—'}</p>
                            {acc.status && <p className="card-text"><strong>Status:</strong> {acc.status.substring(0, 100)}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {dashboardConfig.showAudiencias && tabVisible('audiencias') && (
                    <div className="dashboard-widget">
                      <h4><i className="ti ti-calendar-event"></i> Audiências desta semana</h4>
                      {audienciasSemana.length === 0 ? (
                        <p className="dashboard-empty">Nenhuma audiência nos próximos 7 dias.</p>
                      ) : (
                        audienciasSemana.map((h) => (
                          <div key={h.id} onClick={() => { setActiveTab('audiencias'); setSelectedHearing(h); }} className="card-item">
                            <div className="card-top">
                              <strong>{h.seiNumber}</strong>
                              <span className="badge">{new Date(h.data).toLocaleDateString('pt-BR')} {h.hora}</span>
                            </div>
                            {h.objeto && <p className="card-text">{h.objeto.substring(0, 100)}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

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
                    {renderPendingAttachments(newProcessDocs, setNewProcessDocs)}
                    <div className="form-actions">
                      <button className="btn-primary" onClick={createNewProcess} disabled={loading}>{loading ? 'Salvando...' : 'Criar'}</button>
                      <button className="btn-secondary" disabled={loading} onClick={() => {setNewProcessMode(false); setNewProcess({ numero: '', objeto: '', parteInteressada: '', analise: '' }); setNewProcessDocs([]);}}>Cancelar</button>
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
                    {renderAttachments('processos', selectedProcess, setSelectedProcess, true)}
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
                    {renderPendingAttachments(newDoeDocs, setNewDoeDocs)}
                    <div className="form-actions">
                      <button className="btn-primary" onClick={createNewDoe} disabled={loading}>
                        {loading ? 'Salvando...' : 'Criar'}
                      </button>
                      <button className="btn-secondary" disabled={loading} onClick={() => {setNewDoeMode(false); setNewDoe({ dataPublicacao: '', dataDisponibilizacao: '', numeroDiario: '', conteudo: '' }); setNewDoeDocs([]);}}>Cancelar</button>
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
                    {selectedDoe.pdfUrl && (
                      <div className="info-box">
                        <label>📎 DOE em PDF (anexo antigo)</label>
                        <div className="attachments">
                          <div className="attachment-item">
                            <a href={selectedDoe.pdfUrl} target="_blank" rel="noopener noreferrer" className="attachment-link">
                              <i className="ti ti-file-type-pdf"></i><span>{selectedDoe.pdfNome || 'DOE.pdf'}</span>
                            </a>
                            {can('editar') && (
                              <button type="button" className="attachment-remove" title="Remover" onClick={handleRemoveDoePdf}>✕</button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {renderAttachments('doe', selectedDoe, setSelectedDoe, true)}
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
                        const { vencido, urgente, cor, label } = prazoStatus(dl.prazoFatal);
                        return (
                          <div key={dl.id} onClick={() => setSelectedDeadline(dl)} className="card-item" style={{ borderLeft: `4px solid ${cor}` }}>
                            <div className="card-top">
                              <strong>{dl.numeroPJE || dl.numeroSEI}</strong>
                              <span className={`badge ${vencido ? 'status-indeferido' : urgente ? 'status-diligencia' : 'status-pendente'}`}>
                                {label}
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

      {showAddDocModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h4>📎 Adicionar link de documento</h4>
            <p style={{fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px'}}>Cole o link de compartilhamento do Google Drive, OneDrive, SEI ou outro serviço.</p>
            <div className="form-group">
              <label>Nome do documento</label>
              <input type="text" value={newDocLink.nome} onChange={(e) => setNewDocLink(prev => ({...prev, nome: e.target.value}))} placeholder="Ex: Parecer Jurídico nº 001/2024" />
            </div>
            <div className="form-group">
              <label>Link do documento *</label>
              <input type="url" value={newDocLink.url} onChange={(e) => setNewDocLink(prev => ({...prev, url: e.target.value}))} placeholder="https://drive.google.com/..." />
            </div>
            <div className="modal-actions">
              <button className="btn-primary" onClick={addDocLink}>Salvar</button>
              <button className="btn-secondary" onClick={() => { setShowAddDocModal(false); setNewDocLink({ url: '', nome: '' }); setLinkTarget(null); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

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
                <div className="info-line"><span>Nome:</span><strong>{ALL_USERS[currentUser]?.nome}</strong></div>
                <div className="info-line"><span>Função:</span><strong>{ALL_USERS[currentUser]?.role}</strong></div>
              </div>

              {currentUser === 'master' && (
                <div className="settings-section">
                  <h4>🛠️ Administração</h4>

                  {/* Personalizar o Painel (dashboard) inicial */}
                  <button
                    className={`settings-accordion-btn ${settingsPanel === 'dashboard' ? 'open' : ''}`}
                    onClick={() => setSettingsPanel(settingsPanel === 'dashboard' ? null : 'dashboard')}
                  >
                    <span><i className="ti ti-layout-dashboard" style={{marginRight:'8px'}}></i>Personalizar Painel</span>
                    <i className={`ti ${settingsPanel === 'dashboard' ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
                  </button>
                  {settingsPanel === 'dashboard' && (
                    <div className="settings-accordion-body">
                      <p style={{fontSize:'12px', color:'var(--text-secondary)', marginBottom:'1rem', lineHeight:'1.5'}}>
                        Escolha o que aparece no Painel inicial (aba "Painel") para todos os usuários.
                      </p>
                      <div className="push-config-block">
                        <div className="push-config-title"><strong>Informações exibidas</strong></div>
                        <div className="push-config-users">
                          {[
                            { key: 'showPendentes', label: 'Despachos Pendentes' },
                            { key: 'showPrazos', label: 'Prazos Vencendo' },
                            { key: 'showAudiencias', label: 'Audiências da Semana' },
                            { key: 'showAcompanhamentos', label: 'Acompanhamentos Movimentados' },
                          ].map(({ key, label }) => {
                            const checked = dashboardConfig[key] !== false;
                            const toggle = async () => {
                              const updated = { ...dashboardConfig, [key]: !checked };
                              setDashboardConfig(updated);
                              await saveConfig({ dashboardConfig: updated });
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
                      <div className="push-config-block">
                        <div className="push-config-title"><strong>Acompanhamentos: mostrar movimentações dos últimos</strong></div>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <input type="number" min="1" max="90" value={dashboardConfig.diasAcompanhamento}
                            style={{width:'80px'}}
                            onChange={(e) => setDashboardConfig({ ...dashboardConfig, diasAcompanhamento: Number(e.target.value) || 1 })}
                            onBlur={async () => await saveConfig({ dashboardConfig })} />
                          <span style={{fontSize:'13px', color:'var(--text-secondary)'}}>dias (informação instantânea — ajuste como preferir)</span>
                        </div>
                      </div>
                      <div className="push-config-block">
                        <div className="push-config-title"><strong>Prazos: avisar com quantos dias de antecedência</strong></div>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <input type="number" min="1" max="90" value={dashboardConfig.diasPrazoAlerta}
                            style={{width:'80px'}}
                            onChange={(e) => setDashboardConfig({ ...dashboardConfig, diasPrazoAlerta: Number(e.target.value) || 1 })}
                            onBlur={async () => await saveConfig({ dashboardConfig })} />
                          <span style={{fontSize:'13px', color:'var(--text-secondary)'}}>dias</span>
                        </div>
                      </div>
                    </div>
                  )}

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
                            {Object.entries(ALL_USERS).map(([role, info]) => {
                              if (role === 'master') return null; // master sempre vê tudo
                              const checked = tabVisibility[tab.id]?.[role] !== false;
                              const toggle = async () => {
                                const updated = {
                                  ...tabVisibility,
                                  [tab.id]: { ...tabVisibility[tab.id], [role]: !checked }
                                };
                                setTabVisibility(updated);
                                await saveConfig({ tabVisibility: updated });
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
                            {Object.entries(ALL_USERS).map(([role, info]) => {
                              const checked = pushNotifConfig[key]?.[role] || false;
                              const toggle = async () => {
                                const updated = {
                                  ...pushNotifConfig,
                                  [key]: { ...pushNotifConfig[key], [role]: !checked }
                                };
                                setPushNotifConfig(updated);
                                await saveConfig({ pushNotifConfig: updated });
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
                        Defina o que cada usuário pode fazer: <strong>leitura</strong>, <strong>criação</strong>, <strong>edição</strong>, <strong>exclusão</strong> e <strong>despachar</strong>. O master tem sempre acesso total.
                      </p>
                      {Object.entries(ALL_USERS).map(([role, info]) => {
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
                                  await saveConfig({ userPermissions: updated });
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

                  {/* Gerenciar Usuários: criar novos, renomear, credenciais (e-mail/senha) */}
                  <button
                    className={`settings-accordion-btn ${settingsPanel === 'credentials' ? 'open' : ''}`}
                    onClick={() => setSettingsPanel(settingsPanel === 'credentials' ? null : 'credentials')}
                  >
                    <span><i className="ti ti-users" style={{marginRight:'8px'}}></i>Gerenciar Usuários</span>
                    <i className={`ti ${settingsPanel === 'credentials' ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
                  </button>
                  {settingsPanel === 'credentials' && (
                    <div className="settings-accordion-body">
                      <p style={{fontSize:'12px', color:'var(--text-secondary)', marginBottom:'1rem', lineHeight:'1.5'}}>
                        Crie novos usuários, renomeie os existentes, envie redefinição de senha ou force um novo
                        cadastro de e-mail/senha. Usuários novos já aparecem automaticamente nos painéis de
                        Funcionalidades, Notificações e Permissões acima — configure o acesso deles ali.
                      </p>

                      <div className="push-config-block" style={{marginBottom:'1.2rem'}}>
                        <div className="push-config-title"><strong><i className="ti ti-user-plus" style={{marginRight:'6px'}}></i>Criar novo usuário</strong></div>
                        <div style={{display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center'}}>
                          <div className="form-group" style={{flex:'1', minWidth:'180px', marginBottom:0}}>
                            <input type="text" value={newUserName} onChange={(e) => setNewUserName(e.target.value)}
                              placeholder="Nome completo da pessoa"
                              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createUser(); } }} />
                          </div>
                          <button type="button" className="btn-primary" style={{flex:'0 0 auto', marginTop:0}} onClick={createUser}>Criar</button>
                        </div>
                      </div>

                      {Object.entries(ALL_USERS).map(([role, info]) => (
                        <div key={role} className="push-config-block">
                          <div className="push-config-title">
                            <strong><i className="ti ti-user" style={{marginRight:'6px'}}></i>{info.nome}</strong>
                            <span style={{marginLeft:'10px', fontSize:'12px', color:'var(--text-secondary)'}}>
                              {userEmails[role] ? userEmails[role] : 'E-mail ainda não cadastrado'}
                            </span>
                          </div>
                          <div className="push-config-users">
                            <button type="button" className="link-btn" onClick={() => renameUser(role)}>
                              <i className="ti ti-edit"></i> Renomear
                            </button>
                            <button type="button" className="link-btn" disabled={!userEmails[role]}
                              onClick={() => sendResetTo(role)}>
                              <i className="ti ti-mail"></i> Enviar redefinição de senha
                            </button>
                            <button type="button" className="link-btn" onClick={() => forceRoleReRegister(role)}>
                              <i className="ti ti-refresh"></i> Forçar novo cadastro
                            </button>
                            {!USUARIOS[role] && (
                              <button type="button" className="link-btn" onClick={() => deleteCustomUser(role)}>
                                <i className="ti ti-trash"></i> Remover usuário
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
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
        <span className="mobile-user-label">{ALL_USERS[currentUser]?.nome}</span>
        <NotificationCenter currentUser={currentUser} USUARIOS={ALL_USERS} />
        <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Configurações"><i className="ti ti-settings"></i></button>
        <button className="btn-icon" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Tema"><i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`}></i></button>
        <button className="btn-icon btn-logout" onClick={handleLogout} title="Sair"><i className="ti ti-logout"></i></button>
      </div>
    </div>
  );
}
