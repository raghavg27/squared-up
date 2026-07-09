// Thin REST client for the Squared Up API. Mutations carry an Idempotency-Key
// so the offline outbox can safely retry (Spec §12 / I9). Auth is a JWT access
// token in localStorage; a 401 triggers a one-shot refresh before failing.
const BASE = '/api/v1';

export interface User {
  id: number; name: string; phone: string | null; email?: string | null;
  email_verified?: boolean;
  // True for an invited person who hasn't signed in yet — drives the
  // "invite pending" UI. Cleared server-side when they authenticate.
  is_placeholder?: boolean;
  upi_vpa: string | null; avatar_url?: string | null; locale: string;
}
export interface Group {
  id: number; name: string; type: string; members: number[];
  rotation_enabled: boolean; rotation_mode: 'balanced' | 'round_robin';
  created_by?: number; archived_at?: string | null;
}
export interface Share { user_id: number; paid_paise: number; owed_paise: number; net_paise: number }
export interface Expense { id: number; description: string; amount_paise: number; is_rotation: boolean; shares: Share[]; created_at: string; group_id: number | null; expense_date?: string; created_by?: number }
export interface Balances {
  group_id: number;
  members: { user_id: number; net_paise: number }[];
  simplified_settlements: { from_user: number; to_user: number; amount_paise: number }[];
}
export interface PersonalBalances {
  user_id: number;
  counterparties: { user_id: number; net_paise: number }[];
}
export interface Turn {
  group_id: number; mode: string;
  next_payer: { user_id: number; rotation_net_paise: number };
  max_abs_rotation_net_paise: number; reason: string;
}
export interface NlDraft {
  description: string; amount_paise: number | null; category: string;
  mentioned_names: string[]; i_paid: boolean; split_type: 'equal'; confidence: number;
}
export interface SettlementResult { id: number; status: string; method: string; upi_intent: string | null; requires_confirmation: boolean }
export interface Settlement {
  id: number; group_id: number | null; from_user: number; to_user: number;
  amount_paise: number; method: string; status: string; note: string | null;
  created_at: string; confirmed_at: string | null;
}
export interface Comment {
  id: number; expense_id: number; user_id: number; body: string; created_at: string;
}
export interface ActivityEvent {
  id: number; actor: number; type: string;
  target: string | null;
  payload: Record<string, unknown>; created_at: string;
}
export interface OtpRequestResult { sent: boolean; phone: string; expires_in: number; dev_code?: string }
export interface AuthResult { is_new: boolean; user: User; access: string; refresh: string }

export interface ApiErr { error: { code: string; message: string } }

// ── Token storage ─────────────────────────────────────────────────────────
const ACCESS_KEY = 'su_access';
const REFRESH_KEY = 'su_refresh';
export const tokens = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() { localStorage.removeItem(ACCESS_KEY); localStorage.removeItem(REFRESH_KEY); },
};

// Raised so the app can react (e.g. bounce to /login) on an unrecoverable 401.
export class AuthExpiredError extends Error { constructor() { super('AUTH_EXPIRED'); } }
function signalAuthExpired() {
  tokens.clear();
  window.dispatchEvent(new Event('su-auth-expired'));
}

export class ApiError extends Error {
  code: string; status: number;
  constructor(code: string, status: number, message?: string) {
    super(message || code); this.code = code; this.status = status;
  }
}

let refreshing: Promise<string | null> | null = null;
async function tryRefresh(): Promise<string | null> {
  const rt = tokens.refresh();
  if (!rt) return null;
  if (!refreshing) {
    refreshing = fetch(BASE + '/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: rt }),
    })
      .then(async (r) => {
        if (!r.ok) return null;
        const b = await r.json();
        tokens.set(b.access);
        return b.access as string;
      })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function raw<T>(path: string, opts: RequestInit, idempotent: boolean, retry: boolean): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string>) };
  const at = tokens.access();
  if (at) headers['Authorization'] = `Bearer ${at}`;
  if (idempotent) headers['Idempotency-Key'] = crypto.randomUUID();

  const res = await fetch(BASE + path, { ...opts, headers });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = (body as ApiErr)?.error?.code ?? `HTTP_${res.status}`;
    if (res.status === 401 && retry && tokens.refresh()) {
      const fresh = await tryRefresh();
      if (fresh) return raw<T>(path, opts, false, false); // one retry, non-idempotent replay avoided
      signalAuthExpired();
      throw new AuthExpiredError();
    }
    if (res.status === 401) { signalAuthExpired(); throw new AuthExpiredError(); }
    throw new ApiError(code, res.status, (body as ApiErr)?.error?.message);
  }
  return body as T;
}

function req<T>(path: string, opts: RequestInit = {}, idempotent = false): Promise<T> {
  return raw<T>(path, opts, idempotent, true);
}

export const apiClient = {
  // Auth
  requestOtp: (phone: string) => req<OtpRequestResult>('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, code: string) => req<AuthResult>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  googleLogin: (credential: string) => req<AuthResult>('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),
  me: () => req<User>('/auth/me'),
  updateMe: (input: Partial<User>) => req<User>('/auth/me', { method: 'PATCH', body: JSON.stringify(input) }),

  // Directory / social
  users: () => req<User[]>('/users'),
  user: (id: number) => req<User>(`/users/${id}`),
  searchUsers: (query: string) => req<User[]>(`/users?query=${encodeURIComponent(query)}`),
  createUser: (input: { name: string; phone?: string | null; email?: string | null; upi_vpa?: string | null; locale?: string }) =>
    req<User>('/users', { method: 'POST', body: JSON.stringify({ locale: 'en', ...input }) }),
  friends: () => req<User[]>('/friends'),
  addFriend: (user_id: number) => req<{ ok: boolean; friends: User[] }>('/friends', { method: 'POST', body: JSON.stringify({ user_id }) }),
  removeFriend: (user_id: number) => req<{ ok: boolean; friends: User[] }>(`/friends/${user_id}`, { method: 'DELETE' }),

  // Groups
  groups: (archived = false) => req<Group[]>(`/groups${archived ? '?archived=1' : ''}`),
  group: (id: number) => req<Group>(`/groups/${id}`),
  createGroup: (input: unknown) => req<Group>('/groups', { method: 'POST', body: JSON.stringify(input) }),
  archiveGroup: (id: number) => req<Group>(`/groups/${id}`, { method: 'DELETE' }),
  restoreGroup: (id: number) => req<Group>(`/groups/${id}/restore`, { method: 'POST' }),
  addMember: (gid: number, user_id: number) => req<Group>(`/groups/${gid}/members`, { method: 'POST', body: JSON.stringify({ user_id }) }),
  removeMember: (gid: number, uid: number) => req<Group>(`/groups/${gid}/members/${uid}`, { method: 'DELETE' }),

  // Expenses
  expenses: (gid: number) => req<Expense[]>(`/groups/${gid}/expenses`),
  personalExpenses: (withUserId?: number) =>
    req<Expense[]>(`/expenses/personal${withUserId ? `?with=${withUserId}` : ''}`),
  expense: (id: number) => req<Expense>(`/expenses/${id}`),
  balances: (gid: number) => req<Balances>(`/groups/${gid}/balances`),
  personalBalances: () => req<PersonalBalances>('/balances/personal'),
  turn: (gid: number) => req<Turn>(`/groups/${gid}/turn`),
  createExpense: (input: unknown) => req<Expense>('/expenses', { method: 'POST', body: JSON.stringify(input) }, true),
  updateExpense: (id: number, input: unknown) => req<Expense>(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteExpense: (id: number) => req<void>(`/expenses/${id}`, { method: 'DELETE' }),
  comments: (id: number) => req<Comment[]>(`/expenses/${id}/comments`),
  addComment: (id: number, body: string) => req<Comment>(`/expenses/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),

  // Settlements
  settlements: (gid?: number) => req<Settlement[]>(`/settlements${gid ? `?group_id=${gid}` : ''}`),
  createSettlement: (input: unknown) => req<SettlementResult>('/settlements', { method: 'POST', body: JSON.stringify(input) }, true),
  confirmSettlement: (id: number) => req(`/settlements/${id}/confirm`, { method: 'PATCH' }),

  // AI + activity
  parse: (text: string) => req<NlDraft>('/ai/parse', { method: 'POST', body: JSON.stringify({ text }) }),
  activity: () => req<ActivityEvent[]>('/activity'),
};
