import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore, store, StoreCategory } from '../../services/store';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, Shirt, Layers } from 'lucide-react';
import { useT } from '../../i18n';
import { formatINR } from '../../utils/formatters';
import { Product } from '../../types';

// Categories and the standard sizes of each (Shirts: 38, 40, 42, 44), on one
// screen: the list of categories on the left, the one picked on the right
// with its sizes and its products. A new product picks its sizes from here,
// so every shirt uses the same size names in the same order.

// "S, M, L XL" -> ['S', 'M', 'L', 'XL']: several sizes can be typed at once.
const splitSizes = (text: string) =>
  Array.from(
    new Set(
      text
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );

// One tap adds a whole common set (only the sizes not there yet).
const SIZE_SETS: { label: string; sizes: string[] }[] = [
  { label: 'XS – XXL', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { label: '28 – 36', sizes: ['28', '30', '32', '34', '36'] },
  { label: '38 – 44', sizes: ['38', '40', '42', '44'] },
  { label: 'Free size', sizes: ['Free size'] },
];

const errText = (err: unknown) => (err instanceof Error ? err.message : undefined);

export const CategoriesPage: React.FC = () => {
  const { categories, products } = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const t = useT();
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const countFor = (id: string) => products.filter((p) => p.categoryId === id).length;
  const selected = categories.find((c) => c.id === params.get('c')) || categories[0];
  const select = (id: string) => setParams({ c: id }, { replace: true });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const id = await store.createCategory(newName);
      setNewName('');
      select(id);
    } catch (err) {
      store.addToast(t('Category not added'), errText(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{t('Categories & sizes')}</h1>
          <p className="text-lg text-os-muted mt-3">{t('Add a category, then the sizes it comes in. A new product picks its sizes from this list.')}</p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={18} />}
          onClick={() => navigate(selected ? `/products/new?category=${selected.id}` : '/products/new')}
          disabled={categories.length === 0}
        >
          {t('Add product')}
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)] gap-6 items-start">
        {/* ---------------- the list ---------------- */}
        <section className="card p-3 lg:sticky lg:top-6" aria-label={t('Categories')}>
          <form onSubmit={handleAdd} className="flex gap-2 p-1 pb-3">
            <input
              className="field h-11"
              placeholder={t('New category')}
              aria-label={t('New category')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              aria-label={t('Add category')}
              title={t('Add category')}
              className="h-11 w-11 shrink-0 rounded-full bg-os-ink text-white flex items-center justify-center hover:bg-os-ink/80 disabled:opacity-30"
            >
              <Plus size={20} />
            </button>
          </form>
          {categories.length === 0 ? (
            <p className="px-3 py-6 text-base text-os-muted">{t('No categories yet. Add the first one above, for example Shirts.')}</p>
          ) : (
            <nav className="space-y-1" aria-label={t('Categories')}>
              {categories.map((c) => {
                const on = c.id === selected?.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => select(c.id)}
                    aria-current={on ? 'true' : undefined}
                    className={`w-full h-14 px-4 rounded-full flex items-center justify-between gap-3 text-left transition-colors ${
                      on ? 'bg-os-ink text-white' : 'hover:bg-os-soft'
                    }`}
                  >
                    <span className="text-base font-semibold truncate">{c.name}</span>
                    <span className={`text-sm whitespace-nowrap ${on ? 'text-white/70' : 'text-os-muted'}`}>
                      {t('{s} sizes · {p} products', { s: c.sizes.length, p: countFor(c.id) })}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
        </section>

        {/* ---------------- the category picked ---------------- */}
        {selected ? (
          <CategoryDetail key={selected.id} category={selected} products={products.filter((p) => p.categoryId === selected.id)} />
        ) : (
          <section className="card p-10 text-center space-y-3">
            <Layers size={32} className="mx-auto text-os-muted" />
            <p className="text-base text-os-muted">{t('Add a category on the left to start.')}</p>
          </section>
        )}
      </div>
    </div>
  );
};

const CategoryDetail: React.FC<{ category: StoreCategory; products: Product[] }> = ({ category, products }) => {
  const t = useT();
  const navigate = useNavigate();
  const [sizeText, setSizeText] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickedSize, setPickedSize] = useState<string | null>(null);

  const have = useMemo(() => new Set(category.sizes.map((z) => z.size.toLowerCase())), [category.sizes]);
  const picked = category.sizes.find((z) => z.id === pickedSize);
  const pickedIndex = picked ? category.sizes.indexOf(picked) : -1;

  const run = async (title: string, job: () => Promise<void>) => {
    setBusy(true);
    try {
      await job();
      return true;
    } catch (err) {
      store.addToast(title, errText(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  // One at a time, so they keep the order they were typed in.
  const addSizes = async (sizes: string[]) => {
    const fresh = sizes.filter((z) => !have.has(z.toLowerCase()));
    if (fresh.length === 0) return true;
    return run(t('Size not added'), async () => {
      for (const z of fresh) await store.addCategorySize(category.id, z);
    });
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === category.name) {
      setRenaming(false);
      return;
    }
    if (await run(t('Category not saved'), () => store.renameCategory(category.id, name))) setRenaming(false);
  };

  return (
    <section className="space-y-6 min-w-0">
      {/* Name */}
      <div className="card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {renaming ? (
          <form onSubmit={handleRename} className="flex-1 flex flex-wrap gap-2">
            <input
              className="field h-12 flex-1 min-w-[12rem]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={60}
              aria-label={t('Category name')}
            />
            <Button type="submit" variant="primary" disabled={busy}>
              {t('Save')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
              {t('Cancel')}
            </Button>
          </form>
        ) : (
          <div className="min-w-0">
            <h2 className="font-display text-[2.25rem] sm:text-[2.75rem] leading-none break-words">{category.name}</h2>
            <p className="text-base text-os-muted mt-2">
              {t('{p} products', { p: products.length })} · {t('{s} sizes', { s: category.sizes.length })}
            </p>
          </div>
        )}
        {!renaming && (
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" icon={<Pencil size={15} />} onClick={() => setRenaming(true)}>
              {t('Rename')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={15} />}
              onClick={() => setConfirmDelete(true)}
              disabled={products.length > 0}
              title={products.length > 0 ? t('This category still has products. Move or delete them first.') : undefined}
            >
              {t('Delete')}
            </Button>
          </div>
        )}
      </div>

      {/* Sizes */}
      <div className="card p-5 sm:p-6 space-y-5">
        <div>
          <h3 className="font-display text-[1.75rem] leading-none">{t('Sizes, in order')}</h3>
          <p className="text-base text-os-muted mt-2">{t('Tap a size to move it or remove it.')}</p>
        </div>

        {category.sizes.length === 0 ? (
          <p className="text-base text-status-amber font-semibold">{t('No sizes yet. Add the sizes this category comes in.')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {category.sizes.map((z) => {
              const on = z.id === pickedSize;
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setPickedSize(on ? null : z.id)}
                  aria-pressed={on}
                  className={`min-w-[3.5rem] h-12 px-5 rounded-full text-base font-semibold transition-colors ${
                    on ? 'bg-os-ink text-white' : 'bg-os-paper ring-1 ring-inset ring-os-line hover:ring-os-ink'
                  }`}
                >
                  {z.size}
                </button>
              );
            })}
          </div>
        )}

        {picked && (
          <div className="flex flex-wrap items-center gap-2 p-2 pl-4 bg-os-paper">
            <span className="text-sm text-os-muted mr-auto">
              {t('Size')} <b className="text-os-ink">{picked.size}</b>
            </span>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronLeft size={16} />}
              disabled={busy || pickedIndex === 0}
              onClick={() => void run(t('Not saved'), () => store.moveCategorySize(category.id, picked.id, -1))}
            >
              {t('Move left')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronRight size={16} />}
              iconPosition="right"
              disabled={busy || pickedIndex === category.sizes.length - 1}
              onClick={() => void run(t('Not saved'), () => store.moveCategorySize(category.id, picked.id, 1))}
            >
              {t('Move right')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={15} />}
              disabled={busy}
              onClick={async () => {
                if (await run(t('Size not removed'), () => store.deleteCategorySize(picked.id))) setPickedSize(null);
              }}
            >
              {t('Remove')}
            </Button>
          </div>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await addSizes(splitSizes(sizeText))) setSizeText('');
          }}
          className="flex gap-2"
        >
          <input
            className="field h-12"
            value={sizeText}
            onChange={(e) => setSizeText(e.target.value)}
            placeholder={t('Add sizes, e.g. S, M, L, XL')}
            aria-label={t('Add sizes')}
            maxLength={120}
          />
          <Button type="submit" variant="primary" icon={<Plus size={18} />} disabled={busy || !sizeText.trim()} className="h-12 shrink-0">
            {t('Add')}
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-os-muted mr-1">{t('Quick add')}:</span>
          {SIZE_SETS.map((set) => {
            const missing = set.sizes.filter((z) => !have.has(z.toLowerCase()));
            return (
              <button
                key={set.label}
                type="button"
                disabled={busy || missing.length === 0}
                onClick={() => void addSizes(set.sizes)}
                className="chip disabled:opacity-35 disabled:hover:ring-os-line"
                title={set.sizes.join(', ')}
              >
                <Plus size={14} /> {set.label === 'Free size' ? t('Free size') : set.label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-os-muted">{t('Removing a size here does not change products that already have it.')}</p>
      </div>

      {/* Products */}
      <div className="card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-display text-[1.75rem] leading-none">{t('Products in {name}', { name: category.name })}</h3>
          <Button variant="secondary" size="sm" icon={<Plus size={16} />} onClick={() => navigate(`/products/new?category=${category.id}`)}>
            {t('Add product')}
          </Button>
        </div>
        {products.length === 0 ? (
          <p className="text-base text-os-muted">{t('No products in this category yet.')}</p>
        ) : (
          <div className="bg-os-paper divide-y divide-os-line">
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/products/${p.id}`)}
                className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-os-soft transition-colors"
              >
                {p.image ? (
                  <img src={p.image} alt="" className="w-12 h-14 object-cover shrink-0" loading="lazy" />
                ) : (
                  <span className="w-12 h-14 bg-os-soft flex items-center justify-center text-os-muted shrink-0">
                    <Shirt size={20} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold truncate">{p.name}</span>
                  <span className="block text-sm text-os-muted truncate">
                    {p.sizes.join(' · ') || t('no sizes yet')}
                    {p.colors.length > 0 && ` — ${t('{n} colours', { n: p.colors.length })}`}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block font-display text-xl leading-none">{formatINR(p.price)}</span>
                  <span className="block text-sm text-os-muted mt-1">{t('{n} pieces', { n: p.totalStock })}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('Delete category?')}
        subtitle={category.name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (await run(t('Category not deleted'), () => store.deleteCategory(category.id))) setConfirmDelete(false);
              }}
            >
              {t('Delete')}
            </Button>
          </>
        }
      >
        <p className="text-base">{t('The category and its size list will be removed.')}</p>
      </Modal>
    </section>
  );
};
