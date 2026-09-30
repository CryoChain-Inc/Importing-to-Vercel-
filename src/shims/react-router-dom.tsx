import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Platform, Pressable, Text, type TextStyle, type ViewStyle } from 'react-native';
import { present } from '../ui/style';

type Entry = { path: string; search: string };
type RouteState = { base: string; params: Record<string, string> };

const NavCtx = createContext<{
  stack: Entry[];
  push: (to: string, replace?: boolean) => void;
  setSearch: (search: string) => void;
} | null>(null);
const RouteCtx = createContext<RouteState>({ base: '', params: {} });

function norm(path: string) {
  if (!path) return '/';
  const p = path.startsWith('/') ? path : `/${path}`;
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

function readLocation(): Entry {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return { path: '/', search: '' };
  return { path: norm(window.location.pathname), search: window.location.search.replace(/^\?/, '') };
}

function writeLocation(path: string, search: string, replace: boolean) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const url = path + (search ? `?${search}` : '');
  const current = window.location.pathname + window.location.search;
  if (current === url) return;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Entry[]>(() => [readLocation()]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const push = useCallback((to: string, replace = false) => {
    const [raw, search = ''] = to.split('?');
    const path = norm(raw);
    setStack(s => {
      const entry = { path, search };
      const cur = s[s.length - 1];
      if (cur && cur.path === entry.path && cur.search === entry.search) return s;
      if (replace) return [...s.slice(0, -1), entry];
      return [...s, entry];
    });
    writeLocation(path, search, replace);
  }, []);
  const setSearch = useCallback((search: string) => {
    setStack(s => {
      const cur = s[s.length - 1];
      if (!cur) return s;
      writeLocation(cur.path, search, true);
      return [...s.slice(0, -1), { ...cur, search }];
    });
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') {
      const onPop = () => setStack([readLocation()]);
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stackRef.current.length <= 1) return false;
      setStack(s => s.slice(0, -1));
      return true;
    });
    return () => sub.remove();
  }, []);
  const value = useMemo(() => ({ stack, push, setSearch }), [stack, push, setSearch]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

function useNav() {
  const ctx = useContext(NavCtx);
  if (!ctx) throw new Error('NavProvider missing');
  return ctx;
}

export function useLocation() {
  const { stack } = useNav();
  const cur = stack[stack.length - 1] ?? { path: '/', search: '' };
  return { pathname: cur.path, search: cur.search ? `?${cur.search}` : '' };
}

export function useNavigate() {
  const { push } = useNav();
  return (to: string, opts?: { replace?: boolean }) => push(to, opts?.replace);
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>() {
  return useContext(RouteCtx).params as T;
}

export function useSearchParams(): [{ get(name: string): string | null }, (next: Record<string, string>) => void] {
  const { stack, setSearch } = useNav();
  const search = stack[stack.length - 1]?.search ?? '';
  const sp = useMemo(() => new URLSearchParams(search), [search]);
  const set = (next: Record<string, string>) => {
    const n = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => n.set(k, v));
    setSearch(n.toString());
  };
  return [sp, set];
}

function matchPattern(suffix: string, pattern: string) {
  const path = norm(suffix || '/');
  if (pattern === '/' || pattern === '') return path === '/' ? { params: {} as Record<string, string>, score: 1, base: '' } : null;
  const pat = pattern.startsWith('/') ? pattern : `/${pattern}`;
  if (pat.endsWith('/*')) {
    const prefix = norm(pat.slice(0, -2));
    if (path === prefix || path.startsWith(prefix + '/')) return { params: {}, score: 2, base: prefix };
    return null;
  }
  const ps = pat.split('/').filter(Boolean);
  const us = path.split('/').filter(Boolean);
  if (ps.length !== us.length) return null;
  const params: Record<string, string> = {};
  let statics = 0;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i].startsWith(':')) params[ps[i].slice(1)] = decodeURIComponent(us[i]);
    else if (ps[i] !== us[i]) return null;
    else statics += 1;
  }
  return { params, score: 10 + statics * 5 + ps.length, base: '' };
}

export function Routes({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const parent = useContext(RouteCtx);
  let suffix = pathname;
  if (parent.base) {
    if (pathname === parent.base) suffix = '/';
    else if (pathname.startsWith(parent.base + '/')) suffix = pathname.slice(parent.base.length);
  }
  const routes = (Array.isArray(children) ? children : [children]).filter(Boolean) as { props?: { path?: string; index?: boolean; element?: ReactNode } }[];
  let best: { element?: ReactNode; params: Record<string, string>; score: number; base: string } | null = null;
  let star: ReactNode = null;
  for (const route of routes) {
    if (!route?.props) continue;
    if (route.props.path === '*') { star = route.props.element; continue; }
    const pattern = route.props.index || route.props.path == null ? '/' : route.props.path;
    const hit = matchPattern(suffix, pattern);
    if (hit && (!best || hit.score > best.score)) best = { element: route.props.element, params: hit.params, score: hit.score, base: hit.base || parent.base };
  }
  if (!best) return star ? <RouteCtx.Provider value={parent}>{star}</RouteCtx.Provider> : null;
  return <RouteCtx.Provider value={{ base: best.base, params: { ...parent.params, ...best.params } }}>{best.element}</RouteCtx.Provider>;
}

export function Route(_props: { path?: string; index?: boolean; element?: ReactNode }) { return null; }

export function Navigate({ to, replace = true }: { to: string; replace?: boolean }) {
  const nav = useNavigate();
  useEffect(() => { nav(to, { replace }); }, [to, replace, nav]);
  return null;
}

function linkStyles(className: string | undefined, style: object | undefined, textMode: boolean): { view: ViewStyle; text: TextStyle } {
  const p = present(className, style);
  if (!className) {
    p.text.color = p.text.color ?? '#1F78B4';
    p.text.fontFamily = p.text.fontFamily ?? 'Inter_600SemiBold';
  }
  if (textMode) p.view.alignSelf = 'flex-start';
  return p;
}

export function Link({ to, children, className, style, onClick }: { to: string; children?: ReactNode; className?: string; style?: object; onClick?: () => void }) {
  const nav = useNavigate();
  const layout = /\b(item|tile|card|row|col|btn)\b/.test(className ?? '');
  const s = linkStyles(className, style, !layout);
  return <Pressable onPress={() => { onClick?.(); nav(to); }} style={s.view}>{layout ? children : <Text style={s.text}>{children}</Text>}</Pressable>;
}

Link.displayName = 'Link';

export function NavLink({ to, children, end, className, style }: { to: string; children?: ReactNode; end?: boolean; className?: string | ((s: { isActive: boolean }) => string); style?: object }) {
  const { pathname } = useLocation();
  const active = end ? pathname === to : pathname === to || pathname.startsWith(to + '/');
  const cn = typeof className === 'function' ? className({ isActive: active }) : className;
  return <Link to={to} className={cn} style={style}>{children}</Link>;
}
