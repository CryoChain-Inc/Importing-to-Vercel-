import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { imageUrl, type PickedImage } from '../../../services/catalogueImage';
import { saveCategory, saveProduct, type Category, type Product } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { ImageField } from './ImageField';
import { Empty, usePaged } from './OpsBits';
import { useAction } from './useAction';

const STATES = ['Active', 'Hidden'];

/** Add a category, or edit one (name, image, visibility). Hidden items leave the public catalogue. */
function CategoryForm({ category, onSaved, onCancel }: { category?: Category; onSaved: () => Promise<void>; onCancel?: () => void }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onSaved);
  const [name, setName] = useState(category?.name ?? '');
  const [active, setActive] = useState(category?.active ?? true);
  const [image, setImage] = useState<PickedImage>();
  const [removed, setRemoved] = useState(false);
  return (
    <Card tone="tint" style={s.form}>
      <Text style={s.title}>{category ? 'Edit category' : 'Add category'}</Text>
      {error ? <Banner text={error} /> : null}
      <Input label="Name" value={name} onChangeText={setName} placeholder="Vegetables" />
      <ImageField label="Category image" currentUrl={imageUrl(category?.imagePath)} picked={image} removed={removed} onPick={(i) => { setImage(i); setRemoved(false); }} onRemove={() => { setImage(undefined); setRemoved(true); }} />
      {category ? <ChoiceChips label="Visibility" options={STATES} value={active ? 'Active' : 'Hidden'} onChange={(v) => setActive(v === 'Active')} /> : null}
      <Button label={category ? 'Save category' : 'Add category'} loading={busy} disabled={name.trim().length < 2}
        onPress={() => run(async () => {
          await saveCategory({ id: category?.id, name, active, image, oldImagePath: category?.imagePath, removeImage: removed });
          if (category) onCancel?.(); else { setName(''); setImage(undefined); setRemoved(false); onCancel?.(); }
        })} />
      {onCancel ? <Button label="Cancel" variant="ghost" onPress={onCancel} /> : null}
    </Card>
  );
}

function ProductForm({ categories, product, onSaved, onCancel }: { categories: Category[]; product?: Product; onSaved: () => Promise<void>; onCancel?: () => void }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onSaved);
  const [name, setName] = useState(product?.name ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [active, setActive] = useState(product?.active ?? true);
  const [image, setImage] = useState<PickedImage>();
  const [removed, setRemoved] = useState(false);
  const options = categories.filter((c) => c.active || c.id === product?.categoryId);
  const current = options.find((c) => c.id === categoryId);
  return (
    <Card tone="tint" style={s.form}>
      <Text style={s.title}>{product ? 'Edit product' : 'Add product'}</Text>
      {error ? <Banner text={error} /> : null}
      {options.length ? (
        <>
          <Input label="Name" value={name} onChangeText={setName} placeholder="Garden egg" />
          <ChoiceChips label="Category" options={options.map((c) => c.name)} value={current?.name ?? ''}
            onChange={(n) => setCategoryId(options.find((c) => c.name === n)!.id)} />
          <ImageField label="Product image" currentUrl={imageUrl(product?.imagePath)} picked={image} removed={removed} onPick={(i) => { setImage(i); setRemoved(false); }} onRemove={() => { setImage(undefined); setRemoved(true); }} />
          {product ? <ChoiceChips label="Visibility" options={STATES} value={active ? 'Active' : 'Hidden'} onChange={(v) => setActive(v === 'Active')} /> : null}
          <Button label={product ? 'Save product' : 'Add product'} loading={busy} disabled={name.trim().length < 2 || !current}
            onPress={() => run(async () => {
              await saveProduct({ id: product?.id, name, categoryId, active, image, oldImagePath: product?.imagePath, removeImage: removed });
              if (product) onCancel?.(); else { setName(''); setImage(undefined); setRemoved(false); onCancel?.(); }
            })} />
        </>
      ) : <Text style={s.meta}>Add a category first.</Text>}
      {onCancel ? <Button label="Cancel" variant="ghost" onPress={onCancel} /> : null}
    </Card>
  );
}

function Thumb({ path }: { path: string | null }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const uri = imageUrl(path);
  return uri ? <Image source={{ uri }} style={s.thumb} accessibilityLabel="Image" /> : <View style={[s.thumb, s.noThumb]}><Icon name="leaf" size={20} color={colors.inkMuted} /></View>;
}

export function CategoriesSection({ categories, onChange }: { categories: Category[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { rows, more } = usePaged(categories, 'categories', 6);
  return (
    <View style={s.list}>
      {adding ? <CategoryForm onSaved={onChange} onCancel={() => setAdding(false)} /> : <Button label="Add category" icon="tag" onPress={() => { setAdding(true); setEditing(null); }} />}
      {categories.length === 0 ? <Empty icon="tag" title="No categories yet" hint="Categories group products, such as Vegetables or Grains." /> : null}
      {rows.map((c) => editing === c.id ? (
        <CategoryForm key={c.id} category={c} onSaved={onChange} onCancel={() => setEditing(null)} />
      ) : (
        <Card key={c.id} style={s.item}>
          <Thumb path={c.imagePath} />
          <View style={s.grow}>
            <Text style={s.name} numberOfLines={1}>{c.name}</Text>
            <Text style={s.meta}>{c.active ? 'Shown in the catalogue' : 'Hidden from the catalogue'}</Text>
          </View>
          {c.active ? null : <Badge label="Hidden" tone="neutral" />}
          <Button label="Edit" size="sm" variant="outline" onPress={() => { setEditing(c.id); setAdding(false); }} />
        </Card>
      ))}
      {more}
    </View>
  );
}

export function ProductsSection({ categories, products, onChange }: { categories: Category[]; products: Product[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const filtered = products.filter((p) => !needle || `${p.name} ${p.category}`.toLowerCase().includes(needle));
  const { rows, more } = usePaged(filtered, needle, 6);
  return (
    <View style={s.list}>
      {adding ? <ProductForm categories={categories} onSaved={onChange} onCancel={() => setAdding(false)} /> : <Button label="Add product" icon="tag" onPress={() => { setAdding(true); setEditing(null); }} />}
      {products.length === 0 ? <Empty icon="leaf" title="No products yet" hint="Add the produce farmers can list, with a photo so buyers recognise it." /> : (
        <Input label="Search products" value={q} onChangeText={setQ} placeholder="Name or category" />
      )}
      {products.length > 0 && filtered.length === 0 ? <Text style={s.meta}>No product matches.</Text> : null}
      {rows.map((p) => editing === p.id ? (
        <ProductForm key={p.id} categories={categories} product={p} onSaved={onChange} onCancel={() => setEditing(null)} />
      ) : (
        <Card key={p.id} style={s.item}>
          <Thumb path={p.imagePath} />
          <View style={s.grow}>
            <Text style={s.name} numberOfLines={1}>{p.name}</Text>
            <Text style={s.meta}>{p.category}</Text>
          </View>
          {p.active ? null : <Badge label="Hidden" tone="neutral" />}
          <Button label="Edit" size="sm" variant="outline" onPress={() => { setEditing(p.id); setAdding(false); }} />
        </Card>
      ))}
      {more}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  form: { gap: 12 },
  item: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 14 },
  grow: { flex: 1, gap: 2 },
  thumb: { width: 52, height: 52, borderRadius: 14, backgroundColor: c.surfaceSunken },
  noThumb: { alignItems: 'center' as const, justifyContent: 'center' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
