import { useRef, useState } from 'react';
import { apiClient, ApiError } from './api.js';
import { useStore } from './store.js';
import { Avatar, Icon } from './ui.js';
import { rupees } from './format.js';

export interface ItemRow {
  key: string;
  name: string;
  amount: string;        // rupees string (form input)
  participants: number[]; // who shares this line
}

export function newItem(participants: number[]): ItemRow {
  return { key: crypto.randomUUID(), name: '', amount: '', participants };
}

export const itemPaise = (it: ItemRow): number => Math.round(parseFloat(it.amount || '0') * 100);

async function fileToBase64(file: File): Promise<{ b64: string; mime: string }> {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return { b64: btoa(binary), mime: file.type || 'image/jpeg' };
}

interface Props {
  members: number[];
  items: ItemRow[];
  onChange: (items: ItemRow[]) => void;
  // Called after a scan/paste so the parent can set the grand total + category.
  onScanned?: (totalPaise: number | null, category: string) => void;
}

/** Receipt itemization: scan a photo or paste bill text (AI-assisted, with a
    manual fallback), then tag each line with the people who shared it. The
    parent expense total stays the source of truth; anything the items don't
    cover (tax/tip) is split among everyone automatically by the server. */
export function ItemizeEditor({ members, items, onChange, onScanned }: Props) {
  const { me, name } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const who = (uid: number) => (uid === me?.id ? 'You' : name(uid));

  function applyDraft(draft: { items: { name: string; amount_paise: number }[]; total_paise: number | null; category: string }) {
    const rows = draft.items.map((it) => ({
      key: crypto.randomUUID(),
      name: it.name,
      amount: (it.amount_paise / 100).toString(),
      participants: [...members], // default: shared by everyone until the user narrows it
    }));
    onChange(rows.length ? rows : [newItem(members)]);
    onScanned?.(draft.total_paise, draft.category);
  }

  async function scan(file: File) {
    setBusy(true); setErr(null);
    try {
      const { b64, mime } = await fileToBase64(file);
      applyDraft(await apiClient.itemize({ image_base64: b64, mime }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not read that receipt — add items below');
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function extract() {
    if (!pasteText.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      applyDraft(await apiClient.itemize({ text: pasteText }));
      setShowPaste(false); setPasteText('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not read that — add items below');
    } finally { setBusy(false); }
  }

  const patch = (key: string, up: Partial<ItemRow>) =>
    onChange(items.map((it) => (it.key === key ? { ...it, ...up } : it)));
  const remove = (key: string) => onChange(items.filter((it) => it.key !== key));
  const toggle = (it: ItemRow, uid: number) =>
    patch(it.key, { participants: it.participants.includes(uid) ? it.participants.filter((x) => x !== uid) : [...it.participants, uid] });

  return (
    <div className="mt-2">
      {/* AI entry points */}
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex-1 h-11 rounded-button bg-primary/10 text-primary font-body text-[14px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
        >
          <Icon name="photo_camera" fill style={{ fontSize: 18 }} />{busy ? 'Reading…' : 'Scan receipt'}
        </button>
        <button
          onClick={() => setShowPaste((v) => !v)}
          className="flex-1 h-11 rounded-button bg-neutral-100 text-ink font-body text-[14px] font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
        >
          <Icon name="content_paste" style={{ fontSize: 18 }} />Paste bill
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
             onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />

      {showPaste && (
        <div className="mt-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={4}
            placeholder={'Paneer tikka 250\n2 x Naan 120\nGST 40'}
            className="w-full bg-neutral-100 rounded-button p-3 font-body text-[14px] text-ink outline-none focus:outline-2 focus:outline-primary"
          />
          <button onClick={extract} disabled={busy} className="mt-1 h-9 px-4 rounded-full bg-primary text-on-primary font-body text-[13px] font-semibold disabled:opacity-60">
            {busy ? '…' : 'Extract items'}
          </button>
        </div>
      )}

      {err && <p className="text-danger font-caption text-caption mt-2">{err}</p>}

      {/* item rows */}
      <div className="flex flex-col gap-2 mt-3">
        {items.map((it) => (
          <div key={it.key} className="bg-surface-container-lowest rounded-card shadow-soft p-3">
            <div className="flex items-center gap-2">
              <input
                value={it.name}
                onChange={(e) => patch(it.key, { name: e.target.value })}
                placeholder="Item"
                className="flex-1 min-w-0 bg-transparent outline-none font-body text-[15px] text-ink placeholder:text-neutral-600"
              />
              <span className="font-currency text-[14px] text-neutral-600">₹</span>
              <input
                value={it.amount}
                onChange={(e) => patch(it.key, { amount: e.target.value.replace(/[^0-9.]/g, '') })}
                inputMode="decimal"
                placeholder="0"
                className="w-16 bg-neutral-100 rounded-md px-2 py-1 font-currency text-[14px] text-ink text-right outline-none focus:outline-2 focus:outline-primary"
              />
              <button onClick={() => remove(it.key)} aria-label="Remove item" className="text-neutral-600 active:scale-90 transition-transform">
                <Icon name="close" style={{ fontSize: 18 }} />
              </button>
            </div>
            {/* who shared this line */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {members.map((uid) => {
                const on = it.participants.includes(uid);
                return (
                  <button
                    key={uid}
                    onClick={() => toggle(it, uid)}
                    className={`flex items-center gap-1 rounded-full pl-0.5 pr-2 h-7 border transition-colors ${on ? 'border-primary bg-primary/10' : 'border-neutral-300 opacity-60'}`}
                  >
                    <Avatar name={name(uid)} size={20} me={uid === me?.id} />
                    <span className="font-caption text-[11px] text-ink">{who(uid).split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => onChange([...items, newItem(members)])}
        className="mt-2 h-10 w-full rounded-button border border-dashed border-neutral-300 text-primary font-body text-[14px] font-semibold flex items-center justify-center gap-1 active:scale-95 transition-transform"
      >
        <Icon name="add" style={{ fontSize: 18 }} />Add item
      </button>
    </div>
  );
}

/** Validate itemized lines against the grand total. Returns an error string or null. */
export function validateItems(items: ItemRow[], totalPaise: number): string | null {
  const rows = items.filter((it) => it.name.trim() || itemPaise(it) > 0);
  if (rows.length === 0) return 'Add at least one item';
  for (const it of rows) {
    if (!(itemPaise(it) >= 0)) return 'Item amounts must be ≥ 0';
    if (it.participants.length === 0) return `Pick who shared "${it.name || 'item'}"`;
  }
  const sum = rows.reduce((s, it) => s + itemPaise(it), 0);
  if (sum > totalPaise) return `Items add up to ${rupees(sum)} — more than the total`;
  return null;
}
