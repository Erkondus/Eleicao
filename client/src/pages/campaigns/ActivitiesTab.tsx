import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Plus, Calendar, Activity, Clock, CheckCircle2, AlertCircle,
  ChevronLeft, ChevronRight as ChevronRightIcon, CalendarDays
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  activityFormSchema, ACTIVITY_TYPES, formatCurrency, formatDate,
  type ActivityFormData, type CampaignDetail
} from "@/hooks/use-campaigns";
import type { UseMutationResult } from "@tanstack/react-query";

interface ActivitiesTabProps {
  campaignDetail: CampaignDetail;
  createActivityMutation: UseMutationResult<any, Error, ActivityFormData, unknown>;
}

export function ActivitiesTab({ campaignDetail, createActivityMutation }: ActivitiesTabProps) {
  const [showActivityDialog, setShowActivityDialog] = useState(false);

  const activityForm = useForm<ActivityFormData>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "",
      scheduledDate: "",
      priority: "medium",
      assignedTo: "",
      estimatedCost: "",
    },
  });

  const handleSubmit = (data: ActivityFormData) => {
    createActivityMutation.mutate(data, {
      onSuccess: () => {
        setShowActivityDialog(false);
        activityForm.reset();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Atividades</h2>
          <p className="text-muted-foreground">Eventos, reuniões e ações de campanha</p>
        </div>
        <Dialog open={showActivityDialog} onOpenChange={setShowActivityDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-activity">
              <Plus className="h-4 w-4 mr-2" />
              Nova Atividade
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Atividade</DialogTitle>
            </DialogHeader>
            <Form {...activityForm}>
              <form onSubmit={activityForm.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={activityForm.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: Comício no Centro" data-testid="input-activity-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={activityForm.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-activity-type">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {ACTIVITY_TYPES.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={activityForm.control}
                    name="scheduledDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Programada</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} value={field.value ?? ""} data-testid="input-activity-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={activityForm.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prioridade</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-activity-priority">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Baixa</SelectItem>
                            <SelectItem value="medium">Média</SelectItem>
                            <SelectItem value="high">Alta</SelectItem>
                            <SelectItem value="critical">Crítica</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={activityForm.control}
                    name="estimatedCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custo Estimado (R$)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} value={field.value ?? ""} data-testid="input-activity-cost" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={activityForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value ?? ""} data-testid="input-activity-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createActivityMutation.isPending} data-testid="button-submit-activity">
                    {createActivityMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Criar Atividade
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {campaignDetail.activities.length > 0 ? (
          campaignDetail.activities.map((activity: any) => (
            <Card key={activity.id} data-testid={`card-activity-${activity.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${
                      activity.status === "completed" ? "bg-green-500/10" :
                      activity.status === "in_progress" ? "bg-blue-500/10" :
                      activity.status === "cancelled" ? "bg-red-500/10" : "bg-gray-500/10"
                    }`}>
                      {activity.status === "completed" ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                       activity.status === "in_progress" ? <Activity className="h-5 w-5 text-blue-500" /> :
                       activity.status === "cancelled" ? <AlertCircle className="h-5 w-5 text-red-500" /> :
                       <Clock className="h-5 w-5 text-gray-500" />}
                    </div>
                    <div>
                      <h4 className="font-semibold">{activity.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {ACTIVITY_TYPES.find(t => t.value === activity.type)?.label} • {formatDate(activity.scheduledDate)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      activity.priority === "critical" ? "destructive" :
                      activity.priority === "high" ? "default" :
                      activity.priority === "medium" ? "secondary" : "outline"
                    }>
                      {activity.priority === "critical" ? "Crítica" :
                       activity.priority === "high" ? "Alta" :
                       activity.priority === "medium" ? "Média" : "Baixa"}
                    </Badge>
                    {activity.estimatedCost && (
                      <span className="text-sm text-muted-foreground">{formatCurrency(activity.estimatedCost)}</span>
                    )}
                  </div>
                </div>
                {activity.description && (
                  <p className="text-sm text-muted-foreground mt-2 ml-14">{activity.description}</p>
                )}
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma atividade</h3>
              <p className="text-muted-foreground">Adicione eventos e ações para sua campanha</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

interface CalendarTabProps {
  calendarActivities: any[] | undefined;
  loadingCalendar: boolean;
}

export function CalendarTab({ calendarActivities, loadingCalendar }: CalendarTabProps) {
  const [calendarDate, setCalendarDate] = useState(new Date());

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold">Calendário de Atividades</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
            data-testid="button-calendar-prev"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium min-w-[150px] text-center">
            {calendarDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
            data-testid="button-calendar-next"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          {loadingCalendar ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
          <>
          <div className="grid grid-cols-7 gap-1">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => (
              <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                {day}
              </div>
            ))}

            {(() => {
              const year = calendarDate.getFullYear();
              const month = calendarDate.getMonth();
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const days = [];

              for (let i = 0; i < firstDay; i++) {
                days.push(<div key={`empty-${i}`} className="p-2 min-h-[100px]" />);
              }

              for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const dayActivities = calendarActivities?.filter((a: any) => {
                  const actDate = new Date(a.scheduledDate);
                  return actDate.getDate() === day &&
                         actDate.getMonth() === month &&
                         actDate.getFullYear() === year;
                }) || [];

                const isToday = new Date().toDateString() === date.toDateString();

                days.push(
                  <div
                    key={day}
                    className={`p-2 min-h-[100px] border rounded-md ${isToday ? 'bg-primary/5 border-primary' : 'border-border'}`}
                    data-testid={`calendar-day-${day}`}
                  >
                    <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : ''}`}>
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayActivities.slice(0, 3).map((activity: any) => (
                        <div
                          key={activity.id}
                          className={`text-xs p-1 rounded truncate ${
                            activity.type === 'event' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                            activity.type === 'meeting' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                            activity.type === 'milestone' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' :
                            'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          }`}
                          title={activity.title}
                        >
                          {activity.title}
                        </div>
                      ))}
                      {dayActivities.length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{dayActivities.length - 3} mais
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return days;
            })()}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span>Evento</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-purple-500" />
              <span>Reunião</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-amber-500" />
              <span>Marco</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>Ação</span>
            </div>
          </div>
          </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Próximas Atividades</CardTitle>
        </CardHeader>
        <CardContent>
          {calendarActivities && calendarActivities.length > 0 ? (
            <div className="space-y-2">
              {calendarActivities
                .filter((a: any) => new Date(a.scheduledDate) >= new Date())
                .slice(0, 5)
                .map((activity: any) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                    <div className="flex items-center gap-3">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{activity.title}</p>
                        <p className="text-sm text-muted-foreground">{formatDate(activity.scheduledDate)}</p>
                      </div>
                    </div>
                    <Badge variant={activity.priority === 'high' ? 'destructive' : activity.priority === 'critical' ? 'destructive' : 'secondary'}>
                      {activity.priority === 'high' ? 'Alta' : activity.priority === 'critical' ? 'Crítica' : activity.priority === 'low' ? 'Baixa' : 'Média'}
                    </Badge>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">Nenhuma atividade programada</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
