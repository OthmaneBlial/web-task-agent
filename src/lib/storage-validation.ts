export interface StorageHealthSummary {
  databasePath: string;
  schemaVersion: number;
  jobs: number;
  steps: number;
  artifacts: number;
  events: number;
  pages: number;
  freelistPages: number;
  vacuumed: boolean;
}

export interface StorageHealthAssessment {
  healthy: boolean;
  warnings: string[];
}

export function assessStorageHealth(summary: StorageHealthSummary): StorageHealthAssessment {
  const warnings: string[] = [];
  const freelistRatio = summary.pages > 0 ? summary.freelistPages / summary.pages : 0;

  if (summary.schemaVersion !== 2) {
    warnings.push(`Unexpected schema version ${summary.schemaVersion}`);
  }

  if (summary.pages > 0 && freelistRatio > 0.25) {
    warnings.push(`Freelist pages are high (${summary.freelistPages}/${summary.pages})`);
  }

  if (summary.jobs === 0) {
    warnings.push("No stored jobs were found");
  }

  return {
    healthy: warnings.length === 0,
    warnings
  };
}
