import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Activity, Clock, DollarSign, CheckCircle2, Play, Pause } from "lucide-react";
import { formatDate, STATUS_LABELS } from "@/hooks/use-campaigns";
import type { CampaignDetail as CampaignDetailType, PerformanceSummary } from "@/hooks/use-campaigns";

interface CampaignDetailProps {
  campaignDetail: CampaignDetailType;
  performance: PerformanceSummary | undefined;
  onBack: () => void;
  onUpdateStatus: (status: string) => void;
}

export function CampaignDetailView({ campaignDetail, performance, onBack, onUpdateStatus }: CampaignDetailProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} data-testid="button-back-list">
          Voltar para lista
        </Button>
        <div className="flex gap-2">
          {campaignDetail.campaign.status === "planning" && (
            <Button onClick={() => onUpdateStatus("active")} data-testid="button-start-campaign">
              <Play className="h-4 w-4 mr-2" />
              Iniciar Campanha
            </Button>
          )}
          {campaignDetail.campaign.status === "active" && (
            <Button variant="outline" onClick={() => onUpdateStatus("paused")} data-testid="button-pause-campaign">
              <Pause className="h-4 w-4 mr-2" />
              Pausar
            </Button>
          )}
          {campaignDetail.campaign.status === "paused" && (
            <Button onClick={() => onUpdateStatus("active")} data-testid="button-resume-campaign">
              <Play className="h-4 w-4 mr-2" />
              Retomar
            </Button>
          )}
          {(campaignDetail.campaign.status === "active" || campaignDetail.campaign.status === "paused") && (
            <Button variant="outline" onClick={() => onUpdateStatus("completed")} data-testid="button-complete-campaign">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Concluir
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="stat-progress">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Activity className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Progresso</p>
                <p className="text-2xl font-bold">{Math.round(performance?.progressPercentage || 0)}%</p>
                <Progress value={performance?.progressPercentage || 0} className="mt-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-days-remaining">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Clock className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dias Restantes</p>
                <p className="text-2xl font-bold">{performance?.daysRemaining || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-budget-utilization">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <DollarSign className="h-6 w-6 text-green-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Uso do Orçamento</p>
                <p className="text-2xl font-bold">{Math.round(performance?.budgetUtilization || 0)}%</p>
                <Progress value={performance?.budgetUtilization || 0} className="mt-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-activities">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-500/10">
                <CheckCircle2 className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Atividades</p>
                <p className="text-2xl font-bold">{performance?.activitiesCompleted || 0}/{performance?.activitiesTotal || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes da Campanha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant="outline" className="mt-1">{STATUS_LABELS[campaignDetail.campaign.status]}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cargo</p>
                <p className="font-medium">{campaignDetail.campaign.position}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Região</p>
                <p className="font-medium">{campaignDetail.campaign.targetRegion || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Meta de Votos</p>
                <p className="font-medium">{campaignDetail.campaign.targetVotes?.toLocaleString("pt-BR") || "-"}</p>
              </div>
            </div>
            {campaignDetail.campaign.goal && (
              <div>
                <p className="text-sm text-muted-foreground">Objetivo</p>
                <p className="text-sm mt-1">{campaignDetail.campaign.goal}</p>
              </div>
            )}
            {campaignDetail.campaign.description && (
              <div>
                <p className="text-sm text-muted-foreground">Descrição</p>
                <p className="text-sm mt-1">{campaignDetail.campaign.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Métricas Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {performance?.latestMetrics && performance.latestMetrics.length > 0 ? (
              <div className="space-y-4">
                {performance.latestMetrics.map((metric: any, index: number) => (
                  <div key={index} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{metric.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Meta: {metric.target?.toLocaleString("pt-BR") || "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold">{metric.value.toLocaleString("pt-BR")}</p>
                      {metric.target && (
                        <p className={`text-sm ${metric.value >= metric.target ? "text-green-500" : "text-yellow-500"}`}>
                          {Math.round((metric.value / metric.target) * 100)}% da meta
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Nenhuma métrica registrada</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
