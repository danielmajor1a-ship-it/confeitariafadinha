import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const { fileBase64, mimeType } = await req.json();
    if (!fileBase64 || !mimeType) return json({ error: "Arquivo não enviado" }, 400);

    const dataUrl = fileBase64.startsWith("data:") ? fileBase64 : `data:${mimeType};base64,${fileBase64}`;
    const filePart = mimeType === "application/pdf"
      ? { type: "file", file: { filename: "nota.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você lê notas fiscais e cupons de compra de uma confeitaria brasileira.
Extraia o fornecedor e TODOS os itens comprados. Para cada item: descrição exatamente como aparece, quantidade, unidade (UN, KG, CX, BD, PCT etc.) e valor TOTAL da linha em reais.
Não invente itens. Ignore descontos gerais, impostos e totais da nota.`,
          },
          { role: "user", content: [{ type: "text", text: "Leia os itens desta nota/cupom." }, filePart] },
        ],
        tools: [{
          type: "function",
          function: {
            name: "purchase_items",
            description: "Itens lidos da nota",
            parameters: {
              type: "object",
              properties: {
                supplier: { type: "string" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      description: { type: "string" },
                      quantity: { type: "number" },
                      unit: { type: "string" },
                      total: { type: "number" },
                    },
                    required: ["description", "quantity", "unit", "total"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["supplier", "items"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "purchase_items" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return json({ error: "Muitas leituras seguidas. Tente de novo em alguns segundos." }, 429);
      if (response.status === 402) return json({ error: "Créditos de IA esgotados." }, 402);
      console.error("AI error", response.status, await response.text());
      return json({ error: "Não foi possível ler a nota" }, 500);
    }
    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return json({ error: "Não foi possível ler a nota" }, 500);
    return json(JSON.parse(args));
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Erro" }, 500);
  }
});
