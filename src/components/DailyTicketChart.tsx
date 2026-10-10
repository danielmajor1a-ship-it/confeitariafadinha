import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calculateDailyTickets, type DailyTicket } from '@/lib/daily-tickets';

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
type Props = {
  sales: Parameters<typeof calculateDailyTickets>[0];
  products: Parameters<typeof calculateDailyTickets>[1];
};

export default function DailyTicketChart({ sales, products }: Props) {
  const [ranking, setRanking] = useState('highest');
  const days = useMemo(() => calculateDailyTickets(sales, products), [sales, products]);
  const ranked = useMemo(() => [...days].sort((a, b) =>
    (ranking === 'highest' ? b.ticket - a.ticket : a.ticket - b.ticket) || a.day.localeCompare(b.day)
  ).slice(0, 5), [days, ranking]);
  const count = days.reduce((sum, day) => sum + day.count, 0);
  const average = count ? days.reduce((sum, day) => sum + day.revenue, 0) / count : 0;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="section-title">Ticket Médio por Dia e Lucratividade</CardTitle>
          <Tabs value={ranking} onValueChange={setRanking}>
            <TabsList aria-label="Ranking de tickets médios">
              <TabsTrigger value="highest">Maiores tickets</TabsTrigger>
              <TabsTrigger value="lowest">Menores tickets</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <p className="text-sm text-muted-foreground">Ticket médio do período: <span className="font-semibold text-foreground">{currency(average)}</span></p>
      </CardHeader>
      <CardContent>
        <div className="h-80" role="img" aria-label={`Cinco dias com ${ranking === 'highest' ? 'maiores' : 'menores'} tickets médios e lucro estimado por venda`}>
          {ranked.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranked} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={currency} fontSize={11} />
                <YAxis type="category" dataKey="date" width={92} fontSize={12} />
                <Tooltip content={<TicketTooltip />} />
                <Legend />
                <Bar dataKey="ticket" name="Ticket médio" fill="hsl(var(--pink))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="profitPerSale" name="Lucro estimado por venda" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem vendas de produtos com custo cadastrado no período</div>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Somente produtos com custo cadastrado. Lucro estimado com custos atuais e taxas de cartão, antes das despesas fixas e impostos.</p>
        <div className="mt-5 divide-y divide-border">
          {ranked.map(day => (
            <details key={day.day} className="py-3" open={ranked.length === 1}>
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                {day.date} · Ticket {currency(day.ticket)}
                <span className="ml-2 font-normal text-muted-foreground">Produtos ({day.products.length})</span>
              </summary>
              <p className="mt-2 break-words text-sm text-muted-foreground">{day.products.map(product => product.name).join(' · ')}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground">
                    <th className="py-2 pr-3 text-left font-medium">Produto</th>
                    <th className="px-3 py-2 text-right font-medium">Quantidade</th>
                    <th className="px-3 py-2 text-right font-medium">Vendido</th>
                    <th className="py-2 pl-3 text-right font-medium">Lucro estimado</th>
                  </tr></thead>
                  <tbody>{day.products.map(product => (
                    <tr key={product.id} className="border-b border-border">
                      <td className="min-w-40 py-2 pr-3">{product.name}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{product.quantity.toLocaleString('pt-BR')} {product.byWeight ? 'g' : 'un.'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{currency(product.revenue)}</td>
                      <td className={`whitespace-nowrap py-2 pl-3 text-right ${product.profit < 0 ? 'text-destructive' : 'text-success'}`}>{currency(product.profit)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TicketTooltip({ active, payload }: { active?: boolean; payload?: { payload: DailyTicket }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border bg-background p-3 text-sm shadow-md space-y-1">
      <p className="font-semibold">{row.date} · {row.count} {row.count === 1 ? 'venda' : 'vendas'}</p>
      <p>Ticket médio: {currency(row.ticket)}</p>
      <p>Vendido com custo cadastrado: {currency(row.revenue)}</p>
      <p className="max-w-72 break-words">Produtos: {row.products.map(product => product.name).join(' · ')}</p>
      {row.profit === null ? <p className="text-warning">Lucratividade indisponível: produtos sem custo</p> : <>
        <p className={row.profit < 0 ? 'text-destructive' : 'text-success'}>Lucro estimado do dia: {currency(row.profit)}</p>
        <p>Lucro por venda: {currency(row.profitPerSale ?? 0)}</p>
        <p>Margem estimada: {row.margin === null ? '—' : `${row.margin.toFixed(1)}%`}</p>
      </>}
    </div>
  );
}