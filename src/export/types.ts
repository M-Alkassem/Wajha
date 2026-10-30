/** Shapes shared by the export modules; re-exported from `./index`. */
import type { FamilyId, LangCode, Project } from '../model/types';
import type { ExportTarget } from '../platform/types';

export interface ExportJob {
  family: FamilyId;
  sizeId: string;
  width: number;
  height: number;
  lang: LangCode;
  slideIndex: number;
  /** Relative POSIX path inside the export target, e.g. "App Store/en-US/iPhone 6.9/01.png". */
  path: string;
}

export interface ExportWarning {
  kind: 'missing-screenshot' | 'text-overflow' | 'too-many-slides' | 'no-locale-code';
  message: string;
  slideIndex?: number;
  family?: FamilyId;
  lang?: LangCode;
}

export interface ExportPlan {
  jobs: ExportJob[];
  warnings: ExportWarning[];
}

export interface ExportProgress {
  done: number;
  total: number;
  current: ExportJob | null;
}

export interface ExportReport {
  written: number;
  failed: { job: ExportJob; error: string }[];
  cancelled: boolean;
  target: ExportTarget;
  ms: number;
}

export interface RunExportOptions {
  plan: ExportPlan;
  target: ExportTarget;
  format: 'png' | 'jpeg';
  jpegQuality: number;
  /** Renders one job to encoded file bytes (provided by the runtime). */
  renderJob(job: ExportJob, format: 'png' | 'jpeg', jpegQuality: number): Promise<Uint8Array>;
  write(target: ExportTarget, path: string, data: Uint8Array): Promise<void>;
  onProgress?(p: ExportProgress): void;
  signal?: AbortSignal;
}

export interface CsvImportResult {
  project: Project;
  updatedCells: number;
  addedLanguages: LangCode[];
  skippedRows: number;
}
