/** 全局导航目标：主页面固定显示在底部导航。 */
export type NavigationTarget = 'assistant' | 'diary' | 'today' | 'tasks' | 'habits' | 'memos' | 'trash' | 'settings';

/** 首页路由名；返回键与「再按一次退出」都基于它判断。 */
export const HOME_TARGET: NavigationTarget = 'today';

export type NavigationProps = {
  onNavigate: (target: NavigationTarget) => void;
};

/** 底部主导航菜单项。 */
export const GLOBAL_NAV_ITEMS: Array<{ id: NavigationTarget; label: string; icon: string }> = [
  { id: 'today', label: '首页', icon: '⌂' },
  { id: 'tasks', label: '待办', icon: '✓' },
  { id: 'habits', label: '习惯', icon: '◷' },
  { id: 'diary', label: '日记', icon: '▤' },
  { id: 'assistant', label: '助手', icon: '✦' },
];

/** 右侧页面栏的条目。 */
export type PanelItem = {
  id: string;
  label: string;
  selected?: boolean;
  /** 是否固定到面板底部。 */
  bottom?: boolean;
  onPress: () => void;
};
