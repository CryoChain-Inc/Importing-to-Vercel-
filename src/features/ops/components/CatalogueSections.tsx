import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { imageUrl, type PickedImage } from '../../../services/catalogueImage';
import { saveCategory, saveProduct, type Category, type Product } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ImageField } from './ImageField';
import { useAction } from './useAction';

const STATES = ['Active', 'Hidden'];

/** Add a category, or edit one (name, image, visibility). Hidden items leave the public catalogue. */
function CategoryForm({ category, onSaved, onCancel }: { category?: Category; onSaved: () => Promise<void>; onCancel?: () => void }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onSaved);
  const [name, setName] = useState(category?.name ?? '');
  const [active, setActive] = useState(category?.active ?? true);
  const [image, setImage] = useState<PickedImage>();
  return (
    <Card style={s.form}>
      <Text style={s.title}>{category ? 'Edit category' : 'Add category'}</Text>
      {error ? <Banner text={error} /> : null}
      <Input label="Name" value={name} onChangeText={setName} placeholder="Vegetables" />
      <ImageField label="Category image" currentUrl={imageUrl(category?.imagePath)} picked={image} onPick={setImage} />
      {category ? <ChoiceChips label="Visibility" options={STATES} value={active ? 'Active' : 'Hidden'} onChange={(v) => setActive(v === 'Active')} /> : null}
      <Button label={category ? 'Save category' : 'Add category'} loading={busy} disabled={name.trim().length < 2}
        onPress={() => run(async () => {
          await saveCategory({ id: category?.id, name, active, image, oldImagePath: category?.imagePath });
          if (category) onCancel?.(); else { setName(''); setImage(undefined); }
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
  const options = categories.filter((c) => c.active || c.id === product?.categoryId);
  const current = options.find((c) => c.id === categoryId);
  return (
    <Card style={s.form}>
      <Text style={s.title}>{product ? 'Edit product' : 'Add product'}</Text>
      {error ? <Banner text={error} /> : null}
      {options.length ? (
        <>
          <Input label="Name" value={name} onChangeText={setName} placeholder="Garden egg" />
          <ChoiceChips label="Category" options={options.map((c) => c.name)} value={current?.name ?? ''}
            onChange={(n) => setCategoryId(options.find((c) => c.name === n)!.id)} />
          <ImageField label="Product image" currentUrl={imageUrl(product?.imagePath)} picked={image} onPick={setImage} />
          {product ? <ChoiceChips label="Visibility" options={STATES} value={active ? 'Active' : 'Hidden'} onChange={(v) => setActive(v === 'Active')} /> : null}
          <Button label={product ? 'Save product' : 'Add product'} loading={busy} disabled={name.trim().length < 2 || !current}
            onPress={() => run(async () => {
              await saveProduct({ id: product?.id, name, categoryId, active, image, oldImagePath: product?.imagePath });
              if (product) onCancel?.(); else { setName(''); setImage(undefined); }
            })} />
        </>
      ) : <Text style={s.meta}>Add a category first.</Text>}
      {onCancel ? <Button label="Cancel" variant="ghost" onPress={onCancel} /> : null}
    </Card>
  );
}

function Thumb({ path }: { path: string | null }) {
  const s = useThemedStyles(styles);
  const uri = imageUrl(path);
  return uri ? <Image source={{ uri }} style={s.thumb} /> : <View style={s.thumb} />;
}

export function CategoriesSection({ categories, onChange }: { categories: Category[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <View style={s.list}>
      <CategoryForm onSaved={onChange} />
      {categories.map((c) => editing === c.id ? (
        <CategoryForm key={c.id} category={c} onSaved={onChange} onCancel={() => setEditing(null)} />
      ) : (
        <Card key={c.id} style={s.item}>
          <Thumb path={c.imagePath} />
          <Text style={s.name}>{c.name}{c.active ? '' : '  (hidden)'}</Text>
          <Button label="Edit" size="sm" variant="outline" onPress={() => setEditing(c.id)} />
        </Card>
      ))}
    </View>
  );
}

export function ProductsSection({ categories, products, onChange }: { categories: Category[]; products: Product[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <View style={s.list}>
      <ProductForm categories={categories} onSaved={onChange} />
      {products.map((p) => editing === p.id ? (
        <ProductForm key={p.id} categories={categories} product={p} onSaved={onChange} onCancel={() => setEditing(null)} />
      ) : (
        <Card key={p.id} style={s.item}>
          <Thumb path={p.imagePath} />
          <View style={s.grow}>
            <Text style={s.name}>{p.name}{p.active ? '' : '  (hidden)'}</Text>
            <Text style={s.meta}>{p.category}</Text>
          </View>
          <Button label="Edit" size="sm" variant="outline" onPress={() => setEditing(p.id)} />
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 12 },
  item: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  grow: { flex: 1 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: c.surfaceSunken },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { flex: 1, fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
