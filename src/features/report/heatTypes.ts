import type { ReportPoint } from '../../services/report.service';

export interface HeatCanvasProps {
  points: ReportPoint[];
  selectedId: string | null;
  onSelect: (p: ReportPoint | null) => void;
  /** Bumped by the "Fit all" button. */
  fitSignal: number;
}
