import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus } from "lucide-react";
import { useCampaigns } from "@/hooks/use-campaigns";
import { CampaignList } from "./campaigns/CampaignList";
import { CampaignDetailView } from "./campaigns/CampaignDetail";
import { BudgetTab } from "./campaigns/BudgetTab";
import { ActivitiesTab, CalendarTab } from "./campaigns/ActivitiesTab";
import { MetricsTab, KpiGoalsTab } from "./campaigns/MetricsTab";
import { TeamTab } from "./campaigns/TeamTab";
import { CreateCampaignDialog, ResourcesTab, AiTab } from "./campaigns/CampaignDialogs";

export default function Campaigns() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("list");

  const {
    campaigns,
    loadingCampaigns,
    campaignDetail,
    performance,
    aiSessions,
    users,
    teamMembers,
    kpiGoals,
    calendarActivities,
    loadingCalendar,
    createCampaignMutation,
    createBudgetMutation,
    createResourceMutation,
    createActivityMutation,
    createMetricMutation,
    linkAiSessionMutation,
    updateStatusMutation,
    addTeamMemberMutation,
    removeTeamMemberMutation,
    createKpiGoalMutation,
    deleteKpiGoalMutation,
    fetchAiRecommendations,
  } = useCampaigns(selectedCampaign);

  if (loadingCampaigns) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Gestão de Campanhas</h1>
          <p className="text-muted-foreground">Gerencie campanhas eleitorais, orçamentos e recursos</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-campaign">
          <Plus className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      <CreateCampaignDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        createCampaignMutation={createCampaignMutation}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="list" data-testid="tab-list">Lista de Campanhas</TabsTrigger>
          {selectedCampaign && (
            <>
              <TabsTrigger value="overview" data-testid="tab-overview">Visão Geral</TabsTrigger>
              <TabsTrigger value="team" data-testid="tab-team">Equipe</TabsTrigger>
              <TabsTrigger value="budget" data-testid="tab-budget">Orçamento</TabsTrigger>
              <TabsTrigger value="resources" data-testid="tab-resources">Recursos</TabsTrigger>
              <TabsTrigger value="activities" data-testid="tab-activities">Atividades</TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-calendar">Calendário</TabsTrigger>
              <TabsTrigger value="kpi-goals" data-testid="tab-kpi-goals">Metas KPI</TabsTrigger>
              <TabsTrigger value="performance" data-testid="tab-performance">Desempenho</TabsTrigger>
              <TabsTrigger value="ai" data-testid="tab-ai">IA Estratégica</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <CampaignList
            campaigns={campaigns}
            onSelectCampaign={(id) => {
              setSelectedCampaign(id);
              setActiveTab("overview");
            }}
            onShowCreate={() => setShowCreateDialog(true)}
          />
        </TabsContent>

        {selectedCampaign && campaignDetail && (
          <>
            <TabsContent value="overview" className="space-y-6">
              <CampaignDetailView
                campaignDetail={campaignDetail}
                performance={performance}
                onBack={() => { setSelectedCampaign(null); setActiveTab("list"); }}
                onUpdateStatus={(status) => updateStatusMutation.mutate(status)}
              />
            </TabsContent>

            <TabsContent value="team" className="space-y-6">
              <TeamTab
                teamMembers={teamMembers}
                users={users}
                addTeamMemberMutation={addTeamMemberMutation}
                removeTeamMemberMutation={removeTeamMemberMutation}
              />
            </TabsContent>

            <TabsContent value="budget" className="space-y-6">
              <BudgetTab
                campaignDetail={campaignDetail}
                createBudgetMutation={createBudgetMutation}
              />
            </TabsContent>

            <TabsContent value="resources" className="space-y-6">
              <ResourcesTab
                campaignDetail={campaignDetail}
                createResourceMutation={createResourceMutation}
              />
            </TabsContent>

            <TabsContent value="activities" className="space-y-6">
              <ActivitiesTab
                campaignDetail={campaignDetail}
                createActivityMutation={createActivityMutation}
              />
            </TabsContent>

            <TabsContent value="calendar" className="space-y-6">
              <CalendarTab
                calendarActivities={calendarActivities}
                loadingCalendar={loadingCalendar}
              />
            </TabsContent>

            <TabsContent value="kpi-goals" className="space-y-6">
              <KpiGoalsTab
                kpiGoals={kpiGoals}
                selectedCampaign={selectedCampaign}
                createKpiGoalMutation={createKpiGoalMutation}
                deleteKpiGoalMutation={deleteKpiGoalMutation}
                fetchAiRecommendations={fetchAiRecommendations}
              />
            </TabsContent>

            <TabsContent value="performance" className="space-y-6">
              <MetricsTab
                campaignDetail={campaignDetail}
                createMetricMutation={createMetricMutation}
              />
            </TabsContent>

            <TabsContent value="ai" className="space-y-6">
              <AiTab
                campaignDetail={campaignDetail}
                aiSessions={aiSessions}
                linkAiSessionMutation={linkAiSessionMutation}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
