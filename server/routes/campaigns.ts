import { Router } from "express";
import { requireAuth, requireRole, logAudit } from "./shared";
import { storage } from "../storage";
import { campaignInsightsService } from "../campaign-insights-service";

const router = Router();

// =====================================================
// Campaign Insights AI Module
// =====================================================

router.get("/api/campaign-insights/sessions", requireAuth, async (req, res) => {
  try {
    const sessions = await campaignInsightsService.getSessions(req.user?.id);
    res.json(sessions);
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.post("/api/campaign-insights/sessions", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { name, description, targetPartyId, targetCandidateId, electionYear, position, targetRegion } = req.body;
    
    if (!name || !electionYear) {
      return res.status(400).json({ error: "Name and election year are required" });
    }

    const sessionId = await campaignInsightsService.createSession({
      name,
      description,
      targetPartyId,
      targetCandidateId,
      electionYear,
      position,
      targetRegion,
      createdBy: req.user?.id,
    });

    await logAudit(req, "CAMPAIGN_INSIGHT_CREATE", "campaign_insight_sessions", sessionId.toString(), { name, electionYear });

    res.json({ id: sessionId, message: "Session created successfully" });
  } catch (error) {
    console.error("Error creating session:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.get("/api/campaign-insights/sessions/:id", requireAuth, async (req, res) => {
  try {
    const session = await campaignInsightsService.getSessionById(parseInt(req.params.id));
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json(session);
  } catch (error) {
    console.error("Error fetching session:", error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

router.post("/api/campaign-insights/sessions/:id/analyze-segments", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const session = await campaignInsightsService.getSessionById(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const segments = await campaignInsightsService.analyzeHighImpactSegments({
      sessionId,
      electionYear: session.electionYear,
      targetRegion: session.targetRegion,
      targetPartyId: session.targetPartyId,
    });

    await logAudit(req, "CAMPAIGN_SEGMENT_ANALYSIS", "high_impact_segments", sessionId.toString(), { segmentCount: segments.length });

    res.json({ segments, message: "Segment analysis completed" });
  } catch (error) {
    console.error("Error analyzing segments:", error);
    res.status(500).json({ error: "Failed to analyze segments" });
  }
});

router.post("/api/campaign-insights/sessions/:id/generate-messages", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { segmentId } = req.body;

    const strategies = await campaignInsightsService.generateMessageStrategies({
      sessionId,
      segmentId,
    });

    await logAudit(req, "CAMPAIGN_MESSAGE_STRATEGY", "message_strategies", sessionId.toString(), { strategyCount: strategies.length });

    res.json({ strategies, message: "Message strategies generated" });
  } catch (error) {
    console.error("Error generating messages:", error);
    res.status(500).json({ error: "Failed to generate message strategies" });
  }
});

router.post("/api/campaign-insights/sessions/:id/predict-impact", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const { investmentType, investmentAmount, targetSegmentIds, duration } = req.body;

    if (!investmentType || !investmentAmount || !targetSegmentIds?.length || !duration) {
      return res.status(400).json({ error: "Investment details are required" });
    }

    const prediction = await campaignInsightsService.predictCampaignImpact({
      sessionId,
      investmentType,
      investmentAmount: parseFloat(investmentAmount),
      targetSegmentIds,
      duration: parseInt(duration),
    });

    await logAudit(req, "CAMPAIGN_IMPACT_PREDICTION", "campaign_impact_predictions", prediction.id.toString(), { investmentType, investmentAmount });

    res.json({ prediction, message: "Impact prediction generated" });
  } catch (error) {
    console.error("Error predicting impact:", error);
    res.status(500).json({ error: "Failed to predict impact" });
  }
});

router.post("/api/campaign-insights/sessions/:id/generate-report", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id);
    const report = await campaignInsightsService.generateExecutiveReport(sessionId, req.user?.id);

    await logAudit(req, "CAMPAIGN_REPORT_GENERATE", "campaign_insight_reports", report.id.toString(), { reportType: "executive" });

    res.json({ report, message: "Report generated successfully" });
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// ============ CAMPAIGN MANAGEMENT ROUTES ============

router.get("/api/campaigns", requireAuth, async (req, res) => {
  try {
    const { status, partyId } = req.query;
    const campaigns = await storage.getCampaigns({
      status: status as string | undefined,
      partyId: partyId ? parseInt(partyId as string) : undefined,
    });
    res.json(campaigns);
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

router.post("/api/campaigns", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const { startDate, endDate, ...rest } = req.body;
    const campaign = await storage.createCampaign({
      ...rest,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      createdBy: req.user?.id,
    });
    
    await logAudit(req, "CAMPAIGN_CREATE", "campaigns", campaign.id.toString(), { name: campaign.name });
    
    res.status(201).json(campaign);
  } catch (error) {
    console.error("Error creating campaign:", error);
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.get("/api/campaigns/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await storage.getCampaignWithDetails(id);
    
    if (!result) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    res.json(result);
  } catch (error) {
    console.error("Error fetching campaign:", error);
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

router.patch("/api/campaigns/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await storage.updateCampaign(id, req.body);
    
    if (!updated) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    await logAudit(req, "CAMPAIGN_UPDATE", "campaigns", id.toString(), req.body);
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating campaign:", error);
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

router.delete("/api/campaigns/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteCampaign(id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    await logAudit(req, "CAMPAIGN_DELETE", "campaigns", id.toString(), {});
    
    res.json({ message: "Campaign deleted successfully" });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

router.get("/api/campaigns/:id/performance", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const summary = await storage.getCampaignPerformanceSummary(id);
    res.json(summary);
  } catch (error) {
    console.error("Error fetching performance:", error);
    res.status(500).json({ error: "Failed to fetch performance summary" });
  }
});

router.post("/api/campaigns/:id/link-ai-session", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { aiSessionId } = req.body;
    
    const updated = await storage.updateCampaign(id, { aiSessionId });
    
    if (!updated) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    await logAudit(req, "CAMPAIGN_LINK_AI", "campaigns", id.toString(), { aiSessionId });
    
    res.json(updated);
  } catch (error) {
    console.error("Error linking AI session:", error);
    res.status(500).json({ error: "Failed to link AI session" });
  }
});

// ============ CAMPAIGN TEAM MEMBERS ============

router.get("/api/campaigns/:id/team", requireAuth, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const members = await storage.getCampaignTeamMembers(campaignId);
    
    const enrichedMembers = await Promise.all(members.map(async (member) => {
      const user = await storage.getUser(member.userId);
      return {
        ...member,
        user: user ? { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role } : null
      };
    }));
    
    res.json(enrichedMembers);
  } catch (error) {
    console.error("Error fetching team members:", error);
    res.status(500).json({ error: "Failed to fetch team members" });
  }
});

router.post("/api/campaigns/:id/team", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const { userId, role, permissions, notes } = req.body;
    
    const existing = await storage.getCampaignTeamMemberByUser(campaignId, userId);
    if (existing) {
      return res.status(400).json({ error: "User is already a team member" });
    }
    
    const member = await storage.createCampaignTeamMember({
      campaignId,
      userId,
      role: role || "member",
      permissions: permissions || [],
      notes,
    });
    
    const campaign = await storage.getCampaign(campaignId);
    if (campaign) {
      await storage.createCampaignNotification({
        campaignId,
        type: "team_added",
        recipientUserId: userId,
        title: "Adicionado à campanha",
        message: `Você foi adicionado à equipe da campanha "${campaign.name}" como ${role || "membro"}.`,
        severity: "info",
      });
    }
    
    await logAudit(req, "TEAM_MEMBER_ADD", "campaign_team_members", member.id.toString(), { userId, role });
    
    res.status(201).json(member);
  } catch (error) {
    console.error("Error adding team member:", error);
    res.status(500).json({ error: "Failed to add team member" });
  }
});

router.patch("/api/campaigns/:campaignId/team/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await storage.updateCampaignTeamMember(id, req.body);
    
    if (!updated) {
      return res.status(404).json({ error: "Team member not found" });
    }
    
    await logAudit(req, "TEAM_MEMBER_UPDATE", "campaign_team_members", id.toString(), req.body);
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating team member:", error);
    res.status(500).json({ error: "Failed to update team member" });
  }
});

router.delete("/api/campaigns/:campaignId/team/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteCampaignTeamMember(id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Team member not found" });
    }
    
    await logAudit(req, "TEAM_MEMBER_REMOVE", "campaign_team_members", id.toString(), {});
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing team member:", error);
    res.status(500).json({ error: "Failed to remove team member" });
  }
});

// ============ ACTIVITY ASSIGNEES ============

router.get("/api/campaigns/:campaignId/activities/:activityId/assignees", requireAuth, async (req, res) => {
  try {
    const activityId = parseInt(req.params.activityId);
    const assignees = await storage.getActivityAssignees(activityId);
    
    const enrichedAssignees = await Promise.all(assignees.map(async (assignee) => {
      const teamMember = await storage.getCampaignTeamMember(assignee.teamMemberId);
      let user = null;
      if (teamMember) {
        user = await storage.getUser(teamMember.userId);
      }
      return {
        ...assignee,
        teamMember,
        user: user ? { id: user.id, name: user.name, username: user.username } : null
      };
    }));
    
    res.json(enrichedAssignees);
  } catch (error) {
    console.error("Error fetching assignees:", error);
    res.status(500).json({ error: "Failed to fetch assignees" });
  }
});

router.post("/api/campaigns/:campaignId/activities/:activityId/assignees", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const activityId = parseInt(req.params.activityId);
    const campaignId = parseInt(req.params.campaignId);
    const { teamMemberId, notes } = req.body;
    
    const assignee = await storage.createActivityAssignee({
      activityId,
      teamMemberId,
      assignedBy: req.user?.id,
      notes,
    });
    
    const teamMember = await storage.getCampaignTeamMember(teamMemberId);
    const activity = await storage.getCampaignActivity(activityId);
    const campaign = await storage.getCampaign(campaignId);
    
    if (teamMember && activity && campaign) {
      await storage.createCampaignNotification({
        campaignId,
        type: "task_assigned",
        recipientUserId: teamMember.userId,
        title: "Nova tarefa atribuída",
        message: `Você foi atribuído à tarefa "${activity.title}" na campanha "${campaign.name}".`,
        severity: "info",
        relatedActivityId: activityId,
      });
    }
    
    await logAudit(req, "ACTIVITY_ASSIGN", "activity_assignees", assignee.id.toString(), { activityId, teamMemberId });
    
    res.status(201).json(assignee);
  } catch (error) {
    console.error("Error assigning to activity:", error);
    res.status(500).json({ error: "Failed to assign to activity" });
  }
});

router.delete("/api/campaigns/:campaignId/activities/:activityId/assignees/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteActivityAssignee(id);
    
    await logAudit(req, "ACTIVITY_UNASSIGN", "activity_assignees", id.toString(), {});
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing assignee:", error);
    res.status(500).json({ error: "Failed to remove assignee" });
  }
});

// ============ AI KPI GOALS ============

router.get("/api/campaigns/:id/kpi-goals", requireAuth, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const goals = await storage.getAiKpiGoals(campaignId);
    res.json(goals);
  } catch (error) {
    console.error("Error fetching KPI goals:", error);
    res.status(500).json({ error: "Failed to fetch KPI goals" });
  }
});

router.post("/api/campaigns/:id/kpi-goals", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const { startDate, endDate, ...rest } = req.body;
    
    const goal = await storage.createAiKpiGoal({
      ...rest,
      campaignId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    
    await logAudit(req, "KPI_GOAL_CREATE", "ai_kpi_goals", goal.id.toString(), { kpiName: goal.kpiName });
    
    res.status(201).json(goal);
  } catch (error) {
    console.error("Error creating KPI goal:", error);
    res.status(500).json({ error: "Failed to create KPI goal" });
  }
});

router.patch("/api/campaigns/:campaignId/kpi-goals/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const campaignId = parseInt(req.params.campaignId);
    const { startDate, endDate, ...rest } = req.body;
    
    const updateData: any = { ...rest };
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    
    const updated = await storage.updateAiKpiGoal(id, updateData);
    
    if (!updated) {
      return res.status(404).json({ error: "KPI goal not found" });
    }
    
    if (updated.status === "achieved" || (updated.currentValue && updated.targetValue && 
        parseFloat(String(updated.currentValue)) >= parseFloat(String(updated.targetValue)))) {
      const campaign = await storage.getCampaign(campaignId);
      const teamMembers = await storage.getCampaignTeamMembers(campaignId);
      
      for (const member of teamMembers) {
        await storage.createCampaignNotification({
          campaignId,
          type: "kpi_alert",
          recipientUserId: member.userId,
          title: "Meta de KPI alcançada!",
          message: `A meta de "${updated.kpiName}" foi alcançada na campanha "${campaign?.name}".`,
          severity: "info",
          relatedKpiGoalId: id,
        });
      }
    }
    
    await logAudit(req, "KPI_GOAL_UPDATE", "ai_kpi_goals", id.toString(), req.body);
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating KPI goal:", error);
    res.status(500).json({ error: "Failed to update KPI goal" });
  }
});

router.delete("/api/campaigns/:campaignId/kpi-goals/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await storage.deleteAiKpiGoal(id);
    
    await logAudit(req, "KPI_GOAL_DELETE", "ai_kpi_goals", id.toString(), {});
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting KPI goal:", error);
    res.status(500).json({ error: "Failed to delete KPI goal" });
  }
});

router.post("/api/campaigns/:id/kpi-goals/ai-recommendations", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const campaign = await storage.getCampaign(campaignId);
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const goals = await storage.getAiKpiGoals(campaignId);
    const metrics = await storage.getCampaignMetrics(campaignId);
    
    const prompt = `Analise a campanha eleitoral "${campaign.name}" (cargo: ${campaign.position}, região: ${campaign.targetRegion}) e forneça recomendações de KPIs estratégicos.

Metas atuais:
${goals.map(g => `- ${g.kpiName}: Meta ${g.targetValue}, Atual ${g.currentValue || "N/A"}`).join("\n") || "Nenhuma meta definida"}

Métricas históricas:
${metrics.slice(0, 10).map(m => `- ${m.kpiName}: ${m.kpiValue} (${new Date(m.metricDate).toLocaleDateString()})`).join("\n") || "Sem métricas"}

Meta de votos: ${campaign.targetVotes || "Não definida"}
Orçamento: R$ ${campaign.totalBudget || 0}

Forneça até 5 recomendações de KPIs estratégicos no formato JSON:
[
  {
    "kpiName": "nome do KPI",
    "suggestedTarget": "valor numérico sugerido",
    "rationale": "justificativa breve",
    "priority": "high/medium/low",
    "confidence": "porcentagem de confiança"
  }
]`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Você é um estrategista político especialista em campanhas eleitorais brasileiras. IMPORTANTE: Responda SEMPRE em português brasileiro. Todos os textos, análises e recomendações devem ser em português. Nunca use inglês. Responda apenas em JSON válido." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "[]";
    
    let recommendations = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        recommendations = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse AI recommendations:", e);
    }
    
    res.json({ recommendations });
  } catch (error) {
    console.error("Error generating AI recommendations:", error);
    res.status(500).json({ error: "Failed to generate AI recommendations" });
  }
});

// ============ CALENDAR ACTIVITIES ============

router.get("/api/campaigns/:id/calendar", requireAuth, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "startDate and endDate are required" });
    }
    
    const activities = await storage.getCalendarActivities(
      campaignId,
      new Date(startDate as string),
      new Date(endDate as string)
    );
    
    res.json(activities);
  } catch (error) {
    console.error("Error fetching calendar activities:", error);
    res.status(500).json({ error: "Failed to fetch calendar activities" });
  }
});

// ============ CAMPAIGN NOTIFICATIONS ============

router.get("/api/campaigns/:id/notifications", requireAuth, async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const notifications = await storage.getCampaignNotifications(campaignId);
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching campaign notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.get("/api/user/campaign-notifications", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    
    const notifications = await storage.getUserCampaignNotifications(userId);
    res.json(notifications);
  } catch (error) {
    console.error("Error fetching user campaign notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ============ CAMPAIGN BUDGETS ============

router.get("/api/campaigns/:id/budgets", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const budgets = await storage.getCampaignBudgets(id);
    res.json(budgets);
  } catch (error) {
    console.error("Error fetching budgets:", error);
    res.status(500).json({ error: "Failed to fetch budgets" });
  }
});

router.post("/api/campaigns/:id/budgets", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const budget = await storage.createCampaignBudget({
      ...req.body,
      campaignId,
    });
    
    await logAudit(req, "BUDGET_CREATE", "campaign_budgets", budget.id.toString(), { category: budget.category });
    
    res.status(201).json(budget);
  } catch (error) {
    console.error("Error creating budget:", error);
    res.status(500).json({ error: "Failed to create budget" });
  }
});

router.patch("/api/campaigns/:campaignId/budgets/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await storage.updateCampaignBudget(id, req.body);
    
    if (!updated) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    await logAudit(req, "BUDGET_UPDATE", "campaign_budgets", id.toString(), req.body);
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating budget:", error);
    res.status(500).json({ error: "Failed to update budget" });
  }
});

router.delete("/api/campaigns/:campaignId/budgets/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteCampaignBudget(id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Budget not found" });
    }
    
    await logAudit(req, "BUDGET_DELETE", "campaign_budgets", id.toString(), {});
    
    res.json({ message: "Budget deleted successfully" });
  } catch (error) {
    console.error("Error deleting budget:", error);
    res.status(500).json({ error: "Failed to delete budget" });
  }
});

// ============ CAMPAIGN RESOURCES ============

router.get("/api/campaigns/:id/resources", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const resources = await storage.getCampaignResources(id);
    res.json(resources);
  } catch (error) {
    console.error("Error fetching resources:", error);
    res.status(500).json({ error: "Failed to fetch resources" });
  }
});

router.post("/api/campaigns/:id/resources", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const resource = await storage.createCampaignResource({
      ...req.body,
      campaignId,
    });
    
    await logAudit(req, "RESOURCE_CREATE", "campaign_resources", resource.id.toString(), { name: resource.name });
    
    res.status(201).json(resource);
  } catch (error) {
    console.error("Error creating resource:", error);
    res.status(500).json({ error: "Failed to create resource" });
  }
});

router.patch("/api/campaigns/:campaignId/resources/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await storage.updateCampaignResource(id, req.body);
    
    if (!updated) {
      return res.status(404).json({ error: "Resource not found" });
    }
    
    await logAudit(req, "RESOURCE_UPDATE", "campaign_resources", id.toString(), req.body);
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating resource:", error);
    res.status(500).json({ error: "Failed to update resource" });
  }
});

router.delete("/api/campaigns/:campaignId/resources/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteCampaignResource(id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Resource not found" });
    }
    
    await logAudit(req, "RESOURCE_DELETE", "campaign_resources", id.toString(), {});
    
    res.json({ message: "Resource deleted successfully" });
  } catch (error) {
    console.error("Error deleting resource:", error);
    res.status(500).json({ error: "Failed to delete resource" });
  }
});

// ============ CAMPAIGN METRICS ============

router.get("/api/campaigns/:id/metrics", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { kpiName, startDate, endDate } = req.query;
    
    const metrics = await storage.getCampaignMetrics(id, {
      kpiName: kpiName as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });
    res.json(metrics);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

router.post("/api/campaigns/:id/metrics", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const { metricDate, ...rest } = req.body;
    const metric = await storage.createCampaignMetric({
      ...rest,
      metricDate: new Date(metricDate),
      campaignId,
    });
    
    await logAudit(req, "METRIC_CREATE", "campaign_metrics", metric.id.toString(), { kpiName: metric.kpiName });
    
    res.status(201).json(metric);
  } catch (error) {
    console.error("Error creating metric:", error);
    res.status(500).json({ error: "Failed to create metric" });
  }
});

router.patch("/api/campaigns/:campaignId/metrics/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await storage.updateCampaignMetric(id, req.body);
    
    if (!updated) {
      return res.status(404).json({ error: "Metric not found" });
    }
    
    await logAudit(req, "METRIC_UPDATE", "campaign_metrics", id.toString(), req.body);
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating metric:", error);
    res.status(500).json({ error: "Failed to update metric" });
  }
});

router.delete("/api/campaigns/:campaignId/metrics/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteCampaignMetric(id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Metric not found" });
    }
    
    await logAudit(req, "METRIC_DELETE", "campaign_metrics", id.toString(), {});
    
    res.json({ message: "Metric deleted successfully" });
  } catch (error) {
    console.error("Error deleting metric:", error);
    res.status(500).json({ error: "Failed to delete metric" });
  }
});

// ============ CAMPAIGN ACTIVITIES ============

router.get("/api/campaigns/:id/activities", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, type } = req.query;
    
    const activities = await storage.getCampaignActivities(id, {
      status: status as string | undefined,
      type: type as string | undefined,
    });
    res.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

router.post("/api/campaigns/:id/activities", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const { scheduledDate, ...rest } = req.body;
    const activity = await storage.createCampaignActivity({
      ...rest,
      scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      campaignId,
      createdBy: req.user?.id,
    });
    
    await logAudit(req, "ACTIVITY_CREATE", "campaign_activities", activity.id.toString(), { title: activity.title });
    
    res.status(201).json(activity);
  } catch (error) {
    console.error("Error creating activity:", error);
    res.status(500).json({ error: "Failed to create activity" });
  }
});

router.patch("/api/campaigns/:campaignId/activities/:id", requireAuth, requireRole("admin", "analyst"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updated = await storage.updateCampaignActivity(id, req.body);
    
    if (!updated) {
      return res.status(404).json({ error: "Activity not found" });
    }
    
    await logAudit(req, "ACTIVITY_UPDATE", "campaign_activities", id.toString(), req.body);
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating activity:", error);
    res.status(500).json({ error: "Failed to update activity" });
  }
});

router.delete("/api/campaigns/:campaignId/activities/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteCampaignActivity(id);
    
    if (!deleted) {
      return res.status(404).json({ error: "Activity not found" });
    }
    
    await logAudit(req, "ACTIVITY_DELETE", "campaign_activities", id.toString(), {});
    
    res.json({ message: "Activity deleted successfully" });
  } catch (error) {
    console.error("Error deleting activity:", error);
    res.status(500).json({ error: "Failed to delete activity" });
  }
});

export default router;
