import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, availableProducts } = await req.json();

    const productList = (availableProducts || [])
      .map((p: { id: string; name: string }) => `- "${p.name}" (id: ${p.id})`)
      .join("\n");

    const prompt = `Você é um assistente que extrai dados estruturados de receitas escritas em português.

Dado o texto abaixo de uma receita, extraia:
1. Nome da receita
2. Lista de ingredientes com quantidade e unidade
3. Modo de preparo
4. Observações (se houver)

Para cada ingrediente, tente associar ao produto mais próximo desta lista de produtos cadastrados:
${productList}

Se não encontrar correspondência exata, use o nome do ingrediente como está.

Responda APENAS com JSON válido neste formato (sem markdown):
{
  "name": "Nome da Receita",
  "ingredients": [
    { "productId": "uuid-do-produto-ou-vazio", "productName": "nome do ingrediente", "quantity": 2, "unit": "un" }
  ],
  "instructions": "Modo de preparo...",
  "notes": "Observações..."
}

Texto da receita:
${text}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Clean markdown fences if present
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
