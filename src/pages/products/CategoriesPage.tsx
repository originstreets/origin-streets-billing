import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, store, StoreCategory } from '../../services/store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X, Shirt } from 'lucide-react';
import { useT } from '../../i18n';

// Categories and the standard sizes of each (Shirts: S, M, L, XL). When a
// product is added, its sizes are picked from its category's list here, so
// every shirt uses the same size names in the same order.

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

export const CategoriesPage: React.FC = () => {
  const { categories, products } = useStore();
  const navigate = useNavigate();
  const t = useT();
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const fail = (title: string) => (err: unknown) => store.addToast(title, err instanceof Error ? err.message : undefined, 'error');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await store.createCategory(newName);
      setNewName('');
    } catch (err) {
      fail(t('Category not added'))(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">{t('Categories & sizes')}</h1>
          <p className="text-base text-os-muted mt-1">
            {t('Add a category, then the sizes it comes in. A new product picks its sizes from this list.')}
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => navigate('/products/new')} disabled={categories.length === 0}>
          {t('Add product')}
        </Button>
      </div>

      <form onSubmit={handleAdd} className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <Input
            label={t('New category')}
            placeholder={t('For example: Shirts')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={60}
          />
        </div>
        <Button type="submit" variant="primary" icon={<Plus size={18} />} disabled={busy || !newName.trim()} className="h-11">
          {t('Add category')}
        </Button>
      </form>

      {categories.length === 0 ? (
        <div className="card p-10 text-center text-base text-os-muted space-y-2">
          <Shirt size={32} className="mx-auto" />
          <p>{t('No categories yet. Add the first one above, for example Shirts.')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} productCount={products.filter((p) => p.categoryId === c.id).length} />
          ))}
        </div>
      )}
    </div>
  );
};

const CategoryCard: React.FC<{ category: StoreCategory; productCount: number }> = ({ category, productCount }) => {
  const t = useT();
  const [sizeText, setSizeText] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (title: string, job: () => Promise<void>) => {
    setBusy(true);
    try {
      await job();
      return true;
    } catch (err) {
      store.addToast(title, err instanceof Error ? err.message : undefined, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAddSizes = async (e: React.FormEvent) => {
    e.preventDefault();
    const existing = new Set(category.sizes.map((z) => z.size.toLowerCase()));
    const fresh = splitSizes(sizeText).filter((z) => !existing.has(z.toLowerCase()));
    if (fresh.length === 0) {
      setSizeText('');
      return;
    }
    const ok = await run(t('Size not added'), async () => {
      // One at a time, so they keep the order they were typed in.
      for (const z of fresh) await store.addCategorySize(category.id, z);
    });
    if (ok) setSizeText('');
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
    <div className="card flex flex-col">
      <div className="px-5 py-4 border-b border-os-line flex items-start justify-between gap-3">
        {renaming ? (
          <form onSubmit={handleRename} className="flex-1 flex gap-2">
            <input className="field h-11" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} aria-label={t('Category name')} />
            <Button type="submit" variant="primary" disabled={busy}>
              {t('Save')}
            </Button>
          </form>
        ) : (
          <div className="min-w-0">
            <h2 className="font-display text-2xl break-words">{category.name}</h2>
            <div className="text-sm text-os-muted">{t('{n} products', { n: productCount })}</div>
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
              disabled={productCount > 0}
              title={productCount > 0 ? t('This category still has products. Move or delete them first.') : undefined}
            >
              {t('Delete')}
            </Button>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4 flex-1">
        <div className="label">{t('Sizes, in order')}</div>
        {category.sizes.length === 0 ? (
          <p className="text-base text-status-amber font-bold">{t('No sizes yet. Add the sizes this category comes in.')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {category.sizes.map((z, i) => (
              <div key={z.id} className="flex items-stretch border border-os-ink h-11">
                <button
                  type="button"
                  aria-label={t('Move {size} left', { size: z.size })}
                  disabled={busy || i === 0}
                  onClick={() => void run(t('Not saved'), () => store.moveCategorySize(category.id, z.id, -1))}
                  className="w-8 flex items-center justify-center text-os-muted hover:bg-os-soft disabled:opacity-25"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 flex items-center text-base font-bold min-w-[2.5rem] justify-center">{z.size}</span>
                <button
                  type="button"
                  aria-label={t('Move {size} right', { size: z.size })}
                  disabled={busy || i === category.sizes.length - 1}
                  onClick={() => void run(t('Not saved'), () => store.moveCategorySize(category.id, z.id, 1))}
                  className="w-8 flex items-center justify-center text-os-muted hover:bg-os-soft disabled:opacity-25"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  aria-label={t('Remove size {size}', { size: z.size })}
                  disabled={busy}
                  onClick={() => void run(t('Size not removed'), () => store.deleteCategorySize(z.id))}
                  className="w-9 flex items-center justify-center border-l border-os-line text-os-muted hover:text-status-red hover:bg-status-redBg disabled:opacity-25"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddSizes} className="flex gap-2">
          <input
            className="field h-11"
            value={sizeText}
            onChange={(e) => setSizeText(e.target.value)}
            placeholder={t('Add sizes, e.g. S, M, L, XL')}
            aria-label={t('Add sizes')}
            maxLength={120}
          />
          <Button type="submit" variant="secondary" icon={<Plus size={18} />} disabled={busy || !sizeText.trim()} className="h-11 shrink-0">
            {t('Add')}
          </Button>
        </form>
        <p className="text-sm text-os-muted">{t('Removing a size here does not change products that already have it.')}</p>
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
    </div>
  );
};
