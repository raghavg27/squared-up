import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, ApiError, type Balances, type Group } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Icon, groupTypeStyle } from '../ui.js';

export function GroupSettings() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { me, name, reloadGroups } = useStore();
  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);

  const archived = !!group?.archived_at;
  const isOwner = !!me && group?.created_by === me.id;

  const load = useCallback(() => {
    apiClient.group(gid).then(setGroup).catch(() => {});
    apiClient.balances(gid).then(setBalances).catch(() => {});
  }, [gid]);
  useEffect(load, [load]);

  const netOf = (uid: number) => balances?.members.find((m) => m.user_id === uid)?.net_paise ?? 0;

  async function remove(uid: number) {
    if (busyId) return;
    setBusyId(uid); setErr(null);
    try { const g = await apiClient.removeMember(gid, uid); setGroup(g); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not remove'); }
    finally { setBusyId(null); }
  }

  async function archive() {
    if (archiveBusy) return;
    if (!window.confirm('Archive this group? It moves to Archived — you can restore it anytime for reference.')) return;
    setArchiveBusy(true); setErr(null);
    try { await apiClient.archiveGroup(gid); reloadGroups(); nav('/groups'); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not archive'); setArchiveBusy(false); }
  }

  async function restore() {
    if (archiveBusy) return;
    setArchiveBusy(true); setErr(null);
    try { const g = await apiClient.restoreGroup(gid); setGroup(g); reloadGroups(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not restore'); }
    finally { setArchiveBusy(false); }
  }

  const st = groupTypeStyle(group?.type ?? 'other');

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <header className="flex items-center justify-between px-mobile py-3 border-b border-neutral-100">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-ink">Group Settings</h1>
        <div className="w-10" />
      </header>

      <main className="px-mobile flex flex-col gap-5 mt-4">
        <div className="flex flex-col items-center gap-2">
          <div className={`w-16 h-16 rounded-card flex items-center justify-center ${st.tint} ${st.fg}`}>
            <Icon name={st.icon} fill style={{ fontSize: 30 }} />
          </div>
          <h2 className="font-heading text-[22px] font-bold text-ink">{group?.name}</h2>
          <span className="font-caption text-caption text-neutral-600 capitalize">{group?.type} • {group?.members.length ?? 0} members
            {group?.rotation_enabled ? ' • Turn to Pay on' : ''}</span>
          {archived && (
            <span className="mt-1 inline-flex items-center gap-1 px-3 h-7 rounded-full bg-surface-container-high text-neutral-600 font-caption text-caption">
              <Icon name="inventory_2" style={{ fontSize: 16 }} /> Archived — read only
            </span>
          )}
        </div>

        {err && <p className="text-primary font-caption text-caption text-center">{err}</p>}

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-[17px] font-bold text-ink">Members</h3>
            {!archived && (
              <button onClick={() => nav(`/groups/${gid}/add-member`)} className="flex items-center gap-1 text-primary font-body text-[15px] font-medium">
                <Icon name="person_add" style={{ fontSize: 20 }} /> Add
              </button>
            )}
          </div>
          <div className="bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow divide-y divide-neutral-100">
            {group?.members.map((uid) => {
              const net = netOf(uid);
              const isMe = uid === me?.id;
              // Backend blocks removing the owner (only they can archive/restore).
              const isGroupOwner = uid === group?.created_by;
              return (
                <div key={uid} className="p-3 flex items-center gap-3">
                  <Avatar name={name(uid)} size={40} me={isMe} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-body text-[17px] text-ink">{isMe ? 'You' : name(uid)}</span>
                    <span className={`font-caption text-caption ${net === 0 ? 'text-neutral-600' : net > 0 ? 'text-success' : 'text-primary'}`}>
                      {net === 0 ? 'Squared up' : net > 0 ? 'Is owed money' : 'Owes money'}
                    </span>
                  </div>
                  {!isMe && !archived && (
                    <button
                      onClick={() => remove(uid)}
                      disabled={busyId === uid || net !== 0 || isGroupOwner}
                      title={isGroupOwner ? "The owner can't be removed" : net !== 0 ? 'Square up before removing' : 'Remove'}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-primary disabled:text-neutral-300 active:scale-95 transition-transform"
                    >
                      <Icon name="person_remove" style={{ fontSize: 20 }} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {!archived && <p className="font-caption text-caption text-neutral-600">A member can only be removed once their balance is squared up.</p>}
        </section>

        {/* Archive / restore — owner only. Archiving is a reversible soft delete. */}
        {isOwner && (
          <section className="flex flex-col gap-2 mt-2">
            <h3 className="font-heading text-[17px] font-bold text-ink">Danger zone</h3>
            {archived ? (
              <button
                onClick={restore}
                disabled={archiveBusy}
                className="w-full h-12 rounded-button bg-surface-container-lowest border border-neutral-300 text-primary font-heading text-[15px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                <Icon name="unarchive" style={{ fontSize: 20 }} /> Restore group
              </button>
            ) : (
              <button
                onClick={archive}
                disabled={archiveBusy}
                className="w-full h-12 rounded-button bg-primary/10 text-primary font-heading text-[15px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                <Icon name="inventory_2" style={{ fontSize: 20 }} /> Archive group
              </button>
            )}
            <p className="font-caption text-caption text-neutral-600">
              {archived ? 'Restoring makes the group active and editable again.' : 'Archiving hides the group from your list but keeps all expenses for reference. You can restore it anytime.'}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
