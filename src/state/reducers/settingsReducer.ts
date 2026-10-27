import type { AppAction, AppState } from '../storeTypes';

export function settingsReducer(state: AppState, action: AppAction): AppState | null {
  switch(action.type) {
    case 'update-preferences':
      return { ...state, appData: { ...state.appData, settings: { ...state.appData.settings, ...action.patch } } };

    case 'set-error':
      return { ...state, error: action.error };
    case 'clear-error':
      return { ...state, error: null };

    case 'set-theme-id':
      return {
        ...state,
        appData: {
          ...state.appData,
          settings: {
            ...state.appData.settings,
            themeId: action.themeId,
          },
        },
      };
    case 'update-profile':
      return {
        ...state,
        appData: {
          ...state.appData,
          settings: {
            ...state.appData.settings,
            profileName: action.name,
            profileSignature: action.signature,
            avatarUri: action.avatarUri,
          },
        },
      };
    default: return null;
  }
}
