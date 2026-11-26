import React, { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { store, useStore } from '../../services/store';
import { useT } from '../../i18n';
import { textQrSvg } from '../../utils/billQr';
import { UPI_ID_RE, UpiAccount, deleteUpiAccount, refreshUpiAccounts, saveUpiAccount, upiPayLink, useUpiAccounts } from '../../api/upi';

// Settings -> UPI: the shop's UPI IDs, as many as needed. On the billing
// counter the cashier picks one and the app draws a QR with the bill amount
// filled in. The small QR here has no amount: scan it once to check the UPI
// app shows the right account name.
export const UpiSettings: React.FC = () => {
  const t = useT();
  const { settings } = useStore();
  const accounts = useUpiAccounts();
  const [editing, setEditing] = useState<UpiAccount | 'new' | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    void refreshUpiAccounts();
  }, []);

  const remove = async (a: UpiAccount) => {
    if (armedDelete !== a.id) {
      setArmedDelete(a.id);
      return;
    }
    setDeleting(a.id);
    try {
      await deleteUpiAccount(a);
      store.addToast(t('UPI ID removed'), a.upiId, 'success');
    } catch (err) {
      store.addToast(t('UPI ID not removed'), err instanceof Error ? err.message : undefined, 'error');
    } finally {
      setDeleting(null);
      setArmedDelete(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <p className="text-base text-os-muted max-w-xl">
          {t('Add every UPI ID the shop takes payments on. At the counter, pick one and the customer scans a QR with the bill amount filled in.')}
        </p>
        <Button type="button" variant="primary" icon={<Plus size={18} />} onClick={() => setEditing('new')} className="shrink-0">
          {t('Add UPI ID')}
        </Button>
      </div>

      {accounts === null ? (
        <div className="p-6 bg-os-panel text-base text-os-muted">{t('Loading UPI IDs…')}</div>
      ) : accounts.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="w-full p-10 ring-1 ring-inset ring-os-line hover:ring-os-accent flex flex-col items-center gap-2 text-center"
        >
          <Plus size={30} />
          <span className="text-lg font-semibold">{t('Add your first UPI ID')}</span>
          <span className="text-base text-os-muted">{t('Like originstreets@okaxis, with a name such as "SBI current".')}</span>
        </button>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {accounts.map((a) => (
            <div key={a.id} className="card flex">
              <div
                className="w-28 sm:w-32 shrink-0 bg-white p-2.5 border-r border-os-line [&>svg]:w-full [&>svg]:h-auto"
                dangerouslySetInnerHTML={{ __html: textQrSvg(upiPayLink(a.upiId, settings.storeName), 160) }}
              />
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="p-4 flex-1 min-w-0 space-y-0.5">
                  <div className="text-lg font-semibold truncate">{a.name || a.upiId}</div>
                  {a.name && <div className="text-base truncate">{a.upiId}</div>}
                  {a.description && <div className="text-sm text-os-muted">{a.description}</div>}
                </div>
                <div className="grid grid-cols-2 border-t border-os-line">
                  <button
                    type="button"
                    onClick={() => setEditing(a)}
                    className="h-11 flex items-center justify-center gap-2 text-base font-semibold hover:bg-os-soft"
                  >
                    <Pencil size={16} /> {t('Edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(a)}
                    onBlur={() => armedDelete === a.id && setArmedDelete(null)}
                    disabled={deleting === a.id}
                    className={`h-11 flex items-center justify-center gap-2 text-base font-semibold border-l border-os-line disabled:opacity-40 ${
                      armedDelete === a.id ? 'bg-status-red text-white' : 'hover:bg-os-soft'
                    }`}
                  >
                    <Trash2 size={16} /> {armedDelete === a.id ? t('Tap again to remove') : t('Remove')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <UpiForm account={editing === 'new' ? null : editing} nextOrder={accounts?.length ?? 0} onClose={() => setEditing(null)} />}
    </div>
  );
};

const UpiForm: React.FC<{ account: UpiAccount | null; nextOrder: number; onClose: () => void }> = ({ account, nextOrder, onClose }) => {
  const t = useT();
  const [upiId, setUpiId] = useState(account?.upiId || '');
  const [name, setName] = useState(account?.name || '');
  const [description, setDescription] = useState(account?.description || '');
  const [saving, setSaving] = useState(false);

  const idOk = UPI_ID_RE.test(upiId.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idOk) {
      store.addToast(t('Check the details'), t('The UPI ID looks like name@bank.'), 'error');
      return;
    }
    setSaving(true);
    try {
      await saveUpiAccount({ id: account?.id, upiId, name, description, sortOrder: account ? undefined : nextOrder });
      store.addToast(t('UPI ID saved'), upiId.trim(), 'success');
      onClose();
    } catch (err) {
      store.addToast(t('UPI ID not saved'), err instanceof Error ? err.message : undefined, 'error');
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={saving ? () => undefined : onClose} title={account ? t('Edit UPI ID') : t('Add UPI ID')} maxWidth="lg">
      <form onSubmit={submit} className="space-y-4">
        <Input
          label={`${t('UPI ID')} *`}
          value={upiId}
          onChange={(e) => setUpiId(e.target.value.replace(/\s/g, ''))}
          maxLength={120}
          placeholder="originstreets@okaxis"
          error={upiId && !idOk ? t('The UPI ID looks like name@bank.') : undefined}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
        />
        <Input
          label={t('Name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={t('SBI current')}
          helperText={t('What the cashier sees when picking. Optional.')}
        />
        <Input
          label={t('Description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          placeholder={t('Shop account, for bills over ₹5,000')}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary" icon={<Save size={18} />} disabled={saving || !idOk}>
            {saving ? t('Saving…') : t('Save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
