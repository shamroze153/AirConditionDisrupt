import { FMCategory } from './types';

export const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyc1ITeV8tfmBZLi28oDwUBSbwlfwglfAlOodCopoGHn5eW0A3-3P3lfYxOpjeOc94SQA/exec";

export const TECHNICIANS = ['Bilal', 'Asad', 'Taimoor', 'Saboor'];
export const ELECTRICAL_TECHNICIANS = ['Ibraheem', 'Naveed Ali', 'Haris', 'Owais'];
export const GM_TECHNICIANS = ['Sajid']; 

export const CATEGORY_TECHS: Record<string, string[]> = {
  'ac': TECHNICIANS,
  'electrical': ELECTRICAL_TECHNICIANS,
  'handyman': GM_TECHNICIANS
};

export const CAMPUS_ASSETS = {
  "140H": { fans: 13, washrooms: 13 },
  "141D": { fans: 15, washrooms: 15 },
  "141C": { fans: 7, washrooms: 7 }
};

export const EXHAUST_FAN_INVENTORY: Record<string, { floor: string, qty: number }[]> = {
  "141D": [
    { floor: "Ground Floor", qty: 17 },
    { floor: "1st Floor", qty: 5 },
    { floor: "2nd Floor", qty: 14 }
  ],
  "141C": [
    { floor: "Total", qty: 3 }
  ],
  "140H": [
    { floor: "Ground Floor", qty: 10 },
    { floor: "Washrooms", qty: 6 },
    { floor: "1st Floor", qty: 13 },
    { floor: "Additional Washrooms", qty: 2 }
  ]
};

// Comprehensive Electrical Checklist Structure
export const ELECTRICAL_MODULE_DATA = {
  commonItems: [
    { id: 'gen_warmup', label: 'Generator Warmup', group: 'Generator', frequency: 'Daily' },
    { id: 'ups_battery', label: 'UPS Battery – Water Level Check & Cleaning', group: 'UPS', frequency: 'Daily' },
    { id: 'ups_func', label: 'UPS Functioning Check', group: 'UPS', frequency: 'Daily' },
    { id: 'db_insp', label: 'Electrical DB Inspection', group: 'DB', frequency: 'Daily' },
    { id: 'gen_oil_check', label: 'Generator Oil Check', group: 'Generator', frequency: 'Monthly' },
    { id: 'gen_radiator', label: 'Generator Radiator – Water Level Check', group: 'Generator', frequency: 'Daily' },
    { id: 'gen_cleaning', label: 'Generator – External Cleaning', group: 'Generator', frequency: 'Monthly' },
    { id: 'water_motor', label: 'Water Motor – Operational Check', group: 'Motor', frequency: 'Daily' },
    { id: 'pool_motor', label: 'Pool Motor Switch On/Test', group: 'Motor', frequency: 'Daily' },
    { id: 'fuel_start', label: 'Fuel Reading – At Generator Start', group: 'Fuel', frequency: 'Daily' },
    { id: 'fuel_stop', label: 'Fuel Reading – At Generator Stop', group: 'Fuel', frequency: 'Daily' }
  ],
  campusSpecific: {
    "140H": {
      fans: 13,
      extraRooms: []
    },
    "141D": {
      fans: 15,
      extraRooms: ["Meeting Room 1", "Meeting Room 2", "Meeting Space 1", "Meeting Space 2", "Tree of Success Room"]
    },
    "141C": {
      fans: 7,
      extraRooms: ["Gym"]
    }
  }
};

export const CAMPUS_ROOMS: Record<string, Record<string, string[]>> = {
  "140H": {
    "Basement": ["Pantry", "Server Room", "Store"],
    "Ground": ["Reception", "Main Hall", "Meeting Room A"],
    "1st Floor": ["Operations", "Manager Office", "Washroom Area"],
    "2nd Floor": ["Finance", "HR", "Lounge"]
  },
  "141D": {
    "Ground": ["Lobby", "Cafeteria", "Security"],
    "1st Floor": ["Development", "QA Lab", "Washroom Area"],
    "2nd Floor": ["Design Studio", "Creative Space"],
    "3rd Floor": ["Meeting Room 1", "Meeting Room 2", "Meeting Space 1", "Meeting Space 2", "Tree of Success Room"]
  },
  "141C": {
    "Ground": ["Showroom", "Workshop", "Gym"],
    "1st Floor": ["Staff Area", "Training Room", "Washroom Area"]
  }
};

// Explicitly type GAS_TYPES to avoid unknown type inference in components
export const GAS_TYPES: Array<{name: string, type: string}> = [
  { name: "R22", type: "ac" },
  { name: "R410", type: "ac" },
  { name: "R32", type: "ac" },
  { name: "R600", type: "ac" },
  { name: "R134", type: "ac" }
];

export const FM_CATEGORIES: FMCategory[] = [
  { id: 'ac', name: 'AC (HVAC)', group: 'Hard FM', icon: 'snowflake', color: 'indigo' },
  { id: 'electrical', name: 'Electrical', group: 'Hard FM', icon: 'bolt', color: 'amber' },
  { id: 'handyman', name: 'General Maintenance (GM)', group: 'Hard FM', icon: 'hammer', color: 'orange' },
  { id: 'seating', name: 'Seating Occupancy', group: 'Soft FM', icon: 'chair', color: 'teal' },
  { id: 'fleet', name: 'Fleet', group: 'Soft FM', icon: 'car', color: 'slate' },
  { id: 'valet', name: 'Valet', group: 'Soft FM', icon: 'key', color: 'blue' },
  { id: 'reception', name: 'Receptionist', group: 'Soft FM', icon: 'user-tie', color: 'purple' },
  { id: 'office-boy', name: 'Office Boy', group: 'Soft FM', icon: 'mug-hot', color: 'emerald' },
  { id: 'janitorial', name: 'Janitorial', group: 'Soft FM', icon: 'broom', color: 'teal' },
];

export const MERIT_REASONS = [
  { label: "Extra Effort", points: 10 },
  { label: "Customer Appreciation", points: 15 },
  { label: "Technical Excellence", points: 20 },
  { label: "Clean Worksite", points: 5 }
];

export const DEMERIT_REASONS = [
  { label: "Missed Checklist", points: -5 },
  { label: "Attitude Issue", points: -10 },
  { label: "Recurring Fault", points: -15 },
  { label: "Safety Violation", points: -20 },
  { label: "Late Attendance", points: -5 }
];

export const DEFAULT_TOOLS: Record<string, { name: string, qty: number, technician?: string }[]> = {
  'ac': [
    { name: "Wrench Pana", qty: 4 },
    { name: "Pliers Set", qty: 2 },
    { name: "Screwdriver + / –", qty: 2 },
    { name: "Ammeter", qty: 2 },
    { name: "High Pressure Gauge", qty: 2 },
    { name: "Charging Line", qty: 6 },
    { name: "Flaring Tool", qty: 2 },
    { name: "LL Key Set", qty: 2 },
    { name: "Soozing Tool", qty: 1 },
    { name: "File", qty: 2 },
    { name: "Bander", qty: 1 },
    { name: "Tool Bag", qty: 2 }
  ],
  'electrical': [
    { name: "Nose Plier", qty: 3 },
    {  name: "Plier", qty: 3 },
    { name: "Cutter Plier", qty: 3 },
    {  name: "Hammer", qty: 2 },
    {  name: "Screw Driver", qty: 3 },
    {  name: "Soldering iron", qty: 1},
  ],
  'handyman': [
    { name: "Claw Hammer", qty: 1 },
  ]
};