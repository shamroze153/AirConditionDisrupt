import { Asset, Ticket, StatsResponse, GasTransaction, CategoryKey, GlobalStatsResponse, Seat, Tool, ValetLogEntry } from '../types';
import { WEB_APP_URL } from '../constants';

const cache: Record<string, { data: any, timestamp: number }> = {};
const CACHE_TTL = 15000; // 15 seconds

const safeFetch = async (baseUrl: string, params: Record<string, string> = {}, options?: RequestInit, retries = 2): Promise<any> => {
  const urlObj = new URL(baseUrl);
  Object.entries(params).forEach(([k, v]) => urlObj.searchParams.append(k, v));
  
  const cacheKey = urlObj.toString();
  if (cache[cacheKey] && Date.now() - cache[cacheKey].timestamp < CACHE_TTL) {
    return cache[cacheKey].data;
  }

  urlObj.searchParams.append('cb', String(Date.now()));
  
  const fetchOptions: RequestInit = {
    method: 'GET',
    ...options,
  };

  try {
    const response = await fetch(urlObj.toString(), fetchOptions);
    
    if (!response.ok) throw new Error(`HTTP Error: ${response.status} at ${baseUrl}`);
    
    const contentType = response.headers.get("content-type");
    let data;
    if (contentType && contentType.indexOf("application/json") !== -1) {
      data = await response.json();
      if (data.error) throw new Error(data.error);
    } else {
      data = await response.text();
      if (data.includes("<html") && (data.includes("goog-logo") || data.includes("Service Login"))) {
        throw new Error("Access Denied: Ensure the Google Script is deployed as 'Anyone'.");
      }
    }
    
    cache[cacheKey] = { data, timestamp: Date.now() };
    return data;
  } catch (error) {
    if (retries > 0) {
      console.warn(`Retrying fetch (${retries} left) for: ${baseUrl}`);
      await new Promise(res => setTimeout(res, 1500));
      return safeFetch(baseUrl, params, options, retries - 1);
    }
    console.error(`Fetch failure for ${baseUrl}:`, error);
    throw error;
  }
};

export const postAction = async (formData: FormData): Promise<void> => {
  // Clear cache to ensure fresh data on next fetch
  Object.keys(cache).forEach(key => delete cache[key]);
  
  try {
    const params = new URLSearchParams();
    formData.forEach((value, key) => {
      params.append(key, String(value));
    });

    await fetch(WEB_APP_URL, { 
      method: 'POST', 
      body: params, 
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
  } catch (e) { 
    console.error("POST Error:", e); 
    throw e;
  }
};

const mapCategory = (cat: CategoryKey): string => {
  if (cat === 'handyman') return 'General Maintenance (GM)';
  return cat.toUpperCase();
};

export const rebalanceAssets = async (category: CategoryKey, techs: string[]): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'rebalance_assets');
  fd.append('category', mapCategory(category));
  fd.append('techs', techs.join(','));
  await postAction(fd);
};

export const standardizeHistoricalData = async (): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'standardize_data');
  await postAction(fd);
};

export const fetchAssets = async (category: CategoryKey): Promise<Asset[]> => 
  safeFetch(WEB_APP_URL, { action: 'get_assets', category: mapCategory(category) });

export const fetchStats = async (category: CategoryKey): Promise<StatsResponse> => 
  safeFetch(WEB_APP_URL, { action: 'get_stats', category: mapCategory(category) });

export const fetchGlobalStats = async (): Promise<GlobalStatsResponse> =>
  safeFetch(WEB_APP_URL, { action: 'get_global_stats' });

export const fetchTools = async (category: CategoryKey): Promise<Tool[]> =>
  safeFetch(WEB_APP_URL, { action: 'get_tools', category: mapCategory(category) });

export const addTool = async (category: CategoryKey, tool: Tool): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'add_tool');
  fd.append('category', mapCategory(category));
  fd.append('name', tool.name);
  fd.append('qty', String(tool.qty));
  fd.append('technician', tool.technician || '');
  await postAction(fd);
};

export const updateTool = async (category: CategoryKey, oldName: string, tool: Tool): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_tool');
  fd.append('category', mapCategory(category));
  fd.append('oldName', oldName);
  fd.append('name', tool.name);
  fd.append('qty', String(tool.qty));
  fd.append('technician', tool.technician || '');
  await postAction(fd);
};

export const deleteTool = async (category: CategoryKey, name: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'delete_tool');
  fd.append('category', mapCategory(category));
  fd.append('name', name);
  await postAction(fd);
};

export const updatePoints = async (category: CategoryKey, tech: string, points: number, reason: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_points');
  fd.append('category', mapCategory(category));
  fd.append('technician', tech);
  fd.append('points', String(points));
  fd.append('reason', reason);
  await postAction(fd);
};

export const adminReviewTicket = async (category: CategoryKey, tech: string, rowIndex: number, stars: number, points: number, assetTag: string, reviewReason?: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'admin_review_ticket');
  fd.append('category', mapCategory(category));
  fd.append('technician', tech);
  fd.append('rowIndex', String(rowIndex));
  fd.append('stars', String(stars));
  fd.append('points', String(points));
  fd.append('assetTag', assetTag || 'N/A');
  if (reviewReason) fd.append('reviewReason', reviewReason);
  await postAction(fd);
};

export const resetLeaderboard = async (category: CategoryKey): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'reset_leaderboard');
  fd.append('category', mapCategory(category));
  await postAction(fd);
};

export const logInsight = async (category: CategoryKey, assetTag: string, insightCategory: string, details: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'log_insight');
  fd.append('category', mapCategory(category));
  fd.append('assetTag', assetTag);
  fd.append('insightCategory', insightCategory);
  fd.append('details', details);
  await postAction(fd);
};

export const updateAssetStatus = async (category: CategoryKey, tag: string, status: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_asset_status');
  fd.append('category', mapCategory(category));
  fd.append('tag', tag);
  fd.append('status', status);
  await postAction(fd);
};

export const logGasTransaction = async (tx: GasTransaction): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'log_gas_tx');
  fd.append('type', tx.action);
  fd.append('gasType', tx.gasType);
  fd.append('amount', String(tx.amount));
  fd.append('tech', tx.tech);
  if (tx.refTicket) fd.append('refTicket', tx.refTicket);
  fd.append('category', tx.category || 'AC');
  await postAction(fd);
};

export const getReport = async (category: CategoryKey, type: 'checklist' | 'complaint', start: string, end: string): Promise<any[]> => {
  const action = type === 'checklist' ? 'get_checklist_report' : 'get_complaint_report';
  return await safeFetch(WEB_APP_URL, { action, category: mapCategory(category), start, end });
};

export const submitDemand = async (category: CategoryKey, tech: string, details: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'submit_demand');
  fd.append('category', mapCategory(category));
  fd.append('technician', tech);
  fd.append('details', details);
  fd.append('status', 'Submitted');
  await postAction(fd);
};

export const addOccupancy = async (seat: Seat): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'add_occupancy');
  Object.entries(seat).forEach(([key, value]) => fd.append(key, String(value)));
  await postAction(fd);
};

export const updateOccupancy = async (seat: Seat): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_occupancy');
  Object.entries(seat).forEach(([key, value]) => fd.append(key, String(value)));
  await postAction(fd);
};

export const deleteOccupancy = async (no: number | string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'delete_occupancy');
  fd.append('no', String(no));
  await postAction(fd);
};

export const deductSLAPenalty = async (category: CategoryKey, tech: string, ticketId: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_points');
  fd.append('category', mapCategory(category));
  fd.append('technician', tech);
  fd.append('points', '-25');
  fd.append('reason', `SLA BREACH: Ticket #${ticketId} open >7 days`);
  await postAction(fd);
};

export const logTakeover = async (category: CategoryKey, originalTech: string, actingTech: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'log_insight');
  fd.append('category', mapCategory(category));
  fd.append('assetTag', 'TAKEOVER');
  fd.append('insightCategory', 'Absence Management');
  fd.append('details', `[TAKEOVER] Original: ${originalTech}, Acting: ${actingTech}, Reason: Absence`);
  await postAction(fd);
};

export const fetchValetData = async (): Promise<ValetLogEntry[]> =>
  safeFetch(WEB_APP_URL, { action: 'get_valet_data' });

export const logValetAction = async (data: {
  carNumber: string;
  cardNumber?: string;
  parkingSlot?: string;
  valetAction: 'Drive IN' | 'Drive OUT';
  driver: string;
  remarks?: string;
}): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'valet_action');
  fd.append('carNumber', data.carNumber);
  fd.append('cardNumber', data.cardNumber || '');
  fd.append('parkingSlot', data.parkingSlot || '');
  fd.append('valetAction', data.valetAction);
  fd.append('driver', data.driver);
  fd.append('remarks', data.remarks || '');
  await postAction(fd);
};
