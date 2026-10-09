import { Easing, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

/**
 * 集中管理动画配时。
 *
 * 依据 Reanimated 官方建议：布局动画构建器放在组件外复用，不要每次渲染重建。
 * 这里只保留三种有明确用途的动画，避免到处加动画导致观感杂乱：
 *
 *   1. 页面切换      —— 整页淡入（FadeIn）
 *   2. 列表增删      —— LinearTransition 让其余条目平滑让位
 *   3. 折叠展开      —— AccordionSection 切换 height 0 ↔ auto，同样由 layout 补间
 */

const EASE_OUT = Easing.out(Easing.cubic);

/** 页面切换：短促淡入，避免生硬跳变。 */
export const SCREEN_ENTERING = FadeIn.duration(180).easing(EASE_OUT);

/** 列表项：新增淡入、删除淡出。 */
export const LIST_ITEM_ENTERING = FadeIn.duration(160).easing(EASE_OUT);
export const LIST_ITEM_EXITING = FadeOut.duration(120);

/** 列表容器：条目增删时平滑让位。 */
export const LIST_LAYOUT = LinearTransition.duration(180).easing(EASE_OUT);
