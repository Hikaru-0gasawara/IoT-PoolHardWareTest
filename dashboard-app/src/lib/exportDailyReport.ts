// Geração client-side do "Resumo diário — Cloro e Alcalinidade".
//
// Roda no browser (clique do usuário), lendo o estado ao vivo do poolStore.
// Desenha tudo com primitivas do jsPDF (sem html2canvas) para um PDF leve e
// determinístico: cartões de resumo, status de alertas, gráficos de histórico
// das últimas leituras e o log de eventos de Cloro.

import { jsPDF, GState } from "jspdf";
import { usePoolStore } from "@/store/poolStore";
import { THRESHOLDS, statusFor, statusLabel } from "@/lib/thresholds";
import { MQTT_NAMESPACE } from "@/lib/mqttTopics";
import type { ChemEvent, SensorPoint, StatusLevel, ParameterKey } from "@/types/aquasense";

// Versão do protocolo MQTT que o dashboard fala (firmware ESP32 AquaSense).
const PROTOCOL_VERSION = "v3.1 (protocolo PT)";

// Paleta (aproximação RGB dos tokens do tema) — jsPDF não entende oklch.
const INK: [number, number, number] = [24, 32, 40];
const MUTED: [number, number, number] = [110, 122, 134];
const LINE: [number, number, number] = [222, 228, 233];
const ACCENT: [number, number, number] = [14, 116, 144];
const OK: [number, number, number] = [34, 160, 110];
const WARN: [number, number, number] = [205, 145, 30];
const CRIT: [number, number, number] = [206, 65, 60];

function statusRGB(s: StatusLevel): [number, number, number] {
  return s === "crit" ? CRIT : s === "warn" ? WARN : OK;
}

function fmt(key: ParameterKey, v: number): string {
  const d = key === "ph" ? 2 : key === "cloro" ? 1 : 0;
  return v.toFixed(d);
}

function relTime(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `há ${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m}min`;
  return `há ${Math.round(m / 60)}h`;
}

// Duração legível (ex.: "2h 13min", "8min", "45s") a partir de um intervalo em ms.
function durationText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${sec}s`;
  return `${sec}s`;
}

// Timestamp curto HH:MM:SS para os carimbos de leitura.
function clockText(t: number): string {
  return new Date(t).toLocaleTimeString("pt-BR");
}


// Desenha um mini gráfico de linha de uma série dentro de uma caixa.
function drawChart(
  doc: jsPDF,
  series: number[],
  box: { x: number; y: number; w: number; h: number },
  color: [number, number, number],
  band?: { min: number; max: number; lo: number; hi: number },
) {
  const { x, y, w, h } = box;
  // moldura
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);

  const clean = series.filter((v) => Number.isFinite(v) && v > -990);
  if (clean.length < 2) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(9);
    doc.text("Sem dados suficientes", x + w / 2, y + h / 2, { align: "center" });
    return;
  }

  const min = Math.min(...clean, band?.lo ?? Infinity);
  const max = Math.max(...clean, band?.hi ?? -Infinity);
  const span = max - min || 1;
  const toX = (i: number) => x + (i / (clean.length - 1)) * w;
  const toY = (v: number) => y + h - ((v - min) / span) * h;

  // faixa ideal sombreada
  if (band) {
    const yTop = toY(band.max);
    const yBot = toY(band.min);
    doc.setFillColor(OK[0], OK[1], OK[2]);
    doc.setGState(new GState({ opacity: 0.12 }));
    doc.rect(x, yTop, w, yBot - yTop, "F");
    doc.setGState(new GState({ opacity: 1 }));
  }

  // linha
  doc.setDrawColor(...color);
  doc.setLineWidth(0.7);
  for (let i = 1; i < clean.length; i++) {
    doc.line(toX(i - 1), toY(clean[i - 1]), toX(i), toY(clean[i]));
  }
}

function describeEvent(e: ChemEvent): string {
  if (e.tipo === "entrou_faixa") return "Cloro voltou à faixa ideal";
  return e.direcao === "baixo"
    ? "Cloro abaixo de 1.0 ppm (desinfecção insuficiente)"
    : "Cloro acima de 3.0 ppm (excesso de cloro)";
}

export function exportDailyReport() {
  const s = usePoolStore.getState();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 16;
  let yPos = 0;

  // ── Cabeçalho ──────────────────────────────────────────────
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("AquaSense IoT", M, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Resumo diário — Cloro e Alcalinidade", M, 22);
  const now = new Date();
  doc.setFontSize(9);
  doc.text(now.toLocaleString("pt-BR"), W - M, 22, { align: "right" });

  // ── Metadados (protocolo + carimbos de leitura) ────────────
  const lastUpdate = s.ultima_atualizacao_t;
  const lastHistPoint = s.history.length ? s.history[s.history.length - 1].t : lastUpdate;
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `Protocolo ${PROTOCOL_VERSION} · namespace ${MQTT_NAMESPACE} · firmware ${s.firmware}`,
    M,
    38,
  );
  doc.text(
    `Última leitura: ${clockText(lastUpdate)} (${relTime(lastUpdate)}) · último ponto do histórico: ${clockText(lastHistPoint)}`,
    M,
    43,
  );
  yPos = 52;


  // ── Cartões de resumo ──────────────────────────────────────
  const cardW = (W - M * 2 - 8) / 2;
  const cardH = 30;
  const params: ParameterKey[] = ["cloro", "alcalinidade"];
  params.forEach((key, i) => {
    const t = THRESHOLDS[key];
    const value = s[key] as number;
    const status = statusFor(key, value);
    const rgb = statusRGB(status);
    const cx = M + i * (cardW + 8);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.4);
    doc.roundedRect(cx, yPos, cardW, cardH, 2, 2);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(t.label.toUpperCase(), cx + 5, yPos + 7);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(`${fmt(key, value)} ${t.unit}`, cx + 5, yPos + 18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Faixa ideal ${t.idealMin}–${t.idealMax} ${t.unit}`, cx + 5, yPos + 25);
    // pílula de status
    doc.setFillColor(...rgb);
    doc.roundedRect(cx + cardW - 38, yPos + 5, 33, 6, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.text(statusLabel(status), cx + cardW - 21.5, yPos + 9, { align: "center" });
  });
  yPos += cardH + 12;

  // ── Alertas ativos (severidade + duração fora da faixa) ────
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Alertas ativos — Cloro e Alcalinidade", M, yPos);
  yPos += 7;

  const ativos = s.alerts.filter(
    (a) =>
      !a.id.startsWith("shadow:") &&
      a.status === "ativo" &&
      (a.parametro === "cloro" || a.parametro === "alcalinidade"),
  );

  if (ativos.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...OK);
    doc.text("● Nenhum alerta ativo — cloro e alcalinidade dentro das faixas ideais.", M, yPos);
    yPos += 10;
  } else {
    // Cabeçalho da tabela
    const cols = { param: M, sev: M + 46, dur: M + 86, val: M + 130 };
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("PARÂMETRO", cols.param, yPos);
    doc.text("SEVERIDADE", cols.sev, yPos);
    doc.text("FORA DA FAIXA", cols.dur, yPos);
    doc.text("VALOR / IDEAL", cols.val, yPos);
    yPos += 2;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(M, yPos, W - M, yPos);
    yPos += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    ativos.forEach((a) => {
      if (yPos > 250) { doc.addPage(); yPos = 20; }
      const rgb = statusRGB(a.severity);
      const t = THRESHOLDS[a.parametro];
      // bolinha + parâmetro
      doc.setTextColor(...rgb);
      doc.text("●", cols.param, yPos);
      doc.setTextColor(...INK);
      doc.text(t.label, cols.param + 5, yPos);
      // severidade (com ack se houver)
      const sevTxt = (a.severity === "crit" ? "Crítico" : "Atenção") + (a.ack_em ? " (reconhecido)" : "");
      doc.setTextColor(...rgb);
      doc.text(sevTxt, cols.sev, yPos);
      // duração fora da faixa
      doc.setTextColor(...INK);
      doc.text(durationText(Date.now() - a.iniciado_em), cols.dur, yPos);
      // valor atual / faixa ideal
      doc.setTextColor(...MUTED);
      doc.text(
        `${fmt(a.parametro, a.valor_atual)} / ${t.idealMin}–${t.idealMax} ${t.unit}`,
        cols.val,
        yPos,
      );
      yPos += 7;
    });
    yPos += 3;
  }


  // ── Gráficos de histórico ──────────────────────────────────
  yPos += 4;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Histórico recente", M, yPos);
  yPos += 6;

  const hist: SensorPoint[] = s.history.slice(-96);
  const chartW = (W - M * 2 - 8) / 2;
  const chartH = 34;
  params.forEach((key, i) => {
    const t = THRESHOLDS[key];
    const cx = M + i * (chartW + 8);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`${t.label} (${t.unit})`, cx, yPos);
    drawChart(
      doc,
      hist.map((p) => p[key] as number),
      { x: cx, y: yPos + 2, w: chartW, h: chartH },
      key === "cloro" ? ACCENT : [120, 90, 180],
      { min: t.idealMin, max: t.idealMax, lo: t.rangeMin, hi: t.idealMax * 1.2 },
    );
  });
  yPos += chartH + 14;

  // ── Eventos de Cloro ───────────────────────────────────────
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Eventos de Cloro (faixa 1.0–3.0 ppm)", M, yPos);
  yPos += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  if (s.cloroEvents.length === 0) {
    doc.setTextColor(...MUTED);
    doc.text("Nenhum cruzamento de faixa registrado nesta sessão.", M, yPos + 4);
    yPos += 8;
  } else {
    s.cloroEvents.slice(0, 16).forEach((e) => {
      if (yPos > 275) { doc.addPage(); yPos = 20; }
      const rgb = e.tipo === "entrou_faixa" ? OK : statusRGB(e.severity);
      doc.setTextColor(...rgb);
      doc.text("●", M, yPos + 4);
      doc.setTextColor(...INK);
      doc.text(`${describeEvent(e)} — ${e.valor.toFixed(1)} ppm · ${relTime(e.t)}`, M + 5, yPos + 4);
      yPos += 6.5;
    });
  }

  // ── Rodapé ─────────────────────────────────────────────────
  doc.setTextColor(...MUTED);
  doc.setFontSize(7.5);
  doc.text(
    "AquaSense IoT · IBMEC São Paulo / Invivio Tecnologia · gerado pelo dashboard",
    W / 2,
    doc.internal.pageSize.getHeight() - 8,
    { align: "center" },
  );

  // Nome do arquivo baseado na data/hora da geração: YYYY-MM-DD_HH-MM-SS.
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  doc.save(`aquasense-resumo-cloro-alcalinidade_${stamp}.pdf`);
}

