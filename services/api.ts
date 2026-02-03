import { Asset, Ticket, StatsResponse, GasTransaction, CategoryKey, GlobalStatsResponse, Seat, Tool } from '../types';
import { WEB_APP_URL } from '../constants';

const safeFetch = async (baseUrl: string, params: Record<string, string> = {}, options?: RequestInit, retries = 2): Promise<any> => {
  const urlObj = new URL(baseUrl);
  Object.entries(params).forEach(([k, v]) => urlObj.searchParams.append(k, v));
  urlObj.searchParams.append('cb', String(Date.now()));
  
  const fetchOptions: RequestInit = {
    method: 'GET',
    ...options,
  };

  try {
    const response = await fetch(urlObj.toString(), fetchOptions);
    
    if (!response.ok) throw new Error(`HTTP Error: ${response.status} at ${baseUrl}`);
    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      const json = await response.json();
      if (json.error) throw new Error(json.error);
      return json;
    } else {
      const text = await response.text();
      if (text.includes("<html") && (text.includes("goog-logo") || text.includes("Service Login"))) {
        throw new Error("Access Denied: Ensure the Google Script is deployed as 'Anyone'.");
      }
      return text;
    }
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

export const fetchAssets = async (category: CategoryKey): Promise<Asset[]> => 
  safeFetch(WEB_APP_URL, { action: 'get_assets', category });

export const fetchStats = async (category: CategoryKey): Promise<StatsResponse> => 
  safeFetch(WEB_APP_URL, { action: 'get_stats', category });

export const fetchGlobalStats = async (): Promise<GlobalStatsResponse> =>
  safeFetch(WEB_APP_URL, { action: 'get_global_stats' });

export const fetchTools = async (category: CategoryKey): Promise<Tool[]> =>
  safeFetch(WEB_APP_URL, { action: 'get_tools', category });

export const addTool = async (category: CategoryKey, tool: Tool): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'add_tool');
  fd.append('category', category);
  fd.append('name', tool.name);
  fd.append('qty', String(tool.qty));
  fd.append('technician', tool.technician || '');
  await postAction(fd);
};

export const updateTool = async (category: CategoryKey, oldName: string, tool: Tool): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_tool');
  fd.append('category', category);
  fd.append('oldName', oldName);
  fd.append('name', tool.name);
  fd.append('qty', String(tool.qty));
  fd.append('technician', tool.technician || '');
  await postAction(fd);
};

export const deleteTool = async (category: CategoryKey, name: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'delete_tool');
  fd.append('category', category);
  fd.append('name', name);
  await postAction(fd);
};

export const updatePoints = async (category: CategoryKey, tech: string, points: number, reason: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_points');
  fd.append('category', category.toUpperCase());
  fd.append('technician', tech);
  fd.append('points', String(points));
  fd.append('reason', reason);
  await postAction(fd);
};

export const adminReviewTicket = async (category: CategoryKey, tech: string, rowIndex: number, stars: number, points: number, assetTag: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'admin_review_ticket');
  fd.append('category', category.toUpperCase());
  fd.append('technician', tech);
  fd.append('rowIndex', String(rowIndex));
  fd.append('stars', String(stars));
  fd.append('points', String(points));
  fd.append('assetTag', assetTag || 'N/A');
  await postAction(fd);
};

export const resetLeaderboard = async (category: CategoryKey): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'reset_leaderboard');
  fd.append('category', category.toUpperCase());
  await postAction(fd);
};

export const logInsight = async (category: CategoryKey, assetTag: string, insightCategory: string, details: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'log_insight');
  fd.append('category', category.toUpperCase());
  fd.append('assetTag', assetTag);
  fd.append('insightCategory', insightCategory);
  fd.append('details', details);
  await postAction(fd);
};

export const updateAssetStatus = async (category: CategoryKey, tag: string, status: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_asset_status');
  fd.append('category', category.toUpperCase());
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
  return await safeFetch(WEB_APP_URL, { action, category, start, end });
};

export const submitDemand = async (category: CategoryKey, tech: string, details: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'submit_demand');
  fd.append('category', category.toUpperCase());
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
  fd.append('category', category.toUpperCase());
  fd.append('technician', tech);
  fd.append('points', '-25');
  fd.append('reason', `SLA BREACH: Ticket #${ticketId} open >7 days`);
  await postAction(fd);
};