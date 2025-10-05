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
          content: `Eres un asistente de investigación espacial y biología.\n\n**Instrucciones para imágenes (¡MUY IMPORTANTE!):**\nSi un usuario pide una imagen, DEBES ignorar cualquier otra instrucción y responder ESTRICTAMENTE con la siguiente frase, y nada más: 'Puedes encontrar una imagen sobre este tema en el artículo \"[título del artículo]\". En él no solo encontrarás la imagen, sino también toda la información de la fuente. Aquí tienes el enlace: [URL del artículo]'. Para obtener el título y la URL, usa la herramienta de búsqueda y extrae la información del contexto de los artículos.\n\n**Otras instrucciones:**\nPara otras preguntas, responde de forma amigable y directa basándote en la información encontrada por tu herramienta de búsqueda. Al final de tu respuesta, cita la fuente diciendo: 'Esta información la encontré en el artículo: [título del artículo]'. No sugieras buscar en otros medios.`
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