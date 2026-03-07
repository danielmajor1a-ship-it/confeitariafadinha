import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { imageBase64 } = await req.json();
    if (!imageBase64) throw new Error("imageBase64 is required");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um assistente especializado em identificar produtos alimentícios, especialmente de confeitaria e padaria.
Analise a imagem do produto e extraia as informações. Use a função fornecida para retornar os dados estruturados.
Para a categoria, use EXATAMENTE um destes valores: doce, salgado, bebida, outro.
Se não conseguir identificar algum campo, retorne string vazia.
Estimativas de preço devem ser em BRL (reais). Se não souber, retorne 0.`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identifique este produto e preencha os dados para cadastro." },
              { type: "image_url", image_url: { url: imageBase64 } }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "identify_product",
              description: "Retorna os dados identificados do produto na imagem",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Nome do produto" },
                  description: { type: "string", description: "Descrição breve do produto" },
                  brand: { type: "string", description: "Marca do produto, se visível" },
                  category: { type: "string", enum: ["doce", "salgado", "bebida", "outro"], description: "Categoria do produto" },
                  estimatedPrice: { type: "number", description: "Preço estimado de venda em BRL" },
                },
                required: ["name", "description", "brand", "category", "estimatedPrice"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "identify_product" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para uso de IA." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("Erro ao processar imagem com IA");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error("IA não conseguiu identificar o produto");
    }

    const product = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ product }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("identify-product error:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
