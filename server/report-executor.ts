import { storage } from "./storage";
import type { ReportTemplate } from "@shared/schema";

export async function executeReportRun(runId: number, template: ReportTemplate, recipients: string[]): Promise<void> {
  const startTime = Date.now();
  
  try {
    await storage.updateReportRun(runId, { status: "running", startedAt: new Date() });
    
    const filters = template.filters as Record<string, any> || {};
    let data: any[] = [];
    let filename = `report_${template.reportType}_${Date.now()}`;
    
    switch (template.reportType) {
      case "candidates": {
        const result = await storage.getAdvancedAnalytics({
          year: filters.year,
          uf: filters.state || filters.uf,
          electionType: filters.electionType,
          position: filters.position,
          party: filters.party,
          limit: 10000,
        });
        data = result.candidates || [];
        filename = `candidatos_${filters.year || "todos"}_${filters.uf || "brasil"}`;
        break;
      }
      case "parties":
        data = await storage.getVotesByParty({
          year: filters.year,
          uf: filters.state || filters.uf,
          electionType: filters.electionType,
        });
        filename = `partidos_${filters.year || "todos"}_${filters.uf || "brasil"}`;
        break;
      case "voting_details": {
        const result = await storage.getAdvancedAnalytics({
          year: filters.year,
          uf: filters.state || filters.uf,
          electionType: filters.electionType,
          position: filters.position,
          limit: 50000,
        });
        data = result.candidates || [];
        filename = `detalhes_votacao_${filters.year || "todos"}`;
        break;
      }
      case "summary":
        const summary = await storage.getAnalyticsSummary({
          year: filters.year,
          uf: filters.state || filters.uf,
        });
        data = [summary];
        filename = `resumo_${filters.year || "todos"}`;
        break;
    }

    const csvContent = generateCsvFromData(data, template.columns as string[] | undefined);
    const filePath = `/tmp/${filename}.csv`;
    const fs = await import("fs/promises");
    await fs.writeFile(filePath, csvContent);
    const fileStats = await fs.stat(filePath);
    
    let emailsSent = 0;
    const allRecipients = recipients.length > 0 ? recipients : [];
    
    if (allRecipients.length > 0 && process.env.RESEND_API_KEY) {
      emailsSent = await sendReportEmail(
        allRecipients,
        template.name,
        `Relatório gerado automaticamente: ${template.name}`,
        filePath,
        filename + ".csv"
      );
    }

    const executionTime = Date.now() - startTime;
    
    await storage.updateReportRun(runId, {
      status: "completed",
      completedAt: new Date(),
      rowCount: data.length,
      fileSize: fileStats.size,
      filePath,
      recipients: allRecipients as any,
      emailsSent,
      executionTimeMs: executionTime,
    });
    
    console.log(`Report run ${runId} completed: ${data.length} rows, ${executionTime}ms`);
    
  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    await storage.updateReportRun(runId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: error.message || "Unknown error",
      executionTimeMs: executionTime,
    });
    console.error(`Report run ${runId} failed:`, error.message);
    throw error;
  }
}

function generateCsvFromData(data: any[], columns?: string[]): string {
  if (!data || data.length === 0) return "";
  
  const keys = columns || Object.keys(data[0]);
  const header = keys.join(",");
  const rows = data.map(row => 
    keys.map(key => {
      const value = row[key];
      if (value === null || value === undefined) return "";
      const str = String(value);
      return str.includes(",") || str.includes('"') || str.includes("\n") 
        ? `"${str.replace(/"/g, '""')}"` 
        : str;
    }).join(",")
  );
  
  return "\uFEFF" + [header, ...rows].join("\n");
}

async function sendReportEmail(
  recipients: string[],
  reportName: string,
  body: string,
  filePath: string,
  fileName: string
): Promise<number> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("RESEND_API_KEY not configured, skipping email");
    return 0;
  }

  try {
    const fs = await import("fs/promises");
    const fileContent = await fs.readFile(filePath);
    const base64Content = fileContent.toString("base64");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SimulaVoto <noreply@simulavoto.app>",
        to: recipients,
        subject: `[SimulaVoto] ${reportName}`,
        html: `
          <h2>Relatório: ${reportName}</h2>
          <p>${body}</p>
          <p>O relatório está anexado a este email.</p>
          <hr>
          <p><small>Gerado automaticamente por SimulaVoto em ${new Date().toLocaleString("pt-BR")}</small></p>
        `,
        attachments: [{
          filename: fileName,
          content: base64Content,
        }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Resend API error:", errorText);
      return 0;
    }

    return recipients.length;
  } catch (error) {
    console.error("Error sending email:", error);
    return 0;
  }
}
