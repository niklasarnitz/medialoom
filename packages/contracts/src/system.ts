import { z } from 'zod';

export const doctorCheckStatusSchema = z.enum(['ok', 'warn', 'error']);
export type DoctorCheckStatus = z.infer<typeof doctorCheckStatusSchema>;

export const doctorCheckSchema = z.object({
  name: z.string(),
  status: doctorCheckStatusSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type DoctorCheck = z.infer<typeof doctorCheckSchema>;

export const doctorReportStatusSchema = z.enum(['ok', 'degraded', 'error']);
export type DoctorReportStatus = z.infer<typeof doctorReportStatusSchema>;

export const doctorReportEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  status: doctorReportStatusSchema,
  timestamp: z.string(),
  version: z.string(),
  checks: z.array(doctorCheckSchema),
});
export type DoctorReportEnvelope = z.infer<typeof doctorReportEnvelopeSchema>;

export const systemHealthStatusSchema = z.enum(['ok', 'degraded', 'error']);
export type SystemHealthStatus = z.infer<typeof systemHealthStatusSchema>;

export const systemHealthSchema = z.object({
  status: systemHealthStatusSchema,
  version: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
  database: z.enum(['connected', 'disconnected']),
});
export type SystemHealth = z.infer<typeof systemHealthSchema>;
