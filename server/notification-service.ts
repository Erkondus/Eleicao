import { db } from "./db";
import { inAppNotifications, alertConfigurations, users, sentimentCrisisAlerts } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { sendNotificationToUser, emitNewCrisisAlert, emitAlertAcknowledged } from "./websocket";

interface CrisisAlertData {
  id: number;
  entityType: string;
  entityId: string;
  entityName: string;
  alertType: string;
  severity: string;
  title: string;
  description: string | null;
  sentimentBefore: number;
  sentimentAfter: number;
  sentimentChange: number;
  mentionCount: number;
  detectedAt: Date;
}

export async function createInAppNotification(params: {
  userId: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  actionUrl?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const [notification] = await db.insert(inAppNotifications).values({
    userId: params.userId,
    type: params.type,
    severity: params.severity,
    title: params.title,
    message: params.message,
    actionUrl: params.actionUrl,
    relatedEntityType: params.relatedEntityType,
    relatedEntityId: params.relatedEntityId,
    metadata: params.metadata || {},
  }).returning();

  sendNotificationToUser(params.userId, {
    id: notification.id,
    type: params.type,
    severity: params.severity,
    title: params.title,
    message: params.message,
    actionUrl: params.actionUrl,
  });
}

export async function notifyAllAnalystsOfCrisis(alertData: CrisisAlertData): Promise<void> {
  const alertForEmit = {
    ...alertData,
    description: alertData.description || `Alerta de crise detectado para ${alertData.entityName}`
  };
  
  const analysts = await db.select()
    .from(users)
    .where(
      sql`${users.role} IN ('admin', 'analyst') AND ${users.active} = true`
    );

  for (const analyst of analysts) {
    await createInAppNotification({
      userId: analyst.id,
      type: "crisis_alert",
      severity: alertData.severity,
      title: alertData.title,
      message: alertData.description || `Alerta de crise detectado para ${alertData.entityName}`,
      actionUrl: `/sentiment-analysis?tab=alertas`,
      relatedEntityType: alertData.entityType,
      relatedEntityId: alertData.entityId,
      metadata: {
        alertId: alertData.id,
        sentimentChange: alertData.sentimentChange,
        mentionCount: alertData.mentionCount,
      },
    });
  }

  emitNewCrisisAlert(alertForEmit);
}

export async function sendCrisisEmailNotification(alertData: CrisisAlertData): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.log("Resend API key not configured, skipping email notification");
    return;
  }

  try {
    const configs = await db.select()
      .from(alertConfigurations)
      .where(
        and(
          eq(alertConfigurations.isActive, true),
          eq(alertConfigurations.notifyEmail, true)
        )
      );

    const emailRecipients = new Set<string>();
    
    for (const config of configs) {
      const recipients = config.emailRecipients as string[] || [];
      recipients.forEach(email => emailRecipients.add(email));
    }

    const analysts = await db.select()
      .from(users)
      .where(
        sql`${users.role} IN ('admin', 'analyst') AND ${users.active} = true`
      );
    analysts.forEach(a => emailRecipients.add(a.email));

    if (emailRecipients.size === 0) {
      console.log("No email recipients configured");
      return;
    }

    const severityLabels: Record<string, string> = {
      critical: "CRÍTICO",
      high: "ALTO",
      medium: "MÉDIO",
      low: "BAIXO"
    };

    const { Resend } = await import("resend");
    const resend = new Resend(resendApiKey);

    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #003366; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">SimulaVoto - Alerta de Crise</h1>
        </div>
        <div style="padding: 20px; background: ${alertData.severity === 'critical' ? '#fee2e2' : alertData.severity === 'high' ? '#fef3c7' : '#f3f4f6'};">
          <div style="background: ${alertData.severity === 'critical' ? '#dc2626' : alertData.severity === 'high' ? '#f59e0b' : '#6b7280'}; color: white; padding: 8px 16px; border-radius: 4px; display: inline-block; margin-bottom: 16px;">
            ${severityLabels[alertData.severity] || alertData.severity.toUpperCase()}
          </div>
          <h2 style="color: #1f2937; margin-top: 0;">${alertData.title}</h2>
          <p style="color: #4b5563;">${alertData.description || 'Alerta detectado pelo sistema de monitoramento de sentimento.'}</p>
          
          <div style="background: white; border-radius: 8px; padding: 16px; margin-top: 16px;">
            <h3 style="margin-top: 0; color: #1f2937;">Detalhes do Alerta</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Entidade:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold;">${alertData.entityName} (${alertData.entityType})</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Tipo de Alerta:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${alertData.alertType.replace(/_/g, ' ')}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Sentimento Anterior:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${(alertData.sentimentBefore * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Sentimento Atual:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${(alertData.sentimentAfter * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #6b7280;">Queda:</td>
                <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${(Math.abs(alertData.sentimentChange) * 100).toFixed(1)}%</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Menções:</td>
                <td style="padding: 8px 0; font-weight: bold;">${alertData.mentionCount}</td>
              </tr>
            </table>
          </div>
          
          <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
            Detectado em: ${new Date(alertData.detectedAt).toLocaleString('pt-BR')}
          </p>
        </div>
        <div style="background: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #6b7280;">
          <p>Este é um alerta automatizado do SimulaVoto.</p>
          <p>Acesse o sistema para mais detalhes e para reconhecer este alerta.</p>
        </div>
      </div>
    `;

    await resend.emails.send({
      from: "SimulaVoto <noreply@simulavoto.com>",
      to: Array.from(emailRecipients),
      subject: `[${severityLabels[alertData.severity]}] ${alertData.title}`,
      html: emailContent,
    });

    console.log(`Crisis email sent to ${emailRecipients.size} recipients`);
  } catch (error) {
    console.error("Failed to send crisis email notification:", error);
  }
}

export async function processNewCrisisAlert(alertData: CrisisAlertData): Promise<void> {
  await notifyAllAnalystsOfCrisis(alertData);
  
  if (alertData.severity === 'critical' || alertData.severity === 'high') {
    await sendCrisisEmailNotification(alertData);
  }
}

export async function getUserNotifications(userId: string, limit = 20): Promise<any[]> {
  return db.select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.userId, userId))
    .orderBy(desc(inAppNotifications.createdAt))
    .limit(limit);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` })
    .from(inAppNotifications)
    .where(
      and(
        eq(inAppNotifications.userId, userId),
        eq(inAppNotifications.isRead, false)
      )
    );
  return Number(result[0]?.count || 0);
}

export async function markNotificationAsRead(notificationId: number, userId: string): Promise<void> {
  await db.update(inAppNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(inAppNotifications.id, notificationId),
        eq(inAppNotifications.userId, userId)
      )
    );
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  await db.update(inAppNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(inAppNotifications.userId, userId),
        eq(inAppNotifications.isRead, false)
      )
    );
}

export async function getAlertConfiguration(userId: string, entityType?: string, entityId?: string): Promise<any> {
  const configs = await db.select()
    .from(alertConfigurations)
    .where(eq(alertConfigurations.userId, userId))
    .orderBy(desc(alertConfigurations.createdAt));

  if (entityType && entityId) {
    const specific = configs.find(c => c.entityType === entityType && c.entityId === entityId);
    if (specific) return specific;
  }

  if (entityType) {
    const typeWide = configs.find(c => c.entityType === entityType && !c.entityId);
    if (typeWide) return typeWide;
  }

  const global = configs.find(c => c.isGlobal);
  if (global) return global;

  return {
    sentimentDropThreshold: 0.3,
    criticalSentimentLevel: -0.5,
    mentionSpikeMultiplier: 2.0,
    timeWindowMinutes: 60,
    notifyEmail: true,
    notifyInApp: true,
    minAlertIntervalMinutes: 30,
  };
}
