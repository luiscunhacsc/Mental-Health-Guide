const FICHEIRO_DADOS = "mental-health-qrg-UTF8.json";
const CHAVE_PROGRESSO = "saude_mental_progresso_v1";

const estado = {
  dados: null,
  modulos: [],
  moduloAtualId: null,
  vistaAtual: "conteudo",
  carregado: false,
  concluidos: new Set(),
  quiz: {
    perguntas: [],
    indice: 0,
    pontuacao: 0,
    respondida: false,
    escolha: null
  }
};

const ui = {};

document.addEventListener("DOMContentLoaded", arrancarApp);

async function arrancarApp() {
  mapearElementos();
  registarEventos();

  try {
    const dadosEmbebidos = obterDadosEmbebidos();
    const dadosRaw = dadosEmbebidos ?? (await carregarDados(FICHEIRO_DADOS));
    estado.dados = normalizarDados(dadosRaw);
    estado.modulos = construirModulos(estado.dados);
    estado.moduloAtualId = estado.modulos[0]?.id ?? null;
    estado.concluidos = carregarProgresso();
    filtrarProgressoInvalido();
    estado.carregado = true;

    renderizarCabecalho();
    renderizarEstatisticas();
    renderizarNavegacaoModulos();
    renderizarPesquisa("");
    renderizarProgresso();
    renderizarVistaAtual();
  } catch (erro) {
    mostrarErro(
      "Não foi possível carregar os dados da aprendizagem. Confirma que o ficheiro JSON existe e abre a app através de um servidor local."
    );
    // eslint-disable-next-line no-console
    console.error(erro);
  }
}

function mapearElementos() {
  ui.navToggle = document.getElementById("navToggle");
  ui.searchInput = document.getElementById("searchInput");
  ui.searchResults = document.getElementById("searchResults");
  ui.moduleList = document.getElementById("moduleList");
  ui.progressText = document.getElementById("progressText");
  ui.progressBar = document.getElementById("progressBar");
  ui.heroTitle = document.getElementById("heroTitle");
  ui.statsGrid = document.getElementById("statsGrid");
  ui.viewSwitcher = document.getElementById("viewSwitcher");
  ui.viewContainer = document.getElementById("viewContainer");
}

function registarEventos() {
  ui.navToggle.addEventListener("click", alternarNavegacaoMobile);

  ui.searchInput.addEventListener("input", (evento) => {
    renderizarPesquisa(evento.target.value.trim());
  });

  ui.moduleList.addEventListener("click", (evento) => {
    if (!estado.carregado) {
      return;
    }
    const botao = evento.target.closest("[data-module-id]");
    if (!botao) {
      return;
    }
    selecionarModulo(botao.dataset.moduleId);
  });

  ui.searchResults.addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-search-id]");
    if (!botao) {
      return;
    }
    selecionarModulo(botao.dataset.searchId);
    ui.searchInput.value = "";
    renderizarPesquisa("");
  });

  ui.viewSwitcher.addEventListener("click", (evento) => {
    if (!estado.carregado) {
      return;
    }
    const botao = evento.target.closest("[data-view]");
    if (!botao) {
      return;
    }

    estado.vistaAtual = botao.dataset.view;
    sincronizarBotoesVista();
    if (estado.vistaAtual === "quiz" && estado.quiz.perguntas.length === 0) {
      iniciarQuiz();
    }
    renderizarVistaAtual();
  });

  ui.viewContainer.addEventListener("click", (evento) => {
    const acao = evento.target.closest("[data-action]");
    if (!acao) {
      return;
    }

    const tipoAcao = acao.dataset.action;
    if (tipoAcao === "toggle-complete") {
      alternarConclusaoModuloAtual();
      return;
    }

    if (tipoAcao === "flip-card") {
      alternarCartao(acao);
      return;
    }

    if (tipoAcao === "quiz-answer") {
      responderQuiz(Number(acao.dataset.optionIndex));
      return;
    }

    if (tipoAcao === "quiz-next") {
      avancarQuiz();
      return;
    }

    if (tipoAcao === "quiz-restart") {
      iniciarQuiz();
      renderizarVistaAtual();
    }
  });
}

async function carregarDados(caminho) {
  const candidatos = [caminho, `./${caminho}`];
  let ultimoErro = null;

  for (const candidato of candidatos) {
    try {
      const resposta = await fetch(candidato, { cache: "no-store" });
      if (!resposta.ok) {
        ultimoErro = new Error(`Falha ao carregar ${candidato}: ${resposta.status}`);
        continue;
      }
      const texto = await resposta.text();
      const semBom = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
      return JSON.parse(semBom);
    } catch (erro) {
      ultimoErro = erro;
    }
  }

  throw ultimoErro ?? new Error("Falha desconhecida no carregamento dos dados.");
}

function obterDadosEmbebidos() {
  if (typeof window === "undefined") {
    return null;
  }
  const dados = window.MENTAL_HEALTH_QRG_DATA;
  if (!dados || typeof dados !== "object") {
    return null;
  }
  return dados;
}

function normalizarDados(raw) {
  const definicoes = (raw.definicoes ?? raw.definitions ?? []).map((item) => ({
    termo: item.termo ?? item.term ?? "",
    definicao: item.definicao ?? item.definition ?? ""
  }));

  const categorias = (raw.categorias_doenca_mental ?? raw.categories_of_mental_illness ?? []).map((item) => ({
    categoria: item.categoria ?? item.category ?? "",
    tipos: item.tipos ?? item.types ?? []
  }));

  const guias = (raw.guias_clinicos ?? raw.clinical_guides ?? []).map((guia) => ({
    condicao: guia.condicao ?? guia.condition ?? "",
    descricao: guia.descricao ?? guia.description ?? "",
    subtipos: guia.subtipos ?? guia.subtypes ?? [],
    sinais: guia.sinais_e_sintomas ?? guia.signs_and_symptoms ?? [],
    estrategias: guia.estrategias_possiveis ?? guia.possible_strategies ?? []
  }));

  const impactoRaw = raw.impacto_nos_cuidadores ?? raw.impact_on_helpers ?? {};
  const autocuidadoRaw =
    impactoRaw.estrategias_de_autocuidado ?? impactoRaw.strategies_for_self_care ?? {};

  const impacto = {
    definicoes: impactoRaw.definicoes ?? impactoRaw.definitions ?? {},
    sinais: impactoRaw.sinais_e_sintomas ?? impactoRaw.signs_and_symptoms ?? [],
    areas: impactoRaw.areas_afetadas ?? impactoRaw.life_areas_impacted ?? [],
    autocuidado: {
      coisas_a_tentar: autocuidadoRaw.coisas_a_tentar ?? autocuidadoRaw.things_to_try ?? [],
      recursos: autocuidadoRaw.recursos ?? autocuidadoRaw.resources ?? []
    }
  };

  const aprendizagemRaw = raw.aprendizagem_adicional ?? raw.further_learning ?? {};
  const aprendizagem = {
    fornecedor: aprendizagemRaw.fornecedor ?? aprendizagemRaw.provider ?? "",
    descricao: aprendizagemRaw.descricao ?? aprendizagemRaw.description ?? "",
    topicos: aprendizagemRaw.topicos_abordados ?? aprendizagemRaw.topics_covered ?? []
  };

  return {
    titulo: raw.titulo_documento ?? raw.document_title ?? "Guia de Saúde Mental",
    definicoes,
    categorias,
    guias,
    impacto,
    aprendizagem
  };
}

function construirModulos(dados) {
  const base = [];

  base.push({
    id: "definicoes",
    tipo: "definicoes",
    titulo: "Definições Essenciais",
    subtitulo: "Conceitos base para interpretação clínica e intervenção.",
    payload: dados.definicoes
  });

  base.push({
    id: "categorias",
    tipo: "categorias",
    titulo: "Categorias de Doença Mental",
    subtitulo: "Mapa global das principais áreas diagnósticas.",
    payload: dados.categorias
  });

  dados.guias.forEach((guia, indice) => {
    base.push({
      id: `guia-${indice + 1}-${slug(guia.condicao)}`,
      tipo: "guia",
      titulo: guia.condicao,
      subtitulo: guia.descricao,
      payload: guia
    });
  });

  base.push({
    id: "impacto-cuidadores",
    tipo: "impacto",
    titulo: "Impacto nos Cuidadores",
    subtitulo: "Fadiga por compaixão, trauma vicariante e autocuidado.",
    payload: dados.impacto
  });

  base.push({
    id: "aprendizagem-adicional",
    tipo: "aprendizagem",
    titulo: "Aprendizagem Adicional",
    subtitulo: "Recursos de formação contínua e temas de aprofundamento.",
    payload: dados.aprendizagem
  });

  return base.map((modulo, indice) => ({
    ...modulo,
    ordem: indice + 1,
    pesquisa: extrairTexto(modulo.payload).toLowerCase()
  }));
}

function renderizarCabecalho() {
  ui.heroTitle.textContent = estado.dados.titulo;
}

function renderizarEstatisticas() {
  const totalSinais = estado.dados.guias.reduce((acc, guia) => acc + guia.sinais.length, 0);
  const totalEstrategias = estado.dados.guias.reduce((acc, guia) => acc + guia.estrategias.length, 0);

  const cards = [
    { valor: estado.modulos.length, label: "Módulos" },
    { valor: estado.dados.definicoes.length, label: "Definições" },
    { valor: estado.dados.categorias.length, label: "Categorias" },
    { valor: estado.dados.guias.length, label: "Guias Clínicos" },
    { valor: totalSinais, label: "Sinais e Sintomas" },
    { valor: totalEstrategias, label: "Estratégias" }
  ];

  ui.statsGrid.innerHTML = cards
    .map(
      (card) => `
      <article class="stat-card">
        <p class="stat-value">${card.valor}</p>
        <p class="stat-label">${card.label}</p>
      </article>
    `
    )
    .join("");
}

function renderizarNavegacaoModulos() {
  ui.moduleList.innerHTML = estado.modulos
    .map((modulo) => {
      const ativo = modulo.id === estado.moduloAtualId ? "active" : "";
      const concluido = estado.concluidos.has(modulo.id) ? "done" : "";
      return `
        <li>
          <button type="button" class="module-btn ${ativo}" data-module-id="${modulo.id}">
            <div>
              <span class="module-text">${esc(modulo.titulo)}</span>
              <span class="module-meta">Módulo ${modulo.ordem} · ${rotuloTipo(modulo.tipo)}</span>
            </div>
            <span class="status-pill ${concluido}" aria-hidden="true"></span>
          </button>
        </li>
      `;
    })
    .join("");
}

function renderizarProgresso() {
  const total = estado.modulos.length;
  const feitos = estado.concluidos.size;
  const percentagem = total === 0 ? 0 : Math.round((feitos / total) * 100);

  ui.progressText.textContent = `${feitos} de ${total} módulos concluídos (${percentagem}%)`;
  ui.progressBar.style.width = `${percentagem}%`;
}

function renderizarPesquisa(termo) {
  if (!termo || termo.length < 2) {
    ui.searchResults.innerHTML = '<p class="search-empty">Escreve pelo menos 2 caracteres para pesquisar.</p>';
    return;
  }

  const query = termo.toLowerCase();
  const encontrados = estado.modulos
    .filter((modulo) => modulo.titulo.toLowerCase().includes(query) || modulo.pesquisa.includes(query))
    .slice(0, 8);

  if (encontrados.length === 0) {
    ui.searchResults.innerHTML = '<p class="search-empty">Sem resultados para esta pesquisa.</p>';
    return;
  }

  ui.searchResults.innerHTML = encontrados
    .map(
      (modulo) => `
      <button type="button" class="search-result-btn" data-search-id="${modulo.id}">
        <span class="search-result-title">${esc(modulo.titulo)}</span>
        <span class="search-result-type">${rotuloTipo(modulo.tipo)}</span>
      </button>
    `
    )
    .join("");
}

function selecionarModulo(moduloId) {
  if (!estado.modulos.some((modulo) => modulo.id === moduloId)) {
    return;
  }
  estado.moduloAtualId = moduloId;
  renderizarNavegacaoModulos();
  renderizarVistaAtual();
  fecharNavegacaoMobile();
}

function sincronizarBotoesVista() {
  const botoes = ui.viewSwitcher.querySelectorAll("[data-view]");
  botoes.forEach((botao) => {
    const ativo = botao.dataset.view === estado.vistaAtual;
    botao.classList.toggle("active", ativo);
    botao.setAttribute("aria-selected", ativo ? "true" : "false");
  });
}

function renderizarVistaAtual() {
  if (!estado.carregado) {
    ui.viewContainer.innerHTML = '<p class="loading">A carregar aplicação...</p>';
    return;
  }

  if (estado.modulos.length === 0) {
    mostrarErro("Sem módulos disponíveis.");
    return;
  }

  const modulo = obterModuloAtual();
  if (!modulo) {
    mostrarErro("Módulo não encontrado.");
    return;
  }

  if (estado.vistaAtual === "conteudo") {
    renderizarConteudo(modulo);
    return;
  }

  if (estado.vistaAtual === "cartoes") {
    renderizarCartoes(modulo);
    return;
  }

  if (estado.vistaAtual === "quiz") {
    renderizarQuiz();
  }
}

function renderizarConteudo(modulo) {
  const concluido = estado.concluidos.has(modulo.id);
  const cabecalho = `
    <header class="section-header">
      <div>
        <h3>${esc(modulo.titulo)}</h3>
        <p class="section-subtitle">${esc(modulo.subtitulo ?? "")}</p>
      </div>
      <button type="button" class="complete-btn ${concluido ? "done" : ""}" data-action="toggle-complete">
        ${concluido ? "Módulo concluído" : "Marcar como concluído"}
      </button>
    </header>
  `;

  let corpo = "";
  if (modulo.tipo === "definicoes") {
    corpo = renderizarBlocoDefinicoes(modulo.payload);
  } else if (modulo.tipo === "categorias") {
    corpo = renderizarBlocoCategorias(modulo.payload);
  } else if (modulo.tipo === "guia") {
    corpo = renderizarBlocoGuia(modulo.payload);
  } else if (modulo.tipo === "impacto") {
    corpo = renderizarBlocoImpacto(modulo.payload);
  } else if (modulo.tipo === "aprendizagem") {
    corpo = renderizarBlocoAprendizagem(modulo.payload);
  }

  ui.viewContainer.innerHTML = cabecalho + corpo;
}

function renderizarBlocoDefinicoes(definicoes) {
  if (!definicoes.length) {
    return '<p class="empty-state">Sem definições disponíveis.</p>';
  }

  return `
    <section class="grid-cards">
      ${definicoes
        .map(
          (item) => `
            <article class="content-card">
              <h4>${esc(item.termo)}</h4>
              <p>${esc(item.definicao)}</p>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderizarBlocoCategorias(categorias) {
  if (!categorias.length) {
    return '<p class="empty-state">Sem categorias disponíveis.</p>';
  }

  return `
    <section class="grid-cards">
      ${categorias
        .map(
          (item) => `
            <article class="content-card">
              <h4>${esc(item.categoria)}</h4>
              <div class="chip-wrap">
                ${(item.tipos ?? []).map((tipo) => `<span class="chip">${esc(tipo)}</span>`).join("")}
              </div>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function renderizarBlocoGuia(guia) {
  const listaSubtipos = listaHtml(guia.subtipos);
  const listaSinais = listaHtml(guia.sinais, "warning-list");
  const listaEstrategias = listaHtml(guia.estrategias);
  const alertaSuicidio =
    guia.condicao.toLowerCase().includes("suicid") || guia.condicao.toLowerCase().includes("auto")
      ? `
        <p class="callout">
          Prioriza sempre segurança imediata, comunicação com equipa clínica e cumprimento dos protocolos formais da instituição.
        </p>
      `
      : "";

  return `
    <section class="guide-layout">
      <article class="content-card">
        <h4>Descrição Clínica</h4>
        <p>${esc(guia.descricao)}</p>
        ${alertaSuicidio}
      </article>

      <article class="content-card list-block">
        <h4>Subtipos</h4>
        ${listaSubtipos}
      </article>

      <article class="content-card list-block">
        <h4>Sinais e Sintomas</h4>
        ${listaSinais}
      </article>

      <article class="content-card list-block">
        <h4>Estratégias Possíveis</h4>
        ${listaEstrategias}
      </article>
    </section>
  `;
}

function renderizarBlocoImpacto(impacto) {
  const definicoes = Object.entries(impacto.definicoes ?? {});
  const blocoDefinicoes = definicoes
    .map(
      ([termo, descricao]) => `
      <article class="content-card">
        <h4>${esc(termo)}</h4>
        <p>${esc(descricao)}</p>
      </article>
    `
    )
    .join("");

  return `
    <section class="guide-layout">
      <article class="content-card list-block">
        <h4>Conceitos-Chave</h4>
        <div class="grid-cards">
          ${blocoDefinicoes}
        </div>
      </article>

      <article class="content-card list-block">
        <h4>Sinais e Sintomas nos Cuidadores</h4>
        ${listaHtml(impacto.sinais, "warning-list")}
      </article>

      <article class="content-card list-block">
        <h4>Áreas de Impacto</h4>
        ${listaHtml(impacto.areas)}
      </article>

      <article class="content-card list-block">
        <h4>Estratégias de Autocuidado</h4>
        <h5>Coisas a Tentar</h5>
        ${listaHtml(impacto.autocuidado.coisas_a_tentar)}
        <h5>Recursos Recomendados</h5>
        ${listaHtml(impacto.autocuidado.recursos, "resource-list")}
      </article>
    </section>
  `;
}

function renderizarBlocoAprendizagem(aprendizagem) {
  return `
    <section class="guide-layout">
      <article class="content-card">
        <h4>Entidade</h4>
        <p>${esc(aprendizagem.fornecedor)}</p>
      </article>

      <article class="content-card">
        <h4>Descrição</h4>
        <p>${esc(aprendizagem.descricao)}</p>
      </article>

      <article class="content-card list-block">
        <h4>Tópicos Abrangidos</h4>
        ${listaHtml(aprendizagem.topicos)}
      </article>
    </section>
  `;
}

function renderizarCartoes(modulo) {
  const cartoes = construirCartoes(modulo);
  if (!cartoes.length) {
    ui.viewContainer.innerHTML = '<p class="empty-state">Sem cartões disponíveis para este módulo.</p>';
    return;
  }

  ui.viewContainer.innerHTML = `
    <header class="section-header">
      <div>
        <h3>Cartões de Estudo: ${esc(modulo.titulo)}</h3>
        <p class="section-subtitle">Clica em cada cartão para ver a resposta.</p>
      </div>
    </header>
    <p class="flash-summary">${cartoes.length} cartões gerados a partir deste módulo.</p>
    <section class="flash-grid">
      ${cartoes
        .map(
          (cartao, indice) => `
            <button type="button" class="flash-card" data-action="flip-card" data-card-index="${indice}" aria-expanded="false">
              <p class="flash-label">${esc(cartao.etiqueta)}</p>
              <p class="flash-front">${esc(cartao.frente)}</p>
              <p class="flash-back" hidden>${esc(cartao.verso)}</p>
              <p class="flash-tip">Toque para revelar</p>
            </button>
          `
        )
        .join("")}
    </section>
  `;
}

function construirCartoes(modulo) {
  if (modulo.tipo === "definicoes") {
    return modulo.payload.map((item) => ({
      etiqueta: "Definição",
      frente: item.termo,
      verso: item.definicao
    }));
  }

  if (modulo.tipo === "categorias") {
    const cartoes = [];
    modulo.payload.forEach((categoria) => {
      (categoria.tipos ?? []).forEach((tipo) => {
        cartoes.push({
          etiqueta: "Categoria",
          frente: `A que categoria pertence "${tipo}"?`,
          verso: categoria.categoria
        });
      });
    });
    return cartoes;
  }

  if (modulo.tipo === "guia") {
    const guia = modulo.payload;
    const cartoes = [
      {
        etiqueta: "Condição",
        frente: guia.condicao,
        verso: guia.descricao
      }
    ];

    guia.subtipos.forEach((subtipo) => {
      cartoes.push({
        etiqueta: "Subtipo",
        frente: `Indica um subtipo relacionado com ${guia.condicao}.`,
        verso: subtipo
      });
    });

    guia.sinais.forEach((sinal) => {
      cartoes.push({
        etiqueta: "Sinal/Sintoma",
        frente: `Refere um sinal de ${guia.condicao}.`,
        verso: sinal
      });
    });

    guia.estrategias.forEach((estrategia) => {
      cartoes.push({
        etiqueta: "Estratégia",
        frente: `Qual é uma estratégia possível para ${guia.condicao}?`,
        verso: estrategia
      });
    });
    return cartoes;
  }

  if (modulo.tipo === "impacto") {
    const cartoes = [];
    Object.entries(modulo.payload.definicoes ?? {}).forEach(([termo, definicao]) => {
      cartoes.push({
        etiqueta: "Impacto",
        frente: termo,
        verso: definicao
      });
    });

    modulo.payload.sinais.forEach((item) => {
      cartoes.push({
        etiqueta: "Sinal em Cuidadores",
        frente: "Identifica um sinal de fadiga por compaixão/trauma vicariante.",
        verso: item
      });
    });

    modulo.payload.areas.forEach((item) => {
      cartoes.push({
        etiqueta: "Área Afetada",
        frente: "Indica uma área de impacto para cuidadores.",
        verso: item
      });
    });

    modulo.payload.autocuidado.coisas_a_tentar.forEach((item) => {
      cartoes.push({
        etiqueta: "Autocuidado",
        frente: "Indica uma prática de autocuidado recomendada.",
        verso: item
      });
    });
    return cartoes;
  }

  if (modulo.tipo === "aprendizagem") {
    const cartoes = [
      {
        etiqueta: "Recurso",
        frente: "Qual é a entidade indicada para aprendizagem adicional?",
        verso: modulo.payload.fornecedor
      },
      {
        etiqueta: "Descrição",
        frente: "Como é descrita a biblioteca de aprendizagem adicional?",
        verso: modulo.payload.descricao
      }
    ];

    modulo.payload.topicos.forEach((item) => {
      cartoes.push({
        etiqueta: "Tópico",
        frente: "Indica um tópico de aprendizagem adicional.",
        verso: item
      });
    });
    return cartoes;
  }

  return [];
}

function alternarCartao(botao) {
  const parteFrente = botao.querySelector(".flash-front");
  const parteVerso = botao.querySelector(".flash-back");
  const dica = botao.querySelector(".flash-tip");
  const virado = botao.classList.toggle("flipped");

  if (!parteFrente || !parteVerso || !dica) {
    return;
  }

  parteFrente.hidden = virado;
  parteVerso.hidden = !virado;
  dica.textContent = virado ? "Toque para voltar" : "Toque para revelar";
  botao.setAttribute("aria-expanded", virado ? "true" : "false");
}

function iniciarQuiz() {
  estado.quiz = {
    perguntas: gerarPerguntasQuiz(10),
    indice: 0,
    pontuacao: 0,
    respondida: false,
    escolha: null
  };
}

function renderizarQuiz() {
  if (!estado.quiz.perguntas.length) {
    iniciarQuiz();
  }

  const terminou = estado.quiz.indice >= estado.quiz.perguntas.length;
  if (terminou) {
    const total = estado.quiz.perguntas.length;
    const score = estado.quiz.pontuacao;
    const percentagem = total === 0 ? 0 : Math.round((score / total) * 100);

    ui.viewContainer.innerHTML = `
      <section class="quiz-card">
        <header class="section-header">
          <div>
            <h3>Quiz Concluído</h3>
            <p class="section-subtitle">Avalia a tua retenção de conteúdos clínicos.</p>
          </div>
        </header>
        <p class="quiz-end">Resultado final: <strong>${score}/${total}</strong> (${percentagem}%).</p>
        <div class="quiz-actions">
          <button type="button" class="quiz-btn primary" data-action="quiz-restart">Reiniciar Quiz</button>
          <button type="button" class="quiz-btn" data-action="toggle-complete">Marcar módulo atual como concluído</button>
        </div>
      </section>
    `;
    return;
  }

  const pergunta = estado.quiz.perguntas[estado.quiz.indice];
  const progresso = Math.round((estado.quiz.indice / estado.quiz.perguntas.length) * 100);

  ui.viewContainer.innerHTML = `
    <section class="quiz-card">
      <div class="quiz-head">
        <p class="quiz-meta">Pergunta ${estado.quiz.indice + 1} de ${estado.quiz.perguntas.length}</p>
        <p class="quiz-score">Pontuação: ${estado.quiz.pontuacao}</p>
      </div>
      <div class="progress-track" aria-hidden="true">
        <div class="progress-bar" style="width:${progresso}%"></div>
      </div>
      <p class="quiz-question">${esc(pergunta.pergunta)}</p>
      <div class="quiz-options">
        ${pergunta.opcoes
          .map((opcao, indice) => {
            const classes = classesOpcaoQuiz(indice, pergunta);
            return `
              <button type="button" class="quiz-option ${classes}" data-action="quiz-answer" data-option-index="${indice}" ${
                estado.quiz.respondida ? "disabled" : ""
              }>
                ${esc(opcao)}
              </button>
            `;
          })
          .join("")}
      </div>
      ${feedbackQuiz(pergunta)}
      <div class="quiz-actions">
        <button type="button" class="quiz-btn primary" data-action="quiz-next" ${estado.quiz.respondida ? "" : "disabled"}>
          ${estado.quiz.indice === estado.quiz.perguntas.length - 1 ? "Ver Resultado" : "Próxima Pergunta"}
        </button>
        <button type="button" class="quiz-btn" data-action="quiz-restart">Novo Quiz</button>
      </div>
    </section>
  `;
}

function gerarPerguntasQuiz(limite) {
  const factos = construirFactosQuiz();
  const selecionados = baralhar([...factos]).slice(0, limite);
  const universoOpcoes = Array.from(new Set(factos.map((f) => f.correta)));

  return selecionados.map((facto) => {
    const baseDistratores = (facto.pool ?? []).filter((item) => item !== facto.correta);
    const distratores = baralhar([...new Set(baseDistratores)]).slice(0, 3);

    while (distratores.length < 3) {
      const candidato = universoOpcoes[Math.floor(Math.random() * universoOpcoes.length)];
      if (candidato && candidato !== facto.correta && !distratores.includes(candidato)) {
        distratores.push(candidato);
      } else {
        break;
      }
    }

    const opcoes = baralhar([facto.correta, ...distratores]).slice(0, 4);
    return {
      pergunta: facto.pergunta,
      correta: facto.correta,
      opcoes
    };
  });
}

function construirFactosQuiz() {
  const factos = [];

  const termos = estado.dados.definicoes.map((item) => item.termo);
  estado.dados.definicoes.forEach((item) => {
    factos.push({
      pergunta: `Que termo corresponde a esta definição?\n"${resumir(item.definicao, 170)}"`,
      correta: item.termo,
      pool: termos
    });
  });

  const categorias = estado.dados.categorias.map((item) => item.categoria);
  estado.dados.categorias.forEach((categoria) => {
    categoria.tipos.forEach((tipo) => {
      factos.push({
        pergunta: `A que categoria pertence o tipo "${tipo}"?`,
        correta: categoria.categoria,
        pool: categorias
      });
    });
  });

  const condicoes = estado.dados.guias.map((guia) => guia.condicao);
  estado.dados.guias.forEach((guia) => {
    guia.sinais.forEach((sinal) => {
      factos.push({
        pergunta: `Este sinal/sintoma está associado a que condição?\n"${resumir(sinal, 130)}"`,
        correta: guia.condicao,
        pool: condicoes
      });
    });

    guia.estrategias.forEach((estrategia) => {
      factos.push({
        pergunta: `Esta estratégia pertence a que condição?\n"${resumir(estrategia, 130)}"`,
        correta: guia.condicao,
        pool: condicoes
      });
    });
  });

  const termosImpacto = Object.keys(estado.dados.impacto.definicoes);
  Object.entries(estado.dados.impacto.definicoes).forEach(([termo, descricao]) => {
    factos.push({
      pergunta: `No contexto dos cuidadores, que termo corresponde a esta definição?\n"${resumir(descricao, 150)}"`,
      correta: termo,
      pool: termosImpacto
    });
  });

  const topicos = estado.dados.aprendizagem.topicos;
  topicos.forEach((topico) => {
    factos.push({
      pergunta: "Qual destes tópicos consta da secção de aprendizagem adicional?",
      correta: topico,
      pool: topicos
    });
  });

  return factos;
}

function responderQuiz(indiceOpcao) {
  if (estado.quiz.respondida) {
    return;
  }

  const pergunta = estado.quiz.perguntas[estado.quiz.indice];
  if (!pergunta) {
    return;
  }

  estado.quiz.escolha = indiceOpcao;
  estado.quiz.respondida = true;
  if (pergunta.opcoes[indiceOpcao] === pergunta.correta) {
    estado.quiz.pontuacao += 1;
  }
  renderizarQuiz();
}

function avancarQuiz() {
  if (!estado.quiz.respondida) {
    return;
  }

  estado.quiz.indice += 1;
  estado.quiz.respondida = false;
  estado.quiz.escolha = null;
  renderizarQuiz();
}

function classesOpcaoQuiz(indiceOpcao, pergunta) {
  if (!estado.quiz.respondida) {
    return "";
  }
  const escolha = estado.quiz.escolha;
  const valor = pergunta.opcoes[indiceOpcao];
  if (valor === pergunta.correta) {
    return "correct";
  }
  if (indiceOpcao === escolha && valor !== pergunta.correta) {
    return "wrong";
  }
  return "";
}

function feedbackQuiz(pergunta) {
  if (!estado.quiz.respondida) {
    return "";
  }
  const opcaoSelecionada = pergunta.opcoes[estado.quiz.escolha];
  const correto = opcaoSelecionada === pergunta.correta;
  const classe = correto ? "ok" : "fail";
  const mensagem = correto
    ? "Resposta correta."
    : `Resposta incorreta. Correta: ${pergunta.correta}.`;
  return `<p class="quiz-feedback ${classe}">${esc(mensagem)}</p>`;
}

function alternarConclusaoModuloAtual() {
  const modulo = obterModuloAtual();
  if (!modulo) {
    return;
  }

  if (estado.concluidos.has(modulo.id)) {
    estado.concluidos.delete(modulo.id);
  } else {
    estado.concluidos.add(modulo.id);
  }

  guardarProgresso();
  renderizarNavegacaoModulos();
  renderizarProgresso();
  renderizarVistaAtual();
}

function carregarProgresso() {
  try {
    const bruto = localStorage.getItem(CHAVE_PROGRESSO);
    if (!bruto) {
      return new Set();
    }
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) {
      return new Set();
    }
    return new Set(lista);
  } catch {
    return new Set();
  }
}

function guardarProgresso() {
  localStorage.setItem(CHAVE_PROGRESSO, JSON.stringify(Array.from(estado.concluidos)));
}

function filtrarProgressoInvalido() {
  const idsValidos = new Set(estado.modulos.map((modulo) => modulo.id));
  estado.concluidos.forEach((id) => {
    if (!idsValidos.has(id)) {
      estado.concluidos.delete(id);
    }
  });
  guardarProgresso();
}

function obterModuloAtual() {
  return estado.modulos.find((modulo) => modulo.id === estado.moduloAtualId);
}

function alternarNavegacaoMobile() {
  const aberto = document.body.classList.toggle("nav-open");
  ui.navToggle.setAttribute("aria-expanded", aberto ? "true" : "false");
}

function fecharNavegacaoMobile() {
  document.body.classList.remove("nav-open");
  ui.navToggle.setAttribute("aria-expanded", "false");
}

function mostrarErro(mensagem) {
  ui.viewContainer.innerHTML = `<p class="empty-state">${esc(mensagem)}</p>`;
}

function listaHtml(lista, classeExtra = "") {
  if (!lista || lista.length === 0) {
    return '<p class="empty-state">Sem itens nesta secção.</p>';
  }
  return `
    <ul class="clean-list ${classeExtra}">
      ${lista.map((item) => `<li>${esc(item)}</li>`).join("")}
    </ul>
  `;
}

function extrairTexto(valor) {
  if (valor == null) {
    return "";
  }
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
    return String(valor);
  }
  if (Array.isArray(valor)) {
    return valor.map(extrairTexto).join(" ");
  }
  return Object.values(valor)
    .map(extrairTexto)
    .join(" ");
}

function resumir(texto, limite) {
  if (!texto) {
    return "";
  }
  if (texto.length <= limite) {
    return texto;
  }
  return `${texto.slice(0, limite - 1).trimEnd()}…`;
}

function rotuloTipo(tipo) {
  const mapa = {
    definicoes: "Conceitos",
    categorias: "Mapa Diagnóstico",
    guia: "Guia Clínico",
    impacto: "Bem-estar do Cuidador",
    aprendizagem: "Recursos"
  };
  return mapa[tipo] ?? "Módulo";
}

function esc(valor) {
  const texto = valor == null ? "" : String(valor);
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slug(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function baralhar(lista) {
  for (let i = lista.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}
