import { Children, isValidElement, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useChrome } from './chrome';
import { colors, fontFamily } from './theme';
import { gridTemplate, isLayoutClass, parseGrid, present, type Col } from './style';

function cellTextAlign(text: TextStyle): TextStyle['textAlign'] {
  return text.textAlign;
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
}

// Inspects React child hierarchy to determine whether nodes should render as inline Text, flex row, or block View.
function flow(node: ReactNode): 'text' | 'row' | 'block' {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number'
  )
    return 'text';
  if (Array.isArray(node)) {
    const parts = node.map(flow);
    if (parts.includes('block')) return 'block';
    if (parts.includes('row')) return 'row';
    return 'text';
  }
  if (!isValidElement(node)) return 'text';
  const type = node.type as { displayName?: string; name?: string };
  if (type?.displayName === 'Inline') return 'text';
  if (type?.displayName === 'Link' || type?.name === 'Link') {
    return isLayoutClass((node.props as { className?: string }).className) ? 'block' : 'row';
  }
  if (type === Host) {
    const props = node.props as {
      tag?: string;
      className?: string;
      style?: { display?: string; gridTemplateColumns?: string };
      children?: ReactNode;
    };
    const inline =
      props.tag === 'span' ||
      props.tag === 'strong' ||
      props.tag === 'b' ||
      props.tag === 'em' ||
      props.tag === 'i' ||
      props.tag === 'a' ||
      props.tag === 'br' ||
      props.tag === 'label';
    if (!inline) return 'block';
    if (
      isLayoutClass(props.className) ||
      props.style?.display === 'flex' ||
      props.style?.display === 'grid' ||
      props.style?.gridTemplateColumns
    )
      return 'block';
    return flow(props.children);
  }
  return 'block';
}

function optionsFrom(children: ReactNode) {
  const options: { value: string; label: string }[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { tag?: string; value?: string; children?: ReactNode };
    if (
      props.tag !== 'option' &&
      (child.type as { displayName?: string })?.displayName !== 'option'
    )
      return;
    const label = textOf(props.children);
    options.push({ value: props.value ?? label, label });
  });
  return options;
}

export function Select({
  value,
  onChange,
  onValueChange,
  options,
  dark,
  style,
}: {
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
  options: { value: string; label: string }[];
  dark?: boolean;
  style?: ViewStyle;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  const choose = (next: string) => {
    setOpen(false);
    onValueChange?.(next);
    onChange?.({ target: { value: next } });
  };
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          {
            minHeight: dark ? 32 : 48,
            borderWidth: 1,
            borderColor: dark ? '#2E3A46' : colors.steel,
            borderRadius: dark ? 999 : 6,
            backgroundColor: dark ? '#2E3A46' : '#fff',
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          },
          style,
        ]}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: dark ? '#fff' : colors.ink,
            fontSize: dark ? 12 : 16,
            fontFamily: fontFamily(dark ? '400' : '400'),
          }}
        >
          {current?.label ?? 'Choose'}
        </Text>
        <Text style={{ color: dark ? '#BAC2CC' : colors.steelInk }}>{dark ? '▾' : '▾'}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(26,35,48,.45)', justifyContent: 'flex-end' }}
        >
          <Pressable
            style={{
              backgroundColor: colors.paper,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              maxHeight: '70%',
              padding: 16,
              gap: 8,
            }}
          >
            <Text
              style={{
                fontFamily: fontFamily('600'),
                fontSize: 16,
                color: colors.ink,
                marginBottom: 4,
              }}
            >
              Choose
            </Text>
            <ScrollView>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => choose(o.value)}
                  style={{
                    paddingVertical: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.lineSoft,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      color: o.value === value ? colors.blue : colors.ink,
                      fontFamily: fontFamily(o.value === value ? '600' : '400'),
                    }}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function gridChildren(template: string, children: ReactNode) {
  const cols = parseGrid(template);
  const equal = cols.every((c) => c.kind === 'fr');
  const items = Children.toArray(children).filter(
    (child) => child !== null && child !== undefined && typeof child !== 'boolean',
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: equal ? 'wrap' : 'nowrap',
        alignItems: 'flex-start',
        marginHorizontal: -8,
      }}
    >
      {items.map((child, i) => {
        const wide =
          isValidElement(child) &&
          String((child.props as { className?: string }).className ?? '').includes('wide');
        const col = cols[Math.min(i, cols.length - 1)] as Col;
        const box: ViewStyle = wide
          ? { width: '100%', padding: 8, minWidth: 0 }
          : equal
            ? { width: `${100 / cols.length}%`, padding: 8, minWidth: 0 }
            : col.kind === 'px'
              ? { width: col.n, padding: 8, flexShrink: 0 }
              : { flex: col.n, minWidth: 0, padding: 8 };
        return (
          <View key={i} style={box}>
            {child}
          </View>
        );
      })}
    </View>
  );
}

const wrapText: TextStyle = { maxWidth: '100%', flexShrink: 1, minWidth: 0 };

function paint(children: ReactNode, text: TextStyle) {
  return Children.map(children, (child) =>
    typeof child === 'string' || typeof child === 'number' ? (
      <Text style={text}>{child}</Text>
    ) : (
      child
    ),
  );
}

/**
 * Universal component adapter that maps web HTML tags (div, span, button, table, select)
 * into equivalent React Native primitives (View, Text, Pressable, TextInput, Modal).
 */
export function Host(props: {
  tag: string;
  className?: string;
  style?: Record<string, any>;
  children?: ReactNode;
  onClick?: (...args: any[]) => void;
  onChange?: (event: any) => void;
  value?: any;
  checked?: boolean;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  readOnly?: boolean;
  [key: string]: any;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const chrome = useChrome();
  const desk = windowWidth >= 1024 && chrome !== 'phone';
  const {
    tag,
    className,
    style,
    children,
    onClick,
    onChange,
    value,
    checked,
    placeholder,
    disabled,
    type,
    readOnly,
    maxLength,
    inputMode,
  } = props;
  if (tag === 'br') return <Text>{'\n'}</Text>;
  if (tag === 'option') return null;
  if (tag === 'thead' || tag === 'tbody') return <>{children}</>;
  const looks = present(className, style);
  if (style?.display === 'flex' && !looks.view.flexDirection) {
    looks.view.flexDirection = 'row';
    looks.view.alignItems = looks.view.alignItems ?? 'center';
  }
  const mode =
    isLayoutClass(className) ||
    style?.display === 'grid' ||
    style?.display === 'flex' ||
    style?.gridTemplateColumns
      ? 'block'
      : flow(children);
  const textStyle: TextStyle = {
    ...looks.text,
    fontFamily: looks.text.fontFamily ?? fontFamily(looks.text.fontWeight),
  };

  if (tag === 'input' && type === 'checkbox') {
    return (
      <Pressable
        onPress={() => onChange?.({ target: { value: String(!checked), checked: !checked } })}
        style={{
          width: Number(looks.view.width ?? 28),
          height: Number(looks.view.height ?? 28),
          borderWidth: 2,
          borderColor: checked ? colors.blue : colors.steel,
          backgroundColor: checked ? colors.blue : '#fff',
          borderRadius: 4,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Text style={{ color: '#fff', fontWeight: '700' }}>✓</Text> : null}
      </Pressable>
    );
  }
  if (tag === 'input' || tag === 'textarea') {
    return (
      <TextInput
        value={value == null ? undefined : String(value)}
        onChangeText={(t) => onChange?.({ target: { value: t } })}
        placeholder={
          placeholder ?? (type === 'date' ? 'YYYY-MM-DD' : type === 'time' ? 'HH:MM' : undefined)
        }
        placeholderTextColor={colors.steelInk}
        editable={!disabled && !readOnly}
        multiline={tag === 'textarea'}
        maxLength={typeof maxLength === 'number' ? maxLength : undefined}
        keyboardType={
          type === 'number'
            ? 'decimal-pad'
            : type === 'tel' || inputMode === 'numeric'
              ? 'phone-pad'
              : 'default'
        }
        style={[
          looks.view,
          textStyle,
          tag === 'textarea'
            ? { minHeight: 72, textAlignVertical: 'top', paddingTop: 12 }
            : { paddingVertical: 0 },
        ]}
      />
    );
  }
  if (tag === 'select') {
    return (
      <Select
        value={value == null ? undefined : String(value)}
        onChange={onChange}
        options={optionsFrom(children)}
        style={looks.view}
      />
    );
  }

  const grid = gridTemplate(className, style);
  if (grid && (tag === 'div' || tag === 'section')) {
    return <View style={looks.view}>{gridChildren(grid, children)}</View>;
  }

  if (tag === 'table') {
    const table = (
      <View
        style={[{ width: desk ? '100%' : undefined, minWidth: desk ? undefined : 720 }, looks.view]}
      >
        {children}
      </View>
    );
    if (desk) return table;
    return (
      <ScrollView horizontal nestedScrollEnabled style={{ flexGrow: 0 }}>
        {table}
      </ScrollView>
    );
  }
  if (tag === 'tr') {
    const head = className?.split(/\s+/).includes('head');
    return (
      <Pressable
        disabled={!onClick}
        onPress={onClick}
        style={[
          {
            flexDirection: 'row',
            borderBottomWidth: 1,
            borderBottomColor: head ? colors.line : colors.lineSoft,
            backgroundColor: head ? colors.lineSoft : looks.view.backgroundColor,
            minHeight: head ? 42 : undefined,
            alignItems: head ? 'center' : 'flex-start',
          },
          className?.includes('sel') ? { backgroundColor: colors.mist } : null,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  if (tag === 'td' || tag === 'th') {
    const cellText: TextStyle = {
      ...textStyle,
      fontWeight: tag === 'th' ? '600' : textStyle.fontWeight,
      color: tag === 'th' ? colors.steelInk : textStyle.color,
      fontSize: textStyle.fontSize ?? 13,
      textAlign: className?.includes('num') ? 'right' : cellTextAlign(textStyle),
    };
    const cell: ViewStyle = desk
      ? {
          flex: 1,
          minWidth: 0,
          paddingHorizontal: 12,
          paddingVertical: 10,
          justifyContent: 'center',
        }
      : { width: 132, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' };
    return (
      <View
        style={[
          cell,
          looks.view,
          looks.view.gap != null
            ? { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }
            : null,
        ]}
      >
        {mode === 'text' ? (
          <Text style={cellText} numberOfLines={tag === 'th' ? 1 : undefined}>
            {children}
          </Text>
        ) : (
          paint(children, cellText)
        )}
      </View>
    );
  }

  if (tag === 'button' || tag === 'a') {
    const label = flow(children) !== 'block';
    return (
      <Pressable
        disabled={disabled}
        onPress={disabled ? undefined : () => onClick?.()}
        style={[looks.view, disabled ? { opacity: 0.45 } : null]}
      >
        {label ? (
          <Text style={[textStyle, { textAlign: 'center' }]}>{children}</Text>
        ) : (
          paint(children, textStyle)
        )}
      </Pressable>
    );
  }

  if (className?.split(/\s+/).includes('body')) {
    if (chrome === 'desk') return <View style={[looks.view, { width: '100%' }]}>{children}</View>;
    return (
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={[looks.view, { flexGrow: 1 }]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
    );
  }

  if (mode === 'text' && tag !== 'label') {
    const strong = tag === 'strong' || tag === 'b';
    return (
      <Text
        onPress={onClick}
        style={[
          looks.view,
          textStyle,
          wrapText,
          { alignSelf: 'stretch' },
          strong ? { fontFamily: fontFamily('700'), fontWeight: '700' } : null,
        ]}
      >
        {children}
      </Text>
    );
  }

  if (mode === 'row')
    Object.assign(looks.view, { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' });
  if (looks.view.flexDirection !== 'row') {
    looks.view.minWidth = 0;
    if (looks.view.maxWidth == null) looks.view.maxWidth = '100%';
    looks.view.alignSelf = looks.view.alignSelf ?? 'stretch';
  }

  if (className?.split(/\s+/).includes('two') && desk) {
    const items = Children.toArray(children);
    return (
      <View style={looks.view}>
        {items.map((child, i) => {
          const side =
            isValidElement(child) &&
            String((child.props as { className?: string }).className ?? '').includes('side');
          return (
            <View key={i} style={side ? { width: 380 } : { flex: 1, minWidth: 0 }}>
              {child}
            </View>
          );
        })}
      </View>
    );
  }

  const body = paint(children, textStyle);
  if (onClick)
    return (
      <Pressable onPress={() => onClick()} style={looks.view}>
        {body}
      </Pressable>
    );
  return <View style={looks.view}>{body}</View>;
}
Host.displayName = 'Host';
