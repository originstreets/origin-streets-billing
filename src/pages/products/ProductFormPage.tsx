import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore, store } from '../../services/store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Check, Plus, Save, Shirt, X } from 'lucide-react';
import { PhotoPicker } from '../../components/common/PhotoPicker';
import { useT } from '../../i18n';
import { formatINR } from '../../utils/formatters';

// Add product, in the order the shop thinks about it:
//   1. name, photo, category, price
//   2. which of the category's sizes this product comes in
//   3. its colours
//   4. how many pieces of each colour x size are in the shop
// Every colour x size starts at the product's price; "Different price"
// lets one of them cost more or less. Opening stock goes into the stock
// history as new stock.

const cellKey = (color: string, size: string) => `${color.toLowerCase()}|${size.toLowerCase()}`;

export const ProductFormPage: React.FC = () => {
  const { categories, products } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const t = useT();

  const [name, setName] = useState('');
  const [pickedCategoryId, setPickedCategoryId] = useState(params.get('category') || '');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [sizes, setSizes] = useState<string[]>([]);
  const [colours, setColours] = useState<string[]>([]);
  const [colourText, setColourText] = useState('');
  const [stock, setStock] = useState<Record<string, string>>({});
  const [customPrices, setCustomPrices] = useState(false);
  const [cellPrice, setCellPrice] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // One category only -> it is the obvious choice.
  const categoryId = pickedCategoryId || (categories.length === 1 ? categories[0].id : '');
  const category = categories.find((c) => c.id === categoryId);
  // Another category has other sizes: start with none picked.
  const chooseCategory = (id: string) => {
    setPickedCategoryId(id);
    setSizes([]);
  };

  const choosePhoto = (file: File | null) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : '');
  };

  // Sizes always in the category's order, whatever order they were ticked.
  const orderedSizes = useMemo(
    () => (category ? category.sizes.map((z) => z.size).filter((z) => sizes.includes(z)) : []),
    [category, sizes]
  );
  // No colour typed -> one row per size, without a colour name.
  const rows = colours.length > 0 ? colours : [''];
  const priceNumber = Number(price);
  const priceOk = price.trim() !== '' && Number.isFinite(priceNumber) && priceNumber >= 0;

  const toggleSize = (z: string) => setSizes((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]));

  const addColours = (e?: React.FormEvent) => {
    e?.preventDefault();
    const typed = colourText
      .split(',')
      .map((c) => c.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    if (typed.length === 0) return;
    setColours((prev) => {
      const seen = new Set(prev.map((c) => c.toLowerCase()));
      const next = [...prev];
      typed.forEach((c) => {
        if (!seen.has(c.toLowerCase())) {
          seen.add(c.toLowerCase());
          next.push(c);
        }
      });
      return next;
    });
    setColourText('');
  };

  const totalPieces = rows.reduce(
    (sum, c) => sum + orderedSizes.reduce((s, z) => s + (parseInt(stock[cellKey(c, z)] || '0', 10) || 0), 0),
    0
  );

  const handleSave = async () => {
    const problems: string[] = [];
    if (!name.trim()) problems.push(t('Type the product name.'));
    if (!category) problems.push(t('Choose a category.'));
    if (!priceOk) problems.push(t('Type the price (0 or more).'));
    if (orderedSizes.length === 0) problems.push(t('Tick at least one size.'));
    const sameName = products.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (sameName) problems.push(t('A product with this name is already there.'));

    const variants = rows.flatMap((c) =>
      orderedSizes.map((z) => {
        const key = cellKey(c, z);
        const pieces = stock[key]?.trim() ? Number(stock[key]) : 0;
        const ownPrice = customPrices && cellPrice[key]?.trim() ? Number(cellPrice[key]) : priceNumber;
        return { color: c || null, size: z, stock: pieces, price: ownPrice };
      })
    );
    if (variants.some((v) => !Number.isInteger(v.stock) || v.stock < 0)) problems.push(t('Stock must be whole numbers, 0 or more.'));
    if (variants.some((v) => !Number.isFinite(v.price) || v.price < 0)) problems.push(t('Every price must be 0 or more.'));

    if (problems.length > 0) {
      store.addToast(t('Check the details'), problems.join(' '), 'error');
      return;
    }

    setSaving(true);
    try {
      const imageUrl = photo ? await store.uploadProductPhoto(photo) : null;
      const id = await store.createProduct({
        name: name.trim(),
        categoryId: category!.id,
        price: priceNumber,
        imageUrl,
        description: description.trim() || null,
        variants,
      });
      navigate(`/products/${id}`, { replace: true });
    } catch (err) {
      store.addToast(t('Product not added'), err instanceof Error ? err.message : undefined, 'error');
    } finally {
      setSaving(false);
    }
  };

  const step = (n: number, title: string, text?: string) => (
    <div className="px-5 py-4 border-b border-os-line flex items-start gap-3">
      <span className="h-8 w-8 rounded-full bg-os-accent text-white text-base font-semibold flex items-center justify-center shrink-0">{n}</span>
      <div>
        <h2 className="font-display text-2xl leading-tight">{title}</h2>
        {text && <p className="text-base text-os-muted">{text}</p>}
      </div>
    </div>
  );

  if (categories.length === 0) {
    return (
      <div className="card p-8 text-center space-y-4 max-w-xl mx-auto">
        <Shirt size={32} className="mx-auto text-os-muted" />
        <h1 className="font-display text-3xl">{t('Add a category first')}</h1>
        <p className="text-base text-os-muted">{t('Every product belongs to a category (for example Shirts) with its list of sizes.')}</p>
        <Button variant="primary" onClick={() => navigate('/products/categories')}>
          {t('Categories & sizes')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="page-title">{t('Add product')}</h1>
        <p className="text-base text-os-muted mt-1">{t('Fill in the four steps, then save.')}</p>
      </div>

      {/* 1. Details */}
      <section className="card">
        {step(1, t('Name, photo and price'))}
        <div className="p-5 grid grid-cols-1 sm:grid-cols-[12rem_1fr] gap-6">
          <PhotoPicker preview={photoPreview} onPick={choosePhoto} onRemove={photo ? () => choosePhoto(null) : undefined} />
          <div className="space-y-4">
            <Input label={`${t('Product name')} *`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label={`${t('Category')} *`}
                value={categoryId}
                onChange={(e) => chooseCategory(e.target.value)}
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
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="product-description" className="label">
                {t('About the product (optional)')}
              </label>
              <textarea
                id="product-description"
                className="field min-h-[5rem]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Sizes */}
      <section className="card">
        {step(2, t('Sizes'), t('Tick the sizes this product comes in.'))}
        <div className="p-5 space-y-3">
          {!category ? (
            <p className="text-base text-os-muted">{t('Choose a category first.')}</p>
          ) : category.sizes.length === 0 ? (
            <div className="space-y-3">
              <p className="text-base text-status-amber font-bold">{t('{name} has no sizes yet.', { name: category.name })}</p>
              <Button variant="secondary" onClick={() => navigate('/products/categories')}>
                {t('Add sizes to {name}', { name: category.name })}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {category.sizes.map((z) => {
                  const on = sizes.includes(z.size);
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => toggleSize(z.size)}
                      aria-pressed={on}
                      className={`min-w-[3.5rem] h-12 px-4 rounded-full ring-1 ring-inset text-base font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        on ? 'bg-os-ink text-white ring-os-ink' : 'bg-os-paper ring-os-line hover:ring-os-ink'
                      }`}
                    >
                      {on && <Check size={16} />}
                      {z.size}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 text-sm font-bold">
                <button type="button" className="underline" onClick={() => setSizes(category.sizes.map((z) => z.size))}>
                  {t('Tick all')}
                </button>
                <button type="button" className="underline text-os-muted" onClick={() => setSizes([])}>
                  {t('Clear')}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 3. Colours */}
      <section className="card">
        {step(3, t('Colours'), t('Type each colour this product comes in. Leave it empty if it has only one colour.'))}
        <div className="p-5 space-y-3">
          <form onSubmit={addColours} className="flex gap-2">
            <input
              className="field h-11"
              value={colourText}
              onChange={(e) => setColourText(e.target.value)}
              placeholder={t('For example: Red, Blue')}
              aria-label={t('Colour')}
              maxLength={120}
            />
            <Button type="submit" variant="secondary" icon={<Plus size={18} />} disabled={!colourText.trim()} className="h-11 shrink-0">
              {t('Add')}
            </Button>
          </form>
          {colours.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {colours.map((c) => (
                <span key={c} className="h-11 pl-4 pr-1 rounded-full bg-os-ink text-white flex items-center gap-1 text-base font-semibold">
                  {c}
                  <button
                    type="button"
                    onClick={() => setColours((prev) => prev.filter((x) => x !== c))}
                    aria-label={t('Remove colour {c}', { c })}
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15"
                  >
                    <X size={16} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. Stock */}
      <section className="card">
        {step(4, t('Stock'), t('How many pieces of each colour and size are in the shop now.'))}
        <div className="p-5 space-y-4">
          {orderedSizes.length === 0 ? (
            <p className="text-base text-os-muted">{t('Tick the sizes in step 2 first.')}</p>
          ) : (
            <>
              <div className="overflow-x-auto bg-os-paper">
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
                        <td className="py-3 px-4 font-bold whitespace-nowrap">{c || t('One colour')}</td>
                        {orderedSizes.map((z) => {
                          const key = cellKey(c, z);
                          return (
                            <td key={z} className="py-2 px-2 align-top">
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
                              {customPrices && (
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  className="field h-9 w-20 text-center text-sm mx-auto block mt-1.5"
                                  value={cellPrice[key] ?? ''}
                                  placeholder={priceOk ? String(priceNumber) : '₹'}
                                  onChange={(e) => setCellPrice((prev) => ({ ...prev, [key]: e.target.value }))}
                                  aria-label={t('Price of {c} {z}', { c: c || t('One colour'), z })}
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
              <label className="flex items-center gap-3 text-base cursor-pointer">
                <input type="checkbox" checked={customPrices} onChange={(e) => setCustomPrices(e.target.checked)} className="w-5 h-5 accent-os-ink" />
                {t('Different price for some colours or sizes')}
              </label>
              {customPrices && (
                <p className="text-sm text-os-muted">
                  {t('The small box under each count is its price. Left empty, it sells at {price}.', {
                    price: priceOk ? formatINR(priceNumber) : t('the product price'),
                  })}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-5 py-3 bg-os-paper border-t-2 border-os-ink flex flex-wrap items-center justify-between gap-3">
        <div className="text-base">
          <b>{rows.length * orderedSizes.length}</b> {t('colour and size rows')} · <b>{totalPieces}</b> {t('pieces')}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/products')} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button variant="accent" icon={<Save size={18} />} onClick={handleSave} disabled={saving}>
            {saving ? t('Saving…') : t('Save product')}
          </Button>
        </div>
      </div>
    </div>
  );
};
