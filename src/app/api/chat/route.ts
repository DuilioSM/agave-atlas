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
    const { message } = body;

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

    // Crear prompt template
    const prompt = ChatPromptTemplate.fromTemplate(`
Eres un asistente de investigación espacial y biología. Responde la pregunta del usuario de forma breve y concisa, basándote únicamente en el contexto proporcionado de artículos científicos.

Contexto de artículos científicos:
{context}

Pregunta: {input}

Formatea toda tu respuesta como un blockquote de markdown. Cita los artículos cuando sea relevante (usando el título del artículo). Utiliza **markdown** para resaltar las palabras y conceptos clave en tu respuesta.
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

    // Ejecutar query
    const result = await retrievalChain.invoke({
      input: message,
    });

    // Eliminar fuentes duplicadas basándose en el link
    const uniqueSources = result.context?.reduce((acc: any[], doc: any) => {
      const exists = acc.find(s => s.link === doc.metadata.source);
      if (!exists) {
        acc.push({
          title: doc.metadata.title,
          link: doc.metadata.source,
        });
      }
      return acc;
    }, []) || [];

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
