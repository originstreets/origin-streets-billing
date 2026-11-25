import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore, store } from '../../services/store';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { formatINR } from '../../utils/formatters';
import { ArrowLeft, Shirt, Tag, Plus, Minus, PlusCircle, Pencil, Trash2, Layers } from 'lucide-react';
import { useT } from '../../i18n';
import { AddVariantsModal, DeleteProductModal, EditDetailsModal, VariantPriceModal } from './ProductEditModals';
import { variantStockStatus } from '../../utils/stock';
import { ONE_SIZE } from '../../utils/singleItem';

type AdjustReason = 'RESTOCK' | 'ADJUSTMENT' | 'DAMAGED';

const REASON_WORDS: Record<string, string> = {
  SALE: 'Sold in shop',
  RESTOCK: 'New stock',
  ADJUSTMENT: 'Correction',
  RETURN_RESTOCK: 'Returned',
  DAMAGED: 'Damaged',
  VOID: 'Bill cancelled',
  EDIT: 'Bill changed',
};

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { products, inventoryLogs, settings, currentStaff } = useStore();
  const t = useT();
  const canBill = !currentStaff || currentStaff.permissions.includes('BILLING');
  const canTags = !currentStaff || currentStaff.permissions.includes('TAGS');

  const product = products.find((p) => p.id === id || p.sku.toLowerCase() === id?.toLowerCase());

  const [adjustingVariantId, setAdjustingVariantId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustReason, setAdjustReason] = useState<AdjustReason>('RESTOCK');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'DETAILS' | 'ADD_VARIANTS' | 'DELETE' | null>(null);
  const [priceVariantId, setPriceVariantId] = useState<string | null>(null);

  if (!product) {
    return (
      <div className="py-16 text-center space-y-4">
        <div className="w-14 h-14 bg-os-paper border border-os-line flex items-center justify-center mx-auto text-os-muted">
          <Shirt size={26} />
        </div>
        <h2 className="font-display text-3xl">{t('Product not found')}</h2>
        <Button variant="secondary" icon={<ArrowLeft size={18} />} onClick={() => navigate('/products')}>
          {t('Back to products')}
        </Button>
      </div>
    );
  }

  const activeVariant = product.variants.find((v) => v.id === adjustingVariantId);
  const priceVariant = product.variants.find((v) => v.id === priceVariantId);
  const codeByVariant = new Map(product.variants.map((v) => [v.id, v.sku]));
  const productLogs = inventoryLogs.filter((l) => l.productId === product.id);
  const sizeText = (size: string) => (size === ONE_SIZE ? t('One size') : size);

  const runAdjust = async (variantId: string, change: number, reason: AdjustReason) => {
    setBusy(true);
    try {
      await store.adjustStock(product.id, variantId, change, reason);
    } catch (err) {
      store.addToast(t('Stock not changed'), err instanceof Error ? err.message : undefined, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingVariantId) return;
    const qty = Math.abs(Number(adjustQty) || 0);
    if (qty === 0) return;
    await runAdjust(adjustingVariantId, adjustReason === 'DAMAGED' ? -qty : qty, adjustReason);
    setAdjustingVariantId(null);
    setAdjustQty('1');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {canTags && (
            <Button variant="secondary" icon={<Tag size={18} />} onClick={() => navigate(`/tags?productId=${product.id}`)}>
              {t('Print price tags')}
            </Button>
          )}
          {canBill && (
            <Button variant="secondary" icon={<PlusCircle size={18} />} onClick={() => navigate('/billing/new')}>
              {t('New bill')}
            </Button>
          )}
          <Button variant="secondary" icon={<Layers size={18} />} onClick={() => setDialog('ADD_VARIANTS')}>
            {t('Add colours or sizes')}
          </Button>
          <Button variant="primary" icon={<Pencil size={18} />} onClick={() => setDialog('DETAILS')}>
            {t('Edit details')}
          </Button>
        </div>
      </div>

      <div className="card p-5 flex flex-col sm:flex-row gap-5">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full sm:w-40 aspect-[4/5] object-cover border border-os-line" />
        ) : (
          <div className="w-full sm:w-40 aspect-[4/5] bg-os-soft border border-os-line flex items-center justify-center text-os-muted">
            <Shirt size={40} />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            {product.status === 'ARCHIVED' && <StatusBadge status="ARCHIVED" />}
          </div>
          <h1 className="page-title">{product.name}</h1>
          <div className="text-base text-os-muted">{product.category}</div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black">{formatINR(product.price)}</span>
            {product.compareAtPrice && (
              <span className="text-base text-os-muted line-through">{formatINR(product.compareAtPrice)}</span>
            )}
          </div>
          <div className="text-lg">
            <b>{product.totalStock}</b> {t('pieces in stock')}
          </div>
          {product.description && <p className="text-base text-os-muted max-w-2xl">{product.description}</p>}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-os-line">
          <h2 className="font-display text-2xl">{t('Stock by colour and size')}</h2>
          <p className="text-base text-os-muted">{t('Use + and − to change stock by one piece.')}</p>
        </div>

        {product.variants.length === 0 ? (
          <div className="p-6 text-base text-status-red font-bold">
            {t('This product has no colours or sizes yet. Add them with "Add colours or sizes" before billing it.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base border-collapse">
              <thead>
                <tr>
                  <th className="table-head py-3 px-5">{t('Colour')}</th>
                  <th className="table-head py-3 px-4">{t('Size')}</th>
                  <th className="table-head py-3 px-4">{t('Code')}</th>
                  <th className="table-head py-3 px-4 text-right">{t('Price')}</th>
                  <th className="table-head py-3 px-4 text-center">{t('In stock')}</th>
                  <th className="table-head py-3 px-5 text-right">{t('Change stock')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-os-line">
                {product.variants.map((v) => (
                  <tr key={v.id}>
                    <td className="py-3 px-5 font-bold">{v.color || '—'}</td>
                    <td className="py-3 px-4 font-bold">{sizeText(v.size)}</td>
                    <td className="py-3 px-4 text-os-muted">{v.sku}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setPriceVariantId(v.id)}
                        className="font-bold underline decoration-os-line underline-offset-4 hover:decoration-os-ink"
                        title={t('Change price')}
                      >
                        {formatINR(v.price)}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="text-xl font-black">{v.stock}</div>
                      <StatusBadge status={variantStockStatus(v, settings.lowStockThreshold)} showDot={false} />
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          aria-label={t('Remove one piece')}
                          disabled={v.stock <= 0 || busy}
                          onClick={() => void runAdjust(v.id, -1, 'ADJUSTMENT')}
                          className="w-11 h-11 rounded-full bg-os-paper ring-1 ring-inset ring-os-line hover:ring-os-ink disabled:opacity-30 flex items-center justify-center"
                        >
                          <Minus size={18} />
                        </button>
                        <button
                          aria-label={t('Add one piece')}
                          disabled={busy}
                          onClick={() => void runAdjust(v.id, 1, 'RESTOCK')}
                          className="w-11 h-11 rounded-full bg-os-paper ring-1 ring-inset ring-os-line hover:ring-os-ink disabled:opacity-30 flex items-center justify-center"
                        >
                          <Plus size={18} />
                        </button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-11"
                          onClick={() => {
                            setAdjustingVariantId(v.id);
                            setAdjustQty('1');
                            setAdjustReason('RESTOCK');
                          }}
                        >
                          {t('More…')}
                        </Button>
                        {v.stock === 0 && (
                          <button
                            aria-label={t('Remove this colour and size')}
                            title={t('Remove this colour and size')}
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                await store.deleteVariant(v.id);
                              } catch (err) {
                                store.addToast(t('Not removed'), err instanceof Error ? err.message : undefined, 'error');
                              } finally {
                                setBusy(false);
                              }
                            }}
                            className="w-11 h-11 rounded-full bg-status-redBg text-status-red hover:bg-status-red hover:text-white disabled:opacity-30 flex items-center justify-center"
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-os-line">
          <h2 className="font-display text-2xl">{t('Stock history')}</h2>
        </div>
        {productLogs.length === 0 ? (
          <div className="p-6 text-base text-os-muted">{t('No stock changes yet.')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-base border-collapse">
              <thead>
                <tr>
                  <th className="table-head py-3 px-5">{t('When')}</th>
                  <th className="table-head py-3 px-4">{t('Code')}</th>
                  <th className="table-head py-3 px-4">{t('What happened')}</th>
                  <th className="table-head py-3 px-4 text-right">{t('Change')}</th>
                  <th className="table-head py-3 px-5 text-right">{t('Stock after')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-os-line">
                {productLogs.slice(0, 10).map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 px-5 text-os-muted whitespace-nowrap">{log.date.substring(0, 16)}</td>
                    <td className="py-2.5 px-4">{codeByVariant.get(log.variantSku) || '—'}</td>
                    <td className="py-2.5 px-4">{t(REASON_WORDS[log.reason] || log.reason)}</td>
                    <td className={`py-2.5 px-4 text-right font-bold ${log.changeQty > 0 ? 'text-status-green' : 'text-status-red'}`}>
                      {log.changeQty > 0 ? `+${log.changeQty}` : log.changeQty}
                    </td>
                    <td className="py-2.5 px-5 text-right font-bold">{log.newStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="section-title">{t('Delete product')}</div>
          <p className="text-base text-os-muted">{t('Removes it from billing. Bills already made are not changed.')}</p>
        </div>
        <Button variant="danger" icon={<Trash2 size={18} />} onClick={() => setDialog('DELETE')}>
          {t('Delete product')}
        </Button>
      </div>

      {dialog === 'DETAILS' && <EditDetailsModal product={product} onClose={() => setDialog(null)} />}
      {dialog === 'ADD_VARIANTS' && <AddVariantsModal product={product} onClose={() => setDialog(null)} />}
      {dialog === 'DELETE' && <DeleteProductModal product={product} onClose={() => setDialog(null)} />}
      {priceVariant && (
        <VariantPriceModal
          product={product}
          variant={priceVariant}
          label={`${priceVariant.color ? `${priceVariant.color} / ` : ''}${sizeText(priceVariant.size)}`}
          onClose={() => setPriceVariantId(null)}
        />
      )}

      {activeVariant && (
        <Modal
          isOpen={!!adjustingVariantId}
          onClose={() => setAdjustingVariantId(null)}
          title={t('Change stock')}
          subtitle={`${product.name} · ${activeVariant.color ? `${activeVariant.color} / ` : ''}${sizeText(activeVariant.size)} · ${t('now {n} pieces', { n: activeVariant.stock })}`}
        >
          <form onSubmit={handleAdjustSubmit} className="space-y-4">
            <Select
              label={t('What happened?')}
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value as AdjustReason)}
              options={[
                { value: 'RESTOCK', label: t('New pieces came in (add)') },
                { value: 'ADJUSTMENT', label: t('Counted again, add the missing pieces (add)') },
                { value: 'DAMAGED', label: t('Damaged pieces (remove)') },
              ]}
            />
            <Input
              label={adjustReason === 'DAMAGED' ? t('How many to remove?') : t('How many to add?')}
              type="number"
              inputMode="numeric"
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              min="1"
              required
            />
            <div className="pt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => setAdjustingVariantId(null)}>
                {t('Cancel')}
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {t('Save')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
