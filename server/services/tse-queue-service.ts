import { storage } from "../storage";

export interface TseQueueItem {
  jobId: number;
  type: "url" | "detalhe" | "partido";
  url: string;
  selectedFile?: string;
  processor: () => Promise<void>;
}

export const activeImportJobs = new Map<number, { cancelled: boolean; abortController?: AbortController }>();

const tseImportQueue: TseQueueItem[] = [];
let isTseQueueProcessing = false;
let currentTseJob: number | null = null;

export function isJobCancelled(jobId: number): boolean {
  const job = activeImportJobs.get(jobId);
  return job?.cancelled ?? false;
}

export function getTseQueueStatus() {
  return {
    isProcessing: isTseQueueProcessing,
    currentJob: currentTseJob,
    queueLength: tseImportQueue.length,
    queue: [
      ...(currentTseJob !== null ? [{
        position: 0,
        jobId: currentTseJob,
        type: "processing" as const,
        isProcessing: true,
      }] : []),
      ...tseImportQueue.map((item, index) => ({
        position: index + 1,
        jobId: item.jobId,
        type: item.type,
        isProcessing: false,
      })),
    ],
  };
}

export async function addToTseQueue(item: TseQueueItem) {
  const position = tseImportQueue.length + 1;
  tseImportQueue.push(item);
  console.log(`[TSE Queue] Job ${item.jobId} added to queue at position ${position}. Queue length: ${tseImportQueue.length}`);
  
  await storage.updateTseImportJob(item.jobId, {
    stage: "queued",
    updatedAt: new Date(),
  });
  
  processNextTseJob();
}

export async function removeFromTseQueue(jobId: number): Promise<boolean> {
  const index = tseImportQueue.findIndex(item => item.jobId === jobId);
  if (index !== -1) {
    tseImportQueue.splice(index, 1);
    console.log(`[TSE Queue] Job ${jobId} removed from queue. Queue length: ${tseImportQueue.length}`);
    return true;
  }
  return false;
}

async function processNextTseJob() {
  if (isTseQueueProcessing || tseImportQueue.length === 0) {
    return;
  }

  const item = tseImportQueue.shift();
  if (!item) return;

  isTseQueueProcessing = true;
  currentTseJob = item.jobId;
  console.log(`[TSE Queue] Starting job ${item.jobId}. Remaining in queue: ${tseImportQueue.length}`);

  try {
    await item.processor();
  } catch (error) {
    console.error(`[TSE Queue] Job ${item.jobId} failed:`, error);
  } finally {
    isTseQueueProcessing = false;
    currentTseJob = null;
    console.log(`[TSE Queue] Job ${item.jobId} finished. Processing next...`);
    processNextTseJob();
  }
}
