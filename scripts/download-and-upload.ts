import { Pinecone } from '@pinecone-database/pinecone';
import { config as loadEnv } from 'dotenv';
import { parse } from 'csv-parse/sync';
import * as path from 'path';
import { promises as fs } from 'fs';
import puppeteer from 'puppeteer';

loadEnv();

interface ArticleRow {
  Title: string;
  Link: string;
}

const CONFIG = {
  assistantName: process.env.PINECONE_ASSISTANT_NAME ?? 'nasaspace',
  csvPath:
    process.env.PDF_SOURCE_CSV ??
    path.resolve(__dirname, '../src/assets/SB_publication_PMC.csv'),
  tempRoot:
    process.env.PDF_TEMP_DIR ?? path.resolve(__dirname, '../temp_pdfs'),
  requestDelayMs: Number(process.env.PDF_REQUEST_DELAY_MS ?? '3000'),
  downloadTimeoutMs: Number(process.env.PDF_DOWNLOAD_TIMEOUT_MS ?? '60000'),
  maxFileSizeBytes: 10_000_000, // Pinecone limit is 10MB
  largeFilesDir: path.resolve(__dirname, '../temp_pdfs'),
  largeFilesLog: path.resolve(__dirname, '../temp_pdfs/large_files.txt'),
};

const REQUIRED_ENV_VARS = ['PINECONE_API_KEY'] as const;

async function main() {
  ensureEnv();

  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  const assistant = pinecone.Assistant(CONFIG.assistantName);

  const records = await loadCsvRecords(CONFIG.csvPath);
  if (records.length === 0) {
    console.log('No se encontraron filas válidas en el CSV.');
    return;
  }

  const runTempDir = await prepareTempDir(CONFIG.tempRoot);
  console.log(
    `Procesando ${records.length} artículos desde ${CONFIG.csvPath}...\n`
  );

  let successCount = 0;
  let failCount = 0;
  let skippedLargeCount = 0;

  // Ensure large files directory exists
  await fs.mkdir(CONFIG.largeFilesDir, { recursive: true });

  try {
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const ordinal = `${index + 1}/${records.length}`;
      console.log(`[${ordinal}] ${record.Title}`);

      const pdfCandidates = buildPdfCandidates(record.Link);
      if (pdfCandidates.length === 0) {
        console.warn('  ✗ URL inválida o vacía; se omite.');
        failCount += 1;
        continue;
      }

      const filename = buildFilename(index, record.Title);
      const tempFilepath = path.join(runTempDir, filename);

      try {
        const { buffer, finalUrl } = await fetchPdf(pdfCandidates, record.Link);
        await fs.writeFile(tempFilepath, buffer);
        console.log(
          `  ✓ PDF descargado (${(buffer.length / 1024).toFixed(1)} KB)`
        );

        // Check if file exceeds Pinecone's limit
        if (buffer.length > CONFIG.maxFileSizeBytes) {
          const permanentPath = path.join(CONFIG.largeFilesDir, filename);
          await fs.copyFile(tempFilepath, permanentPath);

          // Log to large files list
          const logEntry = `${record.Title}\t${record.Link}\t${finalUrl}\t${permanentPath}\t${buffer.length}\n`;
          await fs.appendFile(CONFIG.largeFilesLog, logEntry);

          console.log(
            `  ⚠ Archivo muy grande (${(buffer.length / 1024 / 1024).toFixed(1)} MB), guardado en temp_pdfs/`
          );
          skippedLargeCount += 1;
        } else {
          await assistant.uploadFile({
            path: tempFilepath,
            metadata: {
              title: record.Title,
              link: record.Link,
              downloadedFrom: finalUrl,
            },
          });
          console.log('  ✓ Subido a Pinecone Assistants');
          successCount += 1;
        }
      } catch (error) {
        failCount += 1;
        logDownloadOrUploadError(error);
        if (isRateLimitError(error)) {
          console.log('  ⏳ Rate limit detectado; esperando 30 segundos...');
          await delay(30_000);
        }
      } finally {
        await safeRemove(tempFilepath);
        await delay(CONFIG.requestDelayMs);
      }
    }
  } finally {
    await safeRemove(runTempDir, true);
  }

  console.log('\n=== Resumen ===');
  console.log(`Total:              ${records.length}`);
  console.log(`Éxitos:             ${successCount}`);
  console.log(`Muy grandes:        ${skippedLargeCount}`);
  console.log(`Fallos:             ${failCount}`);
  if (skippedLargeCount > 0) {
    console.log(
      `\nArchivos grandes guardados en: ${CONFIG.largeFilesDir}`
    );
    console.log(`Lista completa en: ${CONFIG.largeFilesLog}`);
  }
}

function ensureEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno faltantes: ${missing.join(', ')}. Configúralas y vuelve a intentar.`
    );
  }
}

async function loadCsvRecords(csvPath: string): Promise<ArticleRow[]> {
  const raw = await fs.readFile(csvPath, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  }) as ArticleRow[];
  return rows.filter(
    (row) => row?.Link?.trim().length && row?.Title?.trim().length
  );
}

async function prepareTempDir(root: string): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  return fs.mkdtemp(path.join(root, 'run-'));
}

function buildPdfCandidates(rawUrl: string): string[] {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = trimmed.replace(/\s/g, '');
  if (normalized.toLowerCase().endsWith('.pdf')) {
    return [normalized];
  }

  const noTrailingSlash = normalized.replace(/\/+$/, '');
  const candidates = [
    `${noTrailingSlash}/pdf`,
    `${noTrailingSlash}/pdf/`,
    normalized,
  ];

  return [...new Set(candidates)];
}

async function fetchPdf(
  candidateUrls: string[],
  refererUrl: string
): Promise<{ buffer: Buffer; finalUrl: string }> {
  // Use puppeteer to handle PMC's POW challenge
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Set user agent to look like a real browser
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Build PDF URL by appending /pdf to the article URL
    const pdfUrl = refererUrl.endsWith('/')
      ? `${refererUrl}pdf`
      : `${refererUrl}/pdf`;

    // Navigate to PDF URL and wait for POW challenge to complete
    await page.goto(pdfUrl, {
      waitUntil: 'networkidle0',
      timeout: CONFIG.downloadTimeoutMs,
    });

    // Wait for the POW challenge to be solved and cookies to be set
    await delay(5000);

    // Get the final redirected URL (should be the actual PDF URL)
    const finalUrl = page.url();

    // Now fetch the PDF using the browser's context (with cookies)
    const pdfData = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(arrayBuffer));
    }, finalUrl);

    const buffer = Buffer.from(pdfData);

    if (isPdf(buffer) && buffer.length > 10000) {
      return { buffer, finalUrl };
    }

    throw new Error(`PDF inválido o muy pequeño (${buffer.length} bytes)`);
  } finally {
    await browser.close();
  }
}

function isPdf(buffer: Buffer): boolean {
  return (
    buffer.length > 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  );
}

function buildFilename(index: number, title: string): string {
  const prefix = String(index + 1).padStart(4, '0');
  const sanitized = title
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\-_. ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);

  const base = sanitized || `document-${prefix}`;
  return `${prefix}-${base}.pdf`;
}

function logDownloadOrUploadError(error: unknown) {
  const message = (error as Error)?.message ?? String(error);
  console.error(`  ✗ Error: ${message}`);
}

function isRateLimitError(error: unknown): boolean {
  const message = (error as Error)?.message?.toLowerCase() ?? '';
  return message.includes('429') || message.includes('too many') || message.includes('rate limit');
}

async function safeRemove(targetPath: string, recursive = false) {
  try {
    await fs.rm(targetPath, {
      force: true,
      recursive,
    });
  } catch {
    /* ignore */
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error('Proceso abortado:', error);
  process.exit(1);
});