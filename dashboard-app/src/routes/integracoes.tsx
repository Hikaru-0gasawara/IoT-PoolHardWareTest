import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/integracoes")({
  beforeLoad: () => {
    throw redirect({
      to: "/config",
      search: { tab: "integracoes" },
    });
  },
  head: () => ({
    meta: [
      { title: "Integrações — AquaSense IoT" },
      {
        name: "description",
        content:
          "Integração por voz com a Alexa: comandos para consultar telemetria da piscina e enviar dosagem/modo via MQTT.",
      },
      { property: "og:title", content: "Integrações — AquaSense IoT" },
      {
        property: "og:description",
        content:
          "Comandos de voz da skill Alexa do AquaSense: pH, cloro, temperatura, bomba, resumo, dosagem e modo.",
      },
    ],
  }),
});
