import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, ApiError, type Balances, type Group } from '../api.js';
import { useStore } from '../store.js';
import { useToast } from '../toast.js';
import { Avatar, Icon, groupTypeStyle } from '../ui.js';
import { PageBanner } from '../banners.js';

export function GroupSettings() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { me, name, reloadGroups } = useStore();
  const { showToast } = useToast();
  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

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

  async function exportXlsx() {
    if (exportBusy) return;
    setExportBusy(true); setErr(null);
    try { await apiClient.exportGroup(gid); showToast('Spreadsheet downloaded'); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not export'); }
    finally { setExportBusy(false); }
  }

  const st = groupTypeStyle(group?.type ?? 'other');

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <PageBanner title="Group Settings" sub={group?.name} />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-6">
        <span className="sheet-handle" />

        <div className="flex flex-col items-center gap-2 pt-5">
          <span className="w-16 h-16 rounded-card bg-primary shadow-tile-coral text-white flex items-center justify-center">
            <Icon name={st.icon} fill style={{ fontSize: 30 }} />
          </span>
          <h2 className="font-heading text-[22px] font-extrabold text-ink">{group?.name}</h2>
          <span className="font-body text-[12.5px] font-semibold text-neutral-600 capitalize">{group?.type} · {group?.members.length ?? 0} members
            {group?.rotation_enabled ? ' · Turn to Pay on' : ''}</span>
          {archived && (
            <span className="mt-1 inline-flex items-center gap-1 px-3 h-7 rounded-full bg-surface-container-high text-neutral-600 font-caption text-caption">
              <Icon name="inventory_2" style={{ fontSize: 16 }} /> Archived — read only
            </span>
          )}
        </div>

        {err && <p className="text-primary font-caption text-caption text-center">{err}</p>}

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-body text-[16px] font-semibold text-neutral-600">Members</h3>
            {!archived && (
              <button onClick={() => nav(`/groups/${gid}/add-member`)} className="flex items-center gap-1 text-primary font-body text-[14px] font-bold active:scale-95 transition-transform">
                <Icon name="person_add" style={{ fontSize: 20 }} /> Add
              </button>
            )}
          </div>
          <div className="flex flex-col gap-4">
            {group?.members.map((uid) => {
              const net = netOf(uid);
              const isMe = uid === me?.id;
              // Backend blocks removing the owner (only they can archive/restore).
              const isGroupOwner = uid === group?.created_by;
              return (
                <div key={uid} className="flex items-center gap-3">
                  <Avatar name={name(uid)} size={49} me={isMe} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-body text-[16px] font-bold text-ink">{isMe ? 'You' : name(uid)}</span>
                    <span className={`font-body text-[12.5px] font-semibold ${net === 0 ? 'text-neutral-600' : net > 0 ? 'text-teal' : 'text-primary'}`}>
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

        {/* Export — any member, archived groups included (read-only history). */}
        <section className="flex flex-col gap-3">
          <h3 className="font-body text-[16px] font-semibold text-neutral-600">Export</h3>
          <button
            onClick={exportXlsx}
            disabled={exportBusy}
            className="w-full h-[52px] rounded-full bg-surface shadow-soft text-ink font-heading text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <Icon name={exportBusy ? 'hourglass_empty' : 'table_view'} style={{ fontSize: 20 }} />
            {exportBusy ? 'Preparing…' : 'Export to Excel (.xlsx)'}
          </button>
          <p className="font-caption text-caption text-neutral-600">
            Downloads every expense and settlement as a spreadsheet, with a per-member balance column and a total row.
          </p>
        </section>

        {/* Archive / restore — owner only. Archiving is a reversible soft delete. */}
        {isOwner && (
          <section className="flex flex-col gap-3">
            <h3 className="font-body text-[16px] font-semibold text-neutral-600">Danger zone</h3>
            {archived ? (
              <button
                onClick={restore}
                disabled={archiveBusy}
                className="w-full h-[52px] rounded-full bg-surface shadow-soft text-primary font-heading text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                <Icon name="unarchive" style={{ fontSize: 20 }} /> Restore group
              </button>
            ) : (
              <button
                onClick={archive}
                disabled={archiveBusy}
                className="w-full h-[52px] rounded-full bg-primary/10 text-primary font-heading text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
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
