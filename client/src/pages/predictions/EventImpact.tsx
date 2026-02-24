import { useState } from "react";
import { Loader2, Plus, Play, Trash2, Calendar, TrendingUp, TrendingDown, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart, Line, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { getStatusBadge } from "./PredictionCharts";
import { exportPredictionToPdf } from "@/lib/pdf-export";
import type {
  EventForm,
  EventImpactPrediction,
} from "@/hooks/use-predictions";
import { DEFAULT_EVENT_FORM } from "@/hooks/use-predictions";
import type { UseMutationResult } from "@tanstack/react-query";

interface EventImpactProps {
  eventImpacts: EventImpactPrediction[] | undefined;
  loadingEvents: boolean;
  createEventMutation: UseMutationResult<Response, Error, EventForm, unknown>;
  runEventMutation: UseMutationResult<Response, Error, number, unknown>;
  deleteEventMutation: UseMutationResult<Response, Error, number, unknown>;
  onCreateSuccess: () => void;
}

export function EventImpact({
  eventImpacts,
  loadingEvents,
  createEventMutation,
  runEventMutation,
  deleteEventMutation,
  onCreateSuccess,
}: EventImpactProps) {
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [eventForm, setEventForm] = useState<EventForm>({ ...DEFAULT_EVENT_FORM });

  const handleCreate = () => {
    createEventMutation.mutate(eventForm, {
      onSuccess: () => {
        setShowEventDialog(false);
        setEventForm({ ...DEFAULT_EVENT_FORM });
        onCreateSuccess();
      },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Impacto de Eventos</CardTitle>
              <CardDescription>Projete o impacto de eventos políticos com análise antes/depois</CardDescription>
            </div>
            <Dialog open={showEventDialog} onOpenChange={setShowEventDialog}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-event">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Previsão
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Prever Impacto de Evento</DialogTitle>
                  <DialogDescription>Analise como um evento pode afetar os resultados eleitorais</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome da Previsão</Label>
                    <Input
                      value={eventForm.name}
                      onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                      placeholder="Ex: Impacto da Delação"
                      data-testid="input-event-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição do Evento</Label>
                    <Textarea
                      value={eventForm.eventDescription}
                      onChange={(e) => setEventForm({ ...eventForm, eventDescription: e.target.value })}
                      placeholder="Descreva o evento em detalhes..."
                      data-testid="input-event-description"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo de Evento</Label>
                      <Select value={eventForm.eventType} onValueChange={(v) => setEventForm({ ...eventForm, eventType: v })}>
                        <SelectTrigger data-testid="select-event-type"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scandal">Escândalo</SelectItem>
                          <SelectItem value="party_change">Mudança de Partido</SelectItem>
                          <SelectItem value="endorsement">Apoio/Endorsement</SelectItem>
                          <SelectItem value="policy">Política Pública</SelectItem>
                          <SelectItem value="debate">Debate</SelectItem>
                          <SelectItem value="economic">Evento Econômico</SelectItem>
                          <SelectItem value="other">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Duração do Impacto</Label>
                      <Select value={eventForm.impactDuration} onValueChange={(v) => setEventForm({ ...eventForm, impactDuration: v })}>
                        <SelectTrigger data-testid="select-impact-duration"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="short-term">Curto Prazo</SelectItem>
                          <SelectItem value="medium-term">Médio Prazo</SelectItem>
                          <SelectItem value="long-term">Longo Prazo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Partidos Afetados (separados por vírgula)</Label>
                    <Input
                      value={eventForm.affectedParties.join(", ")}
                      onChange={(e) => setEventForm({ ...eventForm, affectedParties: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                      placeholder="PT, PL, PSDB..."
                      data-testid="input-affected-parties"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Magnitude do Impacto</Label>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">-100%</span>
                      <Slider
                        value={[eventForm.impactMagnitude * 100]}
                        onValueChange={([v]) => setEventForm({ ...eventForm, impactMagnitude: v / 100 })}
                        min={-100}
                        max={100}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-sm text-muted-foreground">+100%</span>
                      <span className="font-medium w-16 text-right">{(eventForm.impactMagnitude * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreate}
                    disabled={createEventMutation.isPending || !eventForm.name || !eventForm.eventDescription}
                    data-testid="button-submit-event"
                  >
                    {createEventMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Criar Previsão
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loadingEvents ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : eventImpacts && eventImpacts.length > 0 ? (
            <div className="space-y-4">
              {eventImpacts.map((event) => (
                <Card key={event.id} data-testid={`card-event-${event.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <CardTitle className="text-base">{event.name}</CardTitle>
                        <CardDescription className="line-clamp-1">{event.eventDescription}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(event.status)}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runEventMutation.mutate(event.id)}
                          disabled={event.status === "running" || runEventMutation.isPending}
                          data-testid={`button-run-event-${event.id}`}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Analisar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteEventMutation.mutate(event.id)}
                          data-testid={`button-delete-event-${event.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {event.status === "completed" && event.beforeProjection && event.afterProjection && (
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg border space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Antes</Badge>
                            <span className="text-sm font-medium">Projeção Pré-Evento</span>
                          </div>
                          {(event.beforeProjection.parties || []).slice(0, 5).map((p: any, i: number) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span>{p.party}</span>
                              <span>{p.voteShare?.toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                        <div className="p-4 rounded-lg border space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge>Depois</Badge>
                            <span className="text-sm font-medium">Projeção Pós-Evento</span>
                          </div>
                          {(event.afterProjection.parties || []).slice(0, 5).map((p: any, i: number) => (
                            <div key={i} className="flex justify-between text-sm">
                              <span>{p.party}</span>
                              <span className="flex items-center gap-1">
                                {p.voteShare?.toFixed(1)}%
                                {p.trend === "growing" && <TrendingUp className="h-3 w-3 text-success" />}
                                {p.trend === "declining" && <TrendingDown className="h-3 w-3 text-destructive" />}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {event.impactDelta && (
                        <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
                          {event.impactDelta.biggestGainer && (
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-success" />
                              <span className="text-sm">
                                <strong>{event.impactDelta.biggestGainer.party}</strong> +{event.impactDelta.biggestGainer.voteShareChange?.toFixed(1)}%
                              </span>
                            </div>
                          )}
                          {event.impactDelta.biggestLoser && (
                            <div className="flex items-center gap-2">
                              <TrendingDown className="h-4 w-4 text-destructive" />
                              <span className="text-sm">
                                <strong>{event.impactDelta.biggestLoser.party}</strong> {event.impactDelta.biggestLoser.voteShareChange?.toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="h-48 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={(() => {
                            const beforeMap = new Map<string, number>((event.beforeProjection.parties || []).map((p: any) => [p.party, p.voteShare || 0]));
                            return (event.afterProjection.parties || []).slice(0, 6).map((p: any) => ({
                              name: p.party,
                              antes: beforeMap.get(p.party) || 0,
                              depois: p.voteShare || 0,
                              variacao: (p.voteShare || 0) - (beforeMap.get(p.party) || 0),
                            }));
                          })()}>
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis yAxisId="left" tickFormatter={(v) => `${v}%`} />
                            <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} />
                            <Tooltip 
                              formatter={(value: number, name: string) => [
                                `${value.toFixed(1)}%`, 
                                name === "antes" ? "Antes" : name === "depois" ? "Depois" : "Variação"
                              ]}
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "var(--radius)" }}
                            />
                            <Legend />
                            <Bar yAxisId="left" dataKey="antes" name="Antes" fill="hsl(210, 30%, 60%)" radius={[4, 4, 0, 0]} />
                            <Bar yAxisId="left" dataKey="depois" name="Depois" fill="hsl(210, 100%, 40%)" radius={[4, 4, 0, 0]} />
                            <Line yAxisId="right" type="monotone" dataKey="variacao" name="Variação" stroke="hsl(45, 100%, 50%)" strokeWidth={2} dot={{ fill: "hsl(45, 100%, 50%)" }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      {event.narrative && (
                        <div className="bg-muted/50 rounded-lg p-4">
                          <p className="text-sm text-muted-foreground">{event.narrative}</p>
                        </div>
                      )}
                      <div className="flex justify-end pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => exportPredictionToPdf({
                            title: event.name,
                            subtitle: `Impacto de Evento: ${event.eventType}`,
                            type: "event",
                            data: event,
                            narrative: event.narrative || undefined,
                          })}
                          data-testid={`button-export-event-${event.id}`}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Exportar PDF
                        </Button>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma previsão de evento criada</p>
              <p className="text-sm">Crie uma nova previsão para analisar impactos</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
