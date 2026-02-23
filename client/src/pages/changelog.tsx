import { useQuery } from "@tanstack/react-query";
import { Clock, Tag, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

interface VersionData {
  version: string;
  buildDate: string;
  changelog: ChangelogEntry[];
}

export default function Changelog() {
  const { data, isLoading } = useQuery<VersionData>({
    queryKey: ["/api/version"],
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-changelog-title">
            Histórico de Versões
          </h1>
          {data && (
            <p className="text-sm text-muted-foreground">
              Versão atual: <span className="font-medium text-foreground">v{data.version}</span>
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader><div className="h-5 bg-muted rounded w-32" /></CardHeader>
              <CardContent><div className="h-16 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {data?.changelog.map((entry, index) => (
            <Card
              key={entry.version}
              className={index === 0 ? "border-primary/30 bg-primary/5" : ""}
              data-testid={`card-version-${entry.version}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Tag className="h-4 w-4 text-primary" />
                    v{entry.version}
                    {index === 0 && (
                      <Badge variant="default" className="text-xs">Atual</Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(entry.date + "T00:00:00").toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <ul className="space-y-2">
                  {entry.changes.map((change, ci) => (
                    <li
                      key={ci}
                      className="flex items-start gap-2 text-sm"
                      data-testid={`text-change-${entry.version}-${ci}`}
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      {change}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
