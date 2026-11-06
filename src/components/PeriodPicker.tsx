import { useState } from "react";
import { format, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";

export const PERIOD_PRESETS = [
  { v: "today", l: "Hoje" },
  { v: "week", l: "Esta semana (seg–dom)" },
  { v: "lastweek", l: "Semana passada" },
  { v: "month", l: "Este mês" },
  { v: "lastmonth", l: "Mês passado" },
  { v: "7", l: "Últimos 7 dias" },
  { v: "30", l: "Últimos 30 dias" },
  { v: "90", l: "Últimos 90 dias" },
  { v: "365", l: "Último ano" },
];

export type PeriodState = { period: string; start?: Date; end?: Date };

/** Converte a escolha em intervalo [from, to] (dias inteiros). Semanas vão de segunda a domingo. */
export function resolvePeriod({ period, start, end }: PeriodState): { from: Date; to: Date } | null {
  const now = new Date();
  const s0 = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const e0 = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  switch (period) {
    case "today": return { from: s0(now), to: e0(now) };
    case "week": return { from: s0(startOfWeek(now, { weekStartsOn: 1 })), to: e0(endOfWeek(now, { weekStartsOn: 1 })) };
    case "lastweek": { const w = subWeeks(now, 1); return { from: s0(startOfWeek(w, { weekStartsOn: 1 })), to: e0(endOfWeek(w, { weekStartsOn: 1 })) }; }
    case "month": return { from: s0(startOfMonth(now)), to: e0(endOfMonth(now)) };
    case "lastmonth": { const m = subMonths(now, 1); return { from: s0(startOfMonth(m)), to: e0(endOfMonth(m)) }; }
    case "custom": return start && end ? { from: s0(start), to: e0(end) } : null;
    default: { const d = parseInt(period) || 30; const f = new Date(now); f.setDate(f.getDate() - d + 1); return { from: s0(f), to: e0(now) }; }
  }
}

export const inPeriod = (r: { from: Date; to: Date } | null, iso: string) => {
  if (!r) return false;
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return d >= r.from && d <= r.to;
};

export const ymd = (d: Date) => format(d, "yyyy-MM-dd");

export default function PeriodPicker({ value, onChange, className }: { value: PeriodState; onChange: (v: PeriodState) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const { period, start, end } = value;
  const label = period === "custom"
    ? start ? `${format(start, "dd/MM/yyyy")} até ${end ? format(end, "dd/MM/yyyy") : "…"}` : "Escolha o período"
    : PERIOD_PRESETS.find(p => p.v === period)?.l ?? "Período";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={className ?? "w-64 justify-between font-normal h-10"}>
          <span className="truncate">{label}</span>
          <CalendarIcon className="h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 flex" align="end">
        <div className="flex flex-col gap-1 p-3 border-r min-w-[170px]">
          {PERIOD_PRESETS.map(p => (
            <Button key={p.v} variant={period === p.v ? "secondary" : "ghost"} size="sm" className="justify-start"
              onClick={() => { onChange({ period: p.v }); setOpen(false); }}>{p.l}</Button>
          ))}
        </div>
        <div className="p-3">
          <p className="text-xs text-muted-foreground mb-1">Período personalizado: clique no dia de início e depois no dia final</p>
          <Calendar
            mode="range"
            numberOfMonths={2}
            locale={ptBR}
            weekStartsOn={1}
            selected={period === "custom" ? { from: start, to: end } : undefined}
            onSelect={(r: any) => onChange({ period: "custom", start: r?.from, end: r?.to })}
            defaultMonth={start}
            className="p-0 pointer-events-auto"
            classNames={{
              day_selected: "bg-chocolate text-primary-foreground hover:bg-chocolate hover:text-primary-foreground focus:bg-chocolate focus:text-primary-foreground",
              day_range_middle: "aria-selected:bg-pink/40 aria-selected:text-foreground rounded-none",
              cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-pink/40 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
            }}
          />
          {start && end && (
            <div className="flex justify-end mt-2">
              <Button size="sm" onClick={() => setOpen(false)}>Aplicar</Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
