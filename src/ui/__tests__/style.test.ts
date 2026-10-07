import { colors, cssVar, fontFamily } from '../theme';
import {
  classStyle,
  gridTemplate,
  isLayoutClass,
  normalizeStyle,
  parseGrid,
  present,
} from '../style';

describe('theme', () => {
  test('css variables resolve to the palette and unknown values pass through', () => {
    expect(cssVar('var(--ink)')).toBe(colors.ink);
    expect(cssVar('1px solid var(--line)')).toBe(`1px solid ${colors.line}`);
    expect(cssVar('var(--missing)')).toBe('--missing');
    expect(cssVar(12)).toBe(12);
  });

  test('font families follow weight, with Fraunces reserved for hero text', () => {
    expect(fontFamily()).toBe('Inter_400Regular');
    expect(fontFamily(500)).toBe('Inter_500Medium');
    expect(fontFamily('600')).toBe('Inter_600SemiBold');
    expect(fontFamily('bold')).toBe('Inter_700Bold');
    expect(fontFamily('400', true)).toBe('Fraunces_400Regular');
  });
});

describe('layout styles', () => {
  test('utility classes compile into react native layout', () => {
    expect(classStyle('row')).toMatchObject({
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    });
    expect(classStyle('col gap8')).toMatchObject({ flexDirection: 'column', gap: 8 });
    expect(classStyle('card')).toMatchObject({
      backgroundColor: '#fff',
      borderColor: colors.line,
      borderRadius: 8,
    });
    expect(classStyle('hero').fontFamily).toBe('Fraunces_400Regular');
    expect(classStyle(undefined).fontFamily).toBe('Inter_400Regular');
  });

  test('shorthand css expands into edges and drops web-only properties', () => {
    expect(
      normalizeStyle({ padding: 4, cursor: 'pointer', background: 'var(--green-tint)' }),
    ).toEqual({
      paddingTop: 4,
      paddingRight: 4,
      paddingBottom: 4,
      paddingLeft: 4,
      backgroundColor: colors.greenTint,
    });
    expect(normalizeStyle({ margin: '8 12', border: '1px solid var(--line)' })).toMatchObject({
      marginTop: 8,
      marginRight: 12,
      marginBottom: 8,
      marginLeft: 12,
      borderWidth: 1,
      borderColor: colors.line,
    });
    expect(
      normalizeStyle({ background: 'linear-gradient(red, blue)', display: 'none' }),
    ).toMatchObject({
      backgroundColor: '#E8ECEF',
      display: 'none',
    });
    expect(normalizeStyle(null)).toEqual({});
  });

  test('present splits text keys from view keys and defaults the ink colour', () => {
    const laid = present('body', { padding: 4 });
    expect(laid.view).toMatchObject({
      padding: 16,
      paddingTop: 4,
      paddingBottom: 4,
      gap: 12,
      flexGrow: 1,
    });
    expect(laid.text.color).toBe(colors.ink);
    expect(laid.merged.fontFamily).toBe('Inter_400Regular');
    const weighted = present(undefined, { fontWeight: '600', color: colors.blue });
    expect(weighted.text).toMatchObject({
      fontWeight: '600',
      fontFamily: 'Inter_600SemiBold',
      color: colors.blue,
    });
  });

  test('layout class detection and grid templates', () => {
    expect(isLayoutClass('card pad')).toBe(true);
    expect(isLayoutClass('h16 muted')).toBe(false);
    expect(isLayoutClass(undefined)).toBe(false);
    expect(gridTemplate('photo-grid')).toBe('1fr 1fr');
    expect(gridTemplate('card', { gridTemplateColumns: '2fr 1fr' })).toBe('2fr 1fr');
    expect(gridTemplate('card')).toBeUndefined();
  });

  test('parseGrid expands repeats and keeps pixel tracks', () => {
    expect(parseGrid('1fr 120px 2fr')).toEqual([
      { kind: 'fr', n: 1 },
      { kind: 'px', n: 120 },
      { kind: 'fr', n: 2 },
    ]);
    expect(parseGrid('repeat(2, 1fr 40px)')).toEqual([
      { kind: 'fr', n: 1 },
      { kind: 'px', n: 40 },
      { kind: 'fr', n: 1 },
      { kind: 'px', n: 40 },
    ]);
    expect(parseGrid('auto')).toEqual([{ kind: 'fr', n: 1 }]);
  });
});
