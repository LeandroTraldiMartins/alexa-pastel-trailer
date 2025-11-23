// index.js
const express = require("express");
const bodyParser = require("body-parser");
const { ExpressAdapter } = require("ask-sdk-express-adapter");
const Alexa = require("ask-sdk-core");

/**
 * Cardápio completo — chaves em formato "normalizado".
 * Valores em reais (inteiros).
 */
const MENU = {
  // salgados (converti nomes para forma simples)
  "carne": 15,
  "carne e queijo": 17,
  "carne e ovo": 16,
  "carne e catupiry": 17,
  "carne e cheddar": 17,
  "queijo": 16,
  "queijo e catupiry": 17,
  "queijo catupiry e cheddar": 18,
  "pizza": 16,
  "bauru": 16,
  "frango e catupiry": 17,
  "frango catupiry e milho": 17,
  "calabresa e queijo": 17,
  "calabresa queijo e catupiry": 18,
  "palmito": 15,
  "moda da casa": 20,
  "frango milho cheddar e tomate": 16,
  "palmito e queijo": 17,
  "atum e queijo": 19,
  "carne seca queijo tomate cebola e milho": 20,
  "especial de carne": 20,
  "especial de frango": 20,
  // doces
  "chocolate": 15,
  "chocolate com banana": 16,
  "prestigio": 16,
  "romeu e julieta": 15,
  "banana com canela": 14,
  "banana com doce de leite": 16,
  "nutella morango e ninho": 20,
  "chocolate branco": 15,
  "chocolate mesclado": 17,
  "goiabada": 14,
  // outros
  "pastel de vento": 7,
  "churros": 7
};

/* Precompute keys normalizados */
const MENU_KEYS = Object.keys(MENU);

/* Normaliza string: remove acentos, pontuação extra, coloca em minúsculas */
function normalize(s) {
  if (!s) return "";
  s = s.toString();
  // remover acentos simples
  const accents = [
    /[ÁÀÂÃÄ]/g, /[áàâãä]/g,
    /[ÉÈÊË]/g, /[éèêë]/g,
    /[ÍÌÎÏ]/g, /[íìîï]/g,
    /[ÓÒÔÕÖ]/g, /[óòôõö]/g,
    /[ÚÙÛÜ]/g, /[úùûü]/g,
    /[Ç]/g, /[ç]/g
  ];
  const repl = ['A','a','E','e','I','i','O','o','U','u','C','c'];
  for (let i=0;i<accents.length;i++) s = s.replace(accents[i], repl[i]);
  s = s.toLowerCase();
  // substituir palavras que podem variar
  s = s.replace(/\bcom\b/g, ' e ');
  // remover caracteres indesejados
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/* Tenta achar a melhor chave do menu a partir de um texto livre */
function findMenuKey(raw) {
  const n = normalize(raw);
  if (!n) return null;
  // checar igualdade direta
  for (let k of MENU_KEYS) if (normalize(k) === n) return k;
  // procurar por inclusão (preferir chave mais longa)
  const candidates = MENU_KEYS.filter(k => n.includes(normalize(k)) || normalize(k).includes(n));
  if (candidates.length === 0) {
    // tentar remover palavras comuns e testar
    const cleaned = n.replace(/\b(de|do|da|dos|das|o|a|os|as)\b/g,'').replace(/\s+/g,' ').trim();
    for (let k of MENU_KEYS) if (normalize(k).includes(cleaned) || cleaned.includes(normalize(k))) return k;
    return null;
  }
  candidates.sort((a,b) => normalize(b).length - normalize(a).length);
  return candidates[0];
}

/* Parse do texto do pedido; reconhece tokens separados por ' e ' ',' 'mais' ou apenas espaço
   reconhece quantidades no formato: "2 carne", "3x carne", "1 carne e queijo", ou "carne" (assume 1)
*/
function parseOrderText(text) {
  const normalized = normalize(text);
  if (!normalized) return { items: [], unknown: [] };

  // dividir por conjunções comuns e vírgulas
  const parts = normalized.split(/\s+(?:e|mais|,|\+)\s+/).map(p => p.trim()).filter(Boolean);
  const items = [];
  const unknown = [];

  for (let p of parts) {
    let qty = 1;
    let name = p;

    // tentar capturar "2x sabor" ou "2 sabor"
    let m = p.match(/^(\d+)\s*x?\s*(.+)$/);
    if (m) {
      qty = parseInt(m[1], 10) || 1;
      name = m[2].trim();
    } else {
      // também tentar final como "sabor 2" (raro)
      m = p.match(/^(.+?)\s+(\d+)$/);
      if (m) {
        name = m[1].trim();
        qty = parseInt(m[2], 10) || 1;
      }
    }

    const key = findMenuKey(name);
    if (key) {
      items.push({ key, qty, unitPrice: MENU[key] });
    } else {
      // tentar combinar todo o part original (sem divisão) como fallback
      const fallback = findMenuKey(p);
      if (fallback) {
        items.push({ key: fallback, qty, unitPrice: MENU[fallback] });
      } else {
        unknown.push(p);
      }
    }
  }

  return { items, unknown };
}

/* Monta resposta formal detalhando subtotal e total */
function buildResponse(items, unknown) {
  if (items.length === 0 && unknown.length > 0) {
    return `Não encontrei nenhum sabor válido no pedido. Por favor, diga os sabores do cardápio.`;
  }
  if (items.length === 0) {
    return `Não identifiquei itens no pedido. Pode repetir, por favor?`;
  }

  let total = 0;
  const breakdown = [];
  for (const it of items) {
    const sub = it.unitPrice * it.qty;
    total += sub;
    breakdown.push(`${it.qty} ${it.key} = ${sub} reais`);
  }

  let resp = `O total do pedido é ${total} reais. (${breakdown.join(', ')}).`;
  if (unknown.length > 0) {
    resp += ` Não encontrei: ${unknown.join(', ')}.`;
  }
  return resp;
}

/* --- Handlers Alexa --- */
const CalculateOrderIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'CalculateOrderIntent';
  },
  handle(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots || {};
    const orderText = (slots.OrderList && slots.OrderList.value) ? slots.OrderList.value : '';
    const parsed = parseOrderText(orderText);
    const response = buildResponse(parsed.items, parsed.unknown);
    return handlerInput.responseBuilder
      .speak(response)
      .reprompt('Deseja confirmar o pedido ou perguntar outro valor?')
      .getResponse();
  }
};

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speak = 'Bem-vindo ao cardápio do trailer. Pergunte por um pedido, por exemplo: quanto fica 2 carne e 1 queijo?';
    return handlerInput.responseBuilder
      .speak(speak)
      .reprompt('Como posso ajudar com o pedido?')
      .getResponse();
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speak = 'Você pode dizer: quanto fica 2 carne e 1 pizza? Eu vou somar usando o cardápio.';
    return handlerInput.responseBuilder
      .speak(speak)
      .reprompt('Como posso ajudar?')
      .getResponse();
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent'
        || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent');
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Tudo bem. Até mais.')
      .getResponse();
  }
};

const FallbackHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder
      .speak('Desculpe, não entendi. Pergunte quanto fica um pedido, por exemplo: quanto fica 2 carne e 1 queijo?')
      .reprompt('Pode repetir, por favor?')
      .getResponse();
  }
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(handlerInput, error) {
    console.error('Erro:', error);
    return handlerInput.responseBuilder
      .speak('Desculpe, ocorreu um erro ao processar seu pedido. Tente novamente.')
      .getResponse();
  }
};

/* --- monta skill e expõe via express --- */
const skillBuilder = Alexa.SkillBuilders.custom();
const skill = skillBuilder
  .addRequestHandlers(
    LaunchRequestHandler,
    CalculateOrderIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackHandler
  )
  .addErrorHandlers(ErrorHandler)
  .create();

const adapter = new ExpressAdapter(skill, false, false);

const app = express();
app.use(bodyParser.json());
app.post("/", adapter.getRequestHandlers());
app.get("/", (req, res) => res.send("Alexa skill online"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
