import { habitReducer } from './reducers/habitReducer';
import { memoReducer } from './reducers/memoReducer';
import { settingsReducer } from './reducers/settingsReducer';
import { todoReducer } from './reducers/todoReducer';
import type { AppAction, AppState } from './storeTypes';

export function appReducer(state: AppState, action: AppAction): AppState {
  return memoReducer(state, action) ?? todoReducer(state, action) ?? settingsReducer(state, action) ?? habitReducer(state, action) ?? state;
}
