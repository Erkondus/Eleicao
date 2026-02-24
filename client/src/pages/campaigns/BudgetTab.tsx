import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import {
  budgetFormSchema, BUDGET_CATEGORIES, formatCurrency,
  type BudgetFormData, type CampaignDetail
} from "@/hooks/use-campaigns";
import type { UseMutationResult } from "@tanstack/react-query";

interface BudgetTabProps {
  campaignDetail: CampaignDetail;
  createBudgetMutation: UseMutationResult<any, Error, BudgetFormData, unknown>;
}

export function BudgetTab({ campaignDetail, createBudgetMutation }: BudgetTabProps) {
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);

  const budgetForm = useForm<BudgetFormData>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      category: "",
      categoryLabel: "",
      allocatedAmount: "0",
      notes: "",
    },
  });

  const budgetChartData = campaignDetail?.budgets?.map((b: any) => ({
    name: b.categoryLabel,
    allocated: parseFloat(b.allocatedAmount || 0),
    spent: parseFloat(b.spentAmount || 0),
  })) || [];

  const handleSubmit = (data: BudgetFormData) => {
    createBudgetMutation.mutate(data, {
      onSuccess: () => {
        setShowBudgetDialog(false);
        budgetForm.reset();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Orçamento da Campanha</h2>
          <p className="text-muted-foreground">Gerencie a alocação de recursos financeiros</p>
        </div>
        <Dialog open={showBudgetDialog} onOpenChange={setShowBudgetDialog}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-budget">
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Categoria
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Categoria de Orçamento</DialogTitle>
            </DialogHeader>
            <Form {...budgetForm}>
              <form onSubmit={budgetForm.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={budgetForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria</FormLabel>
                      <Select onValueChange={(value) => {
                        field.onChange(value);
                        const label = BUDGET_CATEGORIES.find(c => c.value === value)?.label || "";
                        budgetForm.setValue("categoryLabel", label);
                      }}>
                        <FormControl>
                          <SelectTrigger data-testid="select-budget-category">
                            <SelectValue placeholder="Selecione a categoria" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {BUDGET_CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={budgetForm.control}
                  name="allocatedAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor Alocado (R$)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} data-testid="input-budget-amount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={budgetForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value ?? ""} data-testid="input-budget-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createBudgetMutation.isPending} data-testid="button-submit-budget">
                    {createBudgetMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Adicionar
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {budgetChartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={budgetChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                    <YAxis tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="allocated" name="Alocado" fill="#003366" />
                    <Bar dataKey="spent" name="Gasto" fill="#FFD700" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-12">Nenhum orçamento definido</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detalhamento</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Alocado</TableHead>
                  <TableHead className="text-right">Gasto</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignDetail.budgets.map((budget: any) => (
                  <TableRow key={budget.id} data-testid={`row-budget-${budget.id}`}>
                    <TableCell>{budget.categoryLabel}</TableCell>
                    <TableCell className="text-right">{formatCurrency(budget.allocatedAmount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(budget.spentAmount)}</TableCell>
                    <TableCell className="text-right">
                      {Math.round((parseFloat(budget.spentAmount || 0) / parseFloat(budget.allocatedAmount || 1)) * 100)}%
                    </TableCell>
                  </TableRow>
                ))}
                {campaignDetail.budgets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nenhum orçamento definido
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
