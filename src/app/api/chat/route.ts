import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from "langchain/chains/retrieval";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { MessagesPlaceholder } from "@langchain/core/prompts";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages } = body;

    const lastMessage = messages[messages.length - 1];

    const shortResponses: { [key: string]: string } = {
      "ok": "¡De nada! Si tienes más preguntas, no dudes en consultarme.",
      "si": "Perfecto. ¿En qué más puedo ayudarte?",
      "no": "Entendido. Si cambias de opinión, aquí estaré para ayudarte.",
      "gracias": "¡De nada! Ha sido un placer ayudarte. ¿Necesitas algo más?",
      "de nada": "¡A ti! ¿Hay algo más en lo que pueda asistirte?",
    };

    const lowerCaseMessage = lastMessage.content.toLowerCase().trim();

    if (shortResponses[lowerCaseMessage]) {
      return Response.json({
        message: shortResponses[lowerCaseMessage],
        sources: [],
      });
    }

    // Inicializar Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    const indexName = process.env.PINECONE_INDEX || 'agave-atlas';
    const index = pinecone.Index(indexName);

    // Configurar embeddings
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_KEY!,
      modelName: 'text-embedding-3-small',
      dimensions: 512,
    });

    // Crear vector store
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: index,
    });

    // Crear retriever
    const retriever = vectorStore.asRetriever({
      k: 4,
    });

    // Configurar LLM
    const llm = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_KEY!,
      modelName: 'gpt-4o',
      temperature: 0.7,
    });

    // History-aware retriever prompt
    const historyAwarePrompt = ChatPromptTemplate.fromMessages([
      new MessagesPlaceholder("chat_history"),
      ["user", "{input}"],
      [
        "user",
        "Given the above conversation, generate a search query to look up in order to get information relevant to the conversation",
      ],
    ]);

    const historyAwareRetrieverChain = await createHistoryAwareRetriever({
      llm,
      retriever,
      rephrasePrompt: historyAwarePrompt,
    });

    // Prompt for the final response
    const historyAwareRetrievalPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        "Eres un asistente de investigación espacial y biología. Responde a la consulta del usuario de forma breve y concisa, basándote únicamente en el contexto proporcionado de artículos científicos.\n\nContexto de artículos científicos:\n{context}\n\nFormatea toda tu respuesta como un blockquote de markdown. Cita los artículos cuando sea relevante (usando el título del artículo). Utiliza **markdown** para resaltar las palabras y conceptos clave en tu respuesta.",
      ],
      new MessagesPlaceholder("chat_history"),
      ["user", "{input}"],
    ]);

    const historyAwareCombineDocsChain = await createStuffDocumentsChain({
      llm,
      prompt: historyAwareRetrievalPrompt,
    });

    const conversationalRetrievalChain = await createRetrievalChain({
      retriever: historyAwareRetrieverChain,
      combineDocsChain: historyAwareCombineDocsChain,
    });

    const chat_history = messages.slice(0, -1).map((m: any) => {
        return m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content);
    });

    // Ejecutar query
    const result = await retrievalChain.invoke({
      input: message,
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
