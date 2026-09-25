import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from './firebase-config';
import { collection, doc, updateDoc, deleteDoc, onSnapshot, runTransaction, writeBatch } from 'firebase/firestore';

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
  ar_sem_retorno_rastreio:              { label: 'AR Sem Retorno — Consulta de Rastreio (+60 dias)',     nucleo: 'notificacoes', ordem: 3.5, destaqueAcimaDe: 'pendente_retorno_ar' },
  aguardando_prazo_ar:                  { label: 'Aguardando Decurso de Prazo de AR',                    nucleo: 'notificacoes', ordem: 4, auto: true },
  pendente_certificacao_ar:             { label: 'Pendente de Certificação de retorno do AR/Apresentação de Defesa/Não-apresentação de defesa', nucleo: 'notificacoes', ordem: 4.1, certificacao: true },
  pendente_edital:                      { label: 'Pendente de Edital',                                   nucleo: 'asstec',       ordem: 5 },
  aguardando_prazo_edital:              { label: 'Aguardando Decurso de Prazo de Edital',                nucleo: 'notificacoes', ordem: 6, auto: true },
  pendente_certificacao_edital:         { label: 'Pendente de Certificação de decurso de prazo de edital com Apresentação de Defesa/Não-apresentação de defesa', nucleo: 'notificacoes', ordem: 6.1, certificacao: true },
  aguardando_saneamento:                { label: 'Aguardando Saneamento/Julgamento',                     nucleo: 'asstec',       ordem: 7 },
  acompanhamento_tacs:                  { label: 'Acompanhamento de TACs',                               nucleo: 'asstec',       ordem: 7.2 },
  pendente_diligencia:                  { label: 'Pendente de Diligência',                                nucleo: 'notificacoes', ordem: 8 },
  aguardando_analise_minuta_gabinete:   { label: 'Aguardando Análise de Minuta pelo Gabinete',           nucleo: 'asstec',       ordem: 8.5 },
  triagem_despacho_notificacao_decisao: { label: 'Triagem de Despacho/Notificação após Decisão',         nucleo: 'asstec',       ordem: 8.7 },
  pendente_notificacao_decisao:         { label: 'Pendente de Notificação de Decisão (AR/Email/WPP)',    nucleo: 'notificacoes', ordem: 9 },
  pendente_retorno_ar_decisao:          { label: 'Pendente de Retorno de AR (Notificação de Decisão)',   nucleo: 'notificacoes', ordem: 9.4 },
  ar_sem_retorno_rastreio_decisao:      { label: 'AR Sem Retorno — Consulta de Rastreio (+60 dias)',     nucleo: 'notificacoes', ordem: 9.45, destaqueAcimaDe: 'pendente_retorno_ar_decisao' },
  aguardando_prazo_notificacao_decisao: { label: 'Aguardando Decurso de Prazo de Notificação',           nucleo: 'notificacoes', ordem: 10, auto: true },
  pendente_certificacao_decisao:        { label: 'Pendente de Certificação de retorno do AR/Apresentação de recurso/Não-apresentação de recurso', nucleo: 'notificacoes', ordem: 10.1, certificacao: true },
  pendente_edital_decisao:              { label: 'Pendente de Edital da Decisão',                        nucleo: 'asstec',       ordem: 11 },
  aguardando_prazo_recurso_edital:      { label: 'Aguardando Decurso do Prazo para Recurso de Edital',   nucleo: 'notificacoes', ordem: 12, auto: true },
  pendente_certificacao_edital_decisao: { label: 'Pendente de Certificação de decurso de prazo de edital com Apresentação de recurso/Não-apresentação de recurso', nucleo: 'notificacoes', ordem: 12.1, certificacao: true },
  pendente_despacho_consema:            { label: 'Pendente de Despacho/Remessa para CONSEMA',            nucleo: 'asstec',       ordem: 13 },
  cobranca_administrativa:              { label: 'Cobrança Administrativa Ativa',                        nucleo: 'ambos',        ordem: 14, auto: true },
  pendente_envio_pge:                   { label: 'Pendente de Envio para PGE',                            nucleo: 'asstec',       ordem: 15 },
  remetido_ministerio_publico:          { label: 'Remetido ao Ministério Público',                       nucleo: 'asstec',       ordem: 15.5 },
  arquivado:                            { label: 'Processos Arquivados',                                 nucleo: 'ambos',        ordem: 16 },
};

// Legenda explicativa do fluxo procedimental, exibida ao final da dashboard —
// resume as grandes fases do processo para quem não acompanha o dia a dia.
const LEGENDA_FLUXO = [
  { titulo: 'Aguardando Triagem', descricao: 'Processo autuado no SEI.' },
  { titulo: 'Pendente de Notificação / Pendente de Certificação (1)', descricao: 'Notificação expedida! Aguardando defesa do interessado.' },
  { titulo: 'Aguardando Saneamento/Diligência', descricao: 'Processo será julgado ou encaminhado ao setor técnico para esclarecimentos.' },
  { titulo: 'Aguardando Análise de Minuta', descricao: 'Minuta de decisão na mesa do secretário.' },
  { titulo: 'Triagem de Despacho / Pendente de Certificação (2)', descricao: 'Aguardando prazo para recurso.' },
  { titulo: 'Pendente de Despacho/Remessa CONSEMA', descricao: 'Processo seguirá para o CONSEMA, em caso de recurso ou para cobrança, ou para arquivamento, no caso de improcedência.' },
];

// Migração automática ao final do prazo (aplicada pelo verificador periódico)
const PROXIMO_AUTOMATICO = {
  aguardando_prazo_ar: 'pendente_certificacao_ar',
  aguardando_prazo_edital: 'pendente_certificacao_edital',
  aguardando_prazo_notificacao_decisao: 'pendente_certificacao_decisao',
  aguardando_prazo_recurso_edital: 'pendente_certificacao_edital_decisao',
  cobranca_administrativa: 'pendente_envio_pge',
};

// Ciclos de "aguardando retorno de AR": mesma estrutura usada tanto na
// notificação inicial quanto na notificação da decisão — cada um define o
// estado de "sem retorno/consulta de rastreio" para onde migra automaticamente
// após 60 dias, e os destinos de cada ação manual (recebido, edital, nova
// notificação).
const CICLOS_AR = {
  pendente_retorno_ar: {
    semRetorno: 'ar_sem_retorno_rastreio',
    labelData: 'Data de Recebimento do AR',
    labelBotaoConfirmar: 'Confirmar Recebimento do AR',
    campoData: 'recebimentoAR',
    estadoPrazo: 'aguardando_prazo_ar',
    estadoEdital: 'pendente_edital',
    labelEdital: 'Pendente de Edital',
    estadoNotificacao: 'pendente_notificacao',
    labelNotificacao: 'Pendente de Notificação',
  },
  pendente_retorno_ar_decisao: {
    semRetorno: 'ar_sem_retorno_rastreio_decisao',
    labelData: 'Data de Notificação da Decisão (AR/Email/WPP)',
    labelBotaoConfirmar: 'Confirmar Notificação da Decisão',
    campoData: 'notificacaoDecisao',
    estadoPrazo: 'aguardando_prazo_notificacao_decisao',
    estadoEdital: 'pendente_edital_decisao',
    labelEdital: 'Edital da Decisão',
    estadoNotificacao: 'pendente_notificacao_decisao',
    labelNotificacao: 'Pendente de Notificação de Decisão',
  },
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
// Dias corridos a partir da data informada; início e fim ajustados para o
// próximo dia útil apenas se caírem num fim de semana/feriado — a contagem
// em si nunca pula dias úteis, só os dois pontos de referência são
// arredondados quando necessário.
function calcularPrazoDias(dataInicioStr, dias) {
  const inicio = proximoDiaUtil(new Date(dataInicioStr + 'T12:00:00'));
  const fimBruto = new Date(inicio);
  fimBruto.setDate(fimBruto.getDate() + dias);
  const fim = proximoDiaUtil(fimBruto);
  return { inicio: toISODate(inicio), fim: toISODate(fim) };
}

function calcularPrazo20Dias(dataInicioStr) {
  return calcularPrazoDias(dataInicioStr, 20);
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

export default function ProcessoAmbiental({ currentUser, ALL_USERS, nucleoAmbiental, isMaster, podeAdministrar, theme, setTheme, onLogout, standalone, publicoSomenteDashboard }) {
  // Consulta pública: só a dashboard agregada (contagens por estado), sem
  // acesso a processos individuais nem a nenhuma ação de movimentação.
  const publico = !!publicoSomenteDashboard;
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
  // Paginação da lista de processos: renderizar centenas de cards de uma vez
  // deixa a página pesada para rolar/interagir. Mostra aos poucos, com
  // "Carregar mais" — reseta sempre que o filtro/busca/ordenação muda.
  const [quantidadeExibida, setQuantidadeExibida] = useState(60);
  const [nucleoFiltro, setNucleoFiltro] = useState('todos');
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false);
  const [novo, setNovo] = useState({ numeroSEI: '', parte: '', cpfCnpj: '', valorMulta: '', autoInfracao: '', termoSancao: '', enderecos: [], descricaoInfracao: '', observacaoInicial: '', urgenteInicial: false, orgaoPublicoInicial: false, atencaoInicial: false, pedidoPrioridadeInicial: false, reparacaoDanoInicial: false });
  const [dataInput, setDataInput] = useState('');
  const [novoEndereco, setNovoEndereco] = useState({ logradouro: '', numero: '', bairro: '', cep: '', cidade: '', uf: '', complemento: '' });
  // Texto livre do "AR Não Cumprido" (pesquisa de novo endereço do
  // interessado) — estado separado do objeto estruturado acima, que é
  // usado só no formulário de autuação de Novo Processo.
  const [novoEnderecoTexto, setNovoEnderecoTexto] = useState('');
  const [showIncidenteModal, setShowIncidenteModal] = useState(false);
  const [incidenteForm, setIncidenteForm] = useState({ tipo: 'TAC', observacao: '', considerarCumprido: true });
  // Formulário de "TAC Firmado" — assinatura + obrigações (uma ou mais),
  // cada uma com prazo em dias corridos a partir da assinatura ou data certa.
  const [showTacForm, setShowTacForm] = useState(false);
  const [tacForm, setTacForm] = useState({ dataAssinatura: '', obrigacoes: [{ texto: '', tipoPrazo: 'dias', prazoDias: '', dataLimite: '' }] });
  // Ao marcar uma obrigação vencida (cumprida/descumprida/prorrogada), qual
  // está em edição — só uma por vez, para exigir a justificativa da prorrogação.
  const [obrigacaoEmDecisao, setObrigacaoEmDecisao] = useState(null); // { id, decisao, justificativa, novaData }
  // Ao marcar "Sub Judice", exige informar o número do PJE antes de salvar.
  const [showSubJudiceForm, setShowSubJudiceForm] = useState(false);
  const [subJudiceForm, setSubJudiceForm] = useState({ numeroPJE: '', observacao: '' });
  // Observação opcional ao registrar a verificação trimestral da reparação do dano.
  const [obsVerificacaoReparacao, setObsVerificacaoReparacao] = useState('');
  const [showResolverIncidente, setShowResolverIncidente] = useState(false);
  const [resolverForm, setResolverForm] = useState({ tipoResolucao: '', observacao: '' });
  const [confirmAction, setConfirmAction] = useState(null); // { mensagem, onConfirm } ou { titulo, mensagem, opcoes: [{ label, className, onClick }] }
  const [estadoManualMaster, setEstadoManualMaster] = useState('');
  const [dataInicioPrazoMaster, setDataInicioPrazoMaster] = useState('');
  const [editandoDataPrazo, setEditandoDataPrazo] = useState(false);
  const [novaDataPrazo, setNovaDataPrazo] = useState('');
  const [selecionados, setSelecionados] = useState(new Set());
  const [estadoLote, setEstadoLote] = useState('');
  const [estadoNovoProcesso, setEstadoNovoProcesso] = useState('');
  // TAC informado já na autuação, quando o estado inicial é Acompanhamento de TACs.
  const [tacNovoForm, setTacNovoForm] = useState({ dataAssinatura: '', obrigacoes: [{ texto: '', tipoPrazo: 'dias', prazoDias: '', dataLimite: '' }] });
  // TAC em edição dentro de "Editar Informações" (null = processo sem TAC e fora de Acompanhamento de TACs).
  const [tacEditForm, setTacEditForm] = useState(null);
  const [observacaoInput, setObservacaoInput] = useState('');
  const [editandoInfo, setEditandoInfo] = useState(false);
  const [editForm, setEditForm] = useState({ numeroSEI: '', parte: '', cpfCnpj: '', valorMulta: '', reparacaoDano: false });
  const [showArNaoCumpridoForm, setShowArNaoCumpridoForm] = useState(false);
  const [semNovoEndereco, setSemNovoEndereco] = useState(false);
  const [showArquivarForm, setShowArquivarForm] = useState(false);
  const [motivoArquivar, setMotivoArquivar] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [estadosExport, setEstadosExport] = useState(new Set());
  // Visão da dashboard escolhida por quem tem privilégios administrativos
  // (master ou "Admin. Ambiental Total"): 'todos' | 'asstec' | 'notificacoes'.
  // null = ainda não escolheu, usa o próprio setor como padrão.
  const [dashboardView, setDashboardView] = useState(null);
  // Legenda do fluxo procedimental: usuários logados podem ocultar; na
  // consulta pública ela sempre aparece (sem a opção de ocultar).
  const [mostrarLegenda, setMostrarLegenda] = useState(true);
  // Barra lateral retrátil: fica oculta à esquerda por padrão (a dashboard
  // ocupa a tela toda) e aparece ao passar o mouse na borda esquerda.
  const [sidebarAberta, setSidebarAberta] = useState(false);

  // Toda movimentação de processo passa por aqui: exibe um modal de
  // confirmação antes de executar a ação de fato.
  const pedirConfirmacao = (mensagem, onConfirm) => setConfirmAction({ mensagem, onConfirm });
  // Ao incluir um processo no Acompanhamento de Reparação do Dano (autuação,
  // edição ou remessa ao CONSEMA), pergunta se já deve nascer com pendência
  // de verificação/notificação — ou só alertar daqui a 3 meses.
  const perguntarPendenciaReparacao = (onEscolha) => setConfirmAction({
    titulo: '🌱 Reparação do Dano',
    mensagem: 'Deseja gerar uma pendência imediata para verificação/notificação do empreendedor acerca da regularização do dano? Se não, o primeiro alerta será daqui a 3 meses.',
    opcoes: [
      { label: 'Sim, gerar pendência imediata', className: 'btn-primary', onClick: () => onEscolha(true) },
      { label: 'Não, alertar em 3 meses', className: 'btn-secondary', onClick: () => onEscolha(false) },
    ],
  });

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'processosAmbientais'),
      (snap) => setProcessos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('❌ Erro processos ambientais:', err.message)
    );
    return () => unsub();
  }, []);

  // Atalho de teclado para abrir a autuação de um novo processo (Ctrl+Shift+N).
  // Como o Chrome reserva Ctrl+Shift+N para "nova janela anônima" e não deixa
  // a página interceptar essa combinação, Ctrl+Alt+N funciona como alternativa
  // garantida em qualquer navegador.
  useEffect(() => {
    if (publico) return;
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      const combinacaoValida = e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'n' && (e.shiftKey || e.altKey);
      if (combinacaoValida) {
        e.preventDefault();
        setView('novo');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [publico]);

  const selected = processos.find((p) => p.id === selectedId) || null;

  // Sincroniza os campos locais (observação/edição) sempre que o processo
  // selecionado muda, e reseta os formulários auxiliares de AR e arquivamento.
  useEffect(() => {
    setObservacaoInput(selected?.observacao || '');
    setEditandoInfo(false);
    setShowArNaoCumpridoForm(false);
    setNovoEnderecoTexto('');
    setSemNovoEndereco(false);
    setShowArquivarForm(false);
    setMotivoArquivar('');
    setEstadoManualMaster('');
    setDataInicioPrazoMaster('');
    setEditandoDataPrazo(false);
    setNovaDataPrazo('');
    setShowTacForm(false);
    setTacForm({ dataAssinatura: '', obrigacoes: [{ texto: '', tipoPrazo: 'dias', prazoDias: '', dataLimite: '' }] });
    setObrigacaoEmDecisao(null);
    setShowSubJudiceForm(false);
    setSubJudiceForm({ numeroPJE: '', observacao: '' });
    setObsVerificacaoReparacao('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const moverProcesso = async (p, novoEstado, tipo = 'manual', extra = {}) => {
    const historico = [...(p.historico || []), { de: p.estado, para: novoEstado, em: new Date().toISOString(), por: currentUser, tipo }];
    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      estado: novoEstado,
      entradaNoEstadoEm: new Date().toISOString(),
      vistoPor: {},
      historico,
      diligenciaOrigem: null,
      ...extra,
    });
  };

  // "processosRef" guarda a lista mais recente sem forçar o efeito abaixo a
  // reiniciar seu intervalo a cada gravação de qualquer usuário no banco —
  // antes, como o efeito dependia de "processos" diretamente, ele reavaliava
  // TODOS os processos a cada escrita de QUALQUER pessoa no sistema (não só a
  // cada hora como pretendido), multiplicando o trabalho com muitos usuários
  // conectados e arriscando gravações duplicadas quando duas pessoas
  // detectavam o mesmo processo vencido ao mesmo tempo.
  const processosRef = useRef(processos);
  useEffect(() => { processosRef.current = processos; }, [processos]);

  // Verificação periódica de prazos automáticos (dispara migração ao vencer)
  useEffect(() => {
    if (publico) return; // consulta pública é só leitura, nunca movimenta processos
    const checar = () => {
      const agora = new Date();
      processosRef.current.forEach((p) => {
        if (p.concluido || p.incidente?.ativo) return;
        const est = ESTADOS_AMBIENTAL[p.estado];
        if (est?.auto && p.prazo?.fim && new Date(p.prazo.fim + 'T23:59:59') <= agora) {
          const proximo = PROXIMO_AUTOMATICO[p.estado];
          if (proximo) moverProcesso(p, proximo, 'automatica');
        }
        // Mais de 60 dias sem retorno do AR (notificação inicial ou da
        // decisão): sai do fluxo normal e vai para a caixa de consulta de
        // rastreio, para triagem manual.
        const cicloAR = CICLOS_AR[p.estado];
        if (cicloAR && diasNoEstado(p.entradaNoEstadoEm) > 60) {
          moverProcesso(p, cicloAR.semRetorno, 'automatica');
        }
      });
    };
    checar();
    const interval = setInterval(checar, 60 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publico]);

  useEffect(() => {
    setQuantidadeExibida(60);
  }, [estadoFiltro, busca, ordem, nucleoFiltro, mostrarConcluidos, view]);

  const iniciarPrazo = (p, campoData, valor, estadoDestino) => {
    const { inicio, fim } = calcularPrazo20Dias(valor);
    moverProcesso(p, estadoDestino, 'manual', { [`datas.${campoData}`]: valor, prazo: { inicio, fim, origem: estadoDestino } });
  };

  // Mapeia cada estado de contagem automática de prazo (AR/Edital, na etapa
  // de defesa ou de recurso) para o campo de data correspondente — usado
  // tanto para exigir a data quando o master move manualmente para um desses
  // estados, quanto para permitir corrigir essa data depois.
  const CAMPO_DATA_POR_ESTADO_PRAZO = {
    aguardando_prazo_ar: { campo: 'recebimentoAR', label: 'Data de Recebimento do AR' },
    aguardando_prazo_edital: { campo: 'publicacaoEdital', label: 'Data de Publicação do Edital' },
    aguardando_prazo_notificacao_decisao: { campo: 'notificacaoDecisao', label: 'Data de Notificação da Decisão' },
    aguardando_prazo_recurso_edital: { campo: 'publicacaoEditalDecisao', label: 'Data de Publicação do Edital da Decisão' },
  };

  // Corrige a data de início de um prazo já em contagem (defesa ou recurso),
  // recalculando o prazo de 20 dias a partir da nova data.
  const corrigirDataPrazo = (p, novaData) => {
    const info = CAMPO_DATA_POR_ESTADO_PRAZO[p.estado];
    if (!info || !novaData) return;
    const { inicio, fim } = calcularPrazo20Dias(novaData);
    updateDoc(doc(db, 'processosAmbientais', p.id), {
      [`datas.${info.campo}`]: novaData,
      prazo: { inicio, fim, origem: p.estado },
    });
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

  // Renderiza o formulário de "Pendente de Retorno de AR" — usado tanto na
  // notificação inicial quanto na notificação da decisão (mesma estrutura,
  // cfg define os textos e destinos de cada uma).
  const renderRetornoAR = (p, cfg) => (
    <div className="form-group">
      <label>{cfg.labelData}</label>
      <input type="date" value={dataInput} onChange={(e) => setDataInput(e.target.value)} />
      <div className="action-buttons" style={{ marginTop: '10px' }}>
        <button className="btn-primary" disabled={!dataInput}
          onClick={() => pedirConfirmacao(`Confirma o registro em ${new Date(dataInput + 'T12:00:00').toLocaleDateString('pt-BR')}? A contagem do prazo de 20 dias será iniciada.`, () => { iniciarPrazo(p, cfg.campoData, dataInput, cfg.estadoPrazo); setDataInput(''); })}>
          {cfg.labelBotaoConfirmar}
        </button>
        {!showArNaoCumpridoForm && (
          <button className="btn-secondary" onClick={() => setShowArNaoCumpridoForm(true)}>AR Não Cumprido</button>
        )}
      </div>

      {showArNaoCumpridoForm && (
        <div className="info-box" style={{ marginTop: '14px' }}>
          <label>⚠️ AR Não Cumprido — Pesquisa de Novo Endereço</label>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            Antes de encaminhar para o {cfg.labelEdital}, pesquise e informe abaixo eventual(is) novo(s) endereço(s) encontrado(s) do interessado, para que seja expedida uma nova notificação. Se nenhum endereço novo foi encontrado, marque a opção correspondente.
          </p>
          <div className="form-group">
            <label>Novo(s) Endereço(s) Encontrado(s)</label>
            <textarea value={novoEnderecoTexto} disabled={semNovoEndereco}
              onChange={(e) => setNovoEnderecoTexto(e.target.value)}
              placeholder="Descreva o(s) novo(s) endereço(s) encontrado(s)..." />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', margin: '8px 0' }}>
            <input type="checkbox" checked={semNovoEndereco} onChange={(e) => { setSemNovoEndereco(e.target.checked); if (e.target.checked) setNovoEnderecoTexto(''); }} />
            Não foram encontrados novos endereços
          </label>
          <div className="form-actions">
            <button className="btn-primary" disabled={!semNovoEndereco && !novoEnderecoTexto.trim()}
              onClick={() => {
                if (semNovoEndereco || !novoEnderecoTexto.trim()) {
                  pedirConfirmacao(`Confirma que o AR voltou não cumprido e que nenhum novo endereço foi encontrado? O processo seguirá para ${cfg.labelEdital}.`, () => { moverProcesso(p, cfg.estadoEdital, 'manual', { 'datas.arNaoCumpridoEm': new Date().toISOString().slice(0, 10) }); setShowArNaoCumpridoForm(false); });
                } else {
                  pedirConfirmacao(`Confirma o novo endereço encontrado? O processo voltará para ${cfg.labelNotificacao}, para expedição de nova notificação.`, () => { moverProcesso(p, cfg.estadoNotificacao, 'manual', { 'datas.novoEnderecoEncontradoEm': new Date().toISOString().slice(0, 10), novoEndereco: novoEnderecoTexto.trim() }); setShowArNaoCumpridoForm(false); setNovoEnderecoTexto(''); });
                }
              }}>
              Confirmar
            </button>
            <button className="btn-secondary" onClick={() => { setShowArNaoCumpridoForm(false); setNovoEnderecoTexto(''); setSemNovoEndereco(false); }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );

  // Renderiza a caixa "AR Sem Retorno — Consulta de Rastreio" (+60 dias),
  // com as três ações possíveis a partir de uma consulta de rastreamento.
  const renderSemRetornoAR = (p, cfg) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div className="alert-banner warning">
        ⏰ Este processo está há mais de 60 dias aguardando retorno do AR e foi movido automaticamente para esta caixa, para triagem a partir de consulta de rastreio.
      </div>

      <div className="info-box">
        <label>1️⃣ AR Certificado a partir de Consulta de Rastreio — Encaminhar para {cfg.labelEdital}</label>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          O AR não retornou, mas a partir de consulta no rastreio se verificou que ele foi devolvido ao remetente, porque o destinatário não foi encontrado.
        </p>
        <button className="btn-primary" onClick={() => pedirConfirmacao(`Confirma que o AR foi devolvido por destinatário não encontrado? O processo seguirá para ${cfg.labelEdital}.`, () => moverProcesso(p, cfg.estadoEdital, 'manual', { 'datas.arCertificadoRastreioEm': new Date().toISOString().slice(0, 10) }))}>
          Encaminhar para {cfg.labelEdital}
        </button>
      </div>

      <div className="info-box">
        <label>2️⃣ AR Certificado a partir de Consulta de Rastreio — AR Cumprido</label>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          O AR não retornou, mas a partir de consulta no rastreio se verificou que ele foi cumprido na data tal (recebido pelo destinatário). Informe a data de recebimento abaixo.
        </p>
        <div className="form-group">
          <label>Data de Recebimento do AR</label>
          <input type="date" value={dataInput} onChange={(e) => setDataInput(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={!dataInput}
          onClick={() => pedirConfirmacao(`Confirma o recebimento do AR em ${new Date(dataInput + 'T12:00:00').toLocaleDateString('pt-BR')}, verificado por consulta de rastreio? A contagem do prazo de 20 dias será iniciada.`, () => { iniciarPrazo(p, cfg.campoData, dataInput, cfg.estadoPrazo); setDataInput(''); })}>
          AR Cumprido — Iniciar Prazo
        </button>
      </div>

      <div className="info-box">
        <label>3️⃣ AR Extraviado</label>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
          Sem informações se foi ou quando foi cumprido. Proceder a segunda notificação.
        </p>
        <div className="action-buttons">
          <button className="btn-secondary" onClick={() => pedirConfirmacao('Confirma que a segunda notificação já foi enviada? O processo voltará a aguardar o retorno do AR.', () => moverProcesso(p, cfg.origemId, 'manual', { 'datas.segundaNotificacaoEm': new Date().toISOString().slice(0, 10) }))}>
            a) Segunda Notificação Já Enviada
          </button>
          <button className="btn-secondary" onClick={() => pedirConfirmacao(`Confirma o envio para ${cfg.labelNotificacao}, para expedição de nova notificação?`, () => moverProcesso(p, cfg.estadoNotificacao))}>
            b) Enviar para {cfg.labelNotificacao}
          </button>
        </div>
      </div>
    </div>
  );

  // Salva a observação livre do processo (campo de anotações gerais).
  const salvarObservacao = async (p) => {
    await updateDoc(doc(db, 'processosAmbientais', p.id), { observacao: observacaoInput });
  };

  // ─── Marcadores do processo (urgente, órgão público, atenção) ────
  // Disponíveis em qualquer estado, direto no processo. "Urgente" guarda
  // a data em que foi marcado, para ordenar os urgentes entre si (o mais
  // antigo marcado aparece primeiro).
  const marcarUrgente = async (p, valor) => {
    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      urgente: valor,
      urgenteDesde: valor ? new Date().toISOString() : null,
    });
  };

  const marcarOrgaoPublico = async (p, valor) => {
    await updateDoc(doc(db, 'processosAmbientais', p.id), { orgaoPublico: valor });
  };

  const marcarAtencao = async (p, valor) => {
    await updateDoc(doc(db, 'processosAmbientais', p.id), { atencao: valor });
  };

  // Master pode corrigir os dados cadastrais do processo (não é movimentação
  // de estado, então não passa pelo histórico de tramitação).
  const salvarEdicaoInfo = async (p, pendenciaImediata = false) => {
    if (!editForm.numeroSEI.trim() || !editForm.parte.trim()) { alert('Preencha o número SEI e o nome da parte.'); return; }
    const erroTAC = tacEditForm ? erroFormTAC(tacEditForm) : null;
    if (erroTAC) { alert(erroTAC); return; }
    // Grava o TAC só se houver algo (obrigações ou TAC já existente).
    const obrigacoesEditadas = tacEditForm ? montarObrigacoesTAC(tacEditForm, p.tac?.obrigacoes || [], p.tac?.dataAssinatura || null) : [];
    const camposTAC = tacEditForm && (p.tac || obrigacoesEditadas.length)
      ? { tac: { ...(p.tac || { firmadoPor: currentUser, firmadoEm: new Date().toISOString() }), dataAssinatura: tacEditForm.dataAssinatura, obrigacoes: obrigacoesEditadas } }
      : {};

    const numeroSEITrim = editForm.numeroSEI.trim();
    const novosDigits = onlyDigits(numeroSEITrim);
    const antigosDigits = onlyDigits(p.numeroSEI);
    const mudouSEI = novosDigits !== antigosDigits;

    try {
      if (mudouSEI) {
        // Mesma trava transacional da autuação: reivindica a reserva do
        // novo número (falhando se outro processo já a detém) e libera a
        // reserva do número antigo, tudo atomicamente.
        const novaReservaRef = doc(db, 'processosAmbientaisSEI', novosDigits);
        const antigaReservaRef = doc(db, 'processosAmbientaisSEI', antigosDigits);
        await runTransaction(db, async (tx) => {
          const novaSnap = await tx.get(novaReservaRef);
          if (novaSnap.exists() && novaSnap.data().processoId !== p.id) throw new Error('SEI_DUPLICADO');
          tx.set(novaReservaRef, { numeroSEI: numeroSEITrim, processoId: p.id, criadoEm: new Date().toISOString() });
          tx.delete(antigaReservaRef);
          tx.update(doc(db, 'processosAmbientais', p.id), {
            numeroSEI: numeroSEITrim,
            numeroSEIDigits: novosDigits,
            parte: editForm.parte.trim(),
            cpfCnpj: editForm.cpfCnpj.trim(),
            valorMulta: parseMoeda(editForm.valorMulta),
            ...camposReparacaoDano(p, editForm.reparacaoDano, pendenciaImediata),
            ...camposTAC,
          });
        });
      } else {
        await updateDoc(doc(db, 'processosAmbientais', p.id), {
          numeroSEI: numeroSEITrim,
          numeroSEIDigits: novosDigits,
          parte: editForm.parte.trim(),
          cpfCnpj: editForm.cpfCnpj.trim(),
          valorMulta: parseMoeda(editForm.valorMulta),
          ...camposReparacaoDano(p, editForm.reparacaoDano, pendenciaImediata),
            ...camposTAC,
        });
      }
    } catch (e) {
      if (e.message === 'SEI_DUPLICADO') {
        alert(`❌ Já existe um processo cadastrado com o número SEI ${numeroSEITrim}.\n\nEscolha outro número.`);
      } else {
        console.error('❌ Erro ao editar processo:', e.message);
        alert('❌ Erro ao salvar as alterações. Tente novamente.');
      }
      return;
    }
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
    const infoPrazo = CAMPO_DATA_POR_ESTADO_PRAZO[estadoManualMaster];
    if (infoPrazo) {
      // Estados de contagem automática de prazo exigem a data de início
      // (recebimento do AR/publicação do Edital) para que o prazo de 20
      // dias seja calculado corretamente — sem isso o processo nunca
      // migraria sozinho para a próxima etapa.
      if (!dataInicioPrazoMaster) return;
      iniciarPrazo(p, infoPrazo.campo, dataInicioPrazoMaster, estadoManualMaster);
    } else {
      moverProcesso(p, estadoManualMaster, 'manual');
    }
    setEstadoManualMaster('');
    setDataInicioPrazoMaster('');
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

  const criarProcesso = async (pendenciaImediataReparacao = false) => {
    if (!novo.numeroSEI.trim() || !novo.parte.trim()) { alert('Preencha o número SEI e o nome da parte.'); return; }

    const numeroSEITrim = novo.numeroSEI.trim();
    const numeroSEIDigits = onlyDigits(numeroSEITrim);

    const estadoInicial = ((isMaster || podeAdministrar) && estadoNovoProcesso) ? estadoNovoProcesso : 'triagem';

    // Estados de contagem automática de prazo exigem a data de recebimento
    // do AR/publicação do Edital já na autuação — sem ela o prazo de 20
    // dias nunca seria calculado.
    const infoPrazoInicial = CAMPO_DATA_POR_ESTADO_PRAZO[estadoInicial];
    if (infoPrazoInicial && !dataInicioPrazoMaster) {
      alert(`Para autuar diretamente em "${ESTADOS_AMBIENTAL[estadoInicial]?.label}", informe a ${infoPrazoInicial.label.toLowerCase()}.`);
      return;
    }

    const comTAC = estadoInicial === 'acompanhamento_tacs';
    const erroTAC = comTAC ? erroFormTAC(tacNovoForm) : null;
    if (erroTAC) { alert(erroTAC); return; }
    const obrigacoesIniciais = comTAC ? montarObrigacoesTAC(tacNovoForm) : [];

    const datasIniciais = infoPrazoInicial ? { [infoPrazoInicial.campo]: dataInicioPrazoMaster } : {};
    const prazoInicial = infoPrazoInicial ? { ...calcularPrazo20Dias(dataInicioPrazoMaster), origem: estadoInicial } : null;

    // Trava real contra número SEI duplicado: a existência do processo é
    // decidida por uma transação atômica sobre um documento de "reserva"
    // (processosAmbientaisSEI/<dígitos do SEI>) — ao contrário de uma
    // consulta seguida de gravação separada, duas autuações simultâneas com
    // o mesmo número não conseguem mais passar as duas ao mesmo tempo: a
    // segunda sempre encontra a reserva já criada pela primeira e falha.
    const novoRef = doc(collection(db, 'processosAmbientais'));
    const reservaRef = doc(db, 'processosAmbientaisSEI', numeroSEIDigits);
    try {
      await runTransaction(db, async (tx) => {
        const reservaSnap = await tx.get(reservaRef);
        if (reservaSnap.exists()) throw new Error('SEI_DUPLICADO');
        tx.set(reservaRef, { numeroSEI: numeroSEITrim, processoId: novoRef.id, criadoEm: new Date().toISOString() });
        tx.set(novoRef, {
          numeroSEI: numeroSEITrim,
          numeroSEIDigits,
          parte: novo.parte.trim(),
          cpfCnpj: novo.cpfCnpj.trim(),
          valorMulta: parseMoeda(novo.valorMulta),
          autoInfracao: novo.autoInfracao.trim(),
          termoSancao: novo.termoSancao.trim(),
          enderecos: novo.enderecos,
          descricaoInfracao: novo.descricaoInfracao.trim(),
          observacao: novo.observacaoInicial.trim(),
          urgente: novo.urgenteInicial,
          urgenteDesde: novo.urgenteInicial ? new Date().toISOString() : null,
          orgaoPublico: novo.orgaoPublicoInicial,
          atencao: novo.atencaoInicial,
          pedidoPrioridade: podeVerPrioridade ? novo.pedidoPrioridadeInicial : false,
          ...camposReparacaoDano(null, novo.reparacaoDanoInicial, pendenciaImediataReparacao),
          estado: estadoInicial,
          dataAutuacao: new Date().toISOString().slice(0, 10),
          entradaNoEstadoEm: new Date().toISOString(),
          vistoPor: {},
          datas: datasIniciais, historico: [], incidente: null, concluido: false,
          ...(prazoInicial ? { prazo: prazoInicial } : {}),
          ...(comTAC ? { tac: { dataAssinatura: tacNovoForm.dataAssinatura, firmadoPor: currentUser, firmadoEm: new Date().toISOString(), obrigacoes: obrigacoesIniciais } } : {}),
          criadoEm: new Date().toISOString(), criadoPor: currentUser,
        });
      });
    } catch (e) {
      if (e.message === 'SEI_DUPLICADO') {
        alert(`❌ Já existe um processo cadastrado com o número SEI ${numeroSEITrim}.\n\nVerifique o número e tente novamente.`);
      } else {
        console.error('❌ Erro ao autuar processo:', e.message);
        alert('❌ Erro ao autuar o processo. Tente novamente.');
      }
      return;
    }

    setNovo({ numeroSEI: '', parte: '', cpfCnpj: '', valorMulta: '', autoInfracao: '', termoSancao: '', enderecos: [], descricaoInfracao: '', observacaoInicial: '', urgenteInicial: false, orgaoPublicoInicial: false, atencaoInicial: false, pedidoPrioridadeInicial: false, reparacaoDanoInicial: false });
    setNovoEndereco({ logradouro: '', numero: '', bairro: '', cep: '', cidade: '', uf: '', complemento: '' });
    setEstadoNovoProcesso('');
    setDataInicioPrazoMaster('');
    setTacNovoForm(tacParaForm(null));
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

  // ─── TAC (Termo de Ajustamento de Conduta) ────────────────────────
  // "TAC Firmado" fecha o incidente e move o processo para Acompanhamento
  // de TACs, com uma ou mais obrigações a cumprir — cada uma com prazo em
  // dias corridos a partir da assinatura, ou data certa.
  // Formulário de TAC (assinatura + obrigações) compartilhado entre "TAC
  // Firmado", a autuação direta em Acompanhamento de TACs e a edição de
  // informações do processo. Cada item do formulário pode trazer o `id` de
  // uma obrigação já gravada — assim a edição preserva status e histórico.
  const TAC_OBRIGACAO_VAZIA = { texto: '', tipoPrazo: 'dias', prazoDias: '', dataLimite: '' };
  const tacParaForm = (tac) => ({
    dataAssinatura: tac?.dataAssinatura || '',
    obrigacoes: (tac?.obrigacoes || []).length
      ? tac.obrigacoes.map((o) => ({ id: o.id, status: o.status, texto: o.texto || '', tipoPrazo: o.tipoPrazo || 'data', prazoDias: o.prazoDias ? String(o.prazoDias) : '', dataLimite: o.dataLimite || '' }))
      : [{ ...TAC_OBRIGACAO_VAZIA }],
  });
  const erroFormTAC = (form) => {
    const preenchidas = form.obrigacoes.filter((o) => o.texto.trim());
    if (preenchidas.some((o) => (o.tipoPrazo === 'dias' ? !(Number(o.prazoDias) > 0) : !o.dataLimite))) return 'Informe o prazo (em dias ou data certa) de todas as obrigações do TAC.';
    if (preenchidas.some((o) => o.tipoPrazo === 'dias') && !form.dataAssinatura) return 'Informe a data de assinatura do TAC — é dela que contam os prazos em dias.';
    return null;
  };
  // Monta as obrigações para gravar. Obrigação já existente mantém id,
  // status e histórico; se o prazo em dias e a data de assinatura não
  // mudaram, mantém também a data limite gravada (que pode ter sido
  // prorrogada) em vez de recalculá-la.
  const montarObrigacoesTAC = (form, anteriores = [], assinaturaAnterior = null) => form.obrigacoes
    .filter((o) => o.texto.trim())
    .map((o, idx) => {
      const antiga = o.id ? anteriores.find((a) => a.id === o.id) : null;
      const mesmoPrazo = antiga && o.tipoPrazo === 'dias' && antiga.tipoPrazo === 'dias'
        && Number(o.prazoDias) === Number(antiga.prazoDias) && form.dataAssinatura === assinaturaAnterior;
      const dataLimite = o.tipoPrazo === 'dias'
        ? (mesmoPrazo ? antiga.dataLimite : calcularPrazoDias(form.dataAssinatura, Number(o.prazoDias)).fim)
        : o.dataLimite;
      return {
        ...(antiga || { id: `${Date.now()}_${idx}`, status: 'pendente', historico: [] }),
        texto: o.texto.trim(),
        tipoPrazo: o.tipoPrazo,
        prazoDias: o.tipoPrazo === 'dias' ? Number(o.prazoDias) : null,
        dataLimite,
      };
    });

  const firmarTAC = async (p) => {
    const inc = p.incidente;
    const obrigacoes = montarObrigacoesTAC(tacForm);
    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      estado: 'acompanhamento_tacs',
      entradaNoEstadoEm: new Date().toISOString(),
      vistoPor: {},
      incidente: { ...inc, ativo: false, resolvidoEm: new Date().toISOString(), resolvidoPor: currentUser, tipoResolucao: 'TAC Firmado' },
      tac: { dataAssinatura: tacForm.dataAssinatura, firmadoPor: currentUser, firmadoEm: new Date().toISOString(), obrigacoes },
      historico: [...(p.historico || []), { de: 'incidente', para: 'acompanhamento_tacs', em: new Date().toISOString(), por: currentUser, tipo: 'manual' }],
    });
    setShowTacForm(false);
    setTacForm({ dataAssinatura: '', obrigacoes: [{ texto: '', tipoPrazo: 'dias', prazoDias: '', dataLimite: '' }] });
  };

  // Marca uma obrigação do TAC como cumprida, descumprida ou prorrogada
  // (essa última exige justificativa e uma nova data limite, e volta a
  // ficar pendente). Quando todas as obrigações estiverem cumpridas, o
  // processo é arquivado automaticamente.
  const marcarObrigacaoTac = async (p, obrigacaoId, decisao, extra = {}) => {
    const obrigacoes = (p.tac?.obrigacoes || []).map((o) => {
      if (o.id !== obrigacaoId) return o;
      const entradaHistorico = { decisao, em: new Date().toISOString(), por: currentUser, ...extra };
      if (decisao === 'prorrogada') {
        return { ...o, status: 'pendente', dataLimite: extra.novaData, historico: [...(o.historico || []), entradaHistorico] };
      }
      return { ...o, status: decisao, historico: [...(o.historico || []), entradaHistorico] };
    });

    const todasCumpridas = obrigacoes.length > 0 && obrigacoes.every((o) => o.status === 'cumprida');
    const updates = { tac: { ...p.tac, obrigacoes } };
    if (todasCumpridas) {
      updates.estado = 'arquivado';
      updates.entradaNoEstadoEm = new Date().toISOString();
      updates.vistoPor = {};
      updates.arquivamento = { motivo: 'Todas as obrigações do TAC foram cumpridas.', arquivadoEm: new Date().toISOString(), arquivadoPor: currentUser };
      updates.historico = [...(p.historico || []), { de: 'acompanhamento_tacs', para: 'arquivado', em: new Date().toISOString(), por: currentUser, tipo: 'automatica' }];
    }
    await updateDoc(doc(db, 'processosAmbientais', p.id), updates);
    setObrigacaoEmDecisao(null);
  };

  const obrigacaoVencida = (o) => o.status === 'pendente' && o.dataLimite && new Date(o.dataLimite + 'T23:59:59') < new Date();
  const temObrigacaoVencida = (p) => (p.tac?.obrigacoes || []).some(obrigacaoVencida);
  const contarTACsVencidos = () => contarEstado('acompanhamento_tacs').filter(temObrigacaoVencida).length;

  // ─── Diligência de verificação (TAC descumprido / Reparação do Dano) ──
  // O processo vai para "Pendente de Diligência" guardando de onde veio
  // (diligenciaOrigem). Vindo do TAC, continua espelhado no card de
  // Acompanhamento de TACs; vindo da reparação, segue no card de Reparação
  // do Dano (que é um marcador). No retorno, o Núcleo de Notificações
  // informa o resultado conforme a origem, ou remete ao Ministério Público.
  const RESULTADOS_DILIGENCIA = {
    tac_cumprida: 'Obrigação do TAC cumprida',
    tac_descumprida: 'Obrigação do TAC descumprida',
    reparacao_nao_cumprida: 'Obrigação de reparação ainda não cumprida',
    reparacao_cumprida: 'Reparação do dano cumprida',
    ministerio_publico: 'Enviado ao Ministério Público',
  };
  const enviarDiligenciaVerificacao = async (p, tipo) => {
    const agora = new Date().toISOString();
    const obrigacaoIds = tipo === 'tac' ? (p.tac?.obrigacoes || []).filter((o) => o.status === 'descumprida').map((o) => o.id) : [];
    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      estado: 'pendente_diligencia',
      entradaNoEstadoEm: agora,
      vistoPor: {},
      concluido: false,
      diligenciaOrigem: { tipo, obrigacaoIds, estadoAnterior: p.estado, concluidoAnterior: !!p.concluido, enviadoEm: agora, enviadoPor: currentUser },
      historico: [...(p.historico || []), { de: p.estado, para: 'pendente_diligencia', em: agora, por: currentUser, tipo: 'manual', motivo: tipo === 'tac' ? 'Verificação de obrigação descumprida do TAC' : 'Verificação da reparação do dano' }],
    });
  };
  const concluirDiligenciaVerificacao = async (p, resultado) => {
    const origem = p.diligenciaOrigem || {};
    const agora = new Date().toISOString();
    const rotulo = RESULTADOS_DILIGENCIA[resultado];
    const updates = {};
    let destino = 'aguardando_saneamento';
    if (resultado === 'ministerio_publico') {
      destino = 'remetido_ministerio_publico';
    } else if (resultado.startsWith('reparacao')) {
      // Volta para onde estava antes (o acompanhamento de reparação é um
      // marcador, não um estado), inclusive concluído/arquivado.
      destino = origem.estadoAnterior || 'aguardando_saneamento';
      updates.concluido = !!origem.concluidoAnterior;
    }
    if (resultado === 'tac_cumprida') {
      updates.tac = {
        ...p.tac,
        obrigacoes: (p.tac?.obrigacoes || []).map((o) => ((origem.obrigacaoIds || []).includes(o.id)
          ? { ...o, status: 'cumprida', historico: [...(o.historico || []), { decisao: 'cumprida', em: agora, por: currentUser, justificativa: 'Cumprimento verificado em diligência' }] }
          : o)),
      };
    }
    if (p.reparacaoDano?.ativo && (resultado.startsWith('reparacao') || origem.tipo === 'reparacao')) {
      const r = p.reparacaoDano;
      updates.reparacaoDano = {
        ...r,
        pendenciaImediata: false,
        ultimaVerificacaoEm: agora,
        verificacoes: [...(r.verificacoes || []), { em: agora, por: currentUser, observacao: `Diligência: ${rotulo.toLowerCase()}` }],
        ...(resultado === 'reparacao_cumprida' ? { ativo: false, removidoEm: agora, removidoPor: currentUser } : {}),
      };
    }
    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      estado: destino,
      entradaNoEstadoEm: agora,
      vistoPor: {},
      diligenciaOrigem: null,
      ultimaDiligenciaVerificacao: { ...origem, resultado, rotulo, concluidaEm: agora, concluidaPor: currentUser },
      historico: [...(p.historico || []), { de: 'pendente_diligencia', para: destino, em: agora, por: currentUser, tipo: 'manual', motivo: rotulo }],
      ...updates,
    });
  };
  const emDiligenciaDeTAC = (p) => p.estado === 'pendente_diligencia' && p.diligenciaOrigem?.tipo === 'tac';

  // "Pedido de Prioridade": ferramenta interna da ASSTEC, invisível para a
  // consulta pública e para o Núcleo de Notificações.
  const marcarPedidoPrioridade = async (p, valor) => {
    await updateDoc(doc(db, 'processosAmbientais', p.id), { pedidoPrioridade: valor });
  };

  // Sub Judice: o processo segue seu trâmite normal, mas fica marcado (card
  // pisca em vermelho, com selo no canto) e some do card especial assim que
  // desmarcado. Marcar exige o número do PJE; a observação é opcional.
  const marcarSubJudice = async (p, valor, dados = {}) => {
    await updateDoc(doc(db, 'processosAmbientais', p.id), valor
      ? { subJudice: true, numeroPJE: (dados.numeroPJE || '').trim(), observacaoSubJudice: (dados.observacao || '').trim() }
      : { subJudice: false, numeroPJE: '', observacaoSubJudice: '' });
  };

  // ─── Acompanhamento de Reparação do Dano ─────────────────────────
  // A obrigação de reparar o dano ambiental é imprescritível: o processo é
  // "espelhado" neste acompanhamento (como o Sub Judice, não é um estado
  // exclusivo — o trâmite normal segue, e continua aqui mesmo depois de
  // concluído/arquivado). A cada 3 meses sem verificação registrada, o
  // processo e o card piscam em vermelho, para verificar e notificar o
  // empreendedor sobre o passivo ambiental.
  const camposReparacaoDano = (p, valor, pendenciaImediata = false) => {
    const atual = p?.reparacaoDano;
    if (!!valor === !!atual?.ativo) return {};
    const agora = new Date().toISOString();
    return valor
      ? { reparacaoDano: { ativo: true, desde: agora, marcadoPor: currentUser, pendenciaImediata: !!pendenciaImediata, ultimaVerificacaoEm: null, verificacoes: atual?.verificacoes || [] } }
      : { reparacaoDano: { ...atual, ativo: false, removidoEm: agora, removidoPor: currentUser } };
  };
  const marcarReparacaoDano = async (p, valor, pendenciaImediata = false) => {
    const campos = camposReparacaoDano(p, valor, pendenciaImediata);
    if (Object.keys(campos).length) await updateDoc(doc(db, 'processosAmbientais', p.id), campos);
  };
  const registrarVerificacaoReparacao = async (p, observacao) => {
    const agora = new Date().toISOString();
    const r = p.reparacaoDano || {};
    await updateDoc(doc(db, 'processosAmbientais', p.id), {
      reparacaoDano: { ...r, pendenciaImediata: false, ultimaVerificacaoEm: agora, verificacoes: [...(r.verificacoes || []), { em: agora, por: currentUser, observacao: (observacao || '').trim() }] },
    });
    setObsVerificacaoReparacao('');
  };
  const proximaVerificacaoReparacao = (p) => {
    // Pendência imediata: vence já na inclusão, até a 1ª verificação registrada.
    if (p.reparacaoDano?.pendenciaImediata) return new Date(p.reparacaoDano.desde);
    const base = new Date(p.reparacaoDano?.ultimaVerificacaoEm || p.reparacaoDano?.desde || Date.now());
    base.setMonth(base.getMonth() + 3);
    return base;
  };
  const reparacaoPendente = (p) => !!p.reparacaoDano?.ativo && proximaVerificacaoReparacao(p) <= new Date();
  // Coloca de uma vez todos os processos do acompanhamento em pendência
  // imediata (ex.: para uma rodada geral de verificação/notificação).
  const marcarTodasReparacoesPendentes = async (lista) => {
    const alvo = lista.filter((p) => !reparacaoPendente(p));
    const CHUNK = 450;
    for (let i = 0; i < alvo.length; i += CHUNK) {
      const lote = writeBatch(db);
      alvo.slice(i, i + CHUNK).forEach((p) => {
        lote.update(doc(db, 'processosAmbientais', p.id), { 'reparacaoDano.pendenciaImediata': true });
      });
      await lote.commit();
    }
  };

  // ─── Visibilidade por núcleo ──────────────────────────────────────
  // Master e quem tem "Admin. Ambiental Total" podem alternar livremente
  // entre Visão Total, ASSTEC e Notificações — por padrão, veem o setor a
  // que pertencem (meuNucleo), não a Visão Total.
  const podeAlternarVisaoTotal = !publico && (isMaster || podeAdministrar);
  const nucleoView = publico
    ? 'todos'
    : podeAlternarVisaoTotal
      ? (dashboardView || meuNucleo || 'todos')
      : (consultaOutroNucleo ? (meuNucleo === 'asstec' ? 'notificacoes' : 'asstec') : meuNucleo);
  const somenteConsulta = publico || (!podeAlternarVisaoTotal && consultaOutroNucleo);
  const podeAlternarNucleo = !publico && !podeAlternarVisaoTotal && meuNucleo === 'asstec'; // só ASSTEC "comum" tem a toggle simples (Notificações não acessa o outro lado)
  // "Pedido de Prioridade" é uma ferramenta só da ASSTEC — nunca aparece na
  // consulta pública nem para quem é só do Núcleo de Notificações.
  const podeVerPrioridade = !publico && (isMaster || podeAdministrar || meuNucleo === 'asstec');

  // Na DASHBOARD, cada núcleo só vê as classes que ele efetivamente movimenta
  // (estados com contagem automática de prazo — sem nenhuma ação manual — ficam
  // de fora dos cards; continuam visíveis em "Todos os Processos"). O master
  // vê tudo, inclusive as contagens automáticas, para ter visão completa.
  const ESTADOS_FORA_DO_FLUXO_PRINCIPAL = ['ar_sem_retorno_rastreio', 'ar_sem_retorno_rastreio_decisao'];
  // Acompanhamento de TACs também sai do fluxo sequencial — vira um card
  // próprio, ao lado do de Processos em Incidente, do qual se origina.
  const TODOS_ESTADOS_ESPECIAIS = [...ESTADOS_FORA_DO_FLUXO_PRINCIPAL, 'acompanhamento_tacs', 'remetido_ministerio_publico'];
  // Número do passo de cada estado no fluxo principal — fixo para todas as
  // visões, para que "passo 7" signifique a mesma coisa para todo mundo.
  const NUMERO_PASSO = Object.fromEntries(Object.entries(ESTADOS_AMBIENTAL)
    .filter(([id]) => !TODOS_ESTADOS_ESPECIAIS.includes(id))
    .sort((a, b) => a[1].ordem - b[1].ordem)
    .map(([id], i) => [id, i + 1]));
  const estadosVisiveis = Object.entries(ESTADOS_AMBIENTAL)
    // Os estados "sem retorno/consulta de rastreio" e o de Acompanhamento de
    // TACs não entram no fluxo principal — cada um tem card próprio,
    // destacado numa faixa especial acima do fluxo (ver dashboard).
    .filter(([id, e]) => !TODOS_ESTADOS_ESPECIAIS.includes(id) && (isMaster || podeAdministrar || publico || !e.auto) && (nucleoView === 'todos' || e.nucleo === nucleoView || e.nucleo === 'ambos'))
    .sort((a, b) => a[1].ordem - b[1].ordem);

  // Memoizados: com centenas de processos, recalcular esses filtros do zero a
  // cada renderização (o que acontecia antes) deixava a tela visivelmente
  // lenta. Agora só recalculam quando a lista de processos realmente muda.
  const ativos = useMemo(() => processos.filter((p) => !p.concluido && !p.incidente?.ativo), [processos]);
  // Total de processos em tramitação — todos os estados, exceto arquivados.
  // Exibido no topo da tela, inclusive na consulta pública.
  const totalTramitando = useMemo(() => processos.filter((p) => p.estado !== 'arquivado').length, [processos]);
  const incidentesAtivos = useMemo(() => processos.filter((p) => p.incidente?.ativo), [processos]);
  // Processos de TAC em diligência continuam espelhados no card de TACs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tacsEmDiligencia = useMemo(() => processos.filter((p) => !p.incidente?.ativo && emDiligenciaDeTAC(p)), [processos]);
  // Sub Judice não é um estado exclusivo — o processo continua seu trâmite
  // normal e, ao mesmo tempo, aparece marcado no card especial da dashboard.
  const subJudiceAtivos = useMemo(() => processos.filter((p) => p.subJudice && !p.concluido), [processos]);
  // Reparação do dano é imprescritível: inclui também concluídos/arquivados.
  // Os que já passaram dos 3 meses sem verificação vêm primeiro.
  const reparacaoAtivos = useMemo(() => processos
    .filter((p) => p.reparacaoDano?.ativo)
    .sort((a, b) => proximaVerificacaoReparacao(a) - proximaVerificacaoReparacao(b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [processos]);
  const reparacaoPendentes = reparacaoAtivos.filter(reparacaoPendente).length;

  const buscaDigits = onlyDigits(busca);
  const filtrarBusca = (lista) => {
    if (!busca.trim()) return lista;
    return lista.filter((p) => (buscaDigits && (p.numeroSEIDigits?.includes(buscaDigits) || onlyDigits(p.cpfCnpj).includes(buscaDigits))) || p.parte?.toLowerCase().includes(busca.trim().toLowerCase()));
  };

  // Agrupa os processos ativos por estado numa única passada. Antes, cada um
  // dos ~20 cards da dashboard chamava contarEstado()/naoVistos()/
  // contarForaPrazo()/contarUrgentes() separadamente, cada função percorrendo
  // a lista inteira de processos ativos de novo — com centenas de processos,
  // isso multiplicava por 4-5x, por card, a cada renderização. Agora cada
  // estado só filtra dentro do seu próprio grupo, bem menor.
  const processosPorEstado = useMemo(() => {
    const mapa = {};
    for (const p of ativos) {
      (mapa[p.estado] || (mapa[p.estado] = [])).push(p);
    }
    return mapa;
  }, [ativos]);
  const contarEstado = (id) => processosPorEstado[id] || [];
  const nucleoDoEstado = (id) => (ESTADOS_AMBIENTAL[id].nucleo === 'ambos' ? meuNucleo : ESTADOS_AMBIENTAL[id].nucleo);
  // Cada pessoa tem seu próprio contador de acessos (vistoPor.<usuário>).
  // O card do ESTADO (dashboard) só pisca até o 1º acesso (contador === 0).
  // O card do PROCESSO (dentro da lista) pisca até a 3ª vez que a pessoa
  // entrar naquele estado (contador < 3). Movimentar o processo (ver
  // moverProcesso) reinicia o contador para todos.
  const vezesVisto = (p) => p.vistoPor?.[currentUser] || 0;
  const naoVistos = (id) => contarEstado(id).filter((p) => vezesVisto(p) === 0);
  // Prazos internos por estado — quando estourados, o card do estado pisca
  // em vermelho e mostra "X processos fora do prazo" (informação persistente,
  // como a de urgentes). Retorno de AR: 60 dias (na prática, o verificador
  // periódico já migra esses processos para "AR Sem Retorno" em até 1h, mas
  // o alerta cobre a janela até essa migração rodar). Diligência: 7 dias.
  const PRAZO_DIAS_POR_ESTADO = { pendente_retorno_ar: 60, pendente_retorno_ar_decisao: 60, pendente_diligencia: 7 };
  const contarForaPrazo = (id) => {
    const limite = PRAZO_DIAS_POR_ESTADO[id];
    if (!limite) return 0;
    return contarEstado(id).filter((p) => diasNoEstado(p.entradaNoEstadoEm) > limite).length;
  };
  // Contagem de urgentes por estado — ao contrário do aviso de "novo
  // processo", essa informação nunca some, independente de já ter sido visto.
  const contarUrgentes = (id) => contarEstado(id).filter((p) => p.urgente).length;

  const abrirGrupo = async (estadoId) => {
    setEstadoFiltro(estadoId);
    setView('lista');
    if (somenteConsulta) return;
    const pendentes = contarEstado(estadoId).filter((p) => vezesVisto(p) < 3);
    if (pendentes.length === 0) return;
    // Grava em lote em vez de uma chamada sequencial (aguardada) por processo
    // — com um estado de centenas de processos "não vistos", isso travava a
    // tela por vários segundos e multiplicava o número de escritas cobradas
    // no Firestore. writeBatch aceita até 500 operações por lote.
    const CHUNK = 450;
    for (let i = 0; i < pendentes.length; i += CHUNK) {
      const lote = writeBatch(db);
      pendentes.slice(i, i + CHUNK).forEach((p) => {
        lote.update(doc(db, 'processosAmbientais', p.id), { [`vistoPor.${currentUser}`]: vezesVisto(p) + 1 });
      });
      await lote.commit();
    }
  };

  // Memoizado: filtrar + ordenar a lista completa a cada renderização (mesmo
  // sem nenhum filtro mudar) era um dos pontos que deixava a tela lenta com
  // muitos processos.
  const listaAtual = useMemo(() => {
    let lista = mostrarConcluidos ? processos.filter((p) => !p.incidente?.ativo) : ativos;
    // "Todos os Processos" (sem filtro por estado) também deve trazer os
    // processos em incidente — mas só para quem enxerga o lado da ASSTEC
    // (que é quem resolve incidentes), inclusive master nessa visão.
    if (!estadoFiltro && (nucleoView === 'todos' || nucleoView === 'asstec')) {
      lista = [...lista, ...incidentesAtivos];
    }
    if (estadoFiltro) lista = lista.filter((p) => p.estado === estadoFiltro || (estadoFiltro === 'acompanhamento_tacs' && emDiligenciaDeTAC(p)));
    if (nucleoFiltro !== 'todos') lista = lista.filter((p) => ESTADOS_AMBIENTAL[p.estado]?.nucleo === nucleoFiltro || ESTADOS_AMBIENTAL[p.estado]?.nucleo === 'ambos');
    lista = filtrarBusca(lista);
    // Processos urgentes sempre no topo, em ordem cronológica entre si (o
    // primeiro marcado como urgente aparece primeiro); os demais mantêm a
    // ordenação escolhida pelo usuário.
    lista = [...lista].sort((a, b) => {
      if (!!a.urgente !== !!b.urgente) return a.urgente ? -1 : 1;
      if (a.urgente && b.urgente) return new Date(a.urgenteDesde || 0) - new Date(b.urgenteDesde || 0);
      return ordem === 'antigo'
        ? new Date(a.dataAutuacao) - new Date(b.dataAutuacao)
        : new Date(b.dataAutuacao) - new Date(a.dataAutuacao);
    });
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processos, ativos, incidentesAtivos, mostrarConcluidos, estadoFiltro, nucleoView, nucleoFiltro, busca, ordem]);

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

  const renderFormTAC = (form, setForm) => {
    const alterar = (idx, campos) => { const obs = [...form.obrigacoes]; obs[idx] = { ...obs[idx], ...campos }; setForm({ ...form, obrigacoes: obs }); };
    return (
      <>
        <div className="form-group">
          <label>Data de Assinatura do TAC *</label>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 6px' }}>É a partir dela que os prazos em dias das obrigações abaixo são contados.</p>
          <input type="date" value={form.dataAssinatura} onChange={(e) => setForm({ ...form, dataAssinatura: e.target.value })} />
        </div>
        <label style={{ display: 'block', margin: '14px 0 8px', fontWeight: 600, fontSize: '13px' }}>Obrigações Assumidas</label>
        {form.obrigacoes.map((o, idx) => (
          <div key={o.id || idx} className="pa-tac-obrigacao-row">
            {o.status && o.status !== 'pendente' && (
              <span style={{ fontSize: '11px', fontWeight: 700, color: o.status === 'cumprida' ? 'var(--accent-green, #3F8F5F)' : 'var(--accent-red, #B14C40)' }}>
                {o.status === 'cumprida' ? '✅ Cumprida' : '❌ Descumprida'}
              </span>
            )}
            <textarea placeholder="Descreva a obrigação..." value={o.texto} style={{ width: '100%', minHeight: '70px', resize: 'vertical' }}
              onChange={(e) => alterar(idx, { texto: e.target.value })} />
            <div className="pa-tac-obrigacao-prazo">
              <select value={o.tipoPrazo} style={{ width: '100%', padding: '10px 8px', border: '1px solid var(--neutral-300)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                onChange={(e) => alterar(idx, { tipoPrazo: e.target.value })}>
                <option value="dias">Dias</option>
                <option value="data">Data certa</option>
              </select>
              {o.tipoPrazo === 'dias' ? (
                <input type="number" min="1" placeholder="Quantos dias" value={o.prazoDias} style={{ width: '100%' }}
                  onChange={(e) => alterar(idx, { prazoDias: e.target.value })} />
              ) : (
                <input type="date" value={o.dataLimite} style={{ width: '100%' }}
                  onChange={(e) => alterar(idx, { dataLimite: e.target.value })} />
              )}
              {form.obrigacoes.length > 1 ? (
                <button type="button" className="btn-icon" title="Remover obrigação" onClick={() => setForm({ ...form, obrigacoes: form.obrigacoes.filter((_, i) => i !== idx) })}>✕</button>
              ) : <span />}
            </div>
          </div>
        ))}
        <button type="button" className="link-btn" onClick={() => setForm({ ...form, obrigacoes: [...form.obrigacoes, { ...TAC_OBRIGACAO_VAZIA }] })}>+ Adicionar obrigação</button>
      </>
    );
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
      case 'pendente_retorno_ar_decisao':
        return renderRetornoAR(p, CICLOS_AR[p.estado]);

      case 'ar_sem_retorno_rastreio':
      case 'ar_sem_retorno_rastreio_decisao': {
        const [origemId, cfgSemRetorno] = Object.entries(CICLOS_AR).find(([, c]) => c.semRetorno === p.estado);
        return renderSemRetornoAR(p, { ...cfgSemRetorno, origemId });
      }

      case 'aguardando_prazo_ar':
      case 'aguardando_prazo_edital':
      case 'aguardando_prazo_notificacao_decisao':
      case 'aguardando_prazo_recurso_edital': {
        const infoPrazo = CAMPO_DATA_POR_ESTADO_PRAZO[p.estado];
        return (
          <div className="info-box">
            <label>Prazo em contagem automática</label>
            <p>Início: {p.prazo?.inicio ? new Date(p.prazo.inicio).toLocaleDateString('pt-BR') : '—'} — Fim previsto: <strong>{p.prazo?.fim ? new Date(p.prazo.fim).toLocaleDateString('pt-BR') : '—'}</strong></p>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>A migração para a próxima etapa acontece automaticamente ao final do prazo.</p>
            {(isMaster || podeAdministrar) && (
              editandoDataPrazo ? (
                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label>{infoPrazo.label} (corrigir)</label>
                  <input type="date" value={novaDataPrazo} onChange={(e) => setNovaDataPrazo(e.target.value)} />
                  <div className="form-actions" style={{ marginTop: '8px' }}>
                    <button className="btn-primary" disabled={!novaDataPrazo}
                      onClick={() => pedirConfirmacao('Confirma a correção da data de início? O prazo de 20 dias será recalculado a partir dela.', () => { corrigirDataPrazo(p, novaDataPrazo); setEditandoDataPrazo(false); setNovaDataPrazo(''); })}>
                      Salvar Correção
                    </button>
                    <button className="btn-secondary" onClick={() => { setEditandoDataPrazo(false); setNovaDataPrazo(''); }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="link-btn" style={{ marginTop: '8px', fontSize: '12px' }}
                  onClick={() => { setNovaDataPrazo(p.datas?.[infoPrazo.campo] || ''); setEditandoDataPrazo(true); }}>
                  ✏️ Corrigir {infoPrazo.label.toLowerCase()}
                </button>
              )
            )}
          </div>
        );
      }

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

      case 'aguardando_saneamento': {
        const retorno = p.ultimaDiligenciaVerificacao?.concluidaEm === p.entradaNoEstadoEm ? p.ultimaDiligenciaVerificacao : null;
        return (
          <>
          {retorno && (
            <div className="info-box" style={{ marginBottom: '12px' }}>
              <label>🔎 Retorno de Diligência</label>
              <p style={{ fontSize: '13px' }}><strong>{retorno.rotulo}</strong> — em {new Date(retorno.concluidaEm).toLocaleDateString('pt-BR')} por {ALL_USERS?.[retorno.concluidaPor]?.nome || retorno.concluidaPor}</p>
            </div>
          )}
          <div className="action-buttons">
            {p.tac && (
              <button className="btn-secondary" onClick={() => pedirConfirmacao('Devolver este processo ao Acompanhamento de TACs?', () => moverProcesso(p, 'acompanhamento_tacs'))}>↩ Devolver ao Acompanhamento de TACs</button>
            )}
            <button className="btn-secondary" onClick={() => pedirConfirmacao('Converter este processo em Diligência?', () => moverProcesso(p, 'pendente_diligencia'))}>Converter em Diligência</button>
            <button className="btn-primary" onClick={() => pedirConfirmacao('Disponibilizar este processo para Análise de Minuta pelo Gabinete?', () => moverProcesso(p, 'aguardando_analise_minuta_gabinete'))}>Disponibilizar para o Gabinete</button>
          </div>
          </>
        );
      }

      case 'aguardando_analise_minuta_gabinete':
        return <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma que a minuta foi analisada pelo Gabinete? O processo seguirá para triagem de despacho/notificação.', () => moverProcesso(p, 'triagem_despacho_notificacao_decisao'))}>Minuta Analisada → Triagem de Despacho</button>;

      case 'triagem_despacho_notificacao_decisao':
        return <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma que a notificação foi confeccionada? O processo seguirá para Notificação de Decisão.', () => moverProcesso(p, 'pendente_notificacao_decisao'))}>Notificação Confeccionada</button>;

      case 'pendente_diligencia': {
        const dias = diasNoEstado(p.entradaNoEstadoEm);
        const origem = p.diligenciaOrigem;
        const obrigacoesVerificadas = (p.tac?.obrigacoes || []).filter((o) => (origem?.obrigacaoIds || []).includes(o.id));
        const botaoMP = (
          <button className="btn-secondary" onClick={() => pedirConfirmacao('Enviar este processo ao Ministério Público?', () => concluirDiligenciaVerificacao(p, 'ministerio_publico'))}>🏛️ Enviar ao Ministério Público</button>
        );
        return (
          <>
            {dias > 7 && <div className="alert-banner warning" style={{ marginBottom: '12px' }}>⏰ Fora do prazo — processo parado há {dias} dias nesta etapa (prazo de cumprimento: 7 dias).</div>}
            {origem?.tipo === 'tac' ? (
              <div className="info-box">
                <label>🔎 Diligência — verificação de obrigação do TAC</label>
                {obrigacoesVerificadas.length > 0 && (
                  <ul style={{ fontSize: '13px', margin: '4px 0 10px', paddingLeft: '18px' }}>
                    {obrigacoesVerificadas.map((o) => <li key={o.id}>{o.texto}</li>)}
                  </ul>
                )}
                <div className="action-buttons">
                  <button className="btn-approve" onClick={() => pedirConfirmacao('Confirma que a obrigação do TAC foi CUMPRIDA? O processo será devolvido para Saneamento/Julgamento.', () => concluirDiligenciaVerificacao(p, 'tac_cumprida'))}>✅ Obrigação do TAC Cumprida</button>
                  <button className="btn-delete" onClick={() => pedirConfirmacao('Confirma que a obrigação do TAC continua DESCUMPRIDA? O processo será devolvido para Saneamento/Julgamento.', () => concluirDiligenciaVerificacao(p, 'tac_descumprida'))}>❌ Obrigação do TAC Descumprida</button>
                  {botaoMP}
                </div>
              </div>
            ) : origem?.tipo === 'reparacao' ? (
              <div className="info-box">
                <label>🔎 Diligência — verificação da reparação do dano</label>
                <div className="action-buttons" style={{ marginTop: '8px' }}>
                  <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma que a obrigação de reparação AINDA NÃO foi cumprida? O processo volta para onde estava e segue no Acompanhamento de Reparação do Dano (próximo alerta em 3 meses).', () => concluirDiligenciaVerificacao(p, 'reparacao_nao_cumprida'))}>🌱 Reparação Ainda Não Cumprida → Voltar ao Acompanhamento</button>
                  <button className="btn-approve" onClick={() => pedirConfirmacao('Confirma que a reparação do dano foi CUMPRIDA? O processo volta para onde estava e sai do Acompanhamento de Reparação do Dano.', () => concluirDiligenciaVerificacao(p, 'reparacao_cumprida'))}>✅ Reparação Cumprida</button>
                  {botaoMP}
                </div>
              </div>
            ) : (
              <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma que a diligência foi cumprida? O processo será devolvido à Conclusão de Julgamento.', () => moverProcesso(p, 'aguardando_saneamento'))}>Diligência Cumprida → Devolver à Conclusão de Julgamento</button>
            )}
          </>
        );
      }

      case 'acompanhamento_tacs': {
        const obrigacoes = p.tac?.obrigacoes || [];
        const pendentesVencidas = obrigacoes.filter(obrigacaoVencida);
        const pendentesNoPrazo = obrigacoes.filter((o) => o.status === 'pendente' && !obrigacaoVencida(o));
        const resolvidas = obrigacoes.filter((o) => o.status !== 'pendente');

        const iniciarDecisao = (o, decisao) => setObrigacaoEmDecisao({ id: o.id, decisao, justificativa: '', novaData: '' });
        const confirmarDecisao = (o) => {
          const d = obrigacaoEmDecisao;
          if (d.decisao === 'prorrogada' && (!d.justificativa.trim() || !d.novaData)) return;
          const extra = d.decisao === 'prorrogada' ? { justificativa: d.justificativa.trim(), novaData: d.novaData } : {};
          const msg = d.decisao === 'cumprida' ? 'Confirma que a obrigação foi cumprida?'
            : d.decisao === 'descumprida' ? 'Confirma que a obrigação foi descumprida?'
            : 'Confirma a prorrogação do prazo desta obrigação?';
          pedirConfirmacao(msg, () => marcarObrigacaoTac(p, o.id, d.decisao, extra));
        };

        const renderObrigacao = (o, forcado) => (
          <div key={o.id} className={`info-box ${forcado ? 'pa-obrigacao-vencida' : ''}`} style={{ marginBottom: '12px' }}>
            <label>{o.texto}</label>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Prazo: {o.tipoPrazo === 'dias' ? `${o.prazoDias} dia(s) da assinatura` : 'data certa'} — vence em {o.dataLimite ? new Date(o.dataLimite + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
            </p>
            {o.status !== 'pendente' ? (
              <p style={{ fontWeight: 700, color: o.status === 'cumprida' ? 'var(--accent-green, #3F8F5F)' : 'var(--accent-red, #B14C40)' }}>
                {o.status === 'cumprida' ? '✅ Cumprida' : '❌ Descumprida'}
              </p>
            ) : obrigacaoEmDecisao?.id === o.id ? (
              <div className="form-group" style={{ marginTop: '8px' }}>
                {obrigacaoEmDecisao.decisao === 'prorrogada' && (
                  <>
                    <label>Justificativa da Prorrogação *</label>
                    <textarea value={obrigacaoEmDecisao.justificativa} onChange={(e) => setObrigacaoEmDecisao({ ...obrigacaoEmDecisao, justificativa: e.target.value })} />
                    <label style={{ marginTop: '8px', display: 'block' }}>Nova Data Limite *</label>
                    <input type="date" value={obrigacaoEmDecisao.novaData} onChange={(e) => setObrigacaoEmDecisao({ ...obrigacaoEmDecisao, novaData: e.target.value })} />
                  </>
                )}
                <div className="form-actions" style={{ marginTop: '10px' }}>
                  <button className="btn-primary" disabled={obrigacaoEmDecisao.decisao === 'prorrogada' && (!obrigacaoEmDecisao.justificativa.trim() || !obrigacaoEmDecisao.novaData)} onClick={() => confirmarDecisao(o)}>Confirmar</button>
                  <button className="btn-secondary" onClick={() => setObrigacaoEmDecisao(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div className="action-buttons" style={{ marginTop: '8px' }}>
                <button className="btn-approve" onClick={() => iniciarDecisao(o, 'cumprida')}>✅ Cumprida</button>
                <button className="btn-delete" onClick={() => iniciarDecisao(o, 'descumprida')}>❌ Descumprida</button>
                <button className="btn-secondary" onClick={() => iniciarDecisao(o, 'prorrogada')}>⏳ Prorrogar</button>
              </div>
            )}
          </div>
        );

        const descumpridas = obrigacoes.filter((o) => o.status === 'descumprida');
        return (
          <div>
            {descumpridas.length > 0 && (
              <div className="alert-banner warning" style={{ marginBottom: '14px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>❌ {descumpridas.length} obrigação(ões) descumprida(s).</span>
                <button className="btn-secondary" onClick={() => pedirConfirmacao('Enviar este processo para Pendente de Diligência, para verificar o cumprimento da(s) obrigação(ões) descumprida(s)? Ele continua espelhado no Acompanhamento de TACs e, cumprida a diligência, volta para Saneamento/Julgamento.', () => enviarDiligenciaVerificacao(p, 'tac'))}>🔎 Enviar para Diligência</button>
              </div>
            )}
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              TAC assinado em {p.tac?.dataAssinatura ? new Date(p.tac.dataAssinatura + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}. Quando todas as obrigações estiverem cumpridas, o processo é arquivado automaticamente.
            </p>
            {obrigacoes.length === 0 && (
              <p style={{ fontSize: '13px', color: 'var(--accent-red, #B14C40)', fontWeight: 600, marginBottom: '14px' }}>Nenhuma obrigação cadastrada — inclua-as em "✏️ Editar Informações do Processo".</p>
            )}
            {pendentesVencidas.length > 0 && (
              <>
                <label style={{ display: 'block', color: 'var(--accent-red, #B14C40)', fontWeight: 700, marginBottom: '8px' }}>⏰ Obrigações Vencidas — decisão necessária</label>
                {pendentesVencidas.map((o) => renderObrigacao(o, true))}
              </>
            )}
            {pendentesNoPrazo.length > 0 && (
              <>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '8px', marginTop: pendentesVencidas.length ? '18px' : 0 }}>Obrigações em Aberto</label>
                {pendentesNoPrazo.map((o) => renderObrigacao(o, false))}
              </>
            )}
            {resolvidas.length > 0 && (
              <>
                <label style={{ display: 'block', fontWeight: 700, marginBottom: '8px', marginTop: '18px' }}>Obrigações Resolvidas</label>
                {resolvidas.map((o) => renderObrigacao(o, false))}
              </>
            )}
          </div>
        );
      }

      case 'pendente_notificacao_decisao':
        return <button className="btn-primary" onClick={() => pedirConfirmacao('Confirma que a notificação da decisão foi enviada? O processo passará a aguardar o retorno do AR.', () => moverProcesso(p, 'pendente_retorno_ar_decisao'))}>Notificação Enviada → Aguardar Retorno de AR</button>;

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
        return (
          <div className="action-buttons">
            <button className="btn-primary" onClick={() => pedirConfirmacao('Concluir/arquivar este processo? Ele sairá das listas ativas.', () => concluirProcesso(p))}>Concluir / Arquivar Processo</button>
            {p.reparacaoDano?.ativo ? (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', alignSelf: 'center' }}>🌱 Já espelhado em Acompanhamento de Reparação do Dano</span>
            ) : (
              <button className="btn-secondary" onClick={() => perguntarPendenciaReparacao((imediata) => marcarReparacaoDano(p, true, imediata))}>🌱 Espelhar em Acompanhamento de Reparação do Dano</button>
            )}
          </div>
        );

      case 'remetido_ministerio_publico':
        return <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Processo remetido ao Ministério Público{p.ultimaDiligenciaVerificacao?.resultado === 'ministerio_publico' ? ` em ${new Date(p.ultimaDiligenciaVerificacao.concluidaEm).toLocaleDateString('pt-BR')}` : ''}. Use "Alterar Estado" ou "Arquivar processo" quando houver retorno.</p>;

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
  if (!publico && !meuNucleo && !isMaster) {
    return <div className="empty-state" style={{ padding: '3rem' }}>Você não tem acesso a este módulo. Fale com o administrador.</div>;
  }

  const conteudo = (
    <div className="content-area pa-content-area">
      <div className="pa-topbar">
        <button className="pa-topbar-home" onClick={() => setView('dashboard')} title="Início — voltar à Dashboard">
          <span className="pa-topbar-icon"><i className="ti ti-leaf"></i></span>
          <span className="pa-topbar-watermark">SEMARH · Processo Adm. Ambiental</span>
        </button>
        <div className="pa-topbar-right">
          <div className="pa-topbar-stat" title="Processos em tramitação — todos os estados, exceto arquivados">
            <span className="pa-topbar-stat-number">{totalTramitando}</span>
            <span className="pa-topbar-stat-label">em tramitação</span>
          </div>
          {!publico && (
            <button className="pa-topbar-novo" onClick={() => setView('novo')} title="Autuar Novo Processo (Ctrl+Shift+N ou Ctrl+Alt+N)">
              <i className="ti ti-plus"></i> Novo Processo
            </button>
          )}
        </div>
      </div>
      {view === 'dashboard' && (
        <div className="list-view">
          <div className="list-header">
            <h3>📋 Dashboard {publico && '— Consulta Pública'}{!publico && nucleoView !== 'todos' && `— Núcleo ${nucleoView === 'asstec' ? 'ASSTEC' : 'Notificações'}${somenteConsulta ? ' (consulta)' : ''}`}</h3>
            {!publico && (
              <div className="header-buttons">
                {podeAlternarNucleo && (
                  <button className="btn-settings" onClick={() => setConsultaOutroNucleo((v) => !v)}>
                    {consultaOutroNucleo ? '↩ Ver Minha Dashboard' : '👁 Ver Núcleo de Notificações'}
                  </button>
                )}
                <button className="btn-settings" onClick={() => { setEstadoFiltro(null); setView('lista'); }}>Todos os Processos</button>
                <button className="btn-settings" onClick={abrirExportModal}>📥 Exportar Planilha</button>
              </div>
            )}
          </div>

          {podeAlternarVisaoTotal && (
            <div className="action-buttons" style={{ marginBottom: '16px' }}>
              <button className={`btn-settings ${nucleoView === 'todos' ? 'active' : ''}`} onClick={() => setDashboardView('todos')}>🌐 Visão Total</button>
              <button className={`btn-settings ${nucleoView === 'asstec' ? 'active' : ''}`} onClick={() => setDashboardView('asstec')}>🏢 Visão ASSTEC</button>
              <button className={`btn-settings ${nucleoView === 'notificacoes' ? 'active' : ''}`} onClick={() => setDashboardView('notificacoes')}>📨 Visão Notificações</button>
            </div>
          )}

          {!publico && (nucleoView === 'todos' || nucleoView === 'asstec') && (incidentesAtivos.length > 0 || subJudiceAtivos.length > 0 || contarEstado('acompanhamento_tacs').length + tacsEmDiligencia.length > 0 || reparacaoAtivos.length > 0 || contarEstado('remetido_ministerio_publico').length > 0) && (
            <div className="pa-dash-grid" style={{ marginBottom: '18px' }}>
              {incidentesAtivos.length > 0 && (
                <div className="pa-card pa-card-incident" onClick={() => { setEstadoFiltro('__incidente__'); setView('lista'); }}>
                  <span className="pa-card-count">{incidentesAtivos.length}</span>
                  <span className="pa-card-label">🚧 Processos em Incidente (Sobrestados)</span>
                </div>
              )}
              {subJudiceAtivos.length > 0 && (
                <div className="pa-card pa-card-subjudice" onClick={() => { setEstadoFiltro('__subjudice__'); setView('lista'); }}>
                  <span className="pa-card-count">{subJudiceAtivos.length}</span>
                  <span className="pa-card-label">⚖️ Processos Sub Judice</span>
                </div>
              )}
              {contarEstado('acompanhamento_tacs').length + tacsEmDiligencia.length > 0 && (
                <div className="pa-card pa-card-tac" onClick={() => abrirGrupo('acompanhamento_tacs')}>
                  <span className="pa-card-count">{contarEstado('acompanhamento_tacs').length + tacsEmDiligencia.length}</span>
                  <span className="pa-card-label">📝 Acompanhamento de TACs</span>
                  {contarTACsVencidos() > 0 && <span className="pa-card-urgent-badge">⏰ {contarTACsVencidos()} TAC{contarTACsVencidos() === 1 ? '' : 's'} com Obrigações Vencidas</span>}
                  {tacsEmDiligencia.length > 0 && <span className="pa-card-new-badge">🔎 {tacsEmDiligencia.length} em diligência</span>}
                </div>
              )}
              {reparacaoAtivos.length > 0 && (
                <div className={`pa-card pa-card-reparacao${reparacaoPendentes > 0 ? ' pa-card-blink-red' : ''}`} onClick={() => { setEstadoFiltro('__reparacao__'); setView('lista'); }}>
                  <span className="pa-card-count">{reparacaoAtivos.length}</span>
                  <span className="pa-card-label">🌱 Acompanhamento de Reparação do Dano</span>
                  {reparacaoPendentes > 0 && <span className="pa-card-urgent-badge">⏰ {reparacaoPendentes} processo{reparacaoPendentes === 1 ? '' : 's'} para verificar/notificar</span>}
                </div>
              )}
              {contarEstado('remetido_ministerio_publico').length > 0 && (
                <div className="pa-card pa-card-mp" onClick={() => abrirGrupo('remetido_ministerio_publico')}>
                  <span className="pa-card-count">{contarEstado('remetido_ministerio_publico').length}</span>
                  <span className="pa-card-label">🏛️ Remetidos ao Ministério Público</span>
                </div>
              )}
            </div>
          )}

          {!publico && (nucleoView === 'todos' || nucleoView === 'notificacoes') && ESTADOS_FORA_DO_FLUXO_PRINCIPAL.some((id) => contarEstado(id).length > 0) && (
            <div className="pa-dash-grid" style={{ marginBottom: '18px' }}>
              {ESTADOS_FORA_DO_FLUXO_PRINCIPAL.map((id) => contarEstado(id).length > 0 && (
                <div key={id} className="pa-card pa-card-alerta-rastreio" onClick={() => abrirGrupo(id)}>
                  <span className="pa-card-count">{contarEstado(id).length}</span>
                  <span className="pa-card-label">📮 {ESTADOS_AMBIENTAL[id].label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pa-flow-grid">
            {estadosVisiveis.map(([id, est], idx) => {
              const novos = publico ? 0 : naoVistos(id).length;
              const foraPrazo = publico ? 0 : contarForaPrazo(id);
              const urgentes = contarUrgentes(id);
              const prioridades = podeVerPrioridade ? contarEstado(id).filter((p) => p.pedidoPrioridade).length : 0;
              const classeBlink = foraPrazo > 0 ? 'pa-card-blink-red' : (novos > 0 ? 'pa-card-blink' : '');
              const setorLabel = est.nucleo === 'asstec' ? 'ASSTEC' : est.nucleo === 'notificacoes' ? 'Núcleo de Notificação' : null;
              return (
                <React.Fragment key={id}>
                  <div
                    className={`pa-card ${classeBlink}${publico ? ' pa-card-somente-leitura' : ''}`}
                    onClick={publico ? undefined : () => abrirGrupo(id)}
                  >
                    <span className="pa-card-step" title={`Passo ${NUMERO_PASSO[id]} do fluxo`}>Passo {NUMERO_PASSO[id]}</span>
                    {setorLabel && <span className="pa-card-sector-badge">{setorLabel}</span>}
                    <span className="pa-card-count">{contarEstado(id).length}</span>
                    <span className="pa-card-label">{est.label}</span>
                    {foraPrazo > 0 && <span className="pa-card-urgent-badge">⏰ {foraPrazo} processo{foraPrazo === 1 ? '' : 's'} fora do prazo</span>}
                    {urgentes > 0 && <span className="pa-card-urgent-badge">🔴 Processos urgentes: {urgentes}</span>}
                    {prioridades > 0 && <span className="pa-card-priority-badge">⭐ Pedidos de prioridade: {prioridades}</span>}
                    {novos > 0 && <span className="pa-card-new-badge">{novos} novo{novos === 1 ? '' : 's'} processo{novos === 1 ? '' : 's'}</span>}
                  </div>
                  {idx < estadosVisiveis.length - 1 && (
                    <div className="pa-flow-arrow" aria-hidden="true"><i className="ti ti-arrow-narrow-right"></i></div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {(mostrarLegenda || publico) && (
            <div className="pa-legend-section">
              <div className="pa-legend-header">
                <h4>📖 Legenda do Fluxo Procedimental</h4>
                {!publico && (
                  <button type="button" className="link-btn" onClick={() => setMostrarLegenda(false)}>Ocultar legendas</button>
                )}
              </div>
              <div className="pa-legend-grid">
                {LEGENDA_FLUXO.map((item, i) => (
                  <div className="pa-legend-item" key={i}>
                    <span className="pa-legend-number">{i + 1}</span>
                    <div className="pa-legend-text">
                      <strong>{item.titulo}</strong>
                      <p>{item.descricao}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!mostrarLegenda && !publico && (
            <button type="button" className="link-btn" style={{ marginTop: '14px' }} onClick={() => setMostrarLegenda(true)}>Mostrar legendas</button>
          )}
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
          <div className="form-group"><label>CPF/CNPJ</label>
            <input type="text" placeholder="000.000.000-00 ou 00.000.000/0000-00" value={novo.cpfCnpj} onChange={(e) => setNovo({ ...novo, cpfCnpj: e.target.value })} />
          </div>
          <div className="form-group"><label>Descrição da Infração</label>
            <textarea placeholder="Descreva os detalhes da infração..." value={novo.descricaoInfracao} onChange={(e) => setNovo({ ...novo, descricaoInfracao: e.target.value })} style={{ minHeight: '100px', resize: 'vertical' }} />
          </div>
          <div className="form-group"><label>Valor da Multa (R$)</label>
            <input type="text" placeholder="0,00" value={novo.valorMulta} onChange={(e) => setNovo({ ...novo, valorMulta: e.target.value })} />
          </div>
          {(isMaster || podeAdministrar) && (
            <div className="form-group">
              <label>Estado Inicial (opcional)</label>
              <select value={estadoNovoProcesso} onChange={(e) => { setEstadoNovoProcesso(e.target.value); setDataInicioPrazoMaster(''); }}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--neutral-300)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                <option value="">Padrão — Aguardando Triagem Inicial</option>
                {Object.entries(ESTADOS_AMBIENTAL).sort((a, b) => a[1].ordem - b[1].ordem).map(([id, e]) => (
                  <option key={id} value={id}>{e.label}</option>
                ))}
              </select>
            </div>
          )}
          {estadoNovoProcesso === 'acompanhamento_tacs' && (
            <div className="form-section" style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '10px' }}>📝 TAC — Obrigações e Prazos</label>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 10px' }}>Opcional agora — as obrigações também podem ser incluídas depois, em "Editar Informações".</p>
              {renderFormTAC(tacNovoForm, setTacNovoForm)}
            </div>
          )}
          {CAMPO_DATA_POR_ESTADO_PRAZO[estadoNovoProcesso] && (
            <div className="form-group">
              <label>{CAMPO_DATA_POR_ESTADO_PRAZO[estadoNovoProcesso].label} *</label>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 6px' }}>Obrigatório — é a partir dela que o prazo de 20 dias é calculado.</p>
              <input type="date" value={dataInicioPrazoMaster} onChange={(e) => setDataInicioPrazoMaster(e.target.value)} />
            </div>
          )}

          <hr style={{ margin: '20px 0', border: '1px solid var(--neutral-200)' }} />
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px' }}>📋 Informações Adicionais (opcionais)</p>

          <div className="form-group"><label>Auto de Infração</label>
            <input type="text" placeholder="Ex: 001/2026" value={novo.autoInfracao} onChange={(e) => setNovo({ ...novo, autoInfracao: e.target.value })} />
          </div>

          <div className="form-group"><label>Termo de Sanção</label>
            <input type="text" placeholder="Ex: TS-2026-123" value={novo.termoSancao} onChange={(e) => setNovo({ ...novo, termoSancao: e.target.value })} />
          </div>

          <div className="form-group" style={{ border: '1px solid var(--neutral-200)', padding: '12px', borderRadius: '8px', background: 'var(--bg-card)' }}>
            <label style={{ marginBottom: '12px', display: 'block', fontWeight: '500' }}>Endereço(s)</label>

            <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div><label style={{ fontSize: '12px' }}>Logradouro *</label>
                <input type="text" placeholder="Rua, Avenida, etc." value={novoEndereco.logradouro} onChange={(e) => setNovoEndereco({ ...novoEndereco, logradouro: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div><label style={{ fontSize: '12px' }}>Número</label>
                <input type="text" placeholder="Ex: 123" value={novoEndereco.numero} onChange={(e) => setNovoEndereco({ ...novoEndereco, numero: e.target.value })} style={{ width: '100%' }} />
              </div>
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div><label style={{ fontSize: '12px' }}>Bairro *</label>
                <input type="text" placeholder="Bairro" value={novoEndereco.bairro} onChange={(e) => setNovoEndereco({ ...novoEndereco, bairro: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div><label style={{ fontSize: '12px' }}>CEP</label>
                <input type="text" placeholder="00000-000" value={novoEndereco.cep} onChange={(e) => setNovoEndereco({ ...novoEndereco, cep: e.target.value })} style={{ width: '100%' }} />
              </div>
            </div>

            <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div><label style={{ fontSize: '12px' }}>Cidade *</label>
                <input type="text" placeholder="Cidade" value={novoEndereco.cidade} onChange={(e) => setNovoEndereco({ ...novoEndereco, cidade: e.target.value })} style={{ width: '100%' }} />
              </div>
              <div><label style={{ fontSize: '12px' }}>UF *</label>
                <input type="text" placeholder="BA" maxLength="2" value={novoEndereco.uf} onChange={(e) => setNovoEndereco({ ...novoEndereco, uf: e.target.value.toUpperCase() })} style={{ width: '100%' }} />
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '12px' }}>Complemento</label>
              <input type="text" placeholder="Apto, sala, etc." value={novoEndereco.complemento} onChange={(e) => setNovoEndereco({ ...novoEndereco, complemento: e.target.value })} style={{ width: '100%' }} />
            </div>

            <button type="button" className="btn-secondary" style={{ padding: '8px 12px', fontSize: '12px' }} onClick={() => {
              const numero = novoEndereco.numero.trim() || (novoEndereco.logradouro.trim() && novoEndereco.bairro.trim() && novoEndereco.cidade.trim() && novoEndereco.uf.trim() ? 'S/N' : '');
              if (novoEndereco.logradouro.trim() && novoEndereco.bairro.trim() && novoEndereco.cidade.trim() && novoEndereco.uf.trim()) {
                const enderecoCompleto = { ...novoEndereco, numero: numero };
                setNovo({ ...novo, enderecos: [...novo.enderecos, enderecoCompleto] });
                setNovoEndereco({ logradouro: '', numero: '', bairro: '', cep: '', cidade: '', uf: '', complemento: '' });
              } else {
                alert('Preencha: Logradouro, Bairro, Cidade e UF');
              }
            }}>+ Endereço</button>

            {novo.enderecos.length > 0 && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--neutral-200)' }}>
                {novo.enderecos.map((end, idx) => (
                  <div key={idx} style={{ padding: '8px', background: 'var(--neutral-100)', borderRadius: '4px', marginBottom: '6px', fontSize: '12px' }}>
                    <div><strong>{end.logradouro}, {end.numero}</strong></div>
                    <div>{end.complemento && `${end.complemento} - `}{end.bairro}</div>
                    <div>{end.cidade}, {end.uf} {end.cep && `- ${end.cep}`}</div>
                    <button type="button" className="link-btn" style={{ color: 'var(--red)', fontSize: '11px', marginTop: '4px' }} onClick={() => setNovo({ ...novo, enderecos: novo.enderecos.filter((_, i) => i !== idx) })}>✕ Remover</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr style={{ margin: '20px 0', border: '1px solid var(--neutral-200)' }} />
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 14px' }}>🏷️ Marcadores e Observações (opcionais)</p>

          <div className="form-group"><label>Observações</label>
            <textarea placeholder="Anotações gerais sobre o processo..." value={novo.observacaoInicial} onChange={(e) => setNovo({ ...novo, observacaoInicial: e.target.value })} />
          </div>

          <div className="info-box pa-marcadores-box" style={{ marginBottom: '16px' }}>
            <label className="pa-marcador-toggle">
              <input type="checkbox" checked={novo.urgenteInicial} onChange={(e) => setNovo({ ...novo, urgenteInicial: e.target.checked })} />
              <span>🔴 Urgente <em>— aparece no topo da lista, card amarelo</em></span>
            </label>
            <label className="pa-marcador-toggle">
              <input type="checkbox" checked={novo.orgaoPublicoInicial} onChange={(e) => setNovo({ ...novo, orgaoPublicoInicial: e.target.checked })} />
              <span>🏛️ Órgão/Ente Público <em>— card verde</em></span>
            </label>
            <label className="pa-marcador-toggle">
              <input type="checkbox" checked={novo.atencaoInicial} onChange={(e) => setNovo({ ...novo, atencaoInicial: e.target.checked })} />
              <span>⚠️ Atenção <em>— card amarelo</em></span>
            </label>
            {podeVerPrioridade && (
              <label className="pa-marcador-toggle">
                <input type="checkbox" checked={novo.pedidoPrioridadeInicial} onChange={(e) => setNovo({ ...novo, pedidoPrioridadeInicial: e.target.checked })} />
                <span>⭐ Pedido de Prioridade <em>— visível só para a ASSTEC, card azul</em></span>
              </label>
            )}
            <label className="pa-marcador-toggle">
              <input type="checkbox" checked={novo.reparacaoDanoInicial} onChange={(e) => setNovo({ ...novo, reparacaoDanoInicial: e.target.checked })} />
              <span>🌱 Acompanhamento de Reparação do Dano <em>— pisca em vermelho a cada 3 meses, sem afetar o trâmite</em></span>
            </label>
          </div>

          <div className="form-actions">
            <button className="btn-primary" onClick={() => (novo.reparacaoDanoInicial ? perguntarPendenciaReparacao(criarProcesso) : criarProcesso())}>Autuar Processo</button>
            <button className="btn-secondary" onClick={() => { setView('dashboard'); setEstadoNovoProcesso(''); setDataInicioPrazoMaster(''); }}>Cancelar</button>
          </div>
        </div>
      )}

      {view === 'lista' && (
        <div className="list-view">
          <div className="list-header">
            <h3>{estadoFiltro === '__incidente__' ? '🚧 Processos em Incidente' : estadoFiltro === '__subjudice__' ? '⚖️ Processos Sub Judice' : estadoFiltro === '__reparacao__' ? '🌱 Acompanhamento de Reparação do Dano' : estadoFiltro ? ESTADOS_AMBIENTAL[estadoFiltro]?.label : 'Todos os Processos'}</h3>
            <div className="header-buttons">
              {estadoFiltro === '__reparacao__' && (isMaster || podeAdministrar) && reparacaoAtivos.length > reparacaoPendentes && (
                <button className="btn-settings" onClick={() => pedirConfirmacao(`Colocar todos os ${reparacaoAtivos.length - reparacaoPendentes} processo(s) sem pendência do Acompanhamento de Reparação do Dano em pendência imediata de verificação/notificação?`, () => marcarTodasReparacoesPendentes(reparacaoAtivos))}>⏰ Marcar todos com pendência</button>
              )}
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
            const listaExibida = estadoFiltro === '__incidente__' ? filtrarBusca(incidentesAtivos) : estadoFiltro === '__subjudice__' ? filtrarBusca(subJudiceAtivos) : estadoFiltro === '__reparacao__' ? filtrarBusca(reparacaoAtivos) : listaAtual;
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

                {listaExibida.slice(0, quantidadeExibida).map((p) => {
                  const limitePrazo = PRAZO_DIAS_POR_ESTADO[p.estado];
                  const foraDoPrazo = (!!limitePrazo && diasNoEstado(p.entradaNoEstadoEm) > limitePrazo) || (p.estado === 'acompanhamento_tacs' && temObrigacaoVencida(p));
                  const verificarReparacao = reparacaoPendente(p);
                  const emBlinkVermelho = foraDoPrazo || p.subJudice || verificarReparacao;
                  const mostraPrioridade = podeVerPrioridade && p.pedidoPrioridade;
                  const éNovo = estadoFiltro && estadoFiltro !== '__incidente__' && estadoFiltro !== '__subjudice__' && estadoFiltro !== '__reparacao__' && vezesVisto(p) < 3;
                  // Prioridade visual: fora do prazo/Sub Judice (pisca vermelho) >
                  // pedido de prioridade (azul) > urgente/atenção (amarelo) >
                  // órgão público (verde) > novo processo (pisca).
                  const marcadorClasse = emBlinkVermelho
                    ? 'card-item-blink-red'
                    : mostraPrioridade
                      ? 'card-item-marcado-azul'
                      : (p.urgente || p.atencao)
                        ? 'card-item-marcado-amarelo'
                        : p.orgaoPublico
                          ? 'card-item-marcado-verde'
                          : (éNovo ? 'card-item-blink' : '');
                  return (
                  <div key={p.id} className={`card-item ${marcadorClasse}`} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexDirection: 'column' }}>
                    {(p.orgaoPublico || p.subJudice || p.reparacaoDano?.ativo) && (
                      <div className="card-item-corner-badges">
                        {p.subJudice && <span className="card-item-corner-badge card-item-corner-badge-subjudice">⚖️ Sub Judice</span>}
                        {p.reparacaoDano?.ativo && <span className="card-item-corner-badge card-item-corner-badge-reparacao">🌱 Reparação do Dano</span>}
                        {p.orgaoPublico && <span className="card-item-corner-badge">🏛️ Órgão/Ente Público</span>}
                      </div>
                    )}
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
                        {(foraDoPrazo || verificarReparacao || mostraPrioridade || p.urgente || p.atencao) && (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '2px 0 6px' }}>
                            {verificarReparacao && <span className="card-item-tag card-item-tag-atraso">⏰ Verificar Reparação do Dano</span>}
                            {foraDoPrazo && <span className="card-item-tag card-item-tag-atraso">⏰ {p.estado === 'acompanhamento_tacs' ? 'Obrigação Vencida' : 'Fora do Prazo'}</span>}
                            {mostraPrioridade && <span className="card-item-tag card-item-tag-prioridade">⭐ Pedido de Prioridade</span>}
                            {p.urgente && <span className="card-item-tag card-item-tag-urgente">🔴 Urgente</span>}
                            {p.atencao && <span className="card-item-tag card-item-tag-atencao">⚠️ Atenção</span>}
                          </div>
                        )}
                        {éNovo && <span className="card-item-new-badge">🆕 Novo processo</span>}
                        <p className="card-text"><strong>Parte:</strong> {p.parte}</p>
                        <p className="card-text"><strong>Autuado em:</strong> {new Date(p.dataAutuacao).toLocaleDateString('pt-BR')}</p>
                        <p className="card-text"><strong>Dias no estado atual:</strong> {diasNoEstado(p.entradaNoEstadoEm)} dia(s)</p>
                        {foraDoPrazo && (
                          <p className="card-text" style={{ color: 'var(--accent-red, #B14C40)', fontWeight: 700 }}>
                            {limitePrazo ? `⚠️ Mais de ${limitePrazo} dias neste estado` : '⚠️ Há obrigação de TAC com prazo vencido'}
                          </p>
                        )}
                        {p.subJudice && (
                          <p className="card-text" style={{ color: 'var(--accent-red, #B14C40)', fontWeight: 700 }}>⚖️ Sub Judice — PJE {p.numeroPJE || 'não informado'}</p>
                        )}
                        {p.reparacaoDano?.ativo && (
                          <p className="card-text" style={verificarReparacao ? { color: 'var(--accent-red, #B14C40)', fontWeight: 700 } : undefined}>
                            <strong>🌱 Próxima verificação da reparação:</strong> {proximaVerificacaoReparacao(p).toLocaleDateString('pt-BR')}{verificarReparacao ? ' — verificar e notificar o empreendedor' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <button className="btn-secondary" style={{ alignSelf: 'flex-start', marginTop: '4px' }} onClick={() => { setSelectedId(p.id); setView('detalhe'); }}>Ver Detalhes →</button>
                  </div>
                  );
                })}

                {listaExibida.length > quantidadeExibida && (
                  <button type="button" className="btn-secondary" style={{ width: '100%', marginTop: '10px' }}
                    onClick={() => setQuantidadeExibida((q) => q + 60)}>
                    Carregar mais ({listaExibida.length - quantidadeExibida} restante{listaExibida.length - quantidadeExibida === 1 ? '' : 's'})
                  </button>
                )}
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
          {(selected.urgente || selected.atencao || selected.orgaoPublico || selected.subJudice || selected.reparacaoDano?.ativo || (podeVerPrioridade && selected.pedidoPrioridade)) && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '-6px 0 14px' }}>
              {selected.reparacaoDano?.ativo && <span className="card-item-tag card-item-tag-reparacao">🌱 Reparação do Dano</span>}
              {selected.subJudice && <span className="card-item-tag card-item-tag-subjudice">⚖️ Sub Judice{selected.numeroPJE ? ` — PJE ${selected.numeroPJE}` : ''}</span>}
              {selected.urgente && <span className="card-item-tag card-item-tag-urgente">🔴 Urgente</span>}
              {selected.atencao && <span className="card-item-tag card-item-tag-atencao">⚠️ Atenção</span>}
              {selected.orgaoPublico && <span className="card-item-tag card-item-tag-orgao">🏛️ Órgão/Ente Público</span>}
              {podeVerPrioridade && selected.pedidoPrioridade && <span className="card-item-tag card-item-tag-prioridade">⭐ Pedido de Prioridade</span>}
            </div>
          )}
          <div className="info-grid">
            <div className="info-item"><label>Parte</label><p>{selected.parte}</p></div>
            {selected.cpfCnpj && <div className="info-item"><label>CPF/CNPJ</label><p>{selected.cpfCnpj}</p></div>}
            <div className="info-item"><label>Valor da Multa</label><p>{fmtMoeda(selected.valorMulta)}</p></div>
            <div className="info-item"><label>Data de Autuação</label><p>{new Date(selected.dataAutuacao).toLocaleDateString('pt-BR')}</p></div>
            <div className="info-item"><label>Dias no Estado Atual</label><p>{diasNoEstado(selected.entradaNoEstadoEm)} dia(s)</p></div>
          </div>

          <div className="info-box pa-marcadores-box">
            <label>🏷️ Marcadores do Processo</label>
            <label className="pa-marcador-toggle">
              <input type="checkbox" checked={!!selected.urgente}
                onChange={(e) => { const v = e.target.checked; pedirConfirmacao(v ? 'Marcar este processo como URGENTE? Ele passará a aparecer no topo das listas.' : 'Remover a marcação de urgente deste processo?', () => marcarUrgente(selected, v)); }} />
              <span>🔴 Urgente <em>— aparece no topo da lista, card amarelo</em></span>
            </label>
            <label className="pa-marcador-toggle">
              <input type="checkbox" checked={!!selected.orgaoPublico}
                onChange={(e) => { const v = e.target.checked; pedirConfirmacao(v ? 'Identificar este processo como Órgão/Ente Público?' : 'Remover a identificação de Órgão/Ente Público deste processo?', () => marcarOrgaoPublico(selected, v)); }} />
              <span>🏛️ Órgão/Ente Público <em>— card verde</em></span>
            </label>
            <label className="pa-marcador-toggle">
              <input type="checkbox" checked={!!selected.atencao}
                onChange={(e) => { const v = e.target.checked; pedirConfirmacao(v ? 'Marcar este processo com atenção especial?' : 'Remover a marcação de atenção deste processo?', () => marcarAtencao(selected, v)); }} />
              <span>⚠️ Atenção <em>— card amarelo</em></span>
            </label>
            {podeVerPrioridade && (
              <label className="pa-marcador-toggle">
                <input type="checkbox" checked={!!selected.pedidoPrioridade}
                  onChange={(e) => { const v = e.target.checked; pedirConfirmacao(v ? 'Marcar este processo com pedido de prioridade?' : 'Remover o pedido de prioridade deste processo?', () => marcarPedidoPrioridade(selected, v)); }} />
                <span>⭐ Pedido de Prioridade <em>— visível só para a ASSTEC, card azul</em></span>
              </label>
            )}
            <label className="pa-marcador-toggle">
              <input type="checkbox" checked={!!selected.subJudice}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSubJudiceForm({ numeroPJE: selected.numeroPJE || '', observacao: selected.observacaoSubJudice || '' });
                    setShowSubJudiceForm(true);
                  } else {
                    pedirConfirmacao('Remover a marcação de Sub Judice deste processo?', () => marcarSubJudice(selected, false));
                  }
                }} />
              <span>⚖️ Sub Judice <em>— card pisca em vermelho, com o número do PJE</em></span>
            </label>
            {selected.subJudice && !showSubJudiceForm && (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 8px' }}>
                PJE: <strong>{selected.numeroPJE || 'não informado'}</strong>{selected.observacaoSubJudice ? ` — ${selected.observacaoSubJudice}` : ''}
              </p>
            )}
            {showSubJudiceForm && (
              <div className="form-group" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                <label>Número do PJE *</label>
                <input type="text" placeholder="Ex: 0801234-56.2026.8.18.0000" value={subJudiceForm.numeroPJE} onChange={(e) => setSubJudiceForm({ ...subJudiceForm, numeroPJE: e.target.value })} />
                <label style={{ marginTop: '8px', display: 'block' }}>Observação (opcional)</label>
                <textarea value={subJudiceForm.observacao} onChange={(e) => setSubJudiceForm({ ...subJudiceForm, observacao: e.target.value })} />
                <div className="form-actions" style={{ marginTop: '10px' }}>
                  <button className="btn-primary" disabled={!subJudiceForm.numeroPJE.trim()}
                    onClick={() => pedirConfirmacao('Confirma a marcação deste processo como Sub Judice?', () => { marcarSubJudice(selected, true, subJudiceForm); setShowSubJudiceForm(false); })}>
                    Confirmar
                  </button>
                  <button className="btn-secondary" onClick={() => setShowSubJudiceForm(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {selected.reparacaoDano?.ativo && (
            <div className={`info-box${reparacaoPendente(selected) ? ' card-item-blink-red' : ''}`}>
              <label>🌱 Acompanhamento de Reparação do Dano</label>
              <p style={{ fontSize: '13px', margin: '4px 0' }}>
                Espelhado em {new Date(selected.reparacaoDano.desde).toLocaleDateString('pt-BR')}
                {selected.reparacaoDano.ultimaVerificacaoEm ? ` · última verificação em ${new Date(selected.reparacaoDano.ultimaVerificacaoEm).toLocaleDateString('pt-BR')}` : ' · nenhuma verificação registrada'}
                {' · '}<strong>próxima: {proximaVerificacaoReparacao(selected).toLocaleDateString('pt-BR')}</strong>
              </p>
              {reparacaoPendente(selected) && (
                <p style={{ fontSize: '13px', color: 'var(--accent-red, #B14C40)', fontWeight: 700, margin: '4px 0' }}>⏰ Passaram-se 3 meses: verifique o passivo ambiental e notifique o empreendedor.</p>
              )}
              {(selected.reparacaoDano.verificacoes || []).length > 0 && (
                <ul style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '6px 0', paddingLeft: '18px' }}>
                  {[...selected.reparacaoDano.verificacoes].reverse().map((v, i) => (
                    <li key={i}>{new Date(v.em).toLocaleDateString('pt-BR')} — {ALL_USERS?.[v.por]?.nome || v.por}{v.observacao ? `: ${v.observacao}` : ''}</li>
                  ))}
                </ul>
              )}
              {!somenteConsulta && (isMaster || podeAdministrar || meuNucleo === 'asstec') && (
                <>
                  <div className="form-group" style={{ marginTop: '8px' }}>
                    <label>Observação da verificação (opcional)</label>
                    <textarea value={obsVerificacaoReparacao} onChange={(e) => setObsVerificacaoReparacao(e.target.value)} placeholder="Ex.: empreendedor notificado por AR; área ainda não recuperada..." />
                  </div>
                  <div className="action-buttons">
                    <button className="btn-primary" onClick={() => pedirConfirmacao('Registrar a verificação/notificação da reparação do dano? O próximo alerta será em 3 meses.', () => registrarVerificacaoReparacao(selected, obsVerificacaoReparacao))}>✅ Registrar Verificação/Notificação</button>
                    {selected.estado !== 'pendente_diligencia' && !selected.incidente?.ativo && (
                      <button className="btn-secondary" onClick={() => pedirConfirmacao('Enviar este processo para cumprimento de diligência (Pendente de Diligência), para verificar a reparação do dano? No retorno, o Núcleo de Notificações informa o resultado.', () => enviarDiligenciaVerificacao(selected, 'reparacao'))}>🔎 Enviar para Cumprimento de Diligência</button>
                    )}
                    <button className="link-btn" style={{ fontSize: '12px', color: 'var(--text-secondary)' }} onClick={() => pedirConfirmacao('Retirar este processo do Acompanhamento de Reparação do Dano?', () => marcarReparacaoDano(selected, false))}>Retirar do acompanhamento</button>
                  </div>
                </>
              )}
            </div>
          )}

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
                  <div className="form-group"><label>CPF/CNPJ</label>
                    <input type="text" placeholder="000.000.000-00 ou 00.000.000/0000-00" value={editForm.cpfCnpj} onChange={(e) => setEditForm({ ...editForm, cpfCnpj: e.target.value })} />
                  </div>
                  <div className="form-group"><label>Valor da Multa (R$)</label>
                    <input type="text" value={editForm.valorMulta} onChange={(e) => setEditForm({ ...editForm, valorMulta: e.target.value })} />
                  </div>
                  <label className="pa-marcador-toggle" style={{ marginBottom: '12px' }}>
                    <input type="checkbox" checked={editForm.reparacaoDano} onChange={(e) => setEditForm({ ...editForm, reparacaoDano: e.target.checked })} />
                    <span>🌱 Acompanhamento de Reparação do Dano <em>— pisca em vermelho a cada 3 meses, sem afetar o trâmite</em></span>
                  </label>
                  {tacEditForm && (
                    <div className="form-section" style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', marginBottom: '10px' }}>📝 TAC — Obrigações e Prazos</label>
                      {renderFormTAC(tacEditForm, setTacEditForm)}
                    </div>
                  )}
                  <div className="form-actions">
                    <button className="btn-primary" onClick={() => (editForm.reparacaoDano && !selected.reparacaoDano?.ativo
                      ? perguntarPendenciaReparacao((imediata) => salvarEdicaoInfo(selected, imediata))
                      : pedirConfirmacao('Confirma a alteração dos dados cadastrais deste processo?', () => salvarEdicaoInfo(selected)))}>Salvar Alterações</button>
                    <button className="btn-secondary" onClick={() => setEditandoInfo(false)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <button className="btn-secondary" onClick={() => { setEditForm({ numeroSEI: selected.numeroSEI, parte: selected.parte, cpfCnpj: selected.cpfCnpj || '', valorMulta: String(selected.valorMulta || ''), reparacaoDano: !!selected.reparacaoDano?.ativo }); setTacEditForm(selected.estado === 'acompanhamento_tacs' || selected.tac ? tacParaForm(selected.tac) : null); setEditandoInfo(true); }}>
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
                  <select value={estadoManualMaster} onChange={(e) => { setEstadoManualMaster(e.target.value); setDataInicioPrazoMaster(''); }}
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--neutral-300)', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                    <option value="">Selecione um estado...</option>
                    {Object.entries(ESTADOS_AMBIENTAL).sort((a, b) => a[1].ordem - b[1].ordem).map(([id, e]) => (
                      <option key={id} value={id}>{e.label}</option>
                    ))}
                  </select>
                  {!CAMPO_DATA_POR_ESTADO_PRAZO[estadoManualMaster] && (
                    <button className="btn-secondary" disabled={!estadoManualMaster || estadoManualMaster === selected.estado}
                      onClick={() => pedirConfirmacao(`Confirma a alteração manual do estado para "${ESTADOS_AMBIENTAL[estadoManualMaster]?.label}"?`, () => moverEstadoMaster(selected))}>
                      Mover
                    </button>
                  )}
                </div>
                {CAMPO_DATA_POR_ESTADO_PRAZO[estadoManualMaster] && (
                  <div style={{ marginTop: '10px' }}>
                    <label>{CAMPO_DATA_POR_ESTADO_PRAZO[estadoManualMaster].label} *</label>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 6px' }}>Obrigatório — é a partir dela que o prazo de 20 dias é calculado.</p>
                    <div className="action-buttons">
                      <input type="date" value={dataInicioPrazoMaster} onChange={(e) => setDataInicioPrazoMaster(e.target.value)} />
                      <button className="btn-secondary" disabled={!dataInicioPrazoMaster}
                        onClick={() => pedirConfirmacao(`Confirma a alteração manual do estado para "${ESTADOS_AMBIENTAL[estadoManualMaster]?.label}", com início do prazo em ${new Date(dataInicioPrazoMaster + 'T12:00:00').toLocaleDateString('pt-BR')}?`, () => moverEstadoMaster(selected))}>
                        Mover
                      </button>
                    </div>
                  </div>
                )}
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
                showTacForm ? (
                  <div className="form-section" style={{ marginTop: '10px' }}>
                    <label style={{ display: 'block', marginBottom: '10px' }}>📝 TAC Firmado — Obrigações e Prazos</label>
                    {renderFormTAC(tacForm, setTacForm)}
                    <div className="form-actions" style={{ marginTop: '14px' }}>
                      <button className="btn-primary"
                        disabled={!tacForm.dataAssinatura || !tacForm.obrigacoes.some((o) => o.texto.trim()) || !!erroFormTAC(tacForm)}
                        onClick={() => pedirConfirmacao('Confirma a assinatura do TAC com as obrigações informadas? O processo seguirá para Acompanhamento de TACs.', () => firmarTAC(selected))}>
                        Confirmar TAC Firmado
                      </button>
                      <button className="btn-secondary" onClick={() => setShowTacForm(false)}>Cancelar</button>
                    </div>
                  </div>
                ) : showResolverIncidente ? (
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
                  <div className="action-buttons" style={{ marginTop: '10px' }}>
                    <button className="btn-primary" onClick={() => setShowResolverIncidente(true)}>Resolver Incidente</button>
                    <button className="btn-secondary" onClick={() => setShowTacForm(true)}>📝 TAC Firmado</button>
                  </div>
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
                ) : showArquivarForm && selected.estado !== 'acompanhamento_tacs' ? (
                  renderArquivarInline(selected)
                ) : (
                  <div className="action-buttons" style={{ marginTop: '14px' }}>
                    <button className="btn-delete" onClick={() => setShowIncidenteModal(true)}>🚧 Gerar Incidente</button>
                    {selected.estado === 'acompanhamento_tacs' ? (
                      <button className="btn-delete" onClick={() => pedirConfirmacao('Confirma o descumprimento do TAC? O processo seguirá para Cobrança Administrativa Ativa.', () => moverProcesso(selected, 'cobranca_administrativa', 'manual', { prazo: { inicio: toISODate(new Date()), fim: toISODate(addMeses(new Date(), 3)), origem: 'cobranca_administrativa' } }))}>⚖️ Confirmar Descumprimento de TAC</button>
                    ) : (
                      <button className="btn-secondary" onClick={() => setShowArquivarForm(true)}>📁 Arquivar Processo</button>
                    )}
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
            <h4>{confirmAction.titulo || 'Confirmar Movimentação'}</h4>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{confirmAction.mensagem}</p>
            <div className="modal-actions">
              {confirmAction.opcoes
                ? confirmAction.opcoes.map((o) => (
                  <button key={o.label} className={o.className} onClick={() => { o.onClick(); setConfirmAction(null); }}>{o.label}</button>
                ))
                : <button className="btn-primary" onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }}>Confirmar</button>}
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

  // Consulta pública: sem sidebar nenhuma — só a opção de sair, discreta,
  // num canto da tela.
  if (publico) {
    return (
      <div className="app-container">
        <button className="pa-publico-sair" onClick={onLogout} title="Sair da consulta pública">
          <i className="ti ti-logout"></i> Sair
        </button>
        <div className="main-wrapper">
          <main className="main-content">{conteudo}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="pa-sidebar-trigger" onMouseEnter={() => setSidebarAberta(true)} aria-hidden="true" />
      <aside
        className={`sidebar pa-sidebar-autohide ${sidebarAberta ? 'pa-sidebar-open' : ''}`}
        onMouseEnter={() => setSidebarAberta(true)}
        onMouseLeave={() => setSidebarAberta(false)}
      >
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
          {!publico && (
            <button className={`nav-item ${view === 'lista' && !estadoFiltro ? 'active' : ''}`} onClick={() => { setEstadoFiltro(null); setView('lista'); }}>
              <span className="icon"><i className="ti ti-list"></i></span><span className="label">Todos os Processos</span>
            </button>
          )}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info" data-initial={publico ? 'V' : (nomeUsuario || '?').charAt(0).toUpperCase()}>
            <p className="user-name">{publico ? 'Visitante' : nomeUsuario}</p>
            <p className="user-role">{publico ? 'Consulta pública' : 'Núcleo de Notificações'}</p>
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
