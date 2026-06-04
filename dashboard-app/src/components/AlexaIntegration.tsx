import { Mic, Search, Beaker, SlidersHorizontal, MessageSquareQuote, Settings } from "lucide-react";

interface Cmd {
  fala: string;
  resposta: string;
}

interface Grupo {
  titulo: string;
  icon: typeof Search;
  intent: string;
  comandos: Cmd[];
}

// Espelha os handlers da skill (index.js) — consulta lê o tópico retido
// ".../dados"; dosagem/modo publicam em ".../dosagem/comando" e ".../controle/modo".
const GRUPOS: Grupo[] = [
  {
    titulo: "Consultar parâmetros",
    icon: Search,
    intent: "ConsultarParametroIntent · ConsultarTemperaturaIntent",
    comandos: [
      { fala: "Alexa, pergunte ao monitor da piscina qual o pH", resposta: "Informa o pH e se está dentro da faixa ABNT (7,2–7,6)." },
      { fala: "…quanto está o cloro", resposta: "Cloro em ppm, faixa ideal 1,0–3,0." },
      { fala: "…qual a alcalinidade", resposta: "Alcalinidade em ppm, faixa ideal 80–120." },
      { fala: "…qual a temperatura da piscina", resposta: "Temperatura da piscina, do coletor e o ΔT." },
    ],
  },
  {
    titulo: "Status e resumo",
    icon: MessageSquareQuote,
    intent: "ResumoIntent · StatusBombaIntent",
    comandos: [
      { fala: "Alexa, peça ao monitor da piscina um resumo", resposta: "pH, cloro, alcalinidade, temperatura, bomba e alertas ativos." },
      { fala: "…a bomba está ligada?", resposta: "Estado da bomba do coletor e o ΔT atual." },
    ],
  },
  {
    titulo: "Dosagem",
    icon: Beaker,
    intent: "DosarIntent → dosagem/comando",
    comandos: [
      { fala: "Alexa, peça ao monitor da piscina para dosar cloro", resposta: "Confirma e publica o comando de dosagem (cloro, ácido ou base)." },
    ],
  },
  {
    titulo: "Modo de operação",
    icon: SlidersHorizontal,
    intent: "DefinirModoIntent → controle/modo",
    comandos: [
      { fala: "Alexa, peça ao monitor da piscina para ativar o modo automático", resposta: "Altera o modo: automático, manual ou parada de emergência." },
    ],
  },
];

export function AlexaIntegration() {
  return (
    <div className="space-y-6">
      {/* Visão geral */}
      <section className="rounded-2xl border border-aqua-border bg-aqua-surface p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-aqua-primary to-aqua-accent shadow-glow-accent">
            <Mic className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="font-semibold text-aqua-text">Skill Alexa “monitor da piscina”</h2>
            <p className="mt-1 text-sm text-aqua-text-muted">
              A skill (pt-BR) usa a mesma ponte MQTT do painel: lê o snapshot retido em{" "}
              <code className="rounded bg-aqua-surface-2 px-1 py-0.5 text-xs text-aqua-text">.../dados</code> para
              consultas e publica em{" "}
              <code className="rounded bg-aqua-surface-2 px-1 py-0.5 text-xs text-aqua-text">.../dosagem/comando</code> e{" "}
              <code className="rounded bg-aqua-surface-2 px-1 py-0.5 text-xs text-aqua-text">.../controle/modo</code> para
              comandos. Faixas e sentinela de erro de sensor são idênticas às do dashboard.
            </p>
            <p className="mt-2 text-xs text-aqua-text-muted">
              Invocação: <span className="font-medium text-aqua-text">“abrir monitor da piscina”</span>.
            </p>
          </div>
        </div>
      </section>

      {/* Configuração da skill */}
      <section className="rounded-2xl border border-aqua-border bg-aqua-surface p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-aqua-surface-2 text-aqua-accent">
            <Settings className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold text-aqua-text">Configuração da skill (config.js)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-aqua-border text-xs text-aqua-text-muted uppercase tracking-wider">
                <th className="py-2 pr-4 font-medium">Variável</th>
                <th className="py-2 pr-4 font-medium">Padrão</th>
                <th className="py-2 font-medium">Descrição</th>
              </tr>
            </thead>
            <tbody className="text-aqua-text">
              <tr className="border-b border-aqua-border/50">
                <td className="py-2 pr-4 font-mono text-xs">MQTT_URL</td>
                <td className="py-2 pr-4 font-mono text-xs text-aqua-text-muted">wss://broker.hivemq.com:8884/mqtt</td>
                <td className="py-2 text-xs text-aqua-text-muted">URL do broker MQTT (WebSocket)</td>
              </tr>
              <tr className="border-b border-aqua-border/50">
                <td className="py-2 pr-4 font-mono text-xs">MQTT_USERNAME</td>
                <td className="py-2 pr-4 font-mono text-xs text-aqua-text-muted">—</td>
                <td className="py-2 text-xs text-aqua-text-muted">Usuário para autenticação no broker</td>
              </tr>
              <tr className="border-b border-aqua-border/50">
                <td className="py-2 pr-4 font-mono text-xs">MQTT_PASSWORD</td>
                <td className="py-2 pr-4 font-mono text-xs text-aqua-text-muted">—</td>
                <td className="py-2 text-xs text-aqua-text-muted">Senha para autenticação no broker</td>
              </tr>
              <tr className="border-b border-aqua-border/50">
                <td className="py-2 pr-4 font-mono text-xs">NAMESPACE</td>
                <td className="py-2 pr-4 font-mono text-xs text-aqua-text-muted">aquasense-ibmec-pt</td>
                <td className="py-2 text-xs text-aqua-text-muted">Prefixo dos tópicos MQTT</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">TIMEOUT_MS</td>
                <td className="py-2 pr-4 font-mono text-xs text-aqua-text-muted">4500</td>
                <td className="py-2 text-xs text-aqua-text-muted">Timeout de conexão/operação (ms)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Comandos */}
      <div className="grid gap-4 md:grid-cols-2">
        {GRUPOS.map((g) => {
          const Icon = g.icon;
          return (
            <section key={g.titulo} className="rounded-2xl border border-aqua-border bg-aqua-surface p-5">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-aqua-surface-2 text-aqua-accent">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-aqua-text">{g.titulo}</h3>
                  <p className="text-[11px] font-tabular text-aqua-text-muted">{g.intent}</p>
                </div>
              </div>
              <ul className="space-y-3">
                {g.comandos.map((c) => (
                  <li key={c.fala} className="rounded-lg border border-aqua-border bg-aqua-bg/40 p-3">
                    <p className="text-sm font-medium text-aqua-text">“{c.fala}”</p>
                    <p className="mt-1 text-xs text-aqua-text-muted">{c.resposta}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
