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
    console.log(`  Downloading PDF from: ${pdfUrl}`);
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      maxRedirects: 5,
    });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    fs.writeFileSync(filepath, response.data);
    console.log(`  ✓ Downloaded (${(response.data.length / 1024).toFixed(2)} KB)`);
    return filepath;
  } catch (error: any) {
    const errorMsg = error.response?.status
      ? `HTTP ${error.response.status}`
      : error.code || error.message;
    console.error(`  ✗ Failed to download PDF: ${errorMsg}`);
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
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown error';
    console.error(`  ✗ Failed to upload to Pinecone: ${errorMsg}`);
    throw error;
  }
}

async function main() {
  if (!PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY environment variable is not set');
  }

  // Create temp directory if it doesn't exist
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
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
    console.log(`\n[${i + 1}/${records.length}] ${record.Title}`);

    let filepath: string | null = null;

    try {
      // Generate safe filename
      const safeFilename = `${i + 1}.pdf`;

      // Download PDF
      filepath = await downloadPDF(record.Link, safeFilename);

      // Upload to Pinecone
      await uploadToPinecone(assistant, filepath, {
        title: record.Title,
        link: record.Link,
      });

      successCount++;
    } catch (error: any) {
      failCount++;
      console.error(`  ✗ Skipping this record`);

      // If rate limited, wait longer
      if (error.message?.includes('429') || error.message?.includes('Too many')) {
        console.log('  ⏳ Rate limited - waiting 30 seconds...');
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    } finally {
      // Clean up downloaded file if it exists
      if (filepath && fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Clean up temp directory
  if (fs.existsSync(TEMP_DIR) && fs.readdirSync(TEMP_DIR).length === 0) {
    fs.rmdirSync(TEMP_DIR);
  }

  console.log('\n=== Upload Summary ===');
  console.log(`Total: ${records.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
}

main().catch(console.error);
