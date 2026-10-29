import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Button, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { imageUrl, type PickedImage } from '../../../services/catalogueImage';
import { saveCategory, saveProduct, setVisibility, type Category, type Product } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { GalleryField } from './GalleryField';
import { ImageField } from './ImageField';
import { ActiveToggle, Empty, usePaged } from './OpsBits';
import { Sheet } from './Sheet';
import { useAction } from './useAction';

const DESCRIPTION_MAX = 600;

/** Add or edit a category in a dialog. Visibility is the switch on the list row. */
function CategoryForm({ category, onSaved, onClose }: { category?: Category; onSaved: () => Promise<void>; onClose: () => void }) {
  const { busy, error, run } = useAction(onSaved);
  const [name, setName] = useState(category?.name ?? '');
  const [image, setImage] = useState<PickedImage>();
  const [removed, setRemoved] = useState(false);
  return (
    <Sheet title={category ? 'Edit category' : 'Add category'} subtitle="Categories group products, such as Vegetables or Grains." onClose={onClose}
      footer={<>
        <Button label="Cancel" variant="ghost" onPress={onClose} />
        <Button label={category ? 'Save category' : 'Add category'} loading={busy} disabled={name.trim().length < 2}
          onPress={() => run(async () => {
            await saveCategory({ id: category?.id, name, active: category?.active ?? true, image, oldImagePath: category?.imagePath, removeImage: removed });
            onClose();
          })} />
      </>}>
      {error ? <Banner text={error} /> : null}
      <Input label="Name" value={name} onChangeText={setName} placeholder="Vegetables" />
      <ImageField label="Category image" currentUrl={imageUrl(category?.imagePath)} picked={image} removed={removed} onPick={(i) => { setImage(i); setRemoved(false); }} onRemove={() => { setImage(undefined); setRemoved(true); }} />
    </Sheet>
  );
}

function ProductForm({ categories, product, onSaved, onClose }: { categories: Category[]; product?: Product; onSaved: () => Promise<void>; onClose: () => void }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onSaved);
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [image, setImage] = useState<PickedImage>();
  const [removed, setRemoved] = useState(false);
  const [description, setDescription] = useState(product?.description ?? '');
  const [gallery, setGallery] = useState({ saved: product?.imagePaths ?? [], picked: [] as PickedImage[] });
  const options = categories.filter((c) => c.active || c.id === product?.categoryId);
  const current = options.find((c) => c.id === categoryId);
  return (
    <Sheet title={product ? 'Edit product' : 'Add product'} subtitle="Farmers list this produce; buyers see the photos and description." onClose={onClose}
      footer={<>
        <Button label="Cancel" variant="ghost" onPress={onClose} />
        {options.length ? (
          <Button label={product ? 'Save product' : 'Add product'} loading={busy} disabled={name.trim().length < 2 || !current}
            onPress={() => run(async () => {
              await saveProduct({
                id: product?.id, name, categoryId, active: product?.active ?? true, image, oldImagePath: product?.imagePath, removeImage: removed, description,
                gallery: { keep: gallery.saved, dropped: (product?.imagePaths ?? []).filter((p) => !gallery.saved.includes(p)), added: gallery.picked },
              });
              onClose();
            })} />
        ) : null}
      </>}>
      {error ? <Banner text={error} /> : null}
      {options.length ? (
        <>
          <Input label="Name" value={name} onChangeText={setName} placeholder="Garden egg" />
          <ChoiceChips label="Category" options={options.map((c) => c.name)} value={current?.name ?? ''}
            onChange={(n) => setCategoryId(options.find((c) => c.name === n)!.id)} />
          <ImageField label="Cover image" currentUrl={imageUrl(product?.imagePath)} picked={image} removed={removed} onPick={(i) => { setImage(i); setRemoved(false); }} onRemove={() => { setImage(undefined); setRemoved(true); }} />
          <GalleryField {...gallery} onChange={setGallery} />
          <Input label="Description" value={description} onChangeText={setDescription} multiline numberOfLines={7} maxLength={DESCRIPTION_MAX}
            style={s.description} placeholder="Origin, taste, how it is graded and packed"
            hint={`${description.length} / ${DESCRIPTION_MAX}`} />
        </>
      ) : <Text style={s.meta}>Add a category first.</Text>}
    </Sheet>
  );
}

function Thumb({ path }: { path: string | null }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const uri = imageUrl(path);
  return uri ? <Image source={{ uri }} style={s.thumb} accessibilityLabel="Image" /> : <View style={[s.thumb, s.noThumb]}><Icon name="leaf" size={22} color={colors.inkMuted} /></View>;
}

/** One list row: photo, name, visibility switch, edit. Hidden rows are dimmed. */
function Row({ path, name, meta, active, onToggle, onEdit }: { path: string | null; name: string; meta: string; active: boolean; onToggle: (next: boolean) => Promise<void>; onEdit: () => void }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.row}>
      <View style={[s.who, !active && s.dim]}>
        <Thumb path={path} />
        <View style={s.grow}>
          <Text style={s.name} numberOfLines={1}>{name}</Text>
          <Text style={s.meta} numberOfLines={1}>{meta}</Text>
        </View>
      </View>
      <View style={s.controls}>
        <ActiveToggle active={active} label={name} onToggle={onToggle} />
        <Button label="Edit" size="sm" variant="outline" onPress={onEdit} />
      </View>
    </View>
  );
}

export function CategoriesSection({ categories, products, onChange }: { categories: Category[]; products: Product[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [form, setForm] = useState<Category | 'new' | null>(null);
  const { rows, more } = usePaged(categories, 'categories', 8);
  const count = (id: string) => products.filter((p) => p.categoryId === id).length;
  return (
    <View style={s.list}>
      <View style={s.bar}>
        <Text style={s.hint}>Hidden categories leave the public catalogue.</Text>
        <Button label="Add category" icon="tag" size="sm" onPress={() => setForm('new')} />
      </View>
      {categories.length === 0 ? <Empty icon="tag" title="No categories yet" hint="Categories group products, such as Vegetables or Grains." /> : (
        <View style={s.table}>
          {rows.map((c) => (
            <Row key={c.id} path={c.imagePath} name={c.name} meta={`${count(c.id)} ${count(c.id) === 1 ? 'product' : 'products'}`} active={c.active}
              onToggle={async (next) => { await setVisibility('categories', c.id, next); await onChange(); }} onEdit={() => setForm(c)} />
          ))}
        </View>
      )}
      {more}
      {form ? <CategoryForm category={form === 'new' ? undefined : form} onSaved={onChange} onClose={() => setForm(null)} /> : null}
    </View>
  );
}

export function ProductsSection({ categories, products, onChange }: { categories: Category[]; products: Product[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [form, setForm] = useState<Product | 'new' | null>(null);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const filtered = products.filter((p) => !needle || `${p.name} ${p.category}`.toLowerCase().includes(needle));
  const { rows, more } = usePaged(filtered, needle, 8);
  return (
    <View style={s.list}>
      <View style={s.bar}>
        <View style={s.search}><Input label="Search products" value={q} onChangeText={setQ} placeholder="Name or category" /></View>
        <Button label="Add product" icon="tag" onPress={() => setForm('new')} />
      </View>
      {products.length === 0 ? <Empty icon="leaf" title="No products yet" hint="Add the produce farmers can list, with a photo so buyers recognise it." /> : null}
      {products.length > 0 && filtered.length === 0 ? <Text style={s.meta}>No product matches.</Text> : null}
      {rows.length ? (
        <View style={s.table}>
          {rows.map((p) => (
            <Row key={p.id} path={p.imagePath} name={p.name} meta={p.category} active={p.active}
              onToggle={async (next) => { await setVisibility('products', p.id, next); await onChange(); }} onEdit={() => setForm(p)} />
          ))}
        </View>
      ) : null}
      {more}
      {form ? <ProductForm categories={categories} product={form === 'new' ? undefined : form} onSaved={onChange} onClose={() => setForm(null)} /> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 14 },
  bar: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, flexWrap: 'wrap' as const, gap: 12 },
  search: { flexGrow: 1, flexBasis: 220, maxWidth: 420 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted, flexShrink: 1 },
  table: { borderRadius: 16, backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.borderSubtle, overflow: 'hidden' as const },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, flexWrap: 'wrap' as const, gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  who: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, flexGrow: 1, flexBasis: 220, minWidth: 0 },
  dim: { opacity: 0.55 },
  controls: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  grow: { flex: 1, gap: 2 },
  thumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: c.surfaceSunken },
  noThumb: { alignItems: 'center' as const, justifyContent: 'center' as const },
  name: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  description: { minHeight: 170, paddingTop: 12, textAlignVertical: 'top' as const },
});
