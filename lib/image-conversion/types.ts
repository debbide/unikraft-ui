export type ConversionStatus = 'queued' | 'pulling' | 'inspecting' | 'building' | 'completed' | 'failed';

export type ConversionJob = {
  id: string;
  sourceImage: string;
  runtime?: string;
  outputImage?: string;
  status: ConversionStatus;
  error?: string;
  log?: string;
  createdAt: string;
  updatedAt: string;
};