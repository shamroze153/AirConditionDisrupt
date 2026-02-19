
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
  category?: string;
  assignedTech?: string;
}

export interface Ticket {
  rowIndex: number;
  date: string;
  category: string;
  issueCategory?: string;
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
  complaintType?: 'Proactive' | 'Reactive';
  starRating?: number;
  pointsAwarded?: number;
  adminReviewDate?: string;
  resolutionTimestamp?: string;
  repeatCount?: number;
}

export interface Seat {
  no: number;
  location: string;
  campusCode: string;
  floorTag: string;
  roomTag: string;
  stationTag: string;
  empName: string;
  empCode: string;
  empType: string;
  roomCode: string;
  roomCodeDashboard: string;
  seatCode: string;
  bu: string;
  department: string;
  category: string;
  status: string;
  snapshotDate: string;
  finalDept: string;
}

export interface GasTransaction {
  timestamp: string;
  action: 'REFILL' | 'USAGE';
  gasType: string;
  amount: number;
  tech: string;
  refTicket?: string;
  category?: string;
}

export interface PerformanceLogEntry {
  Timestamp?: string;
  tech: string;
  points: number;
  reason?: string;
  category?: string;
}

export interface MaterialDemand {
  timestamp: string;
  technician: string;
  details: string;
  status: string;
  gasType?: string;
  gasAmount?: string;
  category?: string;
}

export interface HvacStats {
  daily: string[];
  monthly: string[];
  quarterly: string[];
  gasStocks: Record<string, number>;
  assetUsage?: Record<string, number>;
}

export interface StatsResponse {
  complaints: Ticket[];
  performanceLogs: PerformanceLogEntry[];
  hvac: HvacStats;
  demands: MaterialDemand[];
  acknowledgedInsights?: {tag: string, type: string}[];
}

export interface GlobalStatsResponse {
  allTickets: Ticket[];
  allPerformanceLogs: PerformanceLogEntry[];
  proactiveCount?: number;
  seatingData?: Seat[];
}

export enum AppTab {
  DASHBOARD = 'view-dashboard',
  OPS = 'view-ops',
  TECH = 'view-tech',
  GLOBAL = 'view-global'
}

export type CategoryKey = 'ac' | 'electrical' | 'handyman' | 'fleet' | 'valet' | 'reception' | 'office-boy' | 'janitorial' | 'seating';

export interface FMCategory {
  id: CategoryKey;
  name: string;
  group: 'Hard FM' | 'Soft FM';
  icon: string;
  color: string;
}

export enum ChecklistType {
  DAILY = 'Daily',
  MONTHLY = 'Monthly',
  QUARTERLY = 'Quarterly'
}

export interface Tool {
  category: string;
  name: string;
  qty: number;
  technician?: string;
}
