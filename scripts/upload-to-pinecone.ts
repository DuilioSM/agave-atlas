import { Pinecone } from '@pinecone-database/pinecone';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { config } from 'dotenv';
import axios from 'axios';

// Load environment variables
config();

// Configuration
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const ASSISTANT_NAME = 'nasaspace';
const CSV_PATH = path.join(__dirname, '../src/assets/SB_publication_PMC.csv');
const TEMP_DIR = path.join(__dirname, '../temp_pdfs');

interface CSVRow {
  Title: string;
  Link: string;
}

async function downloadPDF(url: string, filename: string): Promise<string> {
  const pdfUrl = `${url}pdf`;
  const filepath = path.join(TEMP_DIR, filename);

  try {
    console.log(`  Downloading PDF...`);
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    fs.writeFileSync(filepath, response.data);
    return filepath;
  } catch (error) {
    console.error(`  ✗ Failed to download PDF`);
    throw error;
  }
}

async function uploadToPinecone(
  assistant: ReturnType<typeof Pinecone.prototype.Assistant>,
  filepath: string,
  metadata: { title: string; link: string }
): Promise<void> {
  try {
    console.log(`  Uploading to Pinecone...`);
    await assistant.uploadFile({
      path: filepath,
      metadata: {
        title: metadata.title,
        link: metadata.link,
      },
    });
    console.log(`  ✓ Uploaded successfully`);
  } catch (error) {
    console.error(`  ✗ Failed to upload to Pinecone`);
    throw error;
  }
}

async function main() {
  if (!PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY environment variable is not set');
  }

  // Initialize Pinecone
  console.log('Initializing Pinecone...');
  const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
  const assistant = pc.Assistant(ASSISTANT_NAME);

  // Read CSV
  console.log(`Reading CSV from: ${CSV_PATH}`);
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const records: CSVRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });

  console.log(`Found ${records.length} records in CSV\n`);

  // Process each record
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    console.log(`\n[${i + 1}/${records.length}] Processing: ${record.Title}`);

    try {
      // Upload URL directly to Pinecone
      await uploadURLToPinecone(assistant, record.Link, {
        title: record.Title,
        link: record.Link,
      });

      successCount++;

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Failed to process record ${i + 1}`);
      failCount++;
      continue;
    }
  }

  console.log('\n=== Upload Summary ===');
  console.log(`Total: ${records.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

main().catch(console.error);
