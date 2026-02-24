import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
};

export const trendColors = {
  up: "text-success",
  down: "text-destructive",
  stable: "text-muted-foreground",
};

export function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="outline">Rascunho</Badge>;
    case "running":
      return <Badge variant="secondary" className="animate-pulse">Executando</Badge>;
    case "completed":
      return <Badge className="bg-success text-success-foreground">Concluído</Badge>;
    case "failed":
      return <Badge variant="destructive">Falhou</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
