import type { AppData } from '../../types/app';
import type { AppAction } from '../storeTypes';

export interface ActionContext {
  dispatch(action: AppAction): void;
  getData(): AppData;
}
