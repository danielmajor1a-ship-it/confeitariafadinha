import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { PAYMENT_LABELS } from '@/types';

interface ReceiptItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface ReceiptPayment {
  method: string;
  amount: number;
  installments?: number;
}

interface ReceiptData {
  date: string;
  items: ReceiptItem[];
  total: number;
  paymentMethod: string;
  payments?: ReceiptPayment[];
  clientName?: string;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ReceiptDialog({ open, onOpenChange, data }: { open: boolean; onOpenChange: (v: boolean) => void; data: ReceiptData | null }) {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!data) return null;

  const hasMultiPayment = data.payments && data.payments.length > 1;

  function generateText() {
    if (!data) return '';
    const lines = [
      '═══════════════════════',
      '    CONFEITARIA FADINHA',
      '     Comprovante de Venda',
      '═══════════════════════',
      `Data: ${data.date}`,
      '───────────────────────',
      ...data.items.map(i => `${i.quantity}x ${i.productName}\n   ${fmt(i.unitPrice)} un → ${fmt(i.subtotal)}`),
      '───────────────────────',
      `TOTAL: ${fmt(data.total)}`,
    ];

    if (hasMultiPayment) {
      lines.push('Pagamentos:');
      data.payments!.forEach(p => {
        const label = PAYMENT_LABELS[p.method] || p.method;
        const inst = p.method === 'credito' && (p.installments || 1) > 1 ? ` (${p.installments}x)` : '';
        lines.push(`  ${label}${inst}: ${fmt(p.amount)}`);
      });
    } else {
      const singleMethod = data.payments?.[0]?.method || data.paymentMethod;
      const inst = singleMethod === 'credito' && data.payments?.[0]?.installments && data.payments[0].installments > 1
        ? ` (${data.payments[0].installments}x)` : '';
      lines.push(`Pagamento: ${PAYMENT_LABELS[singleMethod] || singleMethod}${inst}`);
    }

    if (data.clientName) lines.push(`Cliente: ${data.clientName}`);
    lines.push('═══════════════════════');
    lines.push('  Obrigada pela preferência! 💖');
    return lines.join('\n');
  }

  function handlePrint() {
    const text = generateText();
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Popup bloqueado'); return; }
    printWindow.document.write(`
      <html><head><title>Comprovante</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; max-width: 300px; margin: 0 auto; }
        pre { white-space: pre-wrap; word-break: break-word; }
        @media print { body { padding: 0; } }
      </style></head>
      <body><pre>${text}</pre></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  async function handleShare() {
    const text = generateText();
    if (navigator.share) {
      try { await navigator.share({ title: 'Comprovante de Venda', text }); } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      toast.success('Comprovante copiado!');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center">Comprovante de Venda</DialogTitle>
        </DialogHeader>

        <div ref={receiptRef} className="bg-muted rounded-xl p-4 font-mono text-xs space-y-2">
          <p className="text-center font-bold text-sm">CONFEITARIA FADINHA</p>
          <p className="text-center text-muted-foreground text-[10px]">Comprovante não-fiscal</p>
          <hr className="border-dashed border-muted-foreground/30" />
          <p className="text-muted-foreground">{data.date}</p>
          <hr className="border-dashed border-muted-foreground/30" />

          <div className="space-y-1.5">
            {data.items.map((item, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="flex-1 truncate">{item.quantity}x {item.productName}</span>
                <span className="font-semibold shrink-0">{fmt(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <hr className="border-dashed border-muted-foreground/30" />
          <div className="flex justify-between font-bold text-sm">
            <span>TOTAL</span>
            <span>{fmt(data.total)}</span>
          </div>

          {hasMultiPayment ? (
            <div className="space-y-1">
              <p className="text-muted-foreground font-semibold">Pagamentos:</p>
              {data.payments!.map((p, i) => {
                const label = PAYMENT_LABELS[p.method] || p.method;
                const inst = p.method === 'credito' && (p.installments || 1) > 1 ? ` (${p.installments}x)` : '';
                return (
                  <div key={i} className="flex justify-between text-muted-foreground">
                    <span>{label}{inst}</span>
                    <span>{fmt(p.amount)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex justify-between text-muted-foreground">
              <span>Pagamento</span>
              <span>
                {PAYMENT_LABELS[data.payments?.[0]?.method || data.paymentMethod] || data.paymentMethod}
                {data.payments?.[0]?.method === 'credito' && (data.payments[0].installments || 1) > 1
                  ? ` (${data.payments[0].installments}x)` : ''}
              </span>
            </div>
          )}

          {data.clientName && (
            <div className="flex justify-between text-muted-foreground">
              <span>Cliente</span>
              <span>{data.clientName}</span>
            </div>
          )}
          <hr className="border-dashed border-muted-foreground/30" />
          <p className="text-center text-muted-foreground">Obrigada pela preferência! 💖</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handlePrint} className="flex-1" variant="outline">
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
          <Button onClick={handleShare} className="flex-1">
            <Share2 className="h-4 w-4 mr-1" /> Compartilhar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
