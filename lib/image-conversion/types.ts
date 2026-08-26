export type ConversionStatus = 'queued' | 'pulling' | 'inspecting' | 'building' | 'completed' | 'failed';

export type ConversionJob = {
  id: string;
  sourceImage: string;
  outputImage?: string;
  status: ConversionStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
};