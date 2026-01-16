
import { Asset, Ticket, StatsResponse, GasTransaction } from '../types';
import { WEB_APP_URL } from '../constants';

const safeFetch = async (url: string, options?: RequestInit) => {
  try {
    const separator = url.includes('?') ? '&' : '?';
    const cacheBustedUrl = `${url}${separator}t=${Date.now()}`;
    const response = await fetch(cacheBustedUrl, options);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
      const json = await response.json();
      if (json.error) throw new Error(json.error);
      return json;
    } else {
      const text = await response.text();
      if (text.includes("<html")) throw new Error("Access Denied: Re-deploy Web App as 'Anyone'.");
      return text;
    }
  } catch (error) {
    console.error("Fetch Error:", error);
    throw error;
  }
};

export const fetchAssets = async (): Promise<Asset[]> => safeFetch(`${WEB_APP_URL}?action=get_assets`);
export const fetchStats = async (date: string): Promise<StatsResponse> => safeFetch(`${WEB_APP_URL}?action=get_stats&date=${date}`);

export const postAction = async (formData: FormData): Promise<void> => {
  try {
    console.log(`Posting Action: ${formData.get('action')}`, Object.fromEntries(formData));
    await fetch(WEB_APP_URL, { 
      method: 'POST', 
      body: formData, 
      mode: 'no-cors' // Google Apps Script requires no-cors for simple POST redirects
    });
  } catch (e) { 
    console.error("POST Error:", e); 
  }
};

export const logInsight = async (assetTag: string, category: string, details: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'log_insight');
  fd.append('assetTag', assetTag);
  fd.append('category', category);
  fd.append('details', details);
  await postAction(fd);
};

export const addAsset = async (asset: Partial<Asset>): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'add_asset');
  Object.entries(asset).forEach(([k, v]) => fd.append(k, String(v)));
  await postAction(fd);
};

export const updateAssetStatus = async (tag: string, status: string): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'update_asset_status');
  fd.append('tag', tag);
  fd.append('status', status);
  await postAction(fd);
};

export const manualOverrideHealth = async (tag: string, health: number): Promise<void> => {
  const fd = new FormData();
  fd.append('action', 'manual_override_health');
  fd.append('tag', tag);
  fd.append('health', String(health));
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
