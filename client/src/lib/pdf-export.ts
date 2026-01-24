import jsPDF from "jspdf";
import "jspdf-autotable";

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

interface PredictionResult {
  parties?: Array<{ party: string; voteShare?: number; seats?: number; trend?: string }>;
  candidates?: Array<{ name: string; party: string; projectedVoteShare?: number; electionProbability?: number }>;
  overallWinner?: string;
  confidence?: number;
}

interface ExportOptions {
  title: string;
  subtitle?: string;
  date?: string;
  type: "prediction" | "comparison" | "event" | "whatif";
  data: any;
  narrative?: string;
}

const TSE_BLUE = [0, 51, 102];
const TSE_GOLD = [255, 215, 0];

export function exportPredictionToPdf(options: ExportOptions): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPos = margin;

  doc.setFillColor(TSE_BLUE[0], TSE_BLUE[1], TSE_BLUE[2]);
  doc.rect(0, 0, pageWidth, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("SimulaVoto", margin, 20);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text("Sistema de Simulação Eleitoral", margin, 30);

  doc.setFillColor(TSE_GOLD[0], TSE_GOLD[1], TSE_GOLD[2]);
  doc.rect(0, 40, pageWidth, 3, "F");

  yPos = 55;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(options.title, margin, yPos);
  yPos += 8;

  if (options.subtitle) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(options.subtitle, margin, yPos);
    yPos += 6;
  }

  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text(`Gerado em: ${options.date || new Date().toLocaleString("pt-BR")}`, margin, yPos);
  yPos += 15;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos - 5, pageWidth - margin, yPos - 5);

  switch (options.type) {
    case "prediction":
      renderPredictionData(doc, options.data, margin, yPos, pageWidth);
      break;
    case "comparison":
      renderComparisonData(doc, options.data, margin, yPos, pageWidth);
      break;
    case "event":
      renderEventData(doc, options.data, margin, yPos, pageWidth);
      break;
    case "whatif":
      renderWhatIfData(doc, options.data, margin, yPos, pageWidth);
      break;
  }

  if (options.narrative) {
    const lastY = doc.lastAutoTable?.finalY || yPos + 80;
    renderNarrative(doc, options.narrative, margin, lastY + 15, pageWidth);
  }

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFillColor(TSE_BLUE[0], TSE_BLUE[1], TSE_BLUE[2]);
  doc.rect(0, pageHeight - 15, pageWidth, 15, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text("SimulaVoto - Análise Eleitoral Brasileira", pageWidth / 2, pageHeight - 6, { align: "center" });

  const filename = `${options.title.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

function renderPredictionData(doc: jsPDF, data: any, margin: number, yPos: number, pageWidth: number): void {
  if (data.results?.parties && data.results.parties.length > 0) {
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Projeção de Votos por Partido", margin, yPos);
    yPos += 8;

    const tableData = data.results.parties.map((p: any, i: number) => [
      i + 1,
      p.party,
      `${(p.voteShare || 0).toFixed(1)}%`,
      p.seats || "-",
      p.trend === "growing" ? "↑" : p.trend === "declining" ? "↓" : "-"
    ]);

    doc.autoTable({
      startY: yPos,
      head: [["#", "Partido", "% Votos", "Assentos", "Tendência"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: TSE_BLUE, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: margin, right: margin },
    });
  }

  if (data.confidence) {
    const lastY = doc.lastAutoTable?.finalY || yPos + 50;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`Nível de Confiança: ${(data.confidence * 100).toFixed(0)}%`, margin, lastY + 10);
  }
}

function renderComparisonData(doc: jsPDF, data: any, margin: number, yPos: number, pageWidth: number): void {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Comparação de Candidatos", margin, yPos);
  yPos += 8;

  if (data.results?.candidates && data.results.candidates.length > 0) {
    const tableData = data.results.candidates.map((c: any) => [
      c.name,
      c.party,
      `${(c.projectedVoteShare || 0).toFixed(1)}%`,
      `${((c.electionProbability || 0) * 100).toFixed(0)}%`,
      c.name === data.results.overallWinner ? "★" : ""
    ]);

    doc.autoTable({
      startY: yPos,
      head: [["Candidato", "Partido", "% Projetado", "Prob. Eleição", "Favorito"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: TSE_BLUE, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: margin, right: margin },
    });
  }

  if (data.results?.overallWinner) {
    const lastY = doc.lastAutoTable?.finalY || yPos + 50;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(TSE_BLUE[0], TSE_BLUE[1], TSE_BLUE[2]);
    doc.text(`Vencedor Projetado: ${data.results.overallWinner}`, margin, lastY + 10);
  }
}

function renderEventData(doc: jsPDF, data: any, margin: number, yPos: number, pageWidth: number): void {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Análise de Impacto de Evento", margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  
  const eventDesc = data.eventDescription || "Descrição não disponível";
  const splitDesc = doc.splitTextToSize(eventDesc, pageWidth - 2 * margin);
  doc.text(splitDesc, margin, yPos);
  yPos += splitDesc.length * 5 + 10;

  if (data.beforeProjection?.parties && data.afterProjection?.parties) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Comparação Antes/Depois", margin, yPos);
    yPos += 8;

    const beforeMap = new Map<string, number>(data.beforeProjection.parties.map((p: any) => [p.party, p.voteShare || 0]));
    const tableData = data.afterProjection.parties.slice(0, 8).map((p: any) => {
      const before: number = beforeMap.get(p.party) || 0;
      const after: number = p.voteShare || 0;
      const change: number = after - before;
      return [
        p.party,
        `${before.toFixed(1)}%`,
        `${after.toFixed(1)}%`,
        `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
        p.trend === "growing" ? "↑" : p.trend === "declining" ? "↓" : "-"
      ];
    });

    doc.autoTable({
      startY: yPos,
      head: [["Partido", "Antes", "Depois", "Variação", "Tendência"]],
      body: tableData,
      theme: "striped",
      headStyles: { fillColor: TSE_BLUE, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: margin, right: margin },
    });
  }
}

function renderWhatIfData(doc: jsPDF, data: any, margin: number, yPos: number, pageWidth: number): void {
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text('Simulação "E se...?"', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);

  if (data.parameters) {
    const params = data.parameters;
    if (params.candidateName && params.fromParty && params.toParty) {
      doc.text(`Cenário: ${params.candidateName} muda de ${params.fromParty} para ${params.toParty}`, margin, yPos);
      yPos += 8;
    }
  }

  if (data.impactAnalysis) {
    yPos += 5;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Impacto Geral: ${data.impactAnalysis.overallImpact || "N/A"}`, margin, yPos);
    yPos += 6;

    doc.setFont("helvetica", "normal");
    doc.text(`Confiança: ${((data.impactAnalysis.confidence || 0) * 100).toFixed(0)}%`, margin, yPos);
    yPos += 10;

    if (data.impactAnalysis.seatChanges && data.impactAnalysis.seatChanges.length > 0) {
      const tableData = data.impactAnalysis.seatChanges.map((c: any) => [
        c.party,
        c.before,
        c.after,
        `${c.change >= 0 ? "+" : ""}${c.change}`
      ]);

      doc.autoTable({
        startY: yPos,
        head: [["Partido", "Antes", "Depois", "Variação"]],
        body: tableData,
        theme: "striped",
        headStyles: { fillColor: TSE_BLUE, textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { left: margin, right: margin },
      });
    }
  }
}

function renderNarrative(doc: jsPDF, narrative: string, margin: number, yPos: number, pageWidth: number): void {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(TSE_BLUE[0], TSE_BLUE[1], TSE_BLUE[2]);
  doc.text("Análise de IA", margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(60, 60, 60);
  
  const splitNarrative = doc.splitTextToSize(narrative, pageWidth - 2 * margin);
  doc.text(splitNarrative, margin, yPos);
}

export function exportMultiplePredictionsToPdf(predictions: ExportOptions[]): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;

  doc.setFillColor(TSE_BLUE[0], TSE_BLUE[1], TSE_BLUE[2]);
  doc.rect(0, 0, pageWidth, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("SimulaVoto - Relatório Consolidado", margin, 25);
  doc.setFillColor(TSE_GOLD[0], TSE_GOLD[1], TSE_GOLD[2]);
  doc.rect(0, 40, pageWidth, 3, "F");

  let yPos = 55;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, yPos);
  doc.text(`Total de previsões: ${predictions.length}`, margin, yPos + 6);

  predictions.forEach((prediction, index) => {
    doc.addPage();
    let y = 20;
    
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(TSE_BLUE[0], TSE_BLUE[1], TSE_BLUE[2]);
    doc.text(`${index + 1}. ${prediction.title}`, margin, y);
    y += 10;

    if (prediction.subtitle) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(prediction.subtitle, margin, y);
      y += 8;
    }

    switch (prediction.type) {
      case "prediction":
        renderPredictionData(doc, prediction.data, margin, y, pageWidth);
        break;
      case "comparison":
        renderComparisonData(doc, prediction.data, margin, y, pageWidth);
        break;
      case "event":
        renderEventData(doc, prediction.data, margin, y, pageWidth);
        break;
      case "whatif":
        renderWhatIfData(doc, prediction.data, margin, y, pageWidth);
        break;
    }

    if (prediction.narrative) {
      const lastY = doc.lastAutoTable?.finalY || y + 80;
      renderNarrative(doc, prediction.narrative, margin, lastY + 15, pageWidth);
    }
  });

  const filename = `simulavoto_relatorio_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}