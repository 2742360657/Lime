import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

type BackHandlerFn = () => boolean;

/**
 * 注册返回键处理器：只有处于激活状态的页面/编辑态才应注册，返回 true 表示消费本次返回。
 *
 * 直接挂到 RN 的 BackHandler 上，而不是自己维护一个栈：
 * RN 的监听器按“后注册先执行”分发，页面内后出现的编辑态（整理页、备忘录编辑）
 * 天然排在 App 级兜底处理之前，不需要额外排序；也不能依赖组件树顺序，
 * 因为 NavigationContainer 是数据加载完成后才挂载的，注册时机比 AppShell 更晚。
 */
export function useBackHandler(handler: BackHandlerFn, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => ref.current());
    return () => subscription.remove();
  }, [active]);
}
