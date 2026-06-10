// ============================================================================
//  AquaSense IoT — Skill Alexa (custom, pt-BR)  |  Alexa-hosted Node.js
//
//  Consulta a telemetria da piscina (lendo o tópico retido ".../dados") e
//  envia comandos de dosagem e de modo (publicando em ".../dosagem/comando"
//  e ".../controle/modo"). Toda a comunicação passa pela ponte MQTT.
//
//  Invocação: "monitor da piscina".
//    "Alexa, abrir monitor da piscina"
//    "Alexa, pergunte ao monitor da piscina qual o pH"
//    "Alexa, peça ao monitor da piscina para dosar cloro"
// ============================================================================

const Alexa = require("ask-sdk-core");
const bridge = require("./mqtt-bridge");

// ----------------------------------------------------------------------------
//  Faixas ideais (ABNT NBR 10818) — espelham thresholds.ts / firmware.
// ----------------------------------------------------------------------------
const SENTINELA = -50; // valores <= -50 indicam erro de sensor (firmware usa -99)

const PARAMS = {
  ph:           { campo: "ph",           nome: "pH",            unidade: "",                     min: 7.2, max: 7.6, dec: 1 },
  cloro:        { campo: "cloro",        nome: "cloro",         unidade: "partes por milhão",    min: 1.0, max: 3.0, dec: 1 },
  alcalinidade: { campo: "alcalinidade", nome: "alcalinidade",  unidade: "partes por milhão",    min: 80,  max: 120, dec: 0 },
  orp:          { campo: "orp_mv",       nome: "ORP",           unidade: "milivolts",            min: null, max: null, dec: 0 },
  umidade:      { campo: "umidade",      nome: "umidade",       unidade: "por cento",            min: null, max: null, dec: 0 },
};

// ----------------------------------------------------------------------------
//  Utilidades
// ----------------------------------------------------------------------------
function num(v, dec) {
  return Number(v).toFixed(dec).replace(".", ",");
}

function ehErroSensor(v) {
  return typeof v !== "number" || v <= SENTINELA;
}

// Lê o id canônico de um slot (via resolução de sinônimos) ou o valor falado.
function resolverSlot(handlerInput, nomeSlot) {
  const slot = Alexa.getSlot(handlerInput.requestEnvelope, nomeSlot);
  if (!slot) return null;
  const aut = slot.resolutions &&
    slot.resolutions.resolutionsPerAuthority &&
    slot.resolutions.resolutionsPerAuthority[0];
  if (aut && aut.status && aut.status.code === "ER_SUCCESS_MATCH") {
    const val = aut.values[0].value;
    return val.id || val.name;
  }
  return slot.value ? slot.value.toLowerCase() : null;
}

function statusFaixa(valor, min, max) {
  if (min === null) return null;
  if (valor < min) return "abaixo do ideal";
  if (valor > max) return "acima do ideal";
  return "dentro da faixa ideal";
}

const ERRO_OFFLINE =
  "Não consegui falar com o sistema da piscina agora. " +
  "Verifique se o ESP32 está ligado e conectado ao broker.";

// ============================================================================
//  HANDLERS
// ============================================================================

const LaunchRequestHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === "LaunchRequest";
  },
  handle(h) {
    const fala =
      "Bem-vindo ao monitor da piscina AquaSense. " +
      "Você pode perguntar, por exemplo, qual o pH, como está a água, " +
      "ou pedir para dosar cloro. O que deseja?";
    return h.responseBuilder
      .speak(fala)
      .reprompt("O que deseja saber sobre a piscina?")
      .getResponse();
  },
};

// --- Consulta de parâmetro químico -----------------------------------------
const ConsultarParametroHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(h.requestEnvelope) === "ConsultarParametroIntent"
    );
  },
  async handle(h) {
    const id = resolverSlot(h, "parametro");
    const p = id && PARAMS[id];
    if (!p) {
      return h.responseBuilder
        .speak("Não entendi qual parâmetro você quer. Tente pH, cloro ou alcalinidade.")
        .reprompt("Qual parâmetro deseja consultar?")
        .getResponse();
    }

    let snap;
    try {
      snap = await bridge.lerSnapshot();
    } catch (e) {
      return h.responseBuilder.speak(ERRO_OFFLINE).getResponse();
    }

    const v = snap[p.campo];
    if (ehErroSensor(v)) {
      return h.responseBuilder
        .speak(`O sensor de ${p.nome} está reportando erro no momento.`)
        .getResponse();
    }

    const unidade = p.unidade ? " " + p.unidade : "";
    const status = statusFaixa(v, p.min, p.max);
    let fala = `O ${p.nome} está em ${num(v, p.dec)}${unidade}`;
    if (status) {
      fala += `, ${status}`;
      if (status !== "dentro da faixa ideal") {
        fala += ` de ${num(p.min, p.dec)} a ${num(p.max, p.dec)}`;
      }
    }
    fala += ".";
    return h.responseBuilder.speak(fala).getResponse();
  },
};

// --- Consulta de temperatura ------------------------------------------------
const ConsultarTemperaturaHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(h.requestEnvelope) === "ConsultarTemperaturaIntent"
    );
  },
  async handle(h) {
    const local = resolverSlot(h, "local"); // "piscina" | "coletor" | null

    let snap;
    try {
      snap = await bridge.lerSnapshot();
    } catch (e) {
      return h.responseBuilder.speak(ERRO_OFFLINE).getResponse();
    }

    const tp = snap.temp_piscina;
    const ts = snap.temp_coletor;
    const dt = typeof snap.delta_t === "number" ? snap.delta_t : ts - tp;

    let fala;
    if (local === "coletor") {
      fala = ehErroSensor(ts)
        ? "O sensor do coletor solar está com erro."
        : `A temperatura do coletor solar está em ${num(ts, 1)} graus.`;
    } else if (local === "piscina") {
      fala = ehErroSensor(tp)
        ? "O sensor da piscina está com erro."
        : `A temperatura da piscina está em ${num(tp, 1)} graus.`;
    } else {
      // Sem local específico: resume os dois e a diferença.
      const partes = [];
      if (!ehErroSensor(tp)) partes.push(`a piscina está em ${num(tp, 1)} graus`);
      if (!ehErroSensor(ts)) partes.push(`o coletor está em ${num(ts, 1)} graus`);
      fala = partes.length
        ? `Atualmente, ${partes.join(" e ")}. A diferença é de ${num(dt, 1)} graus.`
        : "Os sensores de temperatura estão com erro.";
    }
    return h.responseBuilder.speak(fala).getResponse();
  },
};

// --- Resumo geral -----------------------------------------------------------
const ResumoHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(h.requestEnvelope) === "ResumoIntent"
    );
  },
  async handle(h) {
    let snap;
    try {
      snap = await bridge.lerSnapshot();
    } catch (e) {
      return h.responseBuilder.speak(ERRO_OFFLINE).getResponse();
    }

    const partes = [];
    if (!ehErroSensor(snap.ph)) partes.push(`pH ${num(snap.ph, 1)}`);
    if (!ehErroSensor(snap.cloro)) partes.push(`cloro ${num(snap.cloro, 1)}`);
    if (!ehErroSensor(snap.alcalinidade)) partes.push(`alcalinidade ${num(snap.alcalinidade, 0)}`);

    let fala = partes.length
      ? `Resumo da piscina: ${partes.join(", ")}. `
      : "Não recebi as leituras de qualidade da água. ";

    if (!ehErroSensor(snap.temp_piscina)) {
      fala += `A água está a ${num(snap.temp_piscina, 1)} graus. `;
    }

    const bombaOn = snap.bomba === "LIGADA" || snap.bomba === true;
    fala += `A bomba do coletor está ${bombaOn ? "ligada" : "desligada"}. `;

    const alertas = Array.isArray(snap.alertas) ? snap.alertas : [];
    if (alertas.length === 0) {
      fala += "Nenhum alerta ativo.";
    } else if (alertas.length === 1) {
      fala += `Há um alerta: ${alertas[0]}.`;
    } else {
      fala += `Há ${alertas.length} alertas ativos: ${alertas.join(", ")}.`;
    }

    return h.responseBuilder.speak(fala).getResponse();
  },
};

// --- Status da bomba --------------------------------------------------------
const StatusBombaHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(h.requestEnvelope) === "StatusBombaIntent"
    );
  },
  async handle(h) {
    let snap;
    try {
      snap = await bridge.lerSnapshot();
    } catch (e) {
      return h.responseBuilder.speak(ERRO_OFFLINE).getResponse();
    }

    const bombaOn = snap.bomba === "LIGADA" || snap.bomba === true;
    const dt = typeof snap.delta_t === "number" ? snap.delta_t : null;

    let fala = `A bomba do coletor solar está ${bombaOn ? "ligada" : "desligada"}.`;
    if (dt !== null) {
      fala += ` A diferença de temperatura entre o coletor e a piscina é de ${num(dt, 1)} graus.`;
    }
    return h.responseBuilder.speak(fala).getResponse();
  },
};

// --- Comando: dosagem (confirmação obrigatória no modelo de diálogo) --------
const DosarHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(h.requestEnvelope) === "DosarIntent"
    );
  },
  async handle(h) {
    const status = Alexa.getDialogState(h.requestEnvelope);
    const intent = h.requestEnvelope.request.intent;

    // Deixa o diálogo (elicitação + confirmação) ser conduzido pela Alexa.
    if (status !== "COMPLETED") {
      return h.responseBuilder.addDelegateDirective(intent).getResponse();
    }

    // Usuário negou a confirmação.
    if (intent.confirmationStatus === "DENIED") {
      return h.responseBuilder.speak("Tudo bem, não vou dosar nada.").getResponse();
    }

    const quimico = resolverSlot(h, "quimico"); // "cloro" | "acido" | "base"
    if (!quimico) {
      return h.responseBuilder
        .speak("Não entendi qual produto dosar. Pode ser cloro, ácido ou base.")
        .reprompt("Qual produto deseja dosar?")
        .getResponse();
    }

    try {
      await bridge.publicar("dosagem/comando", { parametro: quimico });
    } catch (e) {
      return h.responseBuilder
        .speak("Não consegui enviar o comando de dosagem para o sistema agora.")
        .getResponse();
    }

    const nome = quimico === "acido" ? "ácido" : quimico;
    const fala =
      `Comando de dosagem de ${nome} enviado. ` +
      "Se o sistema estiver em parada de emergência ou já dosando, o comando será bloqueado. " +
      "Acompanhe o resultado no painel.";
    return h.responseBuilder.speak(fala).getResponse();
  },
};

// --- Comando: definir modo (confirmação obrigatória no modelo de diálogo) ---
// "parada" = parada de emergência: a confirmação evita que um trecho de fala
// mal interpretado pelo ASR (ex.: "modo... parada" ouvido por engano) pare o
// sistema de dosagem química sem intenção do usuário. Aplica-se também a
// "automático"/"manual" porque o modelo de diálogo da Alexa não permite
// confirmação condicional por valor de slot — mesmo padrão de DosarIntent.
const DefinirModoHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(h.requestEnvelope) === "DefinirModoIntent"
    );
  },
  async handle(h) {
    const status = Alexa.getDialogState(h.requestEnvelope);
    const intent = h.requestEnvelope.request.intent;

    // Deixa o diálogo (elicitação + confirmação) ser conduzido pela Alexa.
    if (status !== "COMPLETED") {
      return h.responseBuilder.addDelegateDirective(intent).getResponse();
    }

    // Usuário negou a confirmação.
    if (intent.confirmationStatus === "DENIED") {
      return h.responseBuilder.speak("Tudo bem, mantendo o modo atual.").getResponse();
    }

    const modo = resolverSlot(h, "modo"); // "automatico" | "manual" | "parada"
    if (!modo) {
      return h.responseBuilder
        .speak("Não entendi o modo. Pode ser automático, manual ou parada de emergência.")
        .reprompt("Qual modo deseja ativar?")
        .getResponse();
    }

    try {
      await bridge.publicar("controle/modo", { modo });
    } catch (e) {
      return h.responseBuilder
        .speak("Não consegui mudar o modo do sistema agora.")
        .getResponse();
    }

    let fala;
    if (modo === "parada") {
      fala =
        "Parada de emergência ativada. Nenhuma dosagem será feita até você sair desse modo.";
    } else {
      const nome = modo === "automatico" ? "automático" : "manual";
      fala = `Modo alterado para ${nome}.`;
    }
    return h.responseBuilder.speak(fala).getResponse();
  },
};

// ----------------------------------------------------------------------------
//  Handlers padrão
// ----------------------------------------------------------------------------
const HelpHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(h.requestEnvelope) === "AMAZON.HelpIntent"
    );
  },
  handle(h) {
    const fala =
      "Você pode perguntar o pH, o cloro, a alcalinidade, a temperatura da piscina ou do coletor, " +
      "se a bomba está ligada, ou pedir um resumo. " +
      "Também posso dosar cloro, ácido ou base, e mudar o modo para automático, manual ou parada. " +
      "O que deseja?";
    return h.responseBuilder.speak(fala).reprompt(fala).getResponse();
  },
};

const CancelStopHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === "IntentRequest" &&
      (Alexa.getIntentName(h.requestEnvelope) === "AMAZON.CancelIntent" ||
        Alexa.getIntentName(h.requestEnvelope) === "AMAZON.StopIntent")
    );
  },
  handle(h) {
    return h.responseBuilder.speak("Até logo!").withShouldEndSession(true).getResponse();
  },
};

const FallbackHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === "IntentRequest" &&
      Alexa.getIntentName(h.requestEnvelope) === "AMAZON.FallbackIntent"
    );
  },
  handle(h) {
    const fala =
      "Desculpe, não entendi. Você pode perguntar o pH, a temperatura, ou pedir para dosar cloro. " +
      "Diga ajuda para ouvir as opções.";
    return h.responseBuilder.speak(fala).reprompt(fala).getResponse();
  },
};

const SessionEndedHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === "SessionEndedRequest";
  },
  handle(h) {
    return h.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(h, error) {
    console.error("[AquaSense Alexa] erro:", error);
    return h.responseBuilder
      .speak("Ocorreu um erro ao falar com o sistema da piscina. Tente novamente.")
      .getResponse();
  },
};

// ============================================================================
//  EXPORT
// ============================================================================
exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    ConsultarParametroHandler,
    ConsultarTemperaturaHandler,
    ResumoHandler,
    StatusBombaHandler,
    DosarHandler,
    DefinirModoHandler,
    HelpHandler,
    CancelStopHandler,
    FallbackHandler,
    SessionEndedHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withCustomUserAgent("aquasense-iot/alexa/1.0")
  .lambda();
