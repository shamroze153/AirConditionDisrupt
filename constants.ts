
import { FMCategory, SoftFMStaff } from './types';

export const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwWBb3nqwNIp4cG2ktNEMM4zUJzvBBERcBNFbqnVcT2bkMnNjyWjR9EV2qoH3LjXwSxbg/exec";

// Swapped Taimoor and Saboor for Zone assignment logic
export const TECHNICIANS = ['Bilal', 'Asad', 'Saboor', 'Taimoor'];
export const ELECTRICAL_TECHNICIANS = ['Ibraheem', 'Naveed Ali', 'Haris', 'Owais'];
export const GM_TECHNICIANS = ['Sajid']; 

export const TECHNICIAN_SALARIES: Record<string, number> = {
  'Bilal': 45000,
  'Asad': 42000,
  'Saboor': 40000,
  'Taimoor': 40000,
  'Ibraheem': 48000,
  'Naveed Ali': 46000,
  'Haris': 44000,
  'Owais': 44000,
  'Sajid': 35000
};

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
  { id: 'valet', name: 'Valet', group: 'Soft FM', icon: 'key', color: 'blue' },
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

export const PRE_DEFINED_VEHICLES: any[] = [
  { number: 'ABD 523', model: 'YARIS', color: '#3b82f6', notes: '-' },
  { number: 'ABL 748', model: 'Alto', color: '#3b82f6', notes: '-' },
  { number: 'BTR 942', model: '(Corolla / similar)', color: '#3b82f6', notes: '-' },
  { number: 'BXE 705', model: 'Cultus', color: '#3b82f6', notes: '-' },
  { number: 'BGK 835', model: 'Alto', color: '#3b82f6', notes: '-' },
  { number: 'BHP 778', model: 'Cultus', color: '#3b82f6', notes: '-' },
  { number: 'BXD 543', model: 'Alto', color: '#3b82f6', notes: '-' },
  { number: 'BYE 849', model: 'Cultus', color: '#3b82f6', notes: '-' },
  { number: 'BXA 190', model: 'YARIS', color: '#3b82f6', notes: '-' },
  { number: 'BUL 214', model: 'Alto', color: '#3b82f6', notes: '-' },
  { number: 'BNP 432', model: 'YARIS', color: '#3b82f6', notes: '' },
  { number: 'ABL 452', model: 'YARIS', color: '#3b82f6', notes: '' },
  { number: 'BNL 853', model: 'YARIS', color: '#3b82f6', notes: '' },
  { number: 'BYE 874', model: 'YARIS', color: '#3b82f6', notes: '' },
  { number: 'ANX 501', model: 'YARIS', color: '#3b82f6', notes: '' },
  { number: 'BXE 745', model: 'YARIS', color: '#3b82f6', notes: '' },
  { number: 'AAJ 979', model: 'ROCKY', color: '#3b82f6', notes: 'ROCKY' },
  { number: 'BKG 351', model: 'YARIS', color: '#3b82f6', notes: '' },
  { number: 'C00-353', model: 'Alto', color: '#3b82f6', notes: '-' },
  { number: 'BVL 214', model: 'Cultus', color: '#3b82f6', notes: '-' },
  { number: 'BXV-909', model: 'ALTO', color: '#3b82f6', notes: '-' }
];

export const SOFT_FM_STAFF: Record<string, SoftFMStaff[]> = {
  'Valet': [
    { code: '3384', name: 'Sunny Souno', department: 'Valet', role: 'Rider' },
    { code: '1977', name: 'Farooq Hussain', department: 'Valet', role: 'Driver' },
    { code: '3333', name: 'Sahib Ur Rehman', department: 'Valet', role: 'Driver' },
    { code: '2212', name: 'M Salah uddin', department: 'Valet', role: 'Driver' },
    { code: '2414', name: 'Syed Asghar Ali', department: 'Valet', role: 'Driver' },
    { code: '2415', name: 'Kashif Ahmed', department: 'Valet', role: 'Driver' }
  ],
  'Office Boy': [
    { code: '405', name: 'M. Naseem Khan', department: 'Office Boy' },
    { code: '638', name: 'Arshad Hussain', department: 'Office Boy' },
    { code: '1978', name: 'Sohail Khan', department: 'Office Boy' },
    { code: '2009', name: 'Ali Hassan', department: 'Office Boy' },
    { code: '2099', name: 'M. Furqan', department: 'Office Boy' },
    { code: '2166', name: 'Azhar Abbas', department: 'Office Boy' },
    { code: '2167', name: 'Allaha Ditta', department: 'Office Boy' },
    { code: '1525', name: 'Kamran Ghaffar', department: 'Office Boy' },
    { code: '655', name: 'M. Shahid', department: 'Office Boy' },
    { code: '2310', name: 'Muhammad Hussain', department: 'Office Boy' },
    { code: '1300', name: 'M Mustafa', department: 'Office Boy' },
    { code: '209', name: 'M. Jawed', department: 'Office Boy' },
    { code: '1617', name: 'M. Asif', department: 'Office Boy' },
    { code: '2286', name: 'Noor Khan', department: 'Office Boy' },
    { code: '335', name: 'Salman Khan', department: 'Office Boy' },
    { code: '499', name: 'Jameel Akhter', department: 'Office Boy' }
  ],
  'Rider': [
    { code: '3080', name: 'Muzamil Ahmed', department: 'Rider' },
    { code: '226', name: 'Abdul Hadi', department: 'Rider' },
    { code: '898', name: 'Abdul Mateen', department: 'Rider' }
  ],
  'Receptionist': [
    { code: '1910', name: 'Arbaz Hussain', department: 'Receptionist' },
    { code: '1343', name: 'Ahsan Hussain', department: 'Receptionist' }
  ],
  'Janitorial': [
    { code: '776', name: 'Kalash Nat', department: 'Janitorial' },
    { code: '1322', name: 'Raju', department: 'Janitorial' },
    { code: '1337', name: 'Waseem', department: 'Janitorial' },
    { code: '1344', name: 'Saleem Kumar', department: 'Janitorial' },
    { code: '1401', name: 'Jawed Bhatti', department: 'Janitorial' },
    { code: '2008', name: 'Danish Khan', department: 'Janitorial' },
    { code: '2068', name: 'Sharjeel', department: 'Janitorial' },
    { code: '1883', name: 'Lata Vicky', department: 'Janitorial' },
    { code: '613', name: 'Jhonson Ilyas', department: 'Janitorial' },
    { code: '629', name: 'Sanjay Kumar', department: 'Janitorial' },
    { code: '1941', name: 'Aakash', department: 'Janitorial' },
    { code: '1884', name: 'Pardeep Kumar', department: 'Janitorial' },
    { code: '2337', name: 'Danish Safel', department: 'Janitorial' },
    { code: '1650', name: 'Deepak Kumar', department: 'Janitorial' },
    { code: '2369', name: 'Sagar Chand', department: 'Janitorial' },
    { code: '3334', name: 'Komal Raj', department: 'Janitorial' },
    { code: '1609', name: 'Nisha Babu', department: 'Janitorial' },
    { code: '3081', name: 'Rekha Chawriya', department: 'Janitorial' },
    { code: '3413', name: 'Tina Adnan', department: 'Janitorial' }
  ],
  'Gate keeper': [
    { code: '740', name: 'Syed Fazal Shah', department: 'Gate keeper' },
    { code: '2472', name: 'Abdul Kabeer', department: 'Gate keeper' },
    { code: '2474', name: 'Khalid', department: 'Gate keeper' },
    { code: '2208', name: 'Muhammad Shahzad', department: 'Gate keeper' },
    { code: '1301', name: 'Amit Kumar', department: 'Gate keeper' },
    { code: '1893', name: 'Lakhan', department: 'Gate keeper' },
    { code: '2845', name: 'Mamoon - Ur - Rasheed', department: 'Gate keeper' },
    { code: '2197', name: 'Ayush Kishan', department: 'Gate keeper' },
    { code: '2376', name: 'Naseem Uddin', department: 'Gate keeper' },
    { code: '3142', name: 'Haseeb Khan', department: 'Gate keeper' },
    { code: '1711', name: 'Muhammad Abid', department: 'Gate keeper' },
    { code: '2553', name: 'Mahtab Ahmed', department: 'Gate keeper' }
  ],
  'Security Supervisor': [
    { code: '3019', name: 'Muhammad Ramzan', department: 'Security Supervisor' },
    { code: '3380', name: 'ASAD KHAN', department: 'Security Supervisor' }
  ],
  'Paramedic Staff': [
    { code: '3466', name: 'Arsalan Yousaf', department: 'Paramedic Staff' }
  ]
};
