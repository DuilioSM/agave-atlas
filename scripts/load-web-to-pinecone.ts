import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as dotenv from 'dotenv';

dotenv.config();

interface CSVRow {
  Title: string;
  Link: string;
}

async function loadWebToPinecone() {
  try {
    // Verificar variables de entorno
    if (!process.env.PINECONE_API_KEY) {
      throw new Error('PINECONE_API_KEY no está configurada en .env');
    }

    if (!process.env.OPENAI_KEY) {
      throw new Error('OPENAI_KEY no está configurada en .env. Agrégala para generar embeddings.');
    }

    // Leer CSV
    const csvPath = path.join(__dirname, '../src/assets/SB_publication_PMC.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    // Parsear CSV
    const records: CSVRow[] = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      bom: true, // Maneja BOM UTF-8
    });

    console.log(`📚 Encontrados ${records.length} artículos para procesar`);

    // Inicializar Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });

    // Nombre del índice (ajusta según tu configuración)
    const indexName = process.env.PINECONE_INDEX || 'agave-atlas';
    console.log(`🔗 Conectando a índice de Pinecone: ${indexName}`);

    const index = pinecone.Index(indexName);

    // Configurar embeddings con OpenAI (512 dimensiones para coincidir con índice Pinecone)
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY!,
      modelName: 'text-embedding-3-small',
      dimensions: 512, // Coincidir con dimensión del índice Pinecone
    });

    // Text splitter
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    // Procesar cada link
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      console.log(`\n📄 [${i + 1}/${records.length}] Procesando: ${record.Title}`);
      console.log(`🔗 URL: ${record.Link}`);

      try {
        // Cargar contenido web
        const loader = new CheerioWebBaseLoader(record.Link, {
          selector: 'article, .article-content, main, body', // Selectores comunes para contenido
        });

        const docs = await loader.load();

        if (docs.length === 0) {
          console.warn(`⚠️  No se pudo cargar contenido de ${record.Link}`);
          continue;
        }

        // Agregar metadata
        docs.forEach(doc => {
          doc.metadata = {
            ...doc.metadata,
            title: record.Title,
            source: record.Link,
            loadedAt: new Date().toISOString(),
          };
        });

        // Dividir en chunks
        const splitDocs = await textSplitter.splitDocuments(docs);
        console.log(`📝 Dividido en ${splitDocs.length} chunks`);

        // Subir a Pinecone
        await PineconeStore.fromDocuments(splitDocs, embeddings, {
          pineconeIndex: index,
        });

        console.log(`✅ Subido exitosamente a Pinecone`);

        // Pequeña pausa para evitar rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Error procesando ${record.Link}:`, error);
        // Continuar con el siguiente
      }
    }

    console.log('\n🎉 ¡Proceso completado!');

  } catch (error) {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  }
}

// Ejecutar
loadWebToPinecone();
