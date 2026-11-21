- Products with sold_by_weight=true store sale_price per kg and stock/sale quantities in integer grams (avoids changing integer quantity columns).
- Daily ticket analytics group by São Paulo date, include only items with positive current stock-unit costs, and proportionally allocate sale totals and recorded card fees using item subtotals; count only sales with eligible items so excluded revenue cannot inflate profit or the average ticket.
- Fixed cost of a month = active recurring_costs + cash_movements with expense_type 'despesa_fixa' not linked to a recurring cost (recurring_cost_id null), so linked payments are not counted twice.
- Order deposits (sinal) are cash_movements category 'adiantamento_encomenda' via registrar_sinal_encomenda, never sales; products are sold once at delivery via entregar_encomenda with an 'adiantamento' payment that creates no cash movement — avoids double revenue/stock.
- Public production panel (/painel/:token) and token ficha only use SECURITY DEFINER RPCs validated against config_producao.painel_token — never expose phone or values.

- Supplier payments live in supplier_payments (+ supplier_payment_allocations to purchases); cash-drawer payments are created only via register_supplier_payment so the cash movement and payment stay in sync.
- Products with production_only skip stock movements in confirm_purchase but still update cost; purchase_items.production_only snapshots it for cost analysis.
- Purchase cost analytics filter/group by purchases.cost_date (generated: due_date or purchase_date), so deferred-payment notes count on their due date.

- Retire rejected customer-credit operations by disabling write RPCs and payment triggers, retaining deprecated data for history; never drop financial records during feature removal.
- Use shared order-delivery eligibility based on lifecycle status, not lateness; keep past pending orders actionable and resume order checkout after login without granting public financial writes.
- Order delivery fees live on encomendas (taxa_entrega, entrega_paga_por); entregar_encomenda records them as separate cash movements (entrada 'taxa_entrega' or variable expense), never as sale revenue, so product profitability stays clean.
