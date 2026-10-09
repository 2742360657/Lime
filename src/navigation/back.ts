import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

type BackHandlerFn = () => boolean;

/**
 * 全局返回键协调器。
 * 处理器按先进后出执行（最后注册的优先），返回 true 表示已消费本次返回。
 * 用于让页面内部的编辑态先于全局导航处理系统返回键。
 */
class BackCoordinator {
  private stack: BackHandlerFn[] = [];

  register = (handler: BackHandlerFn) => {
    this.stack.push(handler);
    return () => {
      const index = this.stack.indexOf(handler);
      if (index >= 0) {
        this.stack.splice(index, 1);
      }
    };
  };

  /** 从栈顶向下询问，第一个消费掉返回的处理器胜出。 */
  handle = () => {
    for (let index = this.stack.length - 1; index >= 0; index -= 1) {
      if (this.stack[index]()) {
        return true;
      }
    }
    return false;
  };
}

export const backCoordinator = new BackCoordinator();

/** 把系统返回键的兜底处理挂到 RN 的 BackHandler 上。 */
export function useSystemBack() {
  const handlerRef = useRef(() => backCoordinator.handle());
  handlerRef.current = () => backCoordinator.handle();
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => handlerRef.current());
    return () => subscription.remove();
  }, []);
}

/**
 * 注册一个返回处理器。只有处于激活状态的页面/编辑态才应注册。
 * handler 返回 true 表示消费本次返回。
 */
export function useBackHandler(handler: BackHandlerFn, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) {
      return;
    }
    return backCoordinator.register(() => ref.current());
  }, [active]);
}
