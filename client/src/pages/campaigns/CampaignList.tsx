import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Target, ChevronRight } from "lucide-react";
import { formatCurrency, formatDate, STATUS_COLORS, STATUS_LABELS } from "@/hooks/use-campaigns";
import type { Campaign } from "@shared/schema";

interface CampaignListProps {
  campaigns: Campaign[] | undefined;
  onSelectCampaign: (id: number) => void;
  onShowCreate: () => void;
}

export function CampaignList({ campaigns, onSelectCampaign, onShowCreate }: CampaignListProps) {
  if (campaigns && campaigns.length > 0) {
    return (
      <div className="grid gap-4">
        {campaigns.map((campaign: any) => (
          <Card
            key={campaign.id}
            className="hover-elevate cursor-pointer"
            onClick={() => onSelectCampaign(campaign.id)}
            data-testid={`card-campaign-${campaign.id}`}
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[campaign.status]}`} />
                  <div>
                    <h3 className="font-semibold text-lg" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(campaign.startDate)} - {formatDate(campaign.endDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Orçamento</p>
                    <p className="font-semibold">{formatCurrency(campaign.totalBudget)}</p>
                  </div>
                  <Badge variant="outline">{STATUS_LABELS[campaign.status]}</Badge>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Card data-testid="empty-campaigns">
      <CardContent className="p-12 text-center">
        <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Nenhuma campanha criada</h3>
        <p className="text-muted-foreground mb-4">Crie sua primeira campanha eleitoral para começar</p>
        <Button onClick={onShowCreate} data-testid="button-create-first-campaign">
          <Plus className="h-4 w-4 mr-2" />
          Criar Campanha
        </Button>
      </CardContent>
    </Card>
  );
}
