
export interface Asset {
  id: string | number;
  tag: string;
  room: string;
  location: string;
  campus: string;
  floor: string;
  brand: string;
  cap: string | number;
  status: string;
  year?: number;
  healthScore?: number;
}

export interface Ticket {
  rowIndex: number;
  date: string;
  category: string;
  location: string;
  details: string;
  assetTag: string;
  assignedTo: string;
  status: string;
  resolvedBy: string;
  workType?: string;
  remarks?: string;
  gasUsedKG?: number;
  gasType?: string;
  technician?: string;
}

export interface GasTransaction {
  timestamp: string;
  action: 'REFILL' | 'USAGE';
  gasType: string;
  amount: number;
  tech: string;
  refTicket?: string;
}

export interface PerformanceLogEntry {
  tech: string;
  points: number;
  reason?: string;
}

export interface HvacStats {
  inspection: string[];
  filters: string[];
  quarterly: string[];
  gasStocks: Record<string, number>;
}

export interface StatsResponse {
  complaints: Ticket[];
  performanceLogs: PerformanceLogEntry[];
  hvac: HvacStats;
}

export enum AppTab {
  DASHBOARD = 'view-dashboard',
  OPS = 'view-ops',
  TECH = 'view-tech'
}

export enum ChecklistType {
  DAILY = 'Daily',
  MONTHLY = 'Monthly',
  QUARTERLY = 'Quarterly'
}
