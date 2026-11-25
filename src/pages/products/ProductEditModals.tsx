import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, X } from 'lucide-react';
import { PhotoPicker } from '../../components/common/PhotoPicker';
import { ColourDot, ColourPicker, PickedColour } from '../../components/common/ColourPicker';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { store, useStore } from '../../services/store';
import { Product, ProductVariant } from '../../types';
import { useT } from '../../i18n';
import { formatINR } from '../../utils/formatters';
import { ONE_SIZE } from '../../utils/singleItem';

// The changes a product can get after it is added: its details, more
// colours or sizes, the price of one colour x size, or deleting it.

const errText = (err: unknown) => (err instanceof Error ? err.message : undefined);

// ---------------------------------------------------------------- details

export const EditDetailsModal: React.FC<{ product: Product; onClose: () => void }> = ({ product, onClose }) => {
  const { categories } = useStore();
  const t = useT();
  const [name, setName] = useState(product.name);
  const [categoryId, setCategoryId] = useState(product.categoryId || '');
  const [price, setPrice] = useState(String(product.price));
  const [description, setDescription] = useState(product.description);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [preview, setPreview] = useState(product.image);
  const choosePhoto = (file: File | null) => {
    if (photo && preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : product.image);
    setRemovePhoto(false);
  };
  // When every colour x size sells at the product price, a new product
  // price is meant for all of them.
  const allAtProductPrice = product.variants.every((v) => v.price === product.price);
  const [applyToAll, setApplyToAll] = useState(allAtProductPrice);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNumber = Number(price);
    if (!name.trim() || !categoryId || price.trim() === '' || !Number.isFinite(priceNumber) || priceNumber < 0) {
      store.addToast(t('Check the details'), t('Name, category and a price of 0 or more are needed.'), 'error');
      return;
    }
    setSaving(true);
    try {
      const imageUrl = photo ? await store.uploadProductPhoto(photo) : removePhoto ? null : undefined;
      await store.updateProduct(
        product.id,
        {
          name: name.trim(),
          categoryId,
          price: priceNumber,
          imageUrl,
          description,
        },
        applyToAll && priceNumber !== product.price
      );
      onClose();
    } catch (err) {
      store.addToast(t('Product not saved'), errText(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Edit details')} subtitle={product.name} maxWidth="2xl">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] gap-5">
          <PhotoPicker
            preview={removePhoto ? '' : preview}
            onPick={choosePhoto}
            onRemove={
              (preview || photo) && !removePhoto
                ? () => {
                    setPhoto(null);
                    setRemovePhoto(true);
                  }
                : undefined
            }
          />
          <div className="space-y-4">
            <Input label={`${t('Product name')} *`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            <Select
              label={`${t('Category')} *`}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder={t('Choose…')}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Input
              label={`${t('Price (₹)')} *`}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <label className="flex items-start gap-3 text-base cursor-pointer">
              <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} className="w-5 h-5 mt-0.5 accent-os-ink" />
              <span>
                {t('Also use this price for every colour and size')}
                {!allAtProductPrice && <span className="block text-sm text-os-muted">{t('Some colours or sizes have their own price now.')}</span>}
              </span>
            </label>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-description" className="label">
            {t('About the product (optional)')}
          </label>
          <textarea
            id="edit-description"
            className="field min-h-[5rem]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? t('Saving…') : t('Save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------- more colours or sizes

const comboKey = (color: string, size: string) => `${color.toLowerCase()}|${size.toLowerCase()}`;

export const AddVariantsModal: React.FC<{ product: Product; onClose: () => void }> = ({ product, onClose }) => {
  const { categories } = useStore();
  const navigate = useNavigate();
  const t = useT();
  const category = categories.find((c) => c.id === product.categoryId);

  // Sizes to choose from: the category's list, plus any the product already
  // has that are no longer on that list.
  const sizeChoices = useMemo(() => {
    const list = (category?.sizes || []).map((z) => z.size);
    product.sizes.forEach((z) => {
      if (z !== ONE_SIZE && !list.some((x) => x.toLowerCase() === z.toLowerCase())) list.push(z);
    });
    return list;
  }, [category, product.sizes]);

  const existing = useMemo(() => new Set(product.variants.map((v) => comboKey(v.color, v.size))), [product.variants]);
  const productHasNoColour = product.variants.length > 0 && product.colors.length === 0;

  const [sizes, setSizes] = useState<string[]>(product.sizes);
  // Colours already on the product keep their swatch; new ones come from the wheel.
  const [colours, setColours] = useState<PickedColour[]>(() =>
    product.colors.map((name) => ({ name, hex: product.variants.find((v) => v.color === name)?.colorHex || '' }))
  );
  const [pickingColour, setPickingColour] = useState(false);
  const [stock, setStock] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const orderedSizes = sizeChoices.filter((z) => sizes.includes(z));
  const rows = colours.length > 0 ? colours.map((c) => c.name) : [''];
  const hexOf = (name: string) => colours.find((c) => c.name === name)?.hex || null;
  const newCombos = rows.flatMap((c) => orderedSizes.filter((z) => !existing.has(comboKey(c, z))).map((z) => ({ c, z })));

  const addColour = (c: PickedColour) => {
    setColours((prev) => (prev.some((x) => x.name.toLowerCase() === c.name.toLowerCase()) ? prev : [...prev, c]));
    setPickingColour(false);
  };

  const handleSave = async () => {
    const variants = newCombos.map(({ c, z }) => {
      const raw = stock[comboKey(c, z)]?.trim();
      return { color: c || null, color_hex: c ? hexOf(c) : null, size: z, stock: raw ? Number(raw) : 0, price: product.price };
    });
    if (variants.length === 0) {
      store.addToast(t('Nothing new to add'), t('Tick a new size or add a new colour.'), 'warning');
      return;
    }
    if (variants.some((v) => !Number.isInteger(v.stock) || v.stock < 0)) {
      store.addToast(t('Check the details'), t('Stock must be whole numbers, 0 or more.'), 'error');
      return;
    }
    setSaving(true);
    try {
      await store.addVariants(product.id, variants);
      onClose();
    } catch (err) {
      store.addToast(t('Not added'), errText(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Add colours or sizes')}
      subtitle={product.name}
      maxWidth="3xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || newCombos.length === 0}>
            {saving ? t('Saving…') : t('Add {n} rows', { n: newCombos.length })}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="label">{t('Sizes')}</div>
          {sizeChoices.length === 0 ? (
            <Button variant="secondary" onClick={() => navigate('/products/categories')}>
              {t('Add sizes to the category first')}
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sizeChoices.map((z) => {
                const on = sizes.includes(z);
                return (
                  <button
                    key={z}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSizes((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]))}
                    className={`min-w-[3.25rem] h-11 px-4 rounded-full ring-1 ring-inset text-base font-semibold flex items-center justify-center gap-1.5 ${
                      on ? 'bg-os-ink text-white ring-os-ink' : 'bg-os-paper ring-os-line hover:ring-os-ink'
                    }`}
                  >
                    {on && <Check size={15} />}
                    {z}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="label">{t('Colours')}</div>
          {productHasNoColour && <p className="text-sm text-os-muted">{t('This product has no colour names. New colours are added next to it.')}</p>}
          {colours.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {colours.map((c) => {
                const isOld = product.colors.includes(c.name);
                return (
                  <span
                    key={c.name}
                    className={`h-10 pl-2 rounded-full bg-os-paper ring-1 ring-inset ring-os-line flex items-center gap-2 text-base font-semibold ${isOld ? 'pr-4' : 'pr-1'}`}
                  >
                    <ColourDot hex={c.hex} size={24} />
                    {c.name}
                    {!isOld && (
                      <button
                        type="button"
                        onClick={() => setColours((prev) => prev.filter((x) => x.name !== c.name))}
                        aria-label={t('Remove colour {c}', { c: c.name })}
                        className="h-8 w-8 rounded-full flex items-center justify-center text-os-muted hover:text-status-red hover:bg-status-redBg"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          )}
          <Button type="button" variant="secondary" icon={<Plus size={18} />} onClick={() => setPickingColour(true)}>
            {t('Add colour')}
          </Button>
          {pickingColour && (
            <ColourPicker taken={colours.map((c) => c.name)} onSelect={addColour} onClose={() => setPickingColour(false)} />
          )}
        </div>

        {orderedSizes.length > 0 && (
          <div className="space-y-2">
            <div className="label">{t('Pieces for each new colour and size')}</div>
            <div className="overflow-x-auto bg-os-panel">
              <table className="w-full border-collapse text-base">
                <thead>
                  <tr>
                    <th className="table-head py-3 px-4">{t('Colour')}</th>
                    {orderedSizes.map((z) => (
                      <th key={z} className="table-head py-3 px-3 text-center">
                        {z}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-os-line">
                  {rows.map((c) => (
                    <tr key={c || '-'}>
                      <td className="py-3 px-4 font-semibold whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          <ColourDot hex={c ? hexOf(c) : undefined} />
                          {c || t('One colour')}
                        </span>
                      </td>
                      {orderedSizes.map((z) => {
                        const key = comboKey(c, z);
                        return (
                          <td key={z} className="py-2 px-2 text-center">
                            {existing.has(key) ? (
                              <span className="text-sm text-os-muted">{t('Already there')}</span>
                            ) : (
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                step={1}
                                className="field h-11 w-20 text-center mx-auto block"
                                value={stock[key] ?? ''}
                                placeholder="0"
                                onChange={(e) => setStock((prev) => ({ ...prev, [key]: e.target.value }))}
                                aria-label={t('Pieces of {c} {z}', { c: c || t('One colour'), z })}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-os-muted">{t('New rows sell at {price}. You can change a price after adding.', { price: formatINR(product.price) })}</p>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- one price

export const VariantPriceModal: React.FC<{ product: Product; variant: ProductVariant; label: string; onClose: () => void }> = ({
  product,
  variant,
  label,
  onClose,
}) => {
  const t = useT();
  const [price, setPrice] = useState(String(variant.price));
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(price);
    if (price.trim() === '' || !Number.isFinite(n) || n < 0) {
      store.addToast(t('Check the details'), t('Every price must be 0 or more.'), 'error');
      return;
    }
    setSaving(true);
    try {
      await store.updateVariantPrice(variant.id, n);
      onClose();
    } catch (err) {
      store.addToast(t('Price not saved'), errText(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('Change price')} subtitle={`${product.name} · ${label}`}>
      <form onSubmit={handleSave} className="space-y-4">
        <Input
          label={t('Price (₹)')}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          autoFocus
          helperText={t('Product price: {price}', { price: formatINR(product.price) })}
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {t('Save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------- delete

export const DeleteProductModal: React.FC<{ product: Product; onClose: () => void }> = ({ product, onClose }) => {
  const t = useT();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    setBusy(true);
    try {
      await store.deleteProduct(product.id);
      navigate('/products', { replace: true });
    } catch (err) {
      store.addToast(t('Product not deleted'), errText(err), 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Delete product?')}
      subtitle={product.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={busy}>
            {t('Delete')}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-base">
        <p>{t('The product, its colours and sizes and its {n} pieces in stock will be removed.', { n: product.totalStock })}</p>
        <p className="text-os-muted">{t('Bills already made keep the product name and price.')}</p>
      </div>
    </Modal>
  );
};
