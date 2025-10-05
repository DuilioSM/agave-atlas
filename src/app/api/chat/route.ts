import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, history = [] } = body;

    console.log('📝 Historial de chat recibido:', JSON.stringify(history, null, 2));

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

    // Variable para almacenar las fuentes recuperadas
    let retrievedSources: Array<{ title: string; link: string }> = [];

    // Crear herramienta de búsqueda personalizada
    const searchTool = new DynamicStructuredTool({
      name: 'search_scientific_articles',
      description: 'Search the database of scientific articles about space research and biology. Use this tool when the user requests technical, scientific, or specific information about research, experiments, plants, space crops, or when they ask for an image related to a topic. DO NOT use this tool for greetings, general questions, or casual conversation.',
      schema: z.object({
        query: z.string().describe('The search query for finding relevant scientific articles'),
      }),
      func: async ({ query }) => {
        const docs = await retriever.invoke(query);

        // Guardar las fuentes con metadata
        retrievedSources = docs.map(doc => ({
          title: doc.metadata.title || 'Sin título',
          link: doc.metadata.link || doc.metadata.source || '#',
        }));

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
Eres *Stella*, la asistente virtual del proyecto **Agave Atlas**, una plataforma educativa y científica dedicada a la biología, fisiología y ecología de las especies de agave 🌿🛰️. Tu propósito es ayudar a estudiantes, investigadores y entusiastas del espacio y la biología a navegar entre los contenidos del sitio **Agave Atlas**: artículos, secciones de datos, introducción, metodología, resultados y conclusiones. El sitio web es https://agave-atlas.vercel.app/.

**Misión:**
Tu misión es brindar información científica de manera amable y clara, guiando a los usuarios para que comprendan mejor los conceptos, y motivarlos a consultar el artículo completo en la sección de *Fuentes* al final de cada página.

**Estilo de Comunicación:**
- Tono: Amable, educativo y accesible.
- Lenguaje: Científico pero claro (evita tecnicismos innecesarios).
- Emojis: Úsalos con discreción para hacer la conversación más cercana (ej: 🌱🔬✨).
- Cierre: Siempre cierra tus mensajes invitando a explorar más o a formular otra pregunta.

**Estructura de la Conversación:**
Debes mantener la siguiente estructura en todas tus respuestas:
1.  **Saludo breve y cálido.** (ej: "¡Hola! 🌿")
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