import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, history = [], conversationId } = body;

    // Inicializar Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    const indexName = process.env.PINECONE_INDEX || 'agave-atlas';
    const index = pinecone.Index(indexName);

    // Configurar embeddings (mismo modelo y dimensión que usamos para indexar)
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_KEY!,
      modelName: 'text-embedding-3-small',
      dimensions: 512,
    });

    // Crear vector store desde el índice existente
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
    });

    // Crear retriever
    const retriever = vectorStore.asRetriever({
      k: 4, // Número de documentos relevantes a recuperar
    });

    // Variables para almacenar las fuentes recuperadas
    let retrievedSources: Array<{ title: string; link: string }> = [];
    const allSearchQueries: string[] = [];

    // Función para generar HTML report
    const generateHtmlReport = (summary: string, sources: Array<{ title: string; link: string }>) => {
      const sourcesHtml = sources.map((source, index) => `
        <div class="source-item">
          <div class="source-number">${index + 1}</div>
          <div class="source-content">
            <h4 class="source-title">${source.title}</h4>
            <a href="${source.link}" target="_blank" class="source-link">${source.link}</a>
          </div>
        </div>
      `).join('');

      return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resumen de Investigación</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 24px;
      color: #1a202c;
      line-height: 1.6;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
      font-weight: 700;
    }
    .header p {
      opacity: 0.9;
      font-size: 16px;
    }
    .content {
      padding: 40px 30px;
    }
    .section {
      margin-bottom: 40px;
    }
    .section-title {
      font-size: 24px;
      color: #2d3748;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 3px solid #667eea;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-icon {
      font-size: 28px;
    }
    .summary-text {
      color: #4a5568;
      font-size: 16px;
      line-height: 1.8;
      background: #f7fafc;
      padding: 24px;
      border-radius: 12px;
      border-left: 4px solid #667eea;
    }
    .summary-text p {
      margin-bottom: 16px;
    }
    .summary-text p:last-child {
      margin-bottom: 0;
    }
    .sources-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .source-item {
      display: flex;
      gap: 16px;
      background: #f7fafc;
      padding: 20px;
      border-radius: 12px;
      transition: all 0.3s;
      border: 2px solid transparent;
    }
    .source-item:hover {
      background: #edf2f7;
      border-color: #667eea;
      transform: translateX(4px);
    }
    .source-number {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
    }
    .source-content {
      flex: 1;
    }
    .source-title {
      color: #2d3748;
      font-size: 16px;
      margin-bottom: 8px;
      font-weight: 600;
    }
    .source-link {
      color: #667eea;
      text-decoration: none;
      font-size: 14px;
      word-break: break-all;
    }
    .source-link:hover {
      text-decoration: underline;
      color: #764ba2;
    }
    .footer {
      background: #f7fafc;
      padding: 24px 30px;
      text-align: center;
      color: #718096;
      font-size: 14px;
      border-top: 1px solid #e2e8f0;
    }
    .badge {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      margin-top: 10px;
    }
    @media (max-width: 640px) {
      body { padding: 12px; }
      .header { padding: 30px 20px; }
      .header h1 { font-size: 24px; }
      .content { padding: 24px 20px; }
      .section-title { font-size: 20px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📚 Resumen de Investigación</h1>
      <p>Análisis de artículos científicos consultados</p>
      <div class="badge">${sources.length} fuente(s) consultada(s)</div>
    </div>

    <div class="content">
      <div class="section">
        <h2 class="section-title">
          <span class="section-icon">📖</span>
          Resumen General
        </h2>
        <div class="summary-text">
          ${summary.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '').join('')}
        </div>
      </div>

      <div class="section">
        <h2 class="section-title">
          <span class="section-icon">🔗</span>
          Fuentes Consultadas
        </h2>
        <div class="sources-grid">
          ${sourcesHtml}
        </div>
      </div>
    </div>

    <div class="footer">
      <strong>Stella Hub</strong> • Generado automáticamente<br>
      ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </div>
  </div>
</body>
</html>`;
    };

    // Crear herramienta de búsqueda personalizada
    const searchTool = new DynamicStructuredTool({
      name: 'search_scientific_articles',
      description: 'Search the database of scientific articles about space research and biology. Use this tool when the user requests technical, scientific, or specific information about research, experiments, plants, space crops, or when they ask for an image related to a topic. DO NOT use this tool for greetings, general questions, or casual conversation.',
      schema: z.object({
        query: z.string().describe('The search query for finding relevant scientific articles'),
      }),
      func: async ({ query }) => {
        const docs = await retriever.invoke(query);

        // Guardar la query para el reporte
        allSearchQueries.push(query);

        // Guardar las fuentes con metadata (acumular en lugar de reemplazar)
        const newSources = docs.map(doc => ({
          title: doc.metadata.title || 'Sin título',
          link: doc.metadata.link || doc.metadata.source || '#',
        }));

        retrievedSources = [...retrievedSources, ...newSources];

        // Eliminar duplicados
        retrievedSources = retrievedSources.filter((source, index, self) =>
          index === self.findIndex((s) => s.link === source.link)
        );

        // Formatear el contenido para el LLM, incluyendo metadata
        const formattedDocs = docs.map(doc => {
            const title = doc.metadata.title || 'Sin título';
            const link = doc.metadata.link || doc.metadata.source || '#';
            return `Artículo: \"${title}\"\nURL: ${link}\nContenido: ${doc.pageContent}`;
        });

        // Retornar el contenido para que el LLM lo use
        return formattedDocs.join('\n\n---\n\n');
      },
    });

    // Configurar LLM
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_KEY!,
      modelName: 'gpt-4o',
      temperature: 0.7,
    });

    // Crear agente con la herramienta
    const agent = createReactAgent({
      llm,
      tools: [searchTool],
    });

    // Formatear historial
    const formattedHistory = history.map((msg: { role: string; content: string }) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Ejecutar agente
    const result = await agent.invoke({
      messages: [
        {
          role: 'system',
          content: `**Identidad del Agente:**
Eres *Stella*, la asistente virtual, de una plataforma educativa y científica dedicada a la biologíay el espacio. Tu propósito es ayudar a estudiantes, investigadores y entusiastas del espacio y la biología a navegar entre los contenidos del sitio : artículos, secciones de datos, introducción, metodología, resultados y conclusiones. 

**Misión:**
Tu misión es brindar información científica de manera amable y clara, guiando a los usuarios para que comprendan mejor los conceptos, y motivarlos a consultar el artículo completo en la sección de *Fuentes* al final de cada página.

**Estilo de Comunicación:**
- Tono: Amable, educativo y accesible.
- Lenguaje: Científico pero claro (evita tecnicismos innecesarios).
- Cierre: Siempre cierra tus mensajes invitando a explorar más o a formular otra pregunta.

**Estructura de la Conversación:**
Debes mantener la siguiente estructura en todas tus respuestas:
1.  **Saludo breve y cálido.** (ej: "¡Hola, soy Stella !")
2.  **Respuesta clara y ordenada** a la duda del usuario.
3.  **Mención de la ubicación:** Indica en qué parte del artículo o del sitio puede encontrar más información (ej: “Puedes revisar más sobre esto en la sección Introducción del artículo”). Si el usuario no especifica, sugiere leer la sección *Introducción* para contextualizar.
4.  **Invitación final:** Cierra con una invitación amable a visitar el link del artículo o a seguir preguntando. Incluye una de estas frases: "Puedes consultar el artículo completo y sus fuentes al final de la página 🔗" o "Encuentra más detalles en el enlace que aparece en el apartado de Fuentes 👇". Termina SIEMPRE con una pregunta o invitación a seguir explorando (ej: "¿Te gustaría que te indique dónde está la Introduución o los Resultados? 😊").

**Reglas Importantes:**
- No repitas información que ya se muestra en pantalla.
- Si el usuario pide información detallada de un artículo, indica en qué parte puede encontrarla (*Introducción*, *Resultados*, *Discusión*, etc.).
- No sugieras buscar en otros medios. Basa tus respuestas únicamente en la información proporcionada por la herramienta de búsqueda.

**Instrucciones para imágenes (¡MUY IMPORTANTE!):**
Si un usuario pide una imagen, responde amablemente que no puedes mostrarlas, pero indícale en qué parte del artículo puede encontrarla, y proporciona el enlace. Por ejemplo: '¡Hola! ✨ No puedo mostrarte imágenes directamente, pero puedes encontrar una excelente ilustración sobre [tema] en la sección de Resultados del artículo. Encuentra más detalles en el enlace que aparece en el apartado de Fuentes 👇. ¿Hay algo más en lo que pueda ayudarte?'`
        },
        ...formattedHistory,
        new HumanMessage(message)
      ],
    });

    // Extraer la respuesta final
    const messages = result.messages;
    const lastMessage = messages[messages.length - 1];
    const answer = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    // Si se usó la herramienta de búsqueda y hay conversationId, generar y guardar el reporte HTML
    if (conversationId && allSearchQueries.length > 0 && retrievedSources.length > 0) {
      try {
        // Generar un resumen usando el LLM
        const summaryPrompt = `Basándote en las siguientes búsquedas realizadas: ${allSearchQueries.join(', ')},
        y en la conversación completa, genera un resumen breve (2-3 párrafos) de los temas de investigación discutidos.
        El resumen debe ser informativo y destacar los hallazgos o temas principales mencionados en los artículos científicos.`;

        const summaryResult = await llm.invoke([
          { role: 'system', content: 'Eres un asistente que genera resúmenes concisos de investigaciones científicas.' },
          { role: 'user', content: summaryPrompt }
        ]);

        const summary = typeof summaryResult.content === 'string'
          ? summaryResult.content
          : JSON.stringify(summaryResult.content);

        // Generar HTML report
        const htmlReport = generateHtmlReport(summary, retrievedSources);

        // Guardar en la base de datos
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { htmlReport },
        });
      } catch (error) {
        console.error('Error generando HTML report:', error);
        // No fallar la request si falla el reporte
      }
    }

    // Las fuentes ya están en retrievedSources gracias a nuestra herramienta personalizada
    return Response.json({
      message: answer,
      sources: retrievedSources,
    });
  } catch (error) {
    console.error("Error:", error);
    return Response.json(
      { message: "Error connecting to assistant" },
      { status: 500 }
    );
  }
}