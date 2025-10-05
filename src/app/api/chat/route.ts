import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';

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

    // Configurar LLM
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_KEY!,
      modelName: 'gpt-4o',
      temperature: 0.7,
    });

    // Crear prompt template con historial
    const prompt = ChatPromptTemplate.fromTemplate(`
Eres un asistente de investigación espacial y biología. Responde la pregunta del usuario de forma breve y concisa, basándote únicamente en el contexto proporcionado de artículos científicos. Si el usuario pregunta cuántos archivos hay en tu base de datos, responde de forma amigable que tienes acceso a una gran cantidad de información científica, pero no puedes dar un número exacto.

Contexto de artículos científicos:
{context}

Historial de conversación:
{chat_history}

Pregunta actual: {input}

Formatea toda tu respuesta como un blockquote de markdown. Cita los artículos cuando sea relevante (usando el título del artículo). Utiliza *markdown* para resaltar las palabras y conceptos clave en tu respuesta.
`);

    // Crear chain de documentos
    const documentChain = await createStuffDocumentsChain({
      llm,
      prompt,
    });

    // Crear retrieval chain
    const retrievalChain = await createRetrievalChain({
      combineDocsChain: documentChain,
      retriever,
    });

    // Formatear historial para el prompt
    const chatHistory = history
      .map((msg: { role: string; content: string }) =>
        `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${msg.content}`
      )
      .join('\n');

    // Ejecutar query
    const result = await retrievalChain.invoke({
      input: message,
      chat_history: chatHistory,
    });

    // Eliminar fuentes duplicadas basándose en el link
    const sources = result.context?.map((doc) => ({
      title: doc.metadata.title as string,
      link: doc.metadata.source as string,
    })) || [];

    const uniqueSources = sources.filter((source, index, self) =>
      index === self.findIndex((s) => s.link === source.link)
    );

    return Response.json({
      message: result.answer,
      sources: uniqueSources,
    });
  } catch (error) {
    console.error("Error:", error);
    return Response.json(
      { message: "Error connecting to assistant" },
      { status: 500 }
    );
  }
}