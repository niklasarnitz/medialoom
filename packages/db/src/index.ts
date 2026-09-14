export type {
  Asset,
  Edition,
  MediaFilenameMetadata,
  MediaTechnicalMetadata,
  MediaVersion,
  Movie,
  Prisma,
  Scan,
  SystemMetadata,
} from '@prisma/client';
export * from './client';
export * from './repositories/inventory-repository';
export * from './repositories/settings-repository';
export * from './utils/path';

// Ensure BigInt values from Prisma can be serialized to JSON across the application
if (!('toJSON' in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value() {
      return Number(this);
    },
    writable: true,
    configurable: true,
  });
}
