import { FyersApiClient } from './FyersApiClient.js';
import { API_LATENCY_BUDGET_MS } from '../../latency/budgets.js';

export class FyersAccountService {
  constructor(private readonly client: FyersApiClient) {}
  profile(signal?: AbortSignal) { return this.client.apiGet('/profile', {}, signal); }
  funds(signal?: AbortSignal) { return this.client.apiGet('/funds', {}, signal); }
  holdings(signal?: AbortSignal) { return this.client.apiGet('/holdings', {}, signal); }
  orders(params: { id?: string; orderTag?: string } = {}, signal?: AbortSignal) {
    return this.client.apiRequest('/orders', { method: 'GET', params: { id: params.id, order_tag: params.orderTag }, signal, category: 'user-info', priority: 'high' });
  }
  trades(signal?: AbortSignal) {
    return this.client.apiRequest('/tradebook', { method: 'GET', signal, category: 'user-info', priority: 'high' });
  }
  positions(signal?: AbortSignal) { return this.client.apiGet('/positions', {}, signal); }
  margin(data: unknown, signal?: AbortSignal) { return this.client.apiPost('/multiorder/margin', { data }, signal, API_LATENCY_BUDGET_MS.account, 'user-info'); }
  report(path: string, params: Record<string,string|number|undefined>, signal?: AbortSignal) { return this.client.apiGet(path, params, signal); }
}
