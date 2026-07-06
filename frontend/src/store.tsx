import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, tokens, type AuthResult, type Group, type User } from './api.js';

type AuthState = 'loading' | 'anon' | 'onboarding' | 'ready';

interface Store {
  auth: AuthState;
  me: User | undefined;
  users: User[];
  userMap: Map<number, User>;
  groups: Group[];
  name: (id: number) => string;
  reloadGroups: () => void;
  reloadUsers: () => void;
  loginWith: (r: AuthResult) => void;
  refreshMe: () => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
};

// A logged-in user must have completed onboarding (a non-empty name).
function stateFor(me: User | undefined): AuthState {
  if (!me) return 'anon';
  return me.name?.trim() ? 'ready' : 'onboarding';
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [me, setMe] = useState<User | undefined>();
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  const reloadGroups = useCallback(() => { apiClient.groups().then(setGroups).catch(() => {}); }, []);
  const reloadUsers = useCallback(() => { apiClient.users().then(setUsers).catch(() => {}); }, []);

  const bootFor = useCallback((u: User) => {
    setMe(u);
    setAuth(stateFor(u));
    if (u.name?.trim()) { reloadGroups(); reloadUsers(); }
  }, [reloadGroups, reloadUsers]);

  // Initial session check + expiry handling.
  useEffect(() => {
    if (!tokens.access()) { setAuth('anon'); return; }
    apiClient.me().then(bootFor).catch(() => { tokens.clear(); setMe(undefined); setAuth('anon'); });
  }, [bootFor]);

  useEffect(() => {
    const onExpired = () => { setMe(undefined); setGroups([]); setAuth('anon'); };
    window.addEventListener('su-auth-expired', onExpired);
    return () => window.removeEventListener('su-auth-expired', onExpired);
  }, []);

  const loginWith = useCallback((r: AuthResult) => {
    tokens.set(r.access, r.refresh);
    bootFor(r.user);
  }, [bootFor]);

  const refreshMe = useCallback(async () => {
    const u = await apiClient.me();
    bootFor(u);
  }, [bootFor]);

  const logout = useCallback(() => {
    tokens.clear();
    setMe(undefined); setGroups([]); setUsers([]); setAuth('anon');
  }, []);

  const userMap = new Map(users.map((u) => [u.id, u]));
  if (me && !userMap.has(me.id)) userMap.set(me.id, me);
  const name = (id: number) => (id === me?.id ? me?.name : userMap.get(id)?.name) ?? `#${id}`;

  const value: Store = {
    auth, me, users, userMap, groups, name,
    reloadGroups, reloadUsers, loginWith, refreshMe, logout,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
