import React, { useState, useEffect } from 'react';
import { db } from './firebase-config';
import { collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, getDocs, query, where } from 'firebase/firestore';

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
  aguardando_analise_minuta_gabinete:   { label: 'Aguardando Análise de Minuta pelo Gabinete',           nucleo: 'asstec',       ordem: 8.5 },
  pendente_notificacao_decisao:         { label: 'Pendente de Notificação de Decisão (AR/Email/WPP)',    nucleo: 'notificacoes', ordem: 9 },
  aguardando_prazo_notificacao_decisao: { label: 'Aguardando Decurso de Prazo de Notificação',           nucleo: 'notificacoes', ordem: 10, auto: true },
  pendente_certificacao_decisao:        { label: 'Pendente de Certificação',                             nucleo: 'notificacoes', ordem: 10.1, certificacao: true },
  pendente_edital_decisao:              { label: 'Pendente de Edital da Decisão',                        nucleo: 'asstec',       ordem: 11 },
  aguardando_prazo_recurso_edital:      { label: 'Aguardando Decurso do Prazo para Recurso de Edital',   nucleo: 'notificacoes', ordem: 12, auto: true },
  pendente_certificacao_edital_decisao: { label: 'Pendente de Certificação',                             nucleo: 'notificacoes', ordem: 12.1, certificacao: true },
  pendente_despacho_consema:            { label: 'Pendente de Despacho para Submissão ao CONSEMA',       nucleo: 'asstec',       ordem: 13 },
  cobranca_administrativa:              { label: 'Cobrança Administrativa Ativa',                        nucleo: 'ambos',        ordem: 14, auto: true },
  pendente_envio_pge:                   { label: 'Pendente de Envio para PGE',                            nucleo: 'asstec',       ordem: 15 },
  arquivado:                            { label: 'Processos Arquivados',                                 nucleo: 'ambos',        ordem: 16 },
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

// Interpreta valores no padrão brasileiro (ponto = milhar, vírgula = decimal).
// Ao colar um valor como "170.000,00", sem isso o ponto seria confundido com
// separador decimal e o valor cortado incorretamente.
function parseMoeda(str) {
  if (!str) return 0;
  let s = str.toString().trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  return parseFloat(s) || 0;
}

export default function ProcessoAmbiental({ currentUser, ALL_USERS, nucleoAmbiental, isMaster, podeAdministrar, theme, setTheme, onLogout, standalone }) {
  // O núcleo real do usuário é sempre o setor a que pertence (nucleoAmbiental),
  // inclusive para o master — isso define a visão padrão da dashboard. O
  // master (isMaster) mantém poderes administrativos plenos independente
  // do núcleo; se por acaso não tiver setor configurado, cai em 'asstec'.
  const meuNucleo = nucleoAmbiental?.[currentUser] || (isMaster ? 'asstec' : null);

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
  const [estadoNovoProcesso, setEstadoNovoProcesso] = useState('');
  const [observacaoInput, setObservacaoInput] = useState('');
  const [editandoInfo, setEditandoInfo] = useState(false);
  const [editForm, setEditForm] = useState({ numeroSEI: '', parte: '', valorMulta: '' });
  const [showArNaoCumpridoForm, setShowArNaoCumpridoForm] = useState(false);
  const [novoEndereco, setNovoEndereco] = useState('');
  const [semNovoEndereco, setSemNovoEndereco] = useState(false);
  const [showArquivarForm, setShowArquivarForm] = useState(false);
  const [motivoArquivar, setMotivoArquivar] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [estadosExport, setEstadosExport] = useState(new Set());
  // Visão da dashboard escolhida por quem tem privilégios administrativos
  // (master ou "Admin. Ambiental Total"): 'todos' | 'asstec' | 'notificacoes'.
  // null = ainda não escolheu, usa o próprio setor como padrão.
  const [dashboardView, setDashboardView] = useState(null);

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

  // Sincroniza os campos locais (observação/edição) sempre que o processo
  // selecionado muda, e reseta os formulários auxiliares de AR e arquivamento.
  useEffect(() => {
    setObservacaoInput(selected?.observacao || '');
    setEditandoInfo(false);
    setShowArNaoCumpridoForm(false);
    setNovoEndereco('');
    setSemNovoEndereco(false);
    setShowArquivarForm(false);
    setMotivoArquivar('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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

  // Chegar aqui já significa que o AR foi cumprido (o fluxo só entra em
  // pendente_certificacao_ar após confirmação de recebimento + decurso do
  // prazo). Resta apenas certificar e seguir para Saneamento/Julgamento,
  // onde se apura se houve ou não defesa.
  const certificarAR = (p) => moverProcesso(p, 'aguardando_saneamento', 'automatica');
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

  // Quando um novo endereço é encontrado após AR não cumprido, o processo
  // volta para Pendente de Notificação (novo ciclo de notificação), em vez
  // de seguir direto para o Edital.
  const registrarNovoEnderecoENotificar = (p, endereco) => moverProcesso(p, 'pendente_notificacao', 'manual', {
    'datas.novoEnderecoEncontradoEm': new Date().toISOString().slice(0, 10),
    novoEndereco: endereco,
  });

  // Salva a observação livre do processo (campo de anotações gerais).
  const salvarObservacao = async (p) => {
    await updateDoc(doc(db, 'processosAmbientais', p.id), { observacao: observacaoInput });
  };

  // Master pode corrigir os dados cadastrais do processo (não é movimentação
  // de estado, então não passa pelo histórico de tramitação).
  const salvarEdicaoInfo = async (p) => {
    if (!editForm.numeroSEI.trim() || !editForm.parte.trim()) { alert('Preencha o número SEI e o nome da parte.'); return; }

    const numeroSEITrim = editForm.numeroSEI.trim();
    // Se o número SEI foi alterado, verifica se não existe outro processo com esse número
    if (numeroSEITrim !== p.numeroSEI) {
      const q = query(collection(db, 'processosAmbientais'), where('numeroSEI', '==', numeroSEITrim));
      const snap = await getDocs(q);
      if (!snap.empty) {
        alert(`❌ Já existe um processo cadastrado com o número SEI ${numeroSEITrim}.\n\nEscolha outro número.`);
        return;
      }
    }

    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      numeroSEI: numeroSEITrim,
      numeroSEIDigits: onlyDigits(numeroSEITrim),
      parte: editForm.parte.trim(),
      valorMulta: parseMoeda(editForm.valorMulta),
    });
    setEditandoInfo(false);
  };

  // Arquivamento definitivo — disponível de forma discreta em qualquer
  // processo, e também embutido na etapa de certificação pós-decisão/recurso.
  // Sempre exige motivo e registra quem arquivou.
  const arquivarProcesso = async (p, motivo) => {
    const historico = [...(p.historico || []), { de: p.estado, para: 'arquivado', em: new Date().toISOString(), por: currentUser, tipo: 'manual', motivo }];
    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      estado: 'arquivado',
      entradaNoEstadoEm: new Date().toISOString(),
      vistoPor: {},
      arquivamento: { motivo, arquivadoEm: new Date().toISOString(), arquivadoPor: currentUser },
      historico,
    });
    setShowArquivarForm(false);
    setMotivoArquivar('');
  };

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

    // Verifica se já existe processo com esse número SEI (evita duplicação)
    const numeroSEITrim = novo.numeroSEI.trim();
    const q = query(collection(db, 'processosAmbientais'), where('numeroSEI', '==', numeroSEITrim));
    const snap = await getDocs(q);
    if (!snap.empty) {
      alert(`❌ Já existe um processo cadastrado com o número SEI ${numeroSEITrim}.\n\nVerifique o número e tente novamente.`);
      return;
    }

    const estadoInicial = ((isMaster || podeAdministrar) && estadoNovoProcesso) ? estadoNovoProcesso : 'triagem';
    await addDoc(collection(db, 'processosAmbientais'), {
      numeroSEI: numeroSEITrim,
      numeroSEIDigits: onlyDigits(numeroSEITrim),
      parte: novo.parte.trim(),
      valorMulta: parseMoeda(novo.valorMulta),
      estado: estadoInicial,
      dataAutuacao: new Date().toISOString().slice(0, 10),
      entradaNoEstadoEm: new Date().toISOString(),
      vistoPor: {},
      datas: {}, historico: [], incidente: null, concluido: false,
      criadoEm: new Date().toISOString(), criadoPor: currentUser,
    });
    setNovo({ numeroSEI: '', parte: '', valorMulta: '' });
    setEstadoNovoProcesso('');
    const msgEstado = estadoInicial === 'triagem' ? 'Remetido à ASSTEC para triagem inicial.' : `Autuado diretamente em "${ESTADOS_AMBIENTAL[estadoInicial]?.label}".`;
    alert(`✅ Processo ${numeroSEITrim} autuado com sucesso!\n\n${msgEstado}`);
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
  // Master e quem tem "Admin. Ambiental Total" podem alternar livremente
  // entre Visão Total, ASSTEC e Notificações — por padrão, veem o setor a
  // que pertencem (meuNucleo), não a Visão Total.
  const podeAlternarVisaoTotal = isMaster || podeAdministrar;
  const nucleoView = podeAlternarVisaoTotal
    ? (dashboardView || meuNucleo || 'todos')
    : (consultaOutroNucleo ? (meuNucleo === 'asstec' ? 'notificacoes' : 'asstec') : meuNucleo);
  const somenteConsulta = !podeAlternarVisaoTotal && consultaOutroNucleo;
  const podeAlternarNucleo = !podeAlternarVisaoTotal && meuNucleo === 'asstec'; // só ASSTEC "comum" tem a toggle simples (Notificações não acessa o outro lado)

  // Na DASHBOARD, cada núcleo só vê as classes que ele efetivamente movimenta
  // (estados com contagem automática de prazo — sem nenhuma ação manual — ficam
  // de fora dos cards; continuam visíveis em "Todos os Processos"). O master
  // vê tudo, inclusive as contagens automáticas, para ter visão completa.
  const estadosVisiveis = Object.entries(ESTADOS_AMBIENTAL)
    .filter(([, e]) => (isMaster || podeAdministrar || !e.auto) && (nucleoView === 'todos' || e.nucleo === nucleoView || e.nucleo === 'ambos'))
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

  // ─── Exportação de planilha (dashboard) ──────────────────────────
  const abrirExportModal = () => {
    setEstadosExport(new Set(Object.keys(ESTADOS_AMBIENTAL)));
    setShowExportModal(true);
  };

  const toggleEstadoExport = (id) => {
    setEstadosExport((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportarPlanilha = () => {
    const lista = processos.filter((p) => estadosExport.has(p.estado));
    const linhas = [
      ['Número SEI', 'Parte', 'Estado'],
      ...lista.map((p) => [p.numeroSEI, p.parte, ESTADOS_AMBIENTAL[p.estado]?.label || p.estado]),
    ];
    const csv = linhas.map((row) => row.map((cell) => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `processos_ambientais_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  // Formulário de arquivamento com motivo obrigatório — sempre exibido ao
  // lado do botão "Gerar Incidente", no rodapé do processo.
  const renderArquivarInline = (p) => (
    showArquivarForm ? (
      <div className="info-box" style={{ marginTop: '14px' }}>
        <label>📁 Arquivar Processo</label>
        <div className="form-group">
          <label>Motivo do arquivamento *</label>
          <textarea value={motivoArquivar} onChange={(e) => setMotivoArquivar(e.target.value)} placeholder="Descreva o motivo do arquivamento..." />
        </div>
        <div className="form-actions">
          <button className="btn-delete" disabled={!motivoArquivar.trim()}
            onClick={() => pedirConfirmacao(`Confirma o arquivamento definitivo do processo ${p.numeroSEI}?`, () => arquivarProcesso(p, motivoArquivar.trim()))}>
            Confirmar Arquivamento
          </button>
          <button className="btn-secondary" onClick={() => { setShowArquivarForm(false); setMotivoArquivar(''); }}>Cancelar</button>
        </div>
      </div>
    ) : (
      <button className="link-btn" style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }} onClick={() => setShowArquivarForm(true)}>📁 Arquivar processo</button>
    )
  );

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
              {!showArNaoCumpridoForm && (
                <button className="btn-secondary" onClick={() => setShowArNaoCumpridoForm(true)}>AR Não Cumprido</button>
              )}
            </div>

            {showArNaoCumpridoForm && (
              <div className="info-box" style={{ marginTop: '14px' }}>
                <label>⚠️ AR Não Cumprido — Pesquisa de Novo Endereço</label>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Antes de encaminhar para o Edital, pesquise e informe abaixo eventual(is) novo(s) endereço(s) encontrado(s) do interessado, para que seja expedida uma nova notificação. Se nenhum endereço novo foi encontrado, marque a opção correspondente.
                </p>
                <div className="form-group">
                  <label>Novo(s) Endereço(s) Encontrado(s)</label>
                  <textarea value={novoEndereco} disabled={semNovoEndereco}
                    onChange={(e) => setNovoEndereco(e.target.value)}
                    placeholder="Descreva o(s) novo(s) endereço(s) encontrado(s)..." />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', margin: '8px 0' }}>
                  <input type="checkbox" checked={semNovoEndereco} onChange={(e) => { setSemNovoEndereco(e.target.checked); if (e.target.checked) setNovoEndereco(''); }} />
                  Não foram encontrados novos endereços
                </label>
                <div className="form-actions">
                  <button className="btn-primary" disabled={!semNovoEndereco && !novoEndereco.trim()}
                    onClick={() => {
                      if (semNovoEndereco || !novoEndereco.trim()) {
                        pedirConfirmacao('Confirma que o AR voltou não cumprido e que nenhum novo endereço foi encontrado? O processo seguirá para Pendente de Edital.', () => { arNaoCumprido(p); setShowArNaoCumpridoForm(false); });
                      } else {
                        pedirConfirmacao('Confirma o novo endereço encontrado? O processo voltará para Pendente de Notificação, para expedição de nova notificação.', () => { registrarNovoEnderecoENotificar(p, novoEndereco.trim()); setShowArNaoCumpridoForm(false); setNovoEndereco(''); });
                      }
                    }}>
                    Confirmar
                  </button>
                  <button className="btn-secondary" onClick={() => { setShowArNaoCumpridoForm(false); setNovoEndereco(''); setSemNovoEndereco(false); }}>Cancelar</button>
                </div>
              </div>
            )}
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
        return <button className="btn-approve" onClick={() => pedirConfirmacao('Certificar o decurso do prazo? O processo será certificado e seguirá para Saneamento/Julgamento, onde se apura se houve ou não defesa.', () => certificarAR(p))}>Processo Certificado → Saneamento/Julgamento</button>;

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
            <button className="btn-primary" onClick={() => pedirConfirmacao('Disponibilizar este processo para Análise de Minuta pelo Gabinete?', () => moverProcesso(p, 'aguardando_analise_minuta_gabinete'))}>Disponibilizar para o Gabinete</button>
          </div>
        );

      case 'aguardando_analise_minuta_gabinete':
        return <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma que a minuta foi analisada pelo Gabinete? O processo seguirá para Notificação de Decisão.', () => moverProcesso(p, 'pendente_notificacao_decisao'))}>Minuta Analisada → Notificar Decisão</button>;

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
        return <button className="btn-primary" onClick={() => pedirConfirmacao('Concluir/arquivar este processo? Ele sairá das listas ativas.', () => concluirProcesso(p))}>Concluir / Arquivar Processo</button>;

      case 'pendente_envio_pge':
        return (
          <div className="info-box">
            <label>Débito adimplido perante a PGE?</label>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Use a opção "📁 Arquivar Processo" abaixo para confirmar a adimplência — o processo será movido automaticamente para Processos Arquivados.</p>
          </div>
        );

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
              <button className="btn-settings" onClick={abrirExportModal}>📥 Exportar Planilha</button>
              {!somenteConsulta && (
                <button className="btn-new" onClick={() => setView('novo')}>+ Novo Processo</button>
              )}
            </div>
          </div>

          {podeAlternarVisaoTotal && (
            <div className="action-buttons" style={{ marginBottom: '16px' }}>
              <button className={`btn-settings ${nucleoView === 'todos' ? 'active' : ''}`} onClick={() => setDashboardView('todos')}>🌐 Visão Total</button>
              <button className={`btn-settings ${nucleoView === 'asstec' ? 'active' : ''}`} onClick={() => setDashboardView('asstec')}>🏢 Visão ASSTEC</button>
              <button className={`btn-settings ${nucleoView === 'notificacoes' ? 'active' : ''}`} onClick={() => setDashboardView('notificacoes')}>📨 Visão Notificações</button>
            </div>
          )}

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
          {(isMaster || podeAdministrar) && (
            <div className="form-group">
              <label>Estado Inicial (opcional)</label>
              <select value={estadoNovoProcesso} onChange={(e) => setEstadoNovoProcesso(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--neutral-300)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                <option value="">Padrão — Aguardando Triagem Inicial</option>
                {Object.entries(ESTADOS_AMBIENTAL).sort((a, b) => a[1].ordem - b[1].ordem).map(([id, e]) => (
                  <option key={id} value={id}>{e.label}</option>
                ))}
              </select>
            </div>
          )}
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

          <div className="info-box">
            <label>📝 Observações</label>
            <div className="form-group">
              <textarea value={observacaoInput} onChange={(e) => setObservacaoInput(e.target.value)} placeholder="Anotações gerais sobre o processo..." />
            </div>
            <button className="btn-secondary" disabled={observacaoInput === (selected.observacao || '')} onClick={() => salvarObservacao(selected)}>Salvar Observação</button>
          </div>

          {(isMaster || podeAdministrar) && (
            <div className="info-box">
              <label>✏️ Editar Informações do Processo</label>
              {editandoInfo ? (
                <>
                  <div className="form-group"><label>Número SEI</label>
                    <input type="text" value={editForm.numeroSEI} onChange={(e) => setEditForm({ ...editForm, numeroSEI: e.target.value })} />
                  </div>
                  <div className="form-group"><label>Nome da Parte</label>
                    <input type="text" value={editForm.parte} onChange={(e) => setEditForm({ ...editForm, parte: e.target.value })} />
                  </div>
                  <div className="form-group"><label>Valor da Multa (R$)</label>
                    <input type="text" value={editForm.valorMulta} onChange={(e) => setEditForm({ ...editForm, valorMulta: e.target.value })} />
                  </div>
                  <div className="form-actions">
                    <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma a alteração dos dados cadastrais deste processo?', () => salvarEdicaoInfo(selected))}>Salvar Alterações</button>
                    <button className="btn-secondary" onClick={() => setEditandoInfo(false)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <button className="btn-secondary" onClick={() => { setEditForm({ numeroSEI: selected.numeroSEI, parte: selected.parte, valorMulta: String(selected.valorMulta || '') }); setEditandoInfo(true); }}>
                  Editar Informações
                </button>
              )}
            </div>
          )}

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

          {selected.estado === 'arquivado' && selected.arquivamento && (
            <div className="info-box">
              <label>📁 Processo Arquivado</label>
              <p><strong>Motivo:</strong> {selected.arquivamento.motivo}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Arquivado em {new Date(selected.arquivamento.arquivadoEm).toLocaleDateString('pt-BR')} por {ALL_USERS?.[selected.arquivamento.arquivadoPor]?.nome || selected.arquivamento.arquivadoPor}</p>
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
              {selected.estado !== 'arquivado' && (
                <div className="info-box">
                  <label>Ação Disponível</label>
                  {renderAcaoEstado(selected)}
                </div>
              )}

              {(isMaster || meuNucleo === 'asstec') && !somenteConsulta && selected.estado !== 'arquivado' && (
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
                ) : showArquivarForm ? (
                  renderArquivarInline(selected)
                ) : (
                  <div className="action-buttons" style={{ marginTop: '14px' }}>
                    <button className="btn-delete" onClick={() => setShowIncidenteModal(true)}>🚧 Gerar Incidente</button>
                    <button className="btn-secondary" onClick={() => setShowArquivarForm(true)}>📁 Arquivar Processo</button>
                  </div>
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

      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <h4>📥 Exportar Planilha</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>Selecione os estados que devem constar na planilha (número do processo, nome e estado).</p>
            <div className="action-buttons" style={{ marginBottom: '10px' }}>
              <button className="btn-secondary" onClick={() => setEstadosExport(new Set(Object.keys(ESTADOS_AMBIENTAL)))}>Selecionar Todos</button>
              <button className="btn-secondary" onClick={() => setEstadosExport(new Set())}>Desmarcar Todos</button>
            </div>
            <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--neutral-300)', borderRadius: '8px', padding: '8px' }}>
              {Object.entries(ESTADOS_AMBIENTAL).sort((a, b) => a[1].ordem - b[1].ordem).map(([id, e]) => (
                <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '4px 0' }}>
                  <input type="checkbox" checked={estadosExport.has(id)} onChange={() => toggleEstadoExport(id)} />
                  {e.label}
                </label>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: '14px' }}>
              <button className="btn-primary" disabled={estadosExport.size === 0} onClick={exportarPlanilha}>Exportar</button>
              <button className="btn-secondary" onClick={() => setShowExportModal(false)}>Cancelar</button>
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
