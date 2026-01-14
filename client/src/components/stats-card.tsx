import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  className?: string;
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn("hover-elevate", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </span>
            <span className="text-3xl font-bold font-mono tabular-nums">
              {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
            </span>
            {description && (
              <span className="text-sm text-muted-foreground">{description}</span>
            )}
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-sm font-medium",
                trend.positive ? "text-success" : "text-destructive"
              )}>
                <span>{trend.positive ? "+" : ""}{trend.value}%</span>
                <span className="text-muted-foreground">vs anterior</span>
              </div>
            )}
          </div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
