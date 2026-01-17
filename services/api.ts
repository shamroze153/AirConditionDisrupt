
import { Asset, Ticket, StatsResponse, GasTransaction } from '../types';
import { WEB_APP_URL } from '../constants';

const safeFetch = async (url: string, options?: RequestInit, retries = 2): Promise<any> => {
  const fetchOptions: RequestInit = {
    ...options,
    redirect: 'follow',
    cache: 'no-cache',
  };

  try {
    const separator = url.includes('?') ? '&' : '?';
    // Use a simpler cache buster or omit if causing issues. 
    // GAS usually handles standard query params fine.
    const cacheBustedUrl = `${url}${separator}cb=${Date.now()}`;
    const response = await fetch(cacheBustedUrl, fetchOptions);
    
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      const json = await response.json();
      if (json.error) throw new Error(json.error);
      return json;
    } else {
      const text = await response.text();
      // Heuristic to detect if we got the Google login page instead of data
      if (text.includes("<html") && text.includes("goog-logo")) {
        throw new Error("Access Denied: Re-deploy Web App as 'Anyone'.");
      }
      return text;
    }
  } catch (error) {
    if (retries > 0) {
      console.warn(`Retrying fetch (${retries} left)...`, url);
      await new Promise(res => setTimeout(res, 1000));
      return safeFetch(url, options, retries - 1);
    }
    console.error("Fetch Error:", error);
    throw error;
  }
};

export const fetchAssets = async (): Promise<Asset[]> => safeFetch(`${WEB_APP_URL}?action=get_assets`);
export const fetchStats = async (date: string): Promise<StatsResponse> => safeFetch(`${WEB_APP_URL}?action=get_stats&date=${date}`);

export const postAction = async (formData: FormData): Promise<void> => {
  try {
    // Mode 'no-cors' is often required for GAS POST to avoid preflight failures
    await fetch(WEB_APP_URL, { 
      method: 'POST', 
      body: formData, 
      mode: 'no-cors' 
    });
  } catch (e) { 
    console.error("POST Error:", e); 
  }
};

export const updatePoints = async (tech: string, points: number, reason: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_points');
  fd.append('technician', tech);
  fd.append('points', String(points));
  fd.append('reason', reason);
  await postAction(fd);
};

export const logInsight = async (assetTag: string, category: string, details: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'log_insight');
  fd.append('assetTag', assetTag);
  fd.append('category', category);
  fd.append('details', details);
  await postAction(fd);
};

export const updateAssetStatus = async (tag: string, status: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_asset_status');
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
  await postAction(fd);
};

export const getReport = async (type: 'checklist' | 'complaint', start: string, end: string): Promise<any[]> => {
  const action = type === 'checklist' ? 'get_checklist_report' : 'get_complaint_report';
  return await safeFetch(`${WEB_APP_URL}?action=${action}&start=${start}&end=${end}`);
};

export const submitDemand = async (tech: string, details: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'submit_demand');
  fd.append('technician', tech);
  fd.append('details', details);
  fd.append('status', 'Submitted');
  await postAction(fd);
};
