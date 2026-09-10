import React, { useState, useEffect } from 'react';
import { db } from './firebase-config';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// ═══════════════════════════════════════════════════════════════════
// PROCESSO ADMINISTRATIVO AMBIENTAL — módulo separado e autônomo do
// Sistema de Gestão Processual (mesmo layout, dados e regras próprias).
// ═══════════════════════════════════════════════════════════════════

// ─── Máquina de estados ──────────────────────────────────────────────
// nucleo: 'asstec' | 'notificacoes' | 'ambos' — define quem enxerga/movimenta.
// auto: true → tem contagem automática de prazo (campo `prazo.fim`).
// certificacao: true → estado alcançado automaticamente ao fim do prazo, aguardando confirmação manual.
const ESTADOS_AMBIENTAL = {
  triagem:                              { label: 'Aguardando Triagem Inicial',                          nucleo: 'asstec',       ordem: 1 },
  pendente_notificacao:                 { label: 'Pendente de Notificação',                              nucleo: 'notificacoes', ordem: 2 },
  pendente_retorno_ar:                  { label: 'Pendente de Retorno de AR',                            nucleo: 'notificacoes', ordem: 3 },
  aguardando_prazo_ar:                  { label: 'Aguardando Decurso de Prazo de AR',                    nucleo: 'notificacoes', ordem: 4, auto: true },
  pendente_certificacao_ar:             { label: 'Pendente de Certificação (AR)',                        nucleo: 'notificacoes', ordem: 4.1, certificacao: true },
  pendente_edital:                      { label: 'Pendente de Edital',                                   nucleo: 'asstec',       ordem: 5 },
  aguardando_prazo_edital:              { label: 'Aguardando Decurso de Prazo de Edital',                nucleo: 'notificacoes', ordem: 6, auto: true },
  pendente_certificacao_edital:         { label: 'Pendente de Certificação (Edital)',                    nucleo: 'notificacoes', ordem: 6.1, certificacao: true },
  aguardando_saneamento:                { label: 'Aguardando Saneamento/Julgamento',                     nucleo: 'asstec',       ordem: 7 },
  pendente_diligencia:                  { label: 'Pendente de Diligência',                                nucleo: 'notificacoes', ordem: 8 },
  pendente_notificacao_decisao:         { label: 'Pendente de Notificação de Decisão (AR/Email/WPP)',    nucleo: 'notificacoes', ordem: 9 },
  aguardando_prazo_notificacao_decisao: { label: 'Aguardando Decurso de Prazo de Notificação',           nucleo: 'notificacoes', ordem: 10, auto: true },
  pendente_certificacao_decisao:        { label: 'Pendente de Certificação',                             nucleo: 'notificacoes', ordem: 10.1, certificacao: true },
  pendente_edital_decisao:              { label: 'Pendente de Edital da Decisão',                        nucleo: 'asstec',       ordem: 11 },
  aguardando_prazo_recurso_edital:      { label: 'Aguardando Decurso do Prazo para Recurso de Edital',   nucleo: 'notificacoes', ordem: 12, auto: true },
  pendente_certificacao_edital_decisao: { label: 'Pendente de Certificação',                             nucleo: 'notificacoes', ordem: 12.1, certificacao: true },
  pendente_despacho_consema:            { label: 'Pendente de Despacho para Submissão ao CONSEMA',       nucleo: 'asstec',       ordem: 13 },
  cobranca_administrativa:              { label: 'Cobrança Administrativa Ativa',                        nucleo: 'ambos',        ordem: 14, auto: true },
  pendente_envio_pge:                   { label: 'Pendente de Envio para PGE',                            nucleo: 'asstec',       ordem: 15 },
};

// Migração automática ao final do prazo (aplicada pelo verificador periódico)
const PROXIMO_AUTOMATICO = {
  aguardando_prazo_ar: 'pendente_certificacao_ar',
  aguardando_prazo_edital: 'pendente_certificacao_edital',
  aguardando_prazo_notificacao_decisao: 'pendente_certificacao_decisao',
  aguardando_prazo_recurso_edital: 'pendente_certificacao_edital_decisao',
  cobranca_administrativa: 'pendente_envio_pge',
};

// ─── Dias úteis (feriados nacionais fixos + móveis) ─────────────────
const FERIADOS_FIXOS = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];

function calcularPascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function feriadosMoveis(ano) {
  const pascoa = calcularPascoa(ano);
  const addDias = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  return [addDias(pascoa, -47), addDias(pascoa, -2), addDias(pascoa, 60)]; // carnaval, sexta-santa, corpus christi
}

function toISODate(d) { return d.toISOString().slice(0, 10); }

function isFeriado(date) {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (FERIADOS_FIXOS.includes(mmdd)) return true;
  return feriadosMoveis(date.getFullYear()).some((f) => toISODate(f) === toISODate(date));
}

function isDiaUtil(date) {
  const dow = date.getDay();
  return dow !== 0 && dow !== 6 && !isFeriado(date);
}

function proximoDiaUtil(date) {
  const d = new Date(date);
  while (!isDiaUtil(d)) d.setDate(d.getDate() + 1);
  return d;
}

// 20 dias corridos a partir da data informada; início e fim ajustados p/ dia útil.
function calcularPrazo20Dias(dataInicioStr) {
  const inicio = proximoDiaUtil(new Date(dataInicioStr + 'T12:00:00'));
  const fimBruto = new Date(inicio);
  fimBruto.setDate(fimBruto.getDate() + 20);
  const fim = proximoDiaUtil(fimBruto);
  return { inicio: toISODate(inicio), fim: toISODate(fim) };
}

function addMeses(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function diffDiasCorridos(a, b) {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function diasNoEstado(entradaISO) {
  if (!entradaISO) return 0;
  return Math.floor((Date.now() - new Date(entradaISO).getTime()) / (1000 * 60 * 60 * 24));
}

const onlyDigits = (s) => (s || '').replace(/\D/g, '');

const fmtMoeda = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ProcessoAmbiental({ currentUser, ALL_USERS, nucleoAmbiental, isMaster, podeAdministrar, theme, setTheme, onLogout, standalone }) {
  const meuNucleo = isMaster ? 'master' : (nucleoAmbiental?.[currentUser] || null);

  const [processos, setProcessos] = useState([]);
  const [view, setView] = useState('dashboard'); // dashboard | lista | detalhe | novo
  const [estadoFiltro, setEstadoFiltro] = useState(null); // null = "Todos os processos"
  const [selectedId, setSelectedId] = useState(null);
  const [consultaOutroNucleo, setConsultaOutroNucleo] = useState(false);
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState('antigo'); // antigo | recente
  const [nucleoFiltro, setNucleoFiltro] = useState('todos');
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false);
  const [novo, setNovo] = useState({ numeroSEI: '', parte: '', valorMulta: '' });
  const [dataInput, setDataInput] = useState('');
  const [showIncidenteModal, setShowIncidenteModal] = useState(false);
  const [incidenteForm, setIncidenteForm] = useState({ tipo: 'TAC', observacao: '', considerarCumprido: true });
  const [showResolverIncidente, setShowResolverIncidente] = useState(false);
  const [resolverForm, setResolverForm] = useState({ tipoResolucao: '', observacao: '' });
  const [confirmAction, setConfirmAction] = useState(null); // { mensagem, onConfirm }
  const [estadoManualMaster, setEstadoManualMaster] = useState('');
  const [selecionados, setSelecionados] = useState(new Set());
  const [estadoLote, setEstadoLote] = useState('');

  // Toda movimentação de processo passa por aqui: exibe um modal de
  // confirmação antes de executar a ação de fato.
  const pedirConfirmacao = (mensagem, onConfirm) => setConfirmAction({ mensagem, onConfirm });

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'processosAmbientais'),
      (snap) => setProcessos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('❌ Erro processos ambientais:', err.message)
    );
    return () => unsub();
  }, []);

  const selected = processos.find((p) => p.id === selectedId) || null;

  const moverProcesso = async (p, novoEstado, tipo = 'manual', extra = {}) => {
    const historico = [...(p.historico || []), { de: p.estado, para: novoEstado, em: new Date().toISOString(), por: currentUser, tipo }];
    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      estado: novoEstado,
      entradaNoEstadoEm: new Date().toISOString(),
      vistoPor: {},
      historico,
      ...extra,
    });
  };

  // Verificação periódica de prazos automáticos (dispara migração ao vencer)
  useEffect(() => {
    const checar = () => {
      const agora = new Date();
      processos.forEach((p) => {
        if (p.concluido || p.incidente?.ativo) return;
        const est = ESTADOS_AMBIENTAL[p.estado];
        if (est?.auto && p.prazo?.fim && new Date(p.prazo.fim + 'T23:59:59') <= agora) {
          const proximo = PROXIMO_AUTOMATICO[p.estado];
          if (proximo) moverProcesso(p, proximo, 'automatica');
        }
      });
    };
    checar();
    const interval = setInterval(checar, 60 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processos]);

  const iniciarPrazo = (p, campoData, valor, estadoDestino) => {
    const { inicio, fim } = calcularPrazo20Dias(valor);
    moverProcesso(p, estadoDestino, 'manual', { [`datas.${campoData}`]: valor, prazo: { inicio, fim, origem: estadoDestino } });
  };

  const certificarAR = (p, entregue) => moverProcesso(p, entregue ? 'aguardando_saneamento' : 'pendente_edital', 'automatica');
  const certificarEdital = (p) => moverProcesso(p, 'aguardando_saneamento', 'automatica');
  const certificarDecisao = (p, entregue, recurso) => {
    if (!entregue) return moverProcesso(p, 'pendente_edital_decisao', 'automatica');
    const destino = recurso ? 'pendente_despacho_consema' : 'cobranca_administrativa';
    const extra = recurso ? {} : { prazo: { inicio: toISODate(new Date()), fim: toISODate(addMeses(new Date(), 3)), origem: 'cobranca_administrativa' } };
    return moverProcesso(p, destino, 'automatica', extra);
  };
  const certificarEditalDecisao = (p, recurso) => {
    const destino = recurso ? 'pendente_despacho_consema' : 'cobranca_administrativa';
    const extra = recurso ? {} : { prazo: { inicio: toISODate(new Date()), fim: toISODate(addMeses(new Date(), 3)), origem: 'cobranca_administrativa' } };
    return moverProcesso(p, destino, 'automatica', extra);
  };

  const concluirProcesso = async (p) => {
    await updateDoc(doc(db, 'processosAmbientais', p.id), { concluido: true, concluidoEm: new Date().toISOString() });
    setView('dashboard'); setSelectedId(null);
  };

  // AR devolvido sem cumprimento (não entregue) — pula direto para o Edital,
  // sem aguardar os 20 dias de contagem (não há AR válido para contar).
  const arNaoCumprido = (p) => moverProcesso(p, 'pendente_edital', 'manual', { 'datas.arNaoCumpridoEm': new Date().toISOString().slice(0, 10) });

  // Somente o master pode excluir um processo definitivamente.
  const excluirProcesso = async (p) => {
    await deleteDoc(doc(db, 'processosAmbientais', p.id));
    setView('dashboard'); setSelectedId(null);
  };

  // Somente o master pode mover um processo para qualquer estado, livremente.
  const moverEstadoMaster = (p) => {
    if (!estadoManualMaster || estadoManualMaster === p.estado) return;
    moverProcesso(p, estadoManualMaster, 'manual');
    setEstadoManualMaster('');
  };

  const toggleSelecionado = (id) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const moverLote = (lista) => {
    if (!estadoLote || selecionados.size === 0) return;
    lista.filter((p) => selecionados.has(p.id)).forEach((p) => moverProcesso(p, estadoLote, 'manual'));
    setSelecionados(new Set());
    setEstadoLote('');
  };

  const criarProcesso = async () => {
    if (!novo.numeroSEI.trim() || !novo.parte.trim()) { alert('Preencha o número SEI e o nome da parte.'); return; }
    await addDoc(collection(db, 'processosAmbientais'), {
      numeroSEI: novo.numeroSEI.trim(),
      numeroSEIDigits: onlyDigits(novo.numeroSEI),
      parte: novo.parte.trim(),
      valorMulta: parseFloat(novo.valorMulta.replace(',', '.')) || 0,
      estado: 'triagem',
      dataAutuacao: new Date().toISOString().slice(0, 10),
      entradaNoEstadoEm: new Date().toISOString(),
      vistoPor: {},
      datas: {}, historico: [], incidente: null, concluido: false,
      criadoEm: new Date().toISOString(), criadoPor: currentUser,
    });
    setNovo({ numeroSEI: '', parte: '', valorMulta: '' });
    alert(`✅ Processo ${novo.numeroSEI.trim()} autuado com sucesso!\n\nRemetido à ASSTEC para triagem inicial.`);
    setView('dashboard');
  };

  // ─── Incidente (só ASSTEC) ───────────────────────────────────────
  const abrirIncidente = async (p) => {
    const extra = {
      incidente: {
        ativo: true,
        tipo: incidenteForm.tipo,
        observacao: incidenteForm.observacao,
        criadoEm: new Date().toISOString(),
        criadoPor: currentUser,
        estadoAnterior: p.estado,
        considerarCumprido: incidenteForm.considerarCumprido,
        prazoSalvo: p.prazo || null,
      },
    };
    if (!incidenteForm.considerarCumprido && p.prazo?.fim) {
      extra.incidente.diasRestantes = Math.max(diffDiasCorridos(new Date(), new Date(p.prazo.fim + 'T23:59:59')), 0);
    }
    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      ...extra,
      historico: [...(p.historico || []), { de: p.estado, para: 'incidente', em: new Date().toISOString(), por: currentUser, tipo: 'manual' }],
    });
    setShowIncidenteModal(false);
    setIncidenteForm({ tipo: 'TAC', observacao: '', considerarCumprido: true });
  };

  const resolverIncidente = async (p) => {
    const inc = p.incidente;
    let novoEstado = inc.estadoAnterior;
    let extra = {};
    if (inc.considerarCumprido) {
      const est = ESTADOS_AMBIENTAL[novoEstado];
      if (est?.auto) novoEstado = PROXIMO_AUTOMATICO[novoEstado] || novoEstado;
    } else if (inc.prazoSalvo) {
      const fim = new Date();
      fim.setDate(fim.getDate() + (inc.diasRestantes || 0));
      extra.prazo = { ...inc.prazoSalvo, fim: toISODate(proximoDiaUtil(fim)) };
    }
    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      estado: novoEstado,
      entradaNoEstadoEm: new Date().toISOString(),
      vistoPor: {},
      ...extra,
      incidente: { ...inc, ativo: false, resolvidoEm: new Date().toISOString(), resolvidoPor: currentUser, tipoResolucao: resolverForm.tipoResolucao, observacaoResolucao: resolverForm.observacao },
      historico: [...(p.historico || []), { de: 'incidente', para: novoEstado, em: new Date().toISOString(), por: currentUser, tipo: 'manual' }],
    });
    setShowResolverIncidente(false);
    setResolverForm({ tipoResolucao: '', observacao: '' });
  };

  // ─── Visibilidade por núcleo ──────────────────────────────────────
  const nucleoView = isMaster ? 'todos' : (consultaOutroNucleo ? (meuNucleo === 'asstec' ? 'notificacoes' : 'asstec') : meuNucleo);
  const somenteConsulta = !isMaster && consultaOutroNucleo;
  const podeAlternarNucleo = meuNucleo === 'asstec'; // só ASSTEC tem a toggle (Notificações não acessa o outro lado)

  // Na DASHBOARD, cada núcleo só vê as classes que ele efetivamente movimenta
  // (estados com contagem automática de prazo — sem nenhuma ação manual — ficam
  // de fora dos cards; continuam visíveis em "Todos os Processos"). O master
  // vê tudo, inclusive as contagens automáticas, para ter visão completa.
  const estadosVisiveis = Object.entries(ESTADOS_AMBIENTAL)
    .filter(([, e]) => (isMaster || !e.auto) && (nucleoView === 'todos' || e.nucleo === nucleoView || e.nucleo === 'ambos'))
    .sort((a, b) => a[1].ordem - b[1].ordem);

  const ativos = processos.filter((p) => !p.concluido && !p.incidente?.ativo);
  const incidentesAtivos = processos.filter((p) => p.incidente?.ativo);

  const buscaDigits = onlyDigits(busca);
  const filtrarBusca = (lista) => {
    if (!busca.trim()) return lista;
    return lista.filter((p) => (buscaDigits && p.numeroSEIDigits?.includes(buscaDigits)) || p.parte?.toLowerCase().includes(busca.trim().toLowerCase()));
  };

  const contarEstado = (id) => ativos.filter((p) => p.estado === id);
  const nucleoDoEstado = (id) => (ESTADOS_AMBIENTAL[id].nucleo === 'ambos' ? meuNucleo : ESTADOS_AMBIENTAL[id].nucleo);
  // Cada pessoa tem seu próprio contador de acessos (vistoPor.<usuário>).
  // O card do ESTADO (dashboard) só pisca até o 1º acesso (contador === 0).
  // O card do PROCESSO (dentro da lista) pisca até a 3ª vez que a pessoa
  // entrar naquele estado (contador < 3). Movimentar o processo (ver
  // moverProcesso) reinicia o contador para todos.
  const vezesVisto = (p) => p.vistoPor?.[currentUser] || 0;
  const naoVistos = (id) => contarEstado(id).filter((p) => vezesVisto(p) === 0);
  // Aguardando Retorno de AR: alerta vermelho quando algum processo já
  // passou de 60 dias sem registro de retorno.
  const temARAtrasado = (id) => id === 'pendente_retorno_ar' && contarEstado(id).some((p) => diasNoEstado(p.entradaNoEstadoEm) > 60);

  const abrirGrupo = async (estadoId) => {
    setEstadoFiltro(estadoId);
    setView('lista');
    if (somenteConsulta) return;
    const pendentes = contarEstado(estadoId).filter((p) => vezesVisto(p) < 3);
    for (const p of pendentes) {
      await updateDoc(doc(db, 'processosAmbientais', p.id), { [`vistoPor.${currentUser}`]: vezesVisto(p) + 1 });
    }
  };

  const listaAtual = () => {
    let lista = mostrarConcluidos ? processos.filter((p) => !p.incidente?.ativo) : ativos;
    if (estadoFiltro) lista = lista.filter((p) => p.estado === estadoFiltro);
    if (nucleoFiltro !== 'todos') lista = lista.filter((p) => ESTADOS_AMBIENTAL[p.estado]?.nucleo === nucleoFiltro || ESTADOS_AMBIENTAL[p.estado]?.nucleo === 'ambos');
    lista = filtrarBusca(lista);
    lista = [...lista].sort((a, b) => ordem === 'antigo'
      ? new Date(a.dataAutuacao) - new Date(b.dataAutuacao)
      : new Date(b.dataAutuacao) - new Date(a.dataAutuacao));
    return lista;
  };

  const nomeUsuario = ALL_USERS?.[currentUser]?.nome || currentUser;

  // ─── Detalhe do processo: ações por estado ───────────────────────
  const renderAcaoEstado = (p) => {
    const est = ESTADOS_AMBIENTAL[p.estado];
    if (!est) return null;
    const podeAgir = isMaster || (!somenteConsulta && nucleoDoEstado(p.estado) === meuNucleo);
    if (!podeAgir) return <p className="empty-state" style={{ padding: '1rem 0' }}>Somente o núcleo responsável por este estado pode movimentá-lo.</p>;

    switch (p.estado) {
      case 'triagem':
        return <button className="btn-primary" onClick={() => pedirConfirmacao('Concluir a triagem inicial e enviar este processo para Notificação?', () => moverProcesso(p, 'pendente_notificacao'))}>Concluir Triagem → Iniciar Notificação</button>;

      case 'pendente_notificacao':
        return <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma que a notificação foi enviada? O processo passará a aguardar o retorno do AR.', () => moverProcesso(p, 'pendente_retorno_ar'))}>Notificação Enviada → Aguardar Retorno de AR</button>;

      case 'pendente_retorno_ar':
        return (
          <div className="form-group">
            <label>Data de Recebimento do AR</label>
            <input type="date" value={dataInput} onChange={(e) => setDataInput(e.target.value)} />
            <div className="action-buttons" style={{ marginTop: '10px' }}>
              <button className="btn-primary" disabled={!dataInput}
                onClick={() => pedirConfirmacao(`Confirma o recebimento do AR em ${new Date(dataInput + 'T12:00:00').toLocaleDateString('pt-BR')}? A contagem do prazo de 20 dias será iniciada.`, () => { iniciarPrazo(p, 'recebimentoAR', dataInput, 'aguardando_prazo_ar'); setDataInput(''); })}>
                Confirmar Recebimento do AR
              </button>
              <button className="btn-secondary"
                onClick={() => pedirConfirmacao('Confirma que o AR voltou não cumprido (não entregue)? O processo seguirá direto para Pendente de Edital.', () => arNaoCumprido(p))}>
                AR Não Cumprido
              </button>
            </div>
          </div>
        );

      case 'aguardando_prazo_ar':
      case 'aguardando_prazo_edital':
      case 'aguardando_prazo_notificacao_decisao':
      case 'aguardando_prazo_recurso_edital':
      case 'cobranca_administrativa':
        return (
          <div className="info-box">
            <label>Prazo em contagem automática</label>
            <p>Início: {p.prazo?.inicio ? new Date(p.prazo.inicio).toLocaleDateString('pt-BR') : '—'} — Fim previsto: <strong>{p.prazo?.fim ? new Date(p.prazo.fim).toLocaleDateString('pt-BR') : '—'}</strong></p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>A migração para a próxima etapa acontece automaticamente ao final do prazo.</p>
          </div>
        );

      case 'pendente_certificacao_ar':
        return (
          <div className="form-group">
            <label>O AR foi entregue (cumprido)?</label>
            <div className="action-buttons">
              <button className="btn-approve" onClick={() => pedirConfirmacao('Confirma que o AR foi entregue? O processo seguirá para Saneamento/Julgamento.', () => certificarAR(p, true))}>Sim, foi entregue</button>
              <button className="btn-secondary" onClick={() => pedirConfirmacao('Confirma que o AR não retornou? O processo seguirá para Pendente de Edital.', () => certificarAR(p, false))}>Não retornou</button>
            </div>
          </div>
        );

      case 'pendente_edital':
      case 'pendente_edital_decisao':
        return (
          <div className="form-group">
            <label>Data de Publicação do Edital</label>
            <input type="date" value={dataInput} onChange={(e) => setDataInput(e.target.value)} />
            <button className="btn-primary" style={{ marginTop: '10px' }} disabled={!dataInput}
              onClick={() => pedirConfirmacao(`Confirma a publicação do edital em ${new Date(dataInput + 'T12:00:00').toLocaleDateString('pt-BR')}? A contagem do prazo de 20 dias será iniciada.`, () => {
                const destino = p.estado === 'pendente_edital' ? 'aguardando_prazo_edital' : 'aguardando_prazo_recurso_edital';
                const campo = p.estado === 'pendente_edital' ? 'publicacaoEdital' : 'publicacaoEditalDecisao';
                iniciarPrazo(p, campo, dataInput, destino); setDataInput('');
              })}>
              Confirmar Publicação do Edital
            </button>
          </div>
        );

      case 'pendente_certificacao_edital':
        return <button className="btn-approve" onClick={() => pedirConfirmacao('Certificar o decurso do prazo do edital? O processo seguirá para Saneamento/Julgamento.', () => certificarEdital(p))}>Certificar Decurso do Prazo</button>;

      case 'aguardando_saneamento':
        return (
          <div className="action-buttons">
            <button className="btn-secondary" onClick={() => pedirConfirmacao('Converter este processo em Diligência?', () => moverProcesso(p, 'pendente_diligencia'))}>Converter em Diligência</button>
            <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma o julgamento? O processo seguirá para Notificação de Decisão.', () => moverProcesso(p, 'pendente_notificacao_decisao'))}>Julgado → Notificar Decisão</button>
          </div>
        );

      case 'pendente_diligencia': {
        const dias = diasNoEstado(p.entradaNoEstadoEm);
        return (
          <>
            {dias > 20 && <div className="alert-banner warning" style={{ marginBottom: '12px' }}>⚠️ Processo parado há {dias} dias nesta etapa.</div>}
            <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma que a diligência foi cumprida? O processo seguirá para Notificação de Decisão.', () => moverProcesso(p, 'pendente_notificacao_decisao'))}>Diligência Cumprida → Notificar Decisão</button>
          </>
        );
      }

      case 'pendente_notificacao_decisao':
        return (
          <div className="form-group">
            <label>Data de Notificação da Decisão (AR/Email/WPP)</label>
            <input type="date" value={dataInput} onChange={(e) => setDataInput(e.target.value)} />
            <button className="btn-primary" style={{ marginTop: '10px' }} disabled={!dataInput}
              onClick={() => pedirConfirmacao(`Confirma a notificação da decisão em ${new Date(dataInput + 'T12:00:00').toLocaleDateString('pt-BR')}? A contagem do prazo de 20 dias será iniciada.`, () => { iniciarPrazo(p, 'notificacaoDecisao', dataInput, 'aguardando_prazo_notificacao_decisao'); setDataInput(''); })}>
              Confirmar Notificação da Decisão
            </button>
          </div>
        );

      case 'pendente_certificacao_decisao':
        return (
          <div className="form-group">
            <label>A notificação foi entregue (confirmada)?</label>
            <div className="action-buttons">
              <button className="btn-secondary" onClick={() => pedirConfirmacao('Confirma que a notificação NÃO foi entregue? O processo seguirá para Edital da Decisão.', () => certificarDecisao(p, false))}>Não — precisa de Edital</button>
            </div>
            <label style={{ marginTop: '14px', display: 'block' }}>Se entregue: houve recurso?</label>
            <div className="action-buttons">
              <button className="btn-approve" onClick={() => pedirConfirmacao('Confirma que a notificação foi entregue e que houve recurso? O processo seguirá para Despacho ao CONSEMA.', () => certificarDecisao(p, true, true))}>Sim, houve recurso</button>
              <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma que a notificação foi entregue e que não houve recurso? O processo seguirá para Cobrança Administrativa.', () => certificarDecisao(p, true, false))}>Não houve recurso</button>
            </div>
          </div>
        );

      case 'pendente_certificacao_edital_decisao':
        return (
          <div className="form-group">
            <label>Houve recurso?</label>
            <div className="action-buttons">
              <button className="btn-approve" onClick={() => pedirConfirmacao('Confirma que houve recurso? O processo seguirá para Despacho ao CONSEMA.', () => certificarEditalDecisao(p, true))}>Sim, houve recurso</button>
              <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma que não houve recurso? O processo seguirá para Cobrança Administrativa.', () => certificarEditalDecisao(p, false))}>Não houve recurso</button>
            </div>
          </div>
        );

      case 'pendente_despacho_consema':
      case 'pendente_envio_pge':
        return <button className="btn-primary" onClick={() => pedirConfirmacao('Concluir/arquivar este processo? Ele sairá das listas ativas.', () => concluirProcesso(p))}>Concluir / Arquivar Processo</button>;

      default:
        return null;
    }
  };

  // ─── Render: usuário do Núcleo de Notificações sem núcleo/master ──
  if (!meuNucleo && !isMaster) {
    return <div className="empty-state" style={{ padding: '3rem' }}>Você não tem acesso a este módulo. Fale com o administrador.</div>;
  }

  const conteudo = (
    <div className="content-area">
      {view === 'dashboard' && (
        <div className="list-view">
          <div className="list-header">
            <h3>📋 Processo Administrativo Ambiental {nucleoView !== 'todos' && `— Núcleo ${nucleoView === 'asstec' ? 'ASSTEC' : 'Notificações'}${somenteConsulta ? ' (consulta)' : ''}`}</h3>
            <div className="header-buttons">
              {podeAlternarNucleo && (
                <button className="btn-settings" onClick={() => setConsultaOutroNucleo((v) => !v)}>
                  {consultaOutroNucleo ? '↩ Ver Minha Dashboard' : '👁 Ver Núcleo de Notificações'}
                </button>
              )}
              <button className="btn-settings" onClick={() => { setEstadoFiltro(null); setView('lista'); }}>Todos os Processos</button>
              {!somenteConsulta && (
                <button className="btn-new" onClick={() => setView('novo')}>+ Novo Processo</button>
              )}
            </div>
          </div>

          {incidentesAtivos.length > 0 && (nucleoView === 'todos' || nucleoView === 'asstec') && (
            <div className="pa-dash-grid" style={{ marginBottom: '18px' }}>
              <div className="pa-card pa-card-incident" onClick={() => { setEstadoFiltro('__incidente__'); setView('lista'); }}>
                <span className="pa-card-count">{incidentesAtivos.length}</span>
                <span className="pa-card-label">🚧 Processos em Incidente (Sobrestados)</span>
              </div>
            </div>
          )}

          <div className="pa-dash-grid">
            {estadosVisiveis.map(([id, est]) => {
              const novos = naoVistos(id).length;
              const arAtrasado = temARAtrasado(id);
              const classeBlink = arAtrasado ? 'pa-card-blink-red' : (novos > 0 ? 'pa-card-blink' : '');
              return (
              <div key={id} className={`pa-card ${classeBlink}`} onClick={() => abrirGrupo(id)}>
                <span className="pa-card-count">{contarEstado(id).length}</span>
                <span className="pa-card-label">{est.label}</span>
                {novos > 0 && <span className="pa-card-new-badge">{novos} novo{novos === 1 ? '' : 's'} processo{novos === 1 ? '' : 's'}</span>}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'novo' && (
        <div className="form-card">
          <h3>Novo Processo Ambiental</h3>
          <div className="form-group"><label>Número SEI *</label>
            <input type="text" placeholder="00130.005770/2026-19" value={novo.numeroSEI} onChange={(e) => setNovo({ ...novo, numeroSEI: e.target.value })} />
          </div>
          <div className="form-group"><label>Nome da Parte *</label>
            <input type="text" value={novo.parte} onChange={(e) => setNovo({ ...novo, parte: e.target.value })} />
          </div>
          <div className="form-group"><label>Valor da Multa (R$)</label>
            <input type="text" placeholder="0,00" value={novo.valorMulta} onChange={(e) => setNovo({ ...novo, valorMulta: e.target.value })} />
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={criarProcesso}>Autuar Processo</button>
            <button className="btn-secondary" onClick={() => setView('dashboard')}>Cancelar</button>
          </div>
        </div>
      )}

      {view === 'lista' && (
        <div className="list-view">
          <div className="list-header">
            <h3>{estadoFiltro === '__incidente__' ? '🚧 Processos em Incidente' : estadoFiltro ? ESTADOS_AMBIENTAL[estadoFiltro]?.label : 'Todos os Processos'}</h3>
            <div className="header-buttons">
              <button className="btn-settings" onClick={() => setView('dashboard')}>← Voltar à Dashboard</button>
            </div>
          </div>

          <div className="form-grid" style={{ marginBottom: '14px' }}>
            <div className="form-group"><label>Buscar por SEI ou Parte</label>
              <input type="text" placeholder="00130.005770/2026-19 ou nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="form-group"><label>Ordem</label>
              <select value={ordem} onChange={(e) => setOrdem(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--neutral-300)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                <option value="antigo">Mais antigo primeiro</option>
                <option value="recente">Mais recente primeiro</option>
              </select>
            </div>
            {!estadoFiltro && (
              <div className="form-group"><label>Núcleo Responsável</label>
                <select value={nucleoFiltro} onChange={(e) => setNucleoFiltro(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--neutral-300)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                  <option value="todos">Todos</option>
                  <option value="asstec">ASSTEC</option>
                  <option value="notificacoes">Notificações</option>
                </select>
              </div>
            )}
          </div>
          {!estadoFiltro && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontSize: '13px' }}>
              <input type="checkbox" checked={mostrarConcluidos} onChange={(e) => setMostrarConcluidos(e.target.checked)} /> Mostrar concluídos/arquivados
            </label>
          )}

          {(() => {
            const listaExibida = estadoFiltro === '__incidente__' ? filtrarBusca(incidentesAtivos) : listaAtual();
            const podeLote = (isMaster || podeAdministrar) && !estadoFiltro;

            if (listaExibida.length === 0) return <p className="empty-state">Nenhum processo encontrado</p>;

            return (
              <>
                {podeLote && (
                  <div className="form-grid" style={{ marginBottom: '14px', alignItems: 'flex-end' }}>
                    <div className="form-group">
                      <label>Mover em Lote ({selecionados.size} selecionado{selecionados.size === 1 ? '' : 's'})</label>
                      <select value={estadoLote} onChange={(e) => setEstadoLote(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--neutral-300)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                        <option value="">Selecione o estado destino...</option>
                        {Object.entries(ESTADOS_AMBIENTAL).sort((a, b) => a[1].ordem - b[1].ordem).map(([id, e]) => (
                          <option key={id} value={id}>{e.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: '0 0 auto' }}>
                      <button className="btn-primary" disabled={!estadoLote || selecionados.size === 0}
                        onClick={() => pedirConfirmacao(`Mover ${selecionados.size} processo(s) selecionado(s) para "${ESTADOS_AMBIENTAL[estadoLote]?.label}"?`, () => moverLote(listaExibida))}>
                        Mover Selecionados
                      </button>
                    </div>
                    {selecionados.size > 0 && (
                      <div className="form-group" style={{ flex: '0 0 auto' }}>
                        <button type="button" className="link-btn" onClick={() => setSelecionados(new Set())}>Limpar seleção</button>
                      </div>
                    )}
                  </div>
                )}

                {listaExibida.map((p) => {
                  const arAtrasado = p.estado === 'pendente_retorno_ar' && diasNoEstado(p.entradaNoEstadoEm) > 60;
                  const éNovo = estadoFiltro && estadoFiltro !== '__incidente__' && vezesVisto(p) < 3;
                  return (
                  <div key={p.id} className={`card-item ${arAtrasado ? 'card-item-alerta' : (éNovo ? 'card-item-blink' : '')}`} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                      {podeLote && (
                        <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => toggleSelecionado(p.id)}
                          onClick={(e) => e.stopPropagation()} style={{ marginTop: '4px' }} />
                      )}
                      <div style={{ flex: 1, userSelect: 'text' }}>
                        <div className="card-top">
                          <strong>{p.numeroSEI}</strong>
                          <span className="badge status-pendente">{p.incidente?.ativo ? '🚧 Incidente' : ESTADOS_AMBIENTAL[p.estado]?.label}</span>
                        </div>
                        {éNovo && <span className="card-item-new-badge">🆕 Novo processo</span>}
                        <p className="card-text"><strong>Parte:</strong> {p.parte}</p>
                        <p className="card-text"><strong>Autuado em:</strong> {new Date(p.dataAutuacao).toLocaleDateString('pt-BR')}</p>
                        <p className="card-text"><strong>Dias no estado atual:</strong> {diasNoEstado(p.entradaNoEstadoEm)} dia(s)</p>
                        {arAtrasado && <p className="card-text" style={{ color: 'var(--accent-red, #B14C40)', fontWeight: 700 }}>⚠️ Mais de 60 dias sem retorno do AR</p>}
                      </div>
                    </div>
                    <button className="btn-secondary" style={{ alignSelf: 'flex-start', marginTop: '4px' }} onClick={() => { setSelectedId(p.id); setView('detalhe'); }}>Ver Detalhes →</button>
                  </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}

      {view === 'detalhe' && selected && (
        <div className="detail-card">
          <button className="back-button" onClick={() => { setView('lista'); setSelectedId(null); }}>← Voltar</button>
          <div className="card-header">
            <h2>🌿 {selected.numeroSEI}</h2>
            <span className="badge status-pendente">{selected.incidente?.ativo ? '🚧 Incidente' : ESTADOS_AMBIENTAL[selected.estado]?.label}</span>
          </div>
          <div className="info-grid">
            <div className="info-item"><label>Parte</label><p>{selected.parte}</p></div>
            <div className="info-item"><label>Valor da Multa</label><p>{fmtMoeda(selected.valorMulta)}</p></div>
            <div className="info-item"><label>Data de Autuação</label><p>{new Date(selected.dataAutuacao).toLocaleDateString('pt-BR')}</p></div>
            <div className="info-item"><label>Dias no Estado Atual</label><p>{diasNoEstado(selected.entradaNoEstadoEm)} dia(s)</p></div>
          </div>

          {(isMaster || podeAdministrar) && (
            <div className="info-box">
              <label>⚙️ Controles Administrativos</label>
              <div className="form-group">
                <label>Alterar Estado do Processo (livre)</label>
                <div className="action-buttons">
                  <select value={estadoManualMaster} onChange={(e) => setEstadoManualMaster(e.target.value)}
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--neutral-300)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                    <option value="">Selecione um estado...</option>
                    {Object.entries(ESTADOS_AMBIENTAL).sort((a, b) => a[1].ordem - b[1].ordem).map(([id, e]) => (
                      <option key={id} value={id}>{e.label}</option>
                    ))}
                  </select>
                  <button className="btn-secondary" disabled={!estadoManualMaster || estadoManualMaster === selected.estado}
                    onClick={() => pedirConfirmacao(`Confirma a alteração manual do estado para "${ESTADOS_AMBIENTAL[estadoManualMaster]?.label}"?`, () => moverEstadoMaster(selected))}>
                    Mover
                  </button>
                </div>
              </div>
              <button className="btn-delete" style={{ marginTop: '10px' }}
                onClick={() => pedirConfirmacao(`Excluir definitivamente o processo ${selected.numeroSEI}? Esta ação não pode ser desfeita.`, () => excluirProcesso(selected))}>
                🗑️ Excluir Processo
              </button>
            </div>
          )}

          {selected.incidente?.ativo ? (
            <div className="info-box">
              <label>🚧 Incidente Ativo</label>
              <p><strong>Tipo:</strong> {selected.incidente.tipo}</p>
              {selected.incidente.observacao && <p><strong>Observação:</strong> {selected.incidente.observacao}</p>}
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Aberto em {new Date(selected.incidente.criadoEm).toLocaleDateString('pt-BR')} por {ALL_USERS?.[selected.incidente.criadoPor]?.nome || selected.incidente.criadoPor}</p>
              {isMaster || meuNucleo === 'asstec' ? (
                showResolverIncidente ? (
                  <div className="form-section" style={{ marginTop: '10px' }}>
                    <div className="form-group"><label>Como foi resolvido?</label>
                      <select value={resolverForm.tipoResolucao} onChange={(e) => setResolverForm({ ...resolverForm, tipoResolucao: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--neutral-300)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                        <option value="">Selecione...</option>
                        <option value="TAC">TAC</option>
                        <option value="Parcelamento">Parcelamento</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>
                    <div className="form-group"><label>Observação</label>
                      <textarea value={resolverForm.observacao} onChange={(e) => setResolverForm({ ...resolverForm, observacao: e.target.value })} />
                    </div>
                    <div className="form-actions">
                      <button className="btn-primary" disabled={!resolverForm.tipoResolucao} onClick={() => resolverIncidente(selected)}>Confirmar Resolução</button>
                      <button className="btn-secondary" onClick={() => setShowResolverIncidente(false)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn-primary" style={{ marginTop: '10px' }} onClick={() => setShowResolverIncidente(true)}>Resolver Incidente</button>
                )
              ) : (
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Processo sobrestado até a ASSTEC resolver o incidente.</p>
              )}
            </div>
          ) : (
            <>
              <div className="info-box">
                <label>Ação Disponível</label>
                {renderAcaoEstado(selected)}
              </div>

              {(isMaster || meuNucleo === 'asstec') && !somenteConsulta && (
                showIncidenteModal ? (
                  <div className="info-box">
                    <label>🚧 Gerar Incidente</label>
                    <div className="form-group"><label>Tipo</label>
                      <select value={incidenteForm.tipo} onChange={(e) => setIncidenteForm({ ...incidenteForm, tipo: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--neutral-300)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                        <option value="TAC">TAC</option>
                        <option value="Parcelamento">Parcelamento</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>
                    <div className="form-group"><label>Observação</label>
                      <textarea value={incidenteForm.observacao} onChange={(e) => setIncidenteForm({ ...incidenteForm, observacao: e.target.value })} />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', margin: '8px 0' }}>
                      <input type="checkbox" checked={incidenteForm.considerarCumprido} onChange={(e) => setIncidenteForm({ ...incidenteForm, considerarCumprido: e.target.checked })} />
                      Considerar prazo cumprido (recomendado — o infrator tomou ciência ao gerar o incidente)
                    </label>
                    <div className="form-actions">
                      <button className="btn-primary" onClick={() => abrirIncidente(selected)}>Confirmar Incidente</button>
                      <button className="btn-secondary" onClick={() => setShowIncidenteModal(false)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn-delete" style={{ marginTop: '14px' }} onClick={() => setShowIncidenteModal(true)}>🚧 Gerar Incidente</button>
                )
              )}
            </>
          )}
        </div>
      )}

      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h4>Confirmar Movimentação</h4>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{confirmAction.mensagem}</p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }}>Confirmar</button>
              <button className="btn-secondary" onClick={() => setConfirmAction(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (!standalone) return conteudo;

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="logo-btn" onClick={() => setView('dashboard')} title="Voltar ao início">
            <span className="logo-icon"><i className="ti ti-leaf"></i></span>
            <div className="logo-text"><h2>SEMARH</h2><p>Processo Adm. Ambiental</p></div>
          </button>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
            <span className="icon"><i className="ti ti-layout-dashboard"></i></span><span className="label">Dashboard</span>
          </button>
          <button className={`nav-item ${view === 'lista' && !estadoFiltro ? 'active' : ''}`} onClick={() => { setEstadoFiltro(null); setView('lista'); }}>
            <span className="icon"><i className="ti ti-list"></i></span><span className="label">Todos os Processos</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info" data-initial={(nomeUsuario || '?').charAt(0).toUpperCase()}>
            <p className="user-name">{nomeUsuario}</p>
            <p className="user-role">Núcleo de Notificações</p>
          </div>
          <div className="sidebar-actions">
            <button className="btn-icon" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Alternar tema"><i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`}></i></button>
            <button className="btn-icon btn-logout" onClick={onLogout} title="Sair"><i className="ti ti-logout"></i></button>
          </div>
        </div>
      </aside>
      <div className="main-wrapper">
        <main className="main-content">{conteudo}</main>
      </div>
    </div>
  );
}
