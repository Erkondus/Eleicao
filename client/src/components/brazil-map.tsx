import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Building2, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface StateData {
  code: string;
  name: string;
  topCandidates: Array<{ name: string; party: string; votes: number }>;
  topParties: Array<{ name: string; abbreviation: string; votes: number; color: string }>;
  totalVotes: number;
  totalCandidates: number;
}

const BRAZIL_STATES: Record<string, { name: string; path: string }> = {
  AC: {
    name: "Acre",
    path: "M118.2,237.4l-3.2,3.8l-5.1,-0.2l-2.3,-2.3l-3.1,1.6l-1.9,-0.7l-2.2,0.3l-0.9,-1.6l-4.1,-1l-1.3,-4.9l-3.7,-0.4l-1.6,-2.4l-3.8,-1.6l0.5,-2.6l-1.9,-0.8l-0.2,-2.1l-2.3,-0.2l-0.1,-3.4l-3,-1.9l2.6,-7l0.5,-4.3l1.5,-0.5l2.9,2l1.1,-0.8l2.3,0.3l3.9,-2l3.9,0.7l2.7,-0.9l4.1,0.2l0.1,-2.9l4.3,-2.3l2.4,1.5l4.2,-0.3l0.1,10.7l0.5,4.3l2.2,3.6l1.2,5.3l2.3,1.8l0.3,5.9l2.9,3.6l-2.5,2.9z"
  },
  AL: {
    name: "Alagoas",
    path: "M542.3,212.6l6.7,-5.5l7.2,-3.8l5.1,1.6l5.9,3.6l-2.1,2.1l-1.2,3.6l-4.3,5.2l-5.1,-0.3l-3.5,-2.9l-4.4,-0.9l-4.3,-2.7z"
  },
  AP: {
    name: "Amapá",
    path: "M315.5,76.5l-1.3,3.6l-3.7,1.9l-0.1,3.6l2.5,2.6l0.1,4.1l3.7,5.1l4.7,0.9l0.7,3.1l-0.9,7.9l-1.5,2.9l0.2,3.7l-3.2,0.9l-3.9,-0.5l-3.6,-3.7l-5.2,-9.6l-0.5,-4.9l0.9,-6.5l-1.9,-1l-2.9,-4.3l0.3,-5.2l2.1,-2l0.4,-4.7l4.2,0.4l2.5,-0.4l0.6,2.2l4.5,1.1z"
  },
  AM: {
    name: "Amazonas",
    path: "M95.5,127.8l4.7,0.5l2.1,2.5l6.3,3l2.7,-1.7l5.1,0.7l2.5,2l3.6,-0.5l3.7,3.5l2.8,0.2l2.2,-1.9l4,0.2l3.1,3.3l0.2,2.1l6.2,0.6l3.3,-2l4.7,0.3l3.1,-2.7l1.7,0.7l5.2,-0.5l5.7,2.5l3.4,-0.3l1.1,1.7l8.8,2l2.1,3l6.8,2l1.5,3.6l4.7,-0.2l3.2,1.7l2.7,-2l4.7,0.5l2.1,2.8l0.3,4.2l-2.6,3.3l1.9,2.9l-0.2,3.6l3.7,4l0.9,4.9l-1.3,2.9l4.1,2l0.6,3.1l4.3,1.9l-0.2,2.7l2.9,1.5l0.5,5l-0.5,1.2l3.5,3.9l-0.5,2.9l-2.7,1.2l-0.9,2.6l1.7,4.5l-0.2,3.5l-2.9,-0.1l-4.6,-4.1l-4.6,-1.6l-9,-0.9l-2.9,-2.4l-3.6,0.2l-2.9,1.7l-5.9,-0.7l-1.8,0.8l-4,-0.4l-5.5,1.7l-1.3,2l-4.7,-0.1l-3.7,1.7l-2.9,-0.5l-1.1,-4.1l-2.7,-3l-1,-4.3l-3.9,-2l-6.2,0.7l-3.6,-3.2l-4.4,0.3l-1.4,-3.9l-2.5,-1.9l0.5,-3.3l-2.9,-2.9l-1.7,-5.7l-2.1,-2.2l0.2,-3.5l-4,-2.9l-1.7,-4l-1.5,-0.5l0.7,-5.1l-1.9,-1.1l-1.5,-4.3l-4.4,-4.2l-0.2,-2.6l-6,-2.1l-4.9,-5.1l0.5,-2l-2.6,-2.1l-0.5,-2.4l-3.8,-3.5l2.8,-3.6l5.7,-3.2l2,-0.2l0.8,2.4l4.8,1.7z"
  },
  BA: {
    name: "Bahia",
    path: "M453.5,189.8l6.4,1.1l3.9,3.8l7.6,-0.7l3.7,0.6l0.5,5.4l7.2,3.6l4.7,-1l3.5,1.6l6.1,0.2l6.6,-4l9.2,-1.6l5.9,-0.1l3.6,-3.5l5.8,-3.7l3.6,-0.5l3.4,0.8l9,5.1l0.9,6.1l3.5,2.7l5.7,1.9l0.7,2.4l-1.4,5.1l0.9,6.2l4.6,3.6l0.2,4.9l-1.9,12.9l-1.2,3.3l1.6,3l-1.7,3.5l-3.4,1.7l0.2,3.6l-3.7,5.7l-1,5.3l-3.7,3.5l-1.7,5.1l-3.7,3.2l-0.5,2.8l-4.5,3.4l-0.7,7.1l-2.5,2.9l-1.2,5.6l-4.9,5.6l-0.5,3l-5.9,0.1l-7.9,-1.9l-2.5,0.6l-9.4,-3.4l-7.9,-0.1l-4,-1.4l-6.5,2l-5,0.2l-5.1,-4.5l1,-5.5l-1.1,-5.7l0.9,-11.5l-1.6,-2.9l0.4,-4.1l-4.5,-5.2l-0.6,-3.9l0.9,-7.5l-1.2,-7.2l-2.7,-3.5l-0.2,-2.8l0.9,-6.6l-1,-9.5l-2.1,-3.9l-0.6,-4.5l1.5,-9.2l-2.9,-5.9l1,-4l7.9,-1z"
  },
  CE: {
    name: "Ceará",
    path: "M502.3,141.6l4.9,0.7l3.3,1.4l3.1,-0.2l6.6,2.9l5.9,-0.7l4.7,0.9l3.7,3.2l3.6,-0.5l4.1,1.2l4.7,-1.9l-0.4,5.7l0.7,4l-1.9,4.2l-0.2,5.9l-2.3,3l-3.7,0.9l-2.4,4.6l-4.7,3.9l-6.2,3.1l-1.9,-0.9l-2.7,1.4l-1,3l-3.1,-0.5l-0.9,2.3l-4.4,1.1l-6.1,-1.7l-3.2,0.2l-5.7,3.9l-5.2,0.3l-0.7,-7.6l-2.5,-5.6l1.2,-8.6l2.7,-5.4l0.2,-3.1l4.5,-5.9l0.9,-6.6l2.1,-4.6l3.9,-3z"
  },
  DF: {
    name: "Distrito Federal",
    path: "M385.8,276.8l4.3,0.7l3.5,4l-0.5,4.7l-3.1,2.6l-4.9,-0.5l-2.4,-3.4l0.2,-6.1z"
  },
  ES: {
    name: "Espírito Santo",
    path: "M493.2,308.8l3.4,0.5l5.2,4.4l4.7,0.9l-0.4,5.4l1.2,6.2l4.5,5.5l-0.7,8.4l-3.1,6.2l-6.4,-0.2l-7.7,-5.7l-0.5,-4.5l-2.1,-3.5l1.2,-8.5l-1.5,-5.2l2.2,-9.9z"
  },
  GO: {
    name: "Goiás",
    path: "M342.3,256.8l5.1,1.2l5,3.2l1.5,2.9l4.1,1.2l4.6,-0.7l4.4,0.9l7.1,-0.4l4.5,1.5l4.7,-3.2l4.1,-0.7l3.7,0.5l3.1,2.6l0.2,2.1l3,1.5l5.7,1.2l0.9,2.6l-0.4,4.3l2.4,2.6l-0.2,2.6l0.9,3.2l-2.1,3.8l2.2,6l-0.5,2.9l2.1,1.2l-0.4,2.9l-3.4,2.4l-2.4,0.4l-0.5,3.8l-5.2,4.4l-2.5,0.7l-0.2,2.1l-5.8,5.1l-2.1,0.7l-3.6,-0.9l-2.2,1.4l-0.4,3.1l-3.9,-0.5l-5.4,1.6l-2.3,-0.4l-4.4,3.8l-3.4,-0.4l-2.2,-2.6l-5.2,-0.6l-1.9,2.7l-3.4,-0.2l-3.8,2.4l-0.7,-3.6l1.8,-3.2l0.5,-5.1l2.9,-0.4l2.2,-4.5l-0.6,-2.1l3.3,-6.9l-0.5,-2.9l-1.9,-1l0.3,-6.3l2.6,-3l-0.1,-3.3l1.9,-7.4l-0.3,-3.2l-1.9,-3l0.1,-5.6l1.8,-3l-2.3,-1.3l-1.2,-3.4z"
  },
  MA: {
    name: "Maranhão",
    path: "M405.5,127.3l3.6,0.2l3.9,4.7l7.4,0.5l0.9,2.7l5.7,2.7l-0.7,6.2l0.7,3.9l1.8,2.5l-1.2,3.7l-0.1,5.1l3.6,3.2l1.9,5.1l0.2,5.1l-2.4,5.2l-4.9,0.7l-2.4,-2.5l-5.4,1.3l-3.6,-0.9l-3.6,0.4l-0.9,2.2l-2.8,-0.5l-1.6,-2.6l-4.4,0.2l-2.3,2.9l-3.7,-0.5l-5.1,0.7l-8,-1l0.3,-3.9l-1.5,-0.5l-0.9,-3.6l-4.7,-4.2l-0.7,-5.7l-4.3,-0.7l-1.6,-5.3l0.4,-3l-2.6,-1l-0.4,-3.7l3.9,-0.4l-0.4,-5.2l0.9,-4.6l1.6,-0.7l1.1,-4.9l6.7,-1.5l0.9,1.7l3.1,-1.4l5.4,0.4l3.7,-1.2l2.9,0.7l5.7,-2.2l0.5,-2.9l5.4,-1z"
  },
  MT: {
    name: "Mato Grosso",
    path: "M268.4,189.4l5.4,1.2l8.3,8.7l10.3,3.6l0.9,3.4l2.7,2.9l-0.4,9.9l5.1,2.1l1.7,2.7l0.2,7.7l4.4,3.9l0.2,4.4l1.5,0.4l1,5.7l4.2,5.4l-0.7,5.6l0.7,2.1l6,1.2l0.5,2.9l7.1,4.4l1.7,3.7l-1.8,3.1l-0.1,5.6l1.9,3l0.3,3.2l-1.9,7.4l0.1,3.3l-2.6,3l-0.3,6.3l1.9,1l0.5,2.9l-6.9,-1.6l-15.5,-0.4l-3.4,-1.3l-14.5,0.7l-23.9,-0.7l0.4,-8.6l-1.9,-4.8l1.1,-12l-1.6,-10.9l1,-18.9l-4,-7.5l-0.7,-9.9l-2.3,-4.9l1.9,-8.7l3.6,-5.7l-0.2,-5.2l6.4,-7.8l1.9,-6.2z"
  },
  MS: {
    name: "Mato Grosso do Sul",
    path: "M298.1,314.9l2.7,3.2l3.5,0.4l2.3,3.2l8.4,2.2l4.9,2.7l4.1,0.4l3.4,-0.9l5.1,3.1l5.6,-0.4l4.3,1.1l3.2,-2.6l5,3.4l3.9,-0.9l3.9,-4.1l1.1,-4.9l4.6,-4.6l-0.2,-3.4l2.6,-5.1l-0.2,-4.1l1.2,-6.6l2.1,1l2.1,-0.9l5.4,3.2l0.2,2.8l4.6,1.1l2.9,3.2l-0.5,10.4l-1.4,3.3l2.4,3.7l-1.6,2.7l-2.2,8.9l-2.7,2.5l0.9,5.2l-1.2,3.9l-4.7,2.2l-2.1,2.9l-7.3,4.4l-3.3,4.1l-5.6,4.3l-4.9,0.6l-1.1,2l-9.7,4.7l-4,-1.9l-3.9,0.8l-3.9,-4.9l-5.6,-1.6l-2.5,-2.4l-3.5,0.3l-2.9,-1l-2,1.1l-5.9,-0.7l-5.5,2.3l-0.4,-8.9l1.3,-4.9l-1.7,-2.9l0.2,-9.2l-2.4,-4.5l1.7,-6.9z"
  },
  MG: {
    name: "Minas Gerais",
    path: "M393.8,274.9l5.9,0.7l1.2,2.4l4.5,1.2l1.1,-2l5.1,0.5l6.4,-2.6l2.6,0.2l2.1,2.7l4.2,0.2l5,2.4l2,3.6l4.2,0.7l6.2,3.4l2.5,-0.4l0.5,2.4l6.9,3.4l3.9,-0.9l3.9,2.1l3.7,-0.4l5.9,3.6l5.7,0.2l-0.2,4.1l2.4,2.2l-0.2,2.7l-2.5,2.4l-1.9,4.1l1.2,3.4l1.9,1.2l-0.7,5.4l-5,8.6l0.4,4.2l4.9,5.6l0.4,2.1l3,1.4l-0.1,4.8l-4.6,2.1l0.2,3l-2.2,1l-4,-0.6l-1.5,3.4l-4.6,0.2l-2.9,-2.2l-3.7,0.7l-3.5,-4.5l-3.7,-1.2l-0.4,-2.2l-3.4,-2l-4.2,-0.4l-1.1,1.8l-4.8,-0.6l-2.8,2l-4.9,-4.2l-5.4,0.2l-1.5,-2.2l-1.6,0.6l-3.9,-2.1l-2.1,0.4l-2.1,-1.9l-2.8,1.1l-0.5,-1.1l-4.7,-0.9l-1.9,0.6l-2.2,-4.5l-4,-1.7l-0.5,-2.7l2.5,-0.7l0.4,-3.4l2.4,-0.4l3.4,-2.4l0.4,-2.9l-2.1,-1.2l0.5,-2.9l-2.2,-6l2.1,-3.8l-0.9,-3.2l0.2,-2.6l-2.4,-2.6l0.4,-4.3l-0.9,-2.6l-5.7,-1.2l-3,-1.5l-0.2,-2.1l-3.1,-2.6l-3.7,-0.5l-4.1,0.7z"
  },
  PA: {
    name: "Pará",
    path: "M262.4,89.5l3.6,-0.4l3.3,3.1l3.1,-1.9l5.7,0.7l1.2,-2.9l7.6,-0.9l2.4,-2.2l3.2,0.9l5.6,-2.9l0.5,-3.9l2.6,-0.7l0.2,-2.2l5.2,-0.6l0.5,2.5l5.9,2.2l4.4,-0.5l0.9,-3.4l8.9,0.2l4.1,-1.5l-0.2,4.6l3,4.4l1.8,0.9l-0.9,6.4l0.5,4.8l5.3,9.8l3.4,3.5l3.9,0.5l3.1,-0.9l-0.2,-3.7l1.5,-2.9l0.9,-8l-0.8,-3l3,-1.8l2.1,0.9l7.6,8.5l3.9,1.3l0.2,3.5l3.6,0.5l3.7,4.5l7.7,0.7l2.2,1.7l0.5,2.4l4.6,2.6l6.4,0.2l-1.9,3.3l-0.8,4.6l0.4,5.1l-3.9,0.5l-1.7,-2.1l-5.7,-2.9l-0.9,2.9l-5.4,1l-0.5,2.9l-5.7,2.2l-2.9,-0.7l-3.7,1.2l-5.4,-0.4l-3.1,1.4l-0.9,-1.7l-6.7,1.5l-1.1,4.9l-1.6,0.7l-0.9,4.6l0.4,5.2l-3.9,0.4l0.4,3.7l2.6,1l-0.4,3l1.6,5.3l4.3,0.7l0.7,5.7l4.7,4.2l0.9,3.6l1.5,0.5l-0.3,3.9l-17.9,-0.2l-0.6,-1.9l-4.9,-0.2l-2.4,-4.4l-6.9,-0.1l-1.6,-4.2l-6.6,0.2l-3.9,-8.9l-5,-0.5l-3.9,-3.5l-5.7,0.7l-2.3,-3.9l-2.9,-1.4l-4.7,0.3l-0.6,-3.1l-4.1,-2l1.3,-2.9l-0.9,-4.9l-3.7,-4l0.2,-3.6l-1.9,-2.9l2.6,-3.3l-0.3,-4.2l-2.1,-2.8l-4.7,-0.5l-2.7,2l-3.2,-1.7l-4.7,0.2l-1.5,-3.6l-6.8,-2l-2.1,-3l-8.8,-2l-1.1,-1.7l-3.4,0.3l-5.7,-2.5l-5.2,0.5l-1.7,-0.7l-3.1,2.7l-4.7,-0.3l-3.3,2l-6.2,-0.6l-0.2,-2.1l1.6,-5.2l6.2,-6.1l0.1,-3.6l1.9,-2.1l1,-4.1l3.2,-1.5l2.7,0.4l0.5,-3.6l6.7,-0.5l2.6,1.2l3.6,-2.5l0.1,-3l3.7,-2.7l3.9,-0.1l0.4,-4.3l3,-2.7l-0.9,-1.9l2.1,-2.3l1,1.8l6.9,-0.2l3.5,-3.2l8.5,-3.2z"
  },
  PB: {
    name: "Paraíba",
    path: "M546.5,175.3l-0.9,4.9l1.5,2.2l-1.2,2.4l0.7,2.5l-0.5,3.6l4.3,2.7l4.4,0.9l3.5,2.9l5.1,0.3l-4.1,3.1l-9.1,4.6l-5.1,-0.7l-2.1,0.6l-4.9,-3l-3.4,0.7l-7.6,-0.2l-3.9,-0.9l0.7,-3.4l1.9,-0.6l3.1,-5.4l4.7,-1.5l2.1,-2.9l0.9,-3.9l5.5,-4.7l4.4,-4.6z"
  },
  PE: {
    name: "Pernambuco",
    path: "M491.8,194.2l3.9,0.9l7.6,0.2l3.4,-0.7l4.9,3l2.1,-0.6l5.1,0.7l9.1,-4.6l4.1,-3.1l4.3,-5.2l1.2,-3.6l2.1,-2.1l0.1,4.7l-3.1,3.8l-1,5.8l0.5,3.9l-3.7,1l-7.6,5.7l-4.9,0.7l-1.5,3.2l-9.7,0.6l-3.6,1.1l-1.9,-0.7l-3.6,0.6l-1.7,2.4l-6,0.1l-2.9,-2.4l1.2,-5.2l2.4,-5.1l0.9,1.4l3.3,-3.8z"
  },
  PI: {
    name: "Piauí",
    path: "M452.9,138.9l5,1l8,1l5.1,-0.7l3.7,0.5l2.3,-2.9l4.4,-0.2l1.6,2.6l2.8,0.5l0.9,-2.2l3.6,-0.4l3.6,0.9l5.4,-1.3l2.4,2.5l4.9,-0.7l2.4,-5.2l-3.9,-3l0.2,-3.9l2.2,-5.4l-0.5,-4.6l4.5,-6.4l-0.5,-5.6l0.7,-2.4l-1.7,-5.6l4.5,0.5l6,-0.9l5.9,4.6l0.4,5.6l-4.5,6.4l0.5,4.6l-2.2,5.4l-0.2,3.9l3.9,3l-0.2,5.1l-2.1,4.6l-0.9,6.6l-4.5,5.9l-0.2,3.1l-2.7,5.4l-1.2,8.6l2.5,5.6l0.7,7.6l-4.9,-0.2l-6.4,1.4l-6.4,0.2l-0.2,5.6l-3.1,2.4l-3.9,-0.9l-6.1,-3.6l-3.6,0.2l-0.2,-5.6l1,-4.2l-3,-4.6l-0.2,-4.9l-1.6,-4.4l1.6,-10.6l-4,-6.4l-0.2,-7.2l-4,-3.4z"
  },
  PR: {
    name: "Paraná",
    path: "M317.3,356.9l1.3,2.9l4.7,4.4l6.5,3l5.1,0.2l3.4,2.7l6.5,0.7l6.7,4.9l4.4,1.5l4.4,3.4l1.6,-0.5l4.3,1.8l2.2,-2.2l2.7,0.7l3.5,-3l3.4,-0.4l3.1,0.7l2.3,-0.9l0.2,2.1l3.7,2.1l0.7,1.9l3.4,1.5l0.7,2.4l3.5,2.7l-0.5,4.9l2,0.4l-0.7,4.3l-1.7,3.4l-3.8,3.2l-2.7,5.2l-4.1,2.3l-2.7,4l-4.4,2.3l-3.7,-2.2l-5.9,-1.2l-4,-0.2l-2.1,-1.6l-3.2,0.6l-4.3,-1.7l-2.6,0.7l-4.9,-0.2l-3.4,-2.3l-5.8,-0.6l-3.5,-2.4l-1.4,-4.3l-2.7,-1.5l-0.9,-3.7l-4.5,-1l-2.5,0.3l-2.9,-5.4l-1.2,-6.7l0.7,-3.5l-0.9,-6.6l0.5,-2.6l4.7,-3.5l1.9,0.5l5.1,-3.2z"
  },
  RJ: {
    name: "Rio de Janeiro",
    path: "M460.3,347.9l2.5,1.3l6.1,0.2l4.9,1.9l5,4.2l3.5,4.3l5.4,4l4.8,1.9l4.7,-2.2l4.5,1.5l1.5,2.8l-2.8,4.8l-0.7,5l1.2,2.3l-5.1,2.7l-5.4,-0.2l-4.8,1.7l-4.4,0l-6,-2.8l-5.9,-0.5l-3.7,-2.8l-4.4,-1.1l-4.9,0.6l0.5,-4.5l-0.9,-2.8l1.2,-3.4l-1.1,-3.9l0.2,-1.2l2.5,-5.9l2.2,-3.1l0.5,-4z"
  },
  RN: {
    name: "Rio Grande do Norte",
    path: "M546.5,175.3l4.9,-0.5l3.6,-3.4l3.6,-1.5l3.4,0.9l6.7,-0.2l2.6,2l-1.4,4.1l-4.8,2.7l-6.7,2.1l-5.2,0.3l-3.2,-0.6l-3.2,0.8l-1.4,-1.6l0.5,-3.6l-0.7,-2.5l1.2,-2.4l-1.5,-2.2l0.9,-4.9l0.7,5.6z"
  },
  RO: {
    name: "Rondônia",
    path: "M199.5,207.9l3.5,1.2l2.5,3.8l3.5,0.4l2.4,1.9l7,2.9l2.7,-0.2l2.4,2.2l3.5,0.5l0.3,3.3l1.4,3.7l2.7,2.9l1,5.2l2.9,2.7l-0.5,5.3l0.5,4.7l-0.9,10.5l1.2,3.9l-0.6,5l-5,-2.4l-3.6,0.7l-2.4,-0.5l-1.4,2.8l-5.4,-1.5l-2.4,0.6l-3.1,-2.5l-8.7,-0.5l-1.3,-3.1l-2.4,-0.7l-0.5,-4.6l-2.4,-2l1.1,-5.7l-2.9,-2.2l-0.7,-3.7l-3.1,-2.7l1.1,-4.5l-1.6,-3.9l1.4,-1.7l-0.8,-2.1l2.5,-2.9l-2.9,-3.6l-0.3,-5.9l-2.3,-1.8l-1.2,-5.3l-2.2,-3.6l-0.5,-4.3l-0.1,-10.7l7.3,0.9l3.6,2.4l4,4.9l2.3,0.3l4,4.9z"
  },
  RR: {
    name: "Roraima",
    path: "M170,22.2l4.2,1.3l2.3,3.8l1.3,4l1.7,4l-0.5,4.1l2.1,2.2l-0.4,3.9l1.6,2.6l4.7,3.6l4.9,-0.5l4.9,3.1l2.8,-0.5l3.8,4.9l3.9,1.3l0.5,1.2l-0.5,3.4l0.5,6.7l-2.6,2.2l-2.7,0.5l-0.7,1.7l-4.4,1.4l-0.9,2.1l-3.5,0.5l-0.8,2.4l-4.8,-1.7l-0.8,-2.4l-2,0.2l-5.7,3.2l-2.8,3.6l-3.5,0.7l-2.7,-0.7l-3.4,0.2l-3.3,-3.9l0.5,-4.1l-1.8,-2.3l-0.2,-3.2l-4.9,-1.4l-2,-2.9l-0.7,-3.4l1.7,-3.9l-0.7,-3.2l-3.6,-1.2l-3.5,-2.6l0.3,-2.5l1.7,-2.8l3.4,-0.7l1.4,-2.7l0.2,-4.4l-1.5,-2.5l1,-3.2l4.1,-3.8l3.7,2.2l3.4,-0.2l1,-1.5l4.1,-2.4l0.7,-2.1z"
  },
  RS: {
    name: "Rio Grande do Sul",
    path: "M316.5,388.5l3.6,2.8l1.3,3.7l5.5,4.9l0.5,3.8l-0.5,5.9l1.7,4.9l2.5,3.3l3.8,3.7l3.9,1.9l6.2,6.7l0.2,4.4l-0.5,4.4l0.9,4.1l-0.4,3.4l-2.1,0.5l-4.6,4.4l-3.7,-0.3l-6.8,1.9l-4.1,3.7l-3,5.7l0.2,3.4l-1.7,3.1l-7.9,5.4l-5.7,-0.3l-5.2,-2.6l-3.8,-0.2l-5.4,-2.7l-2.6,0.6l-5.1,-2.4l-3.9,1l-2.4,-1.3l-4,0.8l-6.3,-4.7l-2,-3.9l0.2,-4.1l-2.6,-0.7l-1.3,-4.2l0.4,-4.3l-2.4,-1.3l-0.5,-5.7l2.1,-2l-0.2,-3.9l1.7,-4.8l-0.2,-4.3l2.5,-4.9l0.2,-5.4l4.2,-1l1.4,-2.9l0.2,-4.3l3.4,-6.6l6.5,-5.3l4.1,-1.2l6.1,-5l1.7,-5.7l3,-2l2.4,1.3l6,0.1l4.3,1.1l3.9,-0.3l0.9,-3.1l2.3,0.4l5.9,3.4l3.4,-0.2z"
  },
  SC: {
    name: "Santa Catarina",
    path: "M339.3,388l3.5,0.2l2.6,-1.4l3.4,1l4.6,0.2l2.3,1.8l4.5,0.2l5.5,1.5l4,2.2l3.6,-0.2l3.7,2.2l-3.7,3.4l-1.2,3.4l-5.1,7.8l-0.5,3.1l-0.3,4.6l-3.9,2l-5.6,0.2l-4.5,-1l-7.6,1.5l-0.5,1.7l-3.4,0.2l-5.9,-3.4l-2.3,-0.4l-0.9,3.1l-3.9,0.3l-4.3,-1.1l-6,-0.1l-2.4,-1.3l-3,2l-1.6,-0.3l0.8,-6.5l-0.9,-3.6l1,-2.6l-1.1,-4.2l3.7,-4.7l5.5,-3.2l7,-2.7l4.5,-0.2l4.7,-2.5l3,-0.2z"
  },
  SE: {
    name: "Sergipe",
    path: "M542.5,232.1l3.9,-0.5l3.1,2.5l3.6,1.5l-1.7,5.7l0.6,4.2l-2.9,2.6l-2.4,-0.4l-5,-4.2l-0.7,-5.6l1.5,-5.8z"
  },
  SP: {
    name: "São Paulo",
    path: "M365.6,324.7l2.7,-0.6l1.4,-3.6l3.9,-0.2l3.2,-2.1l2.6,0.6l3,-1.2l3.9,2.1l1.6,-0.6l1.5,2.2l5.4,-0.2l4.9,4.2l2.8,-2l4.8,0.6l1.1,-1.8l4.2,0.4l3.4,2l0.4,2.2l3.7,1.2l3.5,4.5l3.7,-0.7l2.9,2.2l4.6,-0.2l1.5,-3.4l4,0.6l2.2,-1l-0.2,-3l4.6,-2.1l0.1,-4.8l4.7,2l1,5.6l5.1,4.4l-0.2,4.8l0.7,3.2l-4.5,4.9l-0.5,4.4l-0.4,0l-6.1,-0.2l-2.5,-1.3l-1.9,0.2l-0.5,4l-2.2,3.1l-2.5,5.9l-3.7,-2.1l-5.6,-0.4l-4,-2.2l-5.7,0.5l-4.1,-2.6l-2,0.2l-4.2,-1.8l-4.2,1.8l-5.7,0.5l-2.8,2.7l-1.4,-3.6l-2.7,-2.4l0.5,-4.1l-2,-3.7l-0.3,-4.2l-2.8,-2.7l-1,-3.4l-3.5,-0.6l-1,-5.8l-0.8,-0.5l-1.2,-3.9l-0.3,-4.2z"
  },
  TO: {
    name: "Tocantins",
    path: "M375.8,179.9l17.9,0.2l0.5,9.6l1.1,2.4l-0.5,5.7l0.7,6.7l3.4,2.7l0.2,3l2.7,2.2l-0.5,3.7l2.7,4.7l-1.2,2.6l2.7,2.1l1.7,5.3l3.5,3.3l-1.2,2l2.4,5.3l-0.7,4.2l1.9,2.6l-0.5,2.4l-4.6,2.2l-2.7,-0.7l-6.1,-3.2l-3.4,0.9l-4.2,-0.2l-2.1,-2.7l-2.6,-0.2l-6.4,2.6l-5.1,-0.5l-1.1,2l-4.5,-1.2l-6.1,-0.9l1.1,3.5l2.3,1.3l-1.8,3l-4.7,3.2l-4.5,-1.5l-7.1,0.4l-4.4,-0.9l-4.6,0.7l-4.1,-1.2l-1.5,-2.9l-5,-3.2l-0.6,-3.3l-7.1,-4.4l-0.5,-2.9l-6,-1.2l-0.7,-2.1l0.7,-5.6l-4.2,-5.4l-1,-5.7l-1.5,-0.4l-0.2,-4.4l-4.4,-3.9l-0.2,-7.7l-1.7,-2.7l-5.1,-2.1l0.4,-9.9l-2.7,-2.9l-0.9,-3.4l2.8,-0.2l5.2,0.5l3.9,3.5l5.7,-0.7l5,0.5l3.9,8.9l6.6,-0.2l1.6,4.2l6.9,0.1l2.4,4.4l4.9,0.2l0.6,1.9l16.9,0.2z"
  }
};

const DEFAULT_COLOR = "hsl(210, 100%, 40%)";
const HOVER_COLOR = "hsl(45, 100%, 50%)";
const SELECTED_COLOR = "hsl(210, 100%, 25%)";

export function BrazilMap() {
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const { data: stateData, isLoading: stateLoading } = useQuery<StateData>({
    queryKey: ["/api/electoral-data/state", selectedState],
    enabled: !!selectedState && showDialog,
  });

  const handleStateClick = (stateCode: string) => {
    setSelectedState(stateCode);
    setShowDialog(true);
  };

  const chartColors = [
    "hsl(210, 100%, 30%)",
    "hsl(45, 100%, 50%)",
    "hsl(145, 63%, 42%)",
    "hsl(4, 84%, 49%)",
    "hsl(280, 60%, 40%)",
    "hsl(200, 80%, 50%)",
    "hsl(30, 90%, 50%)",
    "hsl(320, 70%, 50%)",
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg">Mapa do Brasil</CardTitle>
          <CardDescription>Clique em um estado para ver os dados eleitorais</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative flex items-center justify-center">
          <svg
            viewBox="70 0 530 500"
            className="w-full max-w-lg h-auto cursor-pointer"
            data-testid="brazil-map-svg"
          >
            {Object.entries(BRAZIL_STATES).map(([code, state]) => (
              <path
                key={code}
                d={state.path}
                fill={
                  selectedState === code
                    ? SELECTED_COLOR
                    : hoveredState === code
                    ? HOVER_COLOR
                    : DEFAULT_COLOR
                }
                stroke="hsl(var(--background))"
                strokeWidth="1"
                className="transition-colors duration-200"
                onMouseEnter={() => setHoveredState(code)}
                onMouseLeave={() => setHoveredState(null)}
                onClick={() => handleStateClick(code)}
                data-testid={`state-${code}`}
              >
                <title>{state.name}</title>
              </path>
            ))}
          </svg>
          {hoveredState && (
            <div className="absolute top-2 left-2 bg-card border rounded-md px-3 py-1 shadow-sm">
              <span className="font-medium">{BRAZIL_STATES[hoveredState]?.name}</span>
              <span className="text-muted-foreground ml-2">({hoveredState})</span>
            </div>
          )}
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-state-summary">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2" data-testid="text-state-name">
                <Building2 className="h-5 w-5" />
                {selectedState && BRAZIL_STATES[selectedState]?.name} ({selectedState})
              </DialogTitle>
              <DialogDescription>
                Resumo dos dados eleitorais do estado
              </DialogDescription>
            </DialogHeader>

            {stateLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : stateData ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Users className="h-4 w-4" />
                        Total de Candidatos
                      </div>
                      <div className="text-2xl font-bold mt-1" data-testid="text-total-candidates">
                        {stateData.totalCandidates.toLocaleString("pt-BR")}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <TrendingUp className="h-4 w-4" />
                        Total de Votos
                      </div>
                      <div className="text-2xl font-bold mt-1" data-testid="text-total-votes">
                        {stateData.totalVotes.toLocaleString("pt-BR")}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Candidatos Mais Votados
                  </h4>
                  <div className="space-y-2" data-testid="list-top-candidates">
                    {stateData.topCandidates.map((candidate, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg border" data-testid={`row-candidate-${i}`}>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{i + 1}º</Badge>
                          <div>
                            <div className="font-medium">{candidate.name}</div>
                            <div className="text-sm text-muted-foreground">{candidate.party}</div>
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          {candidate.votes.toLocaleString("pt-BR")} votos
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Partidos Mais Votados
                  </h4>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stateData.topParties} layout="vertical">
                        <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="abbreviation" width={60} />
                        <Tooltip
                          formatter={(value: number) => [value.toLocaleString("pt-BR"), "Votos"]}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "var(--radius)",
                          }}
                        />
                        <Bar dataKey="votes" radius={[0, 4, 4, 0]}>
                          {stateData.topParties.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color || chartColors[index % chartColors.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum dado eleitoral disponível para este estado</p>
                <p className="text-sm mt-2">Importe dados do TSE para visualizar estatísticas</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}