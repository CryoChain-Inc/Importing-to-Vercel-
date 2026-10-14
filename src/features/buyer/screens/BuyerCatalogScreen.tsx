import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge, Button, Card, Header } from '../../../components/common';
import { colors, fonts } from '../../../theme';

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  pricePerKg: number;
  availableKg: number;
  tempRequirement: string;
}

const SAMPLE_CATALOG: CatalogItem[] = [
  {
    id: 'prod-1',
    name: 'Fresh Atlantic Salmon',
    category: 'Seafood',
    pricePerKg: 125,
    availableKg: 450,
    tempRequirement: '-2°C to 2°C',
  },
  {
    id: 'prod-2',
    name: 'Organic Hass Avocados',
    category: 'Produce',
    pricePerKg: 35,
    availableKg: 1200,
    tempRequirement: '4°C to 8°C',
  },
  {
    id: 'prod-3',
    name: 'Grade-A Strawberries',
    category: 'Berries',
    pricePerKg: 80,
    availableKg: 320,
    tempRequirement: '0°C to 4°C',
  },
  {
    id: 'prod-4',
    name: 'Chilled Dairy Milk (Pasteurized)',
    category: 'Dairy',
    pricePerKg: 28,
    availableKg: 800,
    tempRequirement: '2°C to 4°C',
  },
];

export function BuyerCatalogScreen({ onSignOut }: { onSignOut?: () => void }) {
  const [cartCount, setCartCount] = useState(0);

  return (
    <View style={styles.container}>
      <Header
        title="Agri-Marketplace"
        subtitle="Nsawam Cold Node • Fresh Supply"
        rightAction={
          <View style={styles.headerActions}>
            <Badge label={`Cart: ${cartCount}`} tone="info" />
            {onSignOut ? (
              <Button label="Sign Out" variant="outline" size="sm" onPress={onSignOut} />
            ) : null}
          </View>
        }
      />

      <FlatList
        data={SAMPLE_CATALOG}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <View>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemCategory}>{item.category}</Text>
              </View>
              <Badge label={item.tempRequirement} tone="info" />
            </View>

            <View style={styles.itemMeta}>
              <View>
                <Text style={styles.metaLabel}>Price / kg</Text>
                <Text style={styles.metaValue}>GH₵ {item.pricePerKg.toFixed(2)}</Text>
              </View>
              <View>
                <Text style={styles.metaLabel}>Available</Text>
                <Text style={styles.metaValue}>{item.availableKg} kg</Text>
              </View>
            </View>

            <Button
              label="Add to Order"
              size="sm"
              variant="secondary"
              onPress={() => setCartCount((prev) => prev + 1)}
            />
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  itemCard: {
    gap: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.ink,
  },
  itemCategory: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: colors.inkMuted,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 24,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.steelLight,
  },
  metaLabel: {
    fontFamily: fonts.sansRegular,
    fontSize: 11,
    color: colors.steel,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 14,
    color: colors.ink,
  },
});
