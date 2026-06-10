import { Cpu, Wifi, Radio, Users } from "lucide-react";
import { usePoolStore } from "@/store/poolStore";
import { useConnection } from "@/hooks/useAquaSense";
import { useNow } from "@/hooks/useNow";
import { describeMqttStatus, formatAge, toneToColor } from "@/lib/mqttStatus";
import { MQTT_NAMESPACE, PUBLISHED_TOPICS } from "@/lib/mqttTopics";
import { THRESHOLDS } from "@/lib/thresholds";

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export function SettingsPanel() {
  const uptime = usePoolStore((s) => s.uptime_s);
  const fw = usePoolStore((s) => s.firmware);
  const conn = useConnection();
  const now = useNow(2000);
  const view = describeMqttStatus(conn.status, conn.source, conn.lastMessageAt, now);
  const lastMsgLabel =
    conn.lastMessageAt == null
      ? "—"
      : now - conn.lastMessageAt < 10_000
        ? "agora mesmo"
        : formatAge(now - conn.lastMessageAt);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card title="Hardware" icon={<Cpu className="h-4 w-4" />}>
        <Row k="Microcontrolador" v="ESP32 DevKit V1 (Wi-Fi)" />
        <Row k="Sensor de pH" v="E-201-C + módulo PH-4502C" />
        <Row k="Sensor de cloro" v="Eletrodo ORP industrial" />
        <Row k="Sensor de alcalinidade" v="Sonda de condutividade" />
        <Row k="Temp. da piscina" v="Sensor submerso digital" />
        <Row k="Temp. do coletor solar" v="Sensor submerso digital" />
        <Row k="Display local" v="LCD 20×4 I²C" />
        <Row k="Atuador bomba" v="Relé 1CV 220V opto-isolado" />
      </Card>

      <Card title="Conexão MQTT" icon={<Radio className="h-4 w-4" />}>
        <Row k="Status" v={view.label} valColor={toneToColor(view.tone)} />
        {view.sublabel && (
          <div
            className="-mt-1 flex justify-end text-[10px]"
            style={{ color: toneToColor(view.tone) }}
          >
            {view.sublabel}
          </div>
        )}
        <Row k="Última mensagem" v={lastMsgLabel} />
        <Row
          k="Firmware (LWT)"
          v={conn.firmwareOnline == null ? "—" : conn.firmwareOnline ? "online" : "offline"}
          valColor={
            conn.firmwareOnline == null
              ? undefined
              : toneToColor(conn.firmwareOnline ? "ok" : "crit")
          }
        />
        <Row k="Broker" v="broker.hivemq.com" />
        <Row k="Namespace" v={`${MQTT_NAMESPACE}/`} />
        <Row k="Ciclo de publicação" v="5 s" />
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-aqua-text-muted">
            Tópicos publicados
          </div>
          <ul className="mt-1 space-y-0.5">
            {PUBLISHED_TOPICS.map((t) => (
              <li key={t} className="font-tabular text-[11px] text-aqua-accent">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card title="Sistema" icon={<Wifi className="h-4 w-4" />}>
        <Row k="Firmware" v={fw} />
        <Row k="Uptime" v={formatUptime(uptime)} />
        <Row k="Faixa ideal pH" v={`${THRESHOLDS.ph.idealMin} – ${THRESHOLDS.ph.idealMax}`} />
        <Row
          k="Faixa ideal cloro"
          v={`${THRESHOLDS.cloro.idealMin} – ${THRESHOLDS.cloro.idealMax} ppm`}
        />
        <Row
          k="Faixa ideal alcalinidade"
          v={`${THRESHOLDS.alcalinidade.idealMin} – ${THRESHOLDS.alcalinidade.idealMax} ppm`}
        />
        <Row
          k="Faixa ideal temperatura"
          v={`${THRESHOLDS.temp_piscina.idealMin} – ${THRESHOLDS.temp_piscina.idealMax} °C`}
        />
        <Row k="Histerese da bomba" v="Liga ΔT ≥ 5°C · desliga ≤ 1°C" />
        <Row k="Anti-cycling" v="60 segundos" />
        <p className="mt-2 text-[11px] text-aqua-text-muted">
          A calibração dos sensores e o controle da bomba são executados pelo firmware embarcado.
        </p>
      </Card>

      <Card title="Equipe" icon={<Users className="h-4 w-4" />}>
        <Row k="Instituição" v="IBMEC São Paulo" />
        <Row k="Disciplina" v="Sistemas Embarcados" />
        <Row k="Professor" v="Marcel Stefan Wagner, PhD" />
        <Row k="Empresa parceira" v="Invivio Tecnologia Ltda." />
        <div className="mt-3 space-y-1.5 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-aqua-text-muted">
              Grupo 1 — Controle de aquecimento
            </div>
            <div className="text-aqua-text">Martim Roxo · Vitor Yoshida</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-aqua-text-muted">
              Grupo 2 — Medição de água
            </div>
            <div className="text-aqua-text">João Perestrelo · Hikaru · Roan</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-aqua-border bg-aqua-surface p-5">
      <div className="mb-3 flex items-center gap-2 text-aqua-accent">
        {icon}
        <h3 className="text-sm font-semibold uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-1.5 text-xs">{children}</div>
    </div>
  );
}

function Row({ k, v, valColor }: { k: string; v: string; valColor?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-aqua-text-muted">{k}</span>
      <span
        className="font-tabular text-right text-aqua-text"
        style={valColor ? { color: valColor } : undefined}
      >
        {v}
      </span>
    </div>
  );
}
