const express = require("express");
const bodyParser = require("body-parser");
const { ExpressAdapter } = require("ask-sdk-express-adapter");
const Alexa = require("ask-sdk-core");

const MENU = {
  "carne": 15,
    "queijo": 12,
      "frango": 14,
        "calabresa": 16,
          "pizza": 17,
            "baiana": 18,
              "chocolate": 12,
                "banana com doce de leite": 14
                };

                function calcularPedido(texto) {
                  let total = 0;
                    let detalhes = [];

                      const regex = /(\d+)\s*([a-zA-Zà-ú\s]+)/g;
                        let match;

                          while ((match = regex.exec(texto)) !== null) {
                              let quantidade = parseInt(match[1]);
                                  let sabor = match[2].trim().toLowerCase();

                                      if (MENU[sabor]) {
                                            let subtotal = quantidade * MENU[sabor];
                                                  total += subtotal;
                                                        detalhes.push(`${quantidade} ${sabor} = ${subtotal} reais`);
                                                            }
                                                              }

                                                                return {
                                                                    total,
                                                                        detalhes
                                                                          };
                                                                          }

                                                                          const CalculateOrderIntentHandler = {
                                                                            canHandle(handlerInput) {
                                                                                return handlerInput.requestEnvelope.request.type === 'IntentRequest'
                                                                                      && handlerInput.requestEnvelope.request.intent.name === 'CalculateOrderIntent';
                                                                                        },

                                                                                          handle(handlerInput) {
                                                                                              const pedido = handlerInput.requestEnvelope.request.intent.slots.OrderList.value || "";
                                                                                                  const resultado = calcularPedido(pedido);

                                                                                                      if (resultado.total === 0) {
                                                                                                            return handlerInput.responseBuilder
                                                                                                                    .speak("Não consegui identificar os sabores ou quantidades. Por favor, diga novamente.")
                                                                                                                            .getResponse();
                                                                                                                                }

                                                                                                                                    const detalhes = resultado.detalhes.join(", ");

                                                                                                                                        return handlerInput.responseBuilder
                                                                                                                                              .speak(`O total do pedido é ${resultado.total} reais. ${detalhes}.`)
                                                                                                                                                    .getResponse();
                                                                                                                                                      }
                                                                                                                                                      };

                                                                                                                                                      const app = express();
                                                                                                                                                      app.use(bodyParser.json());

                                                                                                                                                      const skillBuilder = Alexa.SkillBuilders.custom();
                                                                                                                                                      const skill = skillBuilder
                                                                                                                                                        .addRequestHandlers(CalculateOrderIntentHandler)
                                                                                                                                                          .create();

                                                                                                                                                          const adapter = new ExpressAdapter(skill, false, false);

                                                                                                                                                          app.post("/", adapter.getRequestHandlers());

                                                                                                                                                          app.get("/", (req, res) => {
                                                                                                                                                            res.send("Alexa skill online");
                                                                                                                                                            });

                                                                                                                                                            const PORT = process.env.PORT || 3000;
                                                                                                                                                            app.listen(PORT, () => console.log("Servidor Alexa rodando"));